import { useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, ClipboardList, Plus, Trash2 } from 'lucide-react'
import { AppModal } from '../components/AppModal'
import { saveProject } from '../store/projectStorage'
import type { GeneratedScheduleEntry, SubstitutionRecord, ViyeuticaProject, Weekday } from '../domain/project'
import { teacherIsUnavailable } from '../domain/validationEngine'

const weekdays:Weekday[]=['L','M','X','J','V','S']
const dayName:Record<Weekday,string>={L:'Lunes',M:'Martes',X:'Miércoles',J:'Jueves',V:'Viernes',S:'Sábado'}
const dateDay=(date:string):Weekday|null=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null
  const number=new Date(date+'T12:00:00').getDay()
  return number===0?null:weekdays[number-1]
}
const id=()=> 'sub_'+crypto.randomUUID()

type EntryOption={id:string;label:string;kind:'substitute'|'co_teacher'}

export function isSubstituteEligible(
  project:ViyeuticaProject,
  date:string,
  entry:GeneratedScheduleEntry,
  teacherId:string,
):boolean {
  const day=dateDay(date)
  if(!day||day!==entry.day||teacherId===entry.teacherId)return false
  const teacher=project.teachers.find(item=>item.id===teacherId&&item.active)
  const run=project.establishedScheduleRun
  if(!teacher||!run)return false
  if(teacherIsUnavailable(project,teacherId,{day,sessionId:entry.sessionId}))return false
  if(run.entries.some(other=>other.teacherId===teacherId&&other.day===day&&other.sessionId===entry.sessionId))return false
  if((project.substitutionRecords??[]).some(record=>record.date===date&&record.sessionId===entry.sessionId
    &&record.substituteTeacherId===teacherId))return false
  if(project.temporaryChanges.some(change=>change.active&&change.kind==='absence'
    &&change.teacherId===teacherId&&date>=change.startDate&&date<=change.endDate))return false
  return true
}

export function coverageOptions(project:ViyeuticaProject,date:string,entry:GeneratedScheduleEntry):EntryOption[]{
  const run=project.establishedScheduleRun
  if(!run)return []
  const codocents=run.entries.filter(other=>
    other.id!==entry.id&&other.day===entry.day&&other.sessionId===entry.sessionId
    &&other.groupId===entry.groupId&&other.teacherId!==entry.teacherId
    &&project.assignments.some(a=>a.id===other.assignmentId&&(a.assignmentType==='co_teaching'||a.assignmentType==='main'))
  )
  const retained=codocents
    .filter(item=>project.teachers.some(t=>t.id===item.teacherId&&t.active)
      &&!teacherIsUnavailable(project,item.teacherId,{day:entry.day,sessionId:entry.sessionId}))
    .map(item=>({id:'co:'+item.teacherId,label:'Codocente existente: '+(project.teachers.find(t=>t.id===item.teacherId)?.name??item.teacherId),kind:'co_teacher' as const}))
  const substitutes=project.teachers.filter(t=>isSubstituteEligible(project,date,entry,t.id))
    .map(t=>({id:'sub:'+t.id,label:t.name,kind:'substitute' as const}))
  return [...retained,...substitutes]
}

function byName(project:ViyeuticaProject,teacherId:string){
  return project.teachers.find(t=>t.id===teacherId)?.name??'Docente ya no disponible'
}
function byGroup(project:ViyeuticaProject,groupId:string){
  return project.groups.find(g=>g.id===groupId)?.name??'Grupo no disponible'
}

