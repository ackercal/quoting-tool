import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api/client'
import type { Me } from './types'

interface UserCtx {
  me: Me | null
  loading: boolean
  isAdmin: boolean
  adminMode: boolean          // admin viewing the app with admin controls on
  setAdminMode: (on: boolean) => void
  acknowledgeVersion: (v: string) => void
  logout: () => void
}

const Ctx = createContext<UserCtx>({
  me: null, loading: true, isAdmin: false,
  adminMode: false, setAdminMode: () => {},
  acknowledgeVersion: () => {}, logout: () => {},
})

export function UserProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [adminMode, setAdminModeState] = useState<boolean>(
    () => { try { return localStorage.getItem('qt_admin_mode') === '1' } catch { return false } }
  )

  useEffect(() => {
    let cancelled = false
    const load = (attempt = 0) => {
      api.getMe()
        .then(m => { if (!cancelled) { setMe(m); setLoading(false) } })
        .catch(() => {
          if (cancelled) return
          if (attempt < 3) setTimeout(() => load(attempt + 1), 1500)  // transient slowness/cold start
          else setLoading(false)
        })
    }
    load()
    return () => { cancelled = true }
  }, [])

  const isAdmin = !!me?.is_admin

  const setAdminMode = (on: boolean) => {
    setAdminModeState(on)
    try { localStorage.setItem('qt_admin_mode', on ? '1' : '0') } catch { /* ignore */ }
  }

  const acknowledgeVersion = (v: string) => {
    // optimistic: reflect locally, then persist for this user server-side
    setMe(prev => prev ? { ...prev, acknowledged_version: v } : prev)
    api.acknowledgeVersion(v).catch(() => { /* non-critical */ })
  }

  // Azure Easy Auth logout endpoint; harmless no-op locally (redirects home).
  const logout = () => { window.location.href = '/.auth/logout?post_logout_redirect_uri=/' }

  return (
    <Ctx.Provider value={{ me, loading, isAdmin, adminMode: adminMode && isAdmin, setAdminMode, acknowledgeVersion, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export function useUser() {
  return useContext(Ctx)
}
