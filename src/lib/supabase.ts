import { createClient } from '@supabase/supabase-js'

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

function validSupabaseUrl(value?: string) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')
  } catch {
    return false
  }
}

function validPublishableKey(value?: string) {
  return Boolean(value && (value.startsWith('sb_publishable_') || value.split('.').length === 3))
}

export const supabaseConfigError = !validSupabaseUrl(rawUrl)
  ? 'VITE_SUPABASE_URL отсутствует или имеет неверный формат.'
  : !validPublishableKey(rawKey)
    ? 'VITE_SUPABASE_ANON_KEY отсутствует или имеет неверный формат.'
    : null

export const isSupabaseConfigured = supabaseConfigError === null

if (supabaseConfigError) console.warn(`[SMM_KADR] ${supabaseConfigError}`)

export const supabase = createClient(
  isSupabaseConfigured ? rawUrl! : 'https://invalid.supabase.co',
  isSupabaseConfigured ? rawKey! : 'sb_publishable_invalid',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  },
)
