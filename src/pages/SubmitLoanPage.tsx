import { useState, useCallback, useRef } from 'react'
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Plus, Trash2, ArrowLeft } from 'lucide-react'

type SubmitStep = 'upload-mismo' | 'submitting' | 'loan-created' | 'upload-docs' | 'complete'

interface UploadedDoc {
  fileName: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
  docType: string
}

interface SubmitLoanPageProps {
  onBack: () => void
}

const DOC_TYPES = [
  'Other',
  '1003 Application',
  'Appraisal',
  'Bank Statement',
  'Credit Report',
  'Drivers License',
  'Employment Verification',
  'Flood Certificate',
  'HOI Policy',
  'Income Documentation',
  'Mortgage Statement',
  'Pay Stub',
  'Purchase Contract',
  'Tax Return (1040)',
  'Title Commitment',
  'W-2',
]

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function SubmitLoanPage({ onBack }: SubmitLoanPageProps) {
  const [step, setStep] = useState<SubmitStep>('upload-mismo')
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

  const handleMismoFile = useCallback(async (file: File) => {
    setError(null)
    if (!file.name.toLowerCase().endsWith('.xml')) {
      setError('Please upload a .xml file (MISMO 3.4 format)')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File size must be under 50MB')
      return
    }
    setMismoFile(file)
    const text = await file.text()
    setMismoXml(text)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleMismoFile(file)
  }, [handleMismoFile])

  const handleSubmitMismo = useCallback(async () => {
    if (!mismoXml) return
    setStep('submitting')
    setError(null)

    try {
      const res = await fetch('/api/encompass-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mismoXml }),
      })

      const text = await res.text()
      let data: { success: boolean; loanId?: string; loanNumber?: string; error?: string }
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Server error (${res.status}): ${text.slice(0, 200)}`)
      }

      if (!data.success) {
        throw new Error(data.error || 'Submission failed')
      }

      setLoanId(data.loanId || '')
      setLoanNumber(data.loanNumber || '')
      setStep('loan-created')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submission failed'
      setError(message)
      setStep('upload-mismo')
    }
  }, [mismoXml])

  const handleAddDocFiles = useCallback((files: FileList | null) => {
    if (!files) return
    const newDocs = Array.from(files).map(file => ({ file, docType: 'Other' }))
    setDocs(prev => [...prev, ...newDocs])
  }, [])

  const updateDocType = useCallback((idx: number, docType: string) => {
    setDocs(prev => prev.map((d, i) => i === idx ? { ...d, docType } : d))
  }, [])

  const removeDoc = useCallback((idx: number) => {
    setDocs(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const handleUploadDocs = useCallback(async () => {
    if (docs.length === 0) {
      setStep('complete')
      return
    }

    setIsUploading(true)
    const results: UploadedDoc[] = docs.map(d => ({
      fileName: d.file.name,
      status: 'pending' as const,
      docType: d.docType,
    }))
    setUploadedDocs(results)
    setStep('upload-docs')

    for (let i = 0; i < docs.length; i++) {
      setUploadedDocs(prev => prev.map((d, idx) => idx === i ? { ...d, status: 'uploading' } : d))

      try {
        const base64 = await fileToBase64(docs[i].file)
        const res = await fetch('/api/encompass-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loanId,
            fileName: docs[i].file.name,
            fileBase64: base64,
            contentType: docs[i].file.type || 'application/pdf',
            docType: docs[i].docType,
          }),
        })

        const docText = await res.text()
        let data: { success: boolean; error?: string }
        try {
          data = JSON.parse(docText)
        } catch {
          throw new Error(`Server error (${res.status}): ${docText.slice(0, 200)}`)
        }

        setUploadedDocs(prev => prev.map((d, idx) =>
          idx === i ? { ...d, status: data.success ? 'done' : 'error', error: data.error } : d
        ))
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Upload failed'
        setUploadedDocs(prev => prev.map((d, idx) =>
          idx === i ? { ...d, status: 'error', error: message } : d
        ))
      }
    }

    setIsUploading(false)
    setStep('complete')
  }, [docs, loanId])

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Flash Submit</h1>
          <span className="text-xs text-slate-400">Encompass Loan Import</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* ── STEP INDICATOR ── */}
        <div className="flex items-center gap-2 mb-8">
          {['MISMO Upload', 'Create Loan', 'Attach Documents', 'Complete'].map((label, i) => {
            const stepIndex = ['upload-mismo', 'submitting', 'loan-created', 'complete'].indexOf(step)
            const active = i <= Math.max(stepIndex, step === 'upload-docs' ? 2 : stepIndex)
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  active ? 'bg-black text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  {i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:inline ${active ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
                {i < 3 && <div className={`w-8 h-px ${active ? 'bg-black' : 'bg-slate-200'}`} />}
              </div>
            )
          })}
        </div>

        {/* ── ERROR BANNER ── */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-xs text-red-600 hover:text-red-800 mt-1 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 1: MISMO UPLOAD ── */}
        {step === 'upload-mismo' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Upload MISMO 3.4 File</h2>
              <p className="text-sm text-slate-500">
                Upload your MISMO 3.4 XML file to create a new loan in Encompass.
              </p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-black bg-slate-50'
                  : mismoFile
                    ? 'border-green-300 bg-green-50'
                    : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleMismoFile(file)
                }}
              />
              {mismoFile ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{mismoFile.name}</p>
                    <p className="text-xs text-slate-400 mt-1">{(mismoFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMismoFile(null)
                      setMismoXml('')
                    }}
                    className="text-xs text-slate-500 hover:text-red-600 underline"
                  >
                    Remove and choose another
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Drop your MISMO 3.4 XML here</p>
                    <p className="text-xs text-slate-400 mt-1">or click to browse — .xml files up to 50MB</p>
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmitMismo}
              disabled={!mismoFile}
              className="w-full py-3 rounded-xl text-sm font-bold text-white bg-black hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 transition-all active:scale-[0.99]"
            >
              Submit to Encompass
            </button>
          </div>
        )}

        {/* ── STEP 2: SUBMITTING ── */}
        {step === 'submitting' && (
          <div className="flex flex-col items-center justify-center py-20 gap-6">
            <Loader2 className="w-10 h-10 text-black animate-spin" />
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-900">Creating Loan in Encompass</h2>
              <p className="text-sm text-slate-500 mt-1">Converting MISMO 3.4 and importing to TPO Pipeline...</p>
            </div>
          </div>
        )}

        {/* ── STEP 3: LOAN CREATED — ATTACH DOCS ── */}
        {step === 'loan-created' && (
          <div className="space-y-8">
            {/* Success card */}
            <div className="p-6 rounded-2xl bg-green-50 border border-green-200">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-green-900">Loan Created Successfully</h2>
                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-green-800">
                      <span className="font-medium">Loan Number:</span> {loanNumber}
                    </p>
                    <p className="text-sm text-green-700">
                      <span className="font-medium">Loan GUID:</span>{' '}
                      <span className="font-mono text-xs">{loanId}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Add supporting documents */}
            <div>
              <h3 className="text-base font-bold text-slate-900 mb-1">Attach Supporting Documents</h3>
              <p className="text-sm text-slate-500 mb-4">
                Upload documents to the loan's eFolder. You can skip this step.
              </p>

              {/* Document list */}
              {docs.length > 0 && (
                <div className="space-y-3 mb-4">
                  {docs.map((doc, i) => (
                    <div key={`${doc.file.name}-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{doc.file.name}</p>
                        <p className="text-xs text-slate-400">{(doc.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <select
                        value={doc.docType}
                        onChange={(e) => updateDocType(i, e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-black"
                      >
                        {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button type="button" onClick={() => removeDoc(i)} className="p-1 text-slate-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add files button */}
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors w-full justify-center"
              >
                <Plus className="w-4 h-4" />
                Add Documents
              </button>
              <input
                ref={docInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.doc,.docx"
                className="hidden"
                onChange={(e) => handleAddDocFiles(e.target.files)}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('complete')}
                className="flex-1 py-3 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Skip — Done
              </button>
              <button
                type="button"
                onClick={handleUploadDocs}
                disabled={docs.length === 0}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-black hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 transition-all active:scale-[0.99]"
              >
                Upload {docs.length} Document{docs.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3b: UPLOADING DOCS PROGRESS ── */}
        {step === 'upload-docs' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-900">Uploading Documents to eFolder</h2>
            <div className="space-y-3">
              {uploadedDocs.map((doc, i) => (
                <div key={`${doc.fileName}-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  {doc.status === 'uploading' && <Loader2 className="w-4 h-4 text-black animate-spin shrink-0" />}
                  {doc.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                  {doc.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
                  {doc.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{doc.fileName}</p>
                    {doc.error && <p className="text-xs text-red-500 mt-0.5">{doc.error}</p>}
                  </div>
                  <span className="text-xs text-slate-400">{doc.docType}</span>
                </div>
              ))}
            </div>
            {isUploading && (
              <p className="text-xs text-slate-400 text-center">Uploading... please wait</p>
            )}
          </div>
        )}

        {/* ── STEP 4: COMPLETE ── */}
        {step === 'complete' && (
          <div className="flex flex-col items-center py-16 gap-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-900">Submission Complete</h2>
              <p className="text-sm text-slate-500 mt-2">
                Loan <span className="font-bold text-slate-900">#{loanNumber}</span> has been created in Encompass
                {uploadedDocs.filter(d => d.status === 'done').length > 0 && (
                  <> with {uploadedDocs.filter(d => d.status === 'done').length} document{uploadedDocs.filter(d => d.status === 'done').length !== 1 ? 's' : ''} attached</>
                )}
                .
              </p>
            </div>

            {/* Document upload summary */}
            {uploadedDocs.length > 0 && (
              <div className="w-full max-w-md space-y-2">
                {uploadedDocs.map((doc, i) => (
                  <div key={`${doc.fileName}-${i}`} className="flex items-center gap-2 text-sm">
                    {doc.status === 'done'
                      ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                      : <AlertCircle className="w-4 h-4 text-red-500" />
                    }
                    <span className={doc.status === 'done' ? 'text-slate-700' : 'text-red-600'}>{doc.fileName}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setStep('upload-mismo')
                  setMismoFile(null)
                  setMismoXml('')
                  setLoanId('')
                  setLoanNumber('')
                  setDocs([])
                  setUploadedDocs([])
                  setError(null)
                }}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-black hover:bg-slate-800 transition-all"
              >
                Submit Another Loan
              </button>
              <button
                type="button"
                onClick={onBack}
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
