import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECT, type GenerationRun, type ViyeuticaProject } from './project'
import { generateSchedule } from './generationEngine'

function fixture():ViyeuticaProject{
  return {
    ...structuredClone(EMPTY_PROJECT),
    groups:[{id:'g1',name:'1A',stage:'Primaria',level:'1.º Primaria',line:'A',students:20,classroom:'',combined:false,linkedGroupIds:[],tutorTeacherId:null,notes:'',active:true}],
    schedule:{activeDays:['L'],mode:'morning',blocks:[
      {id:'s1',label:'1ª',start:'09:00',end:'10:00',type:'teaching',stageScope:['Primaria'],active:true},
      {id:'s2',label:'2ª',start:'10:00',end:'11:00',type:'teaching',stageScope:['Primaria'],active:true},
    ]},
    subjects:[
      {id:'m1',name:'Lengua',code:'LEN',stage:'Primaria',type:'common',defaultSessionMinutes:60,active:true},
      {id:'m2',name:'Mates',code:'MAT',stage:'Primaria',type:'common',defaultSessionMinutes:60,active:true},
    ],
    studyPlan:[
      {id:'p1',groupId:'g1',subjectId:'m1',weeklySessions:1,mandatory:true,mode:'ordinary',teacherRequirement:'any',teacherId:'t1',fixedSessionMinutes:null,notes:'',active:true},
      {id:'p2',groupId:'g1',subjectId:'m2',weeklySessions:1,mandatory:true,mode:'ordinary',teacherRequirement:'any',teacherId:'t2',fixedSessionMinutes:null,notes:'',active:true},
    ],
    teachers:[
      {id:'t1',name:'Ana',status:'confirmed',employmentType:'full',specialties:['Primaria'],roles:[],weeklyTeachingMinutes:300,dedications:[],active:true},
      {id:'t2',name:'Luis',status:'confirmed',employmentType:'full',specialties:['Primaria'],roles:[],weeklyTeachingMinutes:300,dedications:[],active:true},
    ],
    assignments:[
      {id:'a1',groupId:'g1',subjectId:'m1',teacherId:'t1',assignmentType:'main',weeklySessions:1,weeklyMinutes:60,fixedSlots:[],active:true},
      {id:'a2',groupId:'g1',subjectId:'m2',teacherId:'t2',assignmentType:'main',weeklySessions:1,weeklyMinutes:60,fixedSlots:[],active:true},
    ],
  }
}

function reference():GenerationRun{
  return {
    id:'reference',createdAt:'2026-10-26T00:00:00.000Z',status:'complete',score:10000,hardViolations:0,softPenalty:0,
    placedSessions:2,requestedSessions:2,entries:[
      {id:'r1',assignmentId:'a1',groupId:'g1',subjectId:'m1',teacherId:'t1',day:'L',sessionId:'s1'},
      {id:'r2',assignmentId:'a2',groupId:'g1',subjectId:'m2',teacherId:'t2',day:'L',sessionId:'s2'},
    ],notes:[],
  }
}

describe('reference based generation',()=>{
  it('keeps a valid reference unchanged in minimum change mode',()=>{
    const project=fixture()
    const result=generateSchedule(project,20,0,{strategy:'minimum_change',referenceRun:reference(),moveCost:40})
    expect(result.status).toBe('complete')
    expect(result.referenceRunId).toBe('reference')
    expect(result.generationStrategy).toBe('minimum_change')
    expect(result.changeCount).toBe(0)
  })

  it('respects a position lock during generation',()=>{
    const project=fixture()
    project.scheduleLocks=[{
      id:'lock-1',assignmentId:'a1',day:'L',sessionId:'s2',teacherId:'t1',mode:'position',createdAt:'2026-10-26T00:00:00.000Z',
    }]
    const result=generateSchedule(project,20,3,{strategy:'optimize'})
    expect(result.status).toBe('complete')
    expect(result.entries.some(entry=>entry.assignmentId==='a1'&&entry.sessionId==='s2')).toBe(true)
  })
})
