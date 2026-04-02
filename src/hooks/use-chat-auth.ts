import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface ChatSystemUser {
  id: string
  email: string
  display_name: string
  role: 'super_admin' | 'company_admin' | 'sales_manager' | 'client'
  company_id: string | null
  company_name: string
}

const STORAGE_KEY = 'chat_system_user'

export function useChatAuth() {
  const [user, setUser] = useState<ChatSystemUser | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Persist user to localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [user])

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('chat_authenticate', {
        p_email: email,
        p_password: password,
      })
      if (rpcError) throw new Error(rpcError.message)
      const result = data as { success: boolean; user?: ChatSystemUser; error?: string }
      if (!result.success) {
        setError(result.error || 'Invalid credentials')
        setLoading(false)
        return false
      }
      setUser(result.user!)
      setLoading(false)
      return true
    } catch (err: any) {
      setError(err.message || 'Login failed')
      setLoading(false)
      return false
    }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  // Permission helpers
  const canCreateCompanyAdmin = user?.role === 'super_admin'
  const canManageUsers = user?.role === 'super_admin' || user?.role === 'company_admin'
  const canAssignUsers = user?.role === 'super_admin' || user?.role === 'company_admin'
  const canViewAllChats = user?.role === 'super_admin' || user?.role === 'company_admin'
  const isSalesManager = user?.role === 'sales_manager'
  const isClient = user?.role === 'client'

  return {
    user,
    loading,
    error,
    login,
    logout,
    canCreateCompanyAdmin,
    canManageUsers,
    canAssignUsers,
    canViewAllChats,
    isSalesManager,
    isClient,
  }
}
