import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib'

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

// ── TQL 2026 Brand Palette ──
const COLOR = {
  canvas:    rgb(0.980, 0.980, 0.973),  // #FAFAF8 Soft Canvas
  white:     rgb(1, 1, 1),
  ink:       rgb(0.043, 0.071, 0.125),  // #0B1220 Primary Text
  navy:      rgb(0.058, 0.090, 0.165),  // #0F172A Mortgage Navy
  teal:      rgb(0.141, 0.372, 0.451),  // #245F73 AI Teal
  sky:       rgb(0.219, 0.741, 0.972),  // #38BDF8 Sky Signal
  link:      rgb(0.129, 0.502, 0.811),  // #2180CF Trust Blue
  card:      rgb(0.972, 0.980, 0.988),  // #F8FAFC Cloud
  rule:      rgb(0.796, 0.835, 0.882),  // #CBD5E1 Steel
  slate:     rgb(0.200, 0.255, 0.333),  // #334155 Secondary Slate
  muted:     rgb(0.302, 0.302, 0.302),  // #4D4D4D Muted
  red:       rgb(0.937, 0.267, 0.267),  // #EF4444
  headerSubtle: rgb(0.82, 0.93, 0.96),  // muted sky on teal band
}

function fmtMoney(n: string | number | undefined): string {
  if (n === undefined || n === '' || n === null) return '—'
  const num = typeof n === 'string' ? parseFloat(String(n).replace(/[^\d.-]/g, '')) : n
  return isFinite(num) ? `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  const ell = '…'
  let s = text
  while (s.length > 1 && font.widthOfTextAtSize(s + ell, size) > maxWidth) s = s.slice(0, -1)
  return s + ell
}

async function buildPDF(body: RequestBody): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`TQL Rate Quote · ${body.rate.programName}`)
  doc.setAuthor('Total Quality Lending')
  doc.setCreator('TQL TotalPricer')

  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const PAGE_W = 612
  const PAGE_H = 792
  const MARGIN = 44
  const CONTENT_W = PAGE_W - MARGIN * 2

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H

  // ─────────── helpers ───────────
  const drawText = (
    p: PDFPage, text: string, x: number, baseline: number,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; alignRight?: number; letterSpacing?: number } = {}
  ) => {
    const size = opts.size ?? 10
    const font = opts.bold ? helvBold : helv
    const color = opts.color ?? COLOR.ink
    let drawX = x
    if (typeof opts.alignRight === 'number') {
      drawX = opts.alignRight - font.widthOfTextAtSize(text, size)
    }
    if (opts.letterSpacing) {
      let cursor = drawX
      for (const ch of text) {
        p.drawText(ch, { x: cursor, y: baseline, size, font, color })
        cursor += font.widthOfTextAtSize(ch, size) + opts.letterSpacing
      }
    } else {
      p.drawText(text, { x: drawX, y: baseline, size, font, color })
    }
  }

  // Draw the TQL TPO logo (white) on the header band — house glyph + wordmark.
  // Native vector primitives so it stays crisp at any zoom and adds no bytes.
  const drawLogo = (p: PDFPage, x: number, baseY: number) => {
    const COLOR_W = COLOR.white
    // ── House glyph ──  ~22w x 22h
    const gx = x
    const gy = baseY                // baseline of base rect
    const W = 22
    const H = 18
    // Roof line: triangle peak via two lines (stroke width 2)
    p.drawLine({ start: { x: gx,         y: gy + H * 0.55 }, end:   { x: gx + W / 2, y: gy + H }, thickness: 2.0, color: COLOR_W })
    p.drawLine({ start: { x: gx + W / 2, y: gy + H        }, end:   { x: gx + W,     y: gy + H * 0.55 }, thickness: 2.0, color: COLOR_W })
    // House left/right walls
    p.drawLine({ start: { x: gx,         y: gy + H * 0.55 }, end:   { x: gx,         y: gy }, thickness: 2.0, color: COLOR_W })
    p.drawLine({ start: { x: gx + W,     y: gy + H * 0.55 }, end:   { x: gx + W,     y: gy }, thickness: 2.0, color: COLOR_W })
    // Floor
    p.drawLine({ start: { x: gx,         y: gy            }, end:   { x: gx + W,     y: gy }, thickness: 2.0, color: COLOR_W })
    // Door (centered small rect)
    const doorW = 5, doorH = 8
    p.drawLine({ start: { x: gx + W / 2 - doorW / 2, y: gy            }, end:   { x: gx + W / 2 - doorW / 2, y: gy + doorH }, thickness: 1.6, color: COLOR_W })
    p.drawLine({ start: { x: gx + W / 2 + doorW / 2, y: gy            }, end:   { x: gx + W / 2 + doorW / 2, y: gy + doorH }, thickness: 1.6, color: COLOR_W })
    p.drawLine({ start: { x: gx + W / 2 - doorW / 2, y: gy + doorH    }, end:   { x: gx + W / 2 + doorW / 2, y: gy + doorH }, thickness: 1.6, color: COLOR_W })

    // ── Wordmark "TQL TPO" ──
    drawText(p, 'TQL TPO', gx + W + 10, gy + 2, { size: 20, bold: true, color: COLOR_W, letterSpacing: 1.6 })
  }

  const drawFooter = (p: PDFPage, pageNum: number, totalPages: number) => {
    const fy = MARGIN - 10
    p.drawLine({ start: { x: MARGIN, y: fy + 14 }, end: { x: PAGE_W - MARGIN, y: fy + 14 }, thickness: 0.4, color: COLOR.rule })
    drawText(
      p,
      'INTENDED FOR MORTGAGE PROFESSIONALS ONLY · TOTAL QUALITY LENDING · TotalPricer · RATES SUBJECT TO CHANGE',
      MARGIN, fy,
      { size: 7, color: COLOR.muted, letterSpacing: 0.4 }
    )
    drawText(p, `Page ${pageNum} of ${totalPages}`, 0, fy, { size: 7, color: COLOR.muted, alignRight: PAGE_W - MARGIN, bold: true, letterSpacing: 0.4 })
  }

  // Header band (used on first page + continuation pages)
  const HEADER_H = 92
  const drawHeader = (p: PDFPage, opts: { continued?: boolean } = {}) => {
    p.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: COLOR.teal })
    p.drawRectangle({ x: 0, y: PAGE_H - HEADER_H - 3, width: PAGE_W, height: 3, color: COLOR.sky })
    // Logo (top-left)
    drawLogo(p, MARGIN, PAGE_H - 38)
    // Program title under the logo
    const programTitle = fitText(
      opts.continued ? `${body.rate.programName} — continued` : body.rate.programName,
      helvBold, 14, CONTENT_W - 200
    )
    drawText(p, programTitle, MARGIN, PAGE_H - 70, { size: 14, bold: true, color: COLOR.white })

    // Right column — date + confidential flag
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    drawText(p, dateStr, 0, PAGE_H - 38, { size: 9, color: COLOR.headerSubtle, alignRight: PAGE_W - MARGIN })
    drawText(p, 'CONFIDENTIAL · TPO PRICING', 0, PAGE_H - 56, { size: 8, color: COLOR.headerSubtle, alignRight: PAGE_W - MARGIN, letterSpacing: 1.5 })
  }

  drawHeader(page)
  y = PAGE_H - HEADER_H - 32

  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H; drawHeader(page, { continued: true }); y = PAGE_H - HEADER_H - 32 }
  const ensureRoom = (h: number) => {
    if (y - h < MARGIN + 26) {
      newPage()
    }
  }

  // ─────────── HERO STATS CARD: 3 columns INTEREST RATE | FINAL PRICE | MONTHLY P&I ───────────
  ensureRoom(86)
  const statsH = 70
  page.drawRectangle({ x: MARGIN, y: y - statsH, width: CONTENT_W, height: statsH, color: COLOR.canvas, borderColor: COLOR.rule, borderWidth: 0.6, opacity: 1 })
  // 2 vertical dividers split into 3 columns
  const colW = CONTENT_W / 3
  page.drawLine({ start: { x: MARGIN + colW, y: y - 10 }, end: { x: MARGIN + colW, y: y - statsH + 10 }, thickness: 0.5, color: COLOR.rule })
  page.drawLine({ start: { x: MARGIN + colW * 2, y: y - 10 }, end: { x: MARGIN + colW * 2, y: y - statsH + 10 }, thickness: 0.5, color: COLOR.rule })

  const STAT_LABEL_GAP = 16
  // RATE
  const rateStr = body.rate.rate.toFixed(3)
  drawText(page, rateStr, MARGIN + 22, y - 32, { size: 28, bold: true, color: COLOR.ink })
  drawText(page, 'INTEREST RATE', MARGIN + 22, y - 32 - STAT_LABEL_GAP, { size: 8, bold: true, color: COLOR.muted, letterSpacing: 1.5 })
  // PRICE
  const priceStr = body.rate.price.toFixed(3)
  drawText(page, priceStr, MARGIN + colW + 22, y - 32, { size: 28, bold: true, color: COLOR.ink })
  drawText(page, 'FINAL PRICE', MARGIN + colW + 22, y - 32 - STAT_LABEL_GAP, { size: 8, bold: true, color: COLOR.muted, letterSpacing: 1.5 })
  // P&I
  const piStr = body.rate.payment > 0 ? fmtMoney(body.rate.payment) : '—'
  drawText(page, piStr, MARGIN + colW * 2 + 22, y - 32, { size: 28, bold: true, color: COLOR.ink })
  drawText(page, 'MONTHLY P&I', MARGIN + colW * 2 + 22, y - 32 - STAT_LABEL_GAP, { size: 8, bold: true, color: COLOR.muted, letterSpacing: 1.5 })

  y -= statsH + 28

  // ─────────── SCENARIO ───────────
  const scenarioRows: Array<[string, string]> = [
    ['Loan Amount', fmtMoney(body.scenario.loanAmount)],
    ['Property Value', fmtMoney(body.scenario.propertyValue)],
  ]
  const propertyLine = [body.scenario.propertyCity, body.scenario.propertyState, body.scenario.propertyZip].filter(Boolean).join(', ')
  if (propertyLine) scenarioRows.push(['Property', propertyLine])
  if (body.scenario.propertyCounty) scenarioRows.push(['County', body.scenario.propertyCounty])
  if (body.scenario.loanTerm) scenarioRows.push(['Term · Amort', `${body.scenario.loanTerm}yr ${body.scenario.amortization || ''}`.trim()])
  if (body.scenario.documentationType) scenarioRows.push(['Doc Type', String(body.scenario.documentationType)])
  if (body.scenario.creditScore) scenarioRows.push(['FICO', String(body.scenario.creditScore)])
  if (body.rate.lockPeriod) scenarioRows.push(['Lock Period', `${body.rate.lockPeriod} days`])

  ensureRoom(28 + scenarioRows.length * 18)
  drawText(page, 'SCENARIO', MARGIN, y, { size: 10, bold: true, color: COLOR.teal, letterSpacing: 1.6 })
  page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: PAGE_W - MARGIN, y: y - 6 }, thickness: 0.6, color: COLOR.rule })
  y -= 22

  for (let i = 0; i < scenarioRows.length; i++) {
    ensureRoom(18)
    const [label, value] = scenarioRows[i]
    if (i % 2 === 0) {
      page.drawRectangle({ x: MARGIN, y: y - 5, width: CONTENT_W, height: 18, color: COLOR.card })
    }
    drawText(page, label, MARGIN + 10, y, { size: 10, color: COLOR.slate })
    const fittedValue = fitText(value, helvBold, 10, CONTENT_W * 0.55)
    drawText(page, fittedValue, 0, y, { size: 10, bold: true, color: COLOR.ink, alignRight: PAGE_W - MARGIN - 10 })
    y -= 18
  }
  y -= 22

  // ─────────── ALL RATE / PRICE OPTIONS ───────────
  if (Array.isArray(body.rateStack) && body.rateStack.length > 0) {
    // Dedupe + sort
    const seen = new Set<string>()
    const stack = body.rateStack
      .filter(r => {
        const k = `${r.programName}|${r.rate.toFixed(3)}|${r.price.toFixed(3)}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .sort((a, b) => a.rate - b.rate || b.price - a.price)

    ensureRoom(46)
    drawText(page, 'ALL RATE / PRICE OPTIONS', MARGIN, y, { size: 10, bold: true, color: COLOR.teal, letterSpacing: 1.6 })
    page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: PAGE_W - MARGIN, y: y - 6 }, thickness: 0.6, color: COLOR.rule })
    y -= 22

    // Column geometry — inset 14px on each side so text never sits flush
    // against the shaded row edge.
    const TABLE_INSET = 14
    const COL_PROGRAM = MARGIN + TABLE_INSET
    const COL_PMT_R = PAGE_W - MARGIN - TABLE_INSET
    const COL_APR_R = COL_PMT_R - 78
    const COL_PRICE_R = COL_APR_R - 70
    const COL_RATE_R = COL_PRICE_R - 70
    const ROW_H = 20

    const drawTableHeader = () => {
      // Header row band — sits ABOVE the y baseline so it never overlaps the
      // section title above it.
      page.drawRectangle({ x: MARGIN, y: y - 6, width: CONTENT_W, height: 22, color: COLOR.canvas })
      // Bottom rule of the header
      page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: PAGE_W - MARGIN, y: y - 6 }, thickness: 0.6, color: COLOR.rule })
      drawText(page, 'PROGRAM/PPP', COL_PROGRAM, y, { size: 8, bold: true, color: COLOR.teal, letterSpacing: 1.4 })
      drawText(page, 'RATE',    0, y, { size: 8, bold: true, color: COLOR.teal, letterSpacing: 1.4, alignRight: COL_RATE_R })
      drawText(page, 'PRICE',   0, y, { size: 8, bold: true, color: COLOR.teal, letterSpacing: 1.4, alignRight: COL_PRICE_R })
      drawText(page, 'APR',     0, y, { size: 8, bold: true, color: COLOR.teal, letterSpacing: 1.4, alignRight: COL_APR_R })
      drawText(page, 'PAYMENT', 0, y, { size: 8, bold: true, color: COLOR.teal, letterSpacing: 1.4, alignRight: COL_PMT_R })
      y -= 22
    }
    drawTableHeader()

    let rowIndex = 0
    for (const r of stack) {
      if (y - ROW_H < MARGIN + 26) {
        newPage()
        drawText(page, 'ALL RATE / PRICE OPTIONS (cont.)', MARGIN, y, { size: 10, bold: true, color: COLOR.teal, letterSpacing: 1.6 })
        page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: PAGE_W - MARGIN, y: y - 6 }, thickness: 0.6, color: COLOR.rule })
        y -= 22
        drawTableHeader()
      }

      // Alternating row tint — sits flush behind the row text, height === ROW_H
      if (rowIndex % 2 === 1) {
        page.drawRectangle({ x: MARGIN, y: y - 6, width: CONTENT_W, height: ROW_H, color: COLOR.card })
      }

      const fittedProgram = fitText(r.programName, helv, 10, COL_RATE_R - COL_PROGRAM - 18)
      drawText(page, fittedProgram, COL_PROGRAM, y, { size: 10, color: COLOR.slate })
      drawText(page, `${r.rate.toFixed(3)}%`, 0, y, { size: 10.5, bold: true, color: COLOR.ink, alignRight: COL_RATE_R })
      drawText(page, r.price.toFixed(3), 0, y, { size: 10.5, bold: true, color: r.price >= 100 ? COLOR.link : COLOR.ink, alignRight: COL_PRICE_R })
      drawText(page, `${r.apr.toFixed(3)}%`, 0, y, { size: 10, color: COLOR.slate, alignRight: COL_APR_R })
      drawText(page, r.payment > 0 ? fmtMoney(r.payment) : '—', 0, y, { size: 10.5, bold: true, color: COLOR.ink, alignRight: COL_PMT_R })

      // Bottom rule of the row
      page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: PAGE_W - MARGIN, y: y - 6 }, thickness: 0.3, color: COLOR.rule })
      y -= ROW_H
      rowIndex++
    }
  }

  // ─────────── tqltpo.com mark, bottom-right above the footer ───────────
  // Push down to baseline area above footer rule.
  drawText(page, 'tqltpo.com', 0, MARGIN + 16, { size: 22, bold: true, color: COLOR.teal, alignRight: PAGE_W - MARGIN, letterSpacing: 0.5 })

  // ─────────── FOOTER on every page ───────────
  const pages = doc.getPages()
  pages.forEach((p, idx) => drawFooter(p, idx + 1, pages.length))

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
