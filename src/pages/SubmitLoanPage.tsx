import { useState, useCallback, useRef } from 'react'
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Plus, Trash2, ArrowLeft, ClipboardList, ChevronDown } from 'lucide-react'

type SubmitStep = 'upload-mismo' | 'submitting' | 'loan-created' | 'form' | 'upload-docs' | 'complete'

interface UploadedDoc {
  fileName: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
  docType: string
}

interface FlashSubmitForm {
  // Loan ID
  confirmLoanId: string
  // Transaction Contacts
  brokerMloFirst: string
  brokerMloLast: string
  mloNmls: string
  loIsThePoc: boolean
  mloEmail: string
  loMobile: string
  primaryContact: string
  primaryContactPhone: string
  primaryContactEmail: string
  // Borrower Info
  borrowerFirst: string
  borrowerLast: string
  borrowerEmail: string
  addCoBorrower: boolean
  coBorrowerFirst: string
  coBorrowerLast: string
  coBorrowerEmail: string
  // Loan Target Details
  transactionType: string
  loanAmount: string
  incomeType: string
  ltvCltv: string
  targetRate: string
  investmentPrepayPeriod: string
  occupancyType: string
  // Broker Fee Details
  compType: string
  brokerOriginationFee: string
  brokerYspRebate: string
  lpcPlanPercent: string
  brokerProcessingFee: boolean
  thirdPartyProcessingFee: string
  thirdPartyProcessingName: string
  thirdPartyProcessingNmls: string
  brokerCreditReportFee: string
  hasFeeSheetFromTitle: boolean
  authorizeSmartFees: boolean
  creditVendorCompanyName: string
  reIssueCreditReport: boolean
  creditVendorId: string
  creditVendorUsername: string
  vendorLoginPsw: string
  notesToLoanSetup: string
  certificationAcknowledged: boolean
}

interface SubmitLoanPageProps {
  onBack: () => void
}

const DOC_TYPES = [
  'Other', '1003 Application', 'Appraisal', 'Bank Statement', 'Credit Report',
  'Drivers License', 'Employment Verification', 'Flood Certificate', 'HOI Policy',
  'Income Documentation', 'Mortgage Statement', 'Pay Stub', 'Purchase Contract',
  'Tax Return (1040)', 'Title Commitment', 'W-2',
]

const MAX_DOC_SIZE_MB = 3
const MAX_DOC_SIZE_BYTES = MAX_DOC_SIZE_MB * 1024 * 1024

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { resolve((reader.result as string).split(',')[1]) }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const DEFAULT_FORM: FlashSubmitForm = {
  confirmLoanId: '',
  brokerMloFirst: '', brokerMloLast: '', mloNmls: '', loIsThePoc: true,
  mloEmail: '', loMobile: '', primaryContact: '', primaryContactPhone: '', primaryContactEmail: '',
  borrowerFirst: '', borrowerLast: '', borrowerEmail: '', addCoBorrower: false,
  coBorrowerFirst: '', coBorrowerLast: '', coBorrowerEmail: '',
  transactionType: 'Purchase', loanAmount: '', incomeType: 'DSCR', ltvCltv: '',
  targetRate: '', investmentPrepayPeriod: '36 Months (Standard)', occupancyType: 'Investment',
  compType: 'BPC (all DSCR)', brokerOriginationFee: '', brokerYspRebate: '', lpcPlanPercent: '',
  brokerProcessingFee: false, thirdPartyProcessingFee: '', thirdPartyProcessingName: '',
  thirdPartyProcessingNmls: '', brokerCreditReportFee: '', hasFeeSheetFromTitle: false,
  authorizeSmartFees: false, creditVendorCompanyName: '', reIssueCreditReport: true,
  creditVendorId: '', creditVendorUsername: '', vendorLoginPsw: '',
  notesToLoanSetup: '', certificationAcknowledged: false,
}

const I = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition-colors'
const S = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition-colors'
const L = 'block text-xs font-semibold text-slate-600 mb-1'

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 py-4 space-y-4">{children}</div>}
    </div>
  )
}

