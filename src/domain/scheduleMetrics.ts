import type { GenerationRun, ViyeuticaProject, Weekday } from './project'
import { auditGeneration } from './auditEngine'

export interface TeacherScheduleMetrics {
  teacherId:string
  teachingDays:number
  totalSessions:number
  totalGaps:number
  fragmentedDays:number
  firstPeriods:number
  lastPeriods:number
  compactDays:number
}

export interface ScheduleMetrics {
  coverage:number
  hardViolations:number
  softPenalty:number
  totalTeacherGaps:number
  fragmentedTeacherDays:number
  averageTeachingDays:number
  totalFirstPeriods:number
  totalLastPeriods:number
  changeCount:number
  teacherMetrics:TeacherScheduleMetrics[]
  valid:boolean
}

function orderMap(project:ViyeuticaProject){
  return new Map(project.schedule.blocks
    .filter(block=>block.active&&block.type==='teaching')
    .map((block,index)=>[block.id,index]))
}

export function teacherScheduleMetrics(
  project:ViyeuticaProject,
  run:GenerationRun,
  teacherId:string,
):TeacherScheduleMetrics{
  const order=orderMap(project)
  const lastIndex=Math.max(0,project.schedule.blocks.filter(block=>block.active&&block.type==='teaching').length-1)
  let totalGaps=0
  let fragmentedDays=0
  let firstPeriods=0
  let lastPeriods=0
  let compactDays=0
  let teachingDays=0
  let totalSessions=0

  for(const day of project.schedule.activeDays){
    const indexes=[...new Set(run.entries
      .filter(entry=>entry.teacherId===teacherId&&entry.day===day)
      .map(entry=>order.get(entry.sessionId))
      .filter((value):value is number=>value!==undefined))]
      .sort((a,b)=>a-b)
    if(!indexes.length)continue
    teachingDays++
    totalSessions+=indexes.length
    if(indexes.includes(0))firstPeriods++
    if(indexes.includes(lastIndex))lastPeriods++
    const span=indexes[indexes.length-1]-indexes[0]+1
    const gaps=Math.max(0,span-indexes.length)
    totalGaps+=gaps
    if(gaps>0)fragmentedDays++
    else compactDays++
  }

  return {teacherId,teachingDays,totalSessions,totalGaps,fragmentedDays,firstPeriods,lastPeriods,compactDays}
}

export function scheduleMetrics(project:ViyeuticaProject,run:GenerationRun):ScheduleMetrics{
  const teacherMetrics=project.teachers
    .filter(teacher=>teacher.active)
    .map(teacher=>teacherScheduleMetrics(project,run,teacher.id))
  const audit=auditGeneration(project,run)
  const totalTeacherGaps=teacherMetrics.reduce((sum,item)=>sum+item.totalGaps,0)
  const fragmentedTeacherDays=teacherMetrics.reduce((sum,item)=>sum+item.fragmentedDays,0)
  const totalFirstPeriods=teacherMetrics.reduce((sum,item)=>sum+item.firstPeriods,0)
  const totalLastPeriods=teacherMetrics.reduce((sum,item)=>sum+item.lastPeriods,0)
  const averageTeachingDays=teacherMetrics.length
    ? teacherMetrics.reduce((sum,item)=>sum+item.teachingDays,0)/teacherMetrics.length
    : 0
  return {
    coverage:run.requestedSessions>0?run.placedSessions/run.requestedSessions:0,
    hardViolations:Math.max(run.hardViolations,audit.errors),
    softPenalty:run.softPenalty,
    totalTeacherGaps,
    fragmentedTeacherDays,
    averageTeachingDays,
    totalFirstPeriods,
    totalLastPeriods,
    changeCount:run.changeCount??0,
    teacherMetrics,
    valid:audit.passed&&run.status==='complete'&&run.placedSessions>=run.requestedSessions,
  }
}

export function recommendedRun(project:ViyeuticaProject,runs:GenerationRun[]){
  const candidates=runs
    .map(run=>({run,metrics:scheduleMetrics(project,run)}))
    .filter(item=>item.metrics.valid)
    .sort((a,b)=>
      a.metrics.hardViolations-b.metrics.hardViolations ||
      b.metrics.coverage-a.metrics.coverage ||
      a.metrics.softPenalty-b.metrics.softPenalty ||
      a.metrics.totalTeacherGaps-b.metrics.totalTeacherGaps ||
      a.metrics.fragmentedTeacherDays-b.metrics.fragmentedTeacherDays ||
      a.metrics.changeCount-b.metrics.changeCount ||
      b.run.score-a.run.score
    )
  return candidates[0]??null
}

export function scheduleCellState(
  project:ViyeuticaProject,
  run:GenerationRun,
  teacherId:string,
  day:Weekday,
  sessionId:string,
){
  const unavailable=project.teacherAvailability.find(item=>
    item.teacherId===teacherId&&item.day===day&&item.session===sessionId
  )
  if(unavailable?.status==='unavailable'||unavailable?.status==='travel')return 'hard' as const
  if(unavailable?.status==='avoid')return 'soft' as const
  if(run.entries.some(entry=>entry.teacherId===teacherId&&entry.day===day&&entry.sessionId===sessionId))return 'occupied' as const
  return 'compatible' as const
}
