import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

// ================= Optimal Blue API Config =================
const OB_CLIENT_ID = process.env.OB_CLIENT_ID || ''
const OB_CLIENT_SECRET = process.env.OB_CLIENT_SECRET || ''
const OB_AAD_TOKEN_URL = process.env.OB_AAD_TOKEN_URL || 'https://login.microsoftonline.com/marketplaceauth.optimalblue.com/oauth2/token'
const OB_AAD_RESOURCE = process.env.OB_AAD_RESOURCE || 'https://marketplaceauth.optimalblue.com/d35ae893-2367-40b5-a9b4-bfab3acb7991'
const OB_API_BASE_URL = process.env.OB_API_BASE_URL || 'https://marketplace.optimalblue.com'
const OB_BUSINESS_CHANNEL_ID = process.env.OB_BUSINESS_CHANNEL_ID || ''
const OB_ORIGINATOR_ID = process.env.OB_ORIGINATOR_ID || ''

// ================= Azure AD v1 OAuth Token Cache =================
let cachedOBToken: { token: string; expiresAt: number } | null = null

async function getOBToken(): Promise<string> {
  if (cachedOBToken && cachedOBToken.expiresAt > Date.now()) {
    console.log('[OB] Using cached token')
    return cachedOBToken.token
  }

  if (!OB_CLIENT_ID || !OB_CLIENT_SECRET) {
    throw new Error('OB_CLIENT_ID and OB_CLIENT_SECRET are required')
  }

  console.log('[OB] Requesting token from:', OB_AAD_TOKEN_URL)

  // Azure AD v1 client_credentials flow with resource parameter
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: OB_CLIENT_ID,
    client_secret: OB_CLIENT_SECRET,
    resource: OB_AAD_RESOURCE,
  })

  const response = await fetch(OB_AAD_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    const errText = await response.text()
    console.error('[OB] Token error:', response.status, errText.substring(0, 500))
    throw new Error(`OB token request failed (HTTP ${response.status}): ${errText.substring(0, 200)}`)
  }

  const data = await response.json()
  if (!data.access_token) {
    throw new Error('OB token response missing access_token')
  }

  console.log('[OB] Token acquired, expires_in:', data.expires_in)
  cachedOBToken = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in || 3600) - 300) * 1000,
  }
  return cachedOBToken.token
}

// ================= Build OB v4 QMPricingRequest =================
// Maps our unified form body → Optimal Blue Full Product Search v4
// Spec: https://digitalmarketplace.optimalblue.com/api-details#api=fullsearch-v4

