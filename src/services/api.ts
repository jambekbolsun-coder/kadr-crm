import { supabase } from '../lib/supabase'
import type { CalendarEvent, Compensation, Department, Notification, Payment, Profile, Project, ServicePackage, Task, Transaction, WorkLog } from '../types/domain'

function throwIf(error: any) { if (error) throw error }

export async function getDepartments(includeInactive = false) {
  let q = supabase.from('departments').select('*').order('name')
  if (!includeInactive) q = q.eq('active', true)
  const { data, error } = await q
  throwIf(error); return (data || []) as Department[]
}

export async function getProfiles(includeInactive = true) {
  let q = supabase.from('profiles').select('*, department:departments(id,name,description,active)').order('full_name')
  if (!includeInactive) q = q.eq('status', 'active')
  const { data, error } = await q
  throwIf(error); return (data || []) as Profile[]
}

export async function getMyCompensation(profileId: string) {
  const { data, error } = await supabase.from('employee_compensation').select('*').eq('profile_id', profileId).maybeSingle()
  throwIf(error); return data as Compensation | null
}

export async function getPackages(activeOnly = false) {
  let q = supabase.from('packages').select('*, package_items(*), package_bonuses(*)').is('archived_at', null).order('created_at')
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  throwIf(error)
  return (data || []).map((x: any) => ({ ...x, package_items: (x.package_items || []).sort((a:any,b:any)=>a.sort_order-b.sort_order), package_bonuses: (x.package_bonuses || []).sort((a:any,b:any)=>a.sort_order-b.sort_order) })) as ServicePackage[]
}

export async function getProjects(mineProfileId?: string) {
  if (mineProfileId) {
    const { data: memberships, error: mErr } = await supabase.from('project_members').select('project_id').eq('profile_id', mineProfileId)
    throwIf(mErr)
    const ids = (memberships || []).map(x => x.project_id)
    if (!ids.length) return [] as Project[]
    const { data, error } = await supabase.from('projects').select('*, project_finance(contract_price), project_items(*), project_bonuses(*), project_members(*, profile:profiles(id,full_name,job_title,avatar_path,department_id))').in('id', ids).is('archived_at', null).order('created_at', { ascending: false })
    throwIf(error); return (data || []) as Project[]
  }
  const { data, error } = await supabase.from('projects').select('*, project_finance(contract_price), project_items(*), project_bonuses(*), project_members(*, profile:profiles(id,full_name,job_title,avatar_path,department_id))').is('archived_at', null).order('created_at', { ascending: false })
  throwIf(error); return (data || []) as Project[]
}

export async function getProject(id: string) {
  const { data, error } = await supabase.from('projects').select('*, project_finance(contract_price), project_items(*), project_bonuses(*), project_members(*, profile:profiles(id,full_name,job_title,avatar_path,department_id,email,phone,status,system_role,started_at,created_at,updated_at))').eq('id', id).single()
  throwIf(error); return data as Project
}

export async function getTasks(mineProfileId?: string, projectId?: string) {
  let q = supabase.from('tasks').select('*, project:projects(id,name), assignee:profiles(id,full_name,job_title,avatar_path)').order('due_at', { ascending: true, nullsFirst: false })
  if (mineProfileId) q = q.eq('assignee_id', mineProfileId)
  if (projectId) q = q.eq('project_id', projectId)
  const { data, error } = await q
  throwIf(error); return (data || []) as Task[]
}

export async function getCalendarEvents(rangeStart: string, rangeEnd: string) {
  const { data, error } = await supabase.from('calendar_events').select('*').gte('starts_at', rangeStart).lte('starts_at', rangeEnd).order('starts_at')
  throwIf(error); return (data || []) as CalendarEvent[]
}

export async function getNotifications(userId: string, limit = 30) {
  const { data, error } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit)
  throwIf(error); return (data || []) as Notification[]
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  throwIf(error)
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null)
  throwIf(error)
}

export async function getWorkLogs(profileId?: string, from?: string, to?: string) {
  let q = supabase.from('work_logs').select('*, project:projects(id,name)').order('work_date', { ascending: false })
  if (profileId) q = q.eq('profile_id', profileId)
  if (from) q = q.gte('work_date', from)
  if (to) q = q.lte('work_date', to)
  const { data, error } = await q
  throwIf(error); return (data || []) as WorkLog[]
}

export async function getPayments(projectId?: string) {
  let q = supabase.from('payments').select('*').order('paid_at', { ascending: false })
  if (projectId) q = q.eq('project_id', projectId)
  const { data, error } = await q
  throwIf(error); return (data || []) as Payment[]
}

export async function getTransactions(from?: string, to?: string) {
  let q = supabase.from('transactions').select('*').order('transaction_date', { ascending: false })
  if (from) q = q.gte('transaction_date', from)
  if (to) q = q.lte('transaction_date', to)
  const { data, error } = await q
  throwIf(error); return (data || []) as Transaction[]
}

export async function globalSearch(term: string) {
  const q = term.trim()
  if (q.length < 2) return [] as { type:string; id:string; title:string; sub:string; path:string }[]
  const pattern = `%${q}%`
  // Avoid raw PostgREST `.or()` syntax here: punctuation in user input must never break the search request.
  const p = supabase.from('profiles').select('id,full_name,job_title').ilike('full_name', pattern).limit(5)
  const prName = supabase.from('projects').select('id,name,client_name').ilike('name', pattern).limit(5)
  const prClient = supabase.from('projects').select('id,name,client_name').ilike('client_name', pattern).limit(5)
  const t = supabase.from('tasks').select('id,title,project_id').ilike('title', pattern).limit(5)
  const [a,bName,bClient,c] = await Promise.all([p,prName,prClient,t])
  for (const result of [a,bName,bClient,c]) throwIf(result.error)
  const projectMap = new Map<string, any>()
  for (const row of [...(bName.data || []), ...(bClient.data || [])]) projectMap.set(row.id, row)
  return [
    ...(a.data || []).map(x => ({ type:'Сотрудник', id:x.id, title:x.full_name, sub:x.job_title || '', path:`/employees?focus=${x.id}` })),
    ...Array.from(projectMap.values()).slice(0,5).map(x => ({ type:'Проект', id:x.id, title:x.name, sub:x.client_name || '', path:`/projects/${x.id}` })),
    ...(c.data || []).map(x => ({ type:'Задача', id:x.id, title:x.title, sub:'Открыть задачу', path:`/tasks?focus=${x.id}` })),
  ]
}
