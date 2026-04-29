import type { VercelRequest, VercelResponse } from '@vercel/node'
import zips from './data/us-zips.json' with { type: 'json' }

// Serverless ZIP→{city, county, state} lookup backed by the GeoNames
// US postal-code dataset (40,979 entries). Authoritative county data
// is required by Optimal Blue's PropertyInformation.county field — the
// previous Zippopotam.us-based lookup never returned a county at all
// (it just echoed the city name) which is why every ZIP except the
// hardcoded 90210 silently broke OB pricing with
// "<city> is not a recognized County Name for <state>."

interface ZipEntry {
  city: string
  state: string
  county: string
}

const TABLE: Record<string, ZipEntry> = zips as Record<string, ZipEntry>

export default function handler(req: VercelRequest, res: VercelResponse) {
  const zip = String(req.query.zip || '').trim()
  if (!/^\d{5}$/.test(zip)) {
    return res.status(400).json({ success: false, error: 'zip must be 5 digits' })
  }
  const entry = TABLE[zip]
  if (!entry) {
    return res.status(404).json({ success: false, error: 'ZIP not found' })
  }
  res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=86400')
  return res.status(200).json({ success: true, zip, ...entry })
}
