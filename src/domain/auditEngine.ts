import type {
  AuditIssue,
  AuditResult,
  GenerationRun,
  TeachingAssignment,
  ViyeuticaProject,
} from './project'
import {
  fixedSlotFromRule,
  isRuleAutomaticallyEvaluable,
  ruleComparison,
  ruleConditionKind,
  ruleMatchesEntry,
  ruleNumericValue,
} from './ruleEngine'

function uid(prefix:string){return prefix+'_'+crypto.randomUUID()}

function sessionsRequired(project:ViyeuticaProject,assignment:TeachingAssignment){
  if((assignment.weeklySessions??0)>0) return Math.max(1,Math.round(assignment.weeklySessions!))
  const entry=project.studyPlan.find(item=>item.active&&item.groupId===assignment.groupId&&item.subjectId===assignment.subjectId)
  if(entry?.weeklySessions&&entry.weeklySessions>0) return Math.max(1,Math.round(entry.weeklySessions))
  const blocks=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
  const durations=blocks
    .map(block=>{
      const [sh,sm]=block.start.split(':').map(Number)
      const [eh,em]=block.end.split(':').map(Number)
      return (eh*60+em)-(sh*60+sm)
    })
    .filter(value=>value>0)
    .sort((x,y)=>x-y)
  const median=durations[Math.floor(durations.length/2)]||45
  if((assignment.weeklyMinutes??0)>0) return Math.max(1,Math.ceil((assignment.weeklyMinutes??0)/median))
  if((entry?.weeklyMinutes??0)>0) return Math.max(1,Math.ceil((entry?.weeklyMinutes??0)/median))
  return 1
}

