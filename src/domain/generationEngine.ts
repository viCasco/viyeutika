import type {
  GeneratedScheduleEntry,
  GenerationRun,
  TeachingAssignment,
  TimeBlock,
  ViyeuticaProject,
  Weekday,
} from './project'
import {
  softRuleFinalCost,
  softRulePlacementCost,
} from './ruleEngine'
import {
  fixedSlotsForAssignment,
  placementDiagnostics,
  requiredSessionsForAssignment,
  teacherAvoidsSlot,
  teacherIsUnavailable,
  teachingValidationSlots,
  validatePlacement,
  type ValidationSlot,
} from './validationEngine'
import { auditGeneration } from './auditEngine'

type Slot=ValidationSlot
type Occupancy={
  group:Set<string>
  teacher:Set<string>
}

export interface GenerationOptions {
  strategy?: 'optimize' | 'minimum_change'
  referenceRun?: GenerationRun | null
  moveCost?: number
}

function referenceMoveCost(
  assignment:TeachingAssignment,
  slot:Slot,
  options:GenerationOptions,
){
  if(options.strategy!=='minimum_change'||!options.referenceRun)return 0
  const referenceSlots=options.referenceRun.entries.filter(entry=>entry.assignmentId===assignment.id)
  if(!referenceSlots.length)return 0
  const matches=referenceSlots.some(entry=>entry.day===slot.day&&entry.sessionId===slot.sessionId)
  return matches?0:(options.moveCost??40)
}

function countReferenceChanges(reference:GenerationRun|null|undefined,entries:GeneratedScheduleEntry[]){
  if(!reference)return 0
  const a=new Set(reference.entries.map(entry=>entry.assignmentId+'|'+entry.day+'|'+entry.sessionId))
  const b=new Set(entries.map(entry=>entry.assignmentId+'|'+entry.day+'|'+entry.sessionId))
  let onlyA=0,onlyB=0
  for(const key of a)if(!b.has(key))onlyA++
  for(const key of b)if(!a.has(key))onlyB++
  return Math.max(onlyA,onlyB)
}

function uid(prefix:string){return prefix+'_'+crypto.randomUUID()}

function hashSeed(value:string){
  let h=2166136261
  for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0
}
function rng(seed:number){
  let state=seed||1
  return ()=>{
    state=(Math.imul(state,1664525)+1013904223)>>>0
    return state/4294967296
  }
}
function shuffle<T>(items:T[],random:()=>number){
  const out=[...items]
  for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}
  return out
}

function sessionsRequired(project:ViyeuticaProject,assignment:TeachingAssignment,_blocks:TimeBlock[]){
  return requiredSessionsForAssignment(project,assignment)
}

function unavailable(project:ViyeuticaProject,teacherId:string,slot:Slot){
  return teacherIsUnavailable(project,teacherId,slot)
}

function hardAllows(
  project:ViyeuticaProject,
  assignment:TeachingAssignment,
  slot:Slot,
  entries:GeneratedScheduleEntry[],
  _occupancy:Occupancy,
  _slots:Slot[],
){
  return validatePlacement(project,assignment,slot,entries).allowed
}

function softCost(project:ViyeuticaProject,assignment:TeachingAssignment,slot:Slot,entries:GeneratedScheduleEntry[],slots:Slot[]){
  const orderBySession=new Map(slots.map(item=>[item.sessionId,item.order]))
  return project.rules
    .filter(rule=>rule.active&&rule.ruleType==='SOFT')
    .reduce((total,rule)=>total+softRulePlacementCost(rule,assignment,slot,entries,orderBySession),0)
}

function fixedSlotsFor(project:ViyeuticaProject,assignment:TeachingAssignment){
  return fixedSlotsForAssignment(project,assignment)
}