function buildOBRequest(f: any): any {
  const loanAmount = Number(f.loanAmount) || 400000
  const propertyValue = Number(f.propertyValue) || 500000
  const creditScore = Math.max(580, Math.min(999, Number(f.creditScore) || 740))
  const dti = Number(f.dti) || 36
  const isDSCR = f.documentationType === 'dscr'
  const isInvestment = f.occupancyType === 'investment'
  const isPurchase = f.loanPurpose === 'purchase'

  // ---- borrowerInformation (BorrowerCriteria) ----
  const citizenMap: Record<string, string> = {
    usCitizen: 'USCitizen',
    permanentResident: 'PermanentResidentAlien',
    nonPermanentResident: 'NonPermanentResidentAlien',
    foreignNational: 'ForeignNational',
    itin: 'ITIN',
  }
  // OB documentation enums — ONLY "Verified" and "None" are valid
  // DSCR must use "Verified" (not "None") to return products
  const incomeDocMap: Record<string, string> = {
    fullDoc: 'Verified', dscr: 'Verified',
    bankStatement: 'Verified', bankStatement12: 'Verified',
    bankStatement24: 'Verified', bankStatementOther: 'Verified',
    assetDepletion: 'Verified', assetUtilization: 'Verified',
    voe: 'Verified', noRatio: 'None', taxReturns1Yr: 'Verified',
  }
  const assetDocMap: Record<string, string> = {
    fullDoc: 'Verified', dscr: 'Verified',
    bankStatement: 'Verified', assetDepletion: 'Verified',
    assetUtilization: 'Verified', voe: 'Verified',
    noRatio: 'None',
  }
  const employDocMap: Record<string, string> = {
    fullDoc: 'Verified', dscr: 'Verified',
    bankStatement: 'Verified', voe: 'Verified',
    noRatio: 'None',
  }

  const borrowerInformation: any = {
    citizenship: citizenMap[f.citizenship] || 'USCitizen',
    fico: creditScore,
    hasITIN: f.citizenship === 'itin' || f.hasITIN || false,
    firstName: 'Broker',
    lastName: 'Search',
    vaFirstTimeUse: false,
    firstTimeHomeBuyer: f.isFTHB || false,
    monthsReserves: 12,
    selfEmployed: f.isSelfEmployed !== undefined ? f.isSelfEmployed : true,
    waiveEscrows: f.impoundType === 'noescrow',
    state: f.propertyState || 'CA',
    incomeDocumentation: incomeDocMap[f.documentationType] || 'Verified',
    assetDocumentation: assetDocMap[f.documentationType] || 'Verified',
    employmentDocumentation: employDocMap[f.documentationType] || 'Verified',
  }

  // ---- propertyInformation (PropertySearchCriteria) ----
  const occMap: Record<string, string> = {
    primary: 'PrimaryResidence',
    secondary: 'SecondHome',
    investment: 'InvestmentProperty',
  }
  const propTypeMap: Record<string, string> = {
    sfr: 'SingleFamily',
    condo: 'Condo',
    townhouse: 'Townhome',
    '2unit': 'TwoToFourUnit',
    '3unit': 'TwoToFourUnit',
    '4unit': 'TwoToFourUnit',
    '5-9unit': 'FiveToEightUnit',
  }
  const unitMap: Record<string, string> = {
    sfr: 'OneUnit',
    condo: 'OneUnit',
    townhouse: 'OneUnit',
    '2unit': 'TwoUnits',
    '3unit': 'ThreeUnits',
    '4unit': 'FourUnits',
    '5-9unit': 'FiveToEightUnits',
  }

  const propertyInformation: any = {
    appraisedValue: propertyValue,
    occupancy: isDSCR ? 'InvestmentProperty' : (occMap[f.occupancyType] || 'PrimaryResidence'),
    state: f.propertyState || 'CA',
    zipCode: f.propertyZip || '',
    county: f.propertyCounty || '',
    city: f.propertyCity || '',
    propertyType: propTypeMap[f.propertyType] || 'SingleFamily',
    corporateRelocation: false,
    salesPrice: isPurchase ? propertyValue : 0,
    numberOfStories: 1,
    numberOfUnits: unitMap[f.propertyType] || 'OneUnit',
  }

  // ---- loanInformation (LoanPricingCriteria) ----
  const purposeMap: Record<string, string> = {
    purchase: 'Purchase',
    refinance: 'RefiRateTermLimitedCO',
    cashout: 'RefiCashout',
  }

  const amort = f.amortization || 'fixed'
  const isARM = amort.startsWith('arm')
  const lockDays = parseInt(f.lockPeriod) || 30

  // Loan term mapping
  const termMap: Record<string, string> = {
    '30': 'ThirtyYear', '25': 'TwentyFiveYear', '20': 'TwentyYear',
    '15': 'FifteenYear', '10': 'TenYear', '40': 'FortyYear',
  }
  const loanTerm = f.loanTerm || '30'

  // Prepayment penalty — only for investment
  const ppMap: Record<string, string> = {
    '60mo': 'FiveYear', '48mo': 'FourYear', '36mo': 'ThreeYear',
    '24mo': 'TwoYear', '12mo': 'OneYear', 'none': 'None',
  }

  // Loan type mapping
  const loanTypeMap: Record<string, string> = {
    nonqm: 'NonConforming',
    conventional: 'Conforming',
    conforming: 'Conforming',
    fha: 'FHA',
    va: 'VA',
    usda: 'USDA',
    heloc: 'HELOC',
    heloan: 'HELOAN',
  }

  // expandedGuidelines (inside loanInformation)
  // incomeVerificationType: "FullDoc" is the only valid value — always send it
  const expandedGuidelines: any = {
    incomeVerificationType: 'FullDoc',
    housingEventType: 'None',
    housingEventSeasoning: 'NotApplicable',
    bankruptcyType: 'None',
    bankruptcyOutcome: 'NotApplicable',
    bankruptcySeasoning: 'NotApplicable',
    mortgageLatesx30_12Mos: 0,
    mortgageLatesx30_13to24Mos: 0,
    mortgageLatesx60_12Mos: 0,
    mortgageLatesx60_13to24Mos: 0,
    mortgageLatesx90_12Mos: 0,
    mortgageLatesx90_13to24Mos: 0,
    mortgageLatesx120_12Mos: 0,
    mortgageLatesx120_13to24Mos: 0,
    debtConsolidation: false,
    uniqueProperty: false,
    entityVesting: f.isVestedInLLCOrCorp || false,
    firstTimeInvestor: false,
    ruralProperty: f.isRuralProperty || false,
    shortTermRental: f.isShortTermRental || false,
    vacantUnleased: false,
  }

  // DSCR ratio goes into expandedGuidelines
  // NOTE: debtServiceCoverageRatio omitted — OB channel 165481 has no DSCR-specific products.
  // Sending it filters out all results. DSCR scenarios still return investment products via occupancy.

  // Product types - omit to return all eligible products from OB

  const loanInformation: any = {
    loanPurpose: purposeMap[f.loanPurpose] || 'Purchase',
    lienType: f.lienPosition === '2nd' ? 'Second' : 'First',
    amortizationTypes: isARM ? ['ARM'] : ['Fixed'],
    automatedUnderwritingSystem: 'NotSpecified', // Valid: NotSpecified, DU, LP — no "Manual" enum exists
    borrowerPaidMI: 'Yes',
    buydown: 'None',
    cashOutAmount: f.loanPurpose === 'cashout' ? (Number(f.cashoutAmount) || 0) : 0,
    desiredLockPeriod: lockDays,
    desiredPrice: 0,
    desiredRate: 0,
    feesIn: 'No',
    expandedApprovalLevel: 'NotApplicable',
    interestOnly: f.paymentType === 'io',
    baseLoanAmount: loanAmount,
    secondLienAmount: 0,
    helocDrawnAmount: 0,
    helocLineAmount: 0,
    loanTerms: [termMap[loanTerm] || 'ThirtyYear'],
    loanType: loanTypeMap[f.loanType] || 'NonConforming',
    prepaymentPenalty: isInvestment ? (ppMap[f.prepayPeriod] || 'None') : 'None',
    exemptFromVAFundingFee: false,
    includeLOCompensationInPricing: 'YesLenderPaid',
    calculateTotalLoanAmount: true,
    assetDepletion: (f.documentationType === 'assetDepletion' || f.documentationType === 'assetUtilization') ? 'Yes' : 'No',
    autoDebit: 'No',
    employeeLoan: 'No',
    communityAffordableSecond: 'No',
    expandedGuidelines,
    reducedMI: false,
    representativeFICO: creditScore,
    loanLevelDebtToIncomeRatio: dti,
    totalMonthlyQualifyingIncome: isDSCR
      ? (Number(f.grossRent) || 10000)
      : Math.round((loanAmount * 0.006) / (dti / 100)),
    customerInternalId: 'TQLOpenPrice',
  }

  if (isARM) {
    const armTermMap: Record<string, string> = {
      'arm51': 'FiveYear', 'arm71': 'SevenYear', 'arm101': 'TenYear',
    }
    loanInformation.armFixedTerms = [armTermMap[amort] || 'FiveYear']
  }

  if (f.paymentType === 'io') {
    loanInformation.interestOnlyTerm = 120
  }

  if (isInvestment) {
    loanInformation.propertiesFinanced = 1
  }

  // ---- Assemble QMPricingRequest ----
  // representativeFICO & loanLevelDebtToIncomeRatio required at root level
  return {
    representativeFICO: creditScore,
    loanLevelDebtToIncomeRatio: dti,
    borrowerInformation,
    propertyInformation,
    loanInformation,
    coBorrowerInformation: {},
  }
}

