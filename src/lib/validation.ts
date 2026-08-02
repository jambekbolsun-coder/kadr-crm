export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export function normalizeHttpUrl(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return null
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
}

export function isChronological(start?: string | null, end?: string | null) {
  if (!start || !end) return true
  const a = new Date(start).getTime()
  const b = new Date(end).getTime()
  return Number.isFinite(a) && Number.isFinite(b) && b >= a
}

export function uploadError(file?: File | null) {
  if (!file) return null
  if (file.size <= 0) return 'Файл пустой.'
  if (file.size > MAX_UPLOAD_BYTES) return 'Размер файла не должен превышать 25 МБ.'
  return null
}
