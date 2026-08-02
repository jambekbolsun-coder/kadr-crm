import { useMemo, useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { getDepartments, getProfiles } from '../services/api'
import { supabase } from '../lib/supabase'
import { PERMISSIONS } from '../lib/constants'
import { Button, Field, Modal } from './ui'
import type { Project } from '../types/domain'

type Row={id?:string;label:string;done?:boolean;sort_order?:number}

export function EditProjectModal({project,onClose,onSaved}:{project:Project;onClose:()=>void;onSaved:()=>Promise<void>|void}){
  const auth=useAuth();const {toast}=useToast();const qc=useQueryClient();const canFinance=auth.can(PERMISSIONS.MANAGE_FINANCE)
  const {data:employees=[]}=useQuery({queryKey:['profiles','project-edit'],queryFn:()=>getProfiles(false)})
  const {data:departments=[]}=useQuery({queryKey:['departments'],queryFn:getDepartments})
  const [saving,setSaving]=useState(false)
  const [form,setForm]=useState({name:project.name,client_name:project.client_name||'',client_phone:project.client_phone||'',instagram:project.instagram||'',comment:project.comment||'',start_date:project.start_date||'',end_date:project.end_date||'',status:project.status,price:(project.project_finance as any)?.contract_price||0,items:(project.project_items||[]).map(x=>({id:x.id,label:x.label,done:x.done,sort_order:x.sort_order})),bonuses:(project.project_bonuses||[]).map(x=>({id:x.id,label:x.label,done:x.done,sort_order:x.sort_order})),members:(project.project_members||[]).map(x=>x.profile_id)})
  const memberSet=useMemo(()=>new Set(form.members),[form.members])
  const addDepartment=(departmentId:string)=>setForm(f=>({...f,members:Array.from(new Set([...f.members,...employees.filter(e=>e.department_id===departmentId).map(e=>e.id)]))}))
  const updateRow=(kind:'items'|'bonuses',i:number,label:string)=>setForm(f=>({...f,[kind]:(f[kind] as Row[]).map((x,j)=>j===i?{...x,label}:x)}))
  const removeRow=(kind:'items'|'bonuses',i:number)=>setForm(f=>({...f,[kind]:(f[kind] as Row[]).filter((_,j)=>j!==i)}))
  const addRow=(kind:'items'|'bonuses')=>setForm(f=>({...f,[kind]:[...(f[kind] as Row[]),{label:''}]}))
  async function save(){if(!form.name.trim())return toast('Название проекта обязательно','error');if(form.start_date&&form.end_date&&form.end_date<form.start_date)return toast('Дата окончания не может быть раньше даты начала','error');setSaving(true);try{
    const {error}=await supabase.rpc('update_project_full',{p_project_id:project.id,p_name:form.name.trim(),p_client_name:form.client_name||'',p_client_phone:form.client_phone||'',p_instagram:form.instagram||'',p_comment:form.comment||'',p_start_date:form.start_date||null,p_end_date:form.end_date||null,p_status:form.status,p_contract_price:canFinance?Number(form.price||0):0,p_items:form.items,p_bonuses:form.bonuses,p_member_ids:form.members});if(error)throw error
    toast('Проект обновлён','success');await qc.invalidateQueries({queryKey:['project',project.id]});await qc.invalidateQueries({queryKey:['projects']});await onSaved();onClose()
  }catch(e:any){toast(e.message||'Не удалось сохранить проект','error')}finally{setSaving(false)}}
  return <Modal title={`Редактировать · ${project.name}`} large onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Отмена</Button><Button disabled={saving} onClick={()=>void save()}>{saving?'Сохранение…':'Сохранить изменения'}</Button></>}><div className="form-grid">
    <Field label="Название"><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Статус"><select className="select" value={form.status} onChange={e=>setForm({...form,status:e.target.value as any})}><option value="draft">Черновик</option><option value="active">В работе</option><option value="paused">На паузе</option><option value="completed">Завершён</option></select></Field>
    <Field label="Клиент"><input className="input" value={form.client_name} onChange={e=>setForm({...form,client_name:e.target.value})}/></Field><Field label="Телефон"><input className="input" value={form.client_phone} onChange={e=>setForm({...form,client_phone:e.target.value})}/></Field><Field label="Instagram"><input className="input" value={form.instagram} onChange={e=>setForm({...form,instagram:e.target.value})}/></Field>{canFinance&&<Field label="Стоимость"><input className="input" type="number" min="0" value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)})}/></Field>}
    <Field label="Дата начала"><input className="input" type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></Field><Field label="Дата окончания"><input className="input" type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/></Field><Field label="Комментарий" full><textarea className="textarea" value={form.comment} onChange={e=>setForm({...form,comment:e.target.value})}/></Field>
    <Field label="Что входит" full><RowEditor rows={form.items} setLabel={(i,v)=>updateRow('items',i,v)} remove={i=>removeRow('items',i)} add={()=>addRow('items')}/></Field>
    <Field label="Бонусы" full><RowEditor rows={form.bonuses} setLabel={(i,v)=>updateRow('bonuses',i,v)} remove={i=>removeRow('bonuses',i)} add={()=>addRow('bonuses')}/></Field>
    <Field label="Команда проекта" full><div className="filters">{departments.map(d=><Button kind="secondary" small key={d.id} onClick={()=>addDepartment(d.id)}><Users/> + {d.name}</Button>)}</div><div className="grid grid-3">{employees.map(e=><label className="check-row card" style={{padding:10}} key={e.id}><input type="checkbox" checked={memberSet.has(e.id)} onChange={ev=>setForm(f=>({...f,members:ev.target.checked?[...f.members,e.id]:f.members.filter(x=>x!==e.id)}))}/><span className="tiny"><b>{e.full_name}</b><br/><span className="muted">{e.job_title}</span></span></label>)}</div></Field>
  </div></Modal>
}

function RowEditor({rows,setLabel,remove,add}:{rows:Row[];setLabel:(i:number,v:string)=>void;remove:(i:number)=>void;add:()=>void}){return <div className="repeat-list">{rows.map((r,i)=><div className="repeat-row" key={r.id||`new-${i}`}><input className="input" value={r.label} onChange={e=>setLabel(i,e.target.value)}/><Button type="button" kind="ghost" onClick={()=>remove(i)}><Trash2/></Button></div>)}<Button type="button" kind="secondary" small onClick={add}><Plus/> Добавить строку</Button></div>}
