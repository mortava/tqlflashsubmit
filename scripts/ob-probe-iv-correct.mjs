import fs from 'node:fs'
import path from 'node:path'

const envText = fs.readFileSync('.env.local', 'utf8')
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const params = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: process.env.OB_CLIENT_ID,
  client_secret: process.env.OB_CLIENT_SECRET,
  resource: process.env.OB_AAD_RESOURCE,
})
const tr = await fetch(process.env.OB_AAD_TOKEN_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: params,
})
const token = (await tr.json()).access_token

function buildBody(iv) {
  return {
    representativeFICO: 740,
    loanLevelDebtToIncomeRatio: 36,
    borrowerInformation: {
      citizenship: 'USCitizen', fico: 740, firstName: 'P', lastName: 'P',
      vaFirstTimeUse: false, firstTimeHomeBuyer: false, monthsReserves: 12,
      selfEmployed: true, waiveEscrows: false, state: 'CA',
      incomeDocumentation: 'Verified',
      assetDocumentation: 'Verified',
      employmentDocumentation: 'Verified',
    },
    propertyInformation: {
      appraisedValue: 800000, occupancy: 'InvestmentProperty', state: 'CA',
      zipCode: '90210', county: 'Los Angeles', city: 'BH',
      propertyType: 'SingleFamily', corporateRelocation: false,
      salesPrice: 800000, numberOfStories: 1, numberOfUnits: 'OneUnit',
    },
    loanInformation: {
      loanPurpose: 'Purchase', lienType: 'First', amortizationTypes: ['Fixed'],
      automatedUnderwritingSystem: 'NotSpecified', borrowerPaidMI: 'Yes',
      buydown: 'None', cashOutAmount: 0, desiredLockPeriod: 30,
      desiredPrice: 0, desiredRate: 0, feesIn: 'No',
      expandedApprovalLevel: 'NotApplicable', interestOnly: false,
      baseLoanAmount: 500000, secondLienAmount: 0, helocDrawnAmount: 0,
      helocLineAmount: 0, loanTerms: ['ThirtyYear'], loanType: 'NonConforming',
      prepaymentPenalty: 'None', exemptFromVAFundingFee: false,
      includeLOCompensationInPricing: 'NoBuyerPaid', calculateTotalLoanAmount: true,
      dutyToServe: 'No', missionScore: 'Zero', assetDepletion: 'No',
      autoDebit: 'No', employeeLoan: 'No', communityAffordableSecond: 'No',
      expandedGuidelines: {
        incomeVerificationType: iv,
        housingEventType: 'None', housingEventSeasoning: 'NotApplicable',
        bankruptcyType: 'None', bankruptcyOutcome: 'NotApplicable',
        bankruptcySeasoning: 'NotApplicable',
        mortgageLatesx30_12Mos: 0, mortgageLatesx30_13to24Mos: 0,
        mortgageLatesx60_12Mos: 0, mortgageLatesx60_13to24Mos: 0,
        mortgageLatesx90_12Mos: 0, mortgageLatesx90_13to24Mos: 0,
        mortgageLatesx120_12Mos: 0, mortgageLatesx120_13to24Mos: 0,
        debtConsolidation: false, uniqueProperty: false,
      },
      reducedMI: false, representativeFICO: 740, loanLevelDebtToIncomeRatio: 36,
      totalMonthlyQualifyingIncome: 10000, customerInternalId: 'IVCorrect',
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

const url = `${process.env.OB_API_BASE_URL}/full/api/businesschannels/${process.env.OB_BUSINESS_CHANNEL_ID}/originators/${process.env.OB_ORIGINATOR_ID}/productsearch`

const CANDIDATES = [
  'FullDoc', 'WrittenVOE', 'Stated', 'NoIncomeVerification', 'InvestorDscr',
  'BankStatement', 'BankStatement12', 'BankStatement24', 'BankStatements',
  'BankStatements12', 'BankStatements24',
  'AssetDepletion', 'AssetRelated', 'AssetUtilization',
  'TaxReturns1Yr', 'OneYearTaxReturn', '1099', 'TenNinetyNine',
  'PnL', 'ProfitAndLoss', 'WVOE', 'VOE',
]

for (const v of CANDIDATES) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(buildBody(v)),
  })
  const text = await r.text()
  let body; try { body = JSON.parse(text) } catch { body = { _raw: text.slice(0, 200) } }
  const errs = body?.errors || {}
  const ivErrs = Object.entries(errs).filter(([k]) => /IncomeVerificationType/i.test(k)).map(([, vv]) => Array.isArray(vv) ? vv[0] : vv)
  const allOtherErrs = Object.keys(errs).filter(k => !/IncomeVerificationType/i.test(k))
  const status = r.status
  const hasProducts = Array.isArray(body?.products)
  const hasSearchId = !!body?.searchId

  if (status === 200 || hasProducts || hasSearchId) {
    console.log(`✓ ${v.padEnd(28)} status=${status} products=${body.products?.length ?? '?'} notEligible=${body.notEligibleProducts?.length ?? '?'} searchId=${hasSearchId}`)
  } else if (ivErrs.length > 0) {
    console.log(`✗ ${v.padEnd(28)} REJECTED: ${ivErrs[0].slice(0, 90)}`)
  } else if (allOtherErrs.length > 0) {
    console.log(`? ${v.padEnd(28)} other err: ${allOtherErrs.slice(0, 2).join(', ')}`)
  } else {
    console.log(`? ${v.padEnd(28)} status=${status} body=${text.slice(0, 100)}`)
  }
  await new Promise(r => setTimeout(r, 250))
}
