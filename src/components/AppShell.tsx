import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, CalendarDays, FolderKanban, Package, CheckSquare2, Users, BarChart3, WalletCards, Sparkles, Building2, Settings, BriefcaseBusiness, UserRound, ClipboardList, Activity, Menu } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Avatar } from './ui'
import { GlobalSearch } from './GlobalSearch'
import { Notifications } from './Notifications'
import { PERMISSIONS } from '../lib/constants'
import { useRealtimeInvalidation } from '../hooks/useRealtime'

type NavItem={to:string;label:string;icon:any;permission?:string;superOnly?:boolean}
const adminNav:NavItem[]=[
  {to:'/dashboard',label:'Dashboard',icon:LayoutDashboard}, {to:'/calendar',label:'Календарь',icon:CalendarDays},
  {to:'/projects',label:'Проекты',icon:FolderKanban,permission:PERMISSIONS.MANAGE_PROJECTS}, {to:'/packages',label:'Пакеты',icon:Package,permission:PERMISSIONS.MANAGE_PACKAGES},
  {to:'/tasks',label:'Задачи',icon:CheckSquare2,permission:PERMISSIONS.MANAGE_TASKS}, {to:'/employees',label:'Сотрудники',icon:Users,permission:PERMISSIONS.MANAGE_EMPLOYEES},
  {to:'/reports',label:'Отчёты',icon:BarChart3,permission:PERMISSIONS.VIEW_REPORTS}, {to:'/finance',label:'Финансы',icon:WalletCards,permission:PERMISSIONS.MANAGE_FINANCE},
  {to:'/services',label:'Услуги',icon:Sparkles}, {to:'/ideas',label:'Идеи',icon:BriefcaseBusiness}, {to:'/company',label:'О компании',icon:Building2},
  {to:'/activity',label:'Журнал действий',icon:Activity,permission:PERMISSIONS.VIEW_ACTIVITY_LOG}, {to:'/settings',label:'Настройки',icon:Settings,permission:PERMISSIONS.MANAGE_SETTINGS},
]
const employeeNav:NavItem[]=[
  {to:'/dashboard',label:'Dashboard',icon:LayoutDashboard}, {to:'/calendar',label:'Календарь',icon:CalendarDays}, {to:'/my-projects',label:'Мои проекты',icon:FolderKanban},
  {to:'/my-tasks',label:'Мои задачи',icon:CheckSquare2}, {to:'/my-work',label:'Мои работы',icon:ClipboardList}, {to:'/my-report',label:'Мой отчёт',icon:BarChart3}, {to:'/profile',label:'Мой профиль',icon:UserRound},
]

export function AppShell({ children }: { children: ReactNode }) {
  const { profile,isAdmin,isSuperAdmin,can,signOut }=useAuth(); const [open,setOpen]=useState(false); const loc=useLocation(); useRealtimeInvalidation()
  const nav=(isAdmin?adminNav:employeeNav).filter(x=>!x.superOnly||isSuperAdmin).filter(x=>!x.permission||can(x.permission))
  const label=nav.find(x=>loc.pathname===x.to || (x.to==='/projects'&&loc.pathname.startsWith('/projects/')))?.label || 'SMM_KADR Control'
  return <div className="app-shell">{open&&<div className="sidebar-overlay" onClick={()=>setOpen(false)}/>}<aside className={`sidebar ${open?'open':''}`}><NavLink className="brand" to="/dashboard" onClick={()=>setOpen(false)}><span className="brand-mark">SK</span><span><strong>SMM_KADR</strong><small>CONTROL CENTER</small></span></NavLink><nav className="nav"><div className="nav-section">Управление</div>{nav.map(x=>{const Icon=x.icon;return <NavLink key={x.to} to={x.to} onClick={()=>setOpen(false)} className={({isActive})=>`nav-link ${isActive?'active':''}`}><span className="nav-icon"><Icon/></span><span>{x.label}</span></NavLink>})}</nav><div className="sidebar-foot"><div className="sidebar-user"><Avatar profile={profile}/><div><strong>{profile?.full_name}</strong><small>{profile?.job_title || (isAdmin?'Администратор':'Сотрудник')}</small></div></div><button className="logout-link" onClick={()=>void signOut()}>Выйти из системы</button></div></aside><main className="main-wrap"><header className="topbar"><button className="mobile-menu-btn" onClick={()=>setOpen(v=>!v)}><Menu size={17}/></button><div className="topbar-title">{label}</div><div className="topbar-spacer"/><GlobalSearch/><div className="topbar-actions"><Notifications/></div></header>{children}</main></div>
}
