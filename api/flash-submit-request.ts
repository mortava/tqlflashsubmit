import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const RESEND_API_URL = 'https://api.resend.com/emails'

interface BrokerFormData {
  borrowerLastName: string
  brokerName: string
  brokerEmail: string
  companyName: string
  originationCharge: string
  chargingProcessingFee: boolean
  processingFeeAmount: string
  collectingCreditReportFee: boolean
  creditReportFeeAmount: string
  thirdPartyProcessingFee: string
  hasTitleEscrowSheet: boolean
  authorizeSmartFees: boolean
}

interface ScenarioPayload {
  loanAmount: string | number
  propertyValue: string | number
  propertyAddress?: string
  propertyState?: string
  propertyZip?: string
  propertyCounty?: string
  propertyCity?: string
  occupancyType?: string
  propertyType?: string
  loanPurpose?: string
  loanTerm?: string
  amortization?: string
  documentationType?: string
  creditScore?: string | number
  dti?: string | number
  lockPeriod?: string
  prepayPeriod?: string
  isInvestment?: boolean
}

interface SelectedRate {
  programName: string
  rate: number
  price: number
  apr: number
  payment: number
  points?: number
  lockPeriod?: number | string
  adjustments?: Array<{ description: string; amount: number; rateAdj?: number }>
}

interface RequestBody {
  broker: BrokerFormData
  scenario: ScenarioPayload
  rate: SelectedRate
}

