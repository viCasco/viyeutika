import type { GeneratedScheduleEntry, SubstitutionAbsence, SubstitutionRecord, ViyeuticaProject, Weekday } from './project'
import { teacherIsUnavailable } from './validationEngine'

const weekdays:Weekday[]=['L','M','X','J','V','S']
export function weekdayOfDate(date:string):Weekday|null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null
  const weekday=new Date(date+'T12:00:00').getDay()
  return weekday===0?null:weekdays[weekday-1]
}

export function isTeacherAbsent(project:ViyeuticaProject,teacherId:string,date:string,sessionId:string):boolean {
  if((project.substitutionAbsences??[]).some(absence=>absence.date===date
    &&absence.teacherId===teacherId&&absence.sessionIds.includes(sessionId)))return true
  return project.temporaryChanges.some(change=>change.active&&change.kind==='absence'
    &&change.teacherId===teacherId&&date>=change.startDate&&date<=change.endDate
    &&(!change.entryIds?.length||Boolean(project.establishedScheduleRun?.entries.some(entry=>
      change.entryIds!.includes(entry.id)&&entry.teacherId===teacherId
      &&entry.sessionId===sessionId&&entry.day===weekdayOfDate(date)))))
}

export type CoverageState='planned'|'completed'|'needs_reassignment'|'review_completed'
export function coverageState(project:ViyeuticaProject,record:SubstitutionRecord):CoverageState {
  const absent=isTeacherAbsent(project,record.substituteTeacherId,record.date,record.sessionId)
  if(record.status==='completed')return absent?'review_completed':'completed'
  return record.status==='needs_reassignment'||absent?'needs_reassignment':'planned'
}

export function affectedSubstitutions(project:ViyeuticaProject,teacherId:string,date:string,sessionIds:string[]){
  return (project.substitutionRecords??[]).filter(r=>r.date===date&&r.substituteTeacherId===teacherId
    &&sessionIds.includes(r.sessionId)&&coverageState(project,r)!=='needs_reassignment')
}

export function registerTeacherAbsence(project:ViyeuticaProject,args:{
  teacherId:string;date:string;sessionIds:string[];notes:string;createdAt:string;id:string
}):ViyeuticaProject {
  const unique=[...new Set(args.sessionIds)]
  if(!unique.length||!weekdayOfDate(args.date)||!project.teachers.some(t=>t.id===args.teacherId))
    throw new Error('Fecha, docente o sesiones no válidos.')
  if(unique.some(sessionId=>!project.schedule.blocks.some(b=>b.id===sessionId&&b.active&&b.type==='teaching')))
    throw new Error('La ausencia incluye sesiones no configuradas.')
  const existing=(project.substitutionAbsences??[]).find(a=>a.date===args.date&&a.teacherId===args.teacherId)
  const absences:SubstitutionAbsence[]=existing
    ? (project.substitutionAbsences??[]).map(a=>a.id===existing.id
      ? {...a,sessionIds:[...new Set([...a.sessionIds,...unique])],notes:[a.notes,args.notes].filter(Boolean).join(' · ')}:a)
    : [...(project.substitutionAbsences??[]),{...args,sessionIds:unique}]
  const records=(project.substitutionRecords??[]).map(record=>
    record.status!=='completed'&&record.date===args.date&&record.substituteTeacherId===args.teacherId
      &&unique.includes(record.sessionId)
      ? {...record,status:'needs_reassignment' as const}:record)
  return {...project,substitutionAbsences:absences,substitutionRecords:records}
}

export function eligibleReplacement(project:ViyeuticaProject,record:SubstitutionRecord,teacherId:string,coverageType:'substitute'|'co_teacher'):boolean {
  const day=weekdayOfDate(record.date)
  const run=project.establishedScheduleRun
  const teacher=project.teachers.find(t=>t.id===teacherId&&t.active)
  if(!day||!run||!teacher||teacherId===record.absentTeacherId
    ||isTeacherAbsent(project,teacherId,record.date,record.sessionId)
    ||teacherIsUnavailable(project,teacherId,{day,sessionId:record.sessionId}))return false
  const assigned=run.entries.filter(e=>e.day===day&&e.sessionId===record.sessionId&&e.teacherId===teacherId)
  if(coverageType==='co_teacher'){
    if(!assigned.some(e=>e.groupId===record.groupId))return false
  }else if(assigned.length)return false
  return !(project.substitutionRecords??[]).some(r=>r.id!==record.id&&r.date===record.date
    &&r.sessionId===record.sessionId&&r.substituteTeacherId===teacherId
    &&coverageState(project,r)!=='needs_reassignment')
}

export function reassignSubstitution(project:ViyeuticaProject,recordId:string,newTeacherId:string,
  coverageType:'substitute'|'co_teacher',reason:string,changedAt:string):ViyeuticaProject {
  const record=project.substitutionRecords.find(r=>r.id===recordId)
  if(!record||record.status==='completed')throw new Error('La cobertura no es editable.')
  if(!eligibleReplacement(project,record,newTeacherId,coverageType))throw new Error('El docente seleccionado no está disponible.')
  if(record.substituteTeacherId===newTeacherId&&record.coverageType===coverageType)throw new Error('Selecciona un responsable distinto.')
  return {...project,substitutionRecords:project.substitutionRecords.map(r=>r.id!==recordId?r:{
    ...r,substituteTeacherId:newTeacherId,coverageType,status:'planned' as const,
    reassignmentHistory:[...(r.reassignmentHistory??[]),{
      previousTeacherId:r.substituteTeacherId,newTeacherId,changedAt,reason:reason.trim()||'Reasignación por ausencia',
    }],
  })}
}

export function confirmSubstitution(project:ViyeuticaProject,recordId:string,completedAt:string):ViyeuticaProject {
  const record=project.substitutionRecords.find(r=>r.id===recordId)
  if(!record||coverageState(project,record)!=='planned')throw new Error('La cobertura necesita resolver sus incidencias antes de confirmarse.')
  return {...project,substitutionRecords:project.substitutionRecords.map(r=>r.id!==recordId?r:
    {...r,status:'completed' as const,completedAt})}
}

export function entryForCoverage(project:ViyeuticaProject,record:SubstitutionRecord):GeneratedScheduleEntry|null {
  const day=weekdayOfDate(record.date)
  const entry=project.establishedScheduleRun?.entries.find(e=>e.assignmentId===record.assignmentId
    &&e.groupId===record.groupId&&e.sessionId===record.sessionId&&e.day===day
    &&e.teacherId===record.absentTeacherId)
  return entry??null
}