function addEntry(project:ViyeuticaProject,entries:GeneratedScheduleEntry[],occupancy:Occupancy,assignment:TeachingAssignment,slot:Slot){
  const resolvedSpaceId=assignment.spaceId??(
    assignment.spaceType
      ? project.spaces?.find(space=>space.active&&space.type===assignment.spaceType)?.id??null
      : null
  )
  const entry:GeneratedScheduleEntry={
    id:uid('slot'),
    assignmentId:assignment.id,
    groupId:assignment.groupId,
    subgroupId:assignment.subgroupId??null,
    subjectId:assignment.subjectId,
    teacherId:assignment.teacherId,
    spaceId:resolvedSpaceId,
    day:slot.day,
    sessionId:slot.sessionId,
  }
  entries.push(entry)
  const key=slot.day+'|'+slot.sessionId
  occupancy.group.add(assignment.groupId+'|'+key)
  occupancy.teacher.add(assignment.teacherId+'|'+key)
}


function rebuildOccupancy(entries:GeneratedScheduleEntry[],occupancy:Occupancy){
  occupancy.group.clear()
  occupancy.teacher.clear()
  for(const entry of entries){
    const key=entry.day+'|'+entry.sessionId
    const assignmentKey=entry.groupId+'|'+key
    // Apoyos/codocencias pueden compartir grupo con la sesión principal.
    const assignmentType=(entry.assignmentId&&entry.assignmentId)||''
    if(assignmentType) occupancy.group.add(assignmentKey)
    occupancy.teacher.add(entry.teacherId+'|'+key)
  }
}

function isFixedAt(project:ViyeuticaProject,assignment:TeachingAssignment,slot:Slot){
  return fixedSlotsFor(project,assignment).some(item=>item.day===slot.day&&item.session===slot.sessionId)
}

function staticFeasibleSlots(project:ViyeuticaProject,assignment:TeachingAssignment,slots:Slot[]){
  return slots.filter(slot=>validatePlacement(project,assignment,slot,[]).allowed).length
}

function candidateScore(
  project:ViyeuticaProject,
  assignment:TeachingAssignment,
  slot:Slot,
  entries:GeneratedScheduleEntry[],
  slots:Slot[],
  options:GenerationOptions,
){
  let score=softCost(project,assignment,slot,entries,slots)
  if(teacherAvoidsSlot(project,assignment.teacherId,slot))score+=10
  score+=referenceMoveCost(assignment,slot,options)
  const sameSubjectDay=entries.filter(entry=>
    entry.groupId===assignment.groupId&&
    entry.subjectId===assignment.subjectId&&
    entry.day===slot.day
  ).length
  score+=sameSubjectDay*1.5
  return score
}

function trySingleRepair(
  project:ViyeuticaProject,
  assignment:TeachingAssignment,
  slots:Slot[],
  entries:GeneratedScheduleEntry[],
  occupancy:Occupancy,
  random:()=>number,
  options:GenerationOptions,
){
  const targetSlots=shuffle(slots,random)
    .filter(slot=>!unavailable(project,assignment.teacherId,slot))
    .sort((a,b)=>candidateScore(project,assignment,a,entries,slots,options)-candidateScore(project,assignment,b,entries,slots,options))

  for(const target of targetSlots){
    const blockers=entries.filter(entry=>
      entry.day===target.day&&entry.sessionId===target.sessionId&&
      (entry.groupId===assignment.groupId||entry.teacherId===assignment.teacherId)
    )
    if(blockers.length!==1)continue

    const blocker=blockers[0]
    const blockerAssignment=project.assignments.find(item=>item.id===blocker.assignmentId)
    if(!blockerAssignment||blockerAssignment.assignmentType!=='main')continue
    if(isFixedAt(project,blockerAssignment,target))continue

    const snapshot=[...entries]
    const index=entries.findIndex(item=>item.id===blocker.id)
    if(index<0)continue
    entries.splice(index,1)
    rebuildOccupancy(entries,occupancy)

    if(!hardAllows(project,assignment,target,entries,occupancy,slots)){
      entries.splice(0,entries.length,...snapshot)
      rebuildOccupancy(entries,occupancy)
      continue
    }

    addEntry(project,entries,occupancy,assignment,target)

    const alternatives=shuffle(slots,random)
      .filter(slot=>!(slot.day===target.day&&slot.sessionId===target.sessionId))
      .filter(slot=>hardAllows(project,blockerAssignment,slot,entries,occupancy,slots))
      .sort((a,b)=>candidateScore(project,blockerAssignment,a,entries,slots,options)-candidateScore(project,blockerAssignment,b,entries,slots,options))

    const alternative=alternatives[0]
    if(alternative){
      addEntry(project,entries,occupancy,blockerAssignment,alternative)
      return true
    }

    entries.splice(0,entries.length,...snapshot)
    rebuildOccupancy(entries,occupancy)
  }
  return false
}


