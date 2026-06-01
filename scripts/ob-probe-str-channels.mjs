// Which channel makes OB itemize "Short Term Rental" as a NAMED adjustment?
// Tests 4 combos at 80% LTV / 700 FICO (where STR has price impact):
//   A baseline: EG.shortTermRental=false, CPF02=110
//   B customField only: EG.shortTermRental=false, CPF02=109
//   C expandedGuidelines only: EG.shortTermRental=true,  CPF02=110
//   D both (production): EG.shortTermRental=true, CPF02=109
// Dumps full top-level adjustments AND per-quote adjustments for each.
//
// Usage: node scripts/ob-probe-str-channels.mjs

import fs from 'node:fs'; import path from 'node:path'
const envText = fs.readFileSync(path.resolve('.env.local'), 'utf8')
for (const l of envText.split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2] }
const { OB_CLIENT_ID, OB_CLIENT_SECRET, OB_AAD_TOKEN_URL, OB_AAD_RESOURCE, OB_API_BASE_URL, OB_BUSINESS_CHANNEL_ID, OB_ORIGINATOR_ID } = process.env

const tok = await (await fetch(OB_AAD_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: OB_CLIENT_ID, client_secret: OB_CLIENT_SECRET, resource: OB_AAD_RESOURCE }) })).json().then(d => d.access_token)
const base = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch`

function body(egSTR, cpf02) {
  return {
    representativeFICO: 700, loanLevelDebtToIncomeRatio: 36,
    borrowerInformation: { citizenship: 'USCitizen', fico: 700, hasITIN: false, firstName: 'P', lastName: 'S', vaFirstTimeUse: false, firstTimeHomeBuyer: false, monthsReserves: 12, selfEmployed: true, waiveEscrows: false, state: 'CA', incomeDocumentation: 'Verified', assetDocumentation: 'Verified', employmentDocumentation: 'Verified' },
    propertyInformation: { appraisedValue: 800000, occupancy: 'InvestmentProperty', state: 'CA', zipCode: '90210', county: 'Los Angeles', city: 'Beverly Hills', propertyType: 'SingleFamily', corporateRelocation: false, salesPrice: 800000, numberOfStories: 1, numberOfUnits: 'OneUnit' },
    loanInformation: {
      loanPurpose: 'Purchase', lienType: 'First', amortizationTypes: ['Fixed'], automatedUnderwritingSystem: 'ManualTraditional', borrowerPaidMI: 'Yes', buydown: 'None', cashOutAmount: 0, desiredLockPeriod: 30, desiredPrice: 0, desiredRate: 0, feesIn: 'No', expandedApprovalLevel: 'NotApplicable', interestOnly: false, baseLoanAmount: 640000, secondLienAmount: 0, helocDrawnAmount: 0, helocLineAmount: 0, loanTerms: ['ThirtyYear'], loanType: 'NonConforming', prepaymentPenalty: 'None', exemptFromVAFundingFee: false, includeLOCompensationInPricing: 'NoBuyerPaid', calculateTotalLoanAmount: true, dutyToServe: 'No', missionScore: 'Zero', assetDepletion: 'No', autoDebit: 'No', employeeLoan: 'No', communityAffordableSecond: 'No',
      expandedGuidelines: { incomeVerificationType: 'InvestorDscr', housingEventType: 'None', housingEventSeasoning: 'NotApplicable', bankruptcyType: 'None', bankruptcyOutcome: 'NotApplicable', bankruptcySeasoning: 'NotApplicable', mortgageLatesx30_12Mos: 0, mortgageLatesx30_13to24Mos: 0, mortgageLatesx60_12Mos: 0, mortgageLatesx60_13to24Mos: 0, mortgageLatesx90_12Mos: 0, mortgageLatesx90_13to24Mos: 0, mortgageLatesx120_12Mos: 0, mortgageLatesx120_13to24Mos: 0, debtConsolidation: false, uniqueProperty: false, entityVesting: false, firstTimeInvestor: false, ruralProperty: false, shortTermRental: egSTR, vacantUnleased: false, debtServiceCoverageRatio: 1.25 },
      includeEligibilityExceptions: true, reducedMI: false, representativeFICO: 700, loanLevelDebtToIncomeRatio: 36, totalMonthlyQualifyingIncome: 10000, customerInternalId: 'STRchan', productFilters: ['Standard', 'ExpandedGuidelines'], productFilter: ['Standard', 'ExpandedGuidelines'],
      customFields: [
        { customFieldInputName: 'CustomProductFilter01', customFieldValue: 110, columnName: 'CustomLenderField4' },
        { customFieldInputName: 'CustomProductFilter02', customFieldValue: cpf02, columnName: 'CustomLenderField5' },
        { customFieldInputName: 'CustomProductFilter03', customFieldValue: 110, columnName: 'CustomLenderField7' },
        { customFieldInputName: 'CustomProductFilter04', customFieldValue: 110, columnName: 'CustomLenderField8' },
        { customFieldInputName: 'CustomProductFilter05', customFieldValue: 110, columnName: 'CustomLenderField10' },
      ],
    },
    coBorrowerInformation: {},
  }
}

async function run(label, egSTR, cpf02) {
  const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify(body(egSTR, cpf02)) })
  if (r.status !== 200) { console.log(`\n### ${label}: HTTP ${r.status} ${(await r.text()).slice(0,300)}`); return }
  const d = await r.json()
  const p = d.products?.[0]
  if (!p) { console.log(`\n### ${label}: no products`); return }
  const dd = await (await fetch(`${base}/${d.searchId}/products/${p.productId}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${tok}` } })).json()
  console.log(`\n### ${label}  | product=${p.productName} price=${p.price} totalPriceAdj=${dd.totalPriceAdjustment}`)
  const adjs = dd.adjustments || []
  console.log(`   top-level adjustments (${adjs.length}):`)
  for (const a of adjs) console.log(`     - [${a.type}] ${a.reason} = ${a.adjustor}`)
  // any quote-level adjustments?
  const q = (dd.quotes || [])[0]
  if (q && Array.isArray(q.adjustments) && q.adjustments.length) {
    console.log(`   quote[0] adjustments (${q.adjustments.length}):`)
    for (const a of q.adjustments) console.log(`     - [${a.type}] ${a.reason} = ${a.adjustor}`)
  }
  // hunt for any STR mention anywhere in the full payload
  const hay = JSON.stringify(dd)
  const strHits = (hay.match(/short.?term|rental/gi) || []).length
  console.log(`   "short term / rental" mentions anywhere in detail JSON: ${strHits}`)
}

await run('A baseline (EG=false, CPF02=110)', false, 110)
await run('B customField only (EG=false, CPF02=109)', false, 109)
await run('C expandedGuidelines only (EG=true, CPF02=110)', true, 110)
await run('D both = production (EG=true, CPF02=109)', true, 109)
