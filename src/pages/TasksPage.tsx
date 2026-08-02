import { useEffect, useMemo, useState } from 'react'
import { Ban, Check, MessageCircle, Paperclip, Play, Plus, RotateCcw, Send } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { getDepartments, getProfiles, getProjects, getTasks } from '../services/api'
import { supabase } from '../lib/supabase'
import { Avatar, Badge, Button, Empty, Field, Modal, PageHead, Person } from '../components/ui'
import { StorageLink } from '../components/StorageLink'
import { dateRu } from '../lib/format'
import { isChronological, normalizeHttpUrl, uploadError } from '../lib/validation'
import { PERMISSIONS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '../lib/constants'
import type { Task, TaskPriority, TaskStatus } from '../types/domain'

const boardStatuses: TaskStatus[] = ['new','in_progress','review','completed','cancelled']

export default function TasksPage({ mine=false }: { mine?:boolean }) {
  const {profile,isAdmin}=useAuth()
  const {toast}=useToast()
  const qc=useQueryClient()
  const [params,setParams]=useSearchParams()
  const focus=params.get('focus')
  const {data:tasks=[]}=useQuery({queryKey:['tasks',mine?profile?.id:'all'],queryFn:()=>getTasks(mine?profile!.id:undefined)})
  const {data:projects=[]}=useQuery({queryKey:['projects','task-picker'],queryFn:()=>getProjects(isAdmin?undefined:profile!.id)})
  const {data:employees=[]}=useQuery({queryKey:['profiles','task-picker'],queryFn:()=>getProfiles(false),enabled:isAdmin})
  const {data:deps=[]}=useQuery({queryKey:['departments'],queryFn:()=>getDepartments(),enabled:isAdmin})
  const [create,setCreate]=useState(false)
  const [detail,setDetail]=useState<Task|null>(null)
  const [form,setForm]=useState<any>({title:'',description:'',project_id:'',assignee_id:'',department_id:'',start_at:'',due_at:'',priority:'medium'})
  const [comment,setComment]=useState('')
  const [resultLink,setResultLink]=useState('')
  const [file,setFile]=useState<File|null>(null)

  useEffect(()=>{
    if(focus&&tasks.length){const t=tasks.find(x=>x.id===focus);if(t){setDetail(t);const next=new URLSearchParams(params);next.delete('focus');setParams(next,{replace:true})}}
  },[focus,tasks])
  useEffect(()=>{setResultLink(detail?.result_link||'');setFile(null)},[detail?.id,detail?.result_link])

  const grouped=useMemo(()=>Object.fromEntries(boardStatuses.map(status=>[status,tasks.filter(t=>t.status===status)])) as Record<TaskStatus,Task[]>,[tasks])
  const projectMembers=useMemo(()=>{const p=projects.find(p=>p.id===form.project_id);const ids=(p?.project_members||[]).map(m=>m.profile_id);return form.project_id?employees.filter(e=>ids.includes(e.id)):employees},[form.project_id,projects,employees])

  async function createTask(){
    if(!form.title?.trim()||!form.assignee_id)return toast('Укажи задачу и сотрудника','error')
    if(!isChronological(form.start_at,form.due_at))return toast('Дедлайн не может быть раньше даты начала','error')
    try{
      const {error}=await supabase.from('tasks').insert({title:form.title.trim(),description:form.description?.trim()||null,project_id:form.project_id||null,assignee_id:form.assignee_id,department_id:form.department_id||null,start_at:form.start_at?new Date(form.start_at).toISOString():null,due_at:form.due_at?new Date(form.due_at).toISOString():null,priority:form.priority,status:'new',created_by:profile!.id})
      if(error)throw error
      toast('Задача создана, сотрудник получит уведомление','success')
      setCreate(false)
      setForm({title:'',description:'',project_id:'',assignee_id:'',department_id:'',start_at:'',due_at:'',priority:'medium'})
      await qc.invalidateQueries({queryKey:['tasks']})
    }catch(e:any){toast(e.message,'error')}
  }

  async function setStatus(task:Task,status:TaskStatus,review_comment?:string){
    const patch:any={status}
    if(status==='new'){patch.started_at=null;patch.submitted_at=null;patch.completed_at=null}
    if(status==='in_progress')patch.started_at=new Date().toISOString()
    if(status==='review')patch.submitted_at=new Date().toISOString()
    if(status==='completed')patch.completed_at=new Date().toISOString()
    if(status==='cancelled')patch.completed_at=null
    if(status==='in_progress'&&task.status==='review')patch.review_comment=review_comment||'Возвращено на доработку'
    if(review_comment)patch.review_comment=review_comment
    const {error}=await supabase.from('tasks').update(patch).eq('id',task.id)
    if(error)return toast(error.message,'error')
    toast(status==='cancelled'?'Задача отменена':'Статус задачи обновлён','success')
    setDetail(null)
    await qc.invalidateQueries({queryKey:['tasks']})
  }

  async function saveResult(task:Task){
    try{
      const rawLink=resultLink.trim()
      const nextLink=rawLink?normalizeHttpUrl(rawLink):null
      if(rawLink&&!nextLink)throw new Error('Укажи корректную http/https ссылку')
      const fileProblem=uploadError(file)
      if(fileProblem)throw new Error(fileProblem)
      if(nextLink!==task.result_link){
        const {error}=await supabase.from('tasks').update({result_link:nextLink}).eq('id',task.id)
        if(error)throw error
      }
      if(file){
        const path=`${profile!.id}/${task.id}/${Date.now()}-${safe(file.name)}`
        const {error:u}=await supabase.storage.from('task-files').upload(path,file)
        if(u)throw u
        const {error:a}=await supabase.from('task_attachments').insert({task_id:task.id,uploaded_by:profile!.id,file_path:path,file_name:file.name,file_size:file.size})
        if(a){await supabase.storage.from('task-files').remove([path]);throw a}
      }
      setDetail(prev=>prev&&prev.id===task.id?{...prev,result_link:nextLink}:prev)
      setFile(null)
      toast('Результат сохранён','success')
      await Promise.all([
        qc.invalidateQueries({queryKey:['tasks']}),
        qc.invalidateQueries({queryKey:['task-attachments',task.id]}),
      ])
    }catch(e:any){toast(e.message,'error')}
  }

  async function addComment(task:Task){
    if(!comment.trim())return
    const {error}=await supabase.from('task_comments').insert({task_id:task.id,author_id:profile!.id,body:comment.trim()})
    if(error)return toast(error.message,'error')
    setComment('')
    toast('Комментарий добавлен','success')
    await qc.invalidateQueries({queryKey:['task-comments',task.id]})
  }

  return <div className="page">
    <PageHead eyebrow={mine?'Личные задачи':'Управление задачами'} title={mine?'Мои задачи':'Задачи'} text={mine?'Начинайте работу, отправляйте результат на проверку и следите за дедлайнами.':'Проект и задача — отдельные сущности. Назначение в проект не создаёт задачи автоматически.'} actions={isAdmin&&!mine?<Button onClick={()=>setCreate(true)}><Plus/> Добавить задачу</Button>:undefined}/>
    {tasks.length?<div className="task-board">{boardStatuses.map(status=><div className="task-column" key={status}>
      <div className="task-column-head"><span>{TASK_STATUS_LABELS[status]}</span><Badge>{grouped[status].length}</Badge></div>
      {grouped[status].map(t=><div className={`task-card priority-${t.priority}`} key={t.id} onClick={()=>setDetail(t)} style={{cursor:'pointer',opacity:t.status==='cancelled' ? 0.65 : 1}}>
        <h4>{t.title}</h4><p>{t.project?.name||'Без проекта'}</p><div className="task-card-foot"><div><Badge kind={t.status==='cancelled'?'danger':t.priority==='urgent'?'danger':t.priority==='high'?'warning':'accent'}>{t.status==='cancelled'?'Отменена':TASK_PRIORITY_LABELS[t.priority]}</Badge><span className="tiny muted" style={{marginLeft:6}}>{dateRu(t.due_at,true)}</span></div><Avatar profile={t.assignee}/></div>
      </div>)}
    </div>)}</div>:<Empty title="Задач пока нет" text={mine?'У вас нет назначенных задач.':'Создай задачу и назначь ответственного.'}/>} 

    {create&&<Modal title="Новая задача" onClose={()=>setCreate(false)} footer={<><Button kind="secondary" onClick={()=>setCreate(false)}>Отмена</Button><Button onClick={()=>void createTask()}>Создать</Button></>}><div className="form-grid">
      <Field label="Название" full><input className="input" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
      <Field label="Проект"><select className="select" value={form.project_id} onChange={e=>setForm({...form,project_id:e.target.value,assignee_id:''})}><option value="">Без проекта</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Сотрудник"><select className="select" value={form.assignee_id} onChange={e=>{const emp=employees.find(x=>x.id===e.target.value);setForm({...form,assignee_id:e.target.value,department_id:emp?.department_id||form.department_id})}}><option value="">Выбрать</option>{projectMembers.map(e=><option key={e.id} value={e.id}>{e.full_name} — {e.job_title}</option>)}</select></Field>
      <Field label="Отдел"><select className="select" value={form.department_id} onChange={e=>setForm({...form,department_id:e.target.value})}><option value="">Не указан</option>{deps.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <Field label="Приоритет"><select className="select" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as TaskPriority})}>{Object.entries(TASK_PRIORITY_LABELS).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></Field>
      <Field label="Дата начала"><input className="input" type="datetime-local" value={form.start_at} onChange={e=>setForm({...form,start_at:e.target.value})}/></Field>
      <Field label="Дедлайн"><input className="input" type="datetime-local" value={form.due_at} onChange={e=>setForm({...form,due_at:e.target.value})}/></Field>
      <Field label="Описание" full><textarea className="textarea" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
    </div></Modal>}

    {detail&&<TaskDetail task={detail} onClose={()=>setDetail(null)} onStatus={setStatus} comment={comment} setComment={setComment} addComment={addComment} resultLink={resultLink} setResultLink={setResultLink} file={file} setFile={setFile} saveResult={saveResult}/>} 
  </div>
}

