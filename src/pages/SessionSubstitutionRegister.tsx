import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ClipboardList, UserRoundPlus, Trash2 } from 'lucide-react'
import { AppModal } from '../components/AppModal'
import { saveProject } from '../store/projectStorage'
import type { GeneratedScheduleEntry, SubstitutionRecord, ViyeuticaProject, Weekday } from '../domain/project'
import { teacherIsUnavailable } from '../domain/validationEngine'
import { affectedSubstitutions, confirmSubstitution, coverageState, eligibleReplacement, isTeacherAbsent, reassignSubstitution, registerTeacherAbsence } from '../domain/substitutionCoverage'
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

function recordsForDate(project:ViyeuticaProject,date:string){
  return (project.substitutionRecords??[]).filter(record=>record.date===date)
}

type EntryOption={id:string;label:string;kind:'substitute'|'co_teacher'}

export function isSubstituteEligible(
  project:ViyeuticaProject,
  date:string,
  entry:GeneratedScheduleEntry,
  teacherId:string,
  excludeRecordId?:string,
):boolean {
  const day=dateDay(date)
  if(!day||day!==entry.day||teacherId===entry.teacherId)return false
  const teacher=project.teachers.find(item=>item.id===teacherId&&item.active)
  const run=project.establishedScheduleRun
  if(!teacher||!run)return false
  if(teacherIsUnavailable(project,teacherId,{day,sessionId:entry.sessionId})||isTeacherAbsent(project,teacherId,date,entry.sessionId))return false
  if(run.entries.some(other=>other.teacherId===teacherId&&other.day===day&&other.sessionId===entry.sessionId))return false
  if((project.substitutionRecords??[]).some(record=>record.id!==excludeRecordId&&record.date===date&&record.sessionId===entry.sessionId
    &&record.substituteTeacherId===teacherId&&coverageState(project,record)!=='needs_reassignment'))return false
  return true
}

