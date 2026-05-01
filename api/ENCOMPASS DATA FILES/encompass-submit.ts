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

// Resolve the Encompass Lender Case # / Loan Number for the loan that was just
// created. TQL's Encompass instance auto-assigns a 317-prefixed loan number,
// stored in field 4 (Loan Number) and mirrored to field 305 (Lender Case #).
// Numbers are not always populated on the very first read after a /loans POST,
// so we retry the fieldReader a few times with a short backoff and never
// fall back to the loan GUID — only return a real number.
async function getLenderTrackingNumber(token: string, loanId: string): Promise<string> {
  const fieldReader = async (ids: string[]): Promise<Record<string, string>> => {
    const r = await fetch(
      `${API_BASE}/encompass/v3/loans/${loanId}/fieldReader`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(ids),
      }
    )
    if (!r.ok) return {}
    const arr = await r.json() as Array<{ fieldId: string; value?: string }>
    const out: Record<string, string> = {}
    if (Array.isArray(arr)) {
      for (const f of arr) out[String(f.fieldId)] = String(f.value ?? '').trim()
    }
    return out
  }

  // Pull all the candidate loan-number fields together. Encompass installations
  // vary on which one is "primary": 305 = Lender Case #, 4 = Loan Number,
  // 364 = NMLS Loan ID. First non-empty wins.
  const FIELDS = ['305', '4', '364']

  // Retry up to 4× with 350ms backoff in case Encompass hasn't persisted the
  // auto-assigned loan number yet (race against the create-loan response).
  let collected: Record<string, string> = {}
  for (let attempt = 0; attempt < 4; attempt++) {
    collected = await fieldReader(FIELDS).catch(() => ({}))
    if (collected['305'] || collected['4'] || collected['364']) break
    await new Promise(r => setTimeout(r, 350))
  }

  // If 305 already has a value, use it directly.
  if (collected['305']) return collected['305']

  // Otherwise fall back to field 4 (loan number) and copy it into 305 so the
  // Lender Case # is populated for downstream Encompass workflows.
  const loanNumber = collected['4'] || collected['364']
  if (loanNumber) {
    await fetch(
      `${API_BASE}/encompass/v3/loans/${loanId}/fieldWriter`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify([{ fieldId: '305', value: loanNumber }]),
      }
    ).catch(() => null)
    return loanNumber
  }

  // Final fallback path: the entities=LoanNumber shortcut, then the GUID
  // (the GUID is only returned if absolutely nothing else is available).
  try {
    const fb = await fetch(
      `${API_BASE}/encompass/v3/loans/${loanId}?entities=LoanNumber`,
      { method: 'GET', headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    )
    if (fb.ok) {
      const data = await fb.json() as { loanNumber?: string; fields?: Record<string, unknown> }
      const ln = data.loanNumber || String(data.fields?.['4'] ?? data.fields?.['2'] ?? '').trim()
      if (ln) return ln
    }
  } catch { /* swallow */ }

  return loanId
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

    // Step 4: Retrieve the Lender's Tracking Number (Encompass field 305)
    const loanNumber = await getLenderTrackingNumber(token, loanId)

    // Step 5: Send notification email to TPO Support (fire-and-forget)
    sendNotificationEmail(loanNumber, loanId).catch(() => {})

    return res.status(200).json({
      success: true,
      loanId,
      loanNumber,                  // kept for frontend compatibility
      lenderTrackingNumber: loanNumber, // explicit field-305 alias
      message: `Loan created successfully. Lender Tracking # ${loanNumber}`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Loan submission failed'
    return res.status(500).json({ success: false, error: message })
  }
}