function TaskDetail({task,onClose,onStatus,comment,setComment,addComment,resultLink,setResultLink,file,setFile,saveResult}:{task:Task;onClose:()=>void;onStatus:(t:Task,s:TaskStatus,c?:string)=>Promise<void>;comment:string;setComment:(s:string)=>void;addComment:(t:Task)=>Promise<void>;resultLink:string;setResultLink:(s:string)=>void;file:File|null;setFile:(f:File|null)=>void;saveResult:(t:Task)=>Promise<void>}){
  const {can,profile}=useAuth()
  const {data:comments=[]}=useQuery({queryKey:['task-comments',task.id],queryFn:async()=>{const {data,error}=await supabase.from('task_comments').select('*, author:profiles(id,full_name,job_title)').eq('task_id',task.id).order('created_at');if(error)throw error;return data||[]}})
  const {data:attachments=[]}=useQuery({queryKey:['task-attachments',task.id],queryFn:async()=>{const {data,error}=await supabase.from('task_attachments').select('*').eq('task_id',task.id).order('created_at');if(error)throw error;return data||[]}})
  const [review,setReview]=useState('')
  const own=task.assignee_id===profile?.id
  const canManage=can(PERMISSIONS.MANAGE_TASKS)
  return <Modal title={task.title} large onClose={onClose}><div className="grid grid-2">
    <div className="stack">
      <div className="card card-pad"><div className="card-title-row"><Badge kind={task.status==='cancelled'?'danger':'accent'}>{TASK_STATUS_LABELS[task.status]}</Badge><Badge kind={task.priority==='urgent'?'danger':task.priority==='high'?'warning':''}>{TASK_PRIORITY_LABELS[task.priority]}</Badge></div><p className="muted" style={{fontSize:11,lineHeight:1.6}}>{task.description||'Без описания'}</p><div className="card-metrics"><div className="mini-metric"><span>Проект</span><strong>{task.project?.name||'—'}</strong></div><div className="mini-metric"><span>Дедлайн</span><strong>{dateRu(task.due_at,true)}</strong></div></div>{task.assignee&&<Person profile={task.assignee}/>}</div>
      {own&&task.status!=='completed'&&task.status!=='cancelled'&&<div className="card card-pad"><strong className="tiny">Действия сотрудника</strong><div className="filters" style={{marginTop:10}}>{task.status==='new'&&<Button onClick={()=>void onStatus(task,'in_progress')}><Play/> Начать</Button>}{task.status==='in_progress'&&<Button onClick={()=>void onStatus(task,'review')}><Send/> На проверку</Button>}</div><div className="form-grid"><Field label="Ссылка на результат" full><input className="input" value={resultLink} onChange={e=>setResultLink(e.target.value)} placeholder="Google Drive / Canva / другое"/></Field><Field label="Файл" full><input className="input" type="file" onChange={e=>setFile(e.target.files?.[0]||null)}/></Field></div><Button kind="secondary" disabled={!file&&resultLink.trim()===(task.result_link||'')} onClick={()=>void saveResult(task)}><Paperclip/> Сохранить результат</Button></div>}
      {canManage&&task.status==='review'&&<div className="card card-pad"><strong className="tiny">Проверка администратора</strong><textarea className="textarea" placeholder="Комментарий для доработки" value={review} onChange={e=>setReview(e.target.value)} style={{margin:'10px 0'}}/><div className="filters"><Button onClick={()=>void onStatus(task,'completed')}><Check/> Принять</Button><Button kind="danger" onClick={()=>void onStatus(task,'in_progress',review||'Вернуть на доработку')}><RotateCcw/> На доработку</Button></div></div>}
      {canManage&&task.status!=='completed'&&task.status!=='cancelled'&&<Button kind="danger" onClick={()=>confirm(`Отменить задачу «${task.title}»?`)&&void onStatus(task,'cancelled')}><Ban/> Отменить задачу</Button>}
      {canManage&&task.status==='cancelled'&&<Button kind="secondary" onClick={()=>void onStatus(task,'new')}><RotateCcw/> Вернуть задачу</Button>}
    </div>
    <div className="stack">
      <div className="card card-pad"><strong className="tiny"><MessageCircle size={13}/> Комментарии</strong><div className="stack" style={{marginTop:10}}>{comments.map((c:any)=><div className="comment" key={c.id}><div className="comment-head"><strong>{c.author?.full_name||'Сотрудник'}</strong><small>{dateRu(c.created_at,true)}</small></div><p>{c.body}</p></div>)}</div><div className="repeat-row" style={{marginTop:10}}><input className="input" value={comment} onChange={e=>setComment(e.target.value)} placeholder="Добавить комментарий"/><Button small onClick={()=>void addComment(task)}>Отправить</Button></div></div>
      <div className="card card-pad"><strong className="tiny">Результаты и файлы</strong>{task.result_link&&normalizeHttpUrl(task.result_link)&&<div className="list-item"><a href={normalizeHttpUrl(task.result_link)!} target="_blank" rel="noreferrer" className="link-btn">Открыть ссылку результата</a></div>}{attachments.map((a:any)=><div className="list-item" key={a.id}><span>{a.file_name}</span><div className="row-actions"><span className="tiny muted">{Math.round((a.file_size||0)/1024)} KB</span><StorageLink bucket="task-files" path={a.file_path} label="Открыть"/></div></div>)}{!task.result_link&&!attachments.length&&<p className="muted tiny">Пока ничего не прикреплено.</p>}</div>
    </div>
  </div></Modal>
}

const safe=(s:string)=>s.replace(/[^a-zA-Z0-9а-яА-Я._-]/g,'_')
