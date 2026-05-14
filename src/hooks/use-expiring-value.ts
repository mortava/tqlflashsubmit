import { useEffect, useState } from 'react'

export interface ExpiringState {
  isFresh: boolean
  secondsRemaining: number
}

export function useExpiringValue(pricedAt: number | null | undefined, ttlMs: number): ExpiringState {
  const compute = (): ExpiringState => {
    if (!pricedAt) return { isFresh: false, secondsRemaining: 0 }
    const remaining = ttlMs - (Date.now() - pricedAt)
    if (remaining <= 0) return { isFresh: false, secondsRemaining: 0 }
    return { isFresh: true, secondsRemaining: Math.ceil(remaining / 1000) }
  }

  const [state, setState] = useState<ExpiringState>(compute)

  useEffect(() => {
    setState(compute())
    if (!pricedAt) return

    const tick = () => setState(compute())
    const interval = window.setInterval(tick, 1000)
    const onVisibility = () => tick()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [pricedAt, ttlMs])

  return state
}
