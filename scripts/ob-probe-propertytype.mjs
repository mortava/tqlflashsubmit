// Probe OB v4 PropertyType enum — sends a minimal valid pricing request
// and rotates `propertyType` through candidate values, reporting which
// ones OB accepts vs rejects with "not a valid value".
//
// Usage: node scripts/ob-probe-propertytype.mjs
// Requires: .env.local with OB_* vars (already populated locally).

import fs from 'node:fs'
import path from 'node:path'

// ── load .env.local ──
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

function buildBody(propertyType, numberOfUnits = 'OneUnit') {
  return {
    requestType: 'QMPricingRequest',
    propertyInformation: {
      appraisedValue: 800000,
      occupancy: 'PrimaryResidence',
      state: 'CA',
      zipCode: '90210',
      county: 'Los Angeles',
      city: 'Beverly Hills',
      propertyType,
      corporateRelocation: false,
      salesPrice: 800000,
      numberOfStories: 1,
      numberOfUnits,
    },
    loanInformation: {
      loanType: 'Conforming',
      loanPurpose: 'Purchase',
      loanTerm: 'ThirtyYear',
      lockDays: 30,
      loanAmount: 600000,
      amortizationType: 'Fixed',
      mortgageInsuranceCompany: 'NotApplicable',
      isFirstTimeHomebuyer: false,
      isVeteran: false,
      escrowType: 'TaxesAndInsurance',
      additionalLienAmount: 0,
      isHomeReadyAffordableProductRequest: false,
      automatedUnderwritingSystem: 'NotApplicable',
      isHelocFullDraw: false,
    },
    creditInformation: {
      decisionCreditScore: 740,
      monthlyIncome: 12000,
      totalLiabilityAmount: 1500,
    },
    representativeUserId: 'probe',
  }
}

async function tryProp(token, propertyType, numberOfUnits) {
  const url = `${OB_API_BASE_URL}/full/api/businesschannels/${OB_BUSINESS_CHANNEL_ID}/originators/${OB_ORIGINATOR_ID}/productsearch`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(buildBody(propertyType, numberOfUnits)),
  })
  const text = await r.text()
  let body
  try { body = JSON.parse(text) } catch { body = { _raw: text } }
  return { status: r.status, body }
}

const CANDIDATES = [
  'SingleFamily',
  'SingleFamilyDetached',
  'SingleFamilyAttached',
  'Detached',
  'Attached',
  'Condo',
  'Condominium',
  'Townhome',
  'Townhouse',
  'PUD',
  'PlannedUnitDevelopment',
  'TwoFamily',
  'ThreeFamily',
  'FourFamily',
  'TwoToFourFamily',
  'TwoToFourUnit',
  'TwoToFourUnits',
  'MultiFamily',
  'MultiUnit',
  'FiveOrMoreFamily',
  'FiveToEightUnit',
  'FiveToEightUnits',
  'FiveToEightFamily',
  'ManufacturedHome',
  'Manufactured',
  'ModularHome',
  'Modular',
  'Cooperative',
  'Condotel',
  'MixedUse',
]

const token = await getToken()
console.log('[probe] token acquired, len=', token.length)
console.log('[probe] sweeping', CANDIDATES.length, 'PropertyType candidates…\n')

const accepted = []
const rejected = []

for (const pt of CANDIDATES) {
  const { status, body } = await tryProp(token, pt)
  const errs = body?.errors || {}
  const ptError = errs['propertyInformation.propertyType'] || errs['request.propertyInformation.propertyType'] || errs['propertyType']
  const reason = ptError ? (Array.isArray(ptError) ? ptError[0] : ptError) : null

  if (reason && /not a valid value|Error converting/i.test(String(reason))) {
    rejected.push(pt)
    console.log(`✗ ${pt.padEnd(28)} REJECTED: ${String(reason).slice(0, 100)}`)
  } else {
    accepted.push({ pt, status, summary: body?.title || (body?.products ? `products=${body.products.length}` : `status=${status}`) })
    console.log(`✓ ${pt.padEnd(28)} ACCEPTED — ${body?.title || (body?.products?.length != null ? `products=${body.products.length}` : `status=${status}`)}`)
  }
  await new Promise(r => setTimeout(r, 250))
}

console.log('\n— ACCEPTED —')
for (const a of accepted) console.log(' ', a.pt, '·', a.summary)
console.log('\n— REJECTED —')
console.log(' ', rejected.join(', '))
