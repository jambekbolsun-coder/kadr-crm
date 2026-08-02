import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Card, PageHead, SectionTitle } from '../components/ui'
import { dateRu } from '../lib/format'

export default function ActivityPage(){const [limit,setLimit]=useState(100);const {data=[]}=useQuery({queryKey:['activity-log',limit],queryFn:async()=>{const {data,error}=await supabase.from('activity_logs').select('*,actor:profiles(id,full_name)').order('created_at',{ascending:false}).limit(limit);if(error)throw error;return data||[]}});return <div className="page"><PageHead eyebrow="Аудит" title="Журнал действий" text="Кто и когда создал или изменил ключевые записи. История защищена и доступна только администрации."/><Card><SectionTitle title="Последние действия"/><div className="timeline">{data.map((x:any)=><div className="timeline-item" key={x.id}><strong>{x.actor?.full_name||'Система'} · {actionLabel(x.action)} · {x.entity_type}</strong><small>{dateRu(x.created_at,true)}{x.meta?.title?` · ${x.meta.title}`:''}</small></div>)}</div>{data.length>=limit&&<button className="link-btn" onClick={()=>setLimit(v=>v+100)}>Показать ещё</button>}</Card></div>}
const actionLabel=(s:string)=>s==='INSERT'?'создал':s==='UPDATE'?'изменил':s==='DELETE'?'удалил':s
