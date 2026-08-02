import { useEffect, useMemo, useState } from 'react'
import { Plus, ShieldCheck, Ban, UserCog, Upload } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { getDepartments, getProfiles, getProjects, getTasks } from '../services/api'
import { supabase } from '../lib/supabase'
import { PERMISSIONS } from '../lib/constants'
import { Avatar, Badge, Button, Empty, Field, Modal, PageHead, Progress } from '../components/ui'
import { dateRu, money } from '../lib/format'
import type { Profile, SystemRole } from '../types/domain'

const permissionList=[
  [PERMISSIONS.MANAGE_EMPLOYEES,'Manage Employees'],[PERMISSIONS.MANAGE_PROJECTS,'Manage Projects'],[PERMISSIONS.MANAGE_TASKS,'Manage Tasks'],[PERMISSIONS.MANAGE_PACKAGES,'Manage Packages'],[PERMISSIONS.VIEW_SALARIES,'View Salaries'],[PERMISSIONS.MANAGE_FINANCE,'Manage Finance'],[PERMISSIONS.VIEW_REPORTS,'View Reports'],[PERMISSIONS.MANAGE_SETTINGS,'Manage Settings'],[PERMISSIONS.VIEW_ACTIVITY_LOG,'View Activity Log'],
]

export default function EmployeesPage(){const auth=useAuth();const {toast}=useToast();const qc=useQueryClient();const [params,setParams]=useSearchParams();const focus=params.get('focus');const {data:employees=[]}=useQuery({queryKey:['profiles','all'],queryFn:()=>getProfiles(true)});const {data:deps=[]}=useQuery({queryKey:['departments'],queryFn:getDepartments});const {data:tasks=[]}=useQuery({queryKey:['tasks','employee-stats'],queryFn:()=>getTasks()});const {data:projects=[]}=useQuery({queryKey:['projects','employee-stats'],queryFn:()=>getProjects()});const [invite,setInvite]=useState<any|null>(null);const [edit,setEdit]=useState<Profile|null>(null);const [editData,setEditData]=useState<any>({});const [salary,setSalary]=useState<number>(0);const [perms,setPerms]=useState<string[]>([]);const [avatar,setAvatar]=useState<File|null>(null);const stats=useMemo(()=>employees.map(e=>{const own=tasks.filter(t=>t.assignee_id===e.id),activeProjects=projects.filter(p=>p.status==='active'&&(p.project_members||[]).some(m=>m.profile_id===e.id));const active=own.filter(t=>!['completed','cancelled'].includes(t.status)).length,done=own.filter(t=>t.status==='completed').length,late=own.filter(t=>t.due_at&&new Date(t.due_at)<new Date()&&!['completed','cancelled'].includes(t.status)).length;return {e,activeProjects:activeProjects.length,active,done,late,rate:own.length?done/own.length*100:0}}),[employees,tasks,projects])
 async function openEdit(e:Profile){setEdit(e);setEditData({...e});setAvatar(null);if(auth.can(PERMISSIONS.VIEW_SALARIES)){const {data}=await supabase.from('employee_compensation').select('salary').eq('profile_id',e.id).maybeSingle();setSalary(Number(data?.salary||0))}if(auth.isSuperAdmin&&e.system_role==='admin'){const {data}=await supabase.from('user_permissions').select('allowed,permission:permissions(code)').eq('profile_id',e.id);setPerms((data||[]).filter((x:any)=>x.allowed).map((x:any)=>x.permission?.code).filter(Boolean))}else setPerms([])}
 useEffect(()=>{if(focus&&employees.length){const target=employees.find(e=>e.id===focus);if(target){void openEdit(target);const next=new URLSearchParams(params);next.delete('focus');setParams(next,{replace:true})}}},[focus,employees])
 async function saveEdit(){
  if(!edit)return
  if(!String(editData.full_name||'').trim())return toast('Укажи ФИО сотрудника','error')
  if(edit.id===auth.profile?.id&&['blocked','fired'].includes(editData.status))return toast('Нельзя заблокировать или уволить собственный аккаунт','error')
  if(Number(salary)<0)return toast('Оклад не может быть отрицательным','error')
  let uploadedPath:string|null=null
  try{
    let avatarPath=editData.avatar_path||null
    if(avatar){
      if(avatar.size<=0)throw new Error('Файл аватара пустой')
      if(avatar.size>5*1024*1024)throw new Error('Аватар не должен превышать 5 МБ')
      if(!avatar.type.startsWith('image/'))throw new Error('Для аватара выбери изображение')
      const path=`${edit.id}/${Date.now()}-${avatar.name.replace(/[^\w.-]/g,'_')}`
      const {error:u}=await supabase.storage.from('avatars').upload(path,avatar,{upsert:false})
      if(u)throw u
      avatarPath=path
      uploadedPath=path
    }
    const {data,error}=await supabase.functions.invoke('set-user-status',{body:{
      userId:edit.id,
      status:editData.status,
      profile:{full_name:String(editData.full_name||'').trim(),phone:editData.phone||'',job_title:editData.job_title||'',department_id:editData.department_id||null,started_at:editData.started_at||null,comment:editData.comment||'',avatar_path:avatarPath,system_role:auth.isSuperAdmin?editData.system_role:edit.system_role},
      ...(auth.can(PERMISSIONS.VIEW_SALARIES)?{salary:Number(salary||0)}:{}),
      ...(auth.isSuperAdmin?{permissions:editData.system_role==='admin'?perms:[]}:{}),
    }})
    if(error)throw error
    if(data?.error)throw new Error(data.error)
    if(uploadedPath&&edit.avatar_path&&edit.avatar_path!==uploadedPath){
      await supabase.storage.from('avatars').remove([edit.avatar_path])
    }
    toast('Сотрудник обновлён','success')
    setEdit(null)
    setAvatar(null)
    await auth.refreshProfile()
    await qc.invalidateQueries({queryKey:['profiles']})
    await qc.invalidateQueries({queryKey:['dashboard']})
  }catch(e:any){
    if(uploadedPath)await supabase.storage.from('avatars').remove([uploadedPath])
    toast(e.message||'Не удалось обновить сотрудника','error')
  }
 }
 async function sendInvite(){
  if(!invite.email||!invite.full_name)return toast('Укажи ФИО и email','error')
  if(Number(invite.salary||0)<0)return toast('Оклад не может быть отрицательным','error')
  const normalizedEmail=String(invite.email).trim().toLowerCase()
  const existing=employees.find(e=>e.email?.toLowerCase()===normalizedEmail)
  if(existing)return toast(`Сотрудник с email ${normalizedEmail} уже существует. Если он не может войти — используйте «Забыли пароль».`,'error')
  try{
    const {data,error}=await supabase.functions.invoke('invite-employee',{body:{...invite,email:normalizedEmail,salary:Number(invite.salary||0),permissions:invite.permissions||[],site_url:window.location.origin}})
    if(error)throw error
    if(data?.code==='email_exists')throw new Error(data.error||'Этот email уже зарегистрирован')
    if(data?.error)throw new Error(data.error)
    toast('Приглашение отправлено на email','success')
    setInvite(null)
    await qc.invalidateQueries({queryKey:['profiles']})
  }catch(e:any){toast(e.message||'Ошибка приглашения','error')}
 }
 return <div className="page"><PageHead eyebrow="Команда компании" title="Сотрудники" text="Администратор видит команду и нагрузку. Зарплаты загружаются отдельным защищённым запросом и доступны только при наличии права." actions={<Button onClick={()=>setInvite({full_name:'',email:'',phone:'',job_title:'',department_id:'',salary:0,started_at:new Date().toISOString().slice(0,10),comment:'',permissions:[]})}><Plus/> Добавить сотрудника</Button>}/>{stats.length?<div className="employee-grid">{stats.map(({e,activeProjects,active,done,late,rate})=><div className="card employee-card" key={e.id}><div className="card-title-row"><div style={{display:'flex',gap:10}}><Avatar profile={e} size={46}/><div><Badge kind={statusKind(e.status)}>{statusLabel(e.status)}</Badge><h3>{e.full_name}</h3><p>{e.job_title||'Без должности'} · {e.department?.name||'Без отдела'}</p></div></div>{e.system_role!=='employee'&&<ShieldCheck size={18}/>}</div><div className="card-metrics"><div className="mini-metric"><span>Активные проекты</span><strong>{activeProjects}</strong></div><div className="mini-metric"><span>Активные задачи</span><strong className={active>=7?'load-high':active>=4?'load-medium':'load-normal'}>{active}</strong></div><div className="mini-metric"><span>Выполнено</span><strong>{done}</strong></div><div className="mini-metric"><span>Просрочено</span><strong className={late?'load-high':''}>{late}</strong></div></div><Progress value={rate}/><div className="card-footer"><span className="tiny muted">С {dateRu(e.started_at)}</span><Button kind="secondary" small onClick={()=>void openEdit(e)}><UserCog/> Открыть</Button></div></div>)}</div>:<Empty title="Сотрудников пока нет"/>} {invite&&<Modal title="Добавить сотрудника" large onClose={()=>setInvite(null)} footer={<><Button kind="secondary" onClick={()=>setInvite(null)}>Отмена</Button><Button onClick={()=>void sendInvite()}>Отправить приглашение</Button></>}><div className="form-grid"><Field label="ФИО"><input className="input" value={invite.full_name} onChange={e=>setInvite({...invite,full_name:e.target.value})}/></Field><Field label="Email"><input className="input" type="email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/></Field><Field label="Телефон"><input className="input" value={invite.phone} onChange={e=>setInvite({...invite,phone:e.target.value})}/></Field><Field label="Должность"><input className="input" value={invite.job_title} onChange={e=>setInvite({...invite,job_title:e.target.value})} placeholder="Мобилограф"/></Field><Field label="Отдел"><select className="select" value={invite.department_id} onChange={e=>setInvite({...invite,department_id:e.target.value})}><option value="">Выбрать</option>{deps.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>{auth.can(PERMISSIONS.VIEW_SALARIES)&&<Field label="Оклад"><input className="input" type="number" min="0" value={invite.salary} onChange={e=>setInvite({...invite,salary:e.target.value})}/></Field>}<Field label="Дата начала"><input className="input" type="date" value={invite.started_at} onChange={e=>setInvite({...invite,started_at:e.target.value})}/></Field><Field label="Комментарий" full><textarea className="textarea" value={invite.comment} onChange={e=>setInvite({...invite,comment:e.target.value})}/></Field>{auth.isSuperAdmin&&<Field label="Будущие права администратора" full hint="Аккаунт всё равно создаётся как Employee. Права начнут действовать только после повышения до Admin."><div className="grid grid-3">{permissionList.map(([code,label])=><label className="check-row" key={code}><input type="checkbox" checked={invite.permissions.includes(code)} onChange={e=>setInvite({...invite,permissions:e.target.checked?[...invite.permissions,code]:invite.permissions.filter((x:string)=>x!==code)})}/><span className="tiny">{label}</span></label>)}</div></Field>}</div></Modal>} {edit&&<Modal title={edit.full_name} large onClose={()=>setEdit(null)} footer={<><Button kind="secondary" onClick={()=>setEdit(null)}>Отмена</Button><Button onClick={()=>void saveEdit()}>Сохранить</Button></>}><div className="form-grid"><Field label="ФИО"><input className="input" value={editData.full_name||''} onChange={e=>setEditData({...editData,full_name:e.target.value})}/></Field><Field label="Email"><input className="input" value={edit.email} disabled/></Field><Field label="Телефон"><input className="input" value={editData.phone||''} onChange={e=>setEditData({...editData,phone:e.target.value})}/></Field><Field label="Должность"><input className="input" value={editData.job_title||''} onChange={e=>setEditData({...editData,job_title:e.target.value})}/></Field><Field label="Отдел"><select className="select" value={editData.department_id||''} onChange={e=>setEditData({...editData,department_id:e.target.value})}><option value="">Без отдела</option>{deps.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></Field><Field label="Статус" hint={edit.id===auth.profile?.id?"Собственный аккаунт нельзя заблокировать или уволить.":undefined}><select className="select" value={editData.status} onChange={e=>setEditData({...editData,status:e.target.value})}><option value="active">Активен</option><option value="vacation">Отпуск</option><option value="inactive">Временно не работает</option><option value="fired" disabled={edit.id===auth.profile?.id}>Уволен</option><option value="blocked" disabled={edit.id===auth.profile?.id}>Заблокирован</option></select></Field>{auth.isSuperAdmin&&<Field label="Роль в системе" hint={edit.id===auth.profile?.id?'Собственную роль меняет только другой SUPER ADMIN.':undefined}><select className="select" value={editData.system_role} disabled={edit.id===auth.profile?.id} onChange={e=>setEditData({...editData,system_role:e.target.value as SystemRole})}><option value="employee">Employee</option><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select></Field>}{auth.can(PERMISSIONS.VIEW_SALARIES)&&<Field label="Оклад"><input className="input" type="number" value={salary} onChange={e=>setSalary(Number(e.target.value))}/></Field>}<Field label="Дата начала"><input className="input" type="date" value={editData.started_at||''} onChange={e=>setEditData({...editData,started_at:e.target.value})}/></Field><Field label="Аватар"><input className="input" type="file" accept="image/*" onChange={e=>setAvatar(e.target.files?.[0]||null)}/></Field><Field label="Комментарий" full><textarea className="textarea" value={editData.comment||''} onChange={e=>setEditData({...editData,comment:e.target.value})}/></Field>{auth.isSuperAdmin&&editData.system_role==='admin'&&<Field label="Права администратора" full><div className="grid grid-3">{permissionList.map(([code,label])=><label className="check-row" key={code}><input type="checkbox" checked={perms.includes(code)} onChange={e=>setPerms(e.target.checked?[...perms,code]:perms.filter(x=>x!==code))}/><span className="tiny">{label}</span></label>)}</div></Field>}</div><div className="notice-box" style={{marginTop:12}}>{editData.status==='blocked'?<><Ban size={13}/> Заблокированный пользователь не сможет войти в систему.</>:<><Upload size={13}/> История сотрудника не удаляется: при увольнении используйте статус «Уволен».</>}</div></Modal>}</div>}
const statusLabel=(s:string)=>s==='active'?'Активен':s==='vacation'?'Отпуск':s==='inactive'?'Временно не работает':s==='fired'?'Уволен':'Заблокирован'
const statusKind=(s:string):any=>s==='active'?'success':s==='vacation'?'warning':s==='blocked'||s==='fired'?'danger':''