function fmtMoney(n: number | string): string {
  const num = typeof n === 'string' ? parseFloat(n.replace(/[^\d.-]/g, '')) : n
  if (!isFinite(num)) return '—'
  return `$${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

function fmtPct(n: number): string {
  return `${n.toFixed(3)}%`
}

function yn(b: boolean): string { return b ? 'Yes' : 'No' }

async function buildPDF(body: RequestBody): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792]) // US Letter
  const { width, height } = page.getSize()
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const teal = rgb(0.141, 0.372, 0.451)   // #245F73
  const ink = rgb(0.043, 0.071, 0.125)    // #0B1220
  const muted = rgb(0.4, 0.4, 0.4)
  const rule = rgb(0.8, 0.84, 0.88)

  const margin = 48
  let y = height - margin

  // ─── Header ───
  page.drawRectangle({ x: 0, y: y - 4, width, height: 56, color: teal })
  page.drawText('TQL FLASH SUBMIT', { x: margin, y: y + 22, size: 18, font: helvBold, color: rgb(1, 1, 1) })
  page.drawText('Setup Request & Pricing Summary', { x: margin, y: y + 6, size: 10, font: helv, color: rgb(0.85, 0.92, 0.95) })
  page.drawText(new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }), {
    x: width - margin - 180, y: y + 22, size: 9, font: helv, color: rgb(1, 1, 1),
  })
  y -= 60

  const section = (title: string) => {
    y -= 18
    page.drawText(title, { x: margin, y, size: 11, font: helvBold, color: teal })
    page.drawLine({ start: { x: margin, y: y - 3 }, end: { x: width - margin, y: y - 3 }, thickness: 0.6, color: rule })
    y -= 14
  }
  const row = (label: string, value: string) => {
    if (y < margin + 40) { y = height - margin; /* overflow — best-effort */ }
    page.drawText(label, { x: margin, y, size: 9, font: helv, color: muted })
    page.drawText(value, { x: margin + 170, y, size: 9.5, font: helvBold, color: ink })
    y -= 14
  }

  // ─── Broker + borrower ───
  section('Request Details')
  row("Borrower's Last Name", body.broker.borrowerLastName || '—')
  row('Broker Name', body.broker.brokerName || '—')
  row('Broker Email', body.broker.brokerEmail || '—')
  row('Submitting Company', body.broker.companyName || '—')

  // ─── Selected Rate / Program ───
  section('Selected Rate & Program')
  row('Program', body.rate.programName || '—')
  row('Interest Rate', fmtPct(body.rate.rate))
  row('Price', body.rate.price.toFixed(3))
  row('APR', fmtPct(body.rate.apr))
  row('P&I Payment', body.rate.payment > 0 ? fmtMoney(body.rate.payment) : '—')
  if (body.rate.lockPeriod) row('Lock Period', `${body.rate.lockPeriod} days`)

  // ─── Scenario Inputs ───
  section('Loan Scenario')
  row('Loan Amount', fmtMoney(body.scenario.loanAmount))
  row('Property Value', fmtMoney(body.scenario.propertyValue))
  const addr = [body.scenario.propertyCity, body.scenario.propertyState, body.scenario.propertyZip].filter(Boolean).join(', ')
  if (addr) row('Property', addr)
  if (body.scenario.propertyCounty) row('County', body.scenario.propertyCounty)
  if (body.scenario.occupancyType) row('Occupancy', body.scenario.occupancyType)
  if (body.scenario.propertyType) row('Property Type', body.scenario.propertyType)
  if (body.scenario.loanPurpose) row('Loan Purpose', body.scenario.loanPurpose)
  if (body.scenario.loanTerm) row('Term', `${body.scenario.loanTerm}yr`)
  if (body.scenario.amortization) row('Amortization', body.scenario.amortization)
  if (body.scenario.documentationType) row('Doc Type', body.scenario.documentationType)
  if (body.scenario.creditScore) row('FICO', String(body.scenario.creditScore))
  if (body.scenario.dti) row('DTI', `${body.scenario.dti}%`)
  if (body.scenario.lockPeriod) row('Requested Lock', `${body.scenario.lockPeriod} days`)
  if (body.scenario.isInvestment && body.scenario.prepayPeriod) row('Prepay Period', body.scenario.prepayPeriod)

  // ─── Broker Fees & Authorizations ───
  section('Broker Fees & Authorizations')
  row('Broker Origination Charge', body.broker.originationCharge || '—')
  row('Charging Processing Fee', yn(body.broker.chargingProcessingFee))
  if (body.broker.chargingProcessingFee) row('  Processing Fee Amount', body.broker.processingFeeAmount || '—')
  row('Collecting Credit Report Fee', yn(body.broker.collectingCreditReportFee))
  if (body.broker.collectingCreditReportFee) row('  Credit Report Fee Amount', body.broker.creditReportFeeAmount || '—')
  row('3rd Party Processing Fee', body.broker.thirdPartyProcessingFee || '—')
  row('Has Title/Escrow Fee Sheet?', yn(body.broker.hasTitleEscrowSheet))
  row('Authorize TQL to Pull Smart Fees?', yn(body.broker.authorizeSmartFees))

  // ─── Pricing Adjustments (LLPAs) ───
  if (body.rate.adjustments && body.rate.adjustments.length > 0) {
    section('Pricing Adjustments (LLPAs)')
    for (const adj of body.rate.adjustments) {
      const amt = (adj.amount >= 0 ? '+' : '') + adj.amount.toFixed(3)
      row(adj.description.length > 50 ? adj.description.substring(0, 50) + '…' : adj.description, amt)
    }
    const net = body.rate.adjustments.reduce((s, a) => s + (a.amount || 0), 0)
    y -= 4
    page.drawText('Net LLPA', { x: margin, y, size: 10, font: helvBold, color: teal })
    page.drawText((net >= 0 ? '+' : '') + net.toFixed(3), { x: margin + 170, y, size: 10, font: helvBold, color: teal })
    y -= 16
  }

  // ─── Footer ───
  page.drawLine({ start: { x: margin, y: margin + 20 }, end: { x: width - margin, y: margin + 20 }, thickness: 0.6, color: rule })
  page.drawText('Total Quality Lending · Flash Submit · Confidential', { x: margin, y: margin + 6, size: 8, font: helv, color: muted })

  return await doc.save()
}

function buildEmailHtml(body: RequestBody): string {
  const b = body.broker
  const r = body.rate
  const s = body.scenario
  const adjustmentsRows = (r.adjustments || []).map(a => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#333;">${a.description}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:${a.amount >= 0 ? '#245F73' : '#EF4444'};text-align:right;font-weight:600;">${a.amount >= 0 ? '+' : ''}${a.amount.toFixed(3)}</td>
    </tr>
  `).join('')
  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#F5F4F1;margin:0;padding:24px;color:#0B1220;">
  <div style="max-width:680px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <div style="background:#245F73;color:white;padding:20px 24px;">
      <div style="font-size:18px;font-weight:700;letter-spacing:0.5px;">TQL FLASH SUBMIT</div>
      <div style="font-size:13px;opacity:0.9;margin-top:2px;">New Setup Request — Pricing locked in, ready for 3.4 upload</div>
    </div>

    <div style="padding:22px 24px;">
      <h3 style="margin:0 0 10px;font-size:13px;color:#245F73;border-bottom:1px solid #CBD5E1;padding-bottom:6px;">Request Details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:4px 0;color:#555;">Borrower's Last Name</td><td style="padding:4px 0;font-weight:600;">${b.borrowerLastName || '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Broker</td><td style="padding:4px 0;font-weight:600;">${b.brokerName || '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Email</td><td style="padding:4px 0;font-weight:600;">${b.brokerEmail || '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Submitting Company</td><td style="padding:4px 0;font-weight:600;">${b.companyName || '—'}</td></tr>
      </table>

      <h3 style="margin:18px 0 10px;font-size:13px;color:#245F73;border-bottom:1px solid #CBD5E1;padding-bottom:6px;">Selected Rate & Program</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:4px 0;color:#555;">Program</td><td style="padding:4px 0;font-weight:600;">${r.programName}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Rate</td><td style="padding:4px 0;font-weight:600;">${r.rate.toFixed(3)}%</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Price</td><td style="padding:4px 0;font-weight:600;">${r.price.toFixed(3)}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">APR</td><td style="padding:4px 0;font-weight:600;">${r.apr.toFixed(3)}%</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Payment</td><td style="padding:4px 0;font-weight:600;">${r.payment > 0 ? '$' + r.payment.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</td></tr>
        ${r.lockPeriod ? `<tr><td style="padding:4px 0;color:#555;">Lock Period</td><td style="padding:4px 0;font-weight:600;">${r.lockPeriod} days</td></tr>` : ''}
      </table>

      <h3 style="margin:18px 0 10px;font-size:13px;color:#245F73;border-bottom:1px solid #CBD5E1;padding-bottom:6px;">Loan Scenario</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:4px 0;color:#555;">Loan Amount</td><td style="padding:4px 0;font-weight:600;">$${Number(String(s.loanAmount).replace(/[^\d.-]/g, '')).toLocaleString()}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Property Value</td><td style="padding:4px 0;font-weight:600;">$${Number(String(s.propertyValue).replace(/[^\d.-]/g, '')).toLocaleString()}</td></tr>
        ${s.propertyCity ? `<tr><td style="padding:4px 0;color:#555;">Property</td><td style="padding:4px 0;font-weight:600;">${[s.propertyCity, s.propertyState, s.propertyZip].filter(Boolean).join(', ')}</td></tr>` : ''}
        ${s.occupancyType ? `<tr><td style="padding:4px 0;color:#555;">Occupancy</td><td style="padding:4px 0;font-weight:600;">${s.occupancyType}</td></tr>` : ''}
        ${s.loanPurpose ? `<tr><td style="padding:4px 0;color:#555;">Loan Purpose</td><td style="padding:4px 0;font-weight:600;">${s.loanPurpose}</td></tr>` : ''}
        ${s.loanTerm ? `<tr><td style="padding:4px 0;color:#555;">Term</td><td style="padding:4px 0;font-weight:600;">${s.loanTerm}yr ${s.amortization || ''}</td></tr>` : ''}
        ${s.documentationType ? `<tr><td style="padding:4px 0;color:#555;">Doc Type</td><td style="padding:4px 0;font-weight:600;">${s.documentationType}</td></tr>` : ''}
        ${s.creditScore ? `<tr><td style="padding:4px 0;color:#555;">FICO</td><td style="padding:4px 0;font-weight:600;">${s.creditScore}</td></tr>` : ''}
        ${s.dti ? `<tr><td style="padding:4px 0;color:#555;">DTI</td><td style="padding:4px 0;font-weight:600;">${s.dti}%</td></tr>` : ''}
        ${s.prepayPeriod && s.isInvestment ? `<tr><td style="padding:4px 0;color:#555;">Prepay Period</td><td style="padding:4px 0;font-weight:600;">${s.prepayPeriod}</td></tr>` : ''}
      </table>

      <h3 style="margin:18px 0 10px;font-size:13px;color:#245F73;border-bottom:1px solid #CBD5E1;padding-bottom:6px;">Broker Fees & Authorizations</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:4px 0;color:#555;">Broker Origination Charge</td><td style="padding:4px 0;font-weight:600;">${b.originationCharge || '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Charging Processing Fee?</td><td style="padding:4px 0;font-weight:600;">${yn(b.chargingProcessingFee)}${b.chargingProcessingFee && b.processingFeeAmount ? ` — ${b.processingFeeAmount}` : ''}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Collecting Credit Report Fee?</td><td style="padding:4px 0;font-weight:600;">${yn(b.collectingCreditReportFee)}${b.collectingCreditReportFee && b.creditReportFeeAmount ? ` — ${b.creditReportFeeAmount}` : ''}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">3rd Party Processing Fee</td><td style="padding:4px 0;font-weight:600;">${b.thirdPartyProcessingFee || '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Title/Escrow Fee Sheet Provided?</td><td style="padding:4px 0;font-weight:600;">${yn(b.hasTitleEscrowSheet)}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Authorize TQL to Pull Smart Fees?</td><td style="padding:4px 0;font-weight:600;">${yn(b.authorizeSmartFees)}</td></tr>
      </table>

      ${adjustmentsRows ? `
      <h3 style="margin:18px 0 10px;font-size:13px;color:#245F73;border-bottom:1px solid #CBD5E1;padding-bottom:6px;">Pricing Adjustments (LLPAs)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">${adjustmentsRows}</table>
      ` : ''}

      <div style="margin-top:22px;padding:14px 16px;background:#F5F4F1;border-radius:8px;font-size:12px;color:#4D4D4D;">
        A full PDF summary is attached. This submission is now ready for 3.4 upload to Encompass.
      </div>
    </div>

    <div style="padding:14px 24px;border-top:1px solid #CBD5E1;font-size:11px;color:#4D4D4D;">
      Total Quality Lending · Flash Submit · sent to disclosuredesk@tqlend.com
    </div>
  </div>
