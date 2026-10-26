import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECT, type GenerationRun, type ViyeuticaProject } from './project'
import { recommendedRun, scheduleMetrics, teacherScheduleMetrics } from './scheduleMetrics'

function fixture(){
  const project:ViyeuticaProject={
    ...structuredClone(EMPTY_PROJECT),
    schedule:{activeDays:['L','M'],mode:'morning',blocks:[
      {id:'s1',label:'1ª',start:'09:00',end:'10:00',type:'teaching',stageScope:['Primaria'],active:true},
      {id:'s2',label:'2ª',start:'10:00',end:'11:00',type:'teaching',stageScope:['Primaria'],active:true},
      {id:'s3',label:'3ª',start:'11:00',end:'12:00',type:'teaching',stageScope:['Primaria'],active:true},
    ]},
    groups:[{id:'g1',name:'1A',stage:'Primaria',level:'1.º Primaria',line:'A',students:20,classroom:'',combined:false,linkedGroupIds:[],tutorTeacherId:null,notes:'',active:true}],
    subjects:[{id:'m1',name:'Lengua',code:'LEN',stage:'Primaria',type:'common',defaultSessionMinutes:60,active:true}],
    teachers:[{id:'t1',name:'Ana',status:'confirmed',employmentType:'full',specialties:['Primaria'],roles:[],weeklyTeachingMinutes:600,dedications:[],active:true}],
    assignments:[{id:'a1',groupId:'g1',subjectId:'m1',teacherId:'t1',assignmentType:'main',weeklySessions:2,weeklyMinutes:120,active:true}],
    studyPlan:[{id:'p1',groupId:'g1',subjectId:'m1',weeklySessions:2,mandatory:true,mode:'ordinary',teacherRequirement:'any',teacherId:'t1',fixedSessionMinutes:null,notes:'',active:true}],
  }
  const run=(id:string,sessions:string[]):GenerationRun=>({
    id,createdAt:'2026-10-26T00:00:00.000Z',status:'complete',score:10000,hardViolations:0,softPenalty:0,
    placedSessions:sessions.length,requestedSessions:2,notes:[],entries:sessions.map((sessionId,index)=>({
      id:id+'_'+index,assignmentId:'a1',groupId:'g1',subjectId:'m1',teacherId:'t1',day:'L' as const,sessionId,
    })),
  })
  return {project,compact:run('compact',['s1','s2']),gapped:run('gapped',['s1','s3'])}
}

describe('schedule quality metrics',()=>{
  it('counts teacher gaps and fragmented days from the timetable',()=>{
    const {project,gapped}=fixture()
    const metrics=teacherScheduleMetrics(project,gapped,'t1')
    expect(metrics.totalGaps).toBe(1)
    expect(metrics.fragmentedDays).toBe(1)
  })

  it('uses the same metrics to recommend the less fragmented valid proposal',()=>{
    const {project,compact,gapped}=fixture()
    const compactMetrics=scheduleMetrics(project,compact)
    expect(compactMetrics.totalTeacherGaps).toBe(0)
    const recommended=recommendedRun(project,[gapped,compact])
    expect(recommended?.run.id).toBe('compact')
  })
})
