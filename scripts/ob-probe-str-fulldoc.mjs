// Diagnostic probe: why does Full Doc + Investment + Short Term Rental return
// "No eligible products found"? Replicates the user's exact payload and runs
// variants to isolate the cause. Captures notEligibleProducts reasons.
//
//   A: FullDoc + STR=Yes            (user's failing scenario, STR in BOTH blocks)
//   B: FullDoc + STR=No             (baseline — does Full Doc work at all?)
//   C: FullDoc + STR=Yes, but STR stripped from the `standard` (agency) block
//   D: FullDoc + STR=Yes, no `standard` block at all (Expanded-only)
//   E: DSCR    + STR=Yes            (the "correct" STR home — control)
//
// Usage: node scripts/ob-probe-str-fulldoc.mjs

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
    client_id: OB_CLIENT_ID, client_secret: OB_CLIENT_SECRET,
    resource: OB_AAD_RESOURCE,
  })
  const r = await fetch(OB_AAD_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!r.ok) throw new Error(`Token failed: ${r.status} ${await r.text()}`)
  return (await r.json()).access_token
}

// Guideline block matching production for a FullDoc investment loan.
function guidelines(strOn, incomeType = 'FullDoc') {
  return {
    incomeVerificationType: incomeType,
    housingEventType: 'None', housingEventSeasoning: 'NotApplicable',
    bankruptcyType: 'None', bankruptcyOutcome: 'NotApplicable', bankruptcySeasoning: 'NotApplicable',
    mortgageLatesx30_12Mos: 0, mortgageLatesx30_13to24Mos: 0,
    mortgageLatesx60_12Mos: 0, mortgageLatesx60_13to24Mos: 0,
    mortgageLatesx90_12Mos: 0, mortgageLatesx90_13to24Mos: 0,
    mortgageLatesx120_12Mos: 0, mortgageLatesx120_13to24Mos: 0,
    debtConsolidation: false, uniqueProperty: false, entityVesting: false,
    firstTimeInvestor: false, ruralProperty: false,
    shortTermRental: strOn, vacantUnleased: false,
    ...(incomeType === 'InvestorDscr' ? { debtServiceCoverageRatio: 1.25 } : {}),
  }
}

function buildBody({ strOn, incomeType = 'FullDoc', includeStandard = true, strInStandard = true }) {
  const eg = guidelines(strOn, incomeType)
  const loanInformation = {
    loanPurpose: 'Purchase', lienType: 'First', amortizationTypes: ['Fixed'],
    automatedUnderwritingSystem: 'ManualTraditional', borrowerPaidMI: 'Yes',
    buydown: 'None', cashOutAmount: 0, desiredLockPeriod: 30,
    desiredPrice: 0, desiredRate: 0, feesIn: 'No',
    expandedApprovalLevel: 'NotApplicable', interestOnly: false,
    baseLoanAmount: 600000, secondLienAmount: 0, helocDrawnAmount: 0, helocLineAmount: 0,
    loanTerms: ['ThirtyYear'], loanType: 'NonConforming', prepaymentPenalty: 'ThreeYear',
    exemptFromVAFundingFee: false, includeLOCompensationInPricing: 'NoBuyerPaid',
    calculateTotalLoanAmount: true, dutyToServe: 'No', missionScore: 'Zero',
    assetDepletion: 'No', autoDebit: 'No', employeeLoan: 'No', communityAffordableSecond: 'No',
    expandedGuidelines: eg,
    includeEligibilityExceptions: true, reducedMI: false,
    representativeFICO: 740, loanLevelDebtToIncomeRatio: 36,
    totalMonthlyQualifyingIncome: 10000, customerInternalId: 'STRFullDocProbe',
    productFilters: ['Standard', 'ExpandedGuidelines'],
    productFilter: ['Standard', 'ExpandedGuidelines'],
    propertiesFinanced: 1,
    customFields: [
      { customFieldInputName: 'CustomProductFilter01', customFieldValue: 110, columnName: 'CustomLenderField4' },
      { customFieldInputName: 'CustomProductFilter02', customFieldValue: strOn ? 109 : 110, columnName: 'CustomLenderField5' },
      { customFieldInputName: 'CustomProductFilter03', customFieldValue: 110, columnName: 'CustomLenderField7' },
      { customFieldInputName: 'CustomProductFilter04', customFieldValue: 110, columnName: 'CustomLenderField8' },
      { customFieldInputName: 'CustomProductFilter05', customFieldValue: 110, columnName: 'CustomLenderField10' },
    ],
  }
  if (includeStandard) {
    loanInformation.standard = strInStandard ? { ...eg } : { ...eg, shortTermRental: false }
  }
  return {
    representativeFICO: 740, loanLevelDebtToIncomeRatio: 36,
    borrowerInformation: {
      citizenship: 'USCitizen', fico: 740, hasITIN: false,
      firstName: 'Probe', lastName: 'STR', selfEmployed: true, state: 'CA',
      incomeDocumentation: 'Verified', assetDocumentation: 'Verified', employmentDocumentation: 'Verified',
    },
    propertyInformation: {
      appraisedValue: 800000, occupancy: 'InvestmentProperty',
      state: 'CA', zipCode: '90210', county: 'Los Angeles', city: 'Beverly Hills',
      propertyType: 'SingleFamily', corporateRelocation: false,
      salesPrice: 800000, numberOfStories: 1, numberOfUnits: 'OneUnit',
    },
    loanInformation,
    coBorrowerInformation: {},
  }
}

