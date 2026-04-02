import { useEffect } from 'react'
import { ChatAdminPanel } from '@/components/chat-admin-panel'

export default function AdminChatPage() {
  // Hide from search engines
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])

  // The ChatAdminPanel handles its own login — no more passcode gate
  return <ChatAdminPanel onClose={() => { window.location.href = '/' }} />
}
