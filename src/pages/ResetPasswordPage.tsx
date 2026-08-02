import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { Button, Field } from '../components/ui'

export default function ResetPasswordPage(){
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [sessionReady,setSessionReady]=useState<boolean|null>(null)
  const [linkError,setLinkError]=useState('')
  const {toast}=useToast()
  const nav=useNavigate()

  useEffect(()=>{
    const hash=new URLSearchParams(window.location.hash.replace(/^#/,''))
    const query=new URLSearchParams(window.location.search)
    const description=hash.get('error_description')||query.get('error_description')
    if(description){setLinkError(decodeURIComponent(description.replace(/\+/g,' ')));setSessionReady(false);return}
    supabase.auth.getSession().then(({data})=>setSessionReady(!!data.session)).catch(()=>setSessionReady(false))
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(session)setSessionReady(true)})
    return ()=>data.subscription.unsubscribe()
  },[])

  return <div className="auth-page" style={{gridTemplateColumns:'1fr'}}><section className="auth-panel"><form className="auth-card" onSubmit={async e=>{e.preventDefault();if(!sessionReady)return toast('Ссылка недействительна или уже использована. Запросите новую ссылку.','error');setBusy(true);try{const {error}=await supabase.auth.updateUser({password});if(error)throw error;toast('Пароль обновлён','success');nav('/dashboard')}catch(err:any){toast(err.message,'error')}finally{setBusy(false)}}}>
    <h2>Новый пароль</h2>
    {sessionReady===false?<><p>{linkError||'Ссылка приглашения или восстановления недействительна, истекла или уже была использована.'}</p><div className="notice-box">Вернитесь на страницу входа и запросите новую ссылку через «Восстановить пароль».</div><Button type="button" onClick={()=>nav('/login')}>Вернуться ко входу</Button></>:<><p>Придумай новый безопасный пароль для рабочего аккаунта.</p><div className="auth-form"><Field label="Новый пароль"><input className="input" type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required disabled={sessionReady===null}/></Field><Button disabled={busy||sessionReady!==true}>{sessionReady===null?'Проверяем ссылку…':'Сохранить пароль'}</Button></div></>}
  </form></section></div>
}
