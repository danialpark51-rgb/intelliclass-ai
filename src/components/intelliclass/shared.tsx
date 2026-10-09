import { type ReactNode } from 'react';
import { Inbox, LoaderCircle, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
export function Brand({compact=false}:{compact?:boolean}) { return <span className="brand"><span className="brand-mark"><GraduationCap size={23}/></span>{!compact && <span>Intelli<span className="text-primary">Class</span><span className="brand-dot">.</span></span>}</span>; }
export function StatusBadge({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'success'|'warning'|'info'}){return <span className={cn('status-badge',`status-${tone}`)}><span/>{children}</span>}
export function EmptyState({title,description,icon:Icon=Inbox,children}:{title:string;description:string;icon?:typeof Inbox;children?:ReactNode}){return <div className="empty-state"><span className="empty-icon"><Icon size={25}/></span><h3>{title}</h3><p>{description}</p>{children}</div>}
export function LoadingState(){return <div role="status" className="empty-state"><LoaderCircle className="animate-spin text-primary"/><p>Loading your workspace…</p></div>}
export function Panel({title,subtitle,action,children,className}:{title:string;subtitle?:string;action?:ReactNode;children:ReactNode;className?:string}){return <section className={cn('panel',className)}><header className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</section>}
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
export function DataTable({headers,children}:{headers:string[];children:ReactNode}){return <div className="table-scroll"><table className="data-table"><thead><tr>{headers.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{children}</tbody></table></div>}
