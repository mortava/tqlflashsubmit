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
  // incomeVerificationType — OB v4 channel 165481 accepts only these enums
  // (all others return HTTP 400 "Error converting value"):
  //   FullDoc              → Full Document programs (Ascend Alt-A, Elevate)
  //   WrittenVOE           → Alt-Doc programs (Ascend Alt-A Alt-Doc) — used as
  //                          the catch-all for bank statement, DSCR, asset
  //                          utilization, 1-yr tax returns, VOE, etc.
  //   Stated               → Stated income (returns 0 products on this channel)
  //   NoIncomeVerification → No-ratio / no-income (returns 0 products on this channel)
  // OB v4 channel 165481 accepts: FullDoc | WrittenVOE | Stated |
  // NoIncomeVerification | InvestorDscr. The hyphenated "Investor-DSCR"
  // form returns HTTP 400 "Error converting value".
  const incomeVerificationMap: Record<string, string> = {
    fullDoc: 'FullDoc',
    dscr: 'InvestorDscr',
    bankStatement: 'WrittenVOE',
    bankStatement12: 'WrittenVOE',
    bankStatement24: 'WrittenVOE',
    bankStatementOther: 'WrittenVOE',
    taxReturns1Yr: 'WrittenVOE',
    voe: 'WrittenVOE',
    assetDepletion: 'WrittenVOE',
    assetUtilization: 'WrittenVOE',
    noRatio: 'NoIncomeVerification',
    stated: 'Stated',
  }
  const incomeVerificationType = incomeVerificationMap[f.documentationType] || 'FullDoc'

  const expandedGuidelines: any = {
    incomeVerificationType,
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

  // DSCR ratio — required in expandedGuidelines when incomeVerificationType is
  // InvestorDscr so OB returns DSCR products. Parse ratio from form input.
  if (isDSCR) {
    const parsedDSCR =
      parseFloat(f.dscrManualInput) ||
      parseFloat(String(f.dscrRatio).split('-')[0]) ||
      1.0
    expandedGuidelines.debtServiceCoverageRatio = parsedDSCR
  }

  // LO compensation: TQL brokers are borrower-paid, so comp is NOT baked into
  // pricing. Use NoBuyerPaid unless the form explicitly indicates lender-paid.
  const loCompensation = f.loanOriginatorPaidBy === 'lender' ? 'YesLenderPaid' : 'NoBuyerPaid'

  const loanInformation: any = {
    loanPurpose: purposeMap[f.loanPurpose] || 'Purchase',
    lienType: f.lienPosition === '2nd' ? 'Second' : 'First',
    amortizationTypes: isARM ? ['ARM'] : ['Fixed'],
    automatedUnderwritingSystem: 'ManualTraditional', // TQL Non-QM channel runs Manual/Traditional underwriting
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
    includeLOCompensationInPricing: loCompensation,
    calculateTotalLoanAmount: true,
    dutyToServe: 'No',
    missionScore: 'Zero',
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
    customerInternalId: 'OBSearch',
    // TQL NonQM channel custom product filters — OB returns zero products when
    // these aren't populated. All four fixed to 110 per the channel spec.
    customFields: [
      { customFieldInputName: 'CustomProductFilter01', customFieldValue: '110', columnName: 'CustomLenderField4' },
      { customFieldInputName: 'CustomProductFilter02', customFieldValue: '110', columnName: 'CustomLenderField5' },
      { customFieldInputName: 'CustomProductFilter03', customFieldValue: '110', columnName: 'CustomLenderField7' },
      { customFieldInputName: 'CustomProductFilter04', customFieldValue: '110', columnName: 'CustomLenderField8' },
    ],
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

// ================= STRICT INVESTOR-NAME MASKING (NON-NEGOTIABLE) =================
// Every broker- / borrower- / email- / PDF- facing surface MUST display the
// program as TQL-branded. The original investor identity is NEVER exposed
// downstream. Admin-level passcode UI may reveal the raw `rawName` field for
// internal audit, but the masked `name` is the canonical display string.
//
// Output format: "TQL - <doc-type> <term>yr <amort>[ <ppp>]"
//   "Ascend Alt-A 30yr Fixed"               → "TQL - Alt-A 30yr Fixed"
//   "TOTAL DSCR 30yr Fixed"                 → "TQL - DSCR 30yr Fixed"
//   "DSCR 5% Fixed PPP 30 Yr Fixed - EG"    → "TQL - DSCR 30yr Fixed 5%PPP"
//   "Elevate / 30 Yr Fixed"                 → "TQL - 30yr Fixed"
function maskProgramName(name: string | undefined): string {
  if (!name) return 'TQL - Program'
  let s = String(name)

  // ── 1. Strip leading investor brand tokens (case-insensitive). Add new
  // investor brand names to this list as TQL onboards more lenders.
  const brands: RegExp[] = [
    /^Ascend\b/i,
    /^Elevate\s*\/?\s*/i,
    /^Peek\b/i,
    /^TOTAL\b/i,
    /^TPO[\s-]?VRS\b/i,
    /^VRS\b/i,
    /^Deephaven\b/i,
    /^Verus\b/i,
    /^Rocket\s*TPO\b/i,
    /^Rocket\b/i,
    /^AD\s*Mortgage\b/i,
    /^LoanStream\b/i,
    /^Planet\s*Mortgage\b/i,
    /^Planet\b/i,
    /^Champion(s)?\s*Funding\b/i,
    /^Champion(s)?\b/i,
    /^Lima\s*One\b/i,
    /^Lima\b/i,
    /^Acra\b/i,
    /^Velocity\b/i,
    /^Visio\b/i,
    /^Newrez\b/i,
    /^Citadel\b/i,
    /^Angel\s*Oak\b/i,
    /^A&D\b/i,
    /^FOA\b/i,
    /^Finance\s*of\s*America\b/i,
    /^Quontic\b/i,
    /^Sprout\b/i,
    /^Carrington\b/i,
    /^TQL\b/i,                      // strip any pre-existing TQL prefix
  ]
  for (const re of brands) s = s.replace(re, '').trim()

  // ── 2. Clean up leftovers: leading slash/dash, trailing tier suffixes.
  s = s.replace(/^[/\-·•\s]+/, '').trim()
  s = s.replace(/\s*[-·•]\s*(EG|Tier\s*\d+|Standard|Plus|Premier|Select|Premium|Core|Prime)\s*$/gi, '').trim()
  s = s.replace(/\s*\(\s*EG\s*\)\s*$/i, '').trim()

  // ── 3. Extract a PPP qualifier and re-emit it at the end as "X%PPP".
  let ppp = ''
  const pppPctMatch = s.match(/(\d+)\s*%\s*(?:Fixed\s*|Step(?:down)?\s*)?PPP/i)
  const pppYrMatch = !pppPctMatch ? s.match(/(\d+)\s*(?:Year|Yr|YR)\s*PPP/i) : null
  if (pppPctMatch) {
    ppp = `${pppPctMatch[1]}%PPP`
    s = s.replace(pppPctMatch[0], '').trim()
  } else if (pppYrMatch) {
    ppp = `${pppYrMatch[1]}yrPPP`
    s = s.replace(pppYrMatch[0], '').trim()
  } else if (/\bno[\s-]?ppp\b/i.test(s)) {
    ppp = 'NoPPP'
    s = s.replace(/\bno[\s-]?ppp\b/i, '').trim()
  }

  // ── 4. Normalize term/amort/IO tokens to a tight, broker-readable form.
  s = s.replace(/(\d+)\s*Y(?:ea)?r\b/gi, '$1yr')             // "30 Year" → "30yr"
  s = s.replace(/\bInterest\s*Only\b/gi, 'I/O')              // "Interest Only" → "I/O"
  s = s.replace(/\bIO\b/g, 'I/O')                             // "IO" → "I/O"

  // ── 5. Drop separators left over from removals, collapse whitespace.
  s = s.replace(/\s*\/\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
  // Trim trailing dangling separators / commas
  s = s.replace(/[\s,/\-·•]+$/g, '').trim()

  if (!s) s = 'Program'
  return ppp ? `TQL - ${s} ${ppp}` : `TQL - ${s}`
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

// Clean up OB's verbose adjustment reason strings so they read cleanly in the UI.
// OB prefixes many rows with "Max of LTV/CLTV/HCLTV is " which the broker asked
// us to strip. Also normalises " And " connectors to commas for readability.
function cleanAdjustmentReason(reason: string): string {
  return String(reason || 'Adjustment')
    .replace(/\bMax of LTV\/CLTV\/HCLTV is\s+/gi, '')
    .replace(/,\s*And\s+/gi, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function normalizeDetailAdjustments(detail: any): any[] {
  const raw: any[] = Array.isArray(detail?.adjustments) ? detail.adjustments : []
  return raw
    .filter(a => a && typeof a === 'object')
    .map(a => {
      const amt = typeof a.adjustor === 'number' ? a.adjustor : parseFloat(a.adjustor) || 0
      const type = String(a.type || '')
      return {
        description: cleanAdjustmentReason(a.reason || a.description || 'Adjustment'),
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
function parseOBResponse(data: any, details: Record<string, any> = {}, desiredLockDays = 30): any {
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

  // Group products by RAW productName + investor + productId so each underlying
  // investor product remains a distinct bucket. The masked TQL display name is
  // computed for broker view, but the admin "Reveal Master Investor Results"
  // toggle needs every investor's distinct entry — collapsing them by masked
  // name (e.g. all "TQL - DSCR 30yr Fixed" merging) would lose investor data.
  const programsMap: Record<string, any> = {}

  for (const p of products) {
    const rawProgramName = p.productName || p.productCode || 'OB Program'
    // Mask the investor brand so brokers see every program as TQL-branded.
    const programName = maskProgramName(rawProgramName)
    const investor = 'TQL'
    // Bucket key keeps each investor product separate — admin reveal needs them.
    const bucketKey = `${rawProgramName}::${String(p.investor || '')}::${p.productId || ''}`
    const status = p.priceStatus || 'Available'
    const monthlyMI = p.monthlyMI || 0
    const lockPeriod = p.lockPeriod || 0
    const loanTerm = p.loanTerm || ''
    const amortType = p.amortizationType || ''
    const loanType = p.loanType || ''
    const productType = p.productType || ''

    const detail = details[String(p.productId)] || null
    const detailAdjustments = detail ? normalizeDetailAdjustments(detail) : []
    const allQuotes: any[] = Array.isArray(detail?.quotes) ? detail.quotes : []

    // OB returns the same rate at multiple lock periods (30/45/60) each with a
    // different price. The user picks a single desired lock in the form — keep
    // only the quotes that match that lock so each rate surfaces exactly once.
    // If no quotes match the desired lock exactly, fall back to the nearest
    // available lock period so the program still shows a ladder.
    let quotes: any[] = allQuotes.filter(q => Number(q.lockPeriod) === desiredLockDays)
    if (quotes.length === 0 && allQuotes.length > 0) {
      const availableLocks = [...new Set(allQuotes.map(q => Number(q.lockPeriod)))]
      const nearestLock = availableLocks.reduce((best, lk) =>
        Math.abs(lk - desiredLockDays) < Math.abs(best - desiredLockDays) ? lk : best, availableLocks[0])
      quotes = allQuotes.filter(q => Number(q.lockPeriod) === nearestLock)
    }

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

    // Seed the program bucket the first time we see this raw investor product
    if (!programsMap[bucketKey]) {
      const seed = rateRungs[0]
      programsMap[bucketKey] = {
        name: programName,                                      // masked, broker-facing
        programName,                                            // masked alias
        rawName: rawProgramName,                                // ADMIN-ONLY — never render directly
        rawInvestor: String(p.investor || ''),                  // ADMIN-ONLY
        status,
        investor,                                               // forced "TQL"
        investorName: investor,                                 // forced "TQL"
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

    const bucket = programsMap[bucketKey]
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
        // Program/PPP column — masked program name only.
        description: programName,
        status,
        totalClosingCost: rung.closingCost,
        monthlyMI: rung.monthlyMI,
        rebate: rung.rebate,
        discount: rung.discount,
        programName,                                              // masked
        rawProgramName,                                           // ADMIN-ONLY
        investorName: investor,                                   // forced "TQL"
        rawInvestorName: String(p.investor || ''),                // ADMIN-ONLY
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

  // Dedupe each program's rateOptions by rate — keep the rung closest to par
  // when the same rate appears more than once (shouldn't happen after lock-period
  // filtering, but is defensive).
  for (const prog of programs) {
    const byRate: Record<string, any> = {}
    for (const opt of prog.rateOptions) {
      const key = Number(opt.rate).toFixed(3)
      const existing = byRate[key]
      if (!existing || Math.abs(opt.price - 100) < Math.abs(existing.price - 100)) {
        byRate[key] = opt
      }
    }
    prog.rateOptions = Object.values(byRate)
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

    const desiredLockDays = Number(obRequest?.loanInformation?.desiredLockPeriod) || 30
    const result = parseOBResponse(responseData, details, desiredLockDays)

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
