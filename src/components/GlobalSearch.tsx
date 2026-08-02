import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { globalSearch } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { PERMISSIONS } from '../lib/constants'

export function GlobalSearch() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Awaited<ReturnType<typeof globalSearch>>>([])
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { can } = useAuth()
  const canManageEmployees = can(PERMISSIONS.MANAGE_EMPLOYEES)
  const canManageTasks = can(PERMISSIONS.MANAGE_TASKS)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (q.trim().length >= 2) globalSearch(q).then(setItems).catch(() => setItems([]))
      else setItems([])
    }, 250)
    return () => window.clearTimeout(timer)
  }, [q])

  const visibleItems = useMemo(() => items
    .filter(item => item.type !== 'Сотрудник' || canManageEmployees)
    .map(item => item.type === 'Задача' && !canManageTasks ? { ...item, path: `/my-tasks?focus=${item.id}` } : item),
  [items, canManageEmployees, canManageTasks])

  return <div className="global-search"><Search className="search-lens"/><input className="search-input" value={q} onChange={e=>{setQ(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onBlur={()=>window.setTimeout(()=>setOpen(false),140)} placeholder="Поиск сотрудника, проекта, задачи…"/>{open && q.trim().length >= 2 && <div className="search-results">{visibleItems.length ? visibleItems.map(x=><div className="search-result" key={`${x.type}-${x.id}`} onMouseDown={()=>navigate(x.path)}><div><strong>{x.title}</strong><small>{x.sub}</small></div><span className="search-type">{x.type}</span></div>) : <div className="search-result"><small>Ничего не найдено</small></div>}</div>}</div>
}
