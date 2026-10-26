import type {
  GeneratedScheduleEntry,
  GenerationRun,
  TeachingAssignment,
  TimeBlock,
  ViyeuticaProject,
  Weekday,
} from './project'
import { effectiveTeacherTeachingMinutes } from './project'
import {
  fixedSlotFromRule,
  softRuleFinalCost,
  softRulePlacementCost,
  violatesAvoidRule,
  violatesConsecutiveLimitRule,
  violatesDailyLimitRule,
  violatesWeeklyLoadRule,
} from './ruleEngine'

type Slot={day:Weekday;sessionId:string;order:number;duration:number}
type Occupancy={
  group:Set<string>
  teacher:Set<string>
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

function minutes(block:TimeBlock){
  const [sh,sm]=block.start.split(':').map(Number)
  const [eh,em]=block.end.split(':').map(Number)
  return (eh*60+em)-(sh*60+sm)
}

function sessionsRequired(project:ViyeuticaProject,assignment:TeachingAssignment,blocks:TimeBlock[]){
  if((assignment.weeklySessions??0)>0) return Math.max(1,Math.round(assignment.weeklySessions!))
  const entry=project.studyPlan.find(item=>item.active&&item.groupId===assignment.groupId&&item.subjectId===assignment.subjectId)
  if(entry?.weeklySessions&&entry.weeklySessions>0) return Math.max(1,Math.round(entry.weeklySessions))
  const target=(assignment.weeklyMinutes??0)>0?assignment.weeklyMinutes!:(entry?.weeklyMinutes??0)
  if(target<=0) return 1
  const durations=blocks.map(minutes).filter(v=>v>0).sort((a,b)=>a-b)
  const median=durations[Math.floor(durations.length/2)]||45
  return Math.max(1,Math.ceil(target/median))
}

function unavailable(project:ViyeuticaProject,teacherId:string,slot:Slot){
  return project.teacherAvailability.some(item=>
    item.teacherId===teacherId &&
    item.day===slot.day &&
    item.session===slot.sessionId &&
    (item.status==='unavailable'||item.status==='travel')
  )
}

function hardAllows(project:ViyeuticaProject,assignment:TeachingAssignment,slot:Slot,entries:GeneratedScheduleEntry[],occupancy:Occupancy,slots:Slot[]){
  const key=slot.day+'|'+slot.sessionId
  if(occupancy.group.has(assignment.groupId+'|'+key)) return false
  if(occupancy.teacher.has(assignment.teacherId+'|'+key)) return false
  if(unavailable(project,assignment.teacherId,slot)) return false

  const teacher=project.teachers.find(item=>item.id===assignment.teacherId&&item.active)
  const effectiveMaximum=teacher?effectiveTeacherTeachingMinutes(teacher):null
  if(effectiveMaximum!==null){
    const durationBySession=new Map(slots.map(item=>[item.sessionId,item.duration]))
    const alreadyAssigned=entries
      .filter(entry=>entry.teacherId===assignment.teacherId)
      .reduce((total,entry)=>total+(durationBySession.get(entry.sessionId)??0),0)
    if(alreadyAssigned+slot.duration>effectiveMaximum)return false
  }

  const orderBySession=new Map(slots.map(item=>[item.sessionId,item.order]))
  for(const rule of project.rules.filter(r=>r.active&&r.ruleType==='HARD')){
    if(violatesAvoidRule(rule,assignment,slot)) return false
    if(violatesDailyLimitRule(rule,assignment,slot,entries)) return false
    if(violatesWeeklyLoadRule(rule,assignment,entries)) return false
    if(violatesConsecutiveLimitRule(rule,assignment,slot,entries,orderBySession)) return false
  }
  return true
}

function softCost(project:ViyeuticaProject,assignment:TeachingAssignment,slot:Slot,entries:GeneratedScheduleEntry[],slots:Slot[]){
  const orderBySession=new Map(slots.map(item=>[item.sessionId,item.order]))
  return project.rules
    .filter(rule=>rule.active&&rule.ruleType==='SOFT')
    .reduce((total,rule)=>total+softRulePlacementCost(rule,assignment,slot,entries,orderBySession),0)
}

function fixedSlotsFor(project:ViyeuticaProject,assignment:TeachingAssignment){
  const explicit=assignment.fixedSlots??[]
  const fromRules=project.rules
    .filter(rule=>rule.active&&rule.ruleType==='HARD')
    .map(rule=>fixedSlotFromRule(rule,assignment))
    .filter(Boolean) as {day:string;session:string}[]
  return [...explicit,...fromRules] as {day:string;session:string}[]
}

function addEntry(entries:GeneratedScheduleEntry[],occupancy:Occupancy,assignment:TeachingAssignment,slot:Slot){
  const entry:GeneratedScheduleEntry={
    id:uid('slot'),
    assignmentId:assignment.id,
    groupId:assignment.groupId,
    subjectId:assignment.subjectId,
    teacherId:assignment.teacherId,
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
  const hardRules=project.rules.filter(rule=>rule.active&&rule.ruleType==='HARD')
  return slots.filter(slot=>{
    if(unavailable(project,assignment.teacherId,slot))return false
    return !hardRules.some(rule=>violatesAvoidRule(rule,assignment,slot))
  }).length
}

function candidateScore(
  project:ViyeuticaProject,
  assignment:TeachingAssignment,
  slot:Slot,
  entries:GeneratedScheduleEntry[],
  slots:Slot[],
){
  let score=softCost(project,assignment,slot,entries,slots)
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
){
  const targetSlots=shuffle(slots,random)
    .filter(slot=>!unavailable(project,assignment.teacherId,slot))
    .sort((a,b)=>candidateScore(project,assignment,a,entries,slots)-candidateScore(project,assignment,b,entries,slots))

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

    addEntry(entries,occupancy,assignment,target)

    const alternatives=shuffle(slots,random)
      .filter(slot=>!(slot.day===target.day&&slot.sessionId===target.sessionId))
      .filter(slot=>hardAllows(project,blockerAssignment,slot,entries,occupancy,slots))
      .sort((a,b)=>candidateScore(project,blockerAssignment,a,entries,slots)-candidateScore(project,blockerAssignment,b,entries,slots))

    const alternative=alternatives[0]
    if(alternative){
      addEntry(entries,occupancy,blockerAssignment,alternative)
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
      .sort((a,b)=>candidateScore(project,assignment,a,entries,slots)-candidateScore(project,assignment,b,entries,slots))

    for(const slot of candidates.slice(0,10)){
      explored++
      const before=entries.length
      addEntry(entries,occupancy,assignment,slot)
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
  occupancy:Occupancy,
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
    const key=slot.day+'|'+slot.sessionId
    if(unavailable(project,assignment.teacherId,slot)) unavailableCount++
    if(occupancy.group.has(assignment.groupId+'|'+key)) groupBusyCount++
    if(occupancy.teacher.has(assignment.teacherId+'|'+key)) teacherBusyCount++
    if(project.rules.some(rule=>
      rule.active&&rule.ruleType==='HARD'&&(
        violatesAvoidRule(rule,assignment,slot)||
        violatesDailyLimitRule(rule,assignment,slot,entries)||
        violatesWeeklyLoadRule(rule,assignment,entries)||
        violatesConsecutiveLimitRule(rule,assignment,slot,entries,new Map(slots.map(item=>[item.sessionId,item.order])))
      )
    )) hardRuleCount++
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
  let penalty=0
  const reduceGaps=project.rules.filter(r=>r.active&&r.ruleType==='SOFT'&&r.code==='REDUCIR_HUECOS_DOCENTES')
  for(const rule of reduceGaps) penalty+=teacherGapPenalty(entries,slots)*(rule.weight??1)

  const orderBySession=new Map(slots.map(slot=>[slot.sessionId,slot.order]))
  for(const rule of project.rules.filter(r=>r.active&&r.ruleType==='SOFT'&&r.code!=='REDUCIR_HUECOS_DOCENTES')){
    penalty+=softRuleFinalCost(rule,entries,orderBySession)
  }
  return penalty
}

function generateAttempt(project:ViyeuticaProject,attempt:number){
  const teachingBlocks=project.schedule.blocks.filter(b=>b.active&&b.type==='teaching')
  const slots:Slot[]=[]
  for(const day of project.schedule.activeDays){
    teachingBlocks.forEach((block,index)=>slots.push({day,sessionId:block.id,order:index,duration:minutes(block)}))
  }

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
        .sort((a,b)=>candidateScore(project,assignment,a,entries,slots)-candidateScore(project,assignment,b,entries,slots))

      const slot=candidates[0]
      if(!slot){
        const repaired=index>=fixed.length&&trySingleRepair(project,assignment,slots,entries,occupancy,random)
        if(repaired){
          notes.push('Se ha recolocado una sesión previa para evitar un bloqueo durante la generación.')
          continue
        }
        const backtracked=index>=fixed.length&&tryBoundedBacktrack(project,assignment,slots,entries,occupancy,random)
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
      addEntry(entries,occupancy,assignment,slot)
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
      if(occupancy.teacher.has(teacherKey)||unavailable(project,assignment.teacherId,slot)) continue
      const supportTeacher=project.teachers.find(item=>item.id===assignment.teacherId&&item.active)
      const supportMaximum=supportTeacher?effectiveTeacherTeachingMinutes(supportTeacher):null
      if(supportMaximum!==null){
        const durationBySession=new Map(slots.map(item=>[item.sessionId,item.duration]))
        const alreadyAssigned=entries
          .filter(entry=>entry.teacherId===assignment.teacherId)
          .reduce((total,entry)=>total+(durationBySession.get(entry.sessionId)??0),0)
        if(alreadyAssigned+slot.duration>supportMaximum)continue
      }
      // Para apoyo/codocencia permitimos compartir grupo, pero no docente.
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

export function generateSchedule(project:ViyeuticaProject,attempts=40,seedOffset=0):GenerationRun{
  let best:ReturnType<typeof generateAttempt>|null=null
  for(let attempt=0;attempt<Math.max(1,attempts);attempt++){
    const result=generateAttempt(project,attempt+(seedOffset*1000))
    if(!best||result.hardViolations<best.hardViolations||(result.hardViolations===best.hardViolations&&result.score>best.score)){
      best=result
    }
    if(result.hardViolations===0&&result.softPenalty===0){best=result;break}
  }
  const final=best!
  return {
    id:uid('gen'),
    createdAt:new Date().toISOString(),
    status:final.status,
    score:final.score,
    hardViolations:final.hardViolations,
    softPenalty:final.softPenalty,
    placedSessions:final.entries.length,
    requestedSessions:final.requested,
    entries:final.entries,
    issues:final.issues,
    notes:final.notes,
  }
}
