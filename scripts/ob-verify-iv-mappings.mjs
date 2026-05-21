import fs from 'node:fs'
const envText = fs.readFileSync('.env.local', 'utf8')
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const params = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.OB_CLIENT_ID, client_secret: process.env.OB_CLIENT_SECRET, resource: process.env.OB_AAD_RESOURCE })
const tr = await fetch(process.env.OB_AAD_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params })
const token = (await tr.json()).access_token

// Test asset depletion scenario with the new AssetRelated mapping
const scenarios = [
  { name: 'Asset Depletion → AssetRelated', iv: 'AssetRelated', docType: 'assetDepletion' },
  { name: 'Bank Statement 24mo → WrittenVOE', iv: 'WrittenVOE', docType: 'bankStatement24' },
  { name: 'Full Doc → FullDoc', iv: 'FullDoc', docType: 'fullDoc' },
  { name: 'DSCR → InvestorDscr', iv: 'InvestorDscr', docType: 'dscr' },
]

for (const s of scenarios) {
  const eg = {
    incomeVerificationType: s.iv,
    housingEventType: 'None', housingEventSeasoning: 'NotApplicable',
    bankruptcyType: 'None', bankruptcyOutcome: 'NotApplicable', bankruptcySeasoning: 'NotApplicable',
    mortgageLatesx30_12Mos: 0, mortgageLatesx30_13to24Mos: 0,
    mortgageLatesx60_12Mos: 0, mortgageLatesx60_13to24Mos: 0,
    mortgageLatesx90_12Mos: 0, mortgageLatesx90_13to24Mos: 0,
    mortgageLatesx120_12Mos: 0, mortgageLatesx120_13to24Mos: 0,
    debtConsolidation: false, uniqueProperty: false, entityVesting: false,
    firstTimeInvestor: false, ruralProperty: false, shortTermRental: false, vacantUnleased: false,
  }
  if (s.docType === 'dscr') eg.debtServiceCoverageRatio = 1.25

  const body = {
    representativeFICO: 740, loanLevelDebtToIncomeRatio: 36,
    borrowerInformation: {
      citizenship: 'USCitizen', fico: 740, firstName: 'V', lastName: 'V',
      vaFirstTimeUse: false, firstTimeHomeBuyer: false, monthsReserves: 12,
      selfEmployed: true, waiveEscrows: false, state: 'CA',
      incomeDocumentation: 'Verified', assetDocumentation: 'Verified', employmentDocumentation: 'Verified',
    },
    propertyInformation: {
      appraisedValue: 800000, occupancy: s.docType === 'dscr' ? 'InvestmentProperty' : 'PrimaryResidence',
      state: 'CA', zipCode: '90210', county: 'Los Angeles', city: 'Beverly Hills',
      propertyType: 'SingleFamily', corporateRelocation: false,
      salesPrice: 800000, numberOfStories: 1, numberOfUnits: 'OneUnit',
    },
    loanInformation: {
      loanPurpose: 'Purchase', lienType: 'First', amortizationTypes: ['Fixed'],
      automatedUnderwritingSystem: 'NotSpecified', borrowerPaidMI: 'Yes',
      buydown: 'None', cashOutAmount: 0, desiredLockPeriod: 30, desiredPrice: 0, desiredRate: 0,
      feesIn: 'No', expandedApprovalLevel: 'NotApplicable', interestOnly: false,
      baseLoanAmount: 500000, secondLienAmount: 0, helocDrawnAmount: 0, helocLineAmount: 0,
      loanTerms: ['ThirtyYear'], loanType: 'NonConforming', prepaymentPenalty: 'None',
      exemptFromVAFundingFee: false, includeLOCompensationInPricing: 'NoBuyerPaid',
      calculateTotalLoanAmount: true, dutyToServe: 'No', missionScore: 'Zero',
      assetDepletion: (s.docType === 'assetDepletion' || s.docType === 'assetUtilization') ? 'Yes' : 'No',
      autoDebit: 'No', employeeLoan: 'No', communityAffordableSecond: 'No',
      expandedGuidelines: eg,
      ...(s.docType === 'fullDoc' ? { standard: eg } : {}),
      includeEligibilityExceptions: true,
      reducedMI: false, representativeFICO: 740, loanLevelDebtToIncomeRatio: 36,
      totalMonthlyQualifyingIncome: 10000, customerInternalId: 'Verify',
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
  const url = `${process.env.OB_API_BASE_URL}/full/api/businesschannels/${process.env.OB_BUSINESS_CHANNEL_ID}/originators/${process.env.OB_ORIGINATOR_ID}/productsearch`
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) })
  const text = await r.text()
  let b; try { b = JSON.parse(text) } catch { b = { _raw: text.slice(0, 200) } }
  const products = b.products?.length ?? '?'
  const ineligible = b.notEligibleProducts?.length ?? '?'
  console.log(`${s.name.padEnd(40)} status=${r.status} products=${products} notEligible=${ineligible}`)
  if (r.status !== 200) console.log('  err:', JSON.stringify(b.errors || b._raw).slice(0, 300))
  await new Promise(r => setTimeout(r, 300))
}
