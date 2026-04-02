import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEncompassToken } from './encompass-auth'

const API_BASE = process.env.API_BASE_URL || 'https://api.elliemae.com'

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
  const targetFolder = (process.env.TARGET_FOLDER || 'TPO Pipeline').replace(/"/g, '')

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
