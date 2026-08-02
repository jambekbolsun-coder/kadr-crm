import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type ButtonHTMLAttributes, type MouseEvent } from 'react'
import { X, Inbox } from 'lucide-react'
import { initials } from '../lib/format'
import type { Profile } from '../types/domain'
import { supabase } from '../lib/supabase'

export function Button({ children, kind = 'primary', small = false, className = '', onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary'|'secondary'|'danger'|'ghost'; small?: boolean }) {
  const lastClick = useRef(0)
  const guardedClick = onClick ? (event: MouseEvent<HTMLButtonElement>) => {
    const now = Date.now()
    if (now - lastClick.current < 800) { event.preventDefault(); return }
    lastClick.current = now
    onClick(event)
  } : undefined
  return <button {...props} type={props.type ?? 'button'} className={`btn btn-${kind}${small ? ' btn-sm' : ''} ${className}`} onClick={guardedClick}>{children}</button>
}
export function Card({ children, className = '', pad = true, style }: { children: ReactNode; className?: string; pad?: boolean; style?: CSSProperties }) { return <div style={style} className={`card ${pad ? 'card-pad' : ''} ${className}`}>{children}</div> }
export function PageHead({ eyebrow, title, text, actions }: { eyebrow: string; title: string; text?: string; actions?: ReactNode }) { return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{text && <p>{text}</p>}</div>{actions && <div className="head-actions">{actions}</div>}</div> }
export function SectionTitle({ title, text, actions }: { title: string; text?: string; actions?: ReactNode }) { return <div className="section-title"><div><h2>{title}</h2>{text && <p>{text}</p>}</div>{actions && <div className="section-actions">{actions}</div>}</div> }
export function StatCard({ label, value, note, icon }: { label: string; value: ReactNode; note?: string; icon?: ReactNode }) { return <div className="card stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value}</div><div className="stat-note">{note || ' '}</div></div> }
export function Badge({ children, kind = '', dot = false }: { children: ReactNode; kind?: 'success'|'warning'|'danger'|'accent'|'purple'|''; dot?: boolean }) { return <span className={`badge ${kind ? `badge-${kind}` : ''}`}>{dot && <span className="dot"/>}{children}</span> }
export function Avatar({ profile, size }: { profile?: Partial<Profile> | null; size?: number }) {
  const style = size ? { width: size, height: size } : undefined
  const [src,setSrc]=useState<string|null>(null)
  useEffect(()=>{let alive=true;const path=profile?.avatar_path;if(!path){setSrc(null);return}if(/^https?:\/\//.test(path)){setSrc(path);return}void supabase.storage.from('avatars').createSignedUrl(path,3600).then(({data})=>{if(alive)setSrc(data?.signedUrl||null)});return()=>{alive=false}},[profile?.avatar_path])
  return <span className="avatar" style={style}>{src ? <img src={src} alt={profile?.full_name || 'avatar'} /> : initials(profile?.full_name)}</span>
}
export function Person({ profile }: { profile?: Partial<Profile> | null }) { return <div className="person"><Avatar profile={profile}/><div><strong>{profile?.full_name || 'Без имени'}</strong><small>{profile?.job_title || 'Сотрудник'}{profile?.department?.name ? ` · ${profile.department.name}` : ''}</small></div></div> }
export function Progress({ value }: { value: number }) { const v = Math.max(0, Math.min(100, Math.round(value || 0))); return <div><div className="progress-meta"><span>Прогресс</span><b>{v}%</b></div><div className="progress"><span style={{ width: `${v}%` }}/></div></div> }
export function Field({ label, children, hint, full }: { label: string; children: ReactNode; hint?: string; full?: boolean }) { return <div className={`field ${full ? 'full' : ''}`}><label>{label}</label>{children}{hint && <span className="hint">{hint}</span>}</div> }
export function Modal({ title, children, onClose, footer, large = false }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; large?: boolean }) { return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className={`modal ${large ? 'modal-lg' : ''}`}><div className="modal-head"><h2>{title}</h2><Button kind="ghost" small onClick={onClose}><X/></Button></div><div className="modal-body">{children}</div>{footer && <div className="modal-foot">{footer}</div>}</div></div> }
export function Empty({ title = 'Пока пусто', text = 'Добавьте первую запись, чтобы начать работу.', action }: { title?: string; text?: string; action?: ReactNode }) { return <div className="empty"><div className="empty-icon"><Inbox/></div><h3>{title}</h3><p>{text}</p>{action}</div> }
export function LoadingGrid({ count = 4 }: { count?: number }) { return <div className="grid grid-4">{Array.from({length:count}).map((_,i)=><div className="skeleton" key={i}/>)}</div> }
export function ErrorBox({ error }: { error: unknown }) { return <div className="error-box">{error instanceof Error ? error.message : String(error)}</div> }
