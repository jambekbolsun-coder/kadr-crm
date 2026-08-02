export type SystemRole = 'super_admin' | 'admin' | 'employee'
export type EmployeeStatus = 'active' | 'vacation' | 'inactive' | 'fired' | 'blocked'
export type ProjectStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
export type ProjectType = 'monthly' | 'half' | 'oneoff' | 'custom'
export type TaskStatus = 'new' | 'in_progress' | 'review' | 'completed' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type EventType = 'task' | 'deadline' | 'project' | 'shoot' | 'meeting' | 'publication' | 'ads' | 'plan' | 'other'

export interface Department {
  id: string
  name: string
  description?: string | null
  active: boolean
}

export interface Profile {
  id: string
  email: string
  full_name: string
  phone?: string | null
  job_title?: string | null
  department_id?: string | null
  department?: Department | null
  system_role: SystemRole
  status: EmployeeStatus
  started_at?: string | null
  avatar_path?: string | null
  comment?: string | null
  created_at: string
  updated_at: string
}

export interface Compensation {
  profile_id: string
  salary: number
  currency: string
  updated_at: string
}

export interface Permission {
  id: string
  code: string
  label: string
  description?: string | null
}

export interface PackageItem { id: string; package_id: string; label: string; sort_order: number }
export interface PackageBonus { id: string; package_id: string; label: string; sort_order: number }
export interface ServicePackage {
  id: string
  name: string
  slug: string
  package_type: ProjectType
  price: number
  duration_days: number
  description?: string | null
  active: boolean
  archived_at?: string | null
  created_at: string
  package_items?: PackageItem[]
  package_bonuses?: PackageBonus[]
}

export interface ProjectItem { id: string; project_id: string; label: string; sort_order: number; done: boolean; done_at?: string | null }
export interface ProjectBonus { id: string; project_id: string; label: string; sort_order: number; done: boolean; done_at?: string | null }
export interface ProjectMember { id: string; project_id: string; profile_id: string; project_role?: string | null; profile?: Profile | null }
export interface Project {
  id: string
  name: string
  client_name?: string | null
  client_phone?: string | null
  instagram?: string | null
  comment?: string | null
  project_type: ProjectType
  package_id?: string | null
  package_name_snapshot?: string | null
  price?: number
  project_finance?: { contract_price: number } | null
  start_date?: string | null
  end_date?: string | null
  status: ProjectStatus
  created_by: string
  created_at: string
  updated_at: string
  archived_at?: string | null
  project_items?: ProjectItem[]
  project_bonuses?: ProjectBonus[]
  project_members?: ProjectMember[]
}

export interface Task {
  id: string
  title: string
  description?: string | null
  project_id?: string | null
  assignee_id: string
  department_id?: string | null
  created_by: string
  start_at?: string | null
  due_at?: string | null
  priority: TaskPriority
  status: TaskStatus
  review_comment?: string | null
  result_link?: string | null
  started_at?: string | null
  submitted_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
  project?: Pick<Project, 'id' | 'name'> | null
  assignee?: Pick<Profile, 'id' | 'full_name' | 'job_title'> | null
}

export interface CalendarEvent {
  id: string
  title: string
  description?: string | null
  event_type: EventType
  project_id?: string | null
  owner_id?: string | null
  created_by: string
  starts_at: string
  ends_at?: string | null
  all_day: boolean
  location?: string | null
  source_type?: string | null
  source_id?: string | null
}

export interface WorkLog {
  id: string
  profile_id: string
  project_id?: string | null
  work_date: string
  work_type: string
  description: string
  link?: string | null
  file_path?: string | null
  minutes_spent?: number | null
  created_at: string
  project?: Pick<Project, 'id' | 'name'> | null
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body?: string | null
  object_type?: string | null
  object_id?: string | null
  read_at?: string | null
  created_at: string
}

export interface Payment {
  id: string
  project_id: string
  amount: number
  paid_at: string
  payment_type: string
  comment?: string | null
  created_by: string
}

export interface Transaction {
  id: string
  type: 'income' | 'expense' | 'salary' | 'advance'
  amount: number
  transaction_date: string
  profile_id?: string | null
  project_id?: string | null
  category?: string | null
  comment?: string | null
  created_by: string
}