export function auditGeneration(project:ViyeuticaProject,run:GenerationRun):AuditResult{
  const issues:AuditIssue[]=[]
  const push=(issue:Omit<AuditIssue,'id'>)=>issues.push({id:uid('audit'),...issue})
  const countableRuleEntries=(rule:ViyeuticaProject['rules'][number])=>
    rule.scope==='group'||rule.scope==='subject'
      ? run.entries.filter(entry=>project.assignments.find(assignment=>assignment.id===entry.assignmentId)?.assignmentType==='main')
      : run.entries

  // Integridad de referencias.
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

  // Solapes independientes del solver.
  const groupSlots=new Map<string,typeof run.entries>()
  const teacherSlots=new Map<string,typeof run.entries>()
  for(const entry of run.entries){
    const gk=`${entry.groupId}|${entry.day}|${entry.sessionId}`
    const tk=`${entry.teacherId}|${entry.day}|${entry.sessionId}`
    groupSlots.set(gk,[...(groupSlots.get(gk)??[]),entry])
    teacherSlots.set(tk,[...(teacherSlots.get(tk)??[]),entry])
  }
  for(const entries of groupSlots.values()){
    const assignmentTypes=entries.map(entry=>project.assignments.find(a=>a.id===entry.assignmentId)?.assignmentType)
    const mainCount=assignmentTypes.filter(type=>type==='main').length
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

  // Disponibilidad.
  for(const entry of run.entries){
    const blocked=project.teacherAvailability.find(item=>
      item.teacherId===entry.teacherId&&item.day===entry.day&&item.session===entry.sessionId&&(item.status==='unavailable'||item.status==='travel')
    )
    if(blocked){
      push({severity:'error',category:'Disponibilidad',code:'DOCENTE_NO_DISPONIBLE',message:'Se ha colocado una sesión cuando el docente figura como no disponible o en desplazamiento.',detail:blocked.detail||undefined,teacherId:entry.teacherId,groupId:entry.groupId,subjectId:entry.subjectId,day:entry.day,sessionId:entry.sessionId})
    }
  }

  // Franjas fijas.
  for(const assignment of project.assignments.filter(a=>a.active)){
    for(const fixed of assignment.fixedSlots??[]){
      const exists=run.entries.some(entry=>entry.assignmentId===assignment.id&&entry.day===fixed.day&&entry.sessionId===fixed.session)
      if(!exists){
        push({severity:'error',category:'Franjas fijas',code:'FRANJA_FIJA_INCUMPLIDA',message:'Una asignación no aparece en una franja fijada obligatoria.',teacherId:assignment.teacherId,groupId:assignment.groupId,subjectId:assignment.subjectId,day:fixed.day as any,sessionId:fixed.session})
      }
    }
  }

  // Huecos lectivos de grupo: ningún grupo activo puede quedar sin docencia principal en una franja lectiva.
  const teachingBlocks=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
  for(const group of project.groups.filter(group=>group.active)){
    for(const day of project.schedule.activeDays){
      for(const block of teachingBlocks){
        const hasMain=run.entries.some(entry=>
          entry.groupId===group.id &&
          entry.day===day &&
          entry.sessionId===block.id &&
          project.assignments.find(assignment=>assignment.id===entry.assignmentId)?.assignmentType==='main'
        )
        if(!hasMain){
          push({
            severity:'error',
            category:'Cobertura',
            code:'HUECO_LECTIVO_GRUPO',
            message:'Un grupo tiene una franja lectiva sin docencia principal.',
            groupId:group.id,
            day,
            sessionId:block.id,
          })
        }
      }
    }
  }

  // Cobertura y carga semanal por asignación.
  for(const assignment of project.assignments.filter(a=>a.active)){
    const expected=sessionsRequired(project,assignment)
    const actual=run.entries.filter(entry=>entry.assignmentId===assignment.id).length
    if(actual<expected){
      push({severity:'error',category:'Cobertura',code:'SESIONES_INCOMPLETAS',message:'Una asignación tiene menos sesiones de las requeridas.',detail:`Requeridas: ${expected} · Colocadas: ${actual}`,teacherId:assignment.teacherId,groupId:assignment.groupId,subjectId:assignment.subjectId})
    }else if(actual>expected){
      push({severity:'warning',category:'Carga semanal',code:'SESIONES_EXCESIVAS',message:'Una asignación tiene más sesiones de las configuradas.',detail:`Configuradas: ${expected} · Colocadas: ${actual}`,teacherId:assignment.teacherId,groupId:assignment.groupId,subjectId:assignment.subjectId})
    }
  }

  // Cobertura del plan de estudios.
  for(const plan of project.studyPlan.filter(item=>item.active)){
    const exists=run.entries.some(entry=>entry.groupId===plan.groupId&&entry.subjectId===plan.subjectId)
    if(!exists){
      push({severity:'error',category:'Cobertura',code:'PLAN_SIN_PRESENCIA',message:'Una materia del plan de estudios no aparece en el horario generado.',groupId:plan.groupId,subjectId:plan.subjectId})
    }
  }

  // Reglas HARD evaluables mediante el mismo motor semántico usado por prevalidación y generación.
  for(const rule of project.rules.filter(rule=>rule.active&&rule.ruleType==='HARD')){
    if(rule.code==='SIN_SOLAPE_DOCENTE'||rule.code==='SIN_SOLAPE_GRUPO'||rule.code==='RESPETAR_DISPONIBILIDAD_DOCENTE'||rule.code==='RESPETAR_FRANJAS_FIJAS') continue

    const kind=ruleConditionKind(rule)

    if(kind==='avoid_slot'||(kind==='availability'&&ruleComparison(rule)==='not_equals')){
      const affected=run.entries.filter(entry=>ruleMatchesEntry(rule,entry))
      if(affected.length){
        push({severity:'error',category:'Reglas',code:rule.code,message:`Se incumple la regla obligatoria: ${rule.description}`,detail:`${affected.length} sesiones afectadas`})
      }
      continue
    }

    if(kind==='fixed_slot'){
      const assignments=project.assignments.filter(assignment=>assignment.active)
      for(const assignment of assignments){
        const fixed=fixedSlotFromRule(rule,assignment)
        if(!fixed) continue
        const exists=run.entries.some(entry=>
          entry.assignmentId===assignment.id&&
          entry.day===fixed.day&&
          entry.sessionId===fixed.session
        )
        if(!exists){
          push({severity:'error',category:'Reglas',code:rule.code,message:`Se incumple la regla obligatoria: ${rule.description}`,teacherId:assignment.teacherId,groupId:assignment.groupId,subjectId:assignment.subjectId,day:fixed.day as any,sessionId:fixed.session})
        }
      }
      continue
    }

    if(kind==='daily_limit'){
      const value=ruleNumericValue(rule)
      if(value!==null){
        const matching=countableRuleEntries(rule).filter(entry=>ruleMatchesEntry({...rule,parameters:{...rule.parameters,day:undefined,sessionId:undefined}},entry))
        const byDay=new Map<string,number>()
        for(const entry of matching){
          const key=rule.scope==='teacher'
            ? entry.teacherId+'|'+entry.day
            : rule.scope==='group'
              ? entry.groupId+'|'+entry.day
              : rule.scope==='subject'
                ? entry.groupId+'|'+entry.subjectId+'|'+entry.day
                : entry.day
          byDay.set(key,(byDay.get(key)??0)+1)
        }
        const cmp=ruleComparison(rule)
        const invalid=[...byDay.values()].filter(count=>
          cmp==='maximum'?count>value:
          cmp==='minimum'?count<value:
          cmp==='equals'?count!==value:false
        )
        if(invalid.length){
          const label=cmp==='maximum'?'superan el máximo':cmp==='minimum'?'no alcanzan el mínimo':'no coinciden con el valor exacto'
          push({severity:'error',category:'Reglas',code:rule.code,message:`Se incumple la regla obligatoria: ${rule.description}`,detail:`${invalid.length} recuentos diarios ${label} de ${value}`})
        }
      }
      continue
    }

    if(kind==='consecutive_limit'){
      const value=ruleNumericValue(rule)
      if(value!==null){
        const orderBySession=new Map(teachingBlocks.map((block,index)=>[block.id,index]))
        const matching=countableRuleEntries(rule).filter(entry=>ruleMatchesEntry({...rule,parameters:{...rule.parameters,day:undefined,sessionId:undefined}},entry))
        const grouped=new Map<string,number[]>()
        for(const entry of matching){
          const order=orderBySession.get(entry.sessionId)
          if(order===undefined) continue
          const key=rule.scope==='teacher'
            ? entry.teacherId+'|'+entry.day
            : rule.scope==='group'
              ? entry.groupId+'|'+entry.day
              : rule.scope==='subject'
                ? entry.groupId+'|'+entry.subjectId+'|'+entry.day
                : entry.day
          grouped.set(key,[...(grouped.get(key)??[]),order])
        }
        const maxRuns:number[]=[]
        for(const orders of grouped.values()){
          const sorted=[...new Set(orders)].sort((a,b)=>a-b)
          let runLength=0
          let previous:number|undefined
          let maxRun=0
          for(const order of sorted){
            runLength=previous!==undefined&&order===previous+1?runLength+1:1
            maxRun=Math.max(maxRun,runLength)
            previous=order
          }
          maxRuns.push(maxRun)
        }
        const cmp=ruleComparison(rule)
        const invalid=maxRuns.filter(maxRun=>
          cmp==='maximum'?maxRun>value:
          cmp==='minimum'?maxRun<value:
          cmp==='equals'?maxRun!==value:false
        )
        if(invalid.length){
          const label=cmp==='maximum'?'superan el máximo':cmp==='minimum'?'no alcanzan el mínimo':'no coinciden con el valor exacto'
          push({severity:'error',category:'Reglas',code:rule.code,message:`Se incumple la regla obligatoria: ${rule.description}`,detail:`${invalid.length} secuencias ${label} de ${value} sesiones consecutivas`})
        }
      }
      continue
    }

    if(kind==='weekly_load'){
      const value=ruleNumericValue(rule)
      if(value!==null){
        const matching=countableRuleEntries(rule).filter(entry=>ruleMatchesEntry({...rule,parameters:{...rule.parameters,day:undefined,sessionId:undefined}},entry))
        const grouped=new Map<string,number>()
        for(const entry of matching){
          const key=rule.scope==='teacher'
            ? entry.teacherId
            : rule.scope==='group'
              ? entry.groupId
              : rule.scope==='subject'
                ? entry.groupId+'|'+entry.subjectId
                : 'center'
          grouped.set(key,(grouped.get(key)??0)+1)
        }
        const teacherIds=Array.isArray(rule.parameters?.teacherIds)?rule.parameters.teacherIds.map(String):rule.parameters?.teacherId?[String(rule.parameters.teacherId)]:[]
        const groupIds=Array.isArray(rule.parameters?.groupIds)?rule.parameters.groupIds.map(String):rule.parameters?.groupId?[String(rule.parameters.groupId)]:[]
        const subjectIds=Array.isArray(rule.parameters?.subjectIds)?rule.parameters.subjectIds.map(String):rule.parameters?.subjectId?[String(rule.parameters.subjectId)]:[]
        if(rule.scope==='teacher')for(const id of teacherIds)if(!grouped.has(id))grouped.set(id,0)
        if(rule.scope==='group')for(const id of groupIds)if(!grouped.has(id))grouped.set(id,0)
        if(rule.scope==='subject'){
          for(const groupId of groupIds){
            for(const subjectId of subjectIds){
              const key=groupId+'|'+subjectId
              if(!grouped.has(key))grouped.set(key,0)
            }
          }
        }
        const cmp=ruleComparison(rule)
        const invalid=[...grouped.values()].filter(count=>
          cmp==='maximum'?count>value:
          cmp==='minimum'?count<value:
          cmp==='equals'?count!==value:false
        )
        if(invalid.length){
          push({severity:'error',category:'Reglas',code:rule.code,message:`Se incumple la regla obligatoria: ${rule.description}`,detail:`${invalid.length} cargas semanales no cumplen el valor ${value}`})
        }
      }
      continue
    }

    if(!isRuleAutomaticallyEvaluable(rule)){
      push({severity:'warning',category:'Reglas',code:'REGLA_NO_AUDITABLE',message:`La regla HARD "${rule.description}" todavía no está soportada por el motor común de evaluación.`})
    }
  }

  const errors=issues.filter(issue=>issue.severity==='error').length
  const warnings=issues.filter(issue=>issue.severity==='warning').length
  const infos=issues.filter(issue=>issue.severity==='info').length
  return {
    runId:run.id,
    createdAt:new Date().toISOString(),
    passed:errors===0,
    errors,warnings,infos,issues,
  }
}