async function run(token, label, opts) {
  const url = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(buildBody(opts)),
  })
  const text = await r.text()
  let data = null
  try { data = JSON.parse(text) } catch {}
  const products = Array.isArray(data?.products) ? data.products : []
  const ineligible = Array.isArray(data?.notEligibleProducts) ? data.notEligibleProducts : []
  console.log(`\n=== ${label} ===`)
  console.log(`  HTTP ${r.status} | eligible=${products.length} | ineligible=${ineligible.length}`)
  if (r.status >= 400) { console.log('  ERROR:', text.slice(0, 500)); return }
  for (const p of products.slice(0, 8)) {
    console.log(`  ELIGIBLE: ${p.productName || p.name} | rate=${p.rate ?? p.noteRate ?? '?'} price=${p.price ?? '?'}`)
  }
  for (const p of ineligible.slice(0, 12)) {
    const reasons = p.ineligibleReasons || p.reasons || p.notEligibleReasons || p.messages || p.eligibilityMessages || []
    const reasonText = Array.isArray(reasons)
      ? reasons.map(x => (typeof x === 'string' ? x : (x.reason || x.message || x.description || JSON.stringify(x)))).join(' | ')
      : JSON.stringify(reasons)
    console.log(`  INELIGIBLE: ${p.productName || p.name} -> ${reasonText.slice(0, 300)}`)
  }
}

const token = await getToken()
await run(token, 'A: FullDoc + STR=Yes (USER SCENARIO, STR in both blocks)', { strOn: true, incomeType: 'FullDoc', includeStandard: true, strInStandard: true })
await run(token, 'B: FullDoc + STR=No (baseline)',                            { strOn: false, incomeType: 'FullDoc', includeStandard: true, strInStandard: true })
await run(token, 'C: FullDoc + STR=Yes, STR stripped from standard block',    { strOn: true, incomeType: 'FullDoc', includeStandard: true, strInStandard: false })
await run(token, 'D: FullDoc + STR=Yes, NO standard block (Expanded-only)',   { strOn: true, incomeType: 'FullDoc', includeStandard: false })
await run(token, 'E: DSCR + STR=Yes (control — STR home turf)',               { strOn: true, incomeType: 'InvestorDscr', includeStandard: false })
