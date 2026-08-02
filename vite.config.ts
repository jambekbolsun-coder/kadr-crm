import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const fileEnv = loadEnv(mode, process.cwd(), '')
    const url = (process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || '').trim()
    const key = (process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY || '').trim()
    const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)
    const keyOk = key.startsWith('sb_publishable_') || key.split('.').length === 3
    if (!urlOk || !keyOk) {
      throw new Error(
        'Supabase environment variables are missing or invalid. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables, then Redeploy.',
      )
    }
  }

  return {
    plugins: [react()],
    server: { port: 5173 },
    preview: { port: 4173 },
  }
})
