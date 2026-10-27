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

export interface ScheduleMovePreview {
  allowed:boolean
  message:string
}

type ScheduleChangeValidation =
  | {ok:false;message:string}
  | {
      ok:true
      current:GeneratedScheduleEntry
      assignment:TeachingAssignment
      slot:ReturnType<typeof teachingValidationSlots>[number]
    }

function cloneRun(run:GenerationRun):GenerationRun{
  return structuredClone(run)
}

function placementViolationMessage(violations:ReturnType<typeof validatePlacement>['violations']){
  const labels=violations.map(item=>
    item.code==='GROUP_BUSY'?'el grupo ya está ocupado':
    item.code==='TEACHER_BUSY'?'el docente ya está ocupado':
    item.code==='TEACHER_UNAVAILABLE'?'el docente no está disponible':
    item.code==='TEACHER_LOAD'?'se supera la carga lectiva del docente':
    item.code==='SPACE_BUSY'?'el espacio ya está ocupado':
    item.code==='SPACE_UNAVAILABLE'?'el espacio no está disponible':
    item.code==='SPACE_CAPACITY'?'el espacio no tiene capacidad suficiente':
    item.code==='TRAVEL_TIME'?'no hay tiempo suficiente para el desplazamiento':
    item.ruleCode?'se incumple la regla HARD '+item.ruleCode:'se incumple una regla HARD'
  )
  return [...new Set(labels)].join('; ')+'.'
}

function movementLockMessage(
  project:ViyeuticaProject,
  entry:GeneratedScheduleEntry,
  target:{day:Weekday;sessionId:string},
){
  const lock=(project.scheduleLocks??[]).find(item=>
    item.assignmentId===entry.assignmentId&&item.day===entry.day&&item.sessionId===entry.sessionId
  )
  if(!lock)return ''
  if(
    (lock.mode==='position'||lock.mode==='full')&&
    (target.day!==entry.day||target.sessionId!==entry.sessionId)
  )return 'La posición de '+(entry.id?'una de las sesiones':'la sesión')+' está bloqueada.'
  return ''
}

function entryForAssignment(
  current:GeneratedScheduleEntry,
  assignment:TeachingAssignment,
  day:Weekday,
  sessionId:string,
):GeneratedScheduleEntry{
  return {
    ...current,
    assignmentId:assignment.id,
    groupId:assignment.groupId,
    subgroupId:assignment.subgroupId??null,
    subjectId:assignment.subjectId,
    teacherId:assignment.teacherId,
    spaceId:assignment.spaceId??current.spaceId??null,
    day,
    sessionId,
  }
}

function validateSimpleMove(
  project:ViyeuticaProject,
  run:GenerationRun,
  change:ScheduleEntryChange,
):ScheduleChangeValidation{
  const current=run.entries.find(entry=>entry.id===change.entryId)
  const assignment=project.assignments.find(item=>item.id===change.assignmentId&&item.active)
  const slot=teachingValidationSlots(project).find(item=>item.day===change.day&&item.sessionId===change.sessionId)

  if(!current)return {ok:false,message:'La sesión que intentas editar ya no existe.'}
  if(!assignment)return {ok:false,message:'La asignación seleccionada no existe o está inactiva.'}
  if(!slot)return {ok:false,message:'La franja seleccionada no pertenece a la jornada lectiva activa.'}

  const lockMessage=movementLockMessage(project,current,{day:change.day,sessionId:change.sessionId})
  if(lockMessage)return {ok:false,message:lockMessage}

  const matchingLock=(project.scheduleLocks??[]).find(lock=>
    lock.assignmentId===current.assignmentId&&lock.day===current.day&&lock.sessionId===current.sessionId
  )
  if(matchingLock){
    if(
      (matchingLock.mode==='teacher'||matchingLock.mode==='full')&&
      assignment.teacherId!==matchingLock.teacherId
    )return {ok:false,message:'El docente de esta sesión está bloqueado.'}
    if(matchingLock.mode==='full'&&change.assignmentId!==current.assignmentId){
      return {ok:false,message:'Esta sesión está bloqueada completamente.'}
    }
  }

  const remaining=run.entries.filter(entry=>entry.id!==change.entryId)
  const placement=validatePlacement(
    project,
    assignment,
    slot,
    remaining,
    {allowGroupOverlap:assignment.assignmentType!=='main'},
  )
  if(!placement.allowed)return {ok:false,message:placementViolationMessage(placement.violations)}

  return {ok:true,current,assignment,slot}
}

