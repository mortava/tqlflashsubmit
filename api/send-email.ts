import type { VercelRequest, VercelResponse } from '@vercel/node'

const RESEND_API_URL = 'https://api.resend.com/emails'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Resend API key not configured' })
  }

  const { to, subject, html, from } = req.body || {}

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, html' })
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(to)) {
    return res.status(400).json({ error: 'Invalid email address' })
  }

  // Caller-supplied FROM is allowed but only when it ends with one of TQL's
  // verified Resend domains. Anything else falls back to the default sender.
  const VERIFIED_DOMAINS = ['tqltpo.com', 'tqlend.com']
  const isVerifiedFrom = (() => {
    if (typeof from !== 'string' || !from) return false
    const m = from.match(/<([^>]+)>/)
    const addr = (m ? m[1] : from).trim().toLowerCase()
    return VERIFIED_DOMAINS.some(d => addr.endsWith('@' + d) || addr.endsWith('.' + d))
  })()
  const fromAddress = isVerifiedFrom ? from : 'TQL Flash Submit <TPOSub@tqltpo.com>'

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Failed to send email', details: data })
    }

    return res.status(200).json({ success: true, id: data.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to send email', details: message })
  }
}
