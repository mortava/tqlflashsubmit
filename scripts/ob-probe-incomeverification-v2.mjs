// Re-probe OB v4 incomeVerificationType with the RICHER request shape from
// the user's reference current_get-ob-pricing.ts — adds the sibling `standard`
// block, productFilters, includeEligibilityExceptions, etc. The hypothesis is
// that BankStatement12 / BankStatement24 / BankStatement enum values were
// rejected on the leaner request body but may be accepted when the request
// has the full product-bucket plumbing in place.

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
  if (!r.ok) throw new Error(`Token failed: ${r.status} ${await r.text()}`)
  const d = await r.json()
  return d.access_token
}

function buildBody(incomeVerificationType) {
  const expandedGuidelines = {
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
    entityVesting: false,
    firstTimeInvestor: false,
    ruralProperty: false,
    shortTermRental: false,
    vacantUnleased: false,
  }
  return {
    representativeFICO: 740,
    loanLevelDebtToIncomeRatio: 36,
    borrowerInformation: {
      citizenship: 'USCitizen',
      fico: 740,
      hasITIN: false,
      firstName: 'Probe', lastName: 'Search',
      vaFirstTimeUse: false,
      firstTimeHomeBuyer: false,
      monthsReserves: 12,
      selfEmployed: true,
      waiveEscrows: false,
      state: 'CA',
    },
    propertyInformation: {
      appraisedValue: 800000,
      occupancy: 'InvestmentProperty',
      state: 'CA', zipCode: '90210',
      county: 'Los Angeles', city: 'Beverly Hills',
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
      automatedUnderwritingSystem: 'NotSpecified',
      borrowerPaidMI: 'Yes',
      buydown: 'None',
      cashOutAmount: 0,
      desiredLockPeriod: 30,
      desiredPrice: 0,
      desiredRate: 0,
      feesIn: 'No',
      expandedApprovalLevel: 'NotApplicable',
      interestOnly: false,
      baseLoanAmount: 500000,
      secondLienAmount: 0,
      helocDrawnAmount: 0,
      helocLineAmount: 0,
      loanTerms: ['ThirtyYear'],
      loanType: 'NonConforming',
      prepaymentPenalty: 'None',
      exemptFromVAFundingFee: false,
      includeLOCompensationInPricing: 'NoBuyerPaid',
      calculateTotalLoanAmount: true,
      dutyToServe: 'No',
      missionScore: 'Zero',
      assetDepletion: 'No',
      autoDebit: 'No',
      employeeLoan: 'No',
      communityAffordableSecond: 'No',
      expandedGuidelines,
      includeEligibilityExceptions: true,
      reducedMI: false,
      representativeFICO: 740,
      loanLevelDebtToIncomeRatio: 36,
      totalMonthlyQualifyingIncome: 10000,
      customerInternalId: 'IVProbeV2',
      productFilters: ['Standard', 'ExpandedGuidelines'],
      productFilter: ['Standard', 'ExpandedGuidelines'],
      customFields: [
        { customFieldInputName: 'CustomProductFilter01', customFieldValue: '110', columnName: 'CustomLenderField4' },
        { customFieldInputName: 'CustomProductFilter02', customFieldValue: '110', columnName: 'CustomLenderField5' },
        { customFieldInputName: 'CustomProductFilter03', customFieldValue: '110', columnName: 'CustomLenderField7' },
        { customFieldInputName: 'CustomProductFilter04', customFieldValue: '110', columnName: 'CustomLenderField8' },
      ],
    },
    coBorrowerInformation: {},
  }
}

async function probe(token, value) {
  const url = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(buildBody(value)),
  })
  const text = await r.text()
  let body
  try { body = JSON.parse(text) } catch { body = { _raw: text.slice(0, 400) } }
  return { status: r.status, body }
}

// Specifically test BankStatement variants from the reference file's comment
// claiming channel 165481 accepts them, plus the verified-baseline 5.
const CANDIDATES = [
  // Verified baseline
  'FullDoc',
  'WrittenVOE',
  'Stated',
  'NoIncomeVerification',
  'InvestorDscr',
  // Reference-file claimed accepted on channel 165481
  'BankStatement',
  'BankStatement12',
  'BankStatement24',
  'BankStatements',
  'BankStatements12',
  'BankStatements24',
  // Other plausible enum names
  'AssetDepletion',
  'AssetRelated',
  'TaxReturns1Yr',
  'TaxReturn1Yr',
  'PnL',
  'ProfitAndLoss',
  '1099',
  'TenNinetyNine',
]

const token = await getToken()
console.log('[probe-v2] token ok, channel:', OB_BUSINESS_CHANNEL_ID)
console.log('[probe-v2] sweeping', CANDIDATES.length, 'values with RICHER request shape\n')

const accepted = []
const rejected = []

for (const v of CANDIDATES) {
  try {
    const { status, body } = await probe(token, v)
    const errs = body?.errors || {}
    const ivError =
      errs['loanInformation.expandedGuidelines.incomeVerificationType'] ||
      errs['request.loanInformation.expandedGuidelines.incomeVerificationType'] ||
      errs['expandedGuidelines.incomeVerificationType'] ||
      errs['incomeVerificationType']
    const reason = ivError ? (Array.isArray(ivError) ? ivError[0] : ivError) : null

    if (reason && /not a valid value|Error converting/i.test(String(reason))) {
      rejected.push(v)
      console.log(`✗ ${v.padEnd(28)} REJECTED: ${String(reason).slice(0, 100)}`)
    } else {
      const products = Array.isArray(body?.products) ? body.products.length : null
      const notEligible = Array.isArray(body?.notEligibleProducts) ? body.notEligibleProducts.length : null
      const summary = `products=${products ?? '?'} notEligible=${notEligible ?? '?'}`
      accepted.push({ v, status, summary })
      console.log(`✓ ${v.padEnd(28)} ACCEPTED — ${summary} (HTTP ${status})`)
    }
  } catch (e) {
    console.log(`! ${v.padEnd(28)} ERROR: ${e.message?.slice(0, 100)}`)
  }
  await new Promise(r => setTimeout(r, 300))
}

console.log('\n— ACCEPTED —')
for (const a of accepted) console.log(' ', a.v.padEnd(28), '·', a.summary)
console.log('\n— REJECTED —')
console.log(' ', rejected.join(', '))