function prepareSwap(
  project:ViyeuticaProject,
  run:GenerationRun,
  change:ScheduleEntryChange,
):ScheduleEditResult|null{
  const current=run.entries.find(entry=>entry.id===change.entryId)
  const sourceAssignment=project.assignments.find(item=>item.id===change.assignmentId&&item.active)
  if(!current||!sourceAssignment)return null
  if(current.day===change.day&&current.sessionId===change.sessionId)return null

  const targetEntries=run.entries.filter(entry=>
    entry.id!==current.id&&
    entry.groupId===current.groupId&&
    entry.day===change.day&&
    entry.sessionId===change.sessionId
  )
  if(targetEntries.length===0)return null
  if(targetEntries.length!==1){
    return {ok:false,run,message:'Movimiento rechazado: el destino contiene varias sesiones simultáneas y no puede intercambiarse de forma automática.'}
  }

  const target=targetEntries[0]
  const targetAssignment=project.assignments.find(item=>item.id===target.assignmentId&&item.active)
  if(!targetAssignment){
    return {ok:false,run,message:'Movimiento rechazado: la asignación de la sesión destino no existe o está inactiva.'}
  }

  const sourceLock=movementLockMessage(project,current,{day:change.day,sessionId:change.sessionId})
  if(sourceLock)return {ok:false,run,message:'Movimiento rechazado: '+sourceLock}
  const targetLock=movementLockMessage(project,target,{day:current.day,sessionId:current.sessionId})
  if(targetLock)return {ok:false,run,message:'Movimiento rechazado: '+targetLock}

  const slots=teachingValidationSlots(project)
  const targetSlot=slots.find(item=>item.day===change.day&&item.sessionId===change.sessionId)
  const sourceSlot=slots.find(item=>item.day===current.day&&item.sessionId===current.sessionId)
  if(!targetSlot||!sourceSlot){
    return {ok:false,run,message:'Movimiento rechazado: una de las franjas no pertenece a la jornada lectiva activa.'}
  }

  const baseEntries=run.entries.filter(entry=>entry.id!==current.id&&entry.id!==target.id)
  const sourcePlacement=validatePlacement(
    project,
    sourceAssignment,
    targetSlot,
    baseEntries,
    {allowGroupOverlap:sourceAssignment.assignmentType!=='main'},
  )
  if(!sourcePlacement.allowed){
    return {ok:false,run,message:'Movimiento rechazado: '+placementViolationMessage(sourcePlacement.violations)}
  }

  const movedSource=entryForAssignment(current,sourceAssignment,change.day,change.sessionId)
  const targetPlacement=validatePlacement(
    project,
    targetAssignment,
    sourceSlot,
    [...baseEntries,movedSource],
    {allowGroupOverlap:targetAssignment.assignmentType!=='main'},
  )
  if(!targetPlacement.allowed){
    return {ok:false,run,message:'Movimiento rechazado: el intercambio no es compatible porque '+placementViolationMessage(targetPlacement.violations)}
  }

  const movedTarget=entryForAssignment(target,targetAssignment,current.day,current.sessionId)
  const next=cloneRun(run)
  next.entries=next.entries.map(entry=>
    entry.id===current.id?movedSource:
    entry.id===target.id?movedTarget:
    entry
  )
  next.createdAt=new Date().toISOString()
  next.placedSessions=next.entries.length

  const audit=auditGeneration(project,next)
  if(!audit.passed){
    const first=audit.issues.find(issue=>issue.severity==='error')
    return {
      ok:false,
      run,
      message:'Movimiento rechazado: '+(first?.message??'el horario intercambiado no supera la validación completa.'),
    }
  }

  next.status='complete'
  next.hardViolations=0
  next.notes=[...next.notes,'Dos sesiones se han intercambiado manualmente y el horario se ha revalidado.']
  return {ok:true,run:next,message:'Intercambio aplicado y horario revalidado correctamente.'}
}

export function previewScheduleEntryChange(
  project:ViyeuticaProject,
  run:GenerationRun,
  change:ScheduleEntryChange,
):ScheduleMovePreview{
  const swap=prepareSwap(project,run,change)
  if(swap)return swap.ok
    ? {allowed:true,message:'Intercambio compatible.'}
    : {allowed:false,message:swap.message.replace(/^Movimiento rechazado:\s*/,'')}

  const validation=validateSimpleMove(project,run,change)
  return validation.ok
    ? {allowed:true,message:'Movimiento disponible.'}
    : {allowed:false,message:validation.message}
}

export function prepareScheduleEntryChange(
  project:ViyeuticaProject,
  run:GenerationRun,
  change:ScheduleEntryChange,
):ScheduleEditResult{
  const swap=prepareSwap(project,run,change)
  if(swap)return swap

  const validation=validateSimpleMove(project,run,change)
  if(!validation.ok)return {ok:false,run,message:'Movimiento rechazado: '+validation.message}
  const {current,assignment}=validation

  const nextEntry=entryForAssignment(current,assignment,change.day,change.sessionId)
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
