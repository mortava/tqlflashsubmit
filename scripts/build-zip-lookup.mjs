// Build a compact ZIP→{city, state, county} JSON file from the GeoNames
// US postal-code TSV (downloaded once and committed to scripts/us-zips.tsv).
// Output goes to api/data/us-zips.json so the serverless ZIP lookup endpoint
// can require() it without an HTTP round-trip.

import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve('scripts/us-zips.tsv')
const DST = path.resolve('api/data/us-zips.json')

const text = fs.readFileSync(SRC, 'utf8')
const out = {}
let n = 0
for (const line of text.split(/\r?\n/)) {
  if (!line) continue
  const c = line.split('\t')
  // GeoNames TSV columns: 0=country 1=postal_code 2=place_name
  // 3=admin1_name (state full) 4=admin1_code (state abbr)
  // 5=admin2_name (county) 6=admin2_code (FIPS) ...
  const zip = c[1], city = c[2], state = c[4], county = c[5]
  if (!zip || !state) continue
  if (!out[zip]) {
    out[zip] = { city: city || '', state, county: county || '' }
    n++
  }
}
fs.mkdirSync(path.dirname(DST), { recursive: true })
fs.writeFileSync(DST, JSON.stringify(out))
console.log('[zips] unique entries:', n)
console.log('[zips] output size:', fs.statSync(DST).size, 'bytes')
console.log('[zips] sample 30309:', out['30309'])
console.log('[zips] sample 90210:', out['90210'])
console.log('[zips] sample 10001:', out['10001'])
