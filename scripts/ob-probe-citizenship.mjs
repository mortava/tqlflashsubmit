// Probe OB v4 Citizenship enum — rotates through candidate values to find
// the exact strings OB accepts for the TQL NonQM channel.
//
// Usage: node scripts/ob-probe-citizenship.mjs
// Requires: .env.local with OB_* vars

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

function buildBody(citizenship) {
  return {
    representativeFICO: 740,
    loanLevelDebtToIncomeRatio: 36,
    borrowerInformation: {
      citizenship,
      fico: 740,
      hasITIN: false,
      firstName: 'Probe',
      lastName: 'Test',
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
      appraisedValue: 500000,
      occupancy: 'PrimaryResidence',
      state: 'CA',
      zipCode: '90210',
      county: 'Los Angeles',
      city: 'Beverly Hills',
      propertyType: 'SingleFamily',
      corporateRelocation: false,
      salesPrice: 500000,
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
      baseLoanAmount: 400000,
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
      representativeFICO: 740,
      loanLevelDebtToIncomeRatio: 36,
      totalMonthlyQualifyingIncome: 8000,
      customerInternalId: 'OBSearch',
      reducedMI: false,
      expandedGuidelines: {
        incomeVerificationType: 'FullDoc',
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

const CANDIDATES = [
  // Round 3: user-specified "Perm" (no "anent") + ResidentAlien
  'PermResidentAlien',
  'NonPermResidentAlien',
  // Confirm baseline still passes
  'USCitizen',
  'ForeignNational',
]

async function probe(token, value) {
  const url = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(buildBody(value)),
  })
  const txt = await r.text()
  let parsed
  try { parsed = JSON.parse(txt) } catch { parsed = null }
  const errs = parsed?.errors ? Object.entries(parsed.errors).flatMap(([k, v]) => Array.isArray(v) ? v.map(m => `${k}: ${m}`) : [`${k}: ${v}`]) : []
  const citizenErr = errs.find(e => /citizenship/i.test(e))
  if (r.ok) {
    return { value, status: r.status, ok: true, products: parsed?.products?.length ?? 0, ineligible: parsed?.notEligibleProducts?.length ?? 0 }
  }
  return { value, status: r.status, ok: false, citizenErr: citizenErr || null, otherErrs: errs.filter(e => !/citizenship/i.test(e)).slice(0, 2) }
}

;(async () => {
  console.log('[citizenship-probe] getting token...')
  const token = await getToken()
  console.log('[citizenship-probe] testing', CANDIDATES.length, 'values\n')
  for (const v of CANDIDATES) {
    try {
      const r = await probe(token, v)
      if (r.ok) {
        console.log(`✅ ${String(v).padEnd(30)} HTTP ${r.status}  products=${r.products}  ineligible=${r.ineligible}`)
      } else if (!r.citizenErr) {
        console.log(`✅ ${String(v).padEnd(30)} HTTP ${r.status}  citizenship: OK (other errors: ${r.otherErrs.join(' | ') || 'none'})`)
      } else {
        console.log(`❌ ${String(v).padEnd(30)} HTTP ${r.status}  ${r.citizenErr}`)
      }
    } catch (e) {
      console.log(`💥 ${String(v).padEnd(30)} ${e.message}`)
    }
  }
})()
