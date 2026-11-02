import { CalendarDays, Eye, Users } from 'lucide-react'
import { AppModal } from '../components/AppModal'
import type { SubstitutionRecord, ViyeuticaProject, Weekday } from '../domain/project'

const days:Record<Weekday,string>={L:'Lunes',M:'Martes',X:'Miércoles',J:'Jueves',V:'Viernes',S:'Sábado'}

function teacherName(project:ViyeuticaProject,id:string){
  return project.teachers.find(teacher=>teacher.id===id)?.name??'Docente no encontrado'
}

export function substitutionsForDay(project:ViyeuticaProject,date:string){
  return (project.substitutionRecords??[])
    .filter(record=>record.date===date)
    .sort((a,b)=>{
      const blocks=project.schedule.blocks
      return blocks.findIndex(block=>block.id===a.sessionId)-blocks.findIndex(block=>block.id===b.sessionId)
        ||teacherName(project,a.substituteTeacherId).localeCompare(teacherName(project,b.substituteTeacherId),'es')
    })
}

export function DailySubstitutionsDialog({project,day,date,onClose}:{
  project:ViyeuticaProject
  day:Weekday
  date:string
  onClose:()=>void
}){
  const sessions=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
    .sort((a,b)=>a.start.localeCompare(b.start))
  const records=substitutionsForDay(project,date)
  const planned=records.filter(record=>record.status==='planned').length
  const completed=records.filter(record=>record.status==='completed').length
  const title=days[day]+' · '+new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'})
    .format(new Date(date+'T12:00:00Z'))

  const locationFor=(record:SubstitutionRecord)=>{
    const group=project.groups.find(item=>item.id===record.groupId)
    const assignment=project.assignments.find(item=>item.id===record.assignmentId)
    const space=project.spaces.find(item=>item.id===assignment?.spaceId)
    return {group:group?.name??'Grupo no encontrado',room:space?.name||group?.classroom||'Aula no indicada',
      subject:project.subjects.find(item=>item.id===assignment?.subjectId)?.name??'Materia no encontrada'}
  }

  return <AppModal title={'Coberturas · '+title} icon={<Eye size={19}/>} onClose={onClose} wide>
    <div className="daily-substitutions-capture">
      <div className="daily-substitutions-intro">
        <div><strong>⩒Yeutika · Cuadrante diario de sustituciones</strong><p><CalendarDays size={14}/>{title}</p></div>
        <span>{records.length} {records.length===1?'cobertura':'coberturas'} · {planned} previstas · {completed} realizadas</span>
      </div>
      <div className="daily-substitutions-grid">
        {sessions.map(session=>{
          const matching=records.filter(record=>record.sessionId===session.id)
          return <section key={session.id} className={'daily-substitutions-session '+(!matching.length?'is-empty':'')}>
            <header className="daily-substitutions-session-header">
              <strong>{session.label}</strong><span>{session.start}–{session.end}</span>
              <small>{matching.length?matching.length+' '+(matching.length===1?'cobertura':'coberturas'):'Sin sustituciones'}</small>
            </header>
            {matching.length?<div className="daily-substitutions-items">
              {matching.map(record=>{
                const place=locationFor(record)
                return <article className="daily-substitutions-item" key={record.id}>
                  <div className="daily-substitutions-names">
                    <div><span>Sustituye</span><strong>{teacherName(project,record.substituteTeacherId)}</strong></div>
                    <div><span>Docente ausente</span><strong>{teacherName(project,record.absentTeacherId)}</strong></div>
                  </div>
                  <p><Users size={13}/> <strong>{place.group}</strong> · {place.subject}</p>
                  <p><strong>Aula:</strong> {place.room}</p>
                  {record.coverageType==='co_teacher'&&<p>Permanece el codocente del grupo.</p>}
                  {record.notes&&<p><strong>Observaciones:</strong> {record.notes}</p>}
                  <span className={'daily-substitutions-status '+record.status}>{record.status==='completed'?'Realizada':'Prevista'}</span>
                </article>
              })}
            </div>:<p className="daily-substitutions-no-cover">No se han registrado coberturas para esta sesión.</p>}
          </section>
        })}
      </div>
      <p className="daily-substitutions-footer">Información del registro de ⩒Yeutika para la fecha indicada. Las coberturas previstas están pendientes de confirmación.</p>
    </div>
  </AppModal>
}