function tryBoundedBacktrack(
  project:ViyeuticaProject,
  failedAssignment:TeachingAssignment,
  slots:Slot[],
  entries:GeneratedScheduleEntry[],
  occupancy:Occupancy,
  random:()=>number,
  options:GenerationOptions,
){
  const assignmentById=new Map(project.assignments.map(item=>[item.id,item]))
  const movable=entries
    .filter(entry=>{
      const assignment=assignmentById.get(entry.assignmentId)
      const slot=slots.find(item=>item.day===entry.day&&item.sessionId===entry.sessionId)
      return Boolean(assignment&&slot&&assignment.assignmentType==='main'&&!isFixedAt(project,assignment,slot))
    })
    .slice(-6)

  if(!movable.length)return false

  const snapshot=[...entries]
  const movableIds=new Set(movable.map(entry=>entry.id))
  entries.splice(0,entries.length,...entries.filter(entry=>!movableIds.has(entry.id)))
  rebuildOccupancy(entries,occupancy)

  const queue:TeachingAssignment[]=[
    failedAssignment,
    ...movable.map(entry=>assignmentById.get(entry.assignmentId)).filter(Boolean) as TeachingAssignment[],
  ]

  queue.sort((a,b)=>
    staticFeasibleSlots(project,a,slots)-staticFeasibleSlots(project,b,slots)
  )

  let explored=0
  const maxNodes=450

  const place=(index:number):boolean=>{
    if(index>=queue.length)return true
    if(explored>=maxNodes)return false

    const assignment=queue[index]
    const candidates=shuffle(slots,random)
      .filter(slot=>hardAllows(project,assignment,slot,entries,occupancy,slots))
      .sort((a,b)=>candidateScore(project,assignment,a,entries,slots,options)-candidateScore(project,assignment,b,entries,slots,options))

    for(const slot of candidates.slice(0,10)){
      explored++
      const before=entries.length
      addEntry(project,entries,occupancy,assignment,slot)
      if(place(index+1))return true
      entries.splice(before)
      rebuildOccupancy(entries,occupancy)
      if(explored>=maxNodes)break
    }
    return false
  }

  if(place(0))return true

  entries.splice(0,entries.length,...snapshot)
  rebuildOccupancy(entries,occupancy)
  return false
}

function diagnosePlacementBlock(
  project:ViyeuticaProject,
  assignment:TeachingAssignment,
  slots:Slot[],
  entries:GeneratedScheduleEntry[],
  _occupancy:Occupancy,
  fixedTarget?:{day:string;session:string},
){
  return placementDiagnostics(project,assignment,slots,entries,fixedTarget)
}

function teacherGapPenalty(entries:GeneratedScheduleEntry[],slots:Slot[]){
  let gaps=0
  const byTeacherDay=new Map<string,number[]>()
  const orderBySlot=new Map(slots.map(slot=>[slot.day+'|'+slot.sessionId,slot.order]))
  for(const entry of entries){
    const key=entry.teacherId+'|'+entry.day
    const arr=byTeacherDay.get(key)??[]
    const order=orderBySlot.get(entry.day+'|'+entry.sessionId)
    if(order!==undefined) arr.push(order)
    byTeacherDay.set(key,arr)
  }
  for(const orders of byTeacherDay.values()){
    if(orders.length<2) continue
    const sorted=[...orders].sort((a,b)=>a-b)
    for(let i=1;i<sorted.length;i++) gaps+=Math.max(0,sorted[i]-sorted[i-1]-1)
  }
  return gaps
}

