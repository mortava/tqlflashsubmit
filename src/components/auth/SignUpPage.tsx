import { useState } from 'react'
import { ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface SignUpPageProps {
  onBack: () => void
  onLogin: () => void
}

export function SignUpPage({ onBack, onLogin }: SignUpPageProps) {
  const { signUp } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    company_name: '', company_nmls: '', company_address: '',
    first_name: '', last_name: '', mlo_nmls: '', cell_phone: '',
  })

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password || !form.company_name || !form.company_nmls || !form.first_name || !form.last_name) {
      setError('Please fill in all required fields'); return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match'); return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters'); return
    }

    setLoading(true)
    const { error: authError } = await signUp(form.email, form.password, {
      company_name: form.company_name,
      company_nmls: form.company_nmls,
      company_address: form.company_address || null,
      first_name: form.first_name,
      last_name: form.last_name,
      mlo_nmls: form.mlo_nmls || null,
      cell_phone: form.cell_phone || null,
    })
    setLoading(false)

    if (authError) { setError(authError); return }
    setSuccess(true)
  }

  const inputClass = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
  const labelClass = "block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1"

  if (success) {
    return (
      <div className="min-h-[100dvh] bg-white flex items-center justify-center px-4">
        <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-xl p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Account Created</h2>
          <p className="text-sm text-slate-500 mb-6">Check your email to confirm your account, then sign in.</p>
          <button onClick={onLogin} className="w-full py-3 tql-bg-teal text-white rounded-xl text-sm font-semibold hover:bg-black transition-colors">
            Go to Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] bg-white flex flex-col overflow-y-auto">
      <div className="flex-1 flex items-start justify-center px-4 py-4 sm:py-6">
        <div className="w-full max-w-[560px]">
          {/* Header */}
          <div className="text-center mb-4">
            <h1 className="font-['Montserrat'] text-2xl sm:text-3xl font-extrabold tracking-tight">
              <span className="text-slate-900">DEFY </span><span className="tql-text-link">CLOUD</span>
            </h1>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.25em] mt-1">Partner Registration</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Company Info */}
            <div>
              <div className="text-[10px] font-bold tql-text-link uppercase tracking-widest mb-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-blue-100" />Company Information<div className="h-px flex-1 bg-blue-100" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Broker / Company Name *</label>
                  <input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="ACME Mortgage" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Company NMLS# *</label>
                  <input value={form.company_nmls} onChange={(e) => set('company_nmls', e.target.value)} placeholder="123456" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Address</label>
                  <input value={form.company_address} onChange={(e) => set('company_address', e.target.value)} placeholder="123 Main St, City, ST 12345" className={inputClass} />
                </div>
              </div>
            </div>

            {/* MLO/Processor Info */}
            <div>
              <div className="text-[10px] font-bold tql-text-link uppercase tracking-widest mb-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-blue-100" />MLO / Processor<div className="h-px flex-1 bg-blue-100" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>First Name *</label>
                  <input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} placeholder="John" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Last Name *</label>
                  <input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} placeholder="Doe" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>MLO NMLS#</label>
                  <input value={form.mlo_nmls} onChange={(e) => set('mlo_nmls', e.target.value)} placeholder="789012" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Cell Phone</label>
                  <input value={form.cell_phone} onChange={(e) => set('cell_phone', e.target.value)} placeholder="(555) 123-4567" className={inputClass} />
                </div>
              </div>
            </div>

            {/* Account Credentials */}
            <div>
              <div className="text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-slate-200" />Account Login<div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className={labelClass}>Email *</label>
                  <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@company.com" className={inputClass} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Password *</label>
                    <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Min 6 chars" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Confirm Password *</label>
                    <input type="password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} placeholder="Re-enter" className={inputClass} />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full py-3 tql-bg-teal hover:bg-black text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Create Account <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="text-center mt-4">
            <button type="button" onClick={onLogin} className="text-[13px] text-slate-400 hover:text-slate-600 transition-colors">
              Already have an account? <span className="font-medium text-slate-600">Sign in</span>
            </button>
          </div>
          <button type="button" onClick={onBack} className="w-full mt-2 py-2 text-[12px] text-slate-400 hover:text-slate-600 transition-colors text-center">
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  )
}
