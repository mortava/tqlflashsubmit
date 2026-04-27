import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send, MessageCircle, ArrowLeft, RefreshCw, ImageIcon, Users, UserPlus, Link2, LogOut, Shield, Copy, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, generateId } from '@/lib/utils'
import { useChatAuth, type ChatSystemUser } from '@/hooks/use-chat-auth'
import { playAdminNotificationSound } from '@/hooks/use-live-chat'

/* ── Types ── */
interface Conversation {
  id: string
  user_id: string
  user_name: string
  status: 'open' | 'closed'
  department: 'support' | 'sales'
  system_user_id?: string
  assigned_manager_id?: string
  company_id?: string
  created_at: string
  updated_at?: string
}

interface ChatMessage {
  id: string
  conversation_id: string
  sender_role: 'user' | 'agent'
  sender_name: string
  content: string
  image_url?: string | null
  created_at: string
}

interface SystemUser {
  id: string
  email: string
  display_name: string
  role: string
  company_id: string | null
  is_active: boolean
  avatar_url?: string | null
  created_at: string
}

interface Assignment {
  id: string
  sales_manager_id: string
  client_id: string
  company_id: string
  created_at: string
  manager_name?: string
  client_name?: string
}

type AdminTab = 'chats' | 'users' | 'assignments'