function evaluateSoft(project:ViyeuticaProject,entries:GeneratedScheduleEntry[],slots:Slot[]){
  let penalty=entries.filter(entry=>teacherAvoidsSlot(project,entry.teacherId,{day:entry.day,sessionId:entry.sessionId})).length*10
  const reduceGaps=project.rules.filter(r=>r.active&&r.ruleType==='SOFT'&&r.code==='REDUCIR_HUECOS_DOCENTES')
  for(const rule of reduceGaps) penalty+=teacherGapPenalty(entries,slots)*(rule.weight??1)

  const orderBySession=new Map(slots.map(slot=>[slot.sessionId,slot.order]))
  for(const rule of project.rules.filter(r=>r.active&&r.ruleType==='SOFT'&&r.code!=='REDUCIR_HUECOS_DOCENTES')){
    penalty+=softRuleFinalCost(rule,entries,orderBySession)
  }
  return penalty
}

function generateAttempt(project:ViyeuticaProject,attempt:number,options:GenerationOptions){
  const teachingBlocks=project.schedule.blocks.filter(b=>b.active&&b.type==='teaching')
  const slots:Slot[]=teachingValidationSlots(project)

  const random=rng(hashSeed(project.academicYear.id+'|'+attempt))
  const entries:GeneratedScheduleEntry[]=[]
  const occupancy:Occupancy={group:new Set(),teacher:new Set()}
  const notes:string[]=[]
  const issues:import('./project').GenerationIssue[]=[]
  let requested=0
  let hardViolations=0

  const assignments=project.assignments.filter(a=>a.active)
  const main=assignments.filter(a=>a.assignmentType==='main')
  const support=assignments.filter(a=>a.assignmentType!=='main')

  const orderedMain=shuffle(main,random).sort((a,b)=>{
    const af=fixedSlotsFor(project,a).length
    const bf=fixedSlotsFor(project,b).length
    if(af!==bf)return bf-af

    const aFeasible=staticFeasibleSlots(project,a,slots)
    const bFeasible=staticFeasibleSlots(project,b,slots)
    const aNeeded=sessionsRequired(project,a,teachingBlocks)
    const bNeeded=sessionsRequired(project,b,teachingBlocks)
    const aSlack=aFeasible-aNeeded
    const bSlack=bFeasible-bNeeded
    if(aSlack!==bSlack)return aSlack-bSlack
    if(aNeeded!==bNeeded)return bNeeded-aNeeded
    return random()<0.5?-1:1
  })

  for(const assignment of orderedMain){
    const needed=sessionsRequired(project,assignment,teachingBlocks)
    requested+=needed
    const fixed=fixedSlotsFor(project,assignment)

    for(let index=0;index<needed;index++){
      let candidates=shuffle(slots,random)

      if(index<fixed.length){
        const target=fixed[index]
        candidates=candidates.filter(slot=>slot.day===target.day&&slot.sessionId===target.session)
      }

      candidates=candidates
        .filter(slot=>hardAllows(project,assignment,slot,entries,occupancy,slots))
        .sort((a,b)=>candidateScore(project,assignment,a,entries,slots,options)-candidateScore(project,assignment,b,entries,slots,options))

      const slot=candidates[0]
      if(!slot){
        const repaired=index>=fixed.length&&trySingleRepair(project,assignment,slots,entries,occupancy,random,options)
        if(repaired){
          notes.push('Se ha recolocado una sesión previa para evitar un bloqueo durante la generación.')
          continue
        }
        const backtracked=index>=fixed.length&&tryBoundedBacktrack(project,assignment,slots,entries,occupancy,random,options)
        if(backtracked){
          notes.push('Se ha reconstruido un bloque de sesiones mediante backtracking para evitar un bloqueo.')
          continue
        }
        const diagnostics=diagnosePlacementBlock(
          project,
          assignment,
          slots,
          entries,
          occupancy,
          index<fixed.length?fixed[index]:undefined,
        )
        hardViolations++
        issues.push({
          id:uid('issue'),
          type:'unplaced_main',
          assignmentId:assignment.id,
          groupId:assignment.groupId,
          subjectId:assignment.subjectId,
          teacherId:assignment.teacherId,
          missingSessions:1,
          severity:'error',
          diagnostics,
        })
        continue
      }
      addEntry(project,entries,occupancy,assignment,slot)
    }
  }

  // Apoyos y codocencias comparten una sesión principal ya colocada.
  // La codocencia debe coincidir con la misma materia; el apoyo genérico puede
  // acompañar cualquier sesión principal del mismo grupo.
  for(const assignment of shuffle(support,random)){
    const needed=sessionsRequired(project,assignment,teachingBlocks)
    requested+=needed
    const baseEntries=entries.filter(entry=>{
      if(entry.groupId!==assignment.groupId)return false
      const baseAssignment=project.assignments.find(item=>item.id===entry.assignmentId)
      if(!baseAssignment||baseAssignment.assignmentType!=='main')return false
      if(assignment.assignmentType==='co_teaching'){
        return entry.subjectId===assignment.subjectId
      }
      return true
    })
    const baseSlots=baseEntries
      .map(entry=>slots.find(slot=>slot.day===entry.day&&slot.sessionId===entry.sessionId))
      .filter(Boolean) as Slot[]
    let placed=0
    for(const slot of shuffle(baseSlots,random)){
      if(placed>=needed) break
      const teacherKey=assignment.teacherId+'|'+slot.day+'|'+slot.sessionId
      if(!validatePlacement(project,assignment,slot,entries,{allowGroupOverlap:true}).allowed)continue
      // Para apoyo/codocencia permitimos compartir grupo, pero aplicamos el resto de HARD.
      const entry:GeneratedScheduleEntry={
        id:uid('slot'),assignmentId:assignment.id,groupId:assignment.groupId,
        subjectId:assignment.subjectId,teacherId:assignment.teacherId,day:slot.day,sessionId:slot.sessionId,
      }
      entries.push(entry)
      occupancy.teacher.add(teacherKey)
      placed++
    }
    if(placed<needed){
      hardViolations+=needed-placed
      issues.push({
        id:uid('issue'),
        type:'unplaced_support',
        assignmentId:assignment.id,
        groupId:assignment.groupId,
        subjectId:assignment.subjectId,
        teacherId:assignment.teacherId,
        missingSessions:needed-placed,
        severity:'warning',
      })
    }
  }

  const softPenalty=evaluateSoft(project,entries,slots)
  const status:'complete'|'partial'|'failed'=hardViolations===0&&entries.length>=requested?'complete':entries.length?'partial':'failed'
  const score=Math.max(0,10000-hardViolations*1000-softPenalty)
  return {entries,requested,hardViolations,softPenalty,status,score,notes,issues}
}

