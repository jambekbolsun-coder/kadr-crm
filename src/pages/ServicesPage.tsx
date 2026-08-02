import { useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import { Badge, Button, Card, Empty, Field, Modal, PageHead } from '../components/ui'

export default function ServicesPage(){
  const {isAdmin,profile}=useAuth()
  const {toast}=useToast()
  const qc=useQueryClient()
  const [form,setForm]=useState<any|null>(null)
  const {data=[]}=useQuery({queryKey:['services'],queryFn:async()=>{
    const {data,error}=await supabase.from('services').select('*').order('active',{ascending:false}).order('sort_order')
    if(error)throw error
    return data||[]
  }})

  async function save(){
    if(!form?.name?.trim())return toast('Укажи название услуги','error')
    const payload={name:form.name.trim(),description:form.description?.trim()||null,active:!!form.active,sort_order:Number(form.sort_order||0),updated_by:profile!.id}
    const {error}=form.id
      ?await supabase.from('services').update(payload).eq('id',form.id)
      :await supabase.from('services').insert({...payload,created_by:profile!.id})
    if(error)return toast(error.message,'error')
    toast('Услуга сохранена','success')
    setForm(null)
    await qc.invalidateQueries({queryKey:['services']})
  }

  return <div className="page">
    <PageHead eyebrow="Направления SMM_KADR" title="Услуги" text="Каталог услуг компании: маркетинг, продакшн, реклама, разработка и автоматизация." actions={isAdmin?<Button onClick={()=>setForm({name:'',description:'',active:true,sort_order:data.length})}><Plus/> Добавить услугу</Button>:undefined}/>
    {data.length?<div className="grid grid-3">{data.map((s:any)=><Card key={s.id} className="card-hover" style={{opacity:s.active?1:.65} as any}>
      <div className="card-title-row"><div><Badge kind={s.active?'success':'warning'}>{s.active?'Активна':'Выключена'}</Badge><h3 style={{margin:'8px 0 6px'}}>{s.name}</h3><p className="muted" style={{fontSize:10,lineHeight:1.55}}>{s.description||'Без описания'}</p></div>{isAdmin&&<Button kind="ghost" small onClick={()=>setForm({...s})}><Pencil/></Button>}</div>
    </Card>)}</div>:<Empty title="Услуги не добавлены"/>}
    {form&&<Modal title={form.id?'Изменить услугу':'Новая услуга'} onClose={()=>setForm(null)} footer={<><Button kind="secondary" onClick={()=>setForm(null)}>Отмена</Button><Button onClick={()=>void save()}>Сохранить</Button></>}><div className="form-grid"><Field label="Название" full><input className="input" value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Описание" full><textarea className="textarea" value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></Field><Field label="Активна"><label className="check-row"><input type="checkbox" checked={!!form.active} onChange={e=>setForm({...form,active:e.target.checked})}/><span>Показывать в каталоге</span></label></Field></div></Modal>}
  </div>
}
