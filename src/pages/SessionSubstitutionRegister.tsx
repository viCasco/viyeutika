import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, ChevronDown, ClipboardList, UserRoundPlus, Trash2 } from 'lucide-react'
import { AppModal } from '../components/AppModal'
import { saveProject } from '../store/projectStorage'
import type { GeneratedScheduleEntry, SubstitutionRecord, ViyeuticaProject, Weekday } from '../domain/project'
import { teacherIsUnavailable } from '../domain/validationEngine'
import { SortableTh, sortCollection, type SortState } from '../components/DataCollectionView'
import { SubstitutionTeacherDialog, type CandidateDetail } from './SubstitutionTeacherDialog'

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


export interface SubstitutionSlotRequest {
  day:Weekday
  sessionId:string
  requestId:number
}

export function dateForWeekday(day:Weekday,today:Date=new Date()):string{
  const current=new Date(today.getFullYear(),today.getMonth(),today.getDate(),12)
  const target=weekdays.indexOf(day)+1
  const diff=(target-current.getDay()+7)%7
  current.setDate(current.getDate()+diff)
  return [current.getFullYear(),String(current.getMonth()+1).padStart(2,'0'),String(current.getDate()).padStart(2,'0')].join('-')
}

function localToday(){
  const today=new Date()
  return [today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-')
}

export function SessionSubstitutionRegister({
  project,slotRequest,candidatesFor,
}:{
  project:ViyeuticaProject
  slotRequest:SubstitutionSlotRequest|null
  candidatesFor:(day:Weekday,sessionId:string)=>CandidateDetail[]
}){
  const [date,setDate]=useState(localToday)
  const [initialSessionId,setInitialSessionId]=useState<string|null>(null)
  const [absentTeacherId,setAbsentTeacherId]=useState('')
  const [selectedEntryIds,setSelectedEntryIds]=useState<string[]>([])
  const [choices,setChoices]=useState<Record<string,string>>({})
  const [notes,setNotes]=useState('')
  const [error,setError]=useState('')
  const [editing,setEditing]=useState(false)
  const [choosingEntryId,setChoosingEntryId]=useState<string|null>(null)
  const [pendingDelete,setPendingDelete]=useState<string|null>(null)
  const [historyFilter,setHistoryFilter]=useState('')
  const [historyDate,setHistoryDate]=useState('')
  const [countFilter,setCountFilter]=useState('')
  const [countSort,setCountSort]=useState<SortState<'name'|'completed'|'planned'>>({key:'completed',direction:'asc'})

  useEffect(()=>{
    if(!slotRequest)return
    setDate(dateForWeekday(slotRequest.day))
    setInitialSessionId(slotRequest.sessionId)
    setAbsentTeacherId('')
    setSelectedEntryIds([])
    setChoices({})
    setNotes('')
    setError('')
    setChoosingEntryId(null)
    setEditing(true)
  },[slotRequest?.requestId])

  const run=project.establishedScheduleRun
  const day=dateDay(date)
  const activeDay=Boolean(day&&project.schedule.activeDays.includes(day))
  const blocks=project.schedule.blocks.filter(block=>block.active)
  const dayEntries=useMemo(()=>run&&day&&activeDay
    ?run.entries.filter(entry=>entry.day===day)
    :[],[run,day,activeDay])
  const teachersInSession=useMemo(()=>{
    const entries=initialSessionId?dayEntries.filter(entry=>entry.sessionId===initialSessionId):dayEntries
    return project.teachers.filter(t=>t.active&&entries.some(entry=>entry.teacherId===t.id))
      .sort((a,b)=>a.name.localeCompare(b.name,'es'))
  },[project.teachers,dayEntries,initialSessionId])
  const lessonEntries=useMemo(()=>dayEntries.filter(entry=>entry.teacherId===absentTeacherId)
    .sort((a,b)=>blocks.findIndex(block=>block.id===a.sessionId)-blocks.findIndex(block=>block.id===b.sessionId)),
    [dayEntries,absentTeacherId,blocks])
  const records=project.substitutionRecords??[]
  const existingFor=(entry:GeneratedScheduleEntry)=>records.find(record=>
    record.date===date&&record.sessionId===entry.sessionId
    &&record.absentTeacherId===entry.teacherId&&record.groupId===entry.groupId&&record.assignmentId===entry.assignmentId)
  const selectable=lessonEntries.filter(entry=>!existingFor(entry))
  const selected=selectable.filter(entry=>selectedEntryIds.includes(entry.id))
  const ready=selected.length>0&&Boolean(activeDay)
    &&selected.every(entry=>coverageOptions(project,date,entry).some(opt=>opt.id===choices[entry.id]))
    &&new Set(selected.map(entry=>entry.sessionId+'|'+choices[entry.id])).size===selected.length

  const completed=records.filter(r=>r.status==='completed').length
  const planned=records.filter(r=>r.status==='planned').length
  const counts=project.teachers.filter(t=>t.active||records.some(r=>r.substituteTeacherId===t.id)).map(teacher=>({
    id:teacher.id,name:teacher.name,
    completed:records.filter(r=>r.substituteTeacherId===teacher.id&&r.status==='completed').length,
    planned:records.filter(r=>r.substituteTeacherId===teacher.id&&r.status==='planned').length,
  }))
  const sortedCounts=sortCollection(counts.filter(t=>!countFilter||t.id===countFilter),countSort,(row,key)=>row[key])
  const history=records.filter(record=>
    (!historyFilter||record.substituteTeacherId===historyFilter||record.absentTeacherId===historyFilter)
    &&(!historyDate||record.date===historyDate))
    .sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt))
  const choosing=lessonEntries.find(e=>e.id===choosingEntryId)
  const choosingOptions=choosing?coverageOptions(project,date,choosing):[]
  const choiceMap=Object.fromEntries(choosingOptions.map(opt=>[opt.id.split(':')[1],opt.id]))
  const pickerCandidates=choosing?candidatesFor(choosing.day,choosing.sessionId):[]
  const selectedTeacherNames=project.teachers.filter(t=>t.active).sort((a,b)=>a.name.localeCompare(b.name,'es'))

  const changeDate=(next:string)=>{
    setDate(next);setAbsentTeacherId('');setSelectedEntryIds([]);setChoices({});setError('')
  }
  const changeAbsent=(teacherId:string)=>{
    setAbsentTeacherId(teacherId)
    const entries=dayEntries.filter(e=>e.teacherId===teacherId&&(!initialSessionId||e.sessionId===initialSessionId))
    setSelectedEntryIds(entries.length?entries.map(e=>e.id):[])
    setChoices({})
    setError('')
  }
  const closeEditor=()=>{setEditing(false);setChoosingEntryId(null);setError('')}
  const save=()=>{
    if(!run||!day||!ready){setError('Selecciona sesiones y responsables compatibles.');return}
    const additions:SubstitutionRecord[]=selected.map(entry=>{
      const opt=coverageOptions(project,date,entry).find(o=>o.id===choices[entry.id])!
      return {id:id(),date,sessionId:entry.sessionId,absentTeacherId,groupId:entry.groupId,
        assignmentId:entry.assignmentId,substituteTeacherId:opt.id.split(':')[1],
        coverageType:opt.kind,status:'planned',notes:notes.trim(),createdAt:new Date().toISOString(),completedAt:null}
    })
    saveProject({...project,substitutionRecords:[...records,...additions]},{intent:'replace_project'})
    closeEditor();setAbsentTeacherId('');setSelectedEntryIds([]);setChoices({});setNotes('')
  }
  const confirm=(record:SubstitutionRecord)=>saveProject({...project,substitutionRecords:records.map(item=>
    item.id===record.id?{...item,status:'completed' as const,completedAt:new Date().toISOString()}:item
  )},{intent:'replace_project'})
  const remove=(recordId:string)=>{
    saveProject({...project,substitutionRecords:records.filter(item=>item.id!==recordId)},{intent:'replace_project'})
    setPendingDelete(null)
  }

  return <>
    <details className="panel substitution-register-section" open>
      <summary className="groups-table-heading substitution-section-summary">
        <div><span className="panel-kicker">Reparto</span><h2>Sustituciones por docente</h2><p>Solo las coberturas confirmadas se suman al contador de realizadas.</p></div>
        <div className="substitution-summary-actions"><div className="substitution-counter-summary"><span>{completed} realizadas</span><span>{planned} previstas</span></div><ChevronDown size={18} className="substitution-section-chevron" aria-hidden="true"/></div>
      </summary>
      <div className="list-filter-tags" aria-label="Filtrar reparto por docente">
        <button type="button" className={!countFilter?'active':''} onClick={()=>setCountFilter('')}>Todos</button>
        {selectedTeacherNames.map(t=><button type="button" className={countFilter===t.id?'active':''} key={t.id} onClick={()=>setCountFilter(t.id)}>{t.name}</button>)}
      </div>
      <div className="groups-table-wrap"><table className="groups-table">
        <thead><tr>
          <SortableTh label="Docente" sortKey="name" state={countSort} onSort={setCountSort}/>
          <SortableTh label="Realizadas" sortKey="completed" state={countSort} onSort={setCountSort}/>
          <SortableTh label="Previstas" sortKey="planned" state={countSort} onSort={setCountSort}/>
        </tr></thead>
        <tbody>{sortedCounts.map(row=><tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.completed}</td><td>{row.planned}</td></tr>)}</tbody>
      </table></div>
    </details>
    <details className="panel substitution-register-section" open>
      <summary className="groups-table-heading substitution-section-summary">
        <div><span className="panel-kicker">Trazabilidad</span><h2>Historial de coberturas</h2><p>Fecha, sesión, ausente, responsable y confirmación de cada sustitución.</p></div>
        <ChevronDown size={18} className="substitution-section-chevron" aria-hidden="true"/>
      </summary>
      <div className="list-filter-tags" aria-label="Filtrar historial por docente">
        <button type="button" className={!historyFilter?'active':''} onClick={()=>setHistoryFilter('')}>Todos</button>
        {selectedTeacherNames.map(t=><button type="button" className={historyFilter===t.id?'active':''} key={t.id} onClick={()=>setHistoryFilter(t.id)}>{t.name}</button>)}
      </div>
      <div className="substitution-history-date"><label className="form-field"><span>Fecha</span><input type="date" value={historyDate} onChange={e=>setHistoryDate(e.target.value)}/></label>
        {historyDate&&<button type="button" className="btn ghost-inline" onClick={()=>setHistoryDate('')}>Todas las fechas</button>}</div>
      <div className="groups-table-wrap"><table className="groups-table"><thead><tr>
        <th>Fecha</th><th>Sesión</th><th>Ausente</th><th>Responsable</th><th>Grupo</th><th>Estado</th><th>Acciones</th>
      </tr></thead><tbody>{history.map(record=><tr key={record.id}>
        <td>{record.date}</td>
        <td>{project.schedule.blocks.find(b=>b.id===record.sessionId)?.label??record.sessionId}</td>
        <td>{byName(project,record.absentTeacherId)}</td>
        <td>{byName(project,record.substituteTeacherId)}{record.coverageType==='co_teacher'?' · Codocente':''}</td>
        <td>{byGroup(project,record.groupId)}</td>
        <td>{record.status==='completed'?'Realizada':'Prevista'}</td>
        <td><div className="substitution-history-actions">
          {record.status==='planned'&&<button type="button" className="btn ghost-inline" onClick={()=>confirm(record)} title="Confirmar realización"><CheckCircle2 size={15}/> Confirmar</button>}
          <button type="button" className="row-delete" onClick={()=>setPendingDelete(record.id)} title="Eliminar registro"><Trash2 size={15}/></button>
        </div></td>
      </tr>)}</tbody></table>
        {!history.length&&<p className="substitutions-empty">No hay sustituciones registradas con estos filtros.</p>}
      </div>
    </details>

    {editing&&<AppModal title="Registrar ausencia y coberturas" icon={<CalendarDays size={19}/>} onClose={closeEditor} wide footer={<>
      <button type="button" className="btn ghost-inline" onClick={closeEditor}>Cancelar</button>
      <button type="button" className="btn primary" disabled={!ready} onClick={save}>Guardar coberturas previstas</button>
    </>}>
      <div className="form-grid two">
        <label className="form-field"><span>Fecha de la ausencia</span><input type="date" value={date} onChange={e=>changeDate(e.target.value)}/></label>
        <label className="form-field"><span>Docente ausente</span><select value={absentTeacherId} onChange={e=>changeAbsent(e.target.value)} disabled={!activeDay}>
          <option value="">Selecciona docente...</option>{teachersInSession.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}
        </select></label>
      </div>
      {!activeDay&&<p className="inline-error">La fecha seleccionada no es un día lectivo configurado.</p>}
      {activeDay&&initialSessionId&&<p className="substitutions-help">Se muestran los docentes con clase en la sesión seleccionada. Puedes elegir más sesiones del mismo docente para cubrir la jornada completa.</p>}
      {absentTeacherId&&activeDay&&<div className="groups-table-wrap">
        <p className="substitution-form-description"><strong>{day&&dayName[day]}:</strong> marca una o varias sesiones. Pulsa el icono de docentes para elegir el responsable de cada cobertura.</p>
        <table className="groups-table substitution-form-table"><thead><tr>
          <th scope="col">Cubrir</th><th scope="col">Franja y grupo</th><th scope="col">Codocencia / sustituto</th>
        </tr></thead><tbody>{lessonEntries.map(entry=>{
          const block=blocks.find(b=>b.id===entry.sessionId)
          const already=existingFor(entry)
          const checked=selectedEntryIds.includes(entry.id)
          const choice=coverageOptions(project,date,entry).find(o=>o.id===choices[entry.id])
          return <tr key={entry.id}>
            <td><input type="checkbox" aria-label={'Cubrir '+(block?.label??entry.sessionId)+' de '+byName(project,absentTeacherId)} checked={checked} disabled={Boolean(already)} onChange={e=>{
              setSelectedEntryIds(ids=>e.target.checked?[...ids,entry.id]:ids.filter(id=>id!==entry.id))
              if(!e.target.checked)setChoices(old=>{const next={...old};delete next[entry.id];return next})
            }}/></td>
            <td><strong>{block?.label??entry.sessionId}</strong> · {block?.start}–{block?.end}
              <small style={{display:'block'}}>{byGroup(project,entry.groupId)} · {project.subjects.find(s=>s.id===entry.subjectId)?.name??'Materia'}</small></td>
            <td>{already?<span className="substitution-chosen-label">Ya registrada: {byName(project,already.substituteTeacherId)}</span>:
              <div className="substitution-picker-field">
                <button type="button" className="substitution-pick-button" title="Elegir docente de cobertura" aria-label={'Elegir sustituto de '+(block?.label??entry.sessionId)} disabled={!checked}
                  onClick={()=>setChoosingEntryId(entry.id)}><UserRoundPlus size={19}/></button>
                <span className={choice?'substitution-chosen-label':'substitution-unselected'}>{choice?choice.label:'Sin elegir'}</span>
              </div>}
            </td>
          </tr>
        })}</tbody></table>
        {!lessonEntries.length&&<p className="substitutions-empty">Este docente no tiene clases en el día seleccionado.</p>}
      </div>}
      <label className="form-field"><span>Observaciones de la ausencia</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional"/></label>
      {error&&<p className="inline-error">{error}</p>}
    </AppModal>}
    {editing&&choosing&&<SubstitutionTeacherDialog
      title={(day?dayName[day]:'Sesión')+' · '+(blocks.find(b=>b.id===choosing.sessionId)?.label??choosing.sessionId)}
      time={(blocks.find(b=>b.id===choosing.sessionId)?.start??'')+'–'+(blocks.find(b=>b.id===choosing.sessionId)?.end??'')}
      candidates={pickerCandidates}
      choices={choiceMap}
      selectedId={choices[choosing.id]}
      onClose={()=>setChoosingEntryId(null)}
      onSelect={value=>{setChoices(old=>({...old,[choosing.id]:value}));setChoosingEntryId(null)}}
    />}
    {pendingDelete&&<AppModal title="Eliminar registro de sustitución" icon={<ClipboardList size={19}/>} onClose={()=>setPendingDelete(null)}
      footer={<><button type="button" className="btn ghost-inline" onClick={()=>setPendingDelete(null)}>Cancelar</button>
      <button type="button" className="btn primary" onClick={()=>remove(pendingDelete)}>Eliminar registro</button></>}>
      <p>Se eliminará este registro del historial y del contador correspondiente. No modifica el horario oficial.</p>
    </AppModal>}
  </>
}