export default function SubmitLoanPage({ onBack }: SubmitLoanPageProps) {
  const [step, setStep] = useState<SubmitStep>('upload-mismo')
  const [f, setF] = useState<FlashSubmitForm>(DEFAULT_FORM)
  const [mismoFile, setMismoFile] = useState<File | null>(null)
  const [mismoXml, setMismoXml] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loanId, setLoanId] = useState<string>('')
  const [loanNumber, setLoanNumber] = useState<string>('')
  const [docs, setDocs] = useState<Array<{ file: File; docType: string }>>([])
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const set = useCallback((field: keyof FlashSubmitForm, value: string | boolean) => {
    setF(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleFormSubmit = useCallback(() => {
    const missing: string[] = []
    if (!f.confirmLoanId) missing.push('Loan ID')
    if (!f.brokerMloFirst || !f.brokerMloLast) missing.push('Broker MLO Name')
    if (!f.mloEmail) missing.push('MLO Email')
    if (!f.borrowerFirst || !f.borrowerLast) missing.push('Borrower Name')
    if (!f.borrowerEmail) missing.push('Borrower Email')
    if (!f.transactionType) missing.push('Transaction Type')
    if (!f.loanAmount) missing.push('Loan Amount')
    if (!f.incomeType) missing.push('Income Type')
    if (!f.targetRate) missing.push('Target Rate')
    if (!f.occupancyType) missing.push('Occupancy Type')
    if (!f.compType) missing.push('Comp Type')
    if (!f.certificationAcknowledged) missing.push('Certification Acknowledgment')
    if (missing.length > 0) {
      setError(`Required: ${missing.join(', ')}`)
      return
    }
    setError(null)
    setStep('loan-created')
  }, [f])

  const handleMismoFile = useCallback(async (file: File) => {
    setError(null)
    if (!file.name.toLowerCase().endsWith('.xml')) { setError('Please upload a .xml file (MISMO 3.4 format)'); return }
    if (file.size > 50 * 1024 * 1024) { setError('File size must be under 50MB'); return }
    setMismoFile(file)
    setMismoXml(await file.text())
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleMismoFile(file)
  }, [handleMismoFile])

  const handleSubmitMismo = useCallback(async () => {
    if (!mismoXml) return
    setStep('submitting'); setError(null)
    try {
      const res = await fetch('/api/encompass-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mismoXml, loanForm: f }),
      })
      const text = await res.text()
      let data: { success: boolean; loanId?: string; loanNumber?: string; error?: string }
      try { data = JSON.parse(text) } catch { throw new Error(`Server error (${res.status}): ${text.slice(0, 200)}`) }
      if (!data.success) throw new Error(data.error || 'Submission failed')
      setLoanId(data.loanId || ''); setLoanNumber(data.loanNumber || '')
      setF(prev => ({ ...prev, confirmLoanId: data.loanNumber || data.loanId || '' }))
      setStep('form')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed'); setStep('upload-mismo')
    }
  }, [mismoXml, f])

  const handleAddDocFiles = useCallback((files: FileList | null) => {
    if (!files) return
    const oversized = Array.from(files).filter(f => f.size > MAX_DOC_SIZE_BYTES)
    if (oversized.length > 0) { setError(`Files over ${MAX_DOC_SIZE_MB}MB: ${oversized.map(f => f.name).join(', ')}`); return }
    setError(null)
    setDocs(prev => [...prev, ...Array.from(files).filter(f => f.size <= MAX_DOC_SIZE_BYTES).map(file => ({ file, docType: 'Other' }))])
  }, [])

  const handleUploadDocs = useCallback(async () => {
    if (docs.length === 0) { setStep('complete'); return }
    setIsUploading(true)
    const results: UploadedDoc[] = docs.map(d => ({ fileName: d.file.name, status: 'pending' as const, docType: d.docType }))
    setUploadedDocs(results); setStep('upload-docs')
    for (let i = 0; i < docs.length; i++) {
      setUploadedDocs(prev => prev.map((d, idx) => idx === i ? { ...d, status: 'uploading' } : d))
      try {
        if (docs[i].file.size > MAX_DOC_SIZE_BYTES) throw new Error(`File exceeds ${MAX_DOC_SIZE_MB}MB limit`)
        const base64 = await fileToBase64(docs[i].file)
        const res = await fetch('/api/encompass-upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loanId, fileName: docs[i].file.name, fileBase64: base64, contentType: docs[i].file.type || 'application/pdf', docType: docs[i].docType }),
        })
        const docText = await res.text()
        let data: { success: boolean; error?: string }
        try { data = JSON.parse(docText) } catch { throw new Error(`Server error (${res.status}): ${docText.slice(0, 200)}`) }
        setUploadedDocs(prev => prev.map((d, idx) => idx === i ? { ...d, status: data.success ? 'done' : 'error', error: data.error } : d))
      } catch (err: unknown) {
        setUploadedDocs(prev => prev.map((d, idx) => idx === i ? { ...d, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' } : d))
      }
    }
    setIsUploading(false)

    // Send notification email to TPO Support
    const successDocs = docs.filter((_, i) => {
      const r = results[i]
      return r && r.status !== 'error'
    })
    if (successDocs.length > 0 || docs.length > 0) {
      fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'tposupport@tqlend.com',
          subject: `Flash Submit — Lender Tracking # ${loanNumber} — ${docs.length} Document${docs.length !== 1 ? 's' : ''} Uploaded`,
          html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
            <h2 style="margin:0 0 16px;color:#0D3B66;">Documents Submitted via Flash Submit</h2>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px 0;color:#666;font-size:13px;">Lender Tracking #</td><td style="padding:8px 0;font-weight:600;color:#111;">${loanNumber}</td></tr>
              <tr><td style="padding:8px 0;color:#666;font-size:13px;">Loan ID</td><td style="padding:8px 0;font-family:monospace;font-size:12px;color:#333;">${loanId}</td></tr>
              <tr><td style="padding:8px 0;color:#666;font-size:13px;">MLO</td><td style="padding:8px 0;color:#333;">${f.brokerMloFirst} ${f.brokerMloLast} (${f.mloEmail})</td></tr>
              <tr><td style="padding:8px 0;color:#666;font-size:13px;">Borrower</td><td style="padding:8px 0;color:#333;">${f.borrowerFirst} ${f.borrowerLast}</td></tr>
              <tr><td style="padding:8px 0;color:#666;font-size:13px;">Documents</td><td style="padding:8px 0;color:#333;">${docs.map(d => d.file.name + ' (' + d.docType + ')').join('<br/>')}</td></tr>
            </table>
            <p style="color:#999;font-size:11px;margin-top:24px;">Automated notification from TQL Flash Submit</p>
          </div>`,
        }),
      }).catch(() => {})
    }

    setStep('complete')
  }, [docs, loanId, loanNumber, f])

  const STEPS = ['MISMO Upload', 'Create Loan', 'Loan Setup Form', 'Attach Docs', 'Complete']
  const STEP_KEYS: SubmitStep[] = ['upload-mismo', 'submitting', 'form', 'upload-docs', 'complete']
  const showBpcFields = f.compType === 'BPC (all DSCR)'
  const showLpcFields = f.compType === 'LPC'
  const showCreditVendorFields = f.reIssueCreditReport

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"><ArrowLeft className="w-4 h-4" />Back</button>
          <div className="h-5 w-px bg-slate-200" />
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Flash Submit</h1>
          <span className="text-xs text-slate-400">Loan Setup & Disclosures Request</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-8 overflow-x-auto">
          {STEPS.map((label, i) => {
            const si = STEP_KEYS.indexOf(step)
            const active = i <= Math.max(si, step === 'upload-docs' ? 3 : si)
            return (
              <div key={label} className="flex items-center gap-1.5 shrink-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${active ? 'bg-black text-white' : 'bg-slate-100 text-slate-400'}`}>{i + 1}</div>
                <span className={`text-[11px] font-medium hidden sm:inline ${active ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
                {i < STEPS.length - 1 && <div className={`w-6 h-px ${active ? 'bg-black' : 'bg-slate-200'}`} />}
              </div>
            )
          })}
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">{error}</p>
              <button type="button" onClick={() => setError(null)} className="text-xs text-red-600 hover:text-red-800 mt-1 underline">Dismiss</button>
            </div>
          </div>
        )}

        {/* ══════ STEP 1: FLASH SUBMIT FORM ══════ */}
        {step === 'form' && (
          <div className="space-y-5">
            {/* Loan Created Success */}
            {loanNumber && (
              <div className="p-5 rounded-xl bg-green-50 border border-green-200 flex items-start gap-3 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-green-900">Lender Tracking # {loanNumber} · Uploaded to Encompass</div>
                  <div className="text-xs text-green-700 font-mono mt-0.5">{loanId}</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><ClipboardList className="w-5 h-5 text-slate-600" /></div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Loan Setup & Disclosures</h2>
                <p className="text-sm text-slate-500">Complete the form below to finalize your submission.</p>
              </div>
            </div>

            {/* Loan ID */}
            <div className="p-5 rounded-xl border-2 border-blue-200 bg-blue-50/30">
              <label className={L}>Confirm the Loan ID # *</label>
              <input type="text" value={f.confirmLoanId} onChange={e => set('confirmLoanId', e.target.value)} placeholder="Lender Tracking # that was Just Issued" className={I} />
            </div>

            {/* 1. Loan Target Details — FIRST */}
            <Section title="Loan Target Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={L}>Transaction Type *</label>
                  <select value={f.transactionType} onChange={e => set('transactionType', e.target.value)} className={S}>
                    <option>Purchase</option><option>Cash-Out</option><option>Rate/Term</option>
                  </select>
                </div>
                <div><label className={L}>Loan Amount *</label><input type="text" value={f.loanAmount} onChange={e => set('loanAmount', e.target.value)} placeholder="$500,000" className={I} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={L}>Income Type *</label>
                  <select value={f.incomeType} onChange={e => set('incomeType', e.target.value)} className={S}>
                    <option>DSCR</option><option>12 Months Bank Statements</option><option>2yr Full Doc</option>
                    <option>1yr Full Doc</option><option>1099 / W2 Only</option><option>P&L Only</option>
                  </select>
                </div>
                <div><label className={L}>LTV/CLTV</label><input type="text" value={f.ltvCltv} onChange={e => set('ltvCltv', e.target.value)} placeholder="75%" className={I} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={L}>Target Rate *</label><input type="text" value={f.targetRate} onChange={e => set('targetRate', e.target.value)} placeholder="7.250%" className={I} /></div>
                <div>
                  <label className={L}>Occupancy Type *</label>
                  <select value={f.occupancyType} onChange={e => set('occupancyType', e.target.value)} className={S}>
                    <option>Investment</option><option>Primary</option><option>Second Home</option>
                  </select>
                </div>
              </div>
              {f.occupancyType === 'Investment' && (
                <div>
                  <label className={L}>Investment Property Prepay Period</label>
                  <select value={f.investmentPrepayPeriod} onChange={e => set('investmentPrepayPeriod', e.target.value)} className={S}>
                    <option>36 Months (Standard)</option><option>48 Months</option>
                    <option>60 Months (Best Priced Period)</option><option>24 Months</option>
                    <option>12 Months (Rebate Not Eligible)</option><option>0 Months (Min Final Price 99.500)</option>
                  </select>
                </div>
              )}
            </Section>

            {/* 2. Transaction Contacts */}
            <Section title="Transaction Contacts">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={L}>Broker MLO First Name *</label><input type="text" value={f.brokerMloFirst} onChange={e => set('brokerMloFirst', e.target.value)} className={I} /></div>
                <div><label className={L}>Broker MLO Last Name *</label><input type="text" value={f.brokerMloLast} onChange={e => set('brokerMloLast', e.target.value)} className={I} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={L}>MLO NMLS#</label><input type="text" value={f.mloNmls} onChange={e => set('mloNmls', e.target.value)} placeholder="(if available)" className={I} /></div>
                <div>
                  <label className={L}>LO is the POC</label>
                  <div className="flex gap-4 mt-1.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" checked={f.loIsThePoc} onChange={() => set('loIsThePoc', true)} className="accent-black" />Yes</label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" checked={!f.loIsThePoc} onChange={() => set('loIsThePoc', false)} className="accent-black" />No</label>
                  </div>
                </div>
              </div>
              <div><label className={L}>MLO Email *</label><input type="email" value={f.mloEmail} onChange={e => set('mloEmail', e.target.value)} placeholder="Used for confirmations/correspondence" className={I} /></div>
              <div><label className={L}>LO Mobile # <span className="font-normal text-slate-400">(for 2-Factor Auth)</span></label><input type="tel" value={f.loMobile} onChange={e => set('loMobile', e.target.value)} className={I} /></div>
              {!f.loIsThePoc && (
                <>
                  <div><label className={L}>Primary Contact * <span className="font-normal text-slate-400">(if different from LO)</span></label><input type="text" value={f.primaryContact} onChange={e => set('primaryContact', e.target.value)} className={I} /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className={L}>Primary Contact Phone *</label><input type="tel" value={f.primaryContactPhone} onChange={e => set('primaryContactPhone', e.target.value)} className={I} /></div>
                    <div><label className={L}>Primary Contact Email</label><input type="email" value={f.primaryContactEmail} onChange={e => set('primaryContactEmail', e.target.value)} className={I} /></div>
                  </div>
                </>
              )}
            </Section>

            {/* 3. Confirm Borrower Information */}
            <Section title="Confirm Borrower Information">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={L}>Borrower First Name *</label><input type="text" value={f.borrowerFirst} onChange={e => set('borrowerFirst', e.target.value)} className={I} /></div>
                <div><label className={L}>Borrower Last Name *</label><input type="text" value={f.borrowerLast} onChange={e => set('borrowerLast', e.target.value)} className={I} /></div>
              </div>
              <div><label className={L}>Confirm Borrower's Email *</label><input type="email" value={f.borrowerEmail} onChange={e => set('borrowerEmail', e.target.value)} className={I} /></div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={f.addCoBorrower} onChange={e => set('addCoBorrower', e.target.checked)} className="accent-black w-4 h-4 rounded" />
                Add Co-Borrower
              </label>
              {f.addCoBorrower && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className={L}>Co-Borrower First</label><input type="text" value={f.coBorrowerFirst} onChange={e => set('coBorrowerFirst', e.target.value)} className={I} /></div>
                    <div><label className={L}>Co-Borrower Last</label><input type="text" value={f.coBorrowerLast} onChange={e => set('coBorrowerLast', e.target.value)} className={I} /></div>
                  </div>
                  <div><label className={L}>Co-Borrower Email</label><input type="email" value={f.coBorrowerEmail} onChange={e => set('coBorrowerEmail', e.target.value)} className={I} /></div>
                </>
              )}
            </Section>

            {/* 4. Broker Fee Details */}
            <Section title="Confirm Broker Fee Details">
              <div>
                <label className={L}>Comp Type *</label>
                <select value={f.compType} onChange={e => set('compType', e.target.value)} className={S}>
                  <option>BPC (all DSCR)</option><option>LPC</option>
                </select>
              </div>
              {showBpcFields && (
                <>
                  <div><label className={L}>Broker Origination Fee *</label><input type="text" value={f.brokerOriginationFee} onChange={e => set('brokerOriginationFee', e.target.value)} placeholder="$0.00 or 1.00%" className={I} /></div>
                  <div><label className={L}>*Broker YSP/Rebate</label><input type="text" value={f.brokerYspRebate} onChange={e => set('brokerYspRebate', e.target.value)} className={I} /></div>
                </>
              )}
              {showLpcFields && (
                <div><label className={L}>LPC PLAN % *</label><input type="text" value={f.lpcPlanPercent} onChange={e => set('lpcPlanPercent', e.target.value)} placeholder="2.50%" className={I} /></div>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={f.brokerProcessingFee} onChange={e => set('brokerProcessingFee', e.target.checked)} className="accent-black w-4 h-4 rounded" />
                Broker Processing Fee
              </label>
              {f.brokerProcessingFee && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pl-6 border-l-2 border-slate-200">
                  <div><label className={L}>3rd Party Processing Fee</label><input type="text" value={f.thirdPartyProcessingFee} onChange={e => set('thirdPartyProcessingFee', e.target.value)} className={I} /></div>
                  <div><label className={L}>3rd Party Name *</label><input type="text" value={f.thirdPartyProcessingName} onChange={e => set('thirdPartyProcessingName', e.target.value)} className={I} /></div>
                  <div><label className={L}>3rd Party NMLS# *</label><input type="text" value={f.thirdPartyProcessingNmls} onChange={e => set('thirdPartyProcessingNmls', e.target.value)} className={I} /></div>
                </div>
              )}
              <div><label className={L}>Broker Credit Report Fee</label><input type="text" value={f.brokerCreditReportFee} onChange={e => set('brokerCreditReportFee', e.target.value)} className={I} /></div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={f.hasFeeSheetFromTitle} onChange={e => set('hasFeeSheetFromTitle', e.target.checked)} className="accent-black w-4 h-4 rounded" />
                You have a Fee Sheet from Title/Escrow
              </label>
              {!f.hasFeeSheetFromTitle && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={f.authorizeSmartFees} onChange={e => set('authorizeSmartFees', e.target.checked)} className="accent-black w-4 h-4 rounded" />
                  Authorize us to Pull SMART FEES
                </label>
              )}
              <div>
                <label className={L}>Re-Issue my Credit Report *</label>
                <div className="flex gap-4 mt-1.5">
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" checked={f.reIssueCreditReport} onChange={() => set('reIssueCreditReport', true)} className="accent-black" />Yes</label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" checked={!f.reIssueCreditReport} onChange={() => set('reIssueCreditReport', false)} className="accent-black" />No</label>
                </div>
              </div>
              {showCreditVendorFields && (
                <div className="space-y-4 pl-6 border-l-2 border-slate-200">
                  <div><label className={L}>Credit Vendor Company Name</label><input type="text" value={f.creditVendorCompanyName} onChange={e => set('creditVendorCompanyName', e.target.value)} className={I} /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className={L}>Credit Vendor ID / Account #</label><input type="text" value={f.creditVendorId} onChange={e => set('creditVendorId', e.target.value)} className={I} /></div>
                    <div><label className={L}>Credit Vendor Reissue Username</label><input type="text" value={f.creditVendorUsername} onChange={e => set('creditVendorUsername', e.target.value)} className={I} /></div>
                  </div>
                  <div><label className={L}>Vendor Login (psw) *</label><input type="password" value={f.vendorLoginPsw} onChange={e => set('vendorLoginPsw', e.target.value)} className={I} /></div>
                </div>
              )}
              <div><label className={L}>Notes to: Loan Setup Department</label><textarea value={f.notesToLoanSetup} onChange={e => set('notesToLoanSetup', e.target.value)} rows={3} placeholder="Special instructions..." className={I + ' resize-none'} /></div>
            </Section>

            {/* Certification */}
            <div className="p-5 rounded-xl border-2 border-amber-200 bg-amber-50/30 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                By submitting this form, I certify that the information provided is accurate and complete. I authorize TQL to process this loan submission, pull credit reports as indicated, and generate disclosures on behalf of the borrower(s) listed above.
              </p>
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input type="checkbox" checked={f.certificationAcknowledged} onChange={e => set('certificationAcknowledged', e.target.checked)} className="accent-black w-4 h-4 rounded" />
                I acknowledge and agree to the Certification & Attestation above *
              </label>
            </div>

            <button type="button" onClick={handleFormSubmit} className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-black hover:bg-slate-800 transition-all active:scale-[0.99]">
              Continue to Attach Documents
            </button>
          </div>
        )}

        {/* ══════ STEP 1: MISMO UPLOAD ══════ */}
        {step === 'upload-mismo' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Upload MISMO 3.4 File</h2>
              <p className="text-sm text-slate-500">Upload your MISMO 3.4 XML file to create a new loan in Encompass.</p>
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${dragOver ? 'border-black bg-slate-50' : mismoFile ? 'border-green-300 bg-green-50' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'}`}
            >
              <input ref={fileInputRef} type="file" accept=".xml" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleMismoFile(file) }} />
              {mismoFile ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center"><FileText className="w-6 h-6 text-green-600" /></div>
                  <p className="text-sm font-semibold text-slate-900">{mismoFile.name}</p>
                  <p className="text-xs text-slate-400">{(mismoFile.size / 1024).toFixed(1)} KB</p>
                  <button type="button" onClick={e => { e.stopPropagation(); setMismoFile(null); setMismoXml('') }} className="text-xs text-slate-500 hover:text-red-600 underline">Remove</button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center"><Upload className="w-6 h-6 text-slate-400" /></div>
                  <p className="text-sm font-semibold text-slate-900">Drop your MISMO 3.4 XML here</p>
                  <p className="text-xs text-slate-400">or click to browse — .xml up to 50MB</p>
                </div>
              )}
            </div>
            <button type="button" onClick={handleSubmitMismo} disabled={!mismoFile} className="w-full py-3 rounded-xl text-sm font-bold text-white tql-bg-teal disabled:bg-slate-200 disabled:text-slate-400 transition-all active:scale-[0.99]">FLASH SUBMIT → UPLOAD 3.4</button>
          </div>
        )}

        {/* ══════ STEP 3: SUBMITTING ══════ */}
        {step === 'submitting' && (
          <div className="flex flex-col items-center justify-center py-20 gap-6">
            <Loader2 className="w-10 h-10 text-black animate-spin" />
            <div className="text-center"><h2 className="text-lg font-bold text-slate-900">Creating Loan in Encompass</h2><p className="text-sm text-slate-500 mt-1">Converting MISMO 3.4 and importing to TPO Pipeline...</p></div>
          </div>
        )}

        {/* ══════ STEP 4: LOAN CREATED ══════ */}
        {step === 'loan-created' && (
          <div className="space-y-8">
            <div className="p-6 rounded-2xl bg-green-50 border border-green-200">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
                <div>
                  <h2 className="text-lg font-bold text-green-900">Loan Uploaded to Encompass</h2>
                  <p className="text-sm text-green-800 mt-1"><span className="font-medium">Lender Tracking #:</span> {loanNumber}</p>
                  <p className="text-sm text-green-700"><span className="font-medium">GUID:</span> <span className="font-mono text-xs">{loanId}</span></p>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 mb-1">Attach Supporting Documents</h3>
              <p className="text-xs text-amber-600 mb-4">Max {MAX_DOC_SIZE_MB}MB per file.</p>
              {docs.length > 0 && (
                <div className="space-y-3 mb-4">
                  {docs.map((doc, i) => (
                    <div key={`${doc.file.name}-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-900 truncate">{doc.file.name}</p><p className="text-xs text-slate-400">{(doc.file.size / 1024).toFixed(1)} KB</p></div>
                      <select value={doc.docType} onChange={e => setDocs(prev => prev.map((d, idx) => idx === i ? { ...d, docType: e.target.value } : d))} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-black">
                        {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button type="button" onClick={() => setDocs(prev => prev.filter((_, idx) => idx !== i))} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => docInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-sm text-slate-600 hover:bg-slate-50 w-full justify-center"><Plus className="w-4 h-4" />Add Documents</button>
              <input ref={docInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.doc,.docx" className="hidden" onChange={e => handleAddDocFiles(e.target.files)} />
            </div>
            {docs.length > 0 && (
              <p className="text-center text-sm text-slate-600 font-medium">{docs.length} document{docs.length !== 1 ? 's' : ''} ready to upload</p>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep('complete')} className="flex-1 py-3 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50">Skip</button>
              <button type="button" onClick={handleUploadDocs} disabled={docs.length === 0} className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-black hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 transition-all active:scale-[0.99]">Submit to Loan Setup</button>
            </div>
          </div>
        )}

        {/* ══════ UPLOADING PROGRESS ══════ */}
        {step === 'upload-docs' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-900">Uploading to eFolder</h2>
            <div className="space-y-3">
              {uploadedDocs.map((doc, i) => (
                <div key={`${doc.fileName}-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  {doc.status === 'uploading' && <Loader2 className="w-4 h-4 text-black animate-spin shrink-0" />}
                  {doc.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                  {doc.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
                  {doc.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />}
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-900 truncate">{doc.fileName}</p>{doc.error && <p className="text-xs text-red-500 mt-0.5">{doc.error}</p>}</div>
                  <span className="text-xs text-slate-400">{doc.docType}</span>
                </div>
              ))}
            </div>
            {isUploading && <p className="text-xs text-slate-400 text-center">Uploading...</p>}
          </div>
        )}

        {/* ══════ COMPLETE ══════ */}
        {step === 'complete' && (
          <div className="flex flex-col items-center py-16 gap-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle2 className="w-8 h-8 text-green-600" /></div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-900">Setup Requested</h2>
              <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
                Your Business is important to us, if you have any questions or need help please email{' '}
                <a href="mailto:TPOSupport@tqltpo.com" className="text-slate-900 font-semibold hover:underline">TPOSupport@tqltpo.com</a>
              </p>
            </div>
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => { setStep('upload-mismo'); setF(DEFAULT_FORM); setMismoFile(null); setMismoXml(''); setLoanId(''); setLoanNumber(''); setDocs([]); setUploadedDocs([]); setError(null) }} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-black hover:bg-slate-800">Submit Another Loan</button>
              <button type="button" onClick={onBack} className="px-6 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50">Back to Dashboard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
