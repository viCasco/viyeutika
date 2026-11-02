import { Clock3, Users } from 'lucide-react'
import { AppModal } from '../components/AppModal'

export type CandidateStatus='free'|'avoid'|'blocked'|'busy'
export interface CandidateDetail {
  id:string
  name:string
  status:CandidateStatus
  detail:string
}
const statuses:Record<CandidateStatus,string>={
  free:'Sin clase',avoid:'Evitar (SOFT)',blocked:'No disponible',busy:'Ocupado',
}
const sections: {title:string;status:CandidateStatus}[]=[
  {title:'Sin clase',status:'free'},
  {title:'Evitar (SOFT)',status:'avoid'},
  {title:'No disponibles / itinerancia',status:'blocked'},
  {title:'Con sesión asignada',status:'busy'},
]

export function SubstitutionTeacherDialog({
  title,time,candidates,onClose,onSelect,choices,selectedId,
}:{
  title:string
  time:string
  candidates:CandidateDetail[]
  onClose:()=>void
  onSelect?:(choice:string)=>void
  choices?:Record<string,string>
  selectedId?:string
}){
  return <AppModal title={title} icon={<Users size={19}/>} onClose={onClose} wide>
    <p className="substitutions-modal-time"><Clock3 size={15}/>{time} · {candidates.length} {candidates.length===1?'docente':'docentes'} en plantilla activa</p>
    {sections.map(section=>{
      const entries=candidates.filter(item=>item.status===section.status)
      return <section className="substitutions-detail-group" key={section.status}>
        <h3>{section.title} <span>{entries.length}</span></h3>
        {entries.length?<div className="substitutions-results">
          {entries.map(candidate=>{
            const choice=choices?.[candidate.id]
            const selectable=Boolean(onSelect&&choice)
            const body=<><Users size={17}/><div><strong>{candidate.name||'Docente sin nombre'}</strong><small>{candidate.detail}</small></div>
              <span className={'substitutions-state '+candidate.status}>{choice?.startsWith('co:')?'Codocente':statuses[candidate.status]}</span>
              {selectable&&<span className="substitute-choice-label">{choice===selectedId?'Elegido':'Elegir'}</span>}</>
            return selectable
              ? <button key={candidate.id} type="button" className={'substitutions-teacher selectable '+(choice===selectedId?'chosen':'')} onClick={()=>onSelect?.(choice!)}>{body}</button>
              : <div key={candidate.id} className="substitutions-teacher">{body}</div>
          })}
        </div>:<p className="substitutions-empty">No hay docentes en esta categoría.</p>}
      </section>
    })}
    <p className="substitutions-help">{onSelect
      ?'Selecciona un docente disponible o al codocente que ya permanece en el grupo. Las personas bloqueadas u ocupadas no se pueden elegir como sustitutas.'
      :'Consulta del horario de referencia. No implica asignación ni autorización de una sustitución.'}</p>
  </AppModal>
}
