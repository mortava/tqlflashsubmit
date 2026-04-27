import { useState, useEffect, useRef, useCallback, lazy, Suspense, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { DollarSign, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, X, Zap, Globe, ShieldCheck, Mail, LogOut, User, HelpCircle, Send, BarChart3, Menu, Sun, CheckCircle, GripHorizontal, Lock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { LoginPage } from '@/components/auth/LoginPage'
import { SignUpPage } from '@/components/auth/SignUpPage'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { validateFormBeforeSubmit } from '@/lib/PricingLogic'
import { ChatAdminPanel } from '@/components/chat-admin-panel'
const UserChatPage = lazy(() => import('@/pages/UserChatPage'))
const SubmitLoanPage = lazy(() => import('@/pages/SubmitLoanPage'))

/* ── Sidebar SVG Icons (currentColor for theme adaptability) ── */
const IconNewScenario = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <circle cx="11" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="11" y1="7" x2="11" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="6" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="20" cy="4" r="2" fill="currentColor"/>
  </svg>
)


const IconSubmitLoan = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <rect x="2" y="2" width="13" height="17" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="5" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="5" y1="11" x2="12" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="5" y1="14" x2="9" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="19" y1="22" x2="19" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <polyline points="15,17 19,13 23,17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)


const IconAtom = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <ellipse cx="12" cy="12" rx="10" ry="4.5" stroke="currentColor" strokeWidth="1.5" transform="rotate(-45 12 12)" />
    <ellipse cx="12" cy="12" rx="10" ry="4.5" stroke="currentColor" strokeWidth="1.5" transform="rotate(45 12 12)" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
)

interface LoanData {
  // Loan Information
  lienPosition: string
  ltv: string
  lockPeriod: string
  loanType: string
  loanPurpose: string
  cashoutAmount: string
  loanAmount: string
  propertyValue: string
  // Location
  propertyZip: string
  propertyState: string
  propertyCounty: string
  propertyCity: string
  // Property Details
  occupancyType: string
  propertyType: string
  structureType: string
  isRuralProperty: boolean
  isNonWarrantableProject: boolean
  // Borrower Details
  creditScore: string
  isSelfEmployed: boolean
  dti: string
  citizenship: string
  isFTHB: boolean
  // Loan Terms
  loanTerm: string
  amortization: string
  product: string
  paymentType: string
  impoundType: string
  // Investor Details (conditional)
  prepayPeriod: string
  prepayType: string
  dscrEntityType: string
  dscrRatio: string
  dscrManualInput: string
  presentHousingExpense: string
  grossRent: string
  // Other Details
  isSeasonalProperty: boolean
  loanOriginatorPaidBy: string
  temporaryBuydowns: string
  isCrossCollateralized: boolean
  isMixedUsePML: boolean
  is5PlusUnits: boolean
  isShortTermRental: boolean
  isVestedInLLCOrCorp: boolean
  hasITIN: boolean
  documentationType: string
}

interface Adjustment {
  description: string
  amount: number      // Price adjustment (e.g., -1.500, 0.500)
  rateAdj?: number    // Rate adjustment (e.g., 0.000%, 0.125%)
  percentage?: number // Alternative rate field
}

interface RateOption {
  rate: number
  points: number
  apr: number
  description: string
  price?: number
  payment?: number
  miMonthlyPayment?: number
  totalClosingCost?: number
  prepaidClosingCost?: number
  nonPrepaidClosingCost?: number
  margin?: number
  dti?: number
  investorName?: string
  breakEven?: string
  reserves?: string
  lenderPaidComp?: number
  lenderPaidCompAmount?: number
  pitia?: number
  qualRate?: number
  qualPmt?: number
  cashToClose?: number
  status?: string
  lockPeriod?: number | string
  adjustments?: Adjustment[]
}

interface Program {
  name: string                 // masked, broker-facing program name (always "TQL - …")
  rawName?: string             // ADMIN-ONLY — original investor productName
  rawInvestor?: string         // ADMIN-ONLY — original lender brand
  status?: string
  term?: number
  due?: number
  productType?: string
  finMethT?: string
  parRate?: number
  parPoints?: number
  armIndex?: number
  armIndexName?: string
  rateOptions: RateOption[]
}

interface PricingResult {
  rate: number
  apr: number
  monthlyPayment: number
  points: number
  closingCosts: number
  ltvRatio: number
  source?: string
  programs?: Program[]
  apiError?: string
  totalPrograms?: number
  filterApplied?: string
  debug?: {
    rawProgramsFound: number
    rawRateOptionsFound: number
    formattedProgramsCount: number
    hasPricingResultsField: boolean
    xmlPreview: string
    pricingResultsPreview?: string
  }
}

type ValidationErrors = Partial<Record<keyof LoanData, string>>

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

const REQUIRED_FIELDS: (keyof LoanData)[] = ['loanPurpose', 'loanAmount', 'propertyValue', 'propertyZip', 'propertyState', 'propertyType', 'occupancyType', 'creditScore', 'dti', 'loanTerm']

const FIELD_LABELS: Record<string, string> = {
  lienPosition: 'Lien Position', loanType: 'Loan Type', loanPurpose: 'Loan Purpose', loanAmount: 'Loan Amount',
  propertyValue: 'Home Value/Sales Price', propertyZip: 'ZIP Code', propertyState: 'State', propertyCounty: 'County',
  propertyCity: 'City', propertyType: 'Property Type', occupancyType: 'Property Use', creditScore: 'Credit Score',
  dti: 'DTI', loanTerm: 'Loan Term', cashoutAmount: 'Cashout Amount', structureType: 'Structure Type',
  amortization: 'Amortization', product: 'Product', paymentType: 'Payment', impoundType: 'Impound Type'
}

// ZIP code to location lookup cache (auto-populated from API + preset values)
const ZIP_LOOKUP: Record<string, { city: string; county: string; state: string }> = {
  '90210': { city: 'Beverly Hills', county: 'Los Angeles', state: 'CA' },
  '90120': { city: 'Beverly Hills', county: 'Los Angeles', state: 'CA' },
  '10001': { city: 'New York', county: 'New York', state: 'NY' },
  '33101': { city: 'Miami', county: 'Miami-Dade', state: 'FL' },
  '60601': { city: 'Chicago', county: 'Cook', state: 'IL' },
  '75201': { city: 'Dallas', county: 'Dallas', state: 'TX' },
  '85001': { city: 'Phoenix', county: 'Maricopa', state: 'AZ' },
  '98101': { city: 'Seattle', county: 'King', state: 'WA' },
}

// Helper to safely format numbers with fallback
const safeNumber = (value: unknown, fallback: number = 0): number => {
  if (typeof value === 'number' && !isNaN(value)) return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    if (!isNaN(parsed)) return parsed
  }
  return fallback
}

// Sanitize and validate pricing result from API
const sanitizePricingResult = (data: unknown): PricingResult | null => {
  if (!data || typeof data !== 'object') return null

  const raw = data as Record<string, unknown>

  // Sanitize programs array — map both ML and OB field names
  let programs: Program[] | undefined
  if (Array.isArray(raw.programs)) {
    programs = raw.programs
      .filter((p): p is Record<string, unknown> => p && typeof p === 'object')
      .map(p => ({
        name: String(p.name || 'Unknown Program'),
        // Preserve admin-only raw fields so the User Admin reveal works.
        rawName: typeof p.rawName === 'string' ? p.rawName : undefined,
        rawInvestor: typeof p.rawInvestor === 'string' ? p.rawInvestor : undefined,
        parRate: safeNumber(p.parRate || p.rate),
        parPoints: safeNumber(p.parPoints || p.price),
        rateOptions: Array.isArray(p.rateOptions)
          ? p.rateOptions
              .filter((o): o is Record<string, unknown> => o && typeof o === 'object')
              .map(o => ({
                rate: safeNumber(o.rate),
                points: safeNumber(o.points || o.price),
                apr: safeNumber(o.apr),
                description: String(o.description || ''),
                payment: safeNumber(o.payment),
                lockPeriod: typeof o.lockPeriod === 'number' || typeof o.lockPeriod === 'string' ? o.lockPeriod : undefined,
                adjustments: Array.isArray(o.adjustments) ? o.adjustments.map((adj: any) => ({
                  description: String(adj.description || ''),
                  amount: safeNumber(adj.amount),
                  rateAdj: safeNumber(adj.rateAdj)
                })) : []
              }))
          : []
      }))
  }

  // Derive best rate from programs (OB doesn't return top-level rate/apr)
  let bestRate = safeNumber(raw.rate, 0)
  let bestApr = safeNumber(raw.apr, 0)
  let bestPayment = safeNumber(raw.monthlyPayment || raw.payment, 0)
  let bestPoints = safeNumber(raw.points, 0)

  if (programs && programs.length > 0 && bestRate === 0) {
    let closestDist = Infinity
    for (const prog of programs) {
      for (const opt of prog.rateOptions) {
        const pts = safeNumber(opt.points)
        const price = pts > 50 ? pts : 100 - pts
        const dist = Math.abs(price - 100)
        if (dist < closestDist && opt.rate > 0) {
          closestDist = dist
          bestRate = opt.rate
          bestApr = opt.apr || opt.rate
          bestPayment = opt.payment || 0
          bestPoints = opt.points || 0
        }
      }
    }
  }

  return {
    rate: bestRate,
    apr: bestApr,
    monthlyPayment: bestPayment,
    points: bestPoints,
    closingCosts: safeNumber(raw.closingCosts, 0),
    ltvRatio: safeNumber(raw.ltv || raw.ltvRatio, 0),
    source: typeof raw.source === 'string' ? raw.source : undefined,
    programs,
    apiError: typeof raw.apiError === 'string' ? raw.apiError : undefined,
    totalPrograms: typeof raw.totalPrograms === 'number' ? raw.totalPrograms : (programs?.length || undefined),
    filterApplied: typeof raw.filterApplied === 'string' ? raw.filterApplied : undefined
  }
}

const DEFAULT_FORM_DATA: LoanData = {
  lienPosition: '1st',
  ltv: '75',
  lockPeriod: '30',
  loanType: 'nonqm',
  loanPurpose: 'purchase',
  cashoutAmount: '',
  loanAmount: '600,000',
  propertyValue: '800,000',
  propertyZip: '90210',
  propertyState: 'CA',
  propertyCounty: 'Los Angeles',
  propertyCity: 'Beverly Hills',
  occupancyType: 'primary',
  propertyType: 'sfr',
  structureType: 'detached',
  isRuralProperty: false,
  isNonWarrantableProject: false,
  creditScore: '740',
  isSelfEmployed: true,
  dti: '36',
  citizenship: 'usCitizen',
  isFTHB: false,
  loanTerm: '30',
  amortization: 'fixed',
  product: 'conventional',
  paymentType: 'pi',
  impoundType: 'escrowed',
  prepayPeriod: '36mo',
  prepayType: '3pct',
  dscrEntityType: 'individual',
  dscrRatio: '1.00-1.149',
  dscrManualInput: '1.000',
  presentHousingExpense: '5,000',
  grossRent: '5,000',
  isSeasonalProperty: false,
  loanOriginatorPaidBy: 'borrower',
  temporaryBuydowns: 'none',
  isCrossCollateralized: false,
  isMixedUsePML: false,
  is5PlusUnits: false,
  isShortTermRental: false,
  isVestedInLLCOrCorp: false,
  hasITIN: false,
  documentationType: 'fullDoc'
}

/* ── Draggable Floating Panel ── */
// Quinn AI badge — glowing "Q" in TQL Sky Signal #38BDF8.
// Used wherever the app should feel AI-driven (hero card, loading state, pills).
function QuinnGlow({ size = 18, withRing = true }: { size?: number; withRing?: boolean }) {
  const dim = `${size}px`
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: dim, height: dim }}>
      {withRing && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.55) 0%, rgba(56,189,248,0) 70%)', filter: 'blur(0.5px)' }}
        />
      )}
      <span
        className="relative font-extrabold tql-font-display"
        style={{
          color: '#38BDF8',
          fontSize: `${Math.round(size * 0.78)}px`,
          lineHeight: 1,
          textShadow: '0 0 6px rgba(56,189,248,0.55), 0 0 12px rgba(56,189,248,0.25)',
          letterSpacing: '-0.02em',
        }}
      >Q</span>
    </span>
  )
}

