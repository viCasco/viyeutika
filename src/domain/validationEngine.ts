import type {
  AuditIssue,
  GeneratedScheduleEntry,
  GenerationRun,
  TeachingAssignment,
  ViyeuticaProject,
  Weekday,
} from './project'
import {
  fixedSlotFromRule,
  violatesAvoidRule,
  violatesConsecutiveLimitRule,
  violatesDailyLimitRule,
  violatesWeeklyLoadRule,
} from './ruleEngine'

function minutesFromTime(value:string){
  const [hours,minutes]=value.split(':').map(Number)
  return Number.isFinite(hours)&&Number.isFinite(minutes)?hours*60+minutes:NaN
}

function timeBlockDuration(block:{start:string;end:string}){
  return minutesFromTime(block.end)-minutesFromTime(block.start)
}

function effectiveTeacherTeachingMinutesLocal(teacher:ViyeuticaProject['teachers'][number]){
  if(teacher.weeklyTeachingMinutes===null)return null
  const dedicationMinutes=(teacher.dedications??[])
    .filter(item=>item.status==='applicable'&&item.affectsTeachingLoad)
    .reduce((total,item)=>total+((item.weeklyMinutes??0)>0?item.weeklyMinutes!:0),0)
  return Math.max(0,teacher.weeklyTeachingMinutes-dedicationMinutes)
}

export interface ValidationSlot {
  day: Weekday
  sessionId: string
  order: number
  duration: number
}

export type PlacementViolationCode =
  | 'GROUP_BUSY'
  | 'TEACHER_BUSY'
  | 'TEACHER_UNAVAILABLE'
  | 'TEACHER_LOAD'
  | 'HARD_RULE'

export interface PlacementViolation {
  code: PlacementViolationCode
  ruleCode?: string
}

export interface PlacementValidation {
  allowed: boolean
  violations: PlacementViolation[]
}

export function teachingValidationSlots(project:ViyeuticaProject):ValidationSlot[]{
  const blocks=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
  const slots:ValidationSlot[]=[]
  for(const day of project.schedule.activeDays){
    blocks.forEach((block,order)=>slots.push({
      day,
      sessionId:block.id,
      order,
      duration:timeBlockDuration(block),
    }))
  }
  return slots
}

export function requiredSessionsForAssignment(project:ViyeuticaProject,assignment:TeachingAssignment){
  if((assignment.weeklySessions??0)>0)return Math.max(1,Math.round(assignment.weeklySessions!))
  const plan=project.studyPlan.find(item=>item.active&&item.groupId===assignment.groupId&&item.subjectId===assignment.subjectId)
  if((plan?.weeklySessions??0)>0)return Math.max(1,Math.round(plan!.weeklySessions))

  const durations=project.schedule.blocks
    .filter(block=>block.active&&block.type==='teaching')
    .map(timeBlockDuration)
    .filter(value=>value>0)
    .sort((a,b)=>a-b)
  const median=durations[Math.floor(durations.length/2)]||45
  const target=(assignment.weeklyMinutes??0)>0?assignment.weeklyMinutes!:(plan?.weeklyMinutes??0)
  return target>0?Math.max(1,Math.ceil(target/median)):1
}

export function teacherIsUnavailable(
  project:ViyeuticaProject,
  teacherId:string,
  slot:Pick<ValidationSlot,'day'|'sessionId'>,
){
  return project.teacherAvailability.some(item=>
    item.teacherId===teacherId&&
    item.day===slot.day&&
    item.session===slot.sessionId&&
    (item.status==='unavailable'||item.status==='travel')
  )
}

export function fixedSlotsForAssignment(project:ViyeuticaProject,assignment:TeachingAssignment){
  const explicit=assignment.fixedSlots??[]
  const fromRules=project.rules
    .filter(rule=>rule.active&&rule.ruleType==='HARD')
    .map(rule=>fixedSlotFromRule(rule,assignment))
    .filter(Boolean) as {day:string;session:string}[]
  const unique=new Map<string,{day:string;session:string}>()
  for(const item of [...explicit,...fromRules])unique.set(item.day+'|'+item.session,item)
  return [...unique.values()]
}

export function teacherAssignedMinutes(
  project:ViyeuticaProject,
  entries:GeneratedScheduleEntry[],
  teacherId:string,
){
  const durationBySession=new Map(
    project.schedule.blocks
      .filter(block=>block.active&&block.type==='teaching')
      .map(block=>[block.id,timeBlockDuration(block)])
  )
  return entries
    .filter(entry=>entry.teacherId===teacherId)
    .reduce((total,entry)=>total+(durationBySession.get(entry.sessionId)??0),0)
}

