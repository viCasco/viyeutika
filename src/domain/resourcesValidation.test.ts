import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECT, type ViyeuticaProject } from './project'
import { validatePlacement } from './validationEngine'

function projectFixture():ViyeuticaProject{
  return {
    ...structuredClone(EMPTY_PROJECT),
    groups:[{id:'g1',name:'2ESO A',stage:'ESO',level:'2.º ESO',line:'A',students:30,classroom:'',combined:false,linkedGroupIds:[],tutorTeacherId:null,notes:'',active:true}],
    subgroups:[
      {id:'sg1',parentGroupId:'g1',name:'Inglés A',students:15,participantKey:'A',active:true},
      {id:'sg2',parentGroupId:'g1',name:'Inglés B',students:15,participantKey:'B',active:true},
    ],
    spaces:[
      {id:'r1',name:'Lab 1',type:'Laboratorio',building:'A',capacity:20,shared:false,active:true},
      {id:'r2',name:'Lab 2',type:'Laboratorio',building:'B',capacity:20,shared:false,active:true},
    ],
    buildingTravelTimes:[{fromBuilding:'A',toBuilding:'B',minutes:15}],
    schedule:{activeDays:['L'],mode:'morning',blocks:[
      {id:'s1',label:'1ª',start:'09:00',end:'10:00',type:'teaching',stageScope:['ESO'],active:true},
      {id:'s2',label:'2ª',start:'10:05',end:'11:05',type:'teaching',stageScope:['ESO'],active:true},
    ]},
    subjects:[
      {id:'m1',name:'Inglés',code:'ING',stage:'ESO',type:'common',defaultSessionMinutes:60,active:true},
      {id:'m2',name:'Ciencias',code:'CIE',stage:'ESO',type:'common',defaultSessionMinutes:60,active:true},
    ],
    teachers:[
      {id:'t1',name:'Ana',status:'confirmed',employmentType:'full',specialties:['Inglés'],roles:[],weeklyTeachingMinutes:1200,dedications:[],active:true},
      {id:'t2',name:'Luis',status:'confirmed',employmentType:'full',specialties:['Inglés'],roles:[],weeklyTeachingMinutes:1200,dedications:[],active:true},
    ],
    assignments:[
      {id:'a1',groupId:'g1',subgroupId:'sg1',subjectId:'m1',teacherId:'t1',spaceId:'r1',assignmentType:'main',weeklySessions:1,weeklyMinutes:60,active:true},
      {id:'a2',groupId:'g1',subgroupId:'sg2',subjectId:'m1',teacherId:'t2',spaceId:'r2',assignmentType:'main',weeklySessions:1,weeklyMinutes:60,active:true},
      {id:'a3',groupId:'g1',subjectId:'m2',teacherId:'t1',spaceId:'r2',assignmentType:'main',weeklySessions:1,weeklyMinutes:60,active:true},
    ],
  }
}

describe('subgroups spaces and travel validation',()=>{
  it('allows different participant subgroups of the same base group simultaneously',()=>{
    const project=projectFixture()
    const existing=[{id:'e1',assignmentId:'a1',groupId:'g1',subgroupId:'sg1',subjectId:'m1',teacherId:'t1',spaceId:'r1',day:'L' as const,sessionId:'s1'}]
    const result=validatePlacement(project,project.assignments[1],{day:'L',sessionId:'s1',order:0,duration:60},existing)
    expect(result.violations.map(item=>item.code)).not.toContain('GROUP_BUSY')
    expect(result.allowed).toBe(true)
  })

  it('blocks double booking a non shared space',()=>{
    const project=projectFixture()
    project.assignments[1].spaceId='r1'
    const existing=[{id:'e1',assignmentId:'a1',groupId:'g1',subgroupId:'sg1',subjectId:'m1',teacherId:'t1',spaceId:'r1',day:'L' as const,sessionId:'s1'}]
    const result=validatePlacement(project,project.assignments[1],{day:'L',sessionId:'s1',order:0,duration:60},existing)
    expect(result.violations.map(item=>item.code)).toContain('SPACE_BUSY')
  })

  it('blocks impossible travel between consecutive buildings',()=>{
    const project=projectFixture()
    const existing=[{id:'e1',assignmentId:'a1',groupId:'g1',subgroupId:'sg1',subjectId:'m1',teacherId:'t1',spaceId:'r1',day:'L' as const,sessionId:'s1'}]
    const result=validatePlacement(project,project.assignments[2],{day:'L',sessionId:'s2',order:1,duration:60},existing)
    expect(result.violations.map(item=>item.code)).toContain('TRAVEL_TIME')
  })
})