export function SessionSubstitutionRegister({project}:{project:ViyeuticaProject}){
  const initialDate=new Date().toLocaleDateString('sv-SE')
  const [date,setDate]=useState(initialDate)
  const [absentTeacherId,setAbsentTeacherId]=useState('')
  const [selectedEntryIds,setSelectedEntryIds]=useState<string[]>([])
  const [choices,setChoices]=useState<Record<string,string>>({})
  const [notes,setNotes]=useState('')
  const [error,setError]=useState('')
  const [editing,setEditing]=useState(false)
  const [pendingDelete,setPendingDelete]=useState<string|null>(null)
  const [historyFilter,setHistoryFilter]=useState('')
  const [historyDate,setHistoryDate]=useState('')

  const run=project.establishedScheduleRun
  const day=dateDay(date)
  const blocks=project.schedule.blocks.filter(block=>block.active)
  const lessonEntries=useMemo(()=>run&&day?run.entries
    .filter(entry=>entry.day===day&&entry.teacherId===absentTeacherId)
    .sort((a,b)=>blocks.findIndex(block=>block.id===a.sessionId)-blocks.findIndex(block=>block.id===b.sessionId)):[],
    [run,day,absentTeacherId,blocks])
  const records=project.substitutionRecords??[]
  const existingFor=(entry:GeneratedScheduleEntry)=>records.find(record=>
    record.date===date&&record.sessionId===entry.sessionId
    &&record.absentTeacherId===entry.teacherId&&record.groupId===entry.groupId&&record.assignmentId===entry.assignmentId)
  const selectable=lessonEntries.filter(entry=>!existingFor(entry))
  const selected=selectable.filter(entry=>selectedEntryIds.includes(entry.id))
  const allReady=selected.length>0
    &&selected.every(entry=>coverageOptions(project,date,entry).some(option=>option.id===choices[entry.id]))
    &&new Set(selected.map(entry=>entry.sessionId+'|'+choices[entry.id])).size===selected.length
    &&Boolean(day&&project.schedule.activeDays.includes(day))
  const history=records.filter(record=>
    (!historyFilter||record.substituteTeacherId===historyFilter||record.absentTeacherId===historyFilter)
    &&(!historyDate||record.date===historyDate))
    .sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt))
  const counts=project.teachers.filter(teacher=>teacher.active).map(teacher=>({
    id:teacher.id,name:teacher.name,
    completed:records.filter(r=>r.substituteTeacherId===teacher.id&&r.status==='completed').length,
    planned:records.filter(r=>r.substituteTeacherId===teacher.id&&r.status==='planned').length,
  })).sort((a,b)=>a.completed-b.completed||a.name.localeCompare(b.name,'es'))

  const save=()=>{
    if(!run||!day||!allReady){setError('Selecciona una sesión y un responsable válido para cada cobertura.');return}
    const additions:SubstitutionRecord[]=selected.map(entry=>{
      const option=coverageOptions(project,date,entry).find(item=>item.id===choices[entry.id])!
      return {id:id(),date,sessionId:entry.sessionId,absentTeacherId,groupId:entry.groupId,
        assignmentId:entry.assignmentId,substituteTeacherId:option.id.slice(option.id.indexOf(':')+1),
        coverageType:option.kind,status:'planned',notes:notes.trim(),createdAt:new Date().toISOString(),completedAt:null}
    })
    saveProject({...project,substitutionRecords:[...records,...additions]},{intent:'replace_project'})
    setEditing(false);setSelectedEntryIds([]);setChoices({});setNotes('');setError('')
  }
  const markCompleted=(record:SubstitutionRecord)=>{
    saveProject({...project,substitutionRecords:records.map(item=>item.id===record.id
      ? {...item,status:'completed' as const,completedAt:new Date().toISOString()}:item)},{intent:'replace_project'})
  }
  const remove=(recordId:string)=>{
    saveProject({...project,substitutionRecords:records.filter(item=>item.id!==recordId)},{intent:'replace_project'})
    setPendingDelete(null)
  }
  const changeDate=(value:string)=>{setDate(value);setSelectedEntryIds([]);setChoices({});setError('')}
  const changeAbsent=(value:string)=>{setAbsentTeacherId(value);setSelectedEntryIds([]);setChoices({});setError('')}

  return <section className="panel" aria-label="Registro de sustituciones por sesión">
    <div className="groups-table-heading">
      <div><span className="panel-kicker">Cobertura de ausencias</span><h2>Registro por fecha y sesión</h2>
        <p>Planifica cada sustitución de una jornada completa o de sesiones concretas. El horario establecido no se modifica.</p></div>
      <button className="btn primary" type="button" disabled={!run} onClick={()=>setEditing(true)}><Plus size={16}/> Registrar ausencia</button>
    </div>
    {!run&&<p>Para registrar sustituciones, primero establece un horario válido en Horarios.</p>}
    <div className="structure-summary">
      <article className="structure-summary-card"><span>Previstas</span><strong>{records.filter(r=>r.status==='planned').length}</strong><small>pendientes de confirmar</small></article>
      <article className="structure-summary-card"><span>Realizadas</span><strong>{records.filter(r=>r.status==='completed').length}</strong><small>contabilizadas en el histórico</small></article>
    </div>
    {editing&&<AppModal title="Registrar ausencia y coberturas" icon={<CalendarDays size={19}/>} onClose={()=>setEditing(false)} wide footer={<>
      <button type="button" className="btn ghost-inline" onClick={()=>setEditing(false)}>Cancelar</button>
      <button type="button" className="btn primary" onClick={save} disabled={!allReady}>Guardar coberturas previstas</button>
    </>}>
      <div className="form-grid two">
        <label className="form-field"><span>Fecha de la ausencia</span><input type="date" value={date} onChange={e=>changeDate(e.target.value)}/></label>
        <label className="form-field"><span>Docente ausente</span><select value={absentTeacherId} onChange={e=>changeAbsent(e.target.value)}>
          <option value="">Selecciona...</option>{project.teachers.filter(t=>t.active).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select></label>
      </div>
      {!day&&<p className="inline-error">Selecciona una fecha lectiva de lunes a sábado.</p>}
      {day&&!project.schedule.activeDays.includes(day)&&<p className="inline-error">El {dayName[day].toLowerCase()} no forma parte de la jornada configurada.</p>}
      {absentTeacherId&&day&&<div className="groups-table-wrap">
        <p><strong>{dayName[day]}:</strong> marca todas las clases del día o únicamente las sesiones afectadas. Cada sesión permite escoger un sustituto distinto.</p>
        <table className="groups-table"><thead><tr><th scope="col">Cubrir</th><th scope="col">Franja y grupo</th><th scope="col">Codocencia / sustituto</th></tr></thead><tbody>
          {lessonEntries.map(entry=>{
            const block=blocks.find(item=>item.id===entry.sessionId)
            const already=existingFor(entry)
            const options=coverageOptions(project,date,entry)
            const checked=selectedEntryIds.includes(entry.id)
            return <tr key={entry.id}>
              <td><input type="checkbox" checked={checked} disabled={Boolean(already)} onChange={e=>setSelectedEntryIds(current=>e.target.checked?[...current,entry.id]:current.filter(item=>item!==entry.id))}/></td>
              <td><strong>{block?.label??entry.sessionId}</strong> · {block?.start}–{block?.end}<small style={{display:'block'}}>{byGroup(project,entry.groupId)} · {project.subjects.find(s=>s.id===entry.subjectId)?.name??'Materia'}</small></td>
              <td>{already?<span>Ya registrada: {byName(project,already.substituteTeacherId)}</span>
                :<select aria-label={'Responsable de '+(block?.label??entry.sessionId)+' para '+byGroup(project,entry.groupId)} disabled={!checked} value={choices[entry.id]??''} onChange={e=>setChoices(current=>({...current,[entry.id]:e.target.value}))}>
                  <option value="">Selecciona responsable...</option>
                  {options.map(opt=><option key={opt.id} value={opt.id}>{opt.label}</option>)}
                </select>}
                {!options.length&&!already&&<small style={{display:'block'}}>Sin docentes compatibles; revisa el horario o las disponibilidades.</small>}
              </td>
            </tr>
          })}
        </tbody></table>
        {!lessonEntries.length&&<p>Este docente no tiene clases asignadas en la fecha elegida. No se generan coberturas ficticias.</p>}
      </div>}
      <label className="form-field"><span>Observaciones de la ausencia</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional"/></label>
      {error&&<p className="inline-error">{error}</p>}
    </AppModal>}
    <div className="groups-table-heading"><div><span className="panel-kicker">Trazabilidad</span><h2>Historial de coberturas</h2><p>Solo las confirmadas como realizadas se acumulan en el contador.</p></div></div>
    <div className="form-grid two">
      <label className="form-field"><span>Filtrar por docente</span><select value={historyFilter} onChange={e=>setHistoryFilter(e.target.value)}><option value="">Todos</option>{project.teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="form-field"><span>Filtrar por fecha</span><input type="date" value={historyDate} onChange={e=>setHistoryDate(e.target.value)}/></label>
    </div>
    <div className="groups-table-wrap">
      <table className="groups-table"><thead><tr><th>Fecha</th><th>Sesión</th><th>Ausente</th><th>Responsable</th><th>Grupo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        {history.map(record=><tr key={record.id}>
          <td>{record.date}</td><td>{project.schedule.blocks.find(b=>b.id===record.sessionId)?.label??record.sessionId}</td>
          <td>{byName(project,record.absentTeacherId)}</td>
          <td>{byName(project,record.substituteTeacherId)}{record.coverageType==='co_teacher'?' · Codocente':''}</td>
          <td>{byGroup(project,record.groupId)}</td><td>{record.status==='completed'?'Realizada':'Prevista'}</td>
          <td>{record.status==='planned'&&<button type="button" className="btn ghost-inline" onClick={()=>markCompleted(record)} title="Confirmar que se realizó"><CheckCircle2 size={15}/> Confirmar</button>}
            <button type="button" className="row-delete" title="Eliminar registro" onClick={()=>setPendingDelete(record.id)}><Trash2 size={15}/></button></td>
        </tr>)}
      </tbody></table>
      {!history.length&&<p>No hay coberturas que coincidan con los filtros.</p>}
    </div>
    <div className="groups-table-heading"><div><span className="panel-kicker">Reparto</span><h2>Sustituciones por docente</h2></div></div>
    <div className="groups-table-wrap"><table className="groups-table"><thead><tr><th>Docente</th><th>Realizadas</th><th>Previstas</th></tr></thead><tbody>
      {counts.map(item=><tr key={item.id}><td>{item.name}</td><td>{item.completed}</td><td>{item.planned}</td></tr>)}
    </tbody></table></div>
    {pendingDelete&&<AppModal title="Eliminar registro de sustitución" icon={<ClipboardList size={19}/>} onClose={()=>setPendingDelete(null)} footer={<>
      <button type="button" className="btn ghost-inline" onClick={()=>setPendingDelete(null)}>Cancelar</button>
      <button type="button" className="btn primary" onClick={()=>remove(pendingDelete)}>Eliminar registro</button>
    </>}><p>Se eliminará esta cobertura del historial y del contador correspondiente. El horario oficial no cambia.</p></AppModal>}
  </section>
}
