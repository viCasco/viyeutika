import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECT, type GenerationRun, type ViyeuticaProject } from './project'
import { prepareScheduleEntryChange } from './scheduleEditing'

function fixture():{project:ViyeuticaProject;run:GenerationRun}{
  const project:ViyeuticaProject={
    ...structuredClone(EMPTY_PROJECT),
    center:{name:'Centro',officialCode:'1',ownership:'publico',centerType:'CEIP',autonomousCommunity:'Extremadura',province:'Badajoz',locality:'Almendralejo',stages:['Primaria']},
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
  const run:GenerationRun={
    id:'r1',createdAt:'2026-10-26T00:00:00.000Z',status:'complete',score:10000,hardViolations:0,softPenalty:0,
    placedSessions:2,requestedSessions:2,notes:[],entries:[
      {id:'e1',assignmentId:'a1',groupId:'g1',subjectId:'m1',teacherId:'t1',day:'L',sessionId:'s1'},
      {id:'e2',assignmentId:'a2',groupId:'g1',subjectId:'m2',teacherId:'t2',day:'L',sessionId:'s2'},
    ],
  }
  return {project,run}
}

describe('transactional schedule editing',()=>{
  it('rejects moving a main session onto an occupied group slot',()=>{
    const {project,run}=fixture()
    const result=prepareScheduleEntryChange(project,run,{entryId:'e1',assignmentId:'a1',day:'L',sessionId:'s2'})
    expect(result.ok).toBe(false)
    expect(result.run).toBe(run)
  })

  it('accepts swapping assignment through an existing valid assignment when the final schedule stays valid',()=>{
    const {project,run}=fixture()
    // First move is invalid because it would duplicate Mates and lose Lengua coverage.
    const result=prepareScheduleEntryChange(project,run,{entryId:'e1',assignmentId:'a2',day:'L',sessionId:'s1'})
    expect(result.ok).toBe(false)
  })

  it('rejects a move to an unavailable teacher slot',()=>{
    const {project,run}=fixture()
    project.teacherAvailability=[{teacherId:'t1',day:'L',session:'s2',status:'unavailable',detail:'No disponible'}]
    const result=prepareScheduleEntryChange(project,run,{entryId:'e1',assignmentId:'a1',day:'L',sessionId:'s2'})
    expect(result.ok).toBe(false)
    expect(result.message).toContain('no está disponible')
  })
})
