import { Bell, CheckCheck } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../services/api'
import { relativeRu } from '../lib/format'
import { PERMISSIONS } from '../lib/constants'
import { Button } from './ui'

function destination(n: any, canManageTasks: boolean) {
  if (n.object_type === 'project' && n.object_id) return `/projects/${n.object_id}`
  if (n.object_type === 'task' && n.object_id) return `${canManageTasks ? '/tasks' : '/my-tasks'}?focus=${n.object_id}`
  return '/dashboard'
}

export function Notifications() {
  const { profile, can } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canManageTasks = can(PERMISSIONS.MANAGE_TASKS)
  const { data=[] } = useQuery({ queryKey:['notifications',profile?.id], queryFn:()=>getNotifications(profile!.id), enabled:!!profile })
  const unread = data.filter(x=>!x.read_at).length

  const readOne = async (n:any) => {
    if (!n.read_at) await markNotificationRead(n.id)
    await qc.invalidateQueries({ queryKey:['notifications'] })
    setOpen(false)
    navigate(destination(n, canManageTasks))
  }

  return <div className="notifications-wrap">
    <button className="icon-btn" onClick={()=>setOpen(v=>!v)} aria-label="Уведомления">
      <Bell size={17}/>{unread>0&&<span className="unread-dot">{unread>99?'99+':unread}</span>}
    </button>
    {open&&<div className="notifications-popover">
      <div className="popover-head"><strong>Уведомления</strong>{unread>0&&<Button kind="ghost" small onClick={async()=>{await markAllNotificationsRead(profile!.id);await qc.invalidateQueries({queryKey:['notifications']})}}><CheckCheck/> Прочитать всё</Button>}</div>
      {data.length?data.map(n=><div className={`notification-item ${!n.read_at?'unread':''}`} key={n.id} onClick={()=>void readOne(n)}>
        <div className="notification-icon"><Bell size={14}/></div><div><strong>{n.title}</strong><small>{n.body}</small><small>{relativeRu(n.created_at)}</small></div>
      </div>):<div className="notification-item"><small>Новых уведомлений нет</small></div>}
    </div>}
  </div>
}
