// Probe OB v4 for the Prepay Penalty STRUCTURE field name + valid enum values.
// Strategy: send a baseline investment+DSCR request that's otherwise valid,
// then try each candidate field name → value combination. OB returns
// "Error converting value …" only when the field name is recognized but the
// VALUE is out of range — that confirms the field exists. Fields that are
// silently ignored mean OB doesn't model that name.

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
  const d = await r.json()
  return d.access_token
}

function buildBody(extraLoanFields = {}, extraExpanded = {}) {
  return {
    requestType: 'QMPricingRequest',
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
      prepaymentPenalty: 'ThreeYear',
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
        ...extraExpanded,
      },
      ...extraLoanFields,
    },
    representativeUserId: 'probe',
  }
}

async function tryRequest(token, body, label) {
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
  return { status: r.status, data, label }
}

const token = await getToken()
console.log('[probe] token len=', token.length)

// First: baseline (no prepay structure field). Confirm it works.
const baseline = await tryRequest(token, buildBody(), 'baseline')
console.log('\n[baseline] status:', baseline.status,
  baseline.data?.products ? `products=${baseline.data.products.length}` : (baseline.data?.title || 'no products'))
if (baseline.data?.errors) console.log('[baseline errors]', JSON.stringify(baseline.data.errors).slice(0, 600))

// Candidate field names to test. OB returns "Error converting value" if the
// field NAME is recognized but VALUE is invalid. If silently ignored, we'll
// see no specific error → field name not modeled.
const FIELD_CANDIDATES = [
  'prepaymentPenaltyStructure',
  'prepaymentPenaltyType',
  'prepaymentPenaltyStyle',
  'prepayPenaltyStructure',
  'prepayStructure',
  'prepayType',
  'prepaymentStructure',
  'prepaymentSchedule',
  'prepaymentScheduleType',
  'prepaymentTier',
]

console.log('\n[probe] testing field name candidates with bogus value "INVALID_STRUCTURE_VALUE"…')
for (const fieldName of FIELD_CANDIDATES) {
  const r = await tryRequest(token, buildBody({ [fieldName]: 'INVALID_STRUCTURE_VALUE' }), fieldName)
  const errs = r.data?.errors || {}
  const matchKey = Object.keys(errs).find(k => k.toLowerCase().includes(fieldName.toLowerCase()))
  if (matchKey) {
    const msgs = errs[matchKey]
    console.log(`  ✓ ${fieldName.padEnd(34)} RECOGNIZED — ${matchKey}: ${Array.isArray(msgs) ? msgs[0] : msgs}`.slice(0, 200))
  } else {
    console.log(`  · ${fieldName.padEnd(34)} ignored (status=${r.status})`)
  }
  await new Promise(r => setTimeout(r, 200))
}

// Also try as a nested expandedGuidelines field
console.log('\n[probe] same candidates inside expandedGuidelines…')
for (const fieldName of FIELD_CANDIDATES) {
  const r = await tryRequest(token, buildBody({}, { [fieldName]: 'INVALID_STRUCTURE_VALUE' }), `eg.${fieldName}`)
  const errs = r.data?.errors || {}
  const matchKey = Object.keys(errs).find(k => k.toLowerCase().includes(fieldName.toLowerCase()))
  if (matchKey) {
    const msgs = errs[matchKey]
    console.log(`  ✓ expandedGuidelines.${fieldName.padEnd(20)} RECOGNIZED — ${matchKey}: ${Array.isArray(msgs) ? msgs[0] : msgs}`.slice(0, 200))
  } else {
    console.log(`  · expandedGuidelines.${fieldName.padEnd(20)} ignored (status=${r.status})`)
  }
  await new Promise(r => setTimeout(r, 200))
}