export function validatePlacement(
  project:ViyeuticaProject,
  assignment:TeachingAssignment,
  slot:ValidationSlot,
  entries:GeneratedScheduleEntry[],
  options:{allowGroupOverlap?:boolean}={},
):PlacementValidation{
  const violations:PlacementViolation[]=[]
  const sameSlot=(entry:GeneratedScheduleEntry)=>entry.day===slot.day&&entry.sessionId===slot.sessionId

  if(!options.allowGroupOverlap&&entries.some(entry=>sameSlot(entry)&&entry.groupId===assignment.groupId)){
    violations.push({code:'GROUP_BUSY'})
  }
  if(entries.some(entry=>sameSlot(entry)&&entry.teacherId===assignment.teacherId)){
    violations.push({code:'TEACHER_BUSY'})
  }
  if(teacherIsUnavailable(project,assignment.teacherId,slot)){
    violations.push({code:'TEACHER_UNAVAILABLE'})
  }

  const teacher=project.teachers.find(item=>item.id===assignment.teacherId&&item.active)
  const maximum=teacher?effectiveTeacherTeachingMinutesLocal(teacher):null
  if(maximum!==null&&teacherAssignedMinutes(project,entries,assignment.teacherId)+slot.duration>maximum){
    violations.push({code:'TEACHER_LOAD'})
  }

  const orderBySession=new Map(
    project.schedule.blocks
      .filter(block=>block.active&&block.type==='teaching')
      .map((block,index)=>[block.id,index])
  )
  for(const rule of project.rules.filter(rule=>rule.active&&rule.ruleType==='HARD')){
    if(
      violatesAvoidRule(rule,assignment,slot)||
      violatesDailyLimitRule(rule,assignment,slot,entries)||
      violatesWeeklyLoadRule(rule,assignment,entries)||
      violatesConsecutiveLimitRule(rule,assignment,slot,entries,orderBySession)
    ){
      violations.push({code:'HARD_RULE',ruleCode:rule.code})
    }
  }

  return {allowed:violations.length===0,violations}
}

export function placementDiagnostics(
  project:ViyeuticaProject,
  assignment:TeachingAssignment,
  slots:ValidationSlot[],
  entries:GeneratedScheduleEntry[],
  fixedTarget?:{day:string;session:string},
){
  const relevant=fixedTarget
    ? slots.filter(slot=>slot.day===fixedTarget.day&&slot.sessionId===fixedTarget.session)
    : slots
  let unavailableCount=0
  let groupBusyCount=0
  let teacherBusyCount=0
  let hardRuleCount=0

  for(const slot of relevant){
    const result=validatePlacement(project,assignment,slot,entries)
    if(result.violations.some(item=>item.code==='TEACHER_UNAVAILABLE'))unavailableCount++
    if(result.violations.some(item=>item.code==='GROUP_BUSY'))groupBusyCount++
    if(result.violations.some(item=>item.code==='TEACHER_BUSY'))teacherBusyCount++
    if(result.violations.some(item=>item.code==='HARD_RULE'||item.code==='TEACHER_LOAD'))hardRuleCount++
  }

  return {
    candidateSlots:relevant.length,
    unavailableCount,
    groupBusyCount,
    teacherBusyCount,
    hardRuleCount,
    fixedTarget:Boolean(fixedTarget),
  }
}

