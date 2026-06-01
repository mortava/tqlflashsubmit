// A/B probe: does CustomProductFilter02 (Short Term Rental) actually affect OB
// product search results? Varies ONLY the STR custom field across:
//   - No  (110) number   (production baseline)
//   - Yes (109) number   (production "STR on")
//   - Yes ('109') string (legacy probe format)
// Everything else held constant. Diffs eligible-count + STR-tagged adjustments.
//
// Usage: node scripts/ob-probe-str-ab.mjs

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
  return (await r.json()).access_token
}

// strVal = the customFieldValue to send for CustomProductFilter02
function buildBody(strVal) {
  const expandedGuidelines = {
    incomeVerificationType: 'InvestorDscr',
    housingEventType: 'None',
    housingEventSeasoning: 'NotApplicable',
    bankruptcyType: 'None',
    bankruptcyOutcome: 'NotApplicable',
    bankruptcySeasoning: 'NotApplicable',
    mortgageLatesx30_12Mos: 0, mortgageLatesx30_13to24Mos: 0,
    mortgageLatesx60_12Mos: 0, mortgageLatesx60_13to24Mos: 0,
    mortgageLatesx90_12Mos: 0, mortgageLatesx90_13to24Mos: 0,
    mortgageLatesx120_12Mos: 0, mortgageLatesx120_13to24Mos: 0,
    debtConsolidation: false,
    uniqueProperty: false,
    entityVesting: false,
    firstTimeInvestor: false,
    ruralProperty: false,
    shortTermRental: false, // NOTE: also probe-tested below via expandedGuidelines
    vacantUnleased: false,
    debtServiceCoverageRatio: 1.25,
  }
  return {
    representativeFICO: 740,
    loanLevelDebtToIncomeRatio: 36,
    borrowerInformation: {
      citizenship: 'USCitizen', fico: 740, hasITIN: false,
      firstName: 'Probe', lastName: 'STR',
      vaFirstTimeUse: false, firstTimeHomeBuyer: false,
      monthsReserves: 12, selfEmployed: true, waiveEscrows: false, state: 'CA',
      incomeDocumentation: 'Verified',
      assetDocumentation: 'Verified',
      employmentDocumentation: 'Verified',
    },
    propertyInformation: {
      appraisedValue: 800000, occupancy: 'InvestmentProperty',
      state: 'CA', zipCode: '90210', county: 'Los Angeles', city: 'Beverly Hills',
      propertyType: 'SingleFamily', corporateRelocation: false,
      salesPrice: 800000, numberOfStories: 1, numberOfUnits: 'OneUnit',
    },
    loanInformation: {
      loanPurpose: 'Purchase', lienType: 'First', amortizationTypes: ['Fixed'],
      automatedUnderwritingSystem: 'ManualTraditional', borrowerPaidMI: 'Yes',
      buydown: 'None', cashOutAmount: 0, desiredLockPeriod: 30,
      desiredPrice: 0, desiredRate: 0, feesIn: 'No',
      expandedApprovalLevel: 'NotApplicable', interestOnly: false,
      baseLoanAmount: 500000, secondLienAmount: 0, helocDrawnAmount: 0, helocLineAmount: 0,
      loanTerms: ['ThirtyYear'], loanType: 'NonConforming', prepaymentPenalty: 'None',
      exemptFromVAFundingFee: false, includeLOCompensationInPricing: 'NoBuyerPaid',
      calculateTotalLoanAmount: true, dutyToServe: 'No', missionScore: 'Zero',
      assetDepletion: 'No', autoDebit: 'No', employeeLoan: 'No', communityAffordableSecond: 'No',
      expandedGuidelines,
      includeEligibilityExceptions: true, reducedMI: false,
      representativeFICO: 740, loanLevelDebtToIncomeRatio: 36,
      totalMonthlyQualifyingIncome: 10000, customerInternalId: 'STRProbe',
      productFilters: ['Standard', 'ExpandedGuidelines'],
      productFilter: ['Standard', 'ExpandedGuidelines'],
      customFields: [
        { customFieldInputName: 'CustomProductFilter01', customFieldValue: 110,    columnName: 'CustomLenderField4' },
        { customFieldInputName: 'CustomProductFilter02', customFieldValue: strVal,  columnName: 'CustomLenderField5' },
        { customFieldInputName: 'CustomProductFilter03', customFieldValue: 110,    columnName: 'CustomLenderField7' },
        { customFieldInputName: 'CustomProductFilter04', customFieldValue: 110,    columnName: 'CustomLenderField8' },
        { customFieldInputName: 'CustomProductFilter05', customFieldValue: 110,    columnName: 'CustomLenderField10' },
      ],
    },
    coBorrowerInformation: {},
  }
}

