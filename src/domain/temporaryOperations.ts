import type { GenerationRun, TemporaryScheduleChange, ViyeuticaProject } from './project'
import { auditGeneration } from './auditEngine'

export function changeApplies(change:TemporaryScheduleChange,date:string){
  return change.active&&date>=change.startDate&&date<=change.endDate
}

function matchesEntry(change:TemporaryScheduleChange,entryId:string){
  return !change.entryIds?.length||change.entryIds.includes(entryId)
}

export function operationalScheduleForDate(project:ViyeuticaProject,date:string):GenerationRun|null{
  const base=project.establishedScheduleRun
  if(!base)return null
  const applicable=project.temporaryChanges
    .filter(change=>changeApplies(change,date))
    .sort((a,b)=>a.createdAt.localeCompare(b.createdAt))
  if(!applicable.length)return structuredClone(base)

  let entries=structuredClone(base.entries)
  const notes=[...base.notes]

  for(const change of applicable){
    if(change.kind==='absence'){
      entries=entries.filter(entry=>!(entry.teacherId===change.teacherId&&matchesEntry(change,entry.id)))
      notes.push('Ausencia temporal aplicada: '+change.teacherId+' · '+change.startDate+'–'+change.endDate)
      continue
    }
    if(change.kind==='substitution'&&change.substituteTeacherId){
      entries=entries.map(entry=>
        entry.teacherId===change.teacherId&&matchesEntry(change,entry.id)
          ? {...entry,teacherId:change.substituteTeacherId!}
          : entry
      )
      notes.push('Sustitución temporal aplicada: '+change.teacherId+' → '+change.substituteTeacherId)
      continue
    }
    if(change.kind==='swap'&&change.swapTeacherId){
      entries=entries.map(entry=>{
        if(!matchesEntry(change,entry.id))return entry
        if(entry.teacherId===change.teacherId)return {...entry,teacherId:change.swapTeacherId!}
        if(entry.teacherId===change.swapTeacherId)return {...entry,teacherId:change.teacherId}
        return entry
      })
      notes.push('Permuta temporal aplicada: '+change.teacherId+' ↔ '+change.swapTeacherId)
    }
  }

  const provisional:GenerationRun={
    ...structuredClone(base),
    id:'operational_'+date,
    createdAt:new Date().toISOString(),
    entries,
    placedSessions:entries.length,
    notes,
  }
  const audit=auditGeneration(project,provisional)
  provisional.hardViolations=audit.errors
  provisional.status=audit.passed&&entries.length>=base.requestedSessions?'complete':entries.length?'partial':'failed'
  provisional.score=Math.max(0,base.score-audit.errors*1000)
  return provisional
}

export function operationalAudit(project:ViyeuticaProject,date:string){
  const run=operationalScheduleForDate(project,date)
  return run?auditGeneration(project,run):null
}
