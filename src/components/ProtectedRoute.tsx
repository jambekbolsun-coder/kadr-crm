import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute({ children, permission, adminOnly = false }: { children: ReactNode; permission?: string; adminOnly?: boolean }) {
  const { session, profile, loading, can, isAdmin } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="login-loading"><div><div className="spinner"/><p>Загрузка системы…</p></div></div>
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (!profile) return <Navigate to="/login" replace />
  if ((adminOnly && !isAdmin) || (permission && !can(permission))) return <Navigate to="/access-denied" replace />
  return children
}