async function search(token, label, strVal) {
  const url = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(buildBody(strVal)),
  })
  const text = await r.text()
  let data = null
  try { data = JSON.parse(text) } catch {}
  const products = Array.isArray(data?.products) ? data.products
    : Array.isArray(data) ? data : []
  const ineligible = Array.isArray(data?.notEligibleProducts) ? data.notEligibleProducts : []
  // Collect any adjustment reasons mentioning short term / STR
  const strAdjustments = []
  for (const p of products) {
    const adjs = p.adjustments || p.priceAdjustments || []
    for (const a of adjs) {
      const reason = String(a.reason || a.description || '')
      if (/short.?term|\bSTR\b|rental/i.test(reason)) strAdjustments.push(`${p.productName || p.name || '?'}: ${reason} (${a.adjustor ?? a.value ?? '?'})`)
    }
  }
  const strIneligible = ineligible.filter(p => /short.?term|\bSTR\b/i.test(JSON.stringify(p))).length
  console.log(`\n=== ${label} (CustomProductFilter02=${JSON.stringify(strVal)}) ===`)
  console.log(`  HTTP ${r.status} | eligible=${products.length} | ineligible=${ineligible.length} | STR-tagged-ineligible=${strIneligible}`)
  if (strAdjustments.length) console.log('  STR adjustments:', strAdjustments.slice(0, 5))
  if (r.status >= 400) console.log('  ERROR body:', text.substring(0, 400))
  // Return a fingerprint for diffing
  return {
    label, status: r.status, count: products.length, ineligible: ineligible.length,
    names: products.map(p => p.productName || p.name).sort(),
  }
}

async function dumpAdjustments(token, label, strVal) {
  const url = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(buildBody(strVal)),
  })
  const data = await r.json().catch(() => null)
  const products = Array.isArray(data?.products) ? data.products : Array.isArray(data) ? data : []
  console.log(`\n----- FULL DUMP: ${label} (CPF02=${JSON.stringify(strVal)}) -----`)
  for (const p of products) {
    console.log(`  PRODUCT: ${p.productName || p.name || '?'} | price=${p.price ?? p.basePrice ?? '?'} rate=${p.rate ?? p.noteRate ?? '?'}`)
    const adjs = p.adjustments || p.priceAdjustments || []
    for (const a of adjs) console.log(`     adj: ${a.reason || a.description} = ${a.adjustor ?? a.value ?? a.amount}`)
  }
}

// Run a search, then fetch per-product DETAIL (where LLPAs live) and return
// productName -> { price, adjustments: [reason=adjustor] }
async function searchWithDetail(token, strVal, bodyOverride) {
  const base = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch`
  const body = bodyOverride ? bodyOverride(buildBody(strVal)) : buildBody(strVal)
  const r = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => null)
  if (r.status !== 200) return { status: r.status, products: {} }
  const searchId = data?.searchId
  const products = Array.isArray(data?.products) ? data.products : []
  const out = {}
  for (const p of products) {
    const pid = p.productId
    let adjustments = []
    if (searchId && pid) {
      const dr = await fetch(`${base}/${searchId}/products/${pid}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      })
      if (dr.ok) {
        const detail = await dr.json().catch(() => null)
        const adjs = detail?.adjustments || detail?.quotes?.[0]?.adjustments || []
        adjustments = adjs.map(a => `${a.reason || a.description}=${a.adjustor ?? a.value ?? a.amount}`)
      }
    }
    out[p.productName || p.name || String(pid)] = { price: p.price, rate: p.rate, adjustments }
  }
  return { status: 200, count: products.length, products: out }
}