// ================= Fetch OB v4 Product Detail =================
// Product search returns only one price per product. The per-product detail
// endpoint returns the full rate/price ladder (quotes[]) AND the itemized
// LLPAs (adjustments[] with { reason, adjustor, type }).
async function fetchProductDetail(
  accessToken: string,
  searchId: string,
  productId: number | string,
): Promise<any> {
  const url = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch/${searchId}/products/${productId}`
  const r = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!r.ok) {
    console.warn(`[OB] product detail ${productId} → HTTP ${r.status}`)
    return null
  }
  return r.json()
}

function normalizeDetailAdjustments(detail: any): any[] {
  const raw: any[] = Array.isArray(detail?.adjustments) ? detail.adjustments : []
  return raw
    .filter(a => a && typeof a === 'object')
    .map(a => {
      const amt = typeof a.adjustor === 'number' ? a.adjustor : parseFloat(a.adjustor) || 0
      const type = String(a.type || '')
      return {
        description: String(a.reason || a.description || 'Adjustment'),
        amount: /price/i.test(type) ? amt : 0,
        rateAdj: /rate/i.test(type) ? amt : 0,
        type,
      }
    })
    // Max Price / Min Price rows are caps/floors, not actual LLPAs — hide from the breakdown.
    .filter(a => !/max price|min price/i.test(a.type) && (a.amount !== 0 || a.rateAdj !== 0))
}

// ================= Parse OB v4 QMPricingResponse =================
// `details` is a map of productId → detail response (quotes[] + adjustments[])
// returned from /productsearch/{searchId}/products/{productId}.
function parseOBResponse(data: any, details: Record<string, any> = {}): any {
  const products = data.products || []

  if (Array.isArray(products) && products.length > 0) {
    console.log('[OB] total products returned:', products.length)
    console.log('[OB] details fetched for', Object.keys(details).length, 'products')
    const sampleId = products[0].productId
    const sampleDetail = details[String(sampleId)]
    if (sampleDetail) {
      console.log('[OB] sample detail adjustments count:', (sampleDetail.adjustments || []).length)
      console.log('[OB] sample detail quotes count:', (sampleDetail.quotes || []).length)
    }
  }

  if (!Array.isArray(products) || products.length === 0) {
    // Check for messages/errors
    const msgs = data.messages || []
    const errorMsg = msgs.length > 0
      ? msgs.map((m: any) => m.message || m.code).join('; ')
      : 'No products returned from Optimal Blue'
    return {
      rateOptions: [],
      programs: [],
      totalPrograms: 0,
      error: errorMsg,
    }
  }

  // Group products by program name. For each product we now pull the rate ladder
  // (quotes[]) and LLPAs (adjustments[]) from the /products/{productId} detail
  // endpoint — the initial product-search response only contains a single summary
  // price per product and no adjustment breakdown.
  const programsMap: Record<string, any> = {}

  for (const p of products) {
    const programName = p.productName || p.productCode || 'OB Program'
    const investor = p.investor || ''
    const status = p.priceStatus || 'Available'
    const monthlyMI = p.monthlyMI || 0
    const lockPeriod = p.lockPeriod || 0
    const loanTerm = p.loanTerm || ''
    const amortType = p.amortizationType || ''
    const loanType = p.loanType || ''
    const productType = p.productType || ''

    const detail = details[String(p.productId)] || null
    const detailAdjustments = detail ? normalizeDetailAdjustments(detail) : []
    const quotes: any[] = Array.isArray(detail?.quotes) ? detail.quotes : []

    // Build rate options from detail.quotes (full rate/price ladder) if available.
    // Fall back to the single product-search price if detail is missing.
    const rateRungs = quotes.length > 0
      ? quotes.map(q => ({
          rate: Number(q.rate) || 0,
          price: Number(q.price) || 0,
          apr: Number(q.apr) || 0,
          payment: Number(q.principalAndInterest) || Number(q.totalPayment) || 0,
          monthlyMI: Number(q.monthlyMi) || 0,
          closingCost: Number(q.closingCost) || 0,
          rebate: Number(q.rebateDollar) || 0,
          discount: Number(q.discountDollar) || 0,
          lockPeriod: Number(q.lockPeriod) || lockPeriod,
        }))
      : [{
          rate: Number(p.rate) || 0,
          price: Number(p.price) || 0,
          apr: Number(p.apr) || 0,
          payment: Number(p.principalAndInterest) || Number(p.totalPayment) || 0,
          monthlyMI,
          closingCost: Number(p.closingCost) || 0,
          rebate: Number(p.rebate) || 0,
          discount: Number(p.discount) || 0,
          lockPeriod,
        }]

    // Seed the program bucket the first time we see it
    if (!programsMap[programName]) {
      const seed = rateRungs[0]
      programsMap[programName] = {
        name: programName,
        programName,
        status,
        investor,
        investorName: investor,
        investorId: p.investorId || 0,
        productId: p.productId || 0,
        productCode: p.productCode || '',
        productType,
        loanType,
        loanTerm,
        amortType,
        lockPeriod,
        highBalance: p.highBalance || 'No',
        qmStatus: p.qmStatus || '',
        rate: seed.rate,
        price: seed.price,
        apr: seed.apr,
        payment: seed.payment,
        monthlyMI: seed.monthlyMI,
        closingCost: seed.closingCost,
        rebate: seed.rebate,
        discount: seed.discount,
        totalPayment: p.totalPayment || 0,
        adjustments: detailAdjustments,
        totalRateAdjustment: Number(detail?.totalRateAdjustment) || 0,
        totalPriceAdjustment: Number(detail?.totalPriceAdjustment) || 0,
        notesAndAdvisories: Array.isArray(detail?.notesAndAdvisories) ? detail.notesAndAdvisories : [],
        rateOptions: [],
      }
    }

    const bucket = programsMap[programName]
    for (const rung of rateRungs) {
      const pointsOffset = 100 - rung.price
      // Update program-level summary to the rung closest to par.
      if (Math.abs(rung.price - 100) < Math.abs((bucket.price || 0) - 100)) {
        bucket.rate = rung.rate
        bucket.price = rung.price
        bucket.apr = rung.apr
        bucket.payment = rung.payment
        bucket.monthlyMI = rung.monthlyMI
        bucket.closingCost = rung.closingCost
        bucket.rebate = rung.rebate
        bucket.discount = rung.discount
      }
      bucket.rateOptions.push({
        rate: rung.rate,
        points: pointsOffset,
        price: rung.price,
        apr: rung.apr,
        payment: rung.payment,
        description: `${rung.rate.toFixed(3)}% / ${rung.price.toFixed(3)}`,
        status,
        totalClosingCost: rung.closingCost,
        monthlyMI: rung.monthlyMI,
        rebate: rung.rebate,
        discount: rung.discount,
        programName,
        investorName: investor,
        lockPeriod: rung.lockPeriod,
        adjustments: detailAdjustments,
      })
    }
  }

  const programs: any[] = Object.values(programsMap)

  // Sort: Available first, then by rate ascending
  programs.sort((a, b) => {
    const aAvail = a.status === 'Available' ? 0 : 1
    const bAvail = b.status === 'Available' ? 0 : 1
    if (aAvail !== bAvail) return aAvail - bAvail
    return a.rate - b.rate
  })

  // Sort each program's rateOptions by rate ascending for stable ladder display
  for (const prog of programs) {
    prog.rateOptions.sort((a: any, b: any) => a.rate - b.rate || a.price - b.price)
  }

  // Flatten for simplified rate table view (all rate options across programs)
  const allRateOptions = programs.flatMap(p => p.rateOptions)

  return {
    rateOptions: allRateOptions,
    programs,
    totalPrograms: programs.length,
    totalRateOptions: allRateOptions.length,
    ltv: data.ltv || 0,
    cltv: data.cltv || 0,
    searchId: data.searchId || '',
    searchTime: data.searchTime || '',
  }
}

// ================= Handler =================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })

  if (!OB_CLIENT_ID || !OB_CLIENT_SECRET) {
    return res.json({
      success: false,
      error: 'Optimal Blue not configured. Set OB_CLIENT_ID, OB_CLIENT_SECRET env vars.',
    })
  }

  if (!OB_BUSINESS_CHANNEL_ID || !OB_ORIGINATOR_ID) {
    return res.json({
      success: false,
      error: 'Optimal Blue channel not configured. Set OB_BUSINESS_CHANNEL_ID, OB_ORIGINATOR_ID env vars.',
    })
  }

  try {
    const formData = req.body
    const obRequest = buildOBRequest(formData)

    console.log('[OB] Request body:', JSON.stringify(obRequest, null, 2))

    // Azure AD v1 OAuth bearer token
    const accessToken = await getOBToken()

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    }

    // Full Product Search v4 endpoint (base + /full/api/...)
    const apiUrl = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch`
    console.log('[OB] API URL:', apiUrl)

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(obRequest),
      signal: AbortSignal.timeout(25000),
    })

    const responseText = await response.text()
    let responseData: any

    try {
      responseData = JSON.parse(responseText)
    } catch {
      console.error('[OB] Non-JSON response:', responseText.substring(0, 500))
      return res.json({
        success: false,
        error: `Optimal Blue returned non-JSON response (HTTP ${response.status})`,
        debug: { statusCode: response.status, preview: responseText.substring(0, 300) },
      })
    }

    if (!response.ok) {
      const errorMsg = responseData.detail || responseData.message || responseData.title || `HTTP ${response.status}`
      console.error('[OB] API error:', response.status, JSON.stringify(responseData).substring(0, 500))
      return res.json({
        success: false,
        error: `Optimal Blue: ${errorMsg}`,
        debug: {
          statusCode: response.status,
          response: responseData,
          authMethod: 'azure-ad-bearer',
          apiUrl,
        },
      })
    }

    // 204 No Content = no results
    if (response.status === 204) {
      return res.json({
        success: false,
        error: 'No eligible products found in Optimal Blue for this scenario.',
      })
    }

    // ── Fetch per-product detail (quotes ladder + LLPA adjustments) in parallel ──
    // OB's product search returns only a single summary price per product and
    // omits LLPAs. The detail endpoint is required to get the full rate ladder
    // and itemized adjustments.
    const searchId = responseData.searchId
    const productIds: Array<number | string> = Array.isArray(responseData.products)
      ? responseData.products.map((p: any) => p.productId).filter(Boolean)
      : []

    const details: Record<string, any> = {}
    if (searchId && productIds.length > 0) {
      const detailResults = await Promise.all(
        productIds.map(pid =>
          fetchProductDetail(accessToken, searchId, pid).catch(err => {
            console.warn(`[OB] detail fetch failed for ${pid}:`, err instanceof Error ? err.message : err)
            return null
          })
        )
      )
      productIds.forEach((pid, i) => {
        if (detailResults[i]) details[String(pid)] = detailResults[i]
      })
      console.log('[OB] product detail fetched:', Object.keys(details).length, '/', productIds.length)
    }

    const result = parseOBResponse(responseData, details)

    if (result.error && result.programs.length === 0) {
      return res.json({
        success: false,
        error: result.error,
        debug: { requestSent: obRequest },
      })
    }

    return res.json({
      success: true,
      data: {
        ...result,
        source: 'optimalblue',
      },
    })
  } catch (error) {
    console.error('[OB] Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get OB pricing',
    })
  }
}
