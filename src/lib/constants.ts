import type { EventType, ProjectStatus, TaskPriority, TaskStatus } from '../types/domain'

export const COMPANY_NAME = 'SMM_KADR'
export const COMPANY_SUBTITLE = 'MEDIA HOLDING · BISHKEK'

export const PERMISSIONS = {
  MANAGE_EMPLOYEES: 'manage_employees',
  MANAGE_PROJECTS: 'manage_projects',
  MANAGE_TASKS: 'manage_tasks',
  MANAGE_PACKAGES: 'manage_packages',
  VIEW_SALARIES: 'view_salaries',
  MANAGE_FINANCE: 'manage_finance',
  VIEW_REPORTS: 'view_reports',
  MANAGE_SETTINGS: 'manage_settings',
  VIEW_ACTIVITY_LOG: 'view_activity_log',
} as const

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  completed: 'Выполнена',
  cancelled: 'Отменена',
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  urgent: 'Срочный',
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Черновик',
  active: 'В работе',
  paused: 'На паузе',
  completed: 'Завершён',
  archived: 'Архив',
}

export const EVENT_LABELS: Record<EventType, string> = {
  task: 'Задача',
  deadline: 'Дедлайн',
  project: 'Проект',
  shoot: 'Съёмка',
  meeting: 'Встреча',
  publication: 'Публикация',
  ads: 'Рекламный запуск',
  plan: 'План',
  other: 'Событие',
}

export const EVENT_COLORS: Record<EventType, string> = {
  task: '#2563eb',
  deadline: '#dc2626',
  project: '#16a34a',
  shoot: '#7c3aed',
  meeting: '#ea580c',
  publication: '#0891b2',
  ads: '#ca8a04',
  plan: '#475569',
  other: '#64748b',
}

export const WORK_TYPES = [
  'Съёмка видео', 'Монтаж видео', 'Графический дизайн', 'Пост / карусель', 'Stories',
  'Настройка таргета', 'Оптимизация рекламы', 'Продажа / переговоры', 'SMM-ведение',
  'Сценарий / маркетинг', 'Разработка сайта', 'CRM / автоматизация', 'Другое',
]
