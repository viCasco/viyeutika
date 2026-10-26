import type {
  GeneratedScheduleEntry,
  GenerationRun,
  TeachingAssignment,
  ViyeuticaProject,
  Weekday,
} from './project'
import { auditGeneration } from './auditEngine'
import { teachingValidationSlots, validatePlacement } from './validationEngine'

export interface ScheduleEntryChange {
  entryId:string
  assignmentId:string
  day:Weekday
  sessionId:string
}

export interface ScheduleEditResult {
  ok:boolean
  run:GenerationRun
  message:string
}

function cloneRun(run:GenerationRun):GenerationRun{
  return structuredClone(run)
}

export function prepareScheduleEntryChange(
  project:ViyeuticaProject,
  run:GenerationRun,
  change:ScheduleEntryChange,
):ScheduleEditResult{
  const current=run.entries.find(entry=>entry.id===change.entryId)
  const assignment=project.assignments.find(item=>item.id===change.assignmentId&&item.active)
  const slot=teachingValidationSlots(project).find(item=>item.day===change.day&&item.sessionId===change.sessionId)

  if(!current)return {ok:false,run,message:'La sesión que intentas editar ya no existe.'}
  if(!assignment)return {ok:false,run,message:'La asignación seleccionada no existe o está inactiva.'}
  if(!slot)return {ok:false,run,message:'La franja seleccionada no pertenece a la jornada lectiva activa.'}

  const remaining=run.entries.filter(entry=>entry.id!==change.entryId)
  const placement=validatePlacement(
    project,
    assignment,
    slot,
    remaining,
    {allowGroupOverlap:assignment.assignmentType!=='main'},
  )
  if(!placement.allowed){
    const labels=placement.violations.map(item=>
      item.code==='GROUP_BUSY'?'el grupo ya está ocupado':
      item.code==='TEACHER_BUSY'?'el docente ya está ocupado':
      item.code==='TEACHER_UNAVAILABLE'?'el docente no está disponible':
      item.code==='TEACHER_LOAD'?'se supera la carga lectiva del docente':
      item.ruleCode?'se incumple la regla HARD '+item.ruleCode:'se incumple una regla HARD'
    )
    return {ok:false,run,message:'Movimiento rechazado: '+[...new Set(labels)].join('; ')+'.'}
  }

  const nextEntry:GeneratedScheduleEntry={
    ...current,
    assignmentId:assignment.id,
    groupId:assignment.groupId,
    subjectId:assignment.subjectId,
    teacherId:assignment.teacherId,
    day:change.day,
    sessionId:change.sessionId,
  }
  const next=cloneRun(run)
  next.entries=next.entries.map(entry=>entry.id===change.entryId?nextEntry:entry)
  next.createdAt=new Date().toISOString()
  next.placedSessions=next.entries.length

  const audit=auditGeneration(project,next)
  if(!audit.passed){
    const first=audit.issues.find(issue=>issue.severity==='error')
    return {
      ok:false,
      run,
      message:'Movimiento rechazado: '+(first?.message??'el horario resultante no supera la validación completa.'),
    }
  }

  next.status='complete'
  next.hardViolations=0
  next.notes=[...next.notes,'Horario modificado manualmente y revalidado.']
  return {ok:true,run:next,message:'Cambio aplicado y horario revalidado correctamente.'}
}

export function assignmentLabel(project:ViyeuticaProject,assignment:TeachingAssignment){
  const group=project.groups.find(item=>item.id===assignment.groupId)?.name??'Grupo'
  const subject=project.subjects.find(item=>item.id===assignment.subjectId)?.name??'Materia'
  const teacher=project.teachers.find(item=>item.id===assignment.teacherId)?.name??'Docente'
  const type=assignment.assignmentType==='main'?'Titular':assignment.assignmentType==='support'?'Apoyo':'Codocencia'
  return subject+' · '+group+' · '+teacher+' · '+type
}