export function validateRunCore(project:ViyeuticaProject,run:GenerationRun):AuditIssue[]{
  const issues:AuditIssue[]=[]
  let sequence=0
  const push=(issue:Omit<AuditIssue,'id'>)=>issues.push({id:'validation_'+sequence++,...issue})

  for(const entry of run.entries){
    if(!project.groups.some(group=>group.id===entry.groupId&&group.active)){
      push({severity:'error',category:'Integridad',code:'GRUPO_NO_VALIDO',message:'Hay una sesión vinculada a un grupo inexistente o inactivo.',groupId:entry.groupId})
    }
    if(!project.subjects.some(subject=>subject.id===entry.subjectId&&subject.active)){
      push({severity:'error',category:'Integridad',code:'MATERIA_NO_VALIDA',message:'Hay una sesión vinculada a una materia inexistente o inactiva.',subjectId:entry.subjectId})
    }
    if(!project.teachers.some(teacher=>teacher.id===entry.teacherId&&teacher.active)){
      push({severity:'error',category:'Integridad',code:'DOCENTE_NO_VALIDO',message:'Hay una sesión vinculada a un docente inexistente o inactivo.',teacherId:entry.teacherId})
    }
    if(!project.schedule.activeDays.includes(entry.day)||!project.schedule.blocks.some(block=>block.id===entry.sessionId&&block.active&&block.type==='teaching')){
      push({severity:'error',category:'Integridad',code:'FRANJA_NO_VALIDA',message:'Hay una sesión fuera de la jornada lectiva activa.',day:entry.day,sessionId:entry.sessionId})
    }
  }

  const groupSlots=new Map<string,GeneratedScheduleEntry[]>()
  const teacherSlots=new Map<string,GeneratedScheduleEntry[]>()
  for(const entry of run.entries){
    const gk=entry.groupId+'|'+entry.day+'|'+entry.sessionId
    const tk=entry.teacherId+'|'+entry.day+'|'+entry.sessionId
    groupSlots.set(gk,[...(groupSlots.get(gk)??[]),entry])
    teacherSlots.set(tk,[...(teacherSlots.get(tk)??[]),entry])
  }
  for(const entries of groupSlots.values()){
    const mainCount=entries.filter(entry=>project.assignments.find(a=>a.id===entry.assignmentId)?.assignmentType==='main').length
    if(mainCount>1){
      const first=entries[0]
      push({severity:'error',category:'Solapes',code:'SOLAPE_GRUPO',message:'Un grupo tiene más de una docencia principal en la misma franja.',groupId:first.groupId,day:first.day,sessionId:first.sessionId})
    }
  }
  for(const entries of teacherSlots.values()){
    if(entries.length>1){
      const first=entries[0]
      push({severity:'error',category:'Solapes',code:'SOLAPE_DOCENTE',message:'Un docente aparece en más de una actividad en la misma franja.',teacherId:first.teacherId,day:first.day,sessionId:first.sessionId})
    }
  }

  for(const entry of run.entries){
    if(teacherIsUnavailable(project,entry.teacherId,{day:entry.day,sessionId:entry.sessionId})){
      const blocked=project.teacherAvailability.find(item=>item.teacherId===entry.teacherId&&item.day===entry.day&&item.session===entry.sessionId&&(item.status==='unavailable'||item.status==='travel'))
      push({severity:'error',category:'Disponibilidad',code:'DOCENTE_NO_DISPONIBLE',message:'Se ha colocado una sesión cuando el docente figura como no disponible o en desplazamiento.',detail:blocked?.detail||undefined,teacherId:entry.teacherId,groupId:entry.groupId,subjectId:entry.subjectId,day:entry.day,sessionId:entry.sessionId})
    }
  }

  for(const assignment of project.assignments.filter(item=>item.active)){
    for(const fixed of fixedSlotsForAssignment(project,assignment)){
      const exists=run.entries.some(entry=>entry.assignmentId===assignment.id&&entry.day===fixed.day&&entry.sessionId===fixed.session)
      if(!exists){
        push({severity:'error',category:'Franjas fijas',code:'FRANJA_FIJA_INCUMPLIDA',message:'Una asignación no aparece en una franja fijada obligatoria.',teacherId:assignment.teacherId,groupId:assignment.groupId,subjectId:assignment.subjectId,day:fixed.day as Weekday,sessionId:fixed.session})
      }
    }
  }

  const teachingBlocks=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
  for(const group of project.groups.filter(group=>group.active)){
    for(const day of project.schedule.activeDays){
      for(const block of teachingBlocks){
        const hasMain=run.entries.some(entry=>
          entry.groupId===group.id&&entry.day===day&&entry.sessionId===block.id&&
          project.assignments.find(assignment=>assignment.id===entry.assignmentId)?.assignmentType==='main'
        )
        if(!hasMain){
          push({severity:'error',category:'Cobertura',code:'HUECO_LECTIVO_GRUPO',message:'Un grupo tiene una franja lectiva sin docencia principal.',groupId:group.id,day,sessionId:block.id})
        }
      }
    }
  }

  for(const assignment of project.assignments.filter(item=>item.active)){
    const expected=requiredSessionsForAssignment(project,assignment)
    const actual=run.entries.filter(entry=>entry.assignmentId===assignment.id).length
    if(actual<expected){
      push({severity:'error',category:'Cobertura',code:'SESIONES_INCOMPLETAS',message:'Una asignación tiene menos sesiones de las requeridas.',detail:'Requeridas: '+expected+' · Colocadas: '+actual,teacherId:assignment.teacherId,groupId:assignment.groupId,subjectId:assignment.subjectId})
    }else if(actual>expected){
      push({severity:'warning',category:'Carga semanal',code:'SESIONES_EXCESIVAS',message:'Una asignación tiene más sesiones de las configuradas.',detail:'Configuradas: '+expected+' · Colocadas: '+actual,teacherId:assignment.teacherId,groupId:assignment.groupId,subjectId:assignment.subjectId})
    }
  }

  for(const plan of project.studyPlan.filter(item=>item.active)){
    if(!run.entries.some(entry=>entry.groupId===plan.groupId&&entry.subjectId===plan.subjectId)){
      push({severity:'error',category:'Cobertura',code:'PLAN_SIN_PRESENCIA',message:'Una materia del plan de estudios no aparece en el horario generado.',groupId:plan.groupId,subjectId:plan.subjectId})
    }
  }

  for(const teacher of project.teachers.filter(item=>item.active)){
    const maximum=effectiveTeacherTeachingMinutesLocal(teacher)
    if(maximum===null)continue
    const actual=teacherAssignedMinutes(project,run.entries,teacher.id)
    if(actual>maximum){
      push({severity:'error',category:'Carga semanal',code:'CARGA_DOCENTE_EXCEDIDA',message:'La carga lectiva asignada supera la capacidad docente disponible.',detail:'Máximo: '+maximum+' min · Asignados: '+actual+' min',teacherId:teacher.id})
    }
  }

  return issues
}
