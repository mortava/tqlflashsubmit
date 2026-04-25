import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/contexts/AuthContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const AdminChatPage = lazy(() => import('@/pages/AdminChatPage'))
const UserChatPage = lazy(() => import('@/pages/UserChatPage'))
const SubmitLoanPage = lazy(() => import('@/pages/SubmitLoanPage'))

function Router() {
  const path = window.location.pathname

  if (path === '/vbase' || path === '/adminchat') {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading...</div>}>
        <AdminChatPage />
      </Suspense>
    )
  }

  if (path === '/userchat') {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading...</div>}>
        <UserChatPage />
      </Suspense>
    )
  }

  if (path === '/submit') {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading...</div>}>
        <SubmitLoanPage onBack={() => { window.location.href = '/' }} />
      </Suspense>
    )
  }

  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
