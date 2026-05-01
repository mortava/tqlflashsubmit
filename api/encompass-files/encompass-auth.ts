import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEncompassToken } from './_lib/encompass-token.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const token = await getEncompassToken()
    return res.status(200).json({ success: true, authenticated: true, tokenPreview: token.slice(0, 8) + '...' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Authentication failed'
    return res.status(500).json({ success: false, error: message })
  }
}
