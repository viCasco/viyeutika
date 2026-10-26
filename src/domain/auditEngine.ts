import type {
  AuditResult,
  GenerationRun,
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
import { validateRunCore } from './validationEngine'

export function auditGeneration(project:ViyeuticaProject,run:GenerationRun):AuditResult{
  const issues=validateRunCore(project,run)
  const push=(issue:Omit<(typeof issues)[number],'id'>)=>issues.push({id:'audit_'+issues.length,...issue})
  const countableRuleEntries=(rule:ViyeuticaProject['rules'][number])=>
    rule.scope==='group'||rule.scope==='subject'
      ? run.entries.filter(entry=>project.assignments.find(assignment=>assignment.id===entry.assignmentId)?.assignmentType==='main')
      : run.entries
  const teachingBlocks=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')

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
