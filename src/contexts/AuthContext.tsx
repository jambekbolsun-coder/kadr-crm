import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Permission, Profile } from '../types/domain'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  permissions: string[]
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
  isAdmin: boolean
  isSuperAdmin: boolean
  can: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchIdentity(userId: string) {
  const { data: profile, error: pError } = await supabase
    .from('profiles')
    .select('*, department:departments(id,name,description,active)')
    .eq('id', userId)
    .single()
  if (pError) throw pError

  let permissions: string[] = []
  if (profile.system_role === 'super_admin') {
    const { data } = await supabase.from('permissions').select('code')
    permissions = (data as Pick<Permission, 'code'>[] | null)?.map(x => x.code) || []
  } else if (profile.system_role === 'admin') {
    const { data } = await supabase.from('user_permissions').select('permission:permissions(code)').eq('profile_id', userId).eq('allowed', true)
    permissions = (data || []).map((x: any) => x.permission?.code).filter(Boolean)
  }
  return { profile: profile as Profile, permissions }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (nextSession?: Session | null) => {
    const s = nextSession === undefined ? (await supabase.auth.getSession()).data.session : nextSession
    setSession(s)
    if (!s?.user) { setProfile(null); setPermissions([]); setLoading(false); return }
    try {
      const identity = await fetchIdentity(s.user.id)
      setProfile(identity.profile)
      setPermissions(identity.permissions)
      if (identity.profile.status === 'blocked' || identity.profile.status === 'fired') {
        await supabase.auth.signOut()
        setSession(null); setProfile(null); setPermissions([])
      }
    } catch (error) {
      console.error('Identity load failed', error)
      // A deleted/blocked profile must not leave a persisted Auth session that loops between /login and protected routes.
      await supabase.auth.signOut({ scope: 'local' }).catch(()=>undefined)
      setSession(null); setProfile(null); setPermissions([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    let alive = true
    void load()
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Supabase recommends avoiding additional auth/database calls synchronously inside this callback.
      window.setTimeout(() => { if (alive) void load(nextSession) }, 0)
    })
    return () => { alive = false; data.subscription.unsubscribe() }
  }, [load])

  const refreshProfile = useCallback(async () => { if (session?.user) { const id = await fetchIdentity(session.user.id); setProfile(id.profile); setPermissions(id.permissions) } }, [session])
  const signOut = useCallback(async () => { await supabase.auth.signOut() }, [])
  const isSuperAdmin = profile?.system_role === 'super_admin'
  const isAdmin = isSuperAdmin || profile?.system_role === 'admin'
  const can = useCallback((permission: string) => isSuperAdmin || permissions.includes(permission), [isSuperAdmin, permissions])
  const value = useMemo(() => ({ session, profile, permissions, loading, refreshProfile, signOut, isAdmin, isSuperAdmin, can }), [session, profile, permissions, loading, refreshProfile, signOut, isAdmin, isSuperAdmin, can])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
