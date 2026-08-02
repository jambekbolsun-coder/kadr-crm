import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { Button, Field } from '../components/ui'

function readableAuthError(message: string) {
  const value = decodeURIComponent(message.replace(/\+/g, ' '))
  if (/expired|invalid|one-time token|otp/i.test(value)) {
    return 'Ссылка приглашения или восстановления недействительна, истекла или уже была использована.'
  }
  return value
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionReady, setSessionReady] = useState<boolean | null>(null)
  const [linkError, setLinkError] = useState('')
  const { toast } = useToast()
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    const description = hash.get('error_description') || query.get('error_description')

    if (description) {
      setLinkError(readableAuthError(description))
      setSessionReady(false)
      return () => { mounted.current = false }
    }

    let resolved = false
    let timeoutId: number | undefined

    const markReady = () => {
      if (!mounted.current) return
      resolved = true
      setLinkError('')
      setSessionReady(true)
    }

    const markInvalid = (message?: string) => {
      if (!mounted.current || resolved) return
      setLinkError(message ? readableAuthError(message) : 'Ссылка приглашения или восстановления недействительна, истекла или уже была использована.')
      setSessionReady(false)
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        ['INITIAL_SESSION', 'SIGNED_IN', 'PASSWORD_RECOVERY', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)
      ) {
        markReady()
      }
    })

    async function prepareSession() {
      try {
        // 1. If the callback URL contains a fresh invite/recovery session, it must
        // win over any older session that may already exist in this browser.
        const accessToken = hash.get('access_token')
        const refreshToken = hash.get('refresh_token')
        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (error) throw error
          if (data.session) {
            window.history.replaceState({}, document.title, window.location.pathname)
            markReady()
            return
          }
        }

        // 2. Support PKCE callback links too, so a future auth-flow change does not break invites.
        const code = query.get('code')
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          if (data.session) {
            window.history.replaceState({}, document.title, window.location.pathname)
            markReady()
            return
          }
        }

        // 3. Supabase JS may already have processed and removed the callback URL.
        const { data: current, error: currentError } = await supabase.auth.getSession()
        if (currentError) throw currentError
        if (current.session) {
          markReady()
          return
        }

        // Give detectSessionInUrl/onAuthStateChange a short window to finish.
        timeoutId = window.setTimeout(async () => {
          try {
            const { data } = await supabase.auth.getSession()
            if (data.session) markReady()
            else markInvalid()
          } catch {
            markInvalid()
          }
        }, 1800)
      } catch (error: any) {
        markInvalid(error?.message)
      }
    }

    void prepareSession()

    return () => {
      mounted.current = false
      if (timeoutId) window.clearTimeout(timeoutId)
      authListener.subscription.unsubscribe()
    }
  }, [])

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    if (sessionReady !== true) {
      toast('Ссылка ещё не подтверждена. Откройте приглашение из письма заново.', 'error')
      return
    }
    if (password.length < 8) {
      toast('Пароль должен содержать минимум 8 символов.', 'error')
      return
    }
    if (password !== confirmPassword) {
      toast('Пароли не совпадают.', 'error')
      return
    }

    setBusy(true)
    try {
      // Re-check the session immediately before changing the password.
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!sessionData.session) {
        throw new Error('Сессия приглашения истекла. Откройте новую ссылку из письма.')
      }

      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      // Ensure the newly updated session is persisted before opening protected routes.
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) console.warn('Session refresh after password update failed:', refreshError.message)

      window.history.replaceState({}, document.title, '/reset-password')
      toast('Пароль сохранён. Открываем рабочий кабинет…', 'success')

      // A full navigation avoids a race between USER_UPDATED and AuthProvider profile loading.
      window.setTimeout(() => window.location.replace('/dashboard'), 250)
    } catch (error: any) {
      const message = readableAuthError(error?.message || 'Не удалось сохранить пароль.')
      setLinkError(message)
      if (/session|expired|invalid|token/i.test(error?.message || '')) setSessionReady(false)
      toast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page" style={{ gridTemplateColumns: '1fr' }}>
      <section className="auth-panel">
        <form className="auth-card" onSubmit={savePassword}>
          <h2>Новый пароль</h2>

          {sessionReady === false ? (
            <>
              <p>{linkError || 'Ссылка приглашения или восстановления недействительна, истекла или уже была использована.'}</p>
              <div className="notice-box">
                Если это первое приглашение сотрудника — попросите администратора отправить новое приглашение. Если пароль восстанавливается — запросите новую ссылку на странице входа.
              </div>
              <Button type="button" onClick={() => window.location.replace('/login')}>
                Вернуться ко входу
              </Button>
            </>
          ) : (
            <>
              <p>
                {sessionReady === null
                  ? 'Проверяем безопасную ссылку…'
                  : 'Придумайте пароль для рабочего аккаунта. После сохранения вы автоматически попадёте в CRM.'}
              </p>

              <div className="auth-form">
                <Field label="Новый пароль">
                  <input
                    className="input"
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={sessionReady !== true || busy}
                    placeholder="Минимум 8 символов"
                  />
                </Field>

                <Field label="Повторите пароль">
                  <input
                    className="input"
                    type="password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={sessionReady !== true || busy}
                    placeholder="Повторите пароль"
                  />
                </Field>

                <Button type="submit" disabled={busy || sessionReady !== true}>
                  {sessionReady === null ? 'Проверяем ссылку…' : busy ? 'Сохраняем…' : 'Сохранить пароль и войти'}
                </Button>
              </div>
            </>
          )}
        </form>
      </section>
    </div>
  )
}
