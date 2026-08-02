import { useState } from 'react'
import { Archive, Lightbulb, Pencil, Plus } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import { Badge, Button, Card, Empty, Field, Modal, PageHead } from '../components/ui'
import { dateRu } from '../lib/format'

const labels:Record<string,string>={new:'Новая',planned:'Запланирована',doing:'В работе',done:'Реализовано',archived:'Архив'}
const kinds:Record<string,'success'|'accent'|'warning'|'purple'|'danger'>={new:'accent',planned:'purple',doing:'warning',done:'success',archived:'danger'}

export default function IdeasPage(){
  const {profile}=useAuth()
  const {toast}=useToast()
  const qc=useQueryClient()
  const [form,setForm]=useState<any|null>(null)
  const {data=[]}=useQuery({queryKey:['ideas'],queryFn:async()=>{const {data,error}=await supabase.from('ideas').select('*,author:profiles(id,full_name)').order('created_at',{ascending:false});if(error)throw error;return data||[]}})

  async function save(){
    if(!form?.title?.trim())return toast('Укажи название идеи','error')
    const payload={title:form.title.trim(),description:form.description?.trim()||null,status:form.status||'new'}
    const result=form.id?await supabase.from('ideas').update(payload).eq('id',form.id):await supabase.from('ideas').insert({...payload,created_by:profile!.id})
    if(result.error)return toast(result.error.message,'error')
    setForm(null)
    toast(form.id?'Идея обновлена':'Идея добавлена','success')
    await qc.invalidateQueries({queryKey:['ideas']})
  }

  async function archiveIdea(x:any){
    if(!confirm(`Отправить идею «${x.title}» в архив?`))return
    const {error}=await supabase.from('ideas').update({status:'archived'}).eq('id',x.id)
    if(error)return toast(error.message,'error')
    toast('Идея отправлена в архив','success')
    await qc.invalidateQueries({queryKey:['ideas']})
  }

  return <div className="page">
    <PageHead eyebrow="Развитие компании" title="Новые идеи" text="Общий список гипотез, улучшений и направлений для SMM_KADR." actions={<Button onClick={()=>setForm({title:'',description:'',status:'new'})}><Plus/> Добавить идею</Button>}/>
    {data.length?<div className="grid grid-3">{data.map((x:any)=><Card key={x.id} style={{opacity:x.status==='archived' ? 0.62 : 1} as any}>
      <div className="card-title-row"><div className="stat-icon"><Lightbulb/></div><div className="row-actions"><Button kind="ghost" small onClick={()=>setForm({...x})}><Pencil/> Изменить</Button>{x.status!=='archived'&&<Button kind="ghost" small onClick={()=>void archiveIdea(x)}><Archive/> Архив</Button>}</div></div>
      <h3>{x.title}</h3><p className="muted" style={{fontSize:10,lineHeight:1.55}}>{x.description||'Без описания'}</p><div className="card-footer"><Badge kind={kinds[x.status]||'accent'}>{labels[x.status]||x.status}</Badge><span className="tiny muted">{x.author?.full_name} · {dateRu(x.created_at)}</span></div>
    </Card>)}</div>:<Empty title="Идей пока нет"/>}
    {form&&<Modal title={form.id?'Редактировать идею':'Новая идея'} onClose={()=>setForm(null)} footer={<><Button kind="secondary" onClick={()=>setForm(null)}>Отмена</Button><Button onClick={()=>void save()}>{form.id?'Сохранить':'Добавить'}</Button></>}><div className="form-grid">
      <Field label="Название" full><input className="input" value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
      <Field label="Статус"><select className="select" value={form.status||'new'} onChange={e=>setForm({...form,status:e.target.value})}>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Описание" full><textarea className="textarea" value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
    </div></Modal>}
  </div>
}
