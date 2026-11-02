import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECT, type GeneratedScheduleEntry, type ViyeuticaProject } from '../domain/project'
import { coverageOptions, dateForWeekday, isSubstituteEligible } from './SessionSubstitutionRegister'

const entry:GeneratedScheduleEntry={
  id:'e1',assignmentId:'a1',groupId:'g1',subjectId:'s1',teacherId:'t1',day:'L',sessionId:'h1',
}
function fixture():ViyeuticaProject{
  return {
    ...structuredClone(EMPTY_PROJECT),
    schedule:{activeDays:['L'],mode:'morning',blocks:[{id:'h1',label:'1ª',start:'09:00',end:'10:00',type:'teaching',stageScope:['Primaria'],active:true}]},
    groups:[{id:'g1',name:'1.º',stage:'Primaria',level:'1.º',line:'A',students:null,classroom:'',combined:false,linkedGroupIds:[],tutorTeacherId:null,notes:'',active:true}],
    subjects:[{id:'s1',name:'Lengua',code:'LEN',stage:'Primaria',type:'common',defaultSessionMinutes:null,active:true}],
    teachers:['t1','t2','t3','t4','t5'].map(t=>({id:t,name:t,status:'confirmed' as const,employmentType:'full' as const,specialties:[],roles:[],weeklyTeachingMinutes:null,active:true})),
    assignments:[
      {id:'a1',groupId:'g1',subjectId:'s1',teacherId:'t1',assignmentType:'main',weeklySessions:1,weeklyMinutes:60,active:true},
      {id:'a2',groupId:'g1',subjectId:'s1',teacherId:'t3',assignmentType:'co_teaching',weeklySessions:1,weeklyMinutes:60,active:true},
    ],
    establishedScheduleRun:{
      id:'official',createdAt:'',status:'complete',score:100,hardViolations:0,softPenalty:0,
      placedSessions:2,requestedSessions:2,notes:[],
      entries:[entry,{...entry,id:'e2',assignmentId:'a2',teacherId:'t3'}],
    },
    teacherAvailability:[{teacherId:'t4',day:'L',session:'h1',status:'unavailable',detail:'Fuera del centro'}],
  }
}
describe('Cobertura de sustituciones por sesión',()=>{
  it('keeps a pre-existing co-teacher as a coverage option',()=>{
    const options=coverageOptions(fixture(),'2026-11-02',entry)
    expect(options.some(o=>o.id==='co:t3'&&o.kind==='co_teacher')).toBe(true)
  })
  it('excludes busy and unavailable colleagues, but accepts a free teacher',()=>{
    const p=fixture()
    expect(isSubstituteEligible(p,'2026-11-02',entry,'t3')).toBe(false)
    expect(isSubstituteEligible(p,'2026-11-02',entry,'t4')).toBe(false)
    expect(isSubstituteEligible(p,'2026-11-02',entry,'t2')).toBe(true)
  })
  it('blocks another coverage and respects the actual weekday',()=>{
    const p=fixture()
    p.substitutionRecords=[{id:'r1',date:'2026-11-02',sessionId:'h1',
      absentTeacherId:'t5',groupId:'g1',assignmentId:'a1',substituteTeacherId:'t2',
      coverageType:'substitute',status:'planned',notes:'',createdAt:''}]
    expect(isSubstituteEligible(p,'2026-11-02',entry,'t2')).toBe(false)
    expect(isSubstituteEligible(p,'2026-11-03',entry,'t5')).toBe(false)
  })
})

describe('fecha sugerida desde la cuadrícula',()=>{
  const monday=new Date(2026,10,2,14,30)
  it('uses today when the clicked day is today',()=>{
    expect(dateForWeekday('L',monday)).toBe('2026-11-02')
  })
  it('moves forward within the current week',()=>{
    expect(dateForWeekday('M',monday)).toBe('2026-11-03')
    expect(dateForWeekday('V',monday)).toBe('2026-11-06')
  })
  it('uses the next week for past weekdays',()=>{
    expect(dateForWeekday('L',new Date(2026,10,3))).toBe('2026-11-09')
  })
  it('handles a month boundary without UTC offset',()=>{
    expect(dateForWeekday('L',new Date(2026,10,29))).toBe('2026-11-30')
  })
})
