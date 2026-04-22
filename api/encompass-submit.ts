import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEncompassToken } from './_lib/encompass-token.js'

const API_BASE = process.env.ENCOMPASS_API_BASE_URL || process.env.API_BASE_URL || 'https://api.elliemae.com'

async function convertMismoToLoanJson(token: string, mismoXml: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/encompass/v3/converter/loans`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/vnd.elliemae.mismo34+xml',
      'Accept': 'application/json',
    },
    body: mismoXml,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`MISMO conversion failed (${res.status}): ${errText}`)
  }

  return await res.json() as Record<string, unknown>
}

async function createLoan(token: string, loanJson: Record<string, unknown>): Promise<{ loanId: string }> {
  const targetFolder = (process.env.ENCOMPASS_TARGET_FOLDER || process.env.TARGET_FOLDER || 'TPO Pipeline').replace(/"/g, '')

  const res = await fetch(
    `${API_BASE}/encompass/v3/loans?loanFolder=${encodeURIComponent(targetFolder)}&view=id`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(loanJson),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Loan creation failed (${res.status}): ${errText}`)
  }

  const data = await res.json() as { id: string; encompassId?: string }
  return { loanId: data.id || data.encompassId || '' }
}

async function sendNotificationEmail(loanNumber: string, loanId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'TQL Flash Submit <TPOSub@tqltpo.com>',
      to: ['tposupport@tqlend.com'],
      subject: `New Loan Submitted via Flash Submit — Loan #${loanNumber}`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 16px;color:#0D3B66;">New Loan Submitted</h2>
          <p style="color:#333;font-size:14px;line-height:1.6;">
            A new loan has been created in Encompass via <strong>TQL Flash Submit</strong>.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr>
              <td style="padding:8px 0;color:#666;font-size:13px;width:140px;">Loan Number</td>
              <td style="padding:8px 0;font-size:14px;font-weight:600;color:#111;">${loanNumber}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#666;font-size:13px;">Loan GUID</td>
              <td style="padding:8px 0;font-size:12px;font-family:monospace;color:#333;">${loanId}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#666;font-size:13px;">Folder</td>
              <td style="padding:8px 0;font-size:14px;color:#333;">TPO Pipeline</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#666;font-size:13px;">Submitted</td>
              <td style="padding:8px 0;font-size:14px;color:#333;">${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}</td>
            </tr>
          </table>
          <p style="color:#999;font-size:11px;margin-top:24px;">
            This is an automated notification from TQL Flash Submit.
          </p>
        </div>
      `,
    }),
  })
}

async function getLoanNumber(token: string, loanId: string): Promise<string> {
  const res = await fetch(
    `${API_BASE}/encompass/v3/loans/${loanId}?entities=LoanNumber`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    }
  )

  if (!res.ok) {
    return loanId // fallback to GUID
  }

  const data = await res.json() as { loanNumber?: string; fields?: Record<string, unknown> }
  return data.loanNumber || String(data.fields?.['2'] ?? loanId)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const { mismoXml } = req.body as { mismoXml?: string }

    if (!mismoXml || typeof mismoXml !== 'string' || mismoXml.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'MISMO 3.4 XML content is required' })
    }

    // Basic XML validation
    if (!mismoXml.includes('<') || !mismoXml.includes('MISMO')) {
      return res.status(400).json({ success: false, error: 'Invalid MISMO XML format. File must contain valid MISMO 3.4 XML.' })
    }

    // Step 1: Authenticate
    const token = await getEncompassToken()

    // Step 2: Convert MISMO XML to Encompass Loan JSON
    const loanJson = await convertMismoToLoanJson(token, mismoXml)

    // Step 3: Create loan in target folder
    const { loanId } = await createLoan(token, loanJson)

    // Step 4: Retrieve human-readable loan number
    const loanNumber = await getLoanNumber(token, loanId)

    // Step 5: Send notification email to TPO Support (fire-and-forget)
    sendNotificationEmail(loanNumber, loanId).catch(() => {})

    return res.status(200).json({
      success: true,
      loanId,
      loanNumber,
      message: `Loan created successfully. Loan #${loanNumber}`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Loan submission failed'
    return res.status(500).json({ success: false, error: message })
  }
}