function compareDetail(label, no, yes) {
  console.log(`\n############ DETAIL COMPARE: ${label} ############`)
  console.log(`  STR=No -> ${no.count} products | STR=Yes -> ${yes.count} products`)
  const allNames = new Set([...Object.keys(no.products), ...Object.keys(yes.products)])
  let anyDiff = false
  for (const name of allNames) {
    const n = no.products[name], y = yes.products[name]
    if (!n) { console.log(`  + ONLY in STR=Yes: ${name}`); anyDiff = true; continue }
    if (!y) { console.log(`  - ONLY in STR=No : ${name}`); anyDiff = true; continue }
    const nAdj = JSON.stringify(n.adjustments), yAdj = JSON.stringify(y.adjustments)
    if (n.price !== y.price || nAdj !== yAdj) {
      anyDiff = true
      console.log(`  ~ ${name}: price ${n.price}->${y.price}`)
      const nSet = new Set(n.adjustments), ySet = new Set(y.adjustments)
      const added = y.adjustments.filter(a => !nSet.has(a))
      const removed = n.adjustments.filter(a => !ySet.has(a))
      if (added.length) console.log(`      + adj added when STR=Yes:`, added)
      if (removed.length) console.log(`      - adj removed when STR=Yes:`, removed)
    }
  }
  if (!anyDiff) console.log('  >> NO DIFFERENCE between STR=No and STR=Yes (STR has no effect for this scenario)')
}

async function main() {
  const token = await getToken()
  console.log('Token OK. Running STR A/B probe...')
  const a = await search(token, 'STR = No  (110 number)', 110)
  const b = await search(token, 'STR = Yes (109 number)', 109)
  const c = await search(token, 'STR = Yes (109 STRING)', '109')
  // Does OB validate this custom field at all? Send a bogus value.
  await search(token, 'STR = BOGUS (999 number)', 999)
  await search(token, 'STR = BOGUS ("Yes" text)', 'Yes')

  // ---- DEEP DETAIL COMPARE (LLPAs live in product detail, not search) ----
  // Baseline scenario (62.5% LTV, 740 FICO)
  const noBase = await searchWithDetail(token, 110)
  const yesBase = await searchWithDetail(token, 109)
  compareDetail('Baseline 62.5% LTV / 740 FICO', noBase, yesBase)

  // Higher-LTV / lower-FICO scenario to surface STR-sensitive overlays
  const harden = body => {
    body.representativeFICO = 700
    body.loanInformation.baseLoanAmount = 640000 // 80% LTV on 800k
    body.loanInformation.representativeFICO = 700
    body.borrowerInformation.fico = 700
    return body
  }
  const noHard = await searchWithDetail(token, 110, harden)
  const yesHard = await searchWithDetail(token, 109, harden)
  compareDetail('Hardened 80% LTV / 700 FICO', noHard, yesHard)

  console.log('\n\n================= DIFF SUMMARY =================')
  const fp = x => `count=${x.count} ineligible=${x.ineligible}`
  console.log(`No(110#) : ${fp(a)}`)
  console.log(`Yes(109#): ${fp(b)}  -> ${fp(b) === fp(a) ? 'IDENTICAL to No (STR ignored?)' : 'DIFFERENT from No (STR honored)'}`)
  console.log(`Yes(109s): ${fp(c)}  -> ${fp(c) === fp(a) ? 'IDENTICAL to No' : 'DIFFERENT from No'}`)
  const setA = new Set(a.names), setB = new Set(b.names)
  const onlyNo = a.names.filter(n => !setB.has(n))
  const onlyYes = b.names.filter(n => !setA.has(n))
  if (onlyNo.length) console.log('\nProducts eligible only when STR=No:', onlyNo)
  if (onlyYes.length) console.log('Products eligible only when STR=Yes:', onlyYes)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
