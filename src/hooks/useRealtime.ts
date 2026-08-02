import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useRealtimeInvalidation() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  useEffect(() => {
    if (!profile) return
    const channel = supabase.channel(`crm-live-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => { void queryClient.invalidateQueries({ queryKey: ['tasks'] }); void queryClient.invalidateQueries({ queryKey: ['dashboard'] }); void queryClient.invalidateQueries({ queryKey: ['calendar'] }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => { void queryClient.invalidateQueries({ queryKey: ['projects'] }); void queryClient.invalidateQueries({ queryKey: ['dashboard'] }); void queryClient.invalidateQueries({ queryKey: ['calendar'] }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, () => { void queryClient.invalidateQueries({ queryKey: ['projects'] }); void queryClient.invalidateQueries({ queryKey: ['dashboard'] }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => void queryClient.invalidateQueries({ queryKey: ['calendar'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { void queryClient.invalidateQueries({ queryKey: ['profiles'] }); void queryClient.invalidateQueries({ queryKey: ['dashboard'] }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_logs' }, () => void queryClient.invalidateQueries({ queryKey: ['work-logs'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => void queryClient.invalidateQueries({ queryKey: ['finance'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => void queryClient.invalidateQueries({ queryKey: ['finance'] }))
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [profile, queryClient])
}