// Builds a mobile-friendly TQL-branded HTML email for a single rate quote.
// Sent via /api/send-email; rendered inside common email clients (Gmail, Apple Mail, Outlook).
function buildRateQuoteEmail(
  rate: { programName: string; rate: number; price: number; apr: number; payment: number; lockPeriod?: number | string; adjustments?: Array<{ description: string; amount: number; rateAdj?: number }> },
  borrowerName: string,
  scenario: { loanAmount?: string; propertyValue?: string; propertyState?: string; propertyZip?: string; propertyCity?: string; loanTerm?: string; amortization?: string; documentationType?: string; creditScore?: string; lockPeriod?: string }
): string {
  const fmtMoney = (n: string | number | undefined) => {
    if (n === undefined || n === '') return '—'
    const num = typeof n === 'string' ? parseFloat(String(n).replace(/[^\d.-]/g, '')) : n
    return isFinite(num) ? `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'
  }
  const adj = rate.adjustments || []
  const totalAdj = adj.reduce((s, a) => s + (a.amount || 0), 0)
  const adjRows = adj.map(a => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#334155;">${a.description}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;font-weight:600;color:${a.amount >= 0 ? '#245F73' : '#EF4444'};text-align:right;white-space:nowrap;">${a.amount >= 0 ? '+' : ''}${a.amount.toFixed(3)}</td>
    </tr>`).join('')
  const headline = borrowerName ? `Rate Quote · ${borrowerName}` : 'Rate Quote'
  const propertyLine = [scenario.propertyCity, scenario.propertyState, scenario.propertyZip].filter(Boolean).join(', ')
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="color-scheme" content="light"/>
<title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#F5F4F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B1220;-webkit-font-smoothing:antialiased;">
<div style="max-width:100%;width:100%;background:#F5F4F1;padding:16px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.08);">
    <!-- Header -->
    <tr><td style="background:#245F73;padding:22px 24px;color:#ffffff;">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:0.85;">TQL Flash Submit</div>
      <div style="font-size:20px;font-weight:800;letter-spacing:-0.3px;margin-top:4px;line-height:1.2;">${headline}</div>
      <div style="font-size:13px;opacity:0.85;margin-top:6px;line-height:1.4;">${rate.programName}</div>
    </td></tr>
    <!-- Hero rate panel -->
    <tr><td style="padding:24px 24px 8px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="50%" style="padding:8px 4px;text-align:left;vertical-align:top;">
            <div style="font-size:32px;font-weight:800;color:#0B1220;line-height:1;letter-spacing:-1px;">${rate.rate.toFixed(3)}<span style="font-size:18px;color:#245F73;">%</span></div>
            <div style="font-size:10px;font-weight:700;color:#4D4D4D;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px;">Interest Rate</div>
          </td>
          <td width="50%" style="padding:8px 4px;text-align:right;vertical-align:top;">
            <div style="font-size:32px;font-weight:800;color:${rate.price >= 100 ? '#245F73' : '#0B1220'};line-height:1;letter-spacing:-1px;">${rate.price.toFixed(3)}</div>
            <div style="font-size:10px;font-weight:700;color:#4D4D4D;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px;">Final Price</div>
          </td>
        </tr>
      </table>
    </td></tr>
    <!-- Stats row -->
    <tr><td style="padding:8px 24px 20px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAFAF8;border-radius:10px;">
        <tr>
          <td width="50%" style="padding:14px 16px;text-align:left;border-right:1px solid #CBD5E1;">
            <div style="font-size:18px;font-weight:700;color:#0B1220;letter-spacing:-0.3px;">${rate.apr.toFixed(3)}%</div>
            <div style="font-size:9px;font-weight:700;color:#4D4D4D;letter-spacing:1.2px;text-transform:uppercase;margin-top:3px;">APR</div>
          </td>
          <td width="50%" style="padding:14px 16px;text-align:right;">
            <div style="font-size:18px;font-weight:700;color:#0B1220;letter-spacing:-0.3px;">${rate.payment > 0 ? fmtMoney(rate.payment) : '—'}</div>
            <div style="font-size:9px;font-weight:700;color:#4D4D4D;letter-spacing:1.2px;text-transform:uppercase;margin-top:3px;">Monthly P&amp;I</div>
          </td>
        </tr>
      </table>
    </td></tr>
    <!-- Scenario summary -->
    <tr><td style="padding:0 24px 16px 24px;">
      <div style="font-size:10px;font-weight:700;color:#245F73;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;">Scenario</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px;">
        <tr><td style="padding:4px 0;color:#4D4D4D;width:40%;">Loan Amount</td><td style="padding:4px 0;font-weight:600;color:#0B1220;text-align:right;">${fmtMoney(scenario.loanAmount)}</td></tr>
        <tr><td style="padding:4px 0;color:#4D4D4D;">Property Value</td><td style="padding:4px 0;font-weight:600;color:#0B1220;text-align:right;">${fmtMoney(scenario.propertyValue)}</td></tr>
        ${propertyLine ? `<tr><td style="padding:4px 0;color:#4D4D4D;">Property</td><td style="padding:4px 0;font-weight:600;color:#0B1220;text-align:right;">${propertyLine}</td></tr>` : ''}
        ${scenario.loanTerm ? `<tr><td style="padding:4px 0;color:#4D4D4D;">Term · Amort</td><td style="padding:4px 0;font-weight:600;color:#0B1220;text-align:right;">${scenario.loanTerm}yr ${scenario.amortization || ''}</td></tr>` : ''}
        ${scenario.documentationType ? `<tr><td style="padding:4px 0;color:#4D4D4D;">Doc Type</td><td style="padding:4px 0;font-weight:600;color:#0B1220;text-align:right;">${scenario.documentationType}</td></tr>` : ''}
        ${scenario.creditScore ? `<tr><td style="padding:4px 0;color:#4D4D4D;">FICO</td><td style="padding:4px 0;font-weight:600;color:#0B1220;text-align:right;">${scenario.creditScore}</td></tr>` : ''}
        ${rate.lockPeriod ? `<tr><td style="padding:4px 0;color:#4D4D4D;">Lock Period</td><td style="padding:4px 0;font-weight:600;color:#0B1220;text-align:right;">${rate.lockPeriod} days</td></tr>` : ''}
      </table>
    </td></tr>
    ${adjRows ? `
    <tr><td style="padding:0 24px 16px 24px;">
      <div style="font-size:10px;font-weight:700;color:#245F73;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;">Pricing Adjustments</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #CBD5E1;border-radius:8px;border-collapse:separate;background:#ffffff;">${adjRows}
        <tr><td style="padding:8px;font-size:11px;font-weight:700;color:#245F73;letter-spacing:1px;text-transform:uppercase;background:#FAFAF8;">Net Adjustment</td><td style="padding:8px;font-size:13px;font-weight:800;text-align:right;background:#FAFAF8;color:${totalAdj >= 0 ? '#245F73' : '#EF4444'};">${totalAdj >= 0 ? '+' : ''}${totalAdj.toFixed(3)}</td></tr>
      </table>
    </td></tr>` : ''}
    <!-- CTA -->
    <tr><td style="padding:8px 24px 24px 24px;">
      <a href="https://submit.tqltpo.com/" style="display:block;background:#245F73;color:#ffffff;text-decoration:none;text-align:center;padding:14px 16px;border-radius:10px;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Open in TQL Flash Submit</a>
      <div style="text-align:center;margin-top:10px;font-size:11px;color:#4D4D4D;line-height:1.5;">Reply to this email to lock or request changes.</div>
    </td></tr>
    <!-- Footer -->
    <tr><td style="padding:14px 24px;background:#FAFAF8;border-top:1px solid #CBD5E1;font-size:10px;color:#4D4D4D;line-height:1.5;text-align:center;">
      Total Quality Lending · Flash Submit · Quote generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
    </td></tr>
  </table>
</div>
</body></html>`
}

// Yes/No pill toggle used in the Flash Submit modal.
function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px] tql-text-primary leading-tight">{label}</span>
      <div className="flex items-center gap-1 shrink-0 rounded-lg p-0.5 bg-[color:var(--tql-bg)] border tql-border-steel">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${value ? 'tql-bg-teal text-white shadow-sm' : 'tql-text-muted hover:tql-text-primary'}`}
        >Yes</button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${!value ? 'tql-bg-teal text-white shadow-sm' : 'tql-text-muted hover:tql-text-primary'}`}
        >No</button>
      </div>
    </div>
  )
}

function DraggablePanel({ children, onClose, title, defaultX, defaultY, width, height }: {
  children: React.ReactNode
  onClose: () => void
  title: string
  defaultX?: number
  defaultY?: number
  width: string
  height: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [pos, setPos] = useState({ x: defaultX ?? -1, y: defaultY ?? -1 })
  const [initialized, setInitialized] = useState(false)

  // Center on first render if no default position
  useEffect(() => {
    if (!initialized && panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect()
      setPos({
        x: defaultX ?? Math.max(16, (window.innerWidth - rect.width) / 2),
        y: defaultY ?? Math.max(16, (window.innerHeight - rect.height) / 2),
      })
      setInitialized(true)
    }
  }, [initialized, defaultX, defaultY])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return
      const dx = ev.clientX - dragState.current.startX
      const dy = ev.clientY - dragState.current.startY
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 100, dragState.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40, dragState.current.origY + dy)),
      })
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pos])

  // Touch drag support
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    dragState.current = { startX: touch.clientX, startY: touch.clientY, origX: pos.x, origY: pos.y }
    const onMove = (ev: TouchEvent) => {
      if (!dragState.current) return
      const t = ev.touches[0]
      const dx = t.clientX - dragState.current.startX
      const dy = t.clientY - dragState.current.startY
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 100, dragState.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40, dragState.current.origY + dy)),
      })
    }
    const onEnd = () => {
      dragState.current = null
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
  }, [pos])

  return (
    <div
      ref={panelRef}
      className="fixed z-[200] flex flex-col bg-white rounded-2xl overflow-hidden"
      style={{
        left: pos.x,
        top: pos.y,
        width,
        height,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 32px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
        resize: 'both',
      }}
    >
      {/* Drag handle header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 cursor-grab active:cursor-grabbing select-none shrink-0"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-4 h-4 text-slate-300" />
          <span className="text-sm font-semibold text-slate-700">{title}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-200 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {children}
      </div>
    </div>
  )
}

export default function App() {
  const { user, profile, isPartner, signOut } = useAuth()
  const [currentView, setCurrentView] = useState<'pricing' | 'login' | 'signup' | 'submit'>('pricing')
  // Help Desk state
  const [showHelpDesk, setShowHelpDesk] = useState(false)
  // User Admin — passcode reveals the RAW investor names (Master Investor
  // Results). Default broker view shows TQL-masked program names only.
  const ADMIN_PASSCODE = 'tqlfaith'
  const [showUserAdmin, setShowUserAdmin] = useState(false)
  const [adminPasscodeInput, setAdminPasscodeInput] = useState('')
  const [adminPasscodeError, setAdminPasscodeError] = useState(false)
  const [showRawInvestor, setShowRawInvestor] = useState(false)
  // Admin unlock controls BOTH raw investor reveal AND full price ladder
  // visibility. Default broker view = single tier-2 hero card only.
  const showFullResults = showRawInvestor
  // Email Rate Quote — captures rate + recipient and sends a branded summary
  const [quoteRate, setQuoteRate] = useState<{
    programName: string; rate: number; price: number; apr: number; payment: number;
    points?: number; lockPeriod?: number | string;
    adjustments?: Array<{ description: string; amount: number; rateAdj?: number }>
  } | null>(null)
  const [quoteEmail, setQuoteEmail] = useState('')
  const [quoteBorrower, setQuoteBorrower] = useState('')
  const [quoteSending, setQuoteSending] = useState(false)
  const [quoteStatus, setQuoteStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [helpDeskFields, setHelpDeskFields] = useState({ name: '', email: '', topic: '', message: '' })
  const [helpDeskSending, setHelpDeskSending] = useState(false)
  const [helpDeskStatus, setHelpDeskStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Scenario gate — removed, form always enabled
  const formEnabled = true

  const [formData, setFormData] = useState<LoanData>(DEFAULT_FORM_DATA)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<PricingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [lpResult, setLpResult] = useState<any>(null)
  const [lpLoading, setLpLoading] = useState(false)
  const [lpUnlocked] = useState(false)
  const [, setObResult] = useState<any>(null)
  const [obLoading, setObLoading] = useState(false)
  // ChatCom & User Chat lightbox overlays
  const [showChatCom, setShowChatCom] = useState(false)
  const [showUserChat, setShowUserChat] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailStatus, setEmailStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [showEmailForm, setShowEmailForm] = useState(false)
  // Per-row action state: tracks which rate option row has an active reserve/lock form
  const [activeRowAction, setActiveRowAction] = useState<{
    type: 'reserve' | 'lock'
    programName: string
    optIdx: number
    rate: number
    price: number
    payment: number
    apr: number
    description: string
  } | null>(null)
  const [rowReserveFields, setRowReserveFields] = useState({ name: '', email: '', scenarioName: '', confirmed: false })
  const [rowLockFields, setRowLockFields] = useState({ name: '', email: '', loanNumber: '' })
  const [rowSending, setRowSending] = useState(false)
  const [rowStatus, setRowStatus] = useState<'idle' | 'success' | 'error'>('idle')
  // Flash Submit popup — captures broker/borrower details before kicking off the 3.4 upload
  const [flashSubmitRate, setFlashSubmitRate] = useState<{
    programName: string; rate: number; price: number; apr: number; payment: number;
    points?: number; lockPeriod?: number | string;
    adjustments?: Array<{ description: string; amount: number; rateAdj?: number }>
  } | null>(null)
  const [flashSubmitFields, setFlashSubmitFields] = useState({
    borrowerLastName: '',
    brokerName: '',
    brokerEmail: '',
    companyName: '',
    originationCharge: '',
    chargingProcessingFee: false,
    processingFeeAmount: '',
    collectingCreditReportFee: false,
    creditReportFeeAmount: '',
    thirdPartyProcessingFee: '',
    hasTitleEscrowSheet: false,   // default No
    authorizeSmartFees: true,     // default Yes
  })
  const [flashSubmitSending, setFlashSubmitSending] = useState(false)
  const [flashSubmitError, setFlashSubmitError] = useState<string | null>(null)
  const [openActionDropdown, setOpenActionDropdown] = useState<string | null>(null) // "programName-optIdx"
  // Anchor rect for the portal-rendered Actions dropdown (escapes overflow-hidden parents)
  const [actionDropdownRect, setActionDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)
  useEffect(() => {
    if (!openActionDropdown) { setActionDropdownRect(null); return }
    const onScrollOrResize = () => setOpenActionDropdown(null)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [openActionDropdown])
  // Inline per-row adjustments expansion (LLPA breakdown)
  const [expandedAdjRow, setExpandedAdjRow] = useState<string | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [stickyBarVisible, setStickyBarVisible] = useState(true)

  const toggleSection = (s: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  // Loading progress simulation
  useEffect(() => {
    if (!isLoading) { setLoadingProgress(0); return }
    setLoadingProgress(0)
    const steps = [
      { target: 15, delay: 200 },
      { target: 30, delay: 600 },
      { target: 50, delay: 1200 },
      { target: 65, delay: 2000 },
      { target: 78, delay: 3000 },
      { target: 88, delay: 4500 },
      { target: 94, delay: 6000 },
    ]
    const timers = steps.map(s => setTimeout(() => setLoadingProgress(s.target), s.delay))
    return () => timers.forEach(clearTimeout)
  }, [isLoading])

  // Jump to 100% when result arrives
  useEffect(() => {
    if (result && isLoading) setLoadingProgress(100)
    if (result && !isLoading) setLoadingProgress(100)
  }, [result, isLoading])

  // Close action dropdown on outside click
  useEffect(() => {
    if (!openActionDropdown) return
    const handler = () => setOpenActionDropdown(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openActionDropdown])

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return
    const handler = () => setShowUserMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showUserMenu])

  // Sticky results bar: hide on scroll down, show on scroll up (debounced)
  useEffect(() => {
    if (!result) { setStickyBarVisible(false); return }
    setStickyBarVisible(true)
    let lastScrollY = window.scrollY
    let ticking = false
    const handler = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const currentY = window.scrollY
        const delta = currentY - lastScrollY
        if (delta > 10 && currentY > 120) {
          setStickyBarVisible(false)
        } else if (delta < -10) {
          setStickyBarVisible(true)
        }
        lastScrollY = currentY
        ticking = false
      })
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [result])

  // Auto-populate location from ZIP using API lookup
  const [zipLoading, setZipLoading] = useState(false)
  useEffect(() => {
    if (formData.propertyZip.length === 5) {
      // First check local cache
      const cachedLocation = ZIP_LOOKUP[formData.propertyZip]
      if (cachedLocation) {
        setFormData(prev => ({
          ...prev,
          propertyCity: cachedLocation.city,
          propertyCounty: cachedLocation.county,
          propertyState: cachedLocation.state
        }))
        return
      }

      // Fetch from Zippopotam.us API (free, no key required)
      const fetchZipData = async () => {
        setZipLoading(true)
        try {
          const response = await fetch(`https://api.zippopotam.us/us/${formData.propertyZip}`)
          if (response.ok) {
            const data = await response.json()
            if (data.places && data.places.length > 0) {
              const place = data.places[0]
              setFormData(prev => ({
                ...prev,
                propertyCity: place['place name'] || '',
                propertyCounty: place['county'] || place['place name'] || '',
                propertyState: place['state abbreviation'] || ''
              }))
              // Cache the result
              ZIP_LOOKUP[formData.propertyZip] = {
                city: place['place name'] || '',
                county: place['county'] || place['place name'] || '',
                state: place['state abbreviation'] || ''
              }
            }
          }
        } catch (err) {
          console.log('ZIP lookup failed:', err)
        } finally {
          setZipLoading(false)
        }
      }
      fetchZipData()
    }
  }, [formData.propertyZip])

  const handleInputChange = (field: keyof LoanData, value: string | boolean) => {
    // Clear stale pricing results when any form field changes after pricing
    if (result) {
      setResult(null)
      setLpResult(null)
      setExpandedProgram(null)
    }

    setFormData(prev => {
      const updated = { ...prev, [field]: value }

      // Bidirectional LTV <-> Loan Amount calculation
      if (field === 'ltv' && typeof value === 'string') {
        // LTV changed -> recalculate Loan Amount
        const ltvVal = parseFloat(value) || 0
        const propVal = Number(prev.propertyValue.replace(/,/g, '')) || 0
        if (propVal > 0 && ltvVal > 0) {
          updated.loanAmount = Math.round(propVal * (ltvVal / 100)).toLocaleString()
        }
      }
      if (field === 'propertyValue' && typeof value === 'string') {
        // Property Value changed -> keep LTV, recalculate Loan Amount
        const propVal = Number(value.replace(/,/g, '')) || 0
        const ltvVal = parseFloat(prev.ltv) || 0
        if (propVal > 0 && ltvVal > 0) {
          updated.loanAmount = Math.round(propVal * (ltvVal / 100)).toLocaleString()
        }
      }
      if (field === 'loanAmount' && typeof value === 'string') {
        // Loan Amount changed -> recalculate LTV
        const loanAmt = Number(value.replace(/,/g, '')) || 0
        const propVal = Number(prev.propertyValue.replace(/,/g, '')) || 0
        if (propVal > 0 && loanAmt > 0) {
          const newLtv = (loanAmt / propVal) * 100
          updated.ltv = parseFloat(newLtv.toFixed(2)).toString()
        }
      }

      // Auto-sync documentationType when loanType changes to DSCR
      if (field === 'loanType' && value === 'dscr') {
        updated.documentationType = 'dscr'
      }
      // DSCR Income Doc Type: Auto-default occupancy to Investment (but keep loanType as nonqm)
      if (field === 'documentationType' && value === 'dscr') {
        updated.occupancyType = 'investment'
        // Keep loanType as nonqm - don't change it
      }
      // Auto-set hasITIN when citizenship is ITIN
      if (field === 'citizenship') {
        updated.hasITIN = value === 'itin'
      }
      return updated
    })
    setError(null)
    if (validationErrors[field]) {
      setValidationErrors(prev => { const next = { ...prev }; delete next[field]; return next })
    }
  }

  const formatNumberInput = (value: string) => {
    const num = value.replace(/[^0-9]/g, '')
    return num ? Number(num).toLocaleString() : ''
  }

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {}
    REQUIRED_FIELDS.forEach(field => {
      const value = formData[field]
      if (typeof value === 'string' && (!value || value.trim() === '')) {
        errors[field] = `${FIELD_LABELS[field] || field} is required`
      }
    })
    const loanAmt = Number(formData.loanAmount.replace(/,/g, ''))
    const propVal = Number(formData.propertyValue.replace(/,/g, ''))
    if (formData.loanAmount && loanAmt < 75000) errors.loanAmount = 'Minimum loan amount is $75,000'
    if (formData.loanAmount && loanAmt > 5000000) errors.loanAmount = 'Maximum loan amount is $5,000,000'
    if (formData.propertyValue && propVal < 100000) errors.propertyValue = 'Minimum property value is $100,000'
    if (formData.propertyValue && propVal > 100000000) errors.propertyValue = 'Maximum property value is $100,000,000'
    if (formData.loanAmount && formData.propertyValue && loanAmt > propVal) errors.loanAmount = 'Loan amount cannot exceed property value'

    // LTV max 90%
    if (formData.loanAmount && formData.propertyValue && loanAmt > 0 && propVal > 0) {
      const ltv = (loanAmt / propVal) * 100
      if (ltv > 90) {
        errors.loanAmount = `Maximum LTV is 90%. Current LTV: ${ltv.toFixed(1)}%`
      }
    }

    // CRITICAL: Cash-Out Refinance LTV Validation - Max 85% LTV
    if (formData.loanPurpose === 'cashout' && loanAmt > 0 && propVal > 0) {
      const ltv = (loanAmt / propVal) * 100
      if (ltv > 85) {
        errors.loanAmount = `Cash-out refinance max LTV is 85%. Current LTV: ${ltv.toFixed(1)}%`
      }
    }

    // Small-balance loans (under $100K): ONLY allowed for Investment + DSCR + 24mo+ prepay
    if (loanAmt > 0 && loanAmt <= 99999) {
      const prepayMonths = parseInt(formData.prepayPeriod) || 0
      const scopeErrors: string[] = []

      if (formData.occupancyType !== 'investment') scopeErrors.push('Property Use must be Investment')
      if (formData.documentationType !== 'dscr') scopeErrors.push('Income Doc Type must be DSCR')
      if (prepayMonths < 24) scopeErrors.push('Prepay Period must be 24 months or more')

      if (scopeErrors.length > 0) {
        errors.loanAmount = `Scenario out of Scope — ${scopeErrors.join('; ')}`
      } else {
        // Passed scope check — enforce small-balance LTV caps
        if (propVal > 0) {
          const ltv = (loanAmt / propVal) * 100
          if (formData.loanPurpose === 'cashout' && ltv > 65) {
            errors.loanAmount = `Cash-out max LTV is 65% for loans under $100K. Current: ${ltv.toFixed(1)}%`
          } else if (ltv > 70) {
            errors.loanAmount = `Max LTV is 70% for loans under $100K. Current: ${ltv.toFixed(1)}%`
          }
        }
        // Enforce min DSCR 1.000
        const dscrVal = parseFloat(formData.dscrManualInput) || 0
        if (dscrVal > 0 && dscrVal < 1.000) {
          errors.dscrManualInput = `Min DSCR is 1.000 for loans under $100K. Current: ${dscrVal.toFixed(3)}`
        }
      }
    }

    // CRITICAL: DSCR loans are ONLY for Investment properties
    if (formData.documentationType === 'dscr' && formData.occupancyType !== 'investment') {
      errors.documentationType = 'DSCR loans are only available for Investment properties'
    }

    const creditScore = Number(formData.creditScore)
    if (formData.creditScore && (creditScore < 620 || creditScore > 999)) errors.creditScore = 'Credit score must be 620-999'
    const dti = Number(formData.dti)
    if (formData.dti && (dti < 1 || dti > 55)) errors.dti = 'DTI must be 1-55%'
    if (formData.propertyZip && formData.propertyZip.length !== 5) errors.propertyZip = 'ZIP must be 5 digits'
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Calculate DSCR range from manual input
  const calculatedDSCR = (() => {
    const ratio = parseFloat(formData.dscrManualInput) || 0
    if (ratio <= 0) return { ratio: 0, range: 'noRatio', display: 'N/A' }
    let range = 'noRatio'
    if (ratio >= 1.250) range = '>=1.250'
    else if (ratio >= 1.150) range = '1.150-1.249'
    else if (ratio >= 1.000) range = '1.00-1.149'
    else if (ratio >= 0.750) range = '0.750-0.999'
    else if (ratio >= 0.500) range = '0.500-0.749'
    else range = 'noRatio'
    return { ratio, range, display: ratio.toFixed(3) }
  })()

  const handleSendEmail = async () => {
    if (!emailTo || !result) return
    setEmailSending(true)
    setEmailStatus('idle')

    const rate = targetPricing ? formatPercent(targetPricing.rate) : formatPercent(safeNumber(result.rate))
    const price = targetPricing ? targetPricing.price.toFixed(3) : '100.000'
    const apr = targetPricing ? formatPercent(targetPricing.apr) : formatPercent(safeNumber(result.apr))
    const payment = targetPricing && targetPricing.payment > 0 ? formatCurrency(targetPricing.payment) : formatCurrency(safeNumber(result.monthlyPayment))
    const points = targetPricing ? targetPricing.points.toFixed(3) : safeNumber(result.points).toFixed(3)
    const ltv = safeNumber(result.ltvRatio).toFixed(1) + '%'

    const adjustmentsHtml = targetPricing?.adjustments?.length
      ? `<table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
          <tr style="background:#f8fafc;"><th style="text-align:left;padding:8px 12px;color:#64748b;font-weight:600;">Description</th><th style="text-align:right;padding:8px 12px;color:#64748b;font-weight:600;">Adjustment</th></tr>
          ${targetPricing.adjustments.map(adj => {
            const val = adj.amount || 0
            const color = val > 0 ? '#059669' : val < 0 ? '#dc2626' : '#475569'
            return `<tr style="border-top:1px solid #e2e8f0;"><td style="padding:8px 12px;color:#334155;">${adj.description}</td><td style="padding:8px 12px;text-align:right;font-weight:600;color:${color};">${val > 0 ? '+' : ''}${val.toFixed(3)}</td></tr>`
          }).join('')}
        </table>` : ''

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
        <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:16px;padding:32px;color:white;">
          <div style="font-size:13px;font-weight:600;color:#94a3b8;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:8px;">Pricing Result</div>
          <div style="font-size:42px;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">${rate}</div>
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">Interest Rate</div>
          <table style="width:100%;margin-top:20px;border-collapse:collapse;">
            <tr>
              <td style="text-align:center;padding:12px 8px;background:rgba(255,255,255,0.06);border-radius:10px;">
                <div style="font-size:18px;font-weight:700;color:white;">${price}</div>
                <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">Price</div>
              </td>
              <td style="width:8px;"></td>
              <td style="text-align:center;padding:12px 8px;background:rgba(255,255,255,0.06);border-radius:10px;">
                <div style="font-size:18px;font-weight:700;color:white;">${apr}</div>
                <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">APR</div>
              </td>
              <td style="width:8px;"></td>
              <td style="text-align:center;padding:12px 8px;background:rgba(255,255,255,0.06);border-radius:10px;">
                <div style="font-size:18px;font-weight:700;color:white;">${payment}</div>
                <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">Payment</div>
              </td>
              <td style="width:8px;"></td>
              <td style="text-align:center;padding:12px 8px;background:rgba(255,255,255,0.06);border-radius:10px;">
                <div style="font-size:18px;font-weight:700;color:white;">${points}</div>
                <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">Points</div>
              </td>
              <td style="width:8px;"></td>
              <td style="text-align:center;padding:12px 8px;background:rgba(255,255,255,0.06);border-radius:10px;">
                <div style="font-size:18px;font-weight:700;color:white;">${ltv}</div>
                <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">LTV</div>
              </td>
            </tr>
          </table>
        </div>
        ${adjustmentsHtml ? `<div style="padding:20px 0;">${adjustmentsHtml}</div>` : ''}
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
          <div style="font-size:9px;color:#94a3b8;line-height:1.5;">&copy; OpenBroker Labs &amp; Qualr All rights reserved. We are a B2B technology platform, not a mortgage lender, broker, or loan originator. We do not make credit decisions or originate, arrange, negotiate, or fund loans. Nothing on this site is an offer or commitment to lend. By using this site, you agree to our policies. Use at your own risk. AI may be inaccurate. We are not liable for losses arising from use of this site.</div>
        </div>
      </div>`

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailTo, subject: `Pricing Result — ${rate} Rate`, html }),
      })
      if (res.ok) {
        setEmailStatus('success')
        setTimeout(() => { setShowEmailForm(false); setEmailStatus('idle') }, 2500)
      } else {
        setEmailStatus('error')
      }
    } catch {
      setEmailStatus('error')
    } finally {
      setEmailSending(false)
    }
  }

  const buildFullPricingHtml = (extraFields: { label: string; value: string }[], headerTitle: string, rateOverride?: { rate: number; price: number; apr: number; payment: number; description: string }) => {
    // Use rateOverride (from per-row action) if provided, otherwise fall back to targetPricing/result
    const rate = rateOverride ? formatPercent(rateOverride.rate) : targetPricing ? formatPercent(targetPricing.rate) : formatPercent(safeNumber(result?.rate))
    const price = rateOverride ? rateOverride.price.toFixed(3) : targetPricing ? targetPricing.price.toFixed(3) : '100.000'
    const apr = rateOverride ? formatPercent(rateOverride.apr) : targetPricing ? formatPercent(targetPricing.apr) : formatPercent(safeNumber(result?.apr))
    const payment = rateOverride ? (rateOverride.payment > 0 ? formatCurrency(rateOverride.payment) : '—') : targetPricing && targetPricing.payment > 0 ? formatCurrency(targetPricing.payment) : formatCurrency(safeNumber(result?.monthlyPayment))
    const points = rateOverride ? (100 - rateOverride.price).toFixed(3) : targetPricing ? targetPricing.points.toFixed(3) : safeNumber(result?.points).toFixed(3)
    const ltv = safeNumber(result?.ltvRatio).toFixed(1) + '%'

    const adjHtml = !rateOverride && targetPricing?.adjustments?.length
      ? `<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:12px;">
          <tr style="background:#f8fafc;"><th style="text-align:left;padding:6px 10px;color:#64748b;font-weight:600;">Description</th><th style="text-align:right;padding:6px 10px;color:#64748b;font-weight:600;">Adj</th></tr>
          ${targetPricing.adjustments.map(adj => {
            const val = adj.amount || 0
            const color = val > 0 ? '#059669' : val < 0 ? '#dc2626' : '#475569'
            return `<tr style="border-top:1px solid #e2e8f0;"><td style="padding:6px 10px;color:#334155;">${adj.description}</td><td style="padding:6px 10px;text-align:right;font-weight:600;color:${color};">${val > 0 ? '+' : ''}${val.toFixed(3)}</td></tr>`
          }).join('')}
        </table>` : ''

    const extraFieldsHtml = extraFields.map(f =>
      `<tr><td style="padding:6px 10px;color:#64748b;font-weight:600;white-space:nowrap;">${f.label}</td><td style="padding:6px 10px;color:#0f172a;font-weight:700;">${f.value}</td></tr>`
    ).join('')

    const loanInputs = [
      { label: 'Loan Amount', value: formatCurrency(Number(formData.loanAmount) || 0) },
      { label: 'Property Value', value: formatCurrency(Number(formData.propertyValue) || 0) },
      { label: 'Credit Score', value: formData.creditScore },
      { label: 'ZIP / State', value: `${formData.propertyZip} / ${formData.propertyState}` },
      { label: 'County / City', value: `${formData.propertyCounty || '—'} / ${formData.propertyCity || '—'}` },
      { label: 'Occupancy', value: formData.occupancyType },
      { label: 'Property Type', value: formData.propertyType },
      { label: 'Loan Purpose', value: formData.loanPurpose },
      { label: 'Doc Type', value: formData.documentationType },
      { label: 'DTI', value: formData.dti ? formData.dti + '%' : '—' },
      { label: 'Loan Term', value: formData.loanTerm },
      { label: 'Lock Period', value: formData.lockPeriod + ' days' },
      { label: 'Impound', value: formData.impoundType },
      { label: 'Citizenship', value: formData.citizenship },
    ]
    if (formData.documentationType === 'dscr') {
      loanInputs.push({ label: 'DSCR Ratio', value: formData.dscrRatio || formData.dscrManualInput || '—' })
    }
    if (formData.occupancyType === 'investment') {
      loanInputs.push({ label: 'Prepay Period', value: formData.prepayPeriod })
      loanInputs.push({ label: 'Cross-Coll', value: formData.isCrossCollateralized ? 'Yes' : 'No' })
    }
    if (formData.loanPurpose === 'cashout') {
      loanInputs.push({ label: 'Cashout Amount', value: formatCurrency(Number(formData.cashoutAmount) || 0) })
    }

    const inputsHtml = loanInputs.map(f =>
      `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:5px 10px;color:#64748b;font-size:11px;">${f.label}</td><td style="padding:5px 10px;color:#334155;font-size:11px;font-weight:600;">${f.value}</td></tr>`
    ).join('')

    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
        <div style="background:#1e40af;border-radius:12px 12px 0 0;padding:20px 24px;">
          <div style="font-size:18px;font-weight:800;color:white;letter-spacing:-0.01em;">${headerTitle}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:4px;">Generated ${new Date().toLocaleString()}</div>
        </div>
        <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;">
          <div style="font-size:12px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Request Details</div>
          <table style="width:100%;border-collapse:collapse;">${extraFieldsHtml}</table>
        </div>
        <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:24px;color:white;">
          <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Pricing Result</div>
          <div style="font-size:36px;font-weight:800;letter-spacing:-0.02em;margin-bottom:2px;">${rate}</div>
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">Interest Rate</div>
          <table style="width:100%;margin-top:16px;border-collapse:collapse;">
            <tr>
              <td style="text-align:center;padding:10px 6px;background:rgba(255,255,255,0.06);border-radius:8px;"><div style="font-size:16px;font-weight:700;color:white;">${price}</div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;margin-top:2px;">Price</div></td>
              <td style="width:6px;"></td>
              <td style="text-align:center;padding:10px 6px;background:rgba(255,255,255,0.06);border-radius:8px;"><div style="font-size:16px;font-weight:700;color:white;">${apr}</div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;margin-top:2px;">APR</div></td>
              <td style="width:6px;"></td>
              <td style="text-align:center;padding:10px 6px;background:rgba(255,255,255,0.06);border-radius:8px;"><div style="font-size:16px;font-weight:700;color:white;">${payment}</div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;margin-top:2px;">Payment</div></td>
              <td style="width:6px;"></td>
              <td style="text-align:center;padding:10px 6px;background:rgba(255,255,255,0.06);border-radius:8px;"><div style="font-size:16px;font-weight:700;color:white;">${points}</div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;margin-top:2px;">Points</div></td>
              <td style="width:6px;"></td>
              <td style="text-align:center;padding:10px 6px;background:rgba(255,255,255,0.06);border-radius:8px;"><div style="font-size:16px;font-weight:700;color:white;">${ltv}</div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;margin-top:2px;">LTV</div></td>
            </tr>
          </table>
        </div>
        ${adjHtml ? `<div style="padding:16px 24px;border:1px solid #e2e8f0;border-top:none;">${adjHtml}</div>` : ''}
        <div style="padding:16px 24px;border:1px solid #e2e8f0;border-top:none;background:#fafbfc;">
          <div style="font-size:12px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Loan Inputs</div>
          <table style="width:100%;border-collapse:collapse;">${inputsHtml}</table>
        </div>
        <div style="padding:16px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <div style="font-size:9px;color:#94a3b8;line-height:1.5;">&copy; OpenBroker Labs &amp; Qualr. B2B technology platform. Not a lender or broker. AI may be inaccurate.</div>
        </div>
      </div>`
  }

  // Per-row Reserve: sends the specific rate option's data
  const handleRowReserve = async () => {
    if (!result || !activeRowAction || !rowReserveFields.confirmed || !rowReserveFields.name || !rowReserveFields.email) return
    setRowSending(true)
    setRowStatus('idle')
    const { rate, price, payment, apr, description } = activeRowAction
    const rateOverride = { rate, price, apr, payment, description }
    const html = buildFullPricingHtml([
      { label: 'Name', value: rowReserveFields.name },
      { label: 'Email', value: rowReserveFields.email },
      { label: 'Scenario Name', value: rowReserveFields.scenarioName || '—' },
      { label: 'Selected Rate', value: formatPercent(rate) },
      { label: 'Selected Price', value: price.toFixed(3) },
      { label: 'Selected APR', value: formatPercent(apr) },
      { label: 'Selected Payment', value: payment > 0 ? formatCurrency(payment) : '—' },
      { label: 'Program', value: description },
    ], 'NEW QUOTE RESERVATION REQUEST', rateOverride)
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'tposupport@tqlend.com', subject: `RESERVATION — ${formatPercent(rate)} @ ${price.toFixed(3)}`, html }),
      })
      if (res.ok) {
        setRowStatus('success')
        setTimeout(() => { setActiveRowAction(null); setRowStatus('idle'); setRowReserveFields({ name: '', email: '', scenarioName: '', confirmed: false }) }, 2500)
      } else { setRowStatus('error') }
    } catch { setRowStatus('error') }
    finally { setRowSending(false) }
  }

  // Per-row Lock: sends the specific rate option's data
  const handleRowLock = async () => {
    if (!result || !activeRowAction || !rowLockFields.name || !rowLockFields.email || !rowLockFields.loanNumber) return
    setRowSending(true)
    setRowStatus('idle')
    const { rate, price, payment, apr, description } = activeRowAction
    const rateOverride = { rate, price, apr, payment, description }
    const html = buildFullPricingHtml([
      { label: 'Name', value: rowLockFields.name },
      { label: 'Email', value: rowLockFields.email },
      { label: 'TQL Loan Number', value: rowLockFields.loanNumber },
      { label: 'Selected Rate', value: formatPercent(rate) },
      { label: 'Selected Price', value: price.toFixed(3) },
      { label: 'Selected APR', value: formatPercent(apr) },
      { label: 'Selected Payment', value: payment > 0 ? formatCurrency(payment) : '—' },
      { label: 'Program', value: description },
    ], 'RATE LOCK REQUEST', rateOverride)
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'tposupport@tqlend.com', subject: `LOCK REQUEST — ${formatPercent(rate)} @ ${price.toFixed(3)}`, html }),
      })
      if (res.ok) {
        setRowStatus('success')
        setTimeout(() => { setActiveRowAction(null); setRowStatus('idle'); setRowLockFields({ name: '', email: '', loanNumber: '' }) }, 2500)
      } else { setRowStatus('error') }
    } catch { setRowStatus('error') }
    finally { setRowSending(false) }
  }

  // Flash Submit handler — sends the loan package to the disclosure desk
  // with the PDF pricing summary attached, then hands off to the 3.4 upload flow.
  const handleFlashSubmit = async () => {
    if (!flashSubmitRate) return
    const f = flashSubmitFields
    if (!f.borrowerLastName || !f.brokerName || !f.brokerEmail || !f.companyName) {
      setFlashSubmitError("Borrower's Last Name, Your Name, Email, and Company are required.")
      return
    }
    setFlashSubmitSending(true)
    setFlashSubmitError(null)
    try {
      const res = await fetch('/api/flash-submit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker: f,
          rate: flashSubmitRate,
          scenario: {
            loanAmount: formData.loanAmount,
            propertyValue: formData.propertyValue,
            propertyState: formData.propertyState,
            propertyZip: formData.propertyZip,
            propertyCounty: formData.propertyCounty,
            propertyCity: formData.propertyCity,
            occupancyType: formData.occupancyType,
            propertyType: formData.propertyType,
            loanPurpose: formData.loanPurpose,
            loanTerm: formData.loanTerm,
            amortization: formData.amortization,
            documentationType: formData.documentationType,
            creditScore: formData.creditScore,
            dti: formData.dti,
            lockPeriod: formData.lockPeriod,
            prepayPeriod: formData.prepayPeriod,
            isInvestment: formData.occupancyType === 'investment',
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        setFlashSubmitError(data?.error || 'Failed to send Flash Submit request.')
        setFlashSubmitSending(false)
        return
      }
      // Success — close the modal and continue to 3.4 upload
      setFlashSubmitRate(null)
      setFlashSubmitSending(false)
      setCurrentView('submit')
    } catch (err) {
      setFlashSubmitError(err instanceof Error ? err.message : 'Failed to send Flash Submit request.')
      setFlashSubmitSending(false)
    }
  }

  // Help Desk submit handler
  const handleHelpDeskSubmit = async () => {
    if (!helpDeskFields.name || !helpDeskFields.email || !helpDeskFields.topic) return
    setHelpDeskSending(true)
    setHelpDeskStatus('idle')
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;">
        <div style="background:#1e40af;border-radius:12px 12px 0 0;padding:20px 24px;">
          <div style="font-size:18px;font-weight:800;color:white;">HELP DESK REQUEST</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:4px;">Submitted ${new Date().toLocaleString()}</div>
        </div>
        <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 10px;color:#64748b;font-weight:600;">Name</td><td style="padding:8px 10px;color:#0f172a;font-weight:700;">${helpDeskFields.name}</td></tr>
            <tr style="border-top:1px solid #f1f5f9;"><td style="padding:8px 10px;color:#64748b;font-weight:600;">Email</td><td style="padding:8px 10px;color:#0f172a;font-weight:700;">${helpDeskFields.email}</td></tr>
            <tr style="border-top:1px solid #f1f5f9;"><td style="padding:8px 10px;color:#64748b;font-weight:600;">Help Topic</td><td style="padding:8px 10px;color:#0f172a;font-weight:700;">${helpDeskFields.topic}</td></tr>
            ${helpDeskFields.message ? `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:8px 10px;color:#64748b;font-weight:600;vertical-align:top;">Message</td><td style="padding:8px 10px;color:#0f172a;font-weight:500;white-space:pre-wrap;">${helpDeskFields.message}</td></tr>` : ''}
            ${profile ? `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:8px 10px;color:#64748b;font-weight:600;">Company</td><td style="padding:8px 10px;color:#0f172a;font-weight:700;">${profile.company_name} (NMLS# ${profile.company_nmls})</td></tr>` : ''}
          </table>
        </div>
      </div>`
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'tposupport@tqlend.com', subject: `HELP DESK — ${helpDeskFields.topic}`, html }),
      })
      if (res.ok) {
        setHelpDeskStatus('success')
        setTimeout(() => { setShowHelpDesk(false); setHelpDeskStatus('idle'); setHelpDeskFields({ name: '', email: '', topic: '', message: '' }) }, 2500)
      } else { setHelpDeskStatus('error') }
    } catch { setHelpDeskStatus('error') }
    finally { setHelpDeskSending(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) { setError('Please fix the errors above'); return }

    // Pre-submit validation via PricingLogic (prevents fake/invalid data from reaching API)
    const preCheck = validateFormBeforeSubmit(formData)
    if (!preCheck.isValid) {
      setError(preCheck.errors.join('. '))
      return
    }

    setIsLoading(true); setError(null); setResult(null); setLpResult(null); setLpLoading(true); setObResult(null); setObLoading(true)
    const isDSCR = formData.documentationType === 'dscr'
    const requestBody = {
      ...formData,
      loanType: 'nonqm',
      product: 'conventional',
      loanAmount: Number(formData.loanAmount.replace(/,/g, '')),
      propertyValue: Number(formData.propertyValue.replace(/,/g, '')),
      cashoutAmount: formData.cashoutAmount ? Number(formData.cashoutAmount.replace(/,/g, '')) : 0,
      creditScore: Number(formData.creditScore),
      dti: Number(formData.dti),
      ltv: parseFloat(formData.ltv) || 0,
      presentHousingExpense: isDSCR ? Number(formData.presentHousingExpense.replace(/,/g, '')) || 5000 : undefined,
      grossRent: isDSCR ? Number(formData.grossRent.replace(/,/g, '')) || 5000 : undefined,
      dscrRatio: isDSCR ? calculatedDSCR.range : undefined,
      dscrValue: isDSCR ? calculatedDSCR.ratio : undefined,
      dscrManualInput: isDSCR ? formData.dscrManualInput : undefined
    }

    // Log DSCR values for debugging
    if (isDSCR) {
      console.log('[DSCR Submit]', {
        dscrManualInput: formData.dscrManualInput,
        calculatedRange: calculatedDSCR.range,
        calculatedRatio: calculatedDSCR.ratio,
        sentDscrRatio: requestBody.dscrRatio,
        sentDscrValue: requestBody.dscrValue,
      })
    }

    // Fire OB pricing only
    const bodyJson = JSON.stringify(requestBody)

    try {
      const obResponse = await fetch('/api/get-ob-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyJson,
      })
      const obData = await obResponse.json()

      if (obData.success && obData.data) {
        setObResult(obData.data)
        const sanitizedResult = sanitizePricingResult({ ...obData.data, source: 'Optimal Blue' })
        if (sanitizedResult && sanitizedResult.programs && sanitizedResult.programs.length > 0) {
          setResult(sanitizedResult)
        } else {
          setResult({ programs: [], mlMessage: 'No eligible programs found' } as any)
        }
      } else {
        setResult({ programs: [], mlMessage: typeof obData.error === 'string' ? obData.error : 'No rates returned' } as any)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get pricing')
    } finally {
      setIsLoading(false)
      setObLoading(false)
      setLpLoading(false)
    }
  }

  const hasError = (field: keyof LoanData) => !!validationErrors[field]
  const showInvestorDetails = formData.occupancyType === 'investment'

  // Convert points to price — handles both OB format (price=100.408) and ML format (points=-0.408)
  const pointsToPrice = (pts: number): number => pts > 50 ? pts : 100 - pts

  // ── 2ND-BEST RATE: tier-2 broker-facing rate ──
  // Collects every qualifying rate option across every program in the
  // 99.500–101.750 band, sorts (rate ASC, price DESC) so the top entry is the
  // absolute best, then returns index 1 — the next-tier-down combination.
  // Falls back to the absolute best if only one rate qualifies.
  const findSecondBestRate = (programs: Program[] | undefined): {
    program: Program; opt: RateOption; price: number
  } | null => {
    if (!Array.isArray(programs) || programs.length === 0) return null
    const candidates: Array<{ program: Program; opt: RateOption; price: number }> = []
    for (const program of programs) {
      if (!program || !Array.isArray(program.rateOptions)) continue
      for (const opt of program.rateOptions) {
        if (!opt) continue
        const pts = safeNumber(opt.points)
        const price = safeNumber(opt.price) || (pts > 50 ? pts : 100 - pts)
        if (price < 99.5 || price > 101.75) continue
        const rate = safeNumber(opt.rate)
        if (rate <= 0) continue
        candidates.push({ program, opt, price })
      }
    }
    if (candidates.length === 0) return null
    candidates.sort((a, b) => {
      if (Math.abs(a.opt.rate - b.opt.rate) > 1e-6) return a.opt.rate - b.opt.rate
      return b.price - a.price
    })
    // The very best is intentionally withheld from broker view — surface tier-2.
    // Skip every entry that ties with the absolute best (same rate AND price)
    // so brokers always see a truly different combo.
    const top = candidates[0]
    const tier2 = candidates.find((c, i) =>
      i > 0 && (Math.abs(c.opt.rate - top.opt.rate) > 1e-6 || Math.abs(c.price - top.price) > 1e-6)
    )
    return tier2 || top
  }

  // Filter rate options to only show prices between 99.000 and 101.750 (TQL target range)
  const PRICE_MIN = 99.0
  const PRICE_MAX = 101.75
  const filterRateOptionsByPrice = (rateOptions: RateOption[]) => {
    return rateOptions.filter(opt => {
      const pts = safeNumber(opt.points)
      // OB sends price directly (e.g., 100.408); ML sends points offset (e.g., -0.408)
      const price = pts > 50 ? pts : 100 - pts
      return price >= PRICE_MIN && price <= PRICE_MAX
    })
  }

  // DSCR 5% Fixed PPP — this program is always displayed when DSCR is the
  // selected Doc Type, even if its prices fall outside the 99.000–101.750
  // band. TQL leans on this program as the default investor scenario.
  const isDSCR5PctPPPProgram = (programName: string): boolean => {
    const n = String(programName || '').toUpperCase()
    return /DSCR/.test(n) && /5\s*%\s*.*PPP|PPP\s*5\s*%|5\s*YEAR\s*PPP|5YR\s*PPP/.test(n)
  }
  const isDSCRSelected = formData.documentationType === 'dscr'
  const shouldPinDSCR5Pct = (programName: string): boolean =>
    isDSCRSelected && isDSCR5PctPPPProgram(programName)

  // Type for target pricing option
  type TargetPricingOption = {
    rate: number
    points: number
    apr: number
    price: number
    payment: number
    programName: string
    adjustments: Adjustment[]
  }

  // Helper to check if program has PPP (but 0MO PPP or 0 YR PPP means NO prepay, so allow those)
  const hasPPPInName = (text: string): boolean => {
    const upper = text.toUpperCase()
    if (upper.includes('0MO PPP') || upper.includes('0 YR PPP') || upper.includes('0YR PPP')) {
      return false
    }
    return upper.includes(' PPP') || upper.includes('YR PPP') || /\d\s*YR\s*PPP/i.test(upper)
  }

  // Map prepay period form value to PPP patterns in program names
  const matchesPrepayPeriod = (desc: string, prepayPeriod: string): boolean => {
    const upper = desc.toUpperCase()
    switch (prepayPeriod) {
      case '60mo': return upper.includes('60MO PPP') || upper.includes('5 YR PPP') || upper.includes('5YR PPP') || upper.includes('5%') && upper.includes('PPP')
      case '48mo': return upper.includes('48MO PPP') || upper.includes('4 YR PPP') || upper.includes('4YR PPP') || upper.includes('4%') && upper.includes('PPP')
      case '36mo': return upper.includes('36MO PPP') || upper.includes('3 YR PPP') || upper.includes('3YR PPP') || upper.includes('3%') && upper.includes('PPP')
      case '24mo': return upper.includes('24MO PPP') || upper.includes('2 YR PPP') || upper.includes('2YR PPP') || upper.includes('2%') && upper.includes('PPP')
      case '12mo': return upper.includes('12MO PPP') || upper.includes('1 YR PPP') || upper.includes('1YR PPP') || upper.includes('1%') && upper.includes('PPP')
      case '0mo': case 'none': case '':
        return !hasPPPInName(upper)
      case '5pct': return upper.includes('5%') && upper.includes('PPP') || upper.includes('60MO PPP') || upper.includes('5 YR PPP')
      case '4pct': return upper.includes('4%') && upper.includes('PPP') || upper.includes('48MO PPP')
      case '3pct': return upper.includes('3%') && upper.includes('PPP') || upper.includes('36MO PPP') || upper.includes('3 YR PPP')
      default:
        // Fallback: match any PPP program
        return hasPPPInName(upper)
    }
  }

  // Check if a program name matches a given prepay period
  const programMatchesPrepay = (programName: string, prepayPeriod: string): boolean => {
    return matchesPrepayPeriod(programName, prepayPeriod)
  }

  // Find the TARGET PRICING - Match user's selected prepay period for DSCR/Investment
  const getTargetPricing = (): TargetPricingOption | null => {
    if (!result?.programs || !Array.isArray(result.programs)) return null

    const isPPPAllowed = formData.occupancyType === 'investment'
    const selectedPrepay = formData.prepayPeriod || '60mo'
    let targetOption: TargetPricingOption | null = null
    let closestDistance = Infinity

    result.programs.forEach(program => {
      if (!program || !Array.isArray(program.rateOptions)) return
      const programName = program.name || 'Unknown'

      program.rateOptions.forEach(opt => {
        if (!opt) return
        const desc = (programName || opt.description || '').toUpperCase()
        const hasPPP = hasPPPInName(desc)

        // For Primary/Secondary homes: SKIP any PPP programs entirely
        if (!isPPPAllowed && hasPPP) return

        // For Investment properties: match the user's SELECTED prepay period
        if (isPPPAllowed) {
          if (!matchesPrepayPeriod(desc, selectedPrepay)) return
        }

        const points = safeNumber(opt.points)
        const price = pointsToPrice(points)

        // Investment DSCR prepay-based price caps
        const isInvDSCR = formData.occupancyType === 'investment' && formData.documentationType === 'dscr'
        let maxPrice = 101.5
        if (isInvDSCR) {
          const prepay = formData.prepayPeriod || ''
          if (prepay === '24mo' || prepay === '2yr') maxPrice = 100.750
          else if (prepay === '12mo' || prepay === '1yr') maxPrice = 100.0
          else if (prepay === '0mo' || prepay === 'none' || prepay === '') maxPrice = 99.5
        }

        if (price >= 99.5 && price <= maxPrice) {
          const distance = Math.abs(price - 100)
          if (distance < closestDistance) {
            closestDistance = distance
            targetOption = {
              rate: safeNumber(opt.rate),
              points: points,
              apr: safeNumber(opt.apr),
              price: price,
              payment: safeNumber(opt.payment),
              programName: programName || opt.description,
              adjustments: opt.adjustments || []
            }
          }
        }
      })
    })

    // Fallback: if no match found for selected prepay, try any matching program
    if (!targetOption) {
      result.programs.forEach(program => {
        if (!program || !Array.isArray(program.rateOptions)) return
        const programName = program.name || 'Unknown'

        program.rateOptions.forEach(opt => {
          if (!opt) return
          const desc = (opt.description || programName).toUpperCase()
          const hasPPP = hasPPPInName(desc)

          if (!isPPPAllowed && hasPPP) return

          const points = safeNumber(opt.points)
          const price = 100 - points

          const isInvDSCR = formData.occupancyType === 'investment' && formData.documentationType === 'dscr'
          let maxPrice = 101.5
          if (isInvDSCR) {
            const prepay = formData.prepayPeriod || ''
            if (prepay === '24mo' || prepay === '2yr') maxPrice = 100.750
            else if (prepay === '12mo' || prepay === '1yr') maxPrice = 100.0
            else if (prepay === '0mo' || prepay === 'none' || prepay === '') maxPrice = 99.5
          }

          if (price >= 99.5 && price <= maxPrice) {
            const distance = Math.abs(price - 100)
            if (distance < closestDistance) {
              closestDistance = distance
              targetOption = {
                rate: safeNumber(opt.rate),
                points: points,
                apr: safeNumber(opt.apr),
                price: price,
                payment: safeNumber(opt.payment),
                programName: programName || opt.description,
                adjustments: opt.adjustments || []
              }
            }
          }
        })
      })
    }

    return targetOption
  }

  const targetPricing: TargetPricingOption | null = result ? getTargetPricing() : null

  // View routing: Login / SignUp / Submit pages render full-screen (no sidebar)
  if (currentView === 'login') {
    return <LoginPage onBack={() => setCurrentView('pricing')} onSignUp={() => setCurrentView('signup')} />
  }
  if (currentView === 'signup') {
    return <SignUpPage onBack={() => setCurrentView('pricing')} onLogin={() => setCurrentView('login')} />
  }
  if (currentView === 'submit') {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading...</div>}>
        <SubmitLoanPage onBack={() => setCurrentView('pricing')} />
      </Suspense>
    )
  }

  // Auto-fill help desk fields from partner profile
  const helpDeskDefaults = profile ? { name: `${profile.first_name} ${profile.last_name}`, email: user?.email || '' } : { name: '', email: '' }


  return (
    <div className="h-screen overflow-hidden bg-slate-50">

      {/* ===== DESKTOP SIDEBAR (fixed, 200px) ===== */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-[200px] bg-white border-r border-slate-200 z-50">
        {/* Brand */}
        <div className="px-4 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <IconAtom className="w-8 h-8 text-black" />
            <div className="leading-tight">
              <span className="text-[20px] font-bold tracking-[-0.02em]"><span className="text-slate-900">TQL</span><span className="tql-text-link">Flash</span></span>
              <div className="text-[9px] text-slate-400 tracking-wide mt-0.5">Total Quality Lending</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1.5">
          <div className="px-2 py-1 mb-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Tools</span>
          </div>
          {/* + New Scenario */}
          <button type="button" className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left text-slate-900">
            <IconNewScenario className="w-[18px] h-[18px] shrink-0" />
            <span className="text-[13px] font-semibold truncate">New Scenario</span>
          </button>
          {/* Chat with a Human — HIDDEN */}
          {/* TRINITY AI DEAL DESK — HIDDEN */}
          {/* Submit a Loan — Encompass Flash Submit */}
          <button type="button" onClick={() => setCurrentView('submit')} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left text-slate-900">
            <IconSubmitLoan className="w-[18px] h-[18px] shrink-0" />
            <span className="text-[13px] truncate">Flash Submit</span>
          </button>
          {/* Broker Package — greyed out */}
          <a href="https://brokerpack.tqltpo.com/broker-apply" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-slate-300 cursor-not-allowed pointer-events-none">
            <CheckCircle className="w-[18px] h-[18px] shrink-0" />
            <span className="text-[13px] truncate">Broker Package</span>
          </a>
          {/* Help Desk — greyed out */}
          <button
            type="button"
            onClick={() => { setHelpDeskFields({ name: helpDeskDefaults.name, email: helpDeskDefaults.email, topic: '', message: '' }); setHelpDeskStatus('idle'); setShowHelpDesk(true) }}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-slate-300 cursor-not-allowed"
            disabled
          >
            <HelpCircle className="w-[18px] h-[18px] shrink-0" />
            <span className="text-[13px] truncate">Help Desk</span>
          </button>
          {/* User Admin — passcode-gated, unlocks full pricing results */}
          <button
            type="button"
            onClick={() => { setAdminPasscodeInput(''); setAdminPasscodeError(false); setShowUserAdmin(true) }}
            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors text-left ${showFullResults ? 'tql-text-teal hover:bg-slate-50' : 'text-slate-900 hover:bg-slate-50'}`}
          >
            <Lock className="w-[18px] h-[18px] shrink-0" />
            <span className="text-[13px] truncate">User Admin{showRawInvestor ? ' · Raw Investor View' : ''}</span>
          </button>
        </nav>

        {/* User Info (login moved to top header) */}
        {isPartner && profile && (
          <div className="px-3 py-4 border-t border-slate-200">
            <div className="px-2">
              <div className="text-[12px] font-semibold text-slate-900 truncate">{profile.first_name} {profile.last_name}</div>
              <div className="text-[10px] text-slate-400 truncate">{profile.company_name}</div>
            </div>
          </div>
        )}
      </aside>

      {/* ===== MOBILE HEADER (lg:hidden) ===== */}
      <header className="lg:hidden sticky top-0 z-40 h-12 bg-white/90 backdrop-blur-xl border-b border-slate-200 flex items-center justify-between px-4">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="w-8 h-8 flex items-center justify-center text-slate-900 hover:text-slate-900"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <IconAtom className="w-6 h-6 text-black" />
          <div className="leading-tight">
            <span className="text-[15px] font-bold tracking-[-0.02em]"><span className="text-slate-900">TQL</span><span className="tql-text-link">Flash</span></span>
            <div className="text-[8px] text-slate-400 tracking-wide">Total Quality Lending</div>
          </div>
        </div>
        <div className="w-8" />
      </header>

      {/* ===== MOBILE DRAWER ===== */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed left-0 top-0 h-full w-[260px] bg-white z-[201] flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <IconAtom className="w-6 h-6 text-black" />
                <div className="leading-tight">
                  <span className="text-[15px] font-bold tracking-[-0.02em]"><span className="text-slate-900">Open</span><span className="tql-text-link">Price</span></span>
                  <div className="text-[8px] text-slate-400 tracking-wide">Powered by DEFY TPO</div>
                </div>
              </div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
              <div className="px-2 py-1 mb-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Tools</span>
              </div>
              {/* + New Scenario */}
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left text-slate-900">
                <IconNewScenario className="w-[18px] h-[18px] shrink-0" />
                <span className="text-[13px] font-semibold">New Scenario</span>
              </button>
              {/* Chat with a Human — HIDDEN */}
              {/* TRINITY AI DEAL DESK — HIDDEN */}
              {/* Submit a Loan — Encompass Flash Submit */}
              <button type="button" onClick={() => { setMobileMenuOpen(false); setCurrentView('submit') }} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left text-slate-900">
                <IconSubmitLoan className="w-[18px] h-[18px] shrink-0" />
                <span className="text-[13px]">Flash Submit</span>
              </button>
              {/* Rent AVM — HIDDEN */}
              {/* Broker Package — greyed out */}
              <span className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-slate-300 cursor-not-allowed">
                <CheckCircle className="w-[18px] h-[18px] shrink-0" />
                <span className="text-[13px]">Broker Package</span>
              </span>
              {/* Help Desk — greyed out */}
              <span className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-slate-300 cursor-not-allowed">
                <HelpCircle className="w-[18px] h-[18px] shrink-0" />
                <span className="text-[13px]">Help Desk</span>
              </span>
              {/* User Admin — passcode-gated, unlocks full pricing results */}
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); setAdminPasscodeInput(''); setAdminPasscodeError(false); setShowUserAdmin(true) }}
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors text-left ${showFullResults ? 'tql-text-teal hover:bg-slate-50' : 'text-slate-900 hover:bg-slate-50'}`}
              >
                <Lock className="w-[18px] h-[18px] shrink-0" />
                <span className="text-[13px]">User Admin{showRawInvestor ? ' · Raw Investor View' : ''}</span>
              </button>
            </nav>
            <div className="px-3 py-4 border-t border-slate-200">
              {isPartner && profile ? (
                <div className="space-y-2">
                  <div className="px-2">
                    <div className="text-[12px] font-semibold text-slate-900 truncate">{profile.first_name} {profile.last_name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{profile.company_name}</div>
                  </div>
                  <button type="button" onClick={() => { setMobileMenuOpen(false); signOut() }} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors">
                    <LogOut className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[12px] text-slate-500">Sign Out</span>
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => { setMobileMenuOpen(false); setCurrentView('login') }} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[12px] font-semibold text-slate-900">Partner Login</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ===== MAIN CONTENT ===== */}
      <main className="lg:ml-[200px] h-screen flex flex-col overflow-hidden">

        {/* ===== DESKTOP TOP HEADER BAR ===== */}
        <div className="hidden lg:block shrink-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200 shadow-sm px-4 lg:px-8 py-4">
          <div className="flex items-center justify-end gap-2.5">
            <div className="flex items-center gap-2.5">
            {isPartner && profile ? (
              <>
                <span className="text-[12px] font-medium text-slate-500 mr-1">{profile.first_name} {profile.last_name}</span>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-300 hover:bg-slate-50 transition-all active:scale-[0.98]"
                >
                  <Sun className="w-3.5 h-3.5" />
                  Guest Mode
                </button>
                {/* Partners Login — HIDDEN */}
                <a
                  href="https://brokerpack.tqltpo.com/broker-apply"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white tql-bg-teal transition-all active:scale-[0.98]"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Get Approved
                </a>
              </>
            )}
            </div>
          </div>
        </div>

        {/* ===== STICKY RESULTS SUMMARY BAR ===== */}
        {result && targetPricing && (
            <div
              className="shrink-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-200 px-4 lg:px-6 py-2.5 transition-all duration-200"
              style={{ transform: stickyBarVisible ? 'translateY(0)' : 'translateY(-100%)', opacity: stickyBarVisible ? 1 : 0 }}
            >
              <div className="max-w-6xl mx-auto flex items-center gap-4 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tql-text-link bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-[4px] shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full tql-bg-teal" />Live
                </span>
                <div className="flex items-center gap-4 flex-wrap text-sm">
                  <div>
                    <span className="font-bold text-slate-900 tabular-nums">{formatPercent(targetPricing.rate)}</span>
                    <span className="text-[10px] text-slate-400 ml-1 uppercase">Rate</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 tabular-nums">{targetPricing.price.toFixed(3)}</span>
                    <span className="text-[10px] text-slate-400 ml-1 uppercase">Price</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 tabular-nums">{formatPercent(targetPricing.apr)}</span>
                    <span className="text-[10px] text-slate-400 ml-1 uppercase">APR</span>
                  </div>
                  {targetPricing.payment > 0 && (
                    <div>
                      <span className="font-semibold text-slate-900 tabular-nums">{formatCurrency(targetPricing.payment)}</span>
                      <span className="text-[10px] text-slate-400 ml-1 uppercase">Pmt</span>
                    </div>
                  )}
                  <div>
                    <span className="font-semibold text-slate-900 tabular-nums">{safeNumber(result.ltvRatio).toFixed(1)}%</span>
                    <span className="text-[10px] text-slate-400 ml-1 uppercase">LTV</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* ===== FORM SECTION ===== */}
        <div className="flex-1 overflow-y-auto">
        <div className="px-4 lg:px-8 py-6 max-w-6xl mx-auto">

          {/* ===== SCENARIO GATE — HIDDEN ===== */}

          <form id="pricing-form" onSubmit={handleSubmit} className={`space-y-6 transition-opacity duration-300 ${!formEnabled ? 'opacity-40 pointer-events-none select-none' : ''}`}>

            {/* ===== LOAN INFORMATION SECTION ===== */}
            <div id="section-loan" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <button type="button" onClick={() => toggleSection('loan')} className="flex items-center justify-between w-full pb-1.5 mb-2 border-b border-slate-200">
                <span className="text-base font-semibold tracking-wide text-slate-800">Loan Information</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${!collapsedSections.has('loan') ? 'rotate-180' : ''}`} />
              </button>
              {!collapsedSections.has('loan') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-4">
                  {/* Row 1: Lien Position, Loan Purpose, Value/Sales Price, Loan Amount, LTV, CLTV */}
                  <div className="space-y-1.5">
                    <label htmlFor="lienPosition" className="block text-sm font-medium text-slate-900">Lien Position</label>
                    <Select name="lienPosition" value={formData.lienPosition} onValueChange={(v) => handleInputChange('lienPosition', v)}>
                      <SelectTrigger id="lienPosition" className="h-11 text-sm border-slate-300 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1st">1st</SelectItem>
                        <SelectItem value="2nd">2nd</SelectItem>
                        <SelectItem value="heloc">HELOC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="loanPurpose" className={`block text-sm font-medium ${hasError('loanPurpose') ? 'text-[#EF4444]' : 'text-slate-900'}`}>Loan Purpose *</label>
                    <Select name="loanPurpose" value={formData.loanPurpose} onValueChange={(v) => handleInputChange('loanPurpose', v)}>
                      <SelectTrigger id="loanPurpose" className={`h-11 text-sm border-slate-300 focus:ring-blue-500 ${hasError('loanPurpose') ? 'border-red-500' : ''}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="purchase">Purchase</SelectItem>
                        <SelectItem value="refinance">Refi Rate/Term</SelectItem>
                        <SelectItem value="cashout">Refinance Cashout</SelectItem>
                      </SelectContent>
                    </Select>
                    {hasError('loanPurpose') && <p className="text-[10px] text-[#EF4444]">{validationErrors.loanPurpose}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="propertyValue" className={`block text-sm font-medium ${hasError('propertyValue') ? 'text-[#EF4444]' : 'text-slate-900'}`}>Value/Sales Price *</label>
                    <Input id="propertyValue" name="propertyValue" value={formData.propertyValue} onChange={(e) => handleInputChange('propertyValue', formatNumberInput(e.target.value))} icon={<DollarSign className="w-3.5 h-3.5" />} className={`h-11 text-sm border-slate-300 focus:ring-blue-500 ${hasError('propertyValue') ? 'border-red-500' : ''}`} />
                    {hasError('propertyValue') && <p className="text-[10px] text-[#EF4444]">{validationErrors.propertyValue}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="loanAmount" className={`block text-sm font-medium ${hasError('loanAmount') ? 'text-[#EF4444]' : 'text-slate-900'}`}>Loan Amount *</label>
                    <Input id="loanAmount" name="loanAmount" value={formData.loanAmount} onChange={(e) => handleInputChange('loanAmount', formatNumberInput(e.target.value))} icon={<DollarSign className="w-3.5 h-3.5" />} className={`h-11 text-sm border-slate-300 focus:ring-blue-500 ${hasError('loanAmount') ? 'border-red-500' : ''}`} />
                    {hasError('loanAmount') && <p className="text-[10px] text-[#EF4444]">{validationErrors.loanAmount}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="ltv" className="block text-sm font-medium text-slate-900">LTV</label>
                    <div className="relative">
                      <Input id="ltv" name="ltv" value={formData.ltv} onChange={(e) => handleInputChange('ltv', e.target.value.replace(/[^0-9.]/g, ''))} className="h-11 text-sm border-slate-300 focus:ring-blue-500 pr-6 bg-slate-50" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">%</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="cltv" className="block text-sm font-medium text-slate-900">CLTV</label>
                    <div id="cltv" className="h-8 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-xs font-medium text-slate-600 flex items-center">{formData.ltv ? `${formData.ltv}%` : '—'}</div>
                  </div>
                  {/* Row 2: Term, Amortization, Payment, Impound Type, Lock Period, Cashout Amount */}
                  <div className="space-y-1.5">
                    <label htmlFor="loanTerm" className={`block text-sm font-medium ${hasError('loanTerm') ? 'text-[#EF4444]' : 'text-slate-900'}`}>Term *</label>
                    <Select name="loanTerm" value={formData.loanTerm} onValueChange={(v) => handleInputChange('loanTerm', v)}>
                      <SelectTrigger id="loanTerm" className={`h-11 text-sm border-slate-300 focus:ring-blue-500 ${hasError('loanTerm') ? 'border-red-500' : ''}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 Year</SelectItem>
                        <SelectItem value="25">25 Year</SelectItem>
                        <SelectItem value="20">20 Year</SelectItem>
                        <SelectItem value="15">15 Year</SelectItem>
                        <SelectItem value="10">10 Year</SelectItem>
                      </SelectContent>
                    </Select>
                    {hasError('loanTerm') && <p className="text-[10px] text-[#EF4444]">{validationErrors.loanTerm}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="amortization" className="block text-sm font-medium text-slate-900">Amortization</label>
                    <Select name="amortization" value={formData.amortization} onValueChange={(v) => handleInputChange('amortization', v)}>
                      <SelectTrigger id="amortization" className="h-11 text-sm border-slate-300 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed</SelectItem>
                        <SelectItem value="arm3">3 Year ARM</SelectItem>
                        <SelectItem value="arm5">5 Year ARM</SelectItem>
                        <SelectItem value="arm7">7 Year ARM</SelectItem>
                        <SelectItem value="arm10">10 Year ARM</SelectItem>
                        <SelectItem value="other40">Other/40 Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="paymentType" className="block text-sm font-medium text-slate-900">Payment</label>
                    <Select name="paymentType" value={formData.paymentType} onValueChange={(v) => handleInputChange('paymentType', v)}>
                      <SelectTrigger id="paymentType" className="h-11 text-sm border-slate-300 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pi">P&I</SelectItem>
                        <SelectItem value="io">Interest Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="impoundType" className="block text-sm font-medium text-slate-900">Impound Type</label>
                    <Select name="impoundType" value={formData.impoundType} onValueChange={(v) => handleInputChange('impoundType', v)}>
                      <SelectTrigger id="impoundType" className="h-11 text-sm border-slate-300 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="escrowed">Taxes and Insurance Escrowed</SelectItem>
                        <SelectItem value="noescrow">No Escrow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="lockPeriod" className="block text-sm font-medium text-slate-900">Lock Period</label>
                    <Select name="lockPeriod" value={formData.lockPeriod} onValueChange={(v) => handleInputChange('lockPeriod', v)}>
                      <SelectTrigger id="lockPeriod" className="h-11 text-sm border-slate-300 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30</SelectItem>
                        <SelectItem value="45">45</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="cashoutAmount" className="block text-sm font-medium text-slate-900">Cashout Amount</label>
                    <Input id="cashoutAmount" name="cashoutAmount" value={formData.cashoutAmount} onChange={(e) => handleInputChange('cashoutAmount', formatNumberInput(e.target.value))} icon={<DollarSign className="w-3.5 h-3.5" />} className="h-11 text-sm border-slate-300 focus:ring-blue-500" />
                  </div>
                </div>
              )}
            </div>

            {/* ===== PROPERTY DETAILS SECTION ===== */}
            <div id="section-property" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <button type="button" onClick={() => toggleSection('property')} className="flex items-center justify-between w-full pb-1.5 mb-2 border-b border-slate-200">
                <span className="text-base font-semibold tracking-wide text-slate-800">Property Details</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${!collapsedSections.has('property') ? 'rotate-180' : ''}`} />
              </button>
              {!collapsedSections.has('property') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-4">
                  {/* Row 1: Property Use, Property Type, ZIP Code, State, County, City */}
                  <div className="space-y-1.5">
                    <label htmlFor="occupancyType" className={`block text-sm font-medium ${hasError('occupancyType') ? 'text-[#EF4444]' : 'text-slate-900'}`}>Property Use *</label>
                    <Select name="occupancyType" value={formData.occupancyType} onValueChange={(v) => handleInputChange('occupancyType', v)}>
                      <SelectTrigger id="occupancyType" className={`h-11 text-sm border-slate-300 focus:ring-blue-500 ${hasError('occupancyType') ? 'border-red-500' : ''}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">Primary Residence</SelectItem>
                        <SelectItem value="secondary">Second Home</SelectItem>
                        <SelectItem value="investment">Investment</SelectItem>
                      </SelectContent>
                    </Select>
                    {hasError('occupancyType') && <p className="text-[10px] text-[#EF4444]">{validationErrors.occupancyType}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="propertyType" className={`block text-sm font-medium ${hasError('propertyType') ? 'text-[#EF4444]' : 'text-slate-900'}`}>Property Type *</label>
                    <Select name="propertyType" value={formData.propertyType} onValueChange={(v) => handleInputChange('propertyType', v)}>
                      <SelectTrigger id="propertyType" className={`h-11 text-sm border-slate-300 focus:ring-blue-500 ${hasError('propertyType') ? 'border-red-500' : ''}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sfr">Single Family</SelectItem>
                        <SelectItem value="condo">Condo</SelectItem>
                        <SelectItem value="townhouse">Townhouse</SelectItem>
                        <SelectItem value="2unit">2 Unit</SelectItem>
                        <SelectItem value="3unit">3 Unit</SelectItem>
                        <SelectItem value="4unit">4 Unit</SelectItem>
                        <SelectItem value="5-8unit">MultiFamily 5-8</SelectItem>
                        <SelectItem value="blanket" disabled className="text-gray-400">Blanket Investor</SelectItem>
                      </SelectContent>
                    </Select>
                    {hasError('propertyType') && <p className="text-[10px] text-[#EF4444]">{validationErrors.propertyType}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="propertyZip" className={`block text-sm font-medium ${hasError('propertyZip') ? 'text-[#EF4444]' : 'text-slate-900'}`}>
                      ZIP Code * {zipLoading && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}
                    </label>
                    <Input id="propertyZip" name="propertyZip" maxLength={5} value={formData.propertyZip} onChange={(e) => handleInputChange('propertyZip', e.target.value.replace(/\D/g, ''))} className={`h-11 text-sm border-slate-300 focus:ring-blue-500 ${hasError('propertyZip') ? 'border-red-500' : ''}`} placeholder="ZIP" autoComplete="postal-code" />
                    {hasError('propertyZip') && <p className="text-[10px] text-[#EF4444]">{validationErrors.propertyZip}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="propertyState" className={`block text-sm font-medium ${hasError('propertyState') ? 'text-[#EF4444]' : 'text-slate-900'}`}>State *</label>
                    <Select name="propertyState" value={formData.propertyState} onValueChange={(v) => handleInputChange('propertyState', v)}>
                      <SelectTrigger id="propertyState" className={`h-11 text-sm border-slate-300 focus:ring-blue-500 ${hasError('propertyState') ? 'border-red-500' : ''}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                    {hasError('propertyState') && <p className="text-[10px] text-[#EF4444]">{validationErrors.propertyState}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="propertyCounty" className="block text-sm font-medium text-slate-900">County</label>
                    <Input id="propertyCounty" name="propertyCounty" value={formData.propertyCounty} onChange={(e) => handleInputChange('propertyCounty', e.target.value)} className="h-11 text-sm border-slate-300 focus:ring-blue-500" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="propertyCity" className="block text-sm font-medium text-slate-900">City</label>
                    <Input id="propertyCity" name="propertyCity" value={formData.propertyCity} onChange={(e) => handleInputChange('propertyCity', e.target.value)} className="h-11 text-sm border-slate-300 focus:ring-blue-500" autoComplete="address-level2" />
                  </div>
                  {/* Row 2: Structure Type + pill toggles inline */}
                  <div className="space-y-1.5">
                    <label htmlFor="structureType" className="block text-sm font-medium text-slate-900">Structure Type</label>
                    <Select name="structureType" value={formData.structureType} onValueChange={(v) => handleInputChange('structureType', v)}>
                      <SelectTrigger id="structureType" className="h-11 text-sm border-slate-300 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="detached">Detached</SelectItem>
                        <SelectItem value="attached">Attached</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 sm:col-span-2 md:col-span-2 lg:col-span-5 flex flex-wrap items-end gap-2 pb-0.5">
                    <label htmlFor="isRuralProperty" className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all border ${formData.isRuralProperty ? 'tql-bg-teal text-white tql-border-teal shadow-sm' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                      <input type="checkbox" id="isRuralProperty" name="isRuralProperty" className="sr-only" tabIndex={-1} checked={formData.isRuralProperty} onChange={(e) => handleInputChange('isRuralProperty', e.target.checked)} />
                      Rural Property
                    </label>
                    <label htmlFor="isNonWarrantableProject" className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all border ${formData.isNonWarrantableProject ? 'tql-bg-teal text-white tql-border-teal shadow-sm' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                      <input type="checkbox" id="isNonWarrantableProject" name="isNonWarrantableProject" className="sr-only" tabIndex={-1} checked={formData.isNonWarrantableProject} onChange={(e) => handleInputChange('isNonWarrantableProject', e.target.checked)} />
                      Non-Warrantable
                    </label>
                    <label htmlFor="isMixedUsePML" className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all border ${formData.isMixedUsePML ? 'tql-bg-teal text-white tql-border-teal shadow-sm' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                      <input type="checkbox" id="isMixedUsePML" name="isMixedUsePML" className="sr-only" tabIndex={-1} checked={formData.isMixedUsePML} onChange={(e) => handleInputChange('isMixedUsePML', e.target.checked)} />
                      Mixed Use
                    </label>
                    <label htmlFor="is5PlusUnits" className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all border ${formData.is5PlusUnits ? 'tql-bg-teal text-white tql-border-teal shadow-sm' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                      <input type="checkbox" id="is5PlusUnits" name="is5PlusUnits" className="sr-only" tabIndex={-1} checked={formData.is5PlusUnits} onChange={(e) => handleInputChange('is5PlusUnits', e.target.checked)} />
                      5+ Units
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* ===== BORROWER DETAILS SECTION ===== */}
            <div id="section-borrower" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <button type="button" onClick={() => toggleSection('borrower')} className="flex items-center justify-between w-full pb-1.5 mb-2 border-b border-slate-200">
                <span className="text-base font-semibold tracking-wide text-slate-800">Borrower Details</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${!collapsedSections.has('borrower') ? 'rotate-180' : ''}`} />
              </button>
              {!collapsedSections.has('borrower') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="creditScore" className={`block text-sm font-medium ${hasError('creditScore') ? 'text-[#EF4444]' : 'text-slate-900'}`}>Credit Score *</label>
                    <Input id="creditScore" name="creditScore" maxLength={3} value={formData.creditScore} onChange={(e) => handleInputChange('creditScore', e.target.value.replace(/\D/g, ''))} className={`h-11 text-sm border-slate-300 focus:ring-blue-500 ${hasError('creditScore') ? 'border-red-500' : ''}`} />
                    {hasError('creditScore') && <p className="text-[10px] text-[#EF4444]">{validationErrors.creditScore}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="dti" className={`block text-sm font-medium ${hasError('dti') ? 'text-[#EF4444]' : 'text-slate-900'}`}>DTI % *</label>
                    <Input id="dti" name="dti" maxLength={2} value={formData.dti} onChange={(e) => handleInputChange('dti', e.target.value.replace(/\D/g, ''))} className={`h-11 text-sm border-slate-300 focus:ring-blue-500 ${hasError('dti') ? 'border-red-500' : ''}`} />
                    {hasError('dti') && <p className="text-[10px] text-[#EF4444]">{validationErrors.dti}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="citizenship" className="block text-sm font-medium text-slate-900">Citizenship</label>
                    <Select name="citizenship" value={formData.citizenship} onValueChange={(v) => handleInputChange('citizenship', v)}>
                      <SelectTrigger id="citizenship" className="h-11 text-sm border-slate-300 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="usCitizen">US Citizen</SelectItem>
                        <SelectItem value="permanentResident">Permanent Resident</SelectItem>
                        <SelectItem value="nonPermanentResident">Non-Permanent Resident</SelectItem>
                        <SelectItem value="foreignNational">Foreign National</SelectItem>
                        <SelectItem value="itin">ITIN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="documentationType" className={`block text-sm font-medium ${hasError('documentationType') ? 'text-[#EF4444]' : 'text-slate-900'}`}>Doc Type</label>
                    <Select name="documentationType" value={formData.documentationType} onValueChange={(v) => handleInputChange('documentationType', v)}>
                      <SelectTrigger id="documentationType" className={`h-11 text-sm border-slate-300 focus:ring-blue-500 ${hasError('documentationType') ? 'border-red-500' : ''}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fullDoc">Full Document</SelectItem>
                        <SelectItem value="dscr">Debt Service Coverage (DSCR)</SelectItem>
                        <SelectItem value="bankStatement12">12 Mo. Bank Statements</SelectItem>
                        <SelectItem value="bankStatement24">24 Mo. Bank Statements</SelectItem>
                        <SelectItem value="bankStatementOther">Other Bank Statements</SelectItem>
                        <SelectItem value="taxReturns1Yr">1 Yr. Tax Returns</SelectItem>
                        <SelectItem value="voe">VOE</SelectItem>
                        <SelectItem value="assetUtilization">Asset Utilization</SelectItem>
                        <SelectItem value="noRatio">No Ratio</SelectItem>
                      </SelectContent>
                    </Select>
                    {hasError('documentationType') && <p className="text-[10px] text-[#EF4444]">{validationErrors.documentationType}</p>}
                  </div>
                  <div className="col-span-full flex flex-wrap gap-2">
                    <label htmlFor="isSelfEmployed" className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all border ${formData.isSelfEmployed ? 'tql-bg-teal text-white tql-border-teal shadow-sm' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                      <input type="checkbox" id="isSelfEmployed" name="isSelfEmployed" className="sr-only" tabIndex={-1} checked={formData.isSelfEmployed} onChange={(e) => handleInputChange('isSelfEmployed', e.target.checked)} />
                      Self Employed
                    </label>
                    <label htmlFor="isFTHB" className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all border ${formData.isFTHB ? 'tql-bg-teal text-white tql-border-teal shadow-sm' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                      <input type="checkbox" id="isFTHB" name="isFTHB" className="sr-only" tabIndex={-1} checked={formData.isFTHB} onChange={(e) => handleInputChange('isFTHB', e.target.checked)} />
                      FTHB
                    </label>
                    <label htmlFor="hasITIN" className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all border ${formData.hasITIN ? 'tql-bg-teal text-white tql-border-teal shadow-sm' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                      <input type="checkbox" id="hasITIN" name="hasITIN" className="sr-only" tabIndex={-1} checked={formData.hasITIN} onChange={(e) => handleInputChange('hasITIN', e.target.checked)} />
                      Has ITIN
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* ===== INVESTOR DETAILS SECTION (conditional) ===== */}
            {showInvestorDetails && (
              <div id="section-investor" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <button type="button" onClick={() => toggleSection('investor')} className="flex items-center justify-between w-full pb-1.5 mb-2 border-b border-slate-200">
                  <span className="text-base font-semibold tracking-wide text-slate-800">Investor Details</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${!collapsedSections.has('investor') ? 'rotate-180' : ''}`} />
                </button>
                {!collapsedSections.has('investor') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="prepayPeriod" className="block text-sm font-medium text-slate-900">Prepay Period</label>
                      <Select name="prepayPeriod" value={formData.prepayPeriod} onValueChange={(v) => handleInputChange('prepayPeriod', v)}>
                        <SelectTrigger id="prepayPeriod" className="h-11 text-sm border-slate-300 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="60mo">60 Months</SelectItem>
                          <SelectItem value="48mo">48 Months</SelectItem>
                          <SelectItem value="36mo">36 Months</SelectItem>
                          <SelectItem value="24mo">24 Months</SelectItem>
                          <SelectItem value="12mo">12 Months</SelectItem>
                          <SelectItem value="0mo">None</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="prepayType" className="block text-sm font-medium text-slate-900">Prepay Type</label>
                      <Select name="prepayType" value={formData.prepayType} onValueChange={(v) => handleInputChange('prepayType', v)}>
                        <SelectTrigger id="prepayType" className="h-11 text-sm border-slate-300 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5pct">5%</SelectItem>
                          <SelectItem value="3pct">3%</SelectItem>
                          <SelectItem value="5-3-3pct">5-3-3%</SelectItem>
                          <SelectItem value="declining-5-1">Declining 5-1%</SelectItem>
                          <SelectItem value="1pct-oh-mi">1% (OH, MI Only)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {formData.documentationType === 'dscr' && (
                      <>
                        <div className="space-y-1.5">
                          <label htmlFor="dscrEntityType" className="block text-sm font-medium text-slate-900">DSCR Entity Type</label>
                          <Select name="dscrEntityType" value={formData.dscrEntityType} onValueChange={(v) => handleInputChange('dscrEntityType', v)}>
                            <SelectTrigger id="dscrEntityType" className="h-11 text-sm border-slate-300 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="individual">Individual</SelectItem>
                              <SelectItem value="llc">LLC</SelectItem>
                              <SelectItem value="corp">Corp.</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="dscrManualInput" className="block text-sm font-medium text-slate-900">DSCR %</label>
                          <Input id="dscrManualInput" name="dscrManualInput" type="text" inputMode="decimal" placeholder="1.000" value={formData.dscrManualInput}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9.]/g, '')
                              handleInputChange('dscrManualInput', val)
                              const dscrNum = parseFloat(val) || 0
                              const staticExpense = 5000
                              const computedRent = Math.round(dscrNum * staticExpense)
                              handleInputChange('grossRent', computedRent > 0 ? computedRent.toLocaleString() : '5,000')
                              handleInputChange('presentHousingExpense', '5,000')
                            }}
                            icon={<span className="text-xs font-semibold text-gray-500">%</span>}
                            className="h-11 text-sm border-slate-300 focus:ring-blue-500"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-sm font-medium text-slate-900">Range</label>
                          <div className="h-8 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium flex items-center justify-between">
                            <span className={`${calculatedDSCR.ratio >= 1.0 ? 'tql-text-link' : calculatedDSCR.ratio >= 0.75 ? 'text-[#F59E0B]' : 'text-[#EF4444]'}`}>
                              {calculatedDSCR.display}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-2">
                              ({calculatedDSCR.range === '>=1.250' ? '>=1.250' : calculatedDSCR.range === 'noRatio' ? 'No Ratio' : calculatedDSCR.range})
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                    <div className="col-span-full flex flex-wrap gap-2">
                      <label htmlFor="isSeasonalProperty" className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all border ${(formData.isSeasonalProperty || formData.isShortTermRental) ? 'tql-bg-teal text-white tql-border-teal shadow-sm' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                        <input type="checkbox" id="isSeasonalProperty" name="isSeasonalProperty" className="sr-only" tabIndex={-1} checked={formData.isSeasonalProperty || formData.isShortTermRental}
                          onChange={(e) => { handleInputChange('isSeasonalProperty', e.target.checked); handleInputChange('isShortTermRental', e.target.checked) }}
                        />
                        Seasonal / STR
                      </label>
                      <label htmlFor="isCrossCollateralized" className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all border ${formData.isCrossCollateralized ? 'tql-bg-teal text-white tql-border-teal shadow-sm' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                        <input type="checkbox" id="isCrossCollateralized" name="isCrossCollateralized" className="sr-only" tabIndex={-1} checked={formData.isCrossCollateralized} onChange={(e) => handleInputChange('isCrossCollateralized', e.target.checked)} />
                        Cross-Collateralized
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] rounded-lg text-[#EF4444] text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />{error}
              </div>
            )}

            {/* Hidden submit for Enter key */}
            <button type="submit" className="hidden" />
          </form>

          {/* Get Pricing Button */}
          <div className="mt-5 flex justify-center">
            {isLoading ? (
              <div className="w-full max-w-sm">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Processing</span>
                  <span className="text-[11px] font-bold text-slate-900 tabular-nums">{loadingProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(39,39,42,0.1)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${loadingProgress}%`,
                      background: `linear-gradient(90deg, #D1D5DB ${0}%, #71717A ${50}%, #27272A ${100}%)`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <button
                type="submit"
                form="pricing-form"
                className="max-w-xs ml-auto h-12 px-8 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold text-base rounded-xl shadow-md hover:shadow-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                Get Pricing
              </button>
            )}
          </div>
        </div>

        {/* ===== RESULTS SECTION ===== */}
        <div className="mt-6 px-4 lg:px-6 pb-10 max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            {/* Loading — shimmer skeleton placeholder */}
            {isLoading && !result && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="rounded-xl border border-slate-200 bg-white p-8 space-y-4 min-h-[200px]">
                  <div className="skeleton-card h-6 w-2/5 rounded-md" />
                  <div className="skeleton-card h-4 w-3/4 rounded-md" />
                  <div className="skeleton-card h-4 w-1/2 rounded-md" />
                  <div className="grid grid-cols-3 gap-4 pt-2">
                    <div className="skeleton-card h-12 rounded-md" />
                    <div className="skeleton-card h-12 rounded-md" />
                    <div className="skeleton-card h-12 rounded-md" />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Empty state */}
            {!result && !isLoading && (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center min-h-[200px] border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                <BarChart3 className="w-12 h-12 text-slate-300 mb-4" />
                <p className="text-base text-slate-400 font-medium">Enter loan details and click Get Pricing</p>
              </motion.div>
            )}

            {/* Results */}
            {result && (
              <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-4">

                {/* No results — surface the actual API error, not a placeholder. */}
                {(!Array.isArray(result.programs) || result.programs.length === 0) && !obLoading ? (
                  <div className="bg-white border border-[#EF4444]/40 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-[#EF4444] shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-[#EF4444] mb-1">No pricing returned</div>
                        <p className="text-xs tql-text-slate leading-relaxed break-words">
                          {result.apiError || (result as any).mlMessage || 'Optimal Blue returned no eligible products for this scenario.'}
                        </p>
                        <p className="text-[11px] tql-text-muted mt-2 leading-relaxed">
                          Check Loan Type, Occupancy, Doc Type, LTV, FICO, and Property details — or email{' '}
                          <a href="mailto:tposupport@tqlend.com" className="tql-text-teal font-semibold hover:underline">tposupport@tqlend.com</a>{' '}
                          with the scenario for a manual quote.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (!Array.isArray(result.programs) || result.programs.length === 0) && obLoading ? (
                  <div className="bg-white border tql-border-steel rounded-xl p-6 flex items-center gap-4">
                    <div className="relative shrink-0">
                      <Loader2 className="w-6 h-6 tql-text-teal animate-spin" />
                      <span className="absolute -top-1 -right-1"><QuinnGlow size={14} /></span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold tql-text-primary">Quinn AI · Price Search…</div>
                      <p className="text-[11px] tql-text-muted mt-0.5">Pulling rates, LLPAs, and pricing adjustments to find your best fit.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Selected criteria strip — sits above the programs so brokers see the scenario at a glance */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {formData.loanTerm && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider tql-text-primary bg-white border tql-border-steel px-2 py-0.5 rounded">
                          Term <span className="tql-text-teal">{formData.loanTerm}yr</span>
                        </span>
                      )}
                      {formData.amortization && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider tql-text-primary bg-white border tql-border-steel px-2 py-0.5 rounded">
                          Amort <span className="tql-text-teal">{formData.amortization === 'fixed' ? 'Fixed' : formData.amortization.startsWith('arm') ? formData.amortization.replace('arm', 'ARM ').replace(/(\d)(\d)/, '$1/$2') : formData.amortization}</span>
                        </span>
                      )}
                      {formData.occupancyType === 'investment' && formData.prepayPeriod && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider tql-text-primary bg-white border tql-border-steel px-2 py-0.5 rounded">
                          Prepay <span className="tql-text-teal">{formData.prepayPeriod === 'none' || formData.prepayPeriod === '0mo' ? 'None' : formData.prepayPeriod.replace('mo', ' mo').replace('yr', ' yr')}</span>
                        </span>
                      )}
                      {formData.lockPeriod && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider tql-text-primary bg-white border tql-border-steel px-2 py-0.5 rounded">
                          Lock <span className="tql-text-teal">{formData.lockPeriod} days</span>
                        </span>
                      )}
                      {result.apiError && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#EF4444] bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] px-2 py-0.5 rounded">
                          <AlertCircle className="w-3 h-3" />Error
                        </span>
                      )}
                    </div>

                    {/* ===== EMAIL FORM ===== */}
                    {showEmailForm && (
                      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                          <input
                            type="email"
                            placeholder="Enter email address"
                            value={emailTo}
                            onChange={(e) => setEmailTo(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSendEmail() } }}
                            className="flex-1 min-w-0 text-sm bg-transparent outline-none placeholder:text-slate-300 text-slate-900"
                            autoFocus
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSendEmail}
                            disabled={emailSending || !emailTo}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white tql-bg-teal rounded-lg hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {emailSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : emailStatus === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                            {emailSending ? 'Sending...' : emailStatus === 'success' ? 'Sent!' : 'Send'}
                          </button>
                          <button type="button" onClick={() => { setShowEmailForm(false); setEmailStatus('idle') }} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {emailStatus === 'error' && <p className="text-xs text-[#EF4444] sm:ml-6">Failed to send. Please try again.</p>}
                      </div>
                    )}

                    {/* ===== PRICING RESULTS — single broker card (or two for DSCR), full ladder for admin ===== */}
                    {Array.isArray(result.programs) && result.programs.length > 0 ? (() => {
                      // Step 1: dedupe by masked name when broker view (admin keeps every
                      // investor as its own card so raw investor data stays distinct).
                      let sourcePrograms: Program[] = result.programs
                      if (!showRawInvestor) {
                        const byMasked: Record<string, Program> = {}
                        for (const prog of result.programs) {
                          if (!prog) continue
                          const key = prog.name || 'Unknown'
                          if (!byMasked[key]) {
                            byMasked[key] = { ...prog, rateOptions: [...(prog.rateOptions || [])] }
                          } else {
                            byMasked[key].rateOptions = [
                              ...(byMasked[key].rateOptions || []),
                              ...((prog.rateOptions || []) as RateOption[]),
                            ]
                          }
                        }
                        sourcePrograms = Object.values(byMasked)
                      }

                      // Step 2: filter rate options to the 99.000–101.750 band (DSCR 5%
                      // PPP bypasses this so it always renders in DSCR mode).
                      let visiblePrograms = sourcePrograms
                        .map((program) => {
                          if (!program || typeof program !== 'object') return null
                          const allRateOptions = Array.isArray(program.rateOptions) ? program.rateOptions : []
                          const programName = program.name || 'Unknown'
                          const pinned = shouldPinDSCR5Pct(programName)
                          const filteredRateOptions = pinned ? allRateOptions : filterRateOptionsByPrice(allRateOptions)
                          if (filteredRateOptions.length === 0) return null
                          return { program, programName, filteredRateOptions, pinned }
                        })
                        .filter((p): p is { program: Program; programName: string; filteredRateOptions: RateOption[]; pinned: boolean } => p !== null)

                      // Step 3: BROKER VIEW — narrow to the tier-2 program (non-DSCR) or
                      // the 5% PPP + user-selected-prepay-type pair (DSCR). ADMIN VIEW
                      // sees every program with raw investor names.
                      if (!showRawInvestor) {
                        const isDSCR = formData.documentationType === 'dscr'
                        if (isDSCR) {
                          // Map the user's prepayType selection to a regex that matches
                          // the masked program name (e.g. "5%PPP", "3%PPP").
                          const prepayPctMap: Record<string, string> = {
                            '5pct': '5', '3pct': '3', '5-3-3pct': '5', 'declining-5-1': '5', '1pct-oh-mi': '1',
                          }
                          const selectedPct = prepayPctMap[formData.prepayType] || '3'
                          const wantedPpps = Array.from(new Set(['5', selectedPct]))
                          const dscrPicks: typeof visiblePrograms = []
                          for (const pct of wantedPpps) {
                            const re = new RegExp(`\\b${pct}\\s*%\\s*PPP\\b`, 'i')
                            const found = visiblePrograms.find(v => re.test(v.programName))
                            if (found && !dscrPicks.includes(found)) dscrPicks.push(found)
                          }
                          if (dscrPicks.length > 0) visiblePrograms = dscrPicks
                        } else {
                          const tier2 = findSecondBestRate(sourcePrograms)
                          if (tier2) {
                            const target = tier2.program.name
                            const match = visiblePrograms.find(v => v.programName === target)
                            if (match) visiblePrograms = [match]
                          } else if (visiblePrograms.length > 0) {
                            visiblePrograms = [visiblePrograms[0]]
                          }
                        }
                      }

                      // Pinned DSCR 5% PPP rides to the top when DSCR is selected.
                      visiblePrograms.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
                      return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="text-sm font-bold tql-text-primary tql-font-display tracking-tight">More Pricing Options</h3>
                            <span className="hidden sm:inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ color: '#0284C7', background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.38)' }}>
                              <QuinnGlow size={10} withRing={false} />AI Filtered · 99.000–101.750
                            </span>
                          </div>
                          <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {visiblePrograms.length} found
                          </span>
                        </div>
                        {visiblePrograms.map(({ program, programName, filteredRateOptions, pinned }, idx) => {
                          const bestRate = filteredRateOptions.reduce((best, opt) => {
                            const price = pointsToPrice(safeNumber(opt.points))
                            const bestPrice = best ? pointsToPrice(safeNumber(best.points)) : Infinity
                            return Math.abs(price - 100) < Math.abs(bestPrice - 100) ? opt : best
                          }, filteredRateOptions[0])
                          const bestPayment = bestRate ? safeNumber(bestRate.payment) : 0
                          const isExpanded = expandedProgram === programName
                          const isSelectedPrepay = formData.occupancyType === 'investment' && programMatchesPrepay(programName, formData.prepayPeriod)
                          // Admin-only raw investor reveal — broker view stays masked.
                          // Show "<rawProduct>" · "<rawInvestor>" so all underlying
                          // investors are distinguishable in the admin view.
                          const displayName = showRawInvestor && program.rawName
                            ? `${program.rawName}${program.rawInvestor ? ` · ${program.rawInvestor}` : ''}`
                            : programName

                          return (
                            <div key={idx} className={`rounded-xl overflow-hidden border transition-all bg-white ${pinned ? 'tql-border-teal shadow-[0_2px_12px_rgba(36,95,115,0.15)]' : isSelectedPrepay ? 'border-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.04)]' : isExpanded ? 'border-[#D1D5DB] shadow-[0_1px_3px_rgba(0,0,0,0.04)]' : 'border-slate-200'}`}>
                              <div className="px-4 py-3">
                                <div className="flex items-center justify-between mb-2.5">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <div className="font-bold text-[13px] tql-text-primary tql-font-display tracking-tight">{displayName}</div>
                                      {showRawInvestor && (
                                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: '#0284C7', background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.38)' }}>Raw · Admin</span>
                                      )}
                                      {pinned && (
                                        <span className="shrink-0 text-[9px] font-bold text-white tql-bg-teal px-1.5 py-0.5 rounded uppercase tracking-wider">DSCR Default · 5% PPP</span>
                                      )}
                                      {isSelectedPrepay && !pinned && (
                                        <span className="shrink-0 text-[9px] font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wider">Selected Prepay</span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">{filteredRateOptions.length} rate option{filteredRateOptions.length !== 1 ? 's' : ''}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setShowEmailForm(!showEmailForm) }}
                                      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
                                    >
                                      <Mail className="w-3 h-3" />Email Results
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedProgram(isExpanded ? null : programName)}
                                      className={`inline-flex items-center gap-2 px-4 py-2 text-[12px] font-bold uppercase tracking-wider rounded-lg transition-all shadow-sm ${isExpanded ? 'text-white tql-bg-teal border tql-border-teal shadow-[0_2px_8px_rgba(36,95,115,0.25)]' : 'tql-text-teal bg-white border-2 tql-border-teal hover:tql-bg-teal hover:text-white'}`}
                                    >
                                      EXPAND PRICING OPTIONS
                                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                  <div>
                                    <div className="text-lg font-bold text-slate-900 tabular-nums">{bestRate ? safeNumber(bestRate.rate).toFixed(3) : '-'}%</div>
                                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Rate</div>
                                  </div>
                                  <div>
                                    <div className="text-lg font-bold text-slate-900 tabular-nums">{bestRate ? (100 - safeNumber(bestRate.points)).toFixed(3) : '-'}</div>
                                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Price</div>
                                  </div>
                                  <div>
                                    <div className="text-lg font-bold text-slate-900 tabular-nums">{bestRate ? safeNumber(bestRate.apr).toFixed(3) : '-'}%</div>
                                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">APR</div>
                                  </div>
                                  <div>
                                    <div className="text-lg font-bold text-slate-900 tabular-nums">{bestPayment > 0 ? formatCurrency(bestPayment) : '-'}</div>
                                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Payment</div>
                                  </div>
                                </div>
                              </div>

                              {/* Expanded Rate Options — full 99.000–101.750 ladder per program */}
                              {isExpanded && filteredRateOptions.length > 0 && (() => {
                                const optionsToShow = filteredRateOptions
                                return (
                                <div className="border-t tql-border-steel">
                                  {/* Desktop table — overflow-visible so Actions dropdown is NOT clipped */}
                                  <div className="hidden sm:block px-4 py-2 overflow-visible">
                                    <table className="w-full text-xs table-auto">
                                      <thead>
                                        <tr className="text-slate-400 border-b tql-border-steel text-[10px] uppercase tracking-wider">
                                          <th className="text-left py-2 pr-2 font-medium">Actions</th>
                                          <th className="text-left py-2 pr-2 font-medium">Program/PPP</th>
                                          <th className="text-right py-2 px-2 font-medium">Rate</th>
                                          <th className="text-right py-2 px-2 font-medium">Price</th>
                                          <th className="text-right py-2 px-2 font-medium">APR</th>
                                          <th className="text-right py-2 px-2 font-medium">Payment</th>
                                          <th className="text-right py-2 pl-2 pr-1 font-medium whitespace-nowrap w-[88px]">Adj</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {optionsToShow.map((opt, optIdx) => {
                                          if (!opt || typeof opt !== 'object') return null
                                          const points = safeNumber(opt.points)
                                          const price = safeNumber(opt.price) || pointsToPrice(points)
                                          const isClosestTo100 = bestRate === opt
                                          const payment = safeNumber(opt.payment)
                                          const adjustments = opt.adjustments || []
                                          const totalAdjustment = adjustments.reduce((sum, adj) => sum + (adj.amount || 0), 0)
                                          const isActiveRow = activeRowAction?.programName === programName && activeRowAction?.optIdx === optIdx
                                          return (
                                          <Fragment key={optIdx}>
                                            <tr className={`border-t border-slate-200 ${isClosestTo100 ? 'bg-slate-50' : ''} ${isActiveRow ? 'bg-yellow-50/50' : ''}`}>
                                              <td className="py-2 pr-2 text-left">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    const key = `${programName}-${optIdx}`
                                                    if (openActionDropdown === key) {
                                                      setOpenActionDropdown(null)
                                                    } else {
                                                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                                      setActionDropdownRect({ top: rect.bottom + 4, left: rect.left, width: rect.width })
                                                      setOpenActionDropdown(key)
                                                    }
                                                  }}
                                                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white tql-bg-teal rounded-md shadow-[0_1px_3px_rgba(36,95,115,0.3)] hover:shadow-[0_2px_8px_rgba(36,95,115,0.4)] transition-all whitespace-nowrap"
                                                >
                                                  Actions <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openActionDropdown === `${programName}-${optIdx}` ? 'rotate-180' : ''}`} />
                                                </button>
                                                {openActionDropdown === `${programName}-${optIdx}` && actionDropdownRect && createPortal(
                                                  <div
                                                    style={{ position: 'fixed', top: actionDropdownRect.top, left: actionDropdownRect.left, zIndex: 9999 }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="bg-white rounded-xl shadow-[0_12px_32px_rgba(15,23,42,0.18)] border tql-border-steel py-2 min-w-[220px] overflow-hidden"
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        setActiveRowAction(isActiveRow && activeRowAction?.type === 'reserve' ? null : {
                                                          type: 'reserve', programName, optIdx,
                                                          rate: safeNumber(opt.rate), price, payment,
                                                          apr: safeNumber(opt.apr), description: opt.description || programName
                                                        })
                                                        setRowReserveFields({ name: '', email: '', scenarioName: '', confirmed: false })
                                                        setRowStatus('idle')
                                                        setOpenActionDropdown(null)
                                                      }}
                                                      className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-[12px] font-semibold tql-text-primary hover:bg-[color:var(--tql-bg)] hover:tql-text-teal transition-colors"
                                                    >
                                                      <Lock className="w-3.5 h-3.5" />
                                                      Reserve Pricing
                                                    </button>
                                                    {isPartner && (
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation()
                                                          setActiveRowAction(isActiveRow && activeRowAction?.type === 'lock' ? null : {
                                                            type: 'lock', programName, optIdx,
                                                            rate: safeNumber(opt.rate), price, payment,
                                                            apr: safeNumber(opt.apr), description: opt.description || programName
                                                          })
                                                          setRowLockFields({ name: '', email: '', loanNumber: '' })
                                                          setRowStatus('idle')
                                                          setOpenActionDropdown(null)
                                                        }}
                                                        className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-[12px] font-semibold tql-text-primary hover:bg-[color:var(--tql-bg)] hover:tql-text-teal transition-colors"
                                                      >
                                                        <ShieldCheck className="w-3.5 h-3.5" />
                                                        Request Lock
                                                      </button>
                                                    )}
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        setOpenActionDropdown(null)
                                                        setFlashSubmitError(null)
                                                        setFlashSubmitRate({
                                                          programName,
                                                          rate: safeNumber(opt.rate),
                                                          price,
                                                          apr: safeNumber(opt.apr),
                                                          payment,
                                                          points: safeNumber(opt.points),
                                                          lockPeriod: opt.lockPeriod,
                                                          adjustments: opt.adjustments || [],
                                                        })
                                                      }}
                                                      className="flex items-center gap-2 w-full text-left px-4 py-2.5 mt-1 text-[12px] font-bold uppercase tracking-wide text-white tql-bg-teal hover:opacity-90 transition-colors"
                                                    >
                                                      <Zap className="w-3.5 h-3.5" />
                                                      FLASH SUBMIT → UPLOAD 3.4
                                                    </button>
                                                  </div>,
                                                  document.body
                                                )}
                                              </td>
                                              <td className="py-2 pr-2 text-left"><div className="font-medium text-[10px] text-slate-900 whitespace-nowrap" title={opt.description || ''}>{opt.description || programName}</div></td>
                                              <td className="py-2 px-2 text-right font-semibold text-slate-900 tabular-nums">{safeNumber(opt.rate).toFixed(3)}%</td>
                                              <td className={`py-2 px-2 text-right tabular-nums ${price >= 100 ? 'tql-text-link font-medium' : 'text-slate-900'}`}>{price.toFixed(3)}</td>
                                              <td className="py-2 px-2 text-right tabular-nums text-slate-900">{safeNumber(opt.apr).toFixed(3)}%</td>
                                              <td className="py-2 px-2 text-right font-medium tabular-nums text-slate-900">{payment > 0 ? formatCurrency(payment) : '-'}</td>
                                              <td className="py-2 pl-2 pr-1 text-right tabular-nums whitespace-nowrap">
                                                {adjustments.length > 0 ? (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setExpandedAdjRow(expandedAdjRow === `${programName}-${optIdx}` ? null : `${programName}-${optIdx}`) }}
                                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums border tql-border-steel ${totalAdjustment >= 0 ? 'tql-text-link' : 'text-[#EF4444]'} hover:bg-slate-50`}
                                                    title="View itemized LLPAs"
                                                  >
                                                    {totalAdjustment >= 0 ? '+' : ''}{totalAdjustment.toFixed(3)}
                                                    <ChevronDown className={`w-3 h-3 transition-transform ${expandedAdjRow === `${programName}-${optIdx}` ? 'rotate-180' : ''}`} />
                                                  </button>
                                                ) : <span className="text-slate-400">–</span>}
                                              </td>
                                            </tr>
                                            {expandedAdjRow === `${programName}-${optIdx}` && adjustments.length > 0 && (
                                              <tr className="bg-[color:var(--tql-bg)]">
                                                <td colSpan={7} className="px-4 py-3 border-t tql-border-steel">
                                                  <div className="flex items-center justify-between mb-2">
                                                    <div className="text-[10px] font-bold uppercase tracking-widest tql-text-teal">Loan-Level Pricing Adjustments · {safeNumber(opt.rate).toFixed(3)}% @ {price.toFixed(3)}</div>
                                                    <div className={`text-[11px] font-bold tabular-nums ${totalAdjustment >= 0 ? 'tql-text-link' : 'text-[#EF4444]'}`}>Net {totalAdjustment >= 0 ? '+' : ''}{totalAdjustment.toFixed(3)}</div>
                                                  </div>
                                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                                    {adjustments.map((adj: Adjustment, i: number) => (
                                                      <div key={i} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-white border tql-border-steel">
                                                        <span className="text-[11px] tql-text-primary truncate" title={adj.description}>{adj.description}</span>
                                                        <span className={`text-[11px] font-semibold tabular-nums ${adj.amount >= 0 ? 'tql-text-link' : 'text-[#EF4444]'}`}>
                                                          {adj.amount >= 0 ? '+' : ''}{adj.amount.toFixed(3)}
                                                        </span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </td>
                                              </tr>
                                            )}
                                          </Fragment>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Per-row action form */}
                                  {activeRowAction && activeRowAction.programName === programName && (
                                    <div className="mx-4 mb-3 mt-1 border border-slate-200 rounded-xl p-4 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                                      <div className="flex items-center justify-between mb-3">
                                        <div>
                                          <div className="text-sm font-bold text-slate-900">
                                            {activeRowAction.type === 'reserve' ? 'Reserve Rate & Pricing' : 'Request Rate Lock'}
                                          </div>
                                          <div className="text-[11px] text-slate-500 mt-0.5">
                                            {formatPercent(activeRowAction.rate)} @ {activeRowAction.price.toFixed(3)} &mdash; {activeRowAction.description}
                                          </div>
                                        </div>
                                        <button type="button" onClick={() => { setActiveRowAction(null); setRowStatus('idle') }} className="p-1 text-slate-400 hover:text-slate-900 transition-colors">
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>

                                      {activeRowAction.type === 'reserve' ? (
                                        <div className="space-y-3">
                                          <p className="text-xs text-slate-500 leading-relaxed max-w-md">
                                            Confirm you would like to reserve this Rate &amp; Pricing. This quote expires after 48 hours unless a full file is submitted.
                                          </p>
                                          <label className="flex items-start gap-2 cursor-pointer">
                                            <input type="checkbox" checked={rowReserveFields.confirmed} onChange={(e) => setRowReserveFields(prev => ({ ...prev, confirmed: e.target.checked }))} className="mt-0.5 w-4 h-4 rounded border-[#D1D5DB] text-slate-900 focus:ring-[#245F73]" />
                                            <span className="text-xs text-slate-900 leading-relaxed">I confirm and understand the 48-hour expiration policy</span>
                                          </label>
                                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <input type="text" placeholder="Your Name *" value={rowReserveFields.name} onChange={(e) => setRowReserveFields(prev => ({ ...prev, name: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                                            <input type="email" placeholder="Email *" value={rowReserveFields.email} onChange={(e) => setRowReserveFields(prev => ({ ...prev, email: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                                            <input type="text" placeholder="Scenario Name" value={rowReserveFields.scenarioName} onChange={(e) => setRowReserveFields(prev => ({ ...prev, scenarioName: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <button type="button" onClick={handleRowReserve} disabled={rowSending || !rowReserveFields.confirmed || !rowReserveFields.name || !rowReserveFields.email} className="inline-flex items-center gap-1.5 px-5 py-2 text-[13px] font-semibold text-white tql-bg-teal rounded-lg hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                              {rowSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : rowStatus === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                                              {rowSending ? 'Sending...' : rowStatus === 'success' ? 'Sent!' : 'Send Reservation'}
                                            </button>
                                            {rowStatus === 'error' && <p className="text-xs text-[#EF4444]">Failed to send. Please try again.</p>}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-3">
                                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <input type="text" placeholder="Your Name *" value={rowLockFields.name} onChange={(e) => setRowLockFields(prev => ({ ...prev, name: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                                            <input type="email" placeholder="Email *" value={rowLockFields.email} onChange={(e) => setRowLockFields(prev => ({ ...prev, email: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                                            <input type="text" placeholder="TQL Loan Number *" value={rowLockFields.loanNumber} onChange={(e) => setRowLockFields(prev => ({ ...prev, loanNumber: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <button type="button" onClick={handleRowLock} disabled={rowSending || !rowLockFields.name || !rowLockFields.email || !rowLockFields.loanNumber} className="inline-flex items-center gap-1.5 px-5 py-2 text-[13px] font-semibold text-white tql-bg-teal rounded-lg hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                              {rowSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : rowStatus === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                                              {rowSending ? 'Sending...' : rowStatus === 'success' ? 'Sent!' : 'Send Lock Request'}
                                            </button>
                                            {rowStatus === 'error' && <p className="text-xs text-[#EF4444]">Failed to send. Please try again.</p>}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Mobile stacked cards */}
                                  <div className="sm:hidden divide-y divide-[rgba(39,39,42,0.15)]">
                                    {optionsToShow.map((opt, optIdx) => {
                                      if (!opt || typeof opt !== 'object') return null
                                      const points = safeNumber(opt.points)
                                      const price = safeNumber(opt.price) || pointsToPrice(points)
                                      const isClosestTo100 = bestRate === opt
                                      const payment = safeNumber(opt.payment)
                                      return (
                                        <div key={optIdx} className={`px-4 py-3 ${isClosestTo100 ? 'bg-slate-50' : ''}`}>
                                          <div className="text-[11px] font-medium text-slate-900 mb-2">{opt.description || programName}</div>
                                          <div className="grid grid-cols-4 gap-2 text-center">
                                            <div>
                                              <div className="text-[13px] font-bold text-slate-900 tabular-nums">{safeNumber(opt.rate).toFixed(3)}%</div>
                                              <div className="text-[9px] text-slate-400 uppercase">Rate</div>
                                            </div>
                                            <div>
                                              <div className={`text-[13px] font-bold tabular-nums ${price >= 100 ? 'tql-text-link' : 'text-slate-900'}`}>{price.toFixed(3)}</div>
                                              <div className="text-[9px] text-slate-400 uppercase">Price</div>
                                            </div>
                                            <div>
                                              <div className="text-[13px] font-bold text-slate-900 tabular-nums">{safeNumber(opt.apr).toFixed(3)}%</div>
                                              <div className="text-[9px] text-slate-400 uppercase">APR</div>
                                            </div>
                                            <div>
                                              <div className="text-[13px] font-bold text-slate-900 tabular-nums">{payment > 0 ? formatCurrency(payment) : '-'}</div>
                                              <div className="text-[9px] text-slate-400 uppercase">Pmt</div>
                                            </div>
                                          </div>
                                          <div className="mt-2">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                const key = `m-${programName}-${optIdx}`
                                                if (openActionDropdown === key) {
                                                  setOpenActionDropdown(null)
                                                } else {
                                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                                  setActionDropdownRect({ top: rect.bottom + 4, left: rect.left, width: rect.width })
                                                  setOpenActionDropdown(key)
                                                }
                                              }}
                                              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white tql-bg-teal rounded-md shadow-[0_1px_3px_rgba(36,95,115,0.3)] hover:shadow-[0_2px_8px_rgba(36,95,115,0.4)] transition-all"
                                            >
                                              Actions <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openActionDropdown === `m-${programName}-${optIdx}` ? 'rotate-180' : ''}`} />
                                            </button>
                                            {openActionDropdown === `m-${programName}-${optIdx}` && actionDropdownRect && createPortal(
                                              <div
                                                style={{ position: 'fixed', top: actionDropdownRect.top, left: actionDropdownRect.left, zIndex: 9999 }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="bg-white rounded-lg shadow-[0_8px_24px_rgba(15,23,42,0.12)] border tql-border-steel py-1 min-w-[200px]"
                                              >
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setActiveRowAction({
                                                      type: 'reserve', programName, optIdx,
                                                      rate: safeNumber(opt.rate), price, payment,
                                                      apr: safeNumber(opt.apr), description: opt.description || programName
                                                    })
                                                    setRowReserveFields({ name: '', email: '', scenarioName: '', confirmed: false })
                                                    setRowStatus('idle')
                                                    setOpenActionDropdown(null)
                                                  }}
                                                  className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-[12px] font-semibold tql-text-primary hover:bg-[color:var(--tql-bg)] hover:tql-text-teal transition-colors"
                                                >
                                                  <Lock className="w-3.5 h-3.5" />
                                                  Reserve Pricing
                                                </button>
                                                {isPartner && (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveRowAction({
                                                        type: 'lock', programName, optIdx,
                                                        rate: safeNumber(opt.rate), price, payment,
                                                        apr: safeNumber(opt.apr), description: opt.description || programName
                                                      })
                                                      setRowLockFields({ name: '', email: '', loanNumber: '' })
                                                      setRowStatus('idle')
                                                      setOpenActionDropdown(null)
                                                    }}
                                                    className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-[12px] font-semibold tql-text-primary hover:bg-[color:var(--tql-bg)] hover:tql-text-teal transition-colors"
                                                  >
                                                    <ShieldCheck className="w-3.5 h-3.5" />
                                                    Request Lock
                                                  </button>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setOpenActionDropdown(null)
                                                    setFlashSubmitError(null)
                                                    setFlashSubmitRate({
                                                      programName,
                                                      rate: safeNumber(opt.rate),
                                                      price,
                                                      apr: safeNumber(opt.apr),
                                                      payment,
                                                      points: safeNumber(opt.points),
                                                      lockPeriod: opt.lockPeriod,
                                                      adjustments: opt.adjustments || [],
                                                    })
                                                  }}
                                                  className="flex items-center gap-2 w-full text-left px-4 py-2.5 mt-1 text-[12px] font-bold uppercase tracking-wide text-white tql-bg-teal hover:opacity-90 transition-colors"
                                                >
                                                  <Zap className="w-3.5 h-3.5" />
                                                  FLASH SUBMIT → UPLOAD 3.4
                                                </button>
                                              </div>,
                                              document.body
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>

                                  {/* Adjustments detail (best rate) */}
                                  {bestRate && bestRate.adjustments && bestRate.adjustments.length > 0 && (
                                    <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
                                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Adjustments (Best Rate)</div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                        {bestRate.adjustments.map((adj: Adjustment, adjIdx: number) => (
                                          <div key={adjIdx} className="flex justify-between items-center text-xs bg-white px-2.5 py-1.5 rounded-lg border tql-border-steel">
                                            <span className="tql-text-primary truncate mr-2">{adj.description}</span>
                                            <span className={`font-semibold tabular-nums ${adj.amount >= 0 ? 'tql-text-link' : 'text-[#EF4444]'}`}>
                                              {adj.amount >= 0 ? '+' : ''}{adj.amount.toFixed(3)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                </div>
                                )
                              })()}

                              {isExpanded && filteredRateOptions.length === 0 && (
                                <div className="bg-slate-50 px-4 py-3 text-xs text-slate-400 border-t border-slate-200">
                                  No rate options in price range (99.000 – 101.750)
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      )
                    })() : null}

                    {/* Secondary Access — HIDDEN */}

                    {/* LP Loading */}
                    {(lpUnlocked || formData.isCrossCollateralized) && lpLoading && !lpResult && (
                      <div className="mt-4 border border-slate-200 bg-white rounded-xl p-6 space-y-4">
                        <div className="flex items-center gap-3">
                          <Globe className="w-5 h-5 text-slate-400" />
                          <span className="text-sm text-slate-400 font-medium tracking-wide">Scanning national pricing engines...</span>
                        </div>
                        <div className="skeleton-card h-12 w-full" />
                        <div className="skeleton-card h-12 w-full" />
                        <div className="skeleton h-4 w-40" />
                      </div>
                    )}

                    {/* LP Results */}
                    {(lpUnlocked || formData.isCrossCollateralized) && lpResult && lpResult.rateOptions && lpResult.rateOptions.length > 0 && (() => {
                      const isInvestment = formData.occupancyType === 'investment'
                      const prepayMonths = parseInt(formData.prepayPeriod) || 0
                      const priceCeiling = 103.000
                      const adjustedLpRates = lpResult.rateOptions
                        .map((opt: any) => {
                          const prog = (opt.program || '').toUpperCase()
                          const needsMargin = prog.includes('TITANIUM ADVANTAGE') || prog.includes('CASH FLOW ADVANTAGE')
                          const marginAdj = needsMargin ? 1.375 : 0
                          return {
                            ...opt,
                            price: safeNumber(opt.price) - 0.125 - marginAdj,
                            totalAdjustments: safeNumber(opt.totalAdjustments) - marginAdj,
                          }
                        })
                      const filteredLpRates = (() => {
                        const sorted = adjustedLpRates
                          .filter((opt: any) => opt.price >= 99.500 && opt.price <= priceCeiling)
                          .filter((opt: any, idx: number, arr: any[]) => {
                            const rateStep = Math.round(opt.rate / 0.125) * 0.125
                            return idx === arr.findIndex((o: any) => Math.round(o.rate / 0.125) * 0.125 === rateStep)
                          })
                        const result: any[] = []
                        let lastPrice = -Infinity
                        for (const opt of sorted) {
                          if (result.length > 0 && opt.price <= lastPrice) break
                          result.push(opt)
                          lastPrice = opt.price
                        }
                        return result
                      })()
                      const closestPrice = filteredLpRates.length > 0
                        ? Math.min(...filteredLpRates.map((o: any) => Math.abs(o.price - 100)))
                        : 999
                      const prepayLabel = isInvestment && prepayMonths > 0 ? ` - ${prepayMonths} Month Prepay` : ''
                      return (
                        <div className="mt-4 border border-slate-200 bg-white rounded-xl overflow-hidden">
                          <div className="px-5 pt-5 pb-3">
                            <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                              <div className="flex items-center gap-2.5">
                                <div className="flex items-center justify-center w-8 h-8 rounded-[10px] bg-slate-50">
                                  <Zap className="w-4 h-4 text-slate-900" />
                                </div>
                                <div className="text-base font-semibold text-slate-900 tracking-tight">National Wholesale Rate Results{prepayLabel}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 text-[11px] tql-text-link bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-[4px] font-medium">
                                  <ShieldCheck className="w-3 h-3" />Verified
                                </div>
                                <span className="text-[11px] font-mono text-slate-400">{filteredLpRates.length} rates</span>
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                              <Globe className="w-3 h-3 text-slate-400" />
                              We just checked all of the Industry Leading Pricing Engines for you.
                            </p>
                          </div>
                          <div className="px-5 pb-5">
                            {filteredLpRates.length > 0 ? (
                              <div className="overflow-x-auto rounded-lg border border-slate-200">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-200">
                                      <th className="text-right py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Rate</th>
                                      <th className="text-right py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Price</th>
                                      <th className="text-right py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Payment</th>
                                      <th className="text-right py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Price Adj.</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredLpRates.map((opt: any, idx: number) => {
                                      const isClosest = Math.abs(opt.price - 100) === closestPrice
                                      return (
                                        <tr key={idx} className={`border-t border-slate-100 transition-colors duration-150 ${isClosest ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                                          <td className="py-2.5 px-4 text-right font-semibold text-slate-900 font-mono">{safeNumber(opt.rate).toFixed(3)}%</td>
                                          <td className={`py-2.5 px-4 text-right font-mono ${opt.price >= 100 ? 'tql-text-link font-semibold' : 'text-slate-900'}`}>{safeNumber(opt.price).toFixed(3)}</td>
                                          <td className="py-2.5 px-4 text-right text-slate-900 font-mono">{opt.payment > 0 ? formatCurrency(safeNumber(opt.payment)) : '-'}</td>
                                          <td className="py-2.5 px-4 text-right font-mono">
                                            {opt.totalAdjustments !== 0 ? (
                                              <span className={opt.totalAdjustments > 0 ? 'tql-text-link' : 'text-[#EF4444]'}>
                                                {opt.totalAdjustments > 0 ? '+' : ''}{safeNumber(opt.totalAdjustments).toFixed(3)}
                                              </span>
                                            ) : <span className="text-slate-400">-</span>}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400 text-center py-3">
                                {adjustedLpRates.length} rates returned, none in price range
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })()}

                    {/* LP empty */}
                    {(lpUnlocked || formData.isCrossCollateralized) && !lpLoading && lpResult && (!lpResult.rateOptions || lpResult.rateOptions.length === 0) && (
                      <div className="mt-4 border border-slate-200 bg-white rounded-xl p-6">
                        <div className="flex flex-col items-center gap-2">
                          <Globe className="w-5 h-5 text-slate-400" />
                          <p className="text-sm text-slate-400 text-center">No LP market rates available for this scenario</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <footer className="border-t border-slate-100 bg-white px-6 lg:px-10 py-3 flex items-center justify-between shrink-0">
          <span className="text-[12px] text-slate-500">&copy; 2026 OpenBroker Labs</span>
          <span className="text-[9px] text-slate-400 max-w-xl hidden sm:block">B2B technology platform. Not a lender, broker, or originator. Use at your own risk.</span>
        </footer>
        </div>{/* end scroll wrapper */}
      </main>

      {/* ===== HELP DESK MODAL ===== */}
      {/* ═════════ FLASH SUBMIT REQUEST MODAL ═════════ */}
      {flashSubmitRate && (
        <>
          <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm" onClick={() => !flashSubmitSending && setFlashSubmitRate(null)} />
          <div className="fixed inset-0 z-[301] flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto">
            <div className="w-full max-w-[560px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.3)] overflow-hidden">
              {/* Header */}
              <div className="tql-bg-teal px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Zap className="w-5 h-5 text-white shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-white tracking-tight">Flash Submit — Confirm Details</div>
                    <div className="text-[11px] text-white/80 mt-0.5 truncate">
                      {flashSubmitRate.programName} · {flashSubmitRate.rate.toFixed(3)}% @ {flashSubmitRate.price.toFixed(3)}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => !flashSubmitSending && setFlashSubmitRate(null)} className="p-1 text-white/80 hover:text-white transition-colors shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                <p className="text-[12px] tql-text-muted leading-relaxed">Please confirm a few details before we hand off to the 3.4 upload.</p>

                {/* Borrower + Broker block */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold tql-text-slate uppercase tracking-wider mb-1">Borrower's Last Name *</label>
                    <input type="text" value={flashSubmitFields.borrowerLastName} onChange={(e) => setFlashSubmitFields(prev => ({ ...prev, borrowerLastName: e.target.value }))} placeholder="Smith" className="w-full px-3 py-2.5 bg-[color:var(--tql-bg)] border tql-border-steel rounded-lg text-sm tql-text-primary focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold tql-text-slate uppercase tracking-wider mb-1">Your Name *</label>
                    <input type="text" value={flashSubmitFields.brokerName} onChange={(e) => setFlashSubmitFields(prev => ({ ...prev, brokerName: e.target.value }))} placeholder="Jane Broker" className="w-full px-3 py-2.5 bg-[color:var(--tql-bg)] border tql-border-steel rounded-lg text-sm tql-text-primary focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold tql-text-slate uppercase tracking-wider mb-1">Your Email *</label>
                    <input type="email" value={flashSubmitFields.brokerEmail} onChange={(e) => setFlashSubmitFields(prev => ({ ...prev, brokerEmail: e.target.value }))} placeholder="you@company.com" className="w-full px-3 py-2.5 bg-[color:var(--tql-bg)] border tql-border-steel rounded-lg text-sm tql-text-primary focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold tql-text-slate uppercase tracking-wider mb-1">Submitting Company Name *</label>
                    <input type="text" value={flashSubmitFields.companyName} onChange={(e) => setFlashSubmitFields(prev => ({ ...prev, companyName: e.target.value }))} placeholder="ABC Mortgage Group" className="w-full px-3 py-2.5 bg-[color:var(--tql-bg)] border tql-border-steel rounded-lg text-sm tql-text-primary focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                  </div>
                </div>

                {/* Fees block */}
                <div className="pt-2 border-t tql-border-steel">
                  <div className="text-[10px] font-bold uppercase tracking-widest tql-text-teal mb-2 mt-3">Fees</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold tql-text-slate uppercase tracking-wider mb-1">Broker Origination Charge</label>
                      <input type="text" value={flashSubmitFields.originationCharge} onChange={(e) => setFlashSubmitFields(prev => ({ ...prev, originationCharge: e.target.value }))} placeholder="$ or %" className="w-full px-3 py-2.5 bg-[color:var(--tql-bg)] border tql-border-steel rounded-lg text-sm tql-text-primary focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold tql-text-slate uppercase tracking-wider mb-1">3rd Party Processing Fee</label>
                      <input type="text" value={flashSubmitFields.thirdPartyProcessingFee} onChange={(e) => setFlashSubmitFields(prev => ({ ...prev, thirdPartyProcessingFee: e.target.value }))} placeholder="$ amount" className="w-full px-3 py-2.5 bg-[color:var(--tql-bg)] border tql-border-steel rounded-lg text-sm tql-text-primary focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                    </div>
                  </div>

                  {/* Yes/No toggles */}
                  <div className="mt-3 space-y-2">
                    <ToggleRow
                      label="Are you charging a Processing Fee?"
                      value={flashSubmitFields.chargingProcessingFee}
                      onChange={(v) => setFlashSubmitFields(prev => ({ ...prev, chargingProcessingFee: v }))}
                    />
                    {flashSubmitFields.chargingProcessingFee && (
                      <input type="text" value={flashSubmitFields.processingFeeAmount} onChange={(e) => setFlashSubmitFields(prev => ({ ...prev, processingFeeAmount: e.target.value }))} placeholder="Processing fee amount" className="w-full px-3 py-2.5 bg-[color:var(--tql-bg)] border tql-border-steel rounded-lg text-sm tql-text-primary focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                    )}
                    <ToggleRow
                      label="Are you collecting a Credit Report Fee?"
                      value={flashSubmitFields.collectingCreditReportFee}
                      onChange={(v) => setFlashSubmitFields(prev => ({ ...prev, collectingCreditReportFee: v }))}
                    />
                    {flashSubmitFields.collectingCreditReportFee && (
                      <input type="text" value={flashSubmitFields.creditReportFeeAmount} onChange={(e) => setFlashSubmitFields(prev => ({ ...prev, creditReportFeeAmount: e.target.value }))} placeholder="Credit report fee amount" className="w-full px-3 py-2.5 bg-[color:var(--tql-bg)] border tql-border-steel rounded-lg text-sm tql-text-primary focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                    )}
                    <ToggleRow
                      label="Do you have the Title / Escrow Fee Sheet?"
                      value={flashSubmitFields.hasTitleEscrowSheet}
                      onChange={(v) => setFlashSubmitFields(prev => ({ ...prev, hasTitleEscrowSheet: v }))}
                    />
                    <ToggleRow
                      label="Do you authorize TQL to pull Smart Fees?"
                      value={flashSubmitFields.authorizeSmartFees}
                      onChange={(v) => setFlashSubmitFields(prev => ({ ...prev, authorizeSmartFees: v }))}
                    />
                  </div>
                </div>

                {flashSubmitError && (
                  <div className="flex items-start gap-2 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
                    <div className="text-[12px] text-[#EF4444]">{flashSubmitError}</div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleFlashSubmit}
                  disabled={flashSubmitSending}
                  className="w-full py-3 tql-bg-teal hover:opacity-90 text-white rounded-lg text-[13px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_2px_8px_rgba(36,95,115,0.3)]"
                >
                  {flashSubmitSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {flashSubmitSending ? 'Sending…' : 'Confirm & Go to 3.4 Upload'}
                </button>
                <p className="text-[11px] tql-text-muted text-center leading-relaxed">
                  A summary PDF + pricing detail will be emailed from <span className="tql-text-teal font-semibold">Flash@tqltpo.com</span> to <span className="tql-text-teal font-semibold">disclosuredesk@tqlend.com</span> with you cc'd.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═════════ USER ADMIN PASSCODE MODAL ═════════ */}
      {showUserAdmin && (
        <>
          <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm" onClick={() => setShowUserAdmin(false)} />
          <div className="fixed inset-0 z-[301] flex items-center justify-center px-4">
            <div className="w-full max-w-[400px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.3)] overflow-hidden">
              <div className="tql-bg-teal px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Lock className="w-5 h-5 text-white" />
                  <div>
                    <div className="text-[15px] font-bold text-white tracking-tight tql-font-display">User Admin</div>
                    <div className="text-[11px] text-white/80 mt-0.5">{showRawInvestor ? 'Raw investor view active — Master Investor Results visible' : 'Enter passcode to reveal raw investor data'}</div>
                  </div>
                </div>
                <button type="button" onClick={() => setShowUserAdmin(false)} className="p-1 text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                {showRawInvestor ? (
                  <>
                    <div className="flex items-start gap-2 text-[13px] tql-text-primary">
                      <CheckCircle2 className="w-5 h-5 tql-text-teal shrink-0 mt-0.5" />
                      <div>Master Investor Results unlocked. The full pricing ladder now shows the underlying lender / investor product names instead of the TQL-masked names.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowRawInvestor(false); setShowUserAdmin(false) }}
                      className="w-full py-2.5 bg-white border tql-border-steel hover:bg-[color:var(--tql-bg)] tql-text-primary rounded-lg text-[12px] font-bold uppercase tracking-wider transition-colors"
                    >
                      Re-Mask · Hide Raw Investor Names
                    </button>
                  </>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (adminPasscodeInput.trim().toLowerCase().replace(/\s+/g, '') === ADMIN_PASSCODE) {
                        setShowRawInvestor(true)
                        setShowUserAdmin(false)
                        setAdminPasscodeInput('')
                        setAdminPasscodeError(false)
                      } else {
                        setAdminPasscodeError(true)
                      }
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <label className="block text-[11px] font-semibold tql-text-slate uppercase tracking-wider mb-1">Passcode</label>
                      <input
                        type="password"
                        autoFocus
                        value={adminPasscodeInput}
                        onChange={(e) => { setAdminPasscodeInput(e.target.value); setAdminPasscodeError(false) }}
                        placeholder="Enter admin passcode"
                        className={`w-full px-3 py-2.5 bg-[color:var(--tql-bg)] border rounded-lg text-sm tql-text-primary focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent ${adminPasscodeError ? 'border-[#EF4444]' : 'tql-border-steel'}`}
                      />
                      {adminPasscodeError && <div className="mt-1.5 text-[11px] text-[#EF4444]">Incorrect passcode</div>}
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 tql-bg-teal hover:opacity-90 text-white rounded-lg text-[12px] font-bold uppercase tracking-wider transition-opacity"
                    >
                      Reveal Master Investor Results
                    </button>
                    <p className="text-[10px] tql-text-muted text-center leading-relaxed">
                      Admin-only. Reveals the raw investor / lender product names returned by Optimal Blue. Default broker view stays masked as TQL.
                    </p>
                  </form>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═════════ EMAIL RATE QUOTE MODAL ═════════ */}
      {quoteRate && (
        <>
          <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm" onClick={() => !quoteSending && setQuoteRate(null)} />
          <div className="fixed inset-0 z-[301] flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto">
            <div className="w-full max-w-[480px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.3)] overflow-hidden">
              <div className="tql-bg-teal px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Mail className="w-5 h-5 text-white shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-white tracking-tight">Email Rate Quote</div>
                    <div className="text-[11px] text-white/80 mt-0.5 truncate">{quoteRate.programName} · {quoteRate.rate.toFixed(3)}% @ {quoteRate.price.toFixed(3)}</div>
                  </div>
                </div>
                <button type="button" onClick={() => !quoteSending && setQuoteRate(null)} className="p-1 text-white/80 hover:text-white shrink-0"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold tql-text-slate uppercase tracking-wider mb-1">Borrower Name (optional)</label>
                  <input type="text" value={quoteBorrower} onChange={(e) => setQuoteBorrower(e.target.value)} placeholder="John Smith" className="w-full px-3 py-2.5 bg-[color:var(--tql-bg)] border tql-border-steel rounded-lg text-sm tql-text-primary focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold tql-text-slate uppercase tracking-wider mb-1">Send To Email *</label>
                  <input type="email" value={quoteEmail} onChange={(e) => setQuoteEmail(e.target.value)} placeholder="recipient@example.com" className="w-full px-3 py-2.5 bg-[color:var(--tql-bg)] border tql-border-steel rounded-lg text-sm tql-text-primary focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                </div>
                <button
                  type="button"
                  disabled={!quoteEmail || quoteSending}
                  onClick={async () => {
                    if (!quoteRate) return
                    setQuoteSending(true)
                    setQuoteStatus('idle')
                    const html = buildRateQuoteEmail(quoteRate, quoteBorrower, formData)
                    const subject = `TQL Rate Quote — ${quoteRate.rate.toFixed(3)}% / ${quoteRate.price.toFixed(3)}${quoteBorrower ? ` — ${quoteBorrower}` : ''}`
                    try {
                      const r = await fetch('/api/send-email', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ to: quoteEmail, subject, html }),
                      })
                      if (r.ok) {
                        setQuoteStatus('success')
                        setTimeout(() => { setQuoteRate(null); setQuoteStatus('idle') }, 2000)
                      } else { setQuoteStatus('error') }
                    } catch { setQuoteStatus('error') }
                    finally { setQuoteSending(false) }
                  }}
                  className="w-full py-3 tql-bg-teal hover:opacity-90 text-white rounded-lg text-[13px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_2px_8px_rgba(36,95,115,0.3)]"
                >
                  {quoteSending ? <Loader2 className="w-4 h-4 animate-spin" /> : quoteStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  {quoteSending ? 'Sending…' : quoteStatus === 'success' ? 'Sent!' : 'Send Quote'}
                </button>
                {quoteStatus === 'error' && <p className="text-[11px] text-[#EF4444] text-center">Failed to send. Please check the email address and try again.</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {showHelpDesk && (
        <>
          <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm" onClick={() => setShowHelpDesk(false)} />
          <div className="fixed inset-0 z-[301] flex items-center justify-center px-4">
            <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-slate-900" />
                  <h3 className="text-lg font-bold text-slate-900">Help Desk</h3>
                </div>
                <button type="button" onClick={() => setShowHelpDesk(false)} className="p-1 text-slate-400 hover:text-slate-900 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-[13px] text-slate-500 mb-4">Submit a help request and our team will get back to you.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Name *</label>
                  <input type="text" value={helpDeskFields.name} onChange={(e) => setHelpDeskFields(prev => ({ ...prev, name: e.target.value }))} placeholder="Your name" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Email *</label>
                  <input type="email" value={helpDeskFields.email} onChange={(e) => setHelpDeskFields(prev => ({ ...prev, email: e.target.value }))} placeholder="you@company.com" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Help Topic *</label>
                  <select value={helpDeskFields.topic} onChange={(e) => setHelpDeskFields(prev => ({ ...prev, topic: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent">
                    <option value="">Select a topic...</option>
                    <option value="Pricing">Pricing</option>
                    <option value="Lock Desk">Lock Desk</option>
                    <option value="Technical">Technical</option>
                    <option value="Account">Account</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Message</label>
                  <textarea value={helpDeskFields.message} onChange={(e) => setHelpDeskFields(prev => ({ ...prev, message: e.target.value }))} placeholder="Describe your issue or question..." rows={3} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#245F73] focus:border-transparent resize-none" />
                </div>
                <button type="button" onClick={handleHelpDeskSubmit} disabled={helpDeskSending || !helpDeskFields.name || !helpDeskFields.email || !helpDeskFields.topic} className="w-full py-3 tql-bg-teal hover:opacity-85 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-opacity duration-150 disabled:opacity-50 disabled:cursor-not-allowed">
                  {helpDeskSending ? <Loader2 className="w-4 h-4 animate-spin" /> : helpDeskStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  {helpDeskSending ? 'Sending...' : helpDeskStatus === 'success' ? 'Sent!' : 'Submit Request'}
                </button>
                {helpDeskStatus === 'error' && <p className="text-xs text-[#EF4444] text-center">Failed to send. Please try again.</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ChatCom Admin — draggable floating panel */}
      {showChatCom && (
        <DraggablePanel
          onClose={() => setShowChatCom(false)}
          title="ChatCom"
          width="900px"
          height="85vh"
        >
          <ChatAdminPanel onClose={() => setShowChatCom(false)} />
        </DraggablePanel>
      )}

      {/* User Chat — draggable floating panel */}
      {showUserChat && (
        <DraggablePanel
          onClose={() => setShowUserChat(false)}
          title="Chat with a Human"
          width="420px"
          height="70vh"
          defaultX={window.innerWidth - 452}
          defaultY={window.innerHeight - window.innerHeight * 0.72}
        >
          <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading...</div>}>
            <UserChatPage />
          </Suspense>
        </DraggablePanel>
      )}
    </div>
  )
}