export function coverageOptions(project:ViyeuticaProject,date:string,entry:GeneratedScheduleEntry,excludeRecordId?:string):EntryOption[]{
  const run=project.establishedScheduleRun
  if(!run)return []
  const codocents=run.entries.filter(other=>
    other.id!==entry.id&&other.day===entry.day&&other.sessionId===entry.sessionId
    &&other.groupId===entry.groupId&&other.teacherId!==entry.teacherId
    &&project.assignments.some(a=>a.id===other.assignmentId&&(a.assignmentType==='co_teaching'||a.assignmentType==='main'))
  )
  const retained=codocents
    .filter(item=>project.teachers.some(t=>t.id===item.teacherId&&t.active)
      &&!teacherIsUnavailable(project,item.teacherId,{day:entry.day,sessionId:entry.sessionId})
      &&!isTeacherAbsent(project,item.teacherId,date,entry.sessionId)
      &&!(project.substitutionRecords??[]).some(record=>record.id!==excludeRecordId
        &&record.date===date&&record.sessionId===entry.sessionId
        &&record.substituteTeacherId===item.teacherId
        &&coverageState(project,record)!=='needs_reassignment'))
    .map(item=>({id:'co:'+item.teacherId,label:'Codocente existente: '+(project.teachers.find(t=>t.id===item.teacherId)?.name??item.teacherId),kind:'co_teacher' as const}))
  const substitutes=project.teachers.filter(t=>isSubstituteEligible(project,date,entry,t.id,excludeRecordId))
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
  const [absenceSessionIds,setAbsenceSessionIds]=useState<string[]>([])
  const [reassignmentId,setReassignmentId]=useState<string|null>(null)
  const [replacementChoice,setReplacementChoice]=useState('')
  const [reassignmentReason,setReassignmentReason]=useState('Ausencia sobrevenida')
  const [replacementPicker,setReplacementPicker]=useState(false)
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
    setAbsenceSessionIds([slotRequest.sessionId])
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
    return project.teachers.filter(t=>t.active&&(entries.some(entry=>entry.teacherId===t.id)
      ||recordsForDate(project,date).some(record=>record.substituteTeacherId===t.id
        &&(!initialSessionId||record.sessionId===initialSessionId))))
      .sort((a,b)=>a.name.localeCompare(b.name,'es'))
  },[project,dayEntries,date,initialSessionId])
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
  const planned=records.filter(r=>coverageState(project,r)==='planned').length
  const pending=records.filter(r=>coverageState(project,r)==='needs_reassignment').length
  const historicalConflicts=records.filter(r=>coverageState(project,r)==='review_completed')
  const unresolved=records.filter(r=>coverageState(project,r)==='needs_reassignment')
  const affected=absentTeacherId?affectedSubstitutions(project,absentTeacherId,date,absenceSessionIds):[]
  const counts=project.teachers.filter(t=>t.active||records.some(r=>r.substituteTeacherId===t.id)).map(teacher=>({
    id:teacher.id,name:teacher.name,
    completed:records.filter(r=>r.substituteTeacherId===teacher.id&&r.status==='completed').length,
    planned:records.filter(r=>r.substituteTeacherId===teacher.id&&coverageState(project,r)==='planned').length,
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
  const reassigning=records.find(record=>record.id===reassignmentId)
  const replacementDay=reassigning?dateDay(reassigning.date):null
  const replacementOptions:EntryOption[]=reassigning?project.teachers.filter(t=>t.active).flatMap(t=>{
    const options:EntryOption[]=[]
    if(eligibleReplacement(project,reassigning,t.id,'co_teacher'))
      options.push({id:'co:'+t.id,label:'Codocente existente: '+t.name,kind:'co_teacher'})
    if(eligibleReplacement(project,reassigning,t.id,'substitute'))
      options.push({id:'sub:'+t.id,label:t.name,kind:'substitute'})
    return options
  }):[]
  const replacementMap=Object.fromEntries(replacementOptions.map(option=>[option.id.slice(3),option.id]))
  const replacementCandidates=reassigning&&replacementDay?candidatesFor(replacementDay,reassigning.sessionId):[]
  const beginReassignment=(recordId:string)=>{
    setReassignmentId(recordId);setReplacementChoice('');setReassignmentReason('Ausencia sobrevenida');setError('')
  }
  const saveReassignment=()=>{
    if(!reassigning||!replacementOptions.some(option=>option.id===replacementChoice)){
      setError('Selecciona un sustituto disponible para esta sesión.');return
    }
    try {
      const kind=replacementChoice.startsWith('co:')?'co_teacher':'substitute'
      saveProject(reassignSubstitution(project,reassigning.id,replacementChoice.slice(3),kind,reassignmentReason,new Date().toISOString()),{intent:'replace_project'})
      setReassignmentId(null);setReplacementChoice('');setError('')
    }catch(e){setError(e instanceof Error?e.message:'No se puede reasignar la cobertura.')}
  }
  const registerAbsence=()=>{
    if(!absentTeacherId||!activeDay||!absenceSessionIds.length){
      setError('Selecciona docente y al menos una sesión de ausencia.');return
    }
    try{
      const next=registerTeacherAbsence(project,{
        id:'absence_'+crypto.randomUUID(),date,teacherId:absentTeacherId,
        sessionIds:absenceSessionIds,notes:notes.trim(),createdAt:new Date().toISOString(),
      })
      saveProject(next,{intent:'replace_project'})
      closeEditor();setAbsenceSessionIds([]);setNotes('')
    }catch(e){setError(e instanceof Error?e.message:'No se pudo registrar la ausencia.')}
  }

  const changeDate=(next:string)=>{
    setDate(next);setAbsentTeacherId('');setSelectedEntryIds([]);setAbsenceSessionIds(initialSessionId?[initialSessionId]:[]);setChoices({});setError('')
  }
  const changeAbsent=(teacherId:string)=>{
    setAbsentTeacherId(teacherId)
    setAbsenceSessionIds(initialSessionId?[initialSessionId]:[])
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
    const absentSessionIds=[...new Set([...absenceSessionIds,...additions.map(record=>record.sessionId)])]
    const next=registerTeacherAbsence(project,{id:'absence_'+crypto.randomUUID(),date,teacherId:absentTeacherId,
      sessionIds:absentSessionIds,notes:notes.trim(),createdAt:new Date().toISOString()})
    saveProject({...next,substitutionRecords:[...next.substitutionRecords,...additions]},{intent:'replace_project'})
    closeEditor();setAbsentTeacherId('');setSelectedEntryIds([]);setChoices({});setNotes('')
  }
  const confirm=(record:SubstitutionRecord)=>{
    try{saveProject(confirmSubstitution(project,record.id,new Date().toISOString()),{intent:'replace_project'})}
    catch(e){setError(e instanceof Error?e.message:'No se puede confirmar.')}
  }
  const remove=(recordId:string)=>{
    saveProject({...project,substitutionRecords:records.filter(item=>item.id!==recordId)},{intent:'replace_project'})
    setPendingDelete(null)
  }

  return <>
    {(unresolved.length>0||historicalConflicts.length>0)&&<section className="panel substitution-conflict-panel">
      <div className="groups-table-heading"><div><span className="panel-kicker">Incidencias de cobertura</span>
        <h2><AlertTriangle size={17}/> {unresolved.length} pendientes de reasignación</h2>
        <p>Las coberturas asignadas a docentes ausentes no se consideran atendidas hasta su corrección.</p>
      </div></div>
      {unresolved.map(record=><div key={record.id} className="substitution-conflict-row">
        <span>{record.date} · {blocks.find(b=>b.id===record.sessionId)?.label??record.sessionId} · {byGroup(project,record.groupId)}</span>
        <strong>{byName(project,record.absentTeacherId)} → {byName(project,record.substituteTeacherId)} (ausente)</strong>
        <button type="button" className="btn primary" onClick={()=>beginReassignment(record.id)}>Reasignar</button>
      </div>)}
      {historicalConflicts.map(record=><p className="substitution-warning-note" key={record.id}>
        Revisar histórico: {record.date} · {byName(project,record.substituteTeacherId)} figura ausente en una sustitución ya confirmada. No se modifica automáticamente.
      </p>)}
    </section>}
    <details className="panel substitution-register-section" open>
      <summary className="groups-table-heading substitution-section-summary">
        <div><span className="panel-kicker">Reparto</span><h2>Sustituciones por docente</h2><p>Solo las coberturas confirmadas se suman al contador de realizadas.</p></div>
        <div className="substitution-summary-actions"><div className="substitution-counter-summary"><span>{completed} realizadas</span><span>{planned} previstas</span><span>{pending} pendientes</span></div><ChevronDown size={18} className="substitution-section-chevron" aria-hidden="true"/></div>
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
        <td>{byName(project,record.substituteTeacherId)}{record.coverageType==='co_teacher'?' · Codocente':''}
          {Boolean(record.reassignmentHistory?.length)&&<details className="substitution-history-changes"><summary>Ver reasignaciones ({record.reassignmentHistory?.length})</summary>
            {record.reassignmentHistory?.map((item,index)=><p key={index}>{byName(project,item.previousTeacherId)} → {byName(project,item.newTeacherId)}
              <small> · {item.changedAt.slice(0,16)} · {item.reason}</small></p>)}
          </details>}</td>
        <td>{byGroup(project,record.groupId)}</td>
        <td><span className={'substitution-coverage-status '+coverageState(project,record)}>
          {coverageState(project,record)==='needs_reassignment'?'Pendiente de reasignación'
            :coverageState(project,record)==='review_completed'?'Revisar histórico'
            :coverageState(project,record)==='completed'?'Realizada':'Prevista'}</span></td>
        <td><div className="substitution-history-actions">
          {coverageState(project,record)==='needs_reassignment'&&<button type="button" className="btn ghost-inline" onClick={()=>beginReassignment(record.id)}>Reasignar</button>}
          {coverageState(project,record)==='planned'&&<button type="button" className="btn ghost-inline" onClick={()=>confirm(record)} title="Confirmar realización"><CheckCircle2 size={15}/> Confirmar</button>}
          <button type="button" className="row-delete" onClick={()=>setPendingDelete(record.id)} title="Eliminar registro"><Trash2 size={15}/></button>
        </div></td>
      </tr>)}</tbody></table>
        {!history.length&&<p className="substitutions-empty">No hay sustituciones registradas con estos filtros.</p>}
      </div>
    </details>

    {editing&&<AppModal title="Registrar ausencia y coberturas" icon={<CalendarDays size={19}/>} onClose={closeEditor} wide footer={<>
      <button type="button" className="btn ghost-inline" onClick={closeEditor}>Cancelar</button>
      <button type="button" className="btn ghost-inline" disabled={!activeDay||!absentTeacherId||!absenceSessionIds.length} onClick={registerAbsence}>Registrar ausencia sin cobertura</button>
      <button type="button" className="btn primary" disabled={!ready} onClick={save}>Guardar coberturas previstas</button>
    </>}>
      <div className="form-grid two">
        <label className="form-field"><span>Fecha de la ausencia</span><input type="date" value={date} onChange={e=>changeDate(e.target.value)}/></label>
        <label className="form-field"><span>Docente ausente</span><select value={absentTeacherId} onChange={e=>changeAbsent(e.target.value)} disabled={!activeDay}>
          <option value="">Selecciona docente...</option>{teachersInSession.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}
        </select></label>
      </div>
      {!activeDay&&<p className="inline-error">La fecha seleccionada no es un día lectivo configurado.</p>}
      {absentTeacherId&&activeDay&&<section className="substitution-absence-scope">
        <div className="substitution-absence-heading"><strong>Sesiones afectadas por la ausencia</strong>
          <button type="button" className="btn ghost-inline" onClick={()=>setAbsenceSessionIds(blocks.filter(b=>b.type==='teaching').map(b=>b.id))}>Todas las sesiones</button>
        </div>
        <div className="substitution-absence-sessions">{blocks.filter(b=>b.type==='teaching').map(block=><label key={block.id}>
          <input type="checkbox" checked={absenceSessionIds.includes(block.id)} onChange={e=>setAbsenceSessionIds(previous=>
            e.target.checked?[...new Set([...previous,block.id])]:previous.filter(id=>id!==block.id))}/>
          {block.label} · {block.start}–{block.end}
        </label>)}</div>
        {affected.length>0&&<p className="substitution-warning-note"><AlertTriangle size={15}/> {affected.length} {affected.length===1?'cobertura asignada':'coberturas asignadas'} a este docente requieren revisión.</p>}
        <p className="substitutions-help">Puedes registrar la ausencia sin asignar nuevas coberturas. Las sustituciones que ya tenía este docente quedarán pendientes de reasignación.</p>
      </section>}

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
    {reassigning&&<AppModal title="Reasignar cobertura pendiente" icon={<AlertTriangle size={19}/>} onClose={()=>setReassignmentId(null)}
      footer={<><button type="button" className="btn ghost-inline" onClick={()=>setReassignmentId(null)}>Cancelar</button>
        <button type="button" className="btn primary" disabled={!replacementOptions.some(o=>o.id===replacementChoice)} onClick={saveReassignment}>Guardar reasignación</button></>}>
      <p><strong>{reassigning.date}</strong> · {blocks.find(b=>b.id===reassigning.sessionId)?.label??reassigning.sessionId}
        · {byGroup(project,reassigning.groupId)}</p>
      <p>Docente ausente: <strong>{byName(project,reassigning.absentTeacherId)}</strong>. Responsable anterior:
        <strong> {byName(project,reassigning.substituteTeacherId)}</strong>.</p>
      <div className="substitution-picker-field"><button type="button" className="btn ghost-inline" onClick={()=>setReplacementPicker(true)}>
        <UserRoundPlus size={17}/> Elegir nuevo responsable</button>
        <strong>{replacementOptions.find(o=>o.id===replacementChoice)?.label??'Sin seleccionar'}</strong></div>
      <label className="form-field"><span>Motivo de reasignación</span><input value={reassignmentReason} onChange={e=>setReassignmentReason(e.target.value)}/></label>
      {!replacementOptions.length&&<p className="inline-error">No existen docentes compatibles. La cobertura permanece pendiente hasta resolver la disponibilidad.</p>}
      {error&&<p className="inline-error" role="alert">{error}</p>}
    </AppModal>}
    {reassigning&&replacementPicker&&<SubstitutionTeacherDialog
      title={'Reasignar · '+(blocks.find(b=>b.id===reassigning.sessionId)?.label??reassigning.sessionId)}
      time={(blocks.find(b=>b.id===reassigning.sessionId)?.start??'')+'–'+(blocks.find(b=>b.id===reassigning.sessionId)?.end??'')}
      candidates={replacementCandidates} choices={replacementMap} selectedId={replacementChoice}
      onClose={()=>setReplacementPicker(false)}
      onSelect={choice=>{setReplacementChoice(choice);setReplacementPicker(false)}}
    />}
    {pendingDelete&&<AppModal title="Eliminar registro de sustitución" icon={<ClipboardList size={19}/>} onClose={()=>setPendingDelete(null)}
      footer={<><button type="button" className="btn ghost-inline" onClick={()=>setPendingDelete(null)}>Cancelar</button>
      <button type="button" className="btn primary" onClick={()=>remove(pendingDelete)}>Eliminar registro</button></>}>
      <p>Se eliminará este registro del historial y del contador correspondiente. No modifica el horario oficial.</p>
    </AppModal>}
  </>
}
