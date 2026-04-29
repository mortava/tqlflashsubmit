// End-to-end probe: send a realistic DSCR investment QMPricingRequest,
// fetch product details for the first few products, then dump every
// program name + every adjustment reason so we can SEE whether OB is
// returning prepay-structure variants (5%, 3%, 5/3/3, declining 5-1) as
// separate products and whether the prepay fee structure shows up as an
// LLPA reason on each product.

import fs from 'node:fs'
import path from 'node:path'

const envPath = path.resolve('.env.local')
const envText = fs.readFileSync(envPath, 'utf8')
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const {
  OB_CLIENT_ID, OB_CLIENT_SECRET,
  OB_AAD_TOKEN_URL, OB_AAD_RESOURCE,
  OB_API_BASE_URL, OB_BUSINESS_CHANNEL_ID, OB_ORIGINATOR_ID,
} = process.env

async function getToken() {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: OB_CLIENT_ID,
    client_secret: OB_CLIENT_SECRET,
    resource: OB_AAD_RESOURCE,
  })
  const r = await fetch(OB_AAD_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  return (await r.json()).access_token
}

// Mirror the production request body (DSCR investment, 36mo prepay, 740 FICO)
function buildPricingRequest(prepayPenaltyEnum) {
  return {
    representativeFICO: 740,
    loanLevelDebtToIncomeRatio: 36,
    borrowerInformation: {
      citizenship: 'USCitizen',
      fico: 740,
      hasITIN: false,
      firstName: 'Broker',
      lastName: 'Search',
      vaFirstTimeUse: false,
      firstTimeHomeBuyer: false,
      monthsReserves: 12,
      selfEmployed: true,
      waiveEscrows: false,
      state: 'CA',
      incomeDocumentation: 'Verified',
      assetDocumentation: 'Verified',
      employmentDocumentation: 'Verified',
    },
    propertyInformation: {
      appraisedValue: 800000,
      occupancy: 'InvestmentProperty',
      state: 'CA',
      zipCode: '90210',
      county: 'Los Angeles',
      city: 'Beverly Hills',
      propertyType: 'SingleFamily',
      corporateRelocation: false,
      salesPrice: 800000,
      numberOfStories: 1,
      numberOfUnits: 'OneUnit',
    },
    loanInformation: {
      loanPurpose: 'Purchase',
      lienType: 'First',
      amortizationTypes: ['Fixed'],
      automatedUnderwritingSystem: 'ManualTraditional',
      borrowerPaidMI: 'Yes',
      buydown: 'None',
      cashOutAmount: 0,
      desiredLockPeriod: 30,
      desiredPrice: 0,
      desiredRate: 0,
      feesIn: 'No',
      expandedApprovalLevel: 'NotApplicable',
      interestOnly: false,
      baseLoanAmount: 600000,
      secondLienAmount: 0,
      helocDrawnAmount: 0,
      helocLineAmount: 0,
      loanTerms: ['ThirtyYear'],
      loanType: 'NonConforming',
      prepaymentPenalty: prepayPenaltyEnum,
      exemptFromVAFundingFee: false,
      includeLOCompensationInPricing: 'NoBuyerPaid',
      calculateTotalLoanAmount: true,
      dutyToServe: 'No',
      missionScore: 'Zero',
      assetDepletion: 'No',
      autoDebit: 'No',
      employeeLoan: 'No',
      communityAffordableSecond: 'No',
      reducedMI: false,
      representativeFICO: 740,
      loanLevelDebtToIncomeRatio: 36,
      totalMonthlyQualifyingIncome: 10000,
      customerInternalId: 'OBSearch',
      propertiesFinanced: 1,
      customFields: [
        { customFieldInputName: 'CustomProductFilter01', customFieldValue: '110', columnName: 'CustomLenderField4' },
        { customFieldInputName: 'CustomProductFilter02', customFieldValue: '110', columnName: 'CustomLenderField5' },
        { customFieldInputName: 'CustomProductFilter03', customFieldValue: '110', columnName: 'CustomLenderField7' },
        { customFieldInputName: 'CustomProductFilter04', customFieldValue: '110', columnName: 'CustomLenderField8' },
      ],
      expandedGuidelines: {
        incomeVerificationType: 'InvestorDscr',
        housingEventType: 'None',
        housingEventSeasoning: 'NotApplicable',
        bankruptcyType: 'None',
        bankruptcyOutcome: 'NotApplicable',
        bankruptcySeasoning: 'NotApplicable',
        debtConsolidation: false,
        uniqueProperty: false,
        entityVesting: false,
        firstTimeInvestor: false,
        ruralProperty: false,
        shortTermRental: false,
        vacantUnleased: false,
        debtServiceCoverageRatio: 1.25,
      },
    },
    coBorrowerInformation: {},
  }
}

async function postSearch(token, body) {
  const url = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  let data
  try { data = JSON.parse(text) } catch { data = { _raw: text } }
  return { status: r.status, data }
}

async function getDetail(token, searchId, productId) {
  const url = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch/${searchId}/products/${productId}`
  const r = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
  })
  if (!r.ok) return null
  return r.json()
}

const token = await getToken()
console.log('[probe] token len=', token.length)

// Sweep prepay periods to see if product names vary by structure
for (const penalty of ['ThreeYear', 'FiveYear', 'None']) {
  console.log(`\n========== prepaymentPenalty=${penalty} ==========`)
  const { status, data } = await postSearch(token, buildPricingRequest(penalty))
  if (status !== 200) {
    console.log(`[search] HTTP ${status}`)
    if (data?.errors) console.log('  errors:', JSON.stringify(data.errors).slice(0, 600))
    continue
  }
  const products = data.products || []
  console.log(`[search] searchId=${data.searchId} products=${products.length}`)

  // Dedupe program names so we can see all unique structures returned
  const seen = new Set()
  const programNames = []
  for (const p of products) {
    const name = p.productName || p.product || `Product ${p.productId}`
    if (!seen.has(name)) { seen.add(name); programNames.push({ name, productId: p.productId }) }
  }
  console.log(`[search] unique program names: ${programNames.length}`)
  for (const { name } of programNames.slice(0, 30)) console.log('  ·', name)

  // For PREPAY-related programs, fetch the detail and dump adjustment reasons
  const prepayLike = programNames.filter(p =>
    /prepay|ppp|penalty|5\s*[%\/-]|3\s*[%\/-]|declin|hardprepay/i.test(p.name)
  ).slice(0, 5)
  console.log(`\n[detail] inspecting ${prepayLike.length} prepay-like products for adjustment reasons:`)
  for (const { name, productId } of prepayLike) {
    const detail = await getDetail(token, data.searchId, productId)
    if (!detail) { console.log(`  ✗ ${name}: detail fetch failed`); continue }
    const adjs = (detail.adjustments || []).map(a => `${a.reason} [${a.type}=${a.adjustor}]`)
    console.log(`  · ${name}`)
    for (const r of adjs.slice(0, 12)) console.log(`     - ${r}`)
    if (adjs.length > 12) console.log(`     … +${adjs.length - 12} more`)
    await new Promise(r => setTimeout(r, 200))
  }
}
