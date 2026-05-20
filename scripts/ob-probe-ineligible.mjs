// Probe OB v4 /ineligible endpoint with a real broker-style scenario that
// returns zero eligible products. Captures the full response so we can
// confirm the actual shape OB sends back and ensure our parser surfaces
// every available disqualification reason to the broker.
//
// Usage: node scripts/ob-probe-ineligible.mjs

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

// Aggressive scenario meant to push past the eligible band so OB returns
// few/no products and many ineligible ones: high LTV, low FICO, investment,
// non-warrantable / mixed-use overlays, 1-yr tax returns income.
function buildRequest() {
  return {
    representativeFICO: 620,
    loanLevelDebtToIncomeRatio: 49,
    borrowerInformation: {
      citizenship: 'USCitizen',
      fico: 620,
      hasITIN: false,
      firstName: 'Probe', lastName: 'Ineligible',
      vaFirstTimeUse: false,
      firstTimeHomeBuyer: false,
      monthsReserves: 2,
      selfEmployed: true,
      waiveEscrows: false,
      state: 'CA',
      incomeDocumentation: 'Verified',
      assetDocumentation: 'Verified',
      employmentDocumentation: 'Verified',
    },
    propertyInformation: {
      appraisedValue: 500000,
      occupancy: 'InvestmentProperty',
      state: 'CA', zipCode: '90210',
      county: 'Los Angeles', city: 'Beverly Hills',
      propertyType: 'SingleFamily',
      corporateRelocation: false,
      salesPrice: 500000,
      numberOfStories: 1,
      numberOfUnits: 'OneUnit',
    },
    loanInformation: {
      loanPurpose: 'RefiCashout',
      lienType: 'First',
      amortizationTypes: ['Fixed'],
      automatedUnderwritingSystem: 'ManualTraditional',
      borrowerPaidMI: 'Yes',
      buydown: 'None',
      cashOutAmount: 100000,
      desiredLockPeriod: 30,
      desiredPrice: 0,
      desiredRate: 0,
      feesIn: 'No',
      expandedApprovalLevel: 'NotApplicable',
      interestOnly: false,
      baseLoanAmount: 475000,
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
      representativeFICO: 620,
      loanLevelDebtToIncomeRatio: 49,
      totalMonthlyQualifyingIncome: 6000,
      customerInternalId: 'IneligibleProbe',
      customFields: [
        { customFieldInputName: 'CustomProductFilter01', customFieldValue: '110', columnName: 'CustomLenderField4' },
        { customFieldInputName: 'CustomProductFilter02', customFieldValue: '110', columnName: 'CustomLenderField5' },
        { customFieldInputName: 'CustomProductFilter03', customFieldValue: '110', columnName: 'CustomLenderField7' },
        { customFieldInputName: 'CustomProductFilter04', customFieldValue: '110', columnName: 'CustomLenderField8' },
      ],
      expandedGuidelines: {
        incomeVerificationType: 'WrittenVOE',
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
        uniqueProperty: true,
        entityVesting: false,
        firstTimeInvestor: false,
        ruralProperty: false,
        shortTermRental: true,
        vacantUnleased: false,
      },
    },
    coBorrowerInformation: {},
  }
}

const token = await getToken()
console.log('[probe] token ok')

const searchUrl = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch`
const searchRes = await fetch(searchUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify(buildRequest()),
})

console.log('[probe] productsearch HTTP', searchRes.status)
const searchText = await searchRes.text()
const search = JSON.parse(searchText)

console.log('[probe] searchId:', search.searchId)
console.log('[probe] eligible products:', search.products?.length ?? 0)
console.log('[probe] inline notEligibleProducts:', search.notEligibleProducts?.length ?? 0)

// Dump first inline ineligible record to see its native shape
if (Array.isArray(search.notEligibleProducts) && search.notEligibleProducts.length > 0) {
  console.log('\n[probe] inline sample (first record):')
  console.log(JSON.stringify(search.notEligibleProducts[0], null, 2).slice(0, 1500))
}

// Now hit the dedicated /ineligible endpoint
if (search.searchId) {
  const ineligibleUrl = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch/${search.searchId}/ineligible`
  console.log('\n[probe] GET', ineligibleUrl)
  const iRes = await fetch(ineligibleUrl, {
    method: 'GET',
    headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
  })
  console.log('[probe] /ineligible HTTP', iRes.status)
  const iText = await iRes.text()
  let iBody
  try { iBody = JSON.parse(iText) } catch { iBody = { _raw: iText.slice(0, 600) } }

  if (Array.isArray(iBody)) {
    console.log('[probe] /ineligible returned ARRAY len=', iBody.length)
    if (iBody.length > 0) {
      console.log('\n[probe] /ineligible sample (first record):')
      console.log(JSON.stringify(iBody[0], null, 2).slice(0, 2000))
      console.log('\n[probe] keys on first record:', Object.keys(iBody[0]))
    }
  } else if (iBody && typeof iBody === 'object') {
    console.log('[probe] /ineligible returned OBJECT keys=', Object.keys(iBody))
    console.log(JSON.stringify(iBody, null, 2).slice(0, 2000))
  } else {
    console.log('[probe] /ineligible body:', String(iText).slice(0, 600))
  }

  // Write full response to disk so we can inspect every field
  fs.writeFileSync(
    path.resolve('scripts/ob-ineligible-sample.json'),
    JSON.stringify({ search: { searchId: search.searchId, eligibleCount: search.products?.length ?? 0 }, ineligible: iBody }, null, 2),
  )
  console.log('\n[probe] full response written to scripts/ob-ineligible-sample.json')
}