/* ── Avatar helper: auto-fit circular ── */
function UserAvatar({ src, name, size = 36 }: { src?: string | null; name: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="flex items-center justify-center rounded-full tql-bg-teal text-white font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

/* ── Avatar upload helper ── */
async function uploadAvatar(file: File, userId: string): Promise<string | null> {
  const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) return null
  const ext = file.name.split('.').pop() || 'png'
  const path = `avatars/${userId}_${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('chat-images').upload(path, file, { contentType: file.type })
  if (error) { console.error('Avatar upload error:', error); return null }
  const { data } = supabase.storage.from('chat-images').getPublicUrl(path)
  return data.publicUrl
}

/* ── Copy text to clipboard ── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }
  return (
    <button onClick={handleCopy} className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:tql-text-link transition-colors" title="Copy message">
      <Copy className="w-3 h-3" />
      {copied && <span className="tql-text-link">Copied</span>}
    </button>
  )
}

/* ── Main Panel ── */
export function ChatAdminPanel({ onClose }: { onClose: () => void }) {
  const { user, loading: authLoading, error: authError, login, logout } = useChatAuth()

  if (!user) {
    return <ChatLoginScreen onLogin={login} loading={authLoading} error={authError} onClose={onClose} />
  }

  return <ChatAdminMain user={user} onClose={onClose} onLogout={logout} />
}

/* ══════════════════════════════════════════════════════════
   LOGIN SCREEN — matches ChatCom design
   ══════════════════════════════════════════════════════════ */
function ChatLoginScreen({ onLogin, loading, error, onClose }: {
  onLogin: (email: string, password: string) => Promise<boolean>
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onLogin(email, password)
  }

  return (
    <div className="flex flex-col bg-white min-h-full">
      {/* Back link top-left */}
      <div className="px-6 pt-5">
        <button type="button" onClick={onClose} className="text-sm tql-text-link hover:text-blue-700 transition-colors">Back to TQL Pricer</button>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-[420px] px-6">
          {/* Logo + Title */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5">
              <Shield className="w-10 h-10 text-blue-500" />
            </div>
            <h1 className="text-[28px] font-light text-slate-600 tracking-[-0.01em]">
              <span className="text-slate-800">Chat</span><span className="text-slate-800">Com</span> Login
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full h-12 px-4 text-sm bg-white border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-colors placeholder:text-slate-400"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-slate-700">Password</label>
                <button type="button" className="text-sm tql-text-link hover:text-blue-700 transition-colors">Forgot Password</button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-12 px-4 text-sm bg-white border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-colors placeholder:text-slate-400"
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 tql-bg-teal text-white text-sm font-semibold rounded-xl hover:bg-black transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Loading bar accent */}
          <div className="mt-6 mx-auto w-48 h-1 rounded-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 opacity-40" />

          <p className="mt-8 text-center text-xs text-slate-400">&copy; Open Broker Labs</p>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   MAIN ADMIN PANEL (post-login)
   ══════════════════════════════════════════════════════════ */
function ChatAdminMain({ user, onClose, onLogout }: {
  user: ChatSystemUser
  onClose: () => void
  onLogout: () => void
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>('chats')

  const canManageUsers = user.role === 'super_admin' || user.role === 'company_admin'
  const canAssignUsers = user.role === 'super_admin' || user.role === 'company_admin'
  const isSalesManager = user.role === 'sales_manager'

  const roleLabel = {
    super_admin: 'Super Admin',
    company_admin: 'Company Admin',
    sales_manager: 'Sales Manager',
    client: 'Client',
  }[user.role]

  const roleBadgeColor = {
    super_admin: 'bg-purple-50 text-purple-700 border-purple-200',
    company_admin: 'bg-blue-50 text-blue-700 border-blue-200',
    sales_manager: 'bg-blue-50 text-blue-700 border-blue-200',
    client: 'bg-slate-50 text-slate-600 border-slate-200',
  }[user.role]

  return (
    <div className="flex flex-col bg-white min-h-full">
      {/* Top Bar — ChatCom branding */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-5 h-5 tql-text-link" />
          <h2 className="text-base font-semibold text-slate-900 tracking-[-0.02em]">ChatCom</h2>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleBadgeColor}`}>{roleLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:block">{user.display_name}</span>
          <button onClick={onLogout} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-50 transition-colors" title="Sign Out">
            <LogOut className="w-4 h-4 text-slate-500" />
          </button>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-50 transition-colors" title="Close">
            <X className="w-4 h-4 text-slate-900" />
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      {(canManageUsers || canAssignUsers) && (
        <div className="flex items-center gap-1 px-5 py-2 border-b border-slate-100 shrink-0">
          <TabButton active={activeTab === 'chats'} onClick={() => setActiveTab('chats')} icon={<MessageCircle className="w-3.5 h-3.5" />} label="Chats" />
          {canManageUsers && <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<Users className="w-3.5 h-3.5" />} label="Users" />}
          {canAssignUsers && <TabButton active={activeTab === 'assignments'} onClick={() => setActiveTab('assignments')} icon={<Link2 className="w-3.5 h-3.5" />} label="Assignments" />}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chats' && <ChatsView user={user} isSalesManager={isSalesManager} />}
        {activeTab === 'users' && canManageUsers && <UsersView user={user} />}
        {activeTab === 'assignments' && canAssignUsers && <AssignmentsView user={user} />}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
        active ? 'tql-bg-teal text-white' : 'text-slate-500 hover:bg-slate-50'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════
   CHATS VIEW — with copy, share, Ask TRINITY
   ══════════════════════════════════════════════════════════ */
function ChatsView({ user, isSalesManager }: { user: ChatSystemUser; canViewAllChats?: boolean; isSalesManager: boolean }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const seenMsgIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (selected) setTimeout(() => inputRef.current?.focus(), 100) }, [selected])

  const loadConversations = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('chat_conversations').select('*').eq('status', 'open').order('updated_at', { ascending: false })
    if (isSalesManager) query = query.eq('assigned_manager_id', user.id)
    const { data, error } = await query
    if (error) console.error('[ChatAdmin] Load convos error:', error)
    if (data) setConversations(data as Conversation[])
    setLoading(false)
  }, [user.id, isSalesManager])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Poll conversations
  useEffect(() => {
    const poll = async () => {
      let query = supabase.from('chat_conversations').select('*').eq('status', 'open').order('updated_at', { ascending: false })
      if (isSalesManager) query = query.eq('assigned_manager_id', user.id)
      const { data } = await query
      if (data) {
        setConversations((prev) => {
          const prevIds = new Set(prev.map((c) => c.id))
          const newOnes = (data as Conversation[]).filter((c) => !prevIds.has(c.id))
          if (newOnes.length > 0) playAdminNotificationSound()
          return data as Conversation[]
        })
      }
    }
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [user.id, isSalesManager])

  // Realtime new conversations
  useEffect(() => {
    const channel = supabase
      .channel(`admin-convos:${user.id}:${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_conversations' }, (payload) => {
        const newConvo = payload.new as Conversation
        if (isSalesManager && newConvo.assigned_manager_id !== user.id) return
        setConversations((prev) => {
          if (prev.some((c) => c.id === newConvo.id)) return prev
          return [newConvo, ...prev]
        })
        playAdminNotificationSound()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_conversations' }, (payload) => {
        const updated = payload.new as Conversation
        if (updated.status === 'closed') setConversations((prev) => prev.filter((c) => c.id !== updated.id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user.id, isSalesManager])

  // Poll messages
  useEffect(() => {
    if (!selected) return
    seenMsgIdsRef.current = new Set()
    const poll = async () => {
      const { data } = await supabase.from('chat_messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
      if (data) {
        setMessages((prev) => {
          const dbMsgs = data as ChatMessage[]
          const dbIds = new Set(dbMsgs.map((m) => m.id))
          const keptOptimistic = prev.filter((m) => !dbIds.has(m.id) && m.sender_role === 'agent' && !dbMsgs.some((d) => d.sender_role === 'agent' && d.content === m.content))
          const newUserMsgs = dbMsgs.filter((m) => m.sender_role === 'user' && !seenMsgIdsRef.current.has(m.id))
          if (newUserMsgs.length > 0 && seenMsgIdsRef.current.size > 0) {
            playAdminNotificationSound()
            if (document.hidden && Notification.permission === 'granted') new Notification('New Message', { body: newUserMsgs[newUserMsgs.length - 1].content || 'Sent an image' })
          }
          dbMsgs.forEach((m) => seenMsgIdsRef.current.add(m.id))
          const merged = [...dbMsgs, ...keptOptimistic]
          if (merged.length === prev.length && merged.every((m, i) => m.id === prev[i]?.id)) return prev
          return merged
        })
      }
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [selected?.id])

  async function handleSend() {
    if (selectedImage && selected) {
      const caption = input.trim() || undefined; const file = selectedImage
      setInput(''); clearImage(); await handleSendImage(file, caption); return
    }
    if (!input.trim() || !selected) return
    const content = input.trim(); setInput('')
    const optimisticMsg: ChatMessage = { id: generateId(), conversation_id: selected.id, sender_role: 'agent', sender_name: user.display_name, content, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, optimisticMsg])
    const { error } = await supabase.from('chat_messages').insert({ conversation_id: selected.id, sender_role: 'agent', sender_name: user.display_name, content })
    if (error) { setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id)); setInput(content) }
  }

  async function handleSendImage(file: File, caption?: string) {
    if (!selected) return
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
    if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) return
    const ext = file.name.split('.').pop() || 'png'
    const path = `${selected.id}/${Date.now()}_${generateId()}.${ext}`
    const localUrl = URL.createObjectURL(file)
    const optimisticMsg: ChatMessage = { id: generateId(), conversation_id: selected.id, sender_role: 'agent', sender_name: user.display_name, content: caption || '', image_url: localUrl, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, optimisticMsg])
    const { error: uploadError } = await supabase.storage.from('chat-images').upload(path, file, { contentType: file.type })
    if (uploadError) { setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id)); return }
    const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(path)
    const { error } = await supabase.from('chat_messages').insert({ conversation_id: selected.id, sender_role: 'agent', sender_name: user.display_name, content: caption || '', image_url: urlData.publicUrl })
    if (error) setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id))
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
    if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) return
    setSelectedImage(file); setImagePreview(URL.createObjectURL(file)); e.target.value = ''
  }
  function clearImage() { if (imagePreview) URL.revokeObjectURL(imagePreview); setSelectedImage(null); setImagePreview(null) }

  async function handleCloseConversation(convoId: string) {
    await supabase.from('chat_conversations').update({ status: 'closed' }).eq('id', convoId)
    setConversations((prev) => prev.filter((c) => c.id !== convoId))
    if (selected?.id === convoId) { setSelected(null); setMessages([]) }
  }

  function shareSession() {
    if (!selected || messages.length === 0) return
    const text = messages.map((m) => `[${m.sender_name}] ${m.content}`).join('\n')
    navigator.clipboard.writeText(text)
    alert('Chat session copied to clipboard')
  }

  function formatTime(iso: string) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  function formatDate(iso: string) {
    const d = new Date(iso); const now = new Date()
    if (d.toDateString() === now.toDateString()) return 'Today'
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Conversation List */}
      <div className="w-[320px] border-r border-slate-200 flex flex-col overflow-y-auto shrink-0">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Conversations</span>
          <button onClick={loadConversations} className="p-1 rounded hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5 text-slate-400" /></button>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><span className="text-sm text-slate-400">Loading...</span></div>
        ) : conversations.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <MessageCircle className="h-6 w-6 text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">No open conversations</p>
          </div>
        ) : (
          conversations.map((convo) => (
            <button key={convo.id} onClick={() => setSelected(convo)}
              className={cn('w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors border-b border-slate-100', selected?.id === convo.id ? 'bg-slate-50' : 'hover:bg-slate-50/60')}>
              <UserAvatar name={convo.user_name} size={36} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900 truncate">{convo.user_name}</span>
                  <span className="text-[10px] text-slate-400 shrink-0 ml-2">{formatDate(convo.created_at)}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-slate-500 capitalize">{convo.department}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleCloseConversation(convo.id) }}
                    className="text-[10px] text-slate-400 hover:text-red-500 transition-colors">Close</button>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <MessageCircle className="h-7 w-7 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 font-medium">Select a conversation</p>
          </div>
        ) : (
          <>
            {/* Chat Header with Share + Ask TRINITY */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={() => { setSelected(null); setMessages([]) }} className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-50"><ArrowLeft className="w-4 h-4" /></button>
                <UserAvatar name={selected.user_name} size={36} />
                <div>
                  <span className="text-sm font-semibold text-slate-900">{selected.user_name}</span>
                  <p className="text-xs text-slate-500 capitalize flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-600" />
                    {selected.department} · {formatTime(selected.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={shareSession} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors" title="Share session">
                  <span>Share</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <a href="https://dealr.defywholesale.com" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors" title="Ask TRINITY Agent">
                  <span>Ask <span className="tql-text-link font-semibold">TRINITY</span> Agent</span>
                </a>
                <button onClick={() => handleCloseConversation(selected.id)}
                  className="text-xs text-slate-400 hover:text-red-500 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">End Chat</button>
              </div>
            </div>

            {/* Messages with copy buttons */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-slate-400">No messages yet.</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={cn('mb-4 flex flex-col', msg.sender_role === 'agent' ? 'items-end' : 'items-start')}>
                  <div className={cn('max-w-[65%] rounded-xl px-4 py-2.5 text-sm', msg.sender_role === 'agent' ? 'tql-bg-teal text-white' : 'bg-slate-50 text-slate-900 border border-slate-200')}>
                    <p className={cn('mb-1 text-xs font-medium', msg.sender_role === 'agent' ? 'text-slate-400' : 'text-slate-500')}>{msg.sender_name}</p>
                    {msg.image_url && (
                      <img src={msg.image_url} alt="Shared" className="max-w-[280px] w-full rounded-lg mb-1.5 cursor-pointer hover:opacity-90" onClick={() => setLightboxUrl(msg.image_url!)} />
                    )}
                    {msg.content && <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {msg.content && <CopyButton text={msg.content} />}
                    <span className="text-xs text-slate-400">{formatTime(msg.created_at)}</span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Input */}
            <div className="px-4 pb-4 pt-2 border-t border-slate-100 shrink-0">
              {imagePreview && (
                <div className="mb-2 relative inline-block">
                  <img src={imagePreview} alt="Preview" className="h-16 rounded-lg border border-slate-200" />
                  <button onClick={clearImage} className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full tql-bg-teal text-white"><X className="h-3 w-3" /></button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="file" ref={fileInputRef} accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleFileSelect} />
                <button onClick={() => fileInputRef.current?.click()} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-slate-50 transition-colors shrink-0 border border-slate-200" title="Attach image">
                  <ImageIcon className="h-4 w-4 text-slate-500" />
                </button>
                <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder={selectedImage ? 'Add a caption...' : `Reply as ${user.display_name}...`}
                  className="flex-1 rounded-lg bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border border-slate-300" />
                <button onClick={handleSend} disabled={!input.trim() && !selectedImage}
                  className="flex h-10 w-10 items-center justify-center rounded-lg tql-bg-teal text-white hover:opacity-85 disabled:opacity-50" title="Send">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 p-4" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Full size" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   USERS VIEW — with avatar upload
   ══════════════════════════════════════════════════════════ */
function UsersView({ user }: { user: ChatSystemUser }) {
  const [users, setUsers] = useState<SystemUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', password: '', display_name: '', role: 'client' })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const canCreateCompanyAdmin = user.role === 'super_admin'

  const loadUsers = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('chat_system_users').select('*').order('created_at', { ascending: false })
    if (user.role === 'company_admin' && user.company_id) query = query.eq('company_id', user.company_id)
    const { data } = await query
    if (data) setUsers(data as SystemUser[])
    setLoading(false)
  }, [user.role, user.company_id])

  useEffect(() => { loadUsers() }, [loadUsers])

  function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
    if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) return
    setAvatarFile(file); setAvatarPreview(URL.createObjectURL(file)); e.target.value = ''
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true); setStatusMsg(null)
    const { data, error } = await supabase.rpc('chat_create_user', {
      p_caller_id: user.id,
      p_email: newUser.email,
      p_password: newUser.password,
      p_display_name: newUser.display_name,
      p_role: newUser.role,
      p_company_id: user.role === 'super_admin' ? (user.company_id || '00000000-0000-0000-0000-000000000001') : null,
    })
    if (error) { setStatusMsg({ type: 'error', text: error.message }); setCreating(false); return }
    const result = data as { success: boolean; user_id?: string; error?: string }
    if (!result.success) { setStatusMsg({ type: 'error', text: result.error || 'Failed' }); setCreating(false); return }

    // Upload avatar if selected
    if (avatarFile && result.user_id) {
      const url = await uploadAvatar(avatarFile, result.user_id)
      if (url) await supabase.from('chat_system_users').update({ avatar_url: url }).eq('id', result.user_id)
    }

    setStatusMsg({ type: 'success', text: `User created: ${newUser.email}` })
    setNewUser({ email: '', password: '', display_name: '', role: 'client' })
    setAvatarFile(null); if (avatarPreview) URL.revokeObjectURL(avatarPreview); setAvatarPreview(null)
    setShowAddForm(false); setCreating(false); loadUsers()
  }

  async function toggleUserActive(userId: string, currentActive: boolean) {
    await supabase.from('chat_system_users').update({ is_active: !currentActive }).eq('id', userId)
    loadUsers()
  }

  const roleColors: Record<string, string> = {
    super_admin: 'bg-purple-50 text-purple-700',
    company_admin: 'bg-blue-50 text-blue-700',
    sales_manager: 'bg-blue-50 text-blue-700',
    client: 'bg-slate-100 text-slate-600',
  }

  const availableRoles = canCreateCompanyAdmin
    ? [{ value: 'company_admin', label: 'Company Admin' }, { value: 'sales_manager', label: 'Sales Manager' }, { value: 'client', label: 'Client' }]
    : [{ value: 'sales_manager', label: 'Sales Manager' }, { value: 'client', label: 'Client' }]

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Users</h3>
            <p className="text-sm text-slate-400">{users.length} users</p>
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium tql-bg-teal text-white hover:bg-black transition-colors">
            <UserPlus className="w-3.5 h-3.5" />
            Add User
          </button>
        </div>

        {/* Add User Form with Avatar Upload */}
        {showAddForm && (
          <form onSubmit={handleCreate} className="bg-slate-50 rounded-xl p-5 mb-6 space-y-4 border border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Display Name</label>
                <input type="text" required value={newUser.display_name} onChange={(e) => setNewUser(p => ({ ...p, display_name: e.target.value }))}
                  placeholder="John Smith" className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <input type="email" required value={newUser.email} onChange={(e) => setNewUser(p => ({ ...p, email: e.target.value }))}
                  placeholder="john@company.com" className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Password</label>
                <input type="text" required value={newUser.password} onChange={(e) => setNewUser(p => ({ ...p, password: e.target.value }))}
                  placeholder="Secure password" className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Role</label>
                <select value={newUser.role} onChange={(e) => setNewUser(p => ({ ...p, role: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>

            {statusMsg && <p className={cn('text-sm', statusMsg.type === 'error' ? 'text-red-500' : 'tql-text-link')}>{statusMsg.text}</p>}

            {/* Avatar Upload + Preview Row */}
            <div className="flex items-end gap-6 pt-2">
              <div className="flex items-center gap-3">
                <button type="submit" disabled={creating}
                  className="px-4 py-2 rounded-lg text-sm font-medium tql-bg-teal text-white hover:bg-black disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create User'}
                </button>
                <button type="button" onClick={() => { setShowAddForm(false); setAvatarFile(null); if (avatarPreview) URL.revokeObjectURL(avatarPreview); setAvatarPreview(null) }}
                  className="px-4 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100">Cancel</button>
              </div>
              <div className="flex items-center gap-4 ml-auto">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Upload User Image</label>
                  <input type="file" ref={avatarInputRef} accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleAvatarSelect} />
                  <button type="button" onClick={() => avatarInputRef.current?.click()}
                    className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-white transition-colors text-slate-600">
                    Browse
                  </button>
                </div>
                <div className="space-y-1 text-center">
                  <label className="text-xs font-semibold text-slate-700">User Image Preview</label>
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-slate-200 bg-slate-100 flex items-center justify-center">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-slate-400">No img</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Users List */}
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Loading users...</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className={cn('flex items-center justify-between px-4 py-3 rounded-xl border transition-colors', u.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60')}>
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar src={u.avatar_url} name={u.display_name} size={36} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{u.display_name}</div>
                    <div className="text-xs text-slate-400 truncate">{u.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', roleColors[u.role] || 'bg-slate-100 text-slate-600')}>
                    {u.role.replace('_', ' ')}
                  </span>
                  {u.email !== user.email && (
                    <button onClick={() => toggleUserActive(u.id, u.is_active)}
                      className={cn('text-[10px] px-2 py-1 rounded', u.is_active ? 'text-red-500 hover:bg-red-50' : 'tql-text-link hover:bg-blue-50')}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   ASSIGNMENTS VIEW
   ══════════════════════════════════════════════════════════ */
function AssignmentsView({ user }: { user: ChatSystemUser }) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [managers, setManagers] = useState<SystemUser[]>([])
  const [clients, setClients] = useState<SystemUser[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedManager, setSelectedManager] = useState('')
  const [selectedClient, setSelectedClient] = useState('')
  const [creating, setCreating] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const companyFilter = user.role === 'company_admin' && user.company_id ? user.company_id : null
    let aQuery = supabase.from('chat_assignments').select('*').order('created_at', { ascending: false })
    if (companyFilter) aQuery = aQuery.eq('company_id', companyFilter)
    const { data: aData } = await aQuery
    let mQuery = supabase.from('chat_system_users').select('*').eq('role', 'sales_manager').eq('is_active', true)
    if (companyFilter) mQuery = mQuery.eq('company_id', companyFilter)
    const { data: mData } = await mQuery
    let cQuery = supabase.from('chat_system_users').select('*').eq('role', 'client').eq('is_active', true)
    if (companyFilter) cQuery = cQuery.eq('company_id', companyFilter)
    const { data: cData } = await cQuery
    const allUsers = [...(mData || []), ...(cData || [])] as SystemUser[]
    const userMap = new Map(allUsers.map(u => [u.id, u]))
    const enrichedAssignments = ((aData || []) as Assignment[]).map(a => ({
      ...a,
      manager_name: userMap.get(a.sales_manager_id)?.display_name || 'Unknown',
      client_name: userMap.get(a.client_id)?.display_name || 'Unknown',
    }))
    setAssignments(enrichedAssignments)
    setManagers((mData || []) as SystemUser[])
    setClients((cData || []) as SystemUser[])
    setLoading(false)
  }, [user.role, user.company_id])

  useEffect(() => { loadData() }, [loadData])

  async function handleAssign() {
    if (!selectedManager || !selectedClient) return
    setCreating(true); setStatusMsg(null)
    const { data, error } = await supabase.rpc('chat_assign_user', { p_caller_id: user.id, p_sales_manager_id: selectedManager, p_client_id: selectedClient })
    setCreating(false)
    if (error) { setStatusMsg({ type: 'error', text: error.message }); return }
    const result = data as { success: boolean; error?: string }
    if (!result.success) { setStatusMsg({ type: 'error', text: result.error || 'Failed' }); return }
    setStatusMsg({ type: 'success', text: 'Assignment created' })
    setSelectedManager(''); setSelectedClient(''); loadData()
  }

  async function handleRemove(assignmentId: string) {
    await supabase.rpc('chat_unassign_user', { p_caller_id: user.id, p_assignment_id: assignmentId })
    loadData()
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h3 className="text-base font-semibold text-slate-900">Assignments</h3>
          <p className="text-sm text-slate-400">Tie sales managers to their clients</p>
        </div>

        <div className="bg-slate-50 rounded-xl p-5 mb-6 border border-slate-200">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">New Assignment</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">Sales Manager</label>
              <select value={selectedManager} onChange={(e) => setSelectedManager(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">Select manager...</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.display_name} ({m.email})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">Client</label>
              <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.display_name} ({c.email})</option>)}
              </select>
            </div>
          </div>
          {statusMsg && <p className={cn('text-sm mb-3', statusMsg.type === 'error' ? 'text-red-500' : 'tql-text-link')}>{statusMsg.text}</p>}
          <button onClick={handleAssign} disabled={creating || !selectedManager || !selectedClient}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium tql-bg-teal text-white hover:bg-black disabled:opacity-50">
            <Link2 className="w-3.5 h-3.5" />
            {creating ? 'Assigning...' : 'Create Assignment'}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No assignments yet.</p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200">
                <div className="text-sm">
                  <span className="font-semibold text-blue-700">{a.manager_name}</span>
                  <span className="text-slate-400 mx-2">→</span>
                  <span className="font-semibold text-slate-700">{a.client_name}</span>
                </div>
                <button onClick={() => handleRemove(a.id)} className="text-[10px] text-red-500 hover:bg-red-50 px-2 py-1 rounded">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
