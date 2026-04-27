import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

interface RateOption {
  programName: string
  rate: number
  price: number
  apr: number
  payment: number
  lockPeriod?: number | string
}

interface RequestBody {
  rate: RateOption
  scenario: {
    loanAmount?: string | number
    propertyValue?: string | number
    propertyState?: string
    propertyZip?: string
    propertyCity?: string
    propertyCounty?: string
    loanTerm?: string
    amortization?: string
    documentationType?: string
    creditScore?: string | number
    lockPeriod?: string
  }
  rateStack?: Array<{ programName: string; rate: number; price: number; apr: number; payment: number }>
}

function fmtMoney(n: string | number | undefined): string {
  if (n === undefined || n === '' || n === null) return '—'
  const num = typeof n === 'string' ? parseFloat(String(n).replace(/[^\d.-]/g, '')) : n
  return isFinite(num) ? `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'
}

async function buildPDF(body: RequestBody): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)

  // TQL palette
  const teal = rgb(0.141, 0.372, 0.451)         // #245F73
  const ink = rgb(0.043, 0.071, 0.125)          // #0B1220
  const muted = rgb(0.302, 0.302, 0.302)        // #4D4D4D
  const rule = rgb(0.796, 0.835, 0.882)         // #CBD5E1
  const canvas = rgb(0.980, 0.980, 0.973)       // #FAFAF8

  const margin = 48
  const pageSize: [number, number] = [612, 792] // US Letter
  let page = doc.addPage(pageSize)
  const { width } = page.getSize()
  let y = pageSize[1] - margin

  const newPage = () => { page = doc.addPage(pageSize); y = pageSize[1] - margin }
  const ensureSpace = (h: number) => { if (y - h < margin + 30) newPage() }

  // ── Header band ──
  page.drawRectangle({ x: 0, y: y - 8, width, height: 64, color: teal })
  page.drawText('TQL · RATE QUOTE', { x: margin, y: y + 28, size: 11, font: helvBold, color: rgb(1, 1, 1) })
  page.drawText(body.rate.programName, { x: margin, y: y + 12, size: 18, font: helvBold, color: rgb(1, 1, 1) })
  page.drawText(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), {
    x: width - margin - 130, y: y + 28, size: 9, font: helv, color: rgb(0.85, 0.92, 0.95),
  })
  y -= 70

  // ── Hero rate / price ──
  ensureSpace(70)
  page.drawText(`${body.rate.rate.toFixed(3)}`, { x: margin, y: y - 18, size: 36, font: helvBold, color: ink })
  page.drawText('%', { x: margin + 86, y: y - 8, size: 18, font: helvBold, color: teal })
  page.drawText('INTEREST RATE', { x: margin, y: y - 36, size: 9, font: helvBold, color: muted })

  const priceColor = body.rate.price >= 100 ? teal : ink
  const priceStr = body.rate.price.toFixed(3)
  const priceWidth = helvBold.widthOfTextAtSize(priceStr, 36)
  page.drawText(priceStr, { x: width - margin - priceWidth, y: y - 18, size: 36, font: helvBold, color: priceColor })
  const lblPrice = 'FINAL PRICE'
  const lblPriceWidth = helvBold.widthOfTextAtSize(lblPrice, 9)
  page.drawText(lblPrice, { x: width - margin - lblPriceWidth, y: y - 36, size: 9, font: helvBold, color: muted })
  y -= 60

  // ── Stats: APR + P&I ──
  ensureSpace(60)
  page.drawRectangle({ x: margin, y: y - 44, width: width - margin * 2, height: 50, color: canvas })
  page.drawText(`${body.rate.apr.toFixed(3)}%`, { x: margin + 18, y: y - 14, size: 16, font: helvBold, color: ink })
  page.drawText('APR', { x: margin + 18, y: y - 32, size: 8, font: helvBold, color: muted })
  page.drawLine({ start: { x: width / 2, y: y - 4 }, end: { x: width / 2, y: y - 40 }, thickness: 0.5, color: rule })
  const piStr = body.rate.payment > 0 ? fmtMoney(body.rate.payment) : '—'
  const piWidth = helvBold.widthOfTextAtSize(piStr, 16)
  page.drawText(piStr, { x: width - margin - 18 - piWidth, y: y - 14, size: 16, font: helvBold, color: ink })
  const piLbl = 'MONTHLY P&I'
  const piLblWidth = helvBold.widthOfTextAtSize(piLbl, 8)
  page.drawText(piLbl, { x: width - margin - 18 - piLblWidth, y: y - 32, size: 8, font: helvBold, color: muted })
  y -= 60

  // ── Scenario ──
  ensureSpace(20)
  page.drawText('SCENARIO', { x: margin, y, size: 10, font: helvBold, color: teal })
  page.drawLine({ start: { x: margin, y: y - 4 }, end: { x: width - margin, y: y - 4 }, thickness: 0.6, color: rule })
  y -= 18
  const propertyLine = [body.scenario.propertyCity, body.scenario.propertyState, body.scenario.propertyZip].filter(Boolean).join(', ')
  const rows: Array<[string, string]> = [
    ['Loan Amount', fmtMoney(body.scenario.loanAmount)],
    ['Property Value', fmtMoney(body.scenario.propertyValue)],
  ]
  if (propertyLine) rows.push(['Property', propertyLine])
  if (body.scenario.propertyCounty) rows.push(['County', body.scenario.propertyCounty])
  if (body.scenario.loanTerm) rows.push(['Term · Amort', `${body.scenario.loanTerm}yr ${body.scenario.amortization || ''}`.trim()])
  if (body.scenario.documentationType) rows.push(['Doc Type', String(body.scenario.documentationType)])
  if (body.scenario.creditScore) rows.push(['FICO', String(body.scenario.creditScore)])
  if (body.rate.lockPeriod) rows.push(['Lock Period', `${body.rate.lockPeriod} days`])
  for (const [label, value] of rows) {
    ensureSpace(14)
    page.drawText(label, { x: margin, y, size: 10, font: helv, color: muted })
    const valWidth = helvBold.widthOfTextAtSize(value, 10)
    page.drawText(value, { x: width - margin - valWidth, y, size: 10, font: helvBold, color: ink })
    y -= 14
  }

  // ── All Rate / Price Options ──
  if (Array.isArray(body.rateStack) && body.rateStack.length > 0) {
    y -= 14
    ensureSpace(20)
    page.drawText('ALL RATE / PRICE OPTIONS', { x: margin, y, size: 10, font: helvBold, color: teal })
    page.drawLine({ start: { x: margin, y: y - 4 }, end: { x: width - margin, y: y - 4 }, thickness: 0.6, color: rule })
    y -= 16

    // Header row
    const colX = {
      program: margin,
      rate: width - margin - 280,
      price: width - margin - 210,
      apr: width - margin - 140,
      pi: width - margin - 70,
    }
    page.drawRectangle({ x: margin, y: y - 4, width: width - margin * 2, height: 16, color: canvas })
    page.drawText('PROGRAM', { x: colX.program + 2, y, size: 8, font: helvBold, color: teal })
    page.drawText('RATE', { x: colX.rate, y, size: 8, font: helvBold, color: teal })
    page.drawText('PRICE', { x: colX.price, y, size: 8, font: helvBold, color: teal })
    page.drawText('APR', { x: colX.apr, y, size: 8, font: helvBold, color: teal })
    page.drawText('P&I', { x: colX.pi, y, size: 8, font: helvBold, color: teal })
    y -= 14

    for (const r of body.rateStack) {
      ensureSpace(14)
      const truncProgram = r.programName.length > 42 ? r.programName.substring(0, 40) + '…' : r.programName
      page.drawText(truncProgram, { x: colX.program + 2, y, size: 9, font: helv, color: ink })
      const rateStr = `${r.rate.toFixed(3)}%`
      page.drawText(rateStr, { x: colX.rate, y, size: 9, font: helvBold, color: ink })
      const pStr = r.price.toFixed(3)
      page.drawText(pStr, { x: colX.price, y, size: 9, font: helvBold, color: r.price >= 100 ? teal : ink })
      page.drawText(`${r.apr.toFixed(3)}%`, { x: colX.apr, y, size: 9, font: helv, color: ink })
      const piVal = r.payment > 0 ? fmtMoney(r.payment) : '—'
      page.drawText(piVal, { x: colX.pi, y, size: 9, font: helv, color: ink })
      page.drawLine({ start: { x: margin, y: y - 4 }, end: { x: width - margin, y: y - 4 }, thickness: 0.3, color: rule })
      y -= 14
    }
  }

  // ── Footer on every page ──
  for (const p of doc.getPages()) {
    p.drawLine({ start: { x: margin, y: margin + 18 }, end: { x: pageSize[0] - margin, y: margin + 18 }, thickness: 0.5, color: rule })
    p.drawText(`Total Quality Lending · TotalPricer · Quote generated ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`, {
      x: margin, y: margin + 4, size: 8, font: helv, color: muted,
    })
  }

  return await doc.save()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }
  try {
    const body = req.body as RequestBody
    if (!body?.rate) {
      return res.status(400).json({ success: false, error: 'Missing rate payload' })
    }
    const bytes = await buildPDF(body)
    const safeName = String(body.rate.programName || 'Rate-Quote').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const filename = `TQL-Quote-${safeName}-${body.rate.rate.toFixed(3)}-${body.rate.price.toFixed(3)}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).end(Buffer.from(bytes))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF generation failed'
    return res.status(500).json({ success: false, error: message })
  }
}
