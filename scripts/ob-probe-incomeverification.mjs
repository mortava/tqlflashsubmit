// Probe OB v4 incomeVerificationType enum on TQL NonQM channel.
// Builds a minimal valid QMPricingRequest and rotates
// expandedGuidelines.incomeVerificationType through candidate values,
// reporting which OB accepts (200) vs rejects ("not a valid value" / 400).
//
// Usage: node scripts/ob-probe-incomeverification.mjs
// Requires: .env.local with OB_* vars.

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

// Minimal QMPricingRequest mirroring buildOBRequest() from api/get-ob-pricing.ts.
// We only rotate expandedGuidelines.incomeVerificationType; everything else is
// held constant on a 24-mo Bank Statement-style scenario (self-employed,
// investment, NonConforming, $500k @ 740 FICO).
function buildBody(incomeVerificationType) {
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
      incomeDocumentation: 'Verified',
      assetDocumentation: 'Verified',
      employmentDocumentation: 'Verified',
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
      reducedMI: false,
      representativeFICO: 740,
      loanLevelDebtToIncomeRatio: 36,
      totalMonthlyQualifyingIncome: 10000,
      customerInternalId: 'IVProbe',
      customFields: [
        { customFieldInputName: 'CustomProductFilter01', customFieldValue: '110', columnName: 'CustomLenderField4' },
        { customFieldInputName: 'CustomProductFilter02', customFieldValue: '110', columnName: 'CustomLenderField5' },
        { customFieldInputName: 'CustomProductFilter03', customFieldValue: '110', columnName: 'CustomLenderField7' },
        { customFieldInputName: 'CustomProductFilter04', customFieldValue: '110', columnName: 'CustomLenderField8' },
      ],
      expandedGuidelines: {
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
      },
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

const CANDIDATES = [
  // The 5 the dev thought were the only accepted values
  'FullDoc',
  'WrittenVOE',
  'Stated',
  'NoIncomeVerification',
  'InvestorDscr',
  // Hyphen/space variants
  'Investor-DSCR',
  'No-Doc',
  'NoDoc',
  // Bank statement variants
  'BankStatement',
  'BankStatements',
  'BankStatement12Mo',
  'BankStatement24Mo',
  'TwelveMonthBankStatement',
  'TwentyFourMonthBankStatement',
  // Asset variants
  'AssetDepletion',
  'AssetQualifier',
  'AssetUtilization',
  'AssetDissipation',
  // Tax return variants
  'TaxReturns1Year',
  'OneYearTaxReturn',
  'OneYearTaxReturns',
  'TaxReturn1Year',
  // 1099 / P&L
  'TenNinetyNineOnly',
  '1099Only',
  'TenNinetyNine',
  'ProfitAndLoss',
  'PnL',
  'CPAProfitAndLoss',
  // VOE / employment
  'VOE',
  'VerificationOfEmployment',
  'WrittenVerificationOfEmployment',
  // Reduced / limited / lite doc
  'ReducedDoc',
  'LimitedDoc',
  'LiteDoc',
  'AlternateDoc',
  'AltDoc',
  // Misc
  'NoRatio',
  'NoIncome',
  'NoIncomeNoAsset',
  'NINA',
]

const token = await getToken()
console.log('[probe] token acquired, len=', token.length)
console.log('[probe] sweeping', CANDIDATES.length, 'incomeVerificationType candidates…\n')

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
      console.log(`✗ ${v.padEnd(34)} REJECTED: ${String(reason).slice(0, 120)}`)
    } else {
      const productCount = Array.isArray(body?.products) ? body.products.length : null
      const summary = productCount != null ? `products=${productCount}` : (body?.title || `status=${status}`)
      accepted.push({ v, status, summary })
      console.log(`✓ ${v.padEnd(34)} ACCEPTED — ${summary} (HTTP ${status})`)
    }
  } catch (e) {
    console.log(`! ${v.padEnd(34)} ERROR: ${e.message?.slice(0, 120)}`)
  }
  await new Promise(r => setTimeout(r, 300))
}

console.log('\n— ACCEPTED —')
for (const a of accepted) console.log(' ', a.v.padEnd(34), '·', a.summary)
console.log('\n— REJECTED —')
console.log(' ', rejected.join(', '))
