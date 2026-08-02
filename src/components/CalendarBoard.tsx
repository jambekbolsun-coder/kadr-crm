import { useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import ruLocale from '@fullcalendar/core/locales/ru'
import { useQuery } from '@tanstack/react-query'
import { getCalendarEvents } from '../services/api'
import { EVENT_COLORS, EVENT_LABELS } from '../lib/constants'
import type { CalendarEvent } from '../types/domain'

function initialRange() {
  const start = new Date()
  start.setMonth(start.getMonth() - 1)
  start.setDate(1)
  const end = new Date()
  end.setMonth(end.getMonth() + 2)
  end.setDate(1)
  return { from:start.toISOString(), to:end.toISOString() }
}

export function CalendarBoard({ compact=false, onDateClick, onEventClick, projectId }: { compact?:boolean; onDateClick?:(date:string)=>void; onEventClick?:(event:CalendarEvent)=>void; projectId?:string }) {
  const [range,setRange] = useState(initialRange)
  const {data:all=[]}=useQuery({
    queryKey:['calendar',range.from,range.to],
    queryFn:()=>getCalendarEvents(range.from,range.to),
  })
  const data=projectId?all.filter(x=>x.project_id===projectId):all

  return <div className="calendar-card card"><FullCalendar
    plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin]}
    locale={ruLocale}
    initialView="dayGridMonth"
    headerToolbar={compact?{left:'prev,next',center:'title',right:'today'}:{left:'prev,next today',center:'title',right:'dayGridMonth,timeGridWeek,timeGridDay'}}
    height={compact?540:'auto'}
    selectable={!!onDateClick}
    dateClick={arg=>onDateClick?.(arg.dateStr)}
    datesSet={arg=>{
      const from=arg.start.toISOString(),to=arg.end.toISOString()
      setRange(prev=>prev.from===from&&prev.to===to?prev:{from,to})
    }}
    eventClick={arg=>{const ev=data.find(x=>x.id===arg.event.id);if(ev)onEventClick?.(ev)}}
    events={data.map(x=>({id:x.id,title:x.title,start:x.starts_at,end:x.ends_at||undefined,allDay:x.all_day,color:EVENT_COLORS[x.event_type]||'#64748b',extendedProps:{type:EVENT_LABELS[x.event_type]}}))}
  /></div>
}
