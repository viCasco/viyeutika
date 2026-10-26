import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECT, type GenerationRun, type ViyeuticaProject } from './project'
import { operationalScheduleForDate } from './temporaryOperations'

function fixture():ViyeuticaProject{
  const base:GenerationRun={
    id:'official',createdAt:'2026-10-26T00:00:00.000Z',status:'complete',score:10000,hardViolations:0,softPenalty:0,
    placedSessions:1,requestedSessions:1,notes:[],entries:[
      {id:'e1',assignmentId:'a1',groupId:'g1',subjectId:'m1',teacherId:'t1',day:'L',sessionId:'s1'},
    ],
  }
  return {
    ...structuredClone(EMPTY_PROJECT),
    groups:[{id:'g1',name:'1A',stage:'Primaria',level:'1.º Primaria',line:'A',students:20,classroom:'',combined:false,linkedGroupIds:[],tutorTeacherId:null,notes:'',active:true}],
    schedule:{activeDays:['L'],mode:'morning',blocks:[{id:'s1',label:'1ª',start:'09:00',end:'10:00',type:'teaching',stageScope:['Primaria'],active:true}]},
    subjects:[{id:'m1',name:'Lengua',code:'LEN',stage:'Primaria',type:'common',defaultSessionMinutes:60,active:true}],
    teachers:[
      {id:'t1',name:'Ana',status:'confirmed',employmentType:'full',specialties:['Primaria'],roles:[],weeklyTeachingMinutes:600,dedications:[],active:true},
      {id:'t2',name:'Luis',status:'confirmed',employmentType:'full',specialties:['Primaria'],roles:[],weeklyTeachingMinutes:600,dedications:[],active:true},
    ],
    studyPlan:[{id:'p1',groupId:'g1',subjectId:'m1',weeklySessions:1,mandatory:true,mode:'ordinary',teacherRequirement:'any',teacherId:'t1',fixedSessionMinutes:null,notes:'',active:true}],
    assignments:[{id:'a1',groupId:'g1',subjectId:'m1',teacherId:'t1',assignmentType:'main',weeklySessions:1,weeklyMinutes:60,active:true}],
    establishedScheduleRun:base,
  }
}

describe('temporary schedule operations',()=>{
  it('applies a substitution only inside its validity period',()=>{
    const project=fixture()
    project.temporaryChanges=[{
      id:'tmp1',kind:'substitution',startDate:'2026-11-01',endDate:'2026-11-05',teacherId:'t1',substituteTeacherId:'t2',
      notes:'Baja',active:true,createdAt:'2026-10-26T00:00:00.000Z',
    }]
    expect(operationalScheduleForDate(project,'2026-11-03')?.entries[0].teacherId).toBe('t2')
    expect(operationalScheduleForDate(project,'2026-11-10')?.entries[0].teacherId).toBe('t1')
    expect(project.establishedScheduleRun?.entries[0].teacherId).toBe('t1')
  })

  it('reverts automatically when a temporary change is paused',()=>{
    const project=fixture()
    project.temporaryChanges=[{
      id:'tmp1',kind:'substitution',startDate:'2026-11-01',endDate:'2026-11-05',teacherId:'t1',substituteTeacherId:'t2',
      notes:'',active:false,createdAt:'2026-10-26T00:00:00.000Z',
    }]
    expect(operationalScheduleForDate(project,'2026-11-03')?.entries[0].teacherId).toBe('t1')
  })
})