export function generateSchedule(
  project:ViyeuticaProject,
  attempts=40,
  seedOffset=0,
  options:GenerationOptions={},
):GenerationRun{
  let best:ReturnType<typeof generateAttempt>|null=null
  for(let attempt=0;attempt<Math.max(1,attempts);attempt++){
    const result=generateAttempt(project,attempt+(seedOffset*1000),options)
    if(!best||result.hardViolations<best.hardViolations||(result.hardViolations===best.hardViolations&&result.score>best.score)){
      best=result
    }
    if(result.hardViolations===0&&result.softPenalty===0){best=result;break}
  }
  const final=best!
  const changeCount=countReferenceChanges(options.referenceRun,final.entries)
  const changePenalty=options.strategy==='minimum_change'?changeCount*(options.moveCost??40):0
  const provisional:GenerationRun={
    id:uid('gen'),
    createdAt:new Date().toISOString(),
    status:final.status,
    score:Math.max(0,final.score-changePenalty),
    hardViolations:final.hardViolations,
    softPenalty:final.softPenalty,
    generationStrategy:options.strategy??'optimize',
    referenceRunId:options.referenceRun?.id??null,
    changeCount,
    changePenalty,
    placedSessions:final.entries.length,
    requestedSessions:final.requested,
    entries:final.entries,
    issues:final.issues,
    notes:final.notes,
  }
  const audit=auditGeneration(project,provisional)
  const hardViolations=Math.max(final.hardViolations,audit.errors)
  const status:'complete'|'partial'|'failed'=
    audit.passed&&final.entries.length>=final.requested
      ? 'complete'
      : final.entries.length
        ? 'partial'
        : 'failed'
  return {
    ...provisional,
    status,
    hardViolations,
    score:Math.max(0,10000-hardViolations*1000-final.softPenalty-changePenalty),
    notes:audit.passed
      ? provisional.notes
      : [...provisional.notes,`La validación final detectó ${audit.errors} incumplimiento${audit.errors===1?'':'s'} bloqueante${audit.errors===1?'':'s'}.`],
  }
}
