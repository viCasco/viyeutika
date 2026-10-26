import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function AppModal({
  title,
  icon,
  onClose,
  children,
  footer,
  wide=false,
}:{
  title:string
  icon?:ReactNode
  onClose:()=>void
  children:ReactNode
  footer?:ReactNode
  wide?:boolean
}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section
      className={'app-modal '+(wide?'wide':'')}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={event=>event.stopPropagation()}
    >
      <header className="app-modal-header">
        <div>{icon}<h2>{title}</h2></div>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18}/></button>
      </header>
      <div className="app-modal-body">{children}</div>
      {footer&&<footer className="app-modal-footer">{footer}</footer>}
    </section>
  </div>
}