</body></html>
`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'Resend API key not configured' })
  }

  try {
    const body = req.body as RequestBody
    if (!body?.broker || !body?.rate || !body?.scenario) {
      return res.status(400).json({ success: false, error: 'Missing broker, rate, or scenario data' })
    }

    // Build PDF attachment
    const pdfBytes = await buildPDF(body)
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64')

    const subject = `New Flash Submit Setup Request: ${body.broker.borrowerLastName || '—'}, ${body.broker.brokerName || '—'}, with ${body.broker.companyName || '—'}`
    const html = buildEmailHtml(body)

    const filename = `FlashSubmit-${(body.broker.borrowerLastName || 'Setup').replace(/[^A-Za-z0-9]/g, '')}-${Date.now()}.pdf`
    const cc = body.broker.brokerEmail ? [body.broker.brokerEmail] : []

    const resp = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'TQL TotalPricer <TQLQuote@tqltpo.com>',
        to: ['disclosuredesk@tqlend.com'],
        cc,
        subject,
        html,
        attachments: [{ filename, content: pdfBase64 }],
      }),
    })
    const data = await resp.json()
    if (!resp.ok) {
      return res.status(resp.status).json({ success: false, error: data.message || 'Failed to send email', details: data })
    }

    return res.status(200).json({ success: true, id: data.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ success: false, error: message })
  }
}
