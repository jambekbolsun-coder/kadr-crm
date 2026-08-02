import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import { PERMISSIONS } from './lib/constants'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import DashboardPage from './pages/DashboardPage'
import CalendarPage from './pages/CalendarPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import PackagesPage from './pages/PackagesPage'
import TasksPage from './pages/TasksPage'
import EmployeesPage from './pages/EmployeesPage'
import ReportsPage from './pages/ReportsPage'
import FinancePage from './pages/FinancePage'
import WorkLogsPage from './pages/WorkLogsPage'
import ProfilePage from './pages/ProfilePage'
import ServicesPage from './pages/ServicesPage'
import IdeasPage from './pages/IdeasPage'
import CompanyPage from './pages/CompanyPage'
import ActivityPage from './pages/ActivityPage'
import SettingsPage from './pages/SettingsPage'
import AccessDeniedPage from './pages/AccessDeniedPage'
import NotFoundPage from './pages/NotFoundPage'

function ShellRoute({ children, permission, adminOnly=false }: { children:ReactNode; permission?:string; adminOnly?:boolean }) {
  return <ProtectedRoute permission={permission} adminOnly={adminOnly}><AppShell>{children}</AppShell></ProtectedRoute>
}

export default function App(){return <QueryClientProvider client={queryClient}><ToastProvider><BrowserRouter><AuthProvider><Routes>
  <Route path="/login" element={<LoginPage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/>
  <Route path="/" element={<Navigate to="/dashboard" replace/>}/>
  <Route path="/dashboard" element={<ShellRoute><DashboardPage/></ShellRoute>}/>
  <Route path="/calendar" element={<ShellRoute><CalendarPage/></ShellRoute>}/>
  <Route path="/projects" element={<ShellRoute permission={PERMISSIONS.MANAGE_PROJECTS}><ProjectsPage/></ShellRoute>}/>
  <Route path="/projects/:id" element={<ShellRoute><ProjectDetailPage/></ShellRoute>}/>
  <Route path="/my-projects" element={<ShellRoute><ProjectsPage mine/></ShellRoute>}/>
  <Route path="/packages" element={<ShellRoute permission={PERMISSIONS.MANAGE_PACKAGES}><PackagesPage/></ShellRoute>}/>
  <Route path="/tasks" element={<ShellRoute permission={PERMISSIONS.MANAGE_TASKS}><TasksPage/></ShellRoute>}/>
  <Route path="/my-tasks" element={<ShellRoute><TasksPage mine/></ShellRoute>}/>
  <Route path="/employees" element={<ShellRoute permission={PERMISSIONS.MANAGE_EMPLOYEES}><EmployeesPage/></ShellRoute>}/>
  <Route path="/reports" element={<ShellRoute permission={PERMISSIONS.VIEW_REPORTS}><ReportsPage/></ShellRoute>}/>
  <Route path="/my-report" element={<ShellRoute><ReportsPage mine/></ShellRoute>}/>
  <Route path="/finance" element={<ShellRoute permission={PERMISSIONS.MANAGE_FINANCE}><FinancePage/></ShellRoute>}/>
  <Route path="/my-work" element={<ShellRoute><WorkLogsPage/></ShellRoute>}/>
  <Route path="/profile" element={<ShellRoute><ProfilePage/></ShellRoute>}/>
  <Route path="/services" element={<ShellRoute adminOnly><ServicesPage/></ShellRoute>}/>
  <Route path="/ideas" element={<ShellRoute adminOnly><IdeasPage/></ShellRoute>}/>
  <Route path="/company" element={<ShellRoute adminOnly><CompanyPage/></ShellRoute>}/>
  <Route path="/activity" element={<ShellRoute permission={PERMISSIONS.VIEW_ACTIVITY_LOG}><ActivityPage/></ShellRoute>}/>
  <Route path="/settings" element={<ShellRoute permission={PERMISSIONS.MANAGE_SETTINGS}><SettingsPage/></ShellRoute>}/>
  <Route path="/access-denied" element={<ShellRoute><AccessDeniedPage/></ShellRoute>}/>
  <Route path="*" element={<ShellRoute><NotFoundPage/></ShellRoute>}/>
</Routes></AuthProvider></BrowserRouter></ToastProvider></QueryClientProvider>}
