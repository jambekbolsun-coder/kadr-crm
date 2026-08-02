import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'

export const money = (value?: number | null, currency = 'сом') =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value || 0))} ${currency}`

export const dateRu = (value?: string | null, withTime = false) => {
  if (!value) return '—'
  try { return format(parseISO(value), withTime ? 'dd.MM.yyyy HH:mm' : 'dd.MM.yyyy', { locale: ru }) } catch { return value }
}

export const relativeRu = (value?: string | null) => {
  if (!value) return '—'
  try { return formatDistanceToNowStrict(parseISO(value), { locale: ru, addSuffix: true }) } catch { return value }
}

export const initials = (name?: string | null) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase()
