import { useState } from 'react'
import { ArchiveRestore, Pencil, Plus, Save } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { getDepartments } from '../services/api'
import { supabase } from '../lib/supabase'
import { Badge, Button, Card, Field, Modal, PageHead, SectionTitle } from '../components/ui'
import type { Department } from '../types/domain'

export default function SettingsPage(){
  const {profile}=useAuth()
  const {toast}=useToast()
  const qc=useQueryClient()
  const [newDep,setNewDep]=useState('')
  const [depEdit,setDepEdit]=useState<Department|null>(null)
  const [depForm,setDepForm]=useState<any>({})
  const {data:deps=[]}=useQuery({queryKey:['departments','settings'],queryFn:()=>getDepartments(true)})
  const {data:rows=[]}=useQuery({queryKey:['company-settings'],queryFn:async()=>{const {data,error}=await supabase.from('company_settings').select('*');if(error)throw error;return data||[]}})
  const current:any=rows.find((x:any)=>x.key==='company')?.value||{}
  const [company,setCompany]=useState<any|null>(null)
  const model=company||current

  async function addDep(){
    if(!newDep.trim())return
    const {error}=await supabase.from('departments').insert({name:newDep.trim(),active:true,created_by:profile!.id})
    if(error)return toast(error.message,'error')
    setNewDep('')
    toast('Отдел добавлен','success')
    await qc.invalidateQueries({queryKey:['departments']})
  }
  function openDep(d:Department){setDepEdit(d);setDepForm({...d})}
  async function saveDep(){
    if(!depEdit||!depForm.name?.trim())return toast('Укажи название отдела','error')
    const {error}=await supabase.from('departments').update({name:depForm.name.trim(),description:depForm.description?.trim()||null,active:!!depForm.active}).eq('id',depEdit.id)
    if(error)return toast(error.message,'error')
    setDepEdit(null)
    toast('Отдел обновлён','success')
    await qc.invalidateQueries({queryKey:['departments']})
  }
  async function toggleDepartment(d:Department){
    const {error}=await supabase.from('departments').update({active:!d.active}).eq('id',d.id)
    if(error)return toast(error.message,'error')
    toast(d.active?'Отдел архивирован':'Отдел восстановлен','success')
    await qc.invalidateQueries({queryKey:['departments']})
  }
  async function saveCompany(){
    const {error}=await supabase.from('company_settings').upsert({key:'company',value:model,updated_by:profile!.id})
    if(error)return toast(error.message,'error')
    toast('Настройки сохранены','success')
    setCompany({...model})
    await qc.invalidateQueries({queryKey:['company-settings']})
  }

  return <div className="page">
    <PageHead eyebrow="Конфигурация" title="Настройки" text="Компания, отделы и системные параметры. Права на этот раздел выдаются отдельно."/>
    <div className="grid grid-2">
      <Card><SectionTitle title="Компания"/><div className="form-grid">
        <Field label="Название"><input className="input" value={model.name||''} onChange={e=>setCompany({...model,name:e.target.value})}/></Field>
        <Field label="Подзаголовок"><input className="input" value={model.subtitle||''} onChange={e=>setCompany({...model,subtitle:e.target.value})}/></Field>
        <Field label="Телефон"><input className="input" value={model.phone||''} onChange={e=>setCompany({...model,phone:e.target.value})}/></Field>
        <Field label="Instagram"><input className="input" value={model.instagram||''} onChange={e=>setCompany({...model,instagram:e.target.value})}/></Field>
        <Field label="Описание" full><textarea className="textarea" value={model.description||''} onChange={e=>setCompany({...model,description:e.target.value})}/></Field>
        <Field label="Цель" full><textarea className="textarea" value={model.goal||''} onChange={e=>setCompany({...model,goal:e.target.value})}/></Field>
        <Field label="Примечание" full><textarea className="textarea" value={model.notes||''} onChange={e=>setCompany({...model,notes:e.target.value})}/></Field>
      </div><Button onClick={()=>void saveCompany()}><Save/> Сохранить</Button></Card>

      <Card><SectionTitle title="Отделы" text="Можно переименовывать, архивировать и восстанавливать отделы без изменения кода."/>
        <div className="repeat-row"><input className="input" value={newDep} onChange={e=>setNewDep(e.target.value)} placeholder="Новый отдел"/><Button onClick={()=>void addDep()}><Plus/> Добавить</Button></div>
        <div style={{marginTop:12}}>{deps.map(d=><div className="list-item" key={d.id}><div><strong>{d.name}</strong>{d.description&&<small>{d.description}</small>}</div><div className="row-actions"><Badge kind={d.active?'success':'danger'}>{d.active?'Активен':'Архив'}</Badge><Button kind="ghost" small onClick={()=>openDep(d)}><Pencil/> Изменить</Button><Button kind="ghost" small onClick={()=>void toggleDepartment(d)}><ArchiveRestore/> {d.active?'Архив':'Вернуть'}</Button></div></div>)}</div>
      </Card>
    </div>
    {depEdit&&<Modal title="Редактировать отдел" onClose={()=>setDepEdit(null)} footer={<><Button kind="secondary" onClick={()=>setDepEdit(null)}>Отмена</Button><Button onClick={()=>void saveDep()}>Сохранить</Button></>}><div className="form-grid"><Field label="Название" full><input className="input" value={depForm.name||''} onChange={e=>setDepForm({...depForm,name:e.target.value})}/></Field><Field label="Описание" full><textarea className="textarea" value={depForm.description||''} onChange={e=>setDepForm({...depForm,description:e.target.value})}/></Field><Field label="Статус"><select className="select" value={depForm.active?'active':'archived'} onChange={e=>setDepForm({...depForm,active:e.target.value==='active'})}><option value="active">Активен</option><option value="archived">Архив</option></select></Field></div></Modal>}
  </div>
}
