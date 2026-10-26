import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECT, type GenerationRun, type TeachingAssignment, type ViyeuticaProject } from './project'
import {
  fixedSlotsForAssignment,
  requiredSessionsForAssignment,
  validatePlacement,
  validateRunCore,
} from './validationEngine'

function baseProject():ViyeuticaProject{
  return {
    ...structuredClone(EMPTY_PROJECT),
    center:{
      name:'Centro',
      officialCode:'00000000',
      ownership:'publico',
      centerType:'CEIP',
      autonomousCommunity:'Extremadura',
      province:'Badajoz',
      locality:'Almendralejo',
      stages:['Primaria'],
    },
    groups:[{
      id:'g1',name:'1.º A',stage:'Primaria',level:'1.º Primaria',line:'A',students:20,
      classroom:'A1',combined:false,linkedGroupIds:[],tutorTeacherId:null,notes:'',active:true,
    }],
    schedule:{
      activeDays:['L'],
      mode:'morning',
      blocks:[
        {id:'s1',label:'1ª',start:'09:00',end:'10:00',type:'teaching',stageScope:['Primaria'],active:true},
        {id:'s2',label:'2ª',start:'10:00',end:'11:00',type:'teaching',stageScope:['Primaria'],active:true},
      ],
    },
    subjects:[{id:'m1',name:'Lengua',code:'LEN',stage:'Primaria',type:'common',defaultSessionMinutes:60,active:true}],
    studyPlan:[{
      id:'p1',groupId:'g1',subjectId:'m1',weeklySessions:2,mandatory:true,mode:'ordinary',
      teacherRequirement:'any',teacherId:'t1',fixedSessionMinutes:null,notes:'',active:true,
    }],
    teachers:[{
      id:'t1',name:'Ana',status:'confirmed',employmentType:'full',specialties:['Primaria'],roles:[],
      weeklyTeachingMinutes:120,dedications:[],active:true,
    }],
    assignments:[{
      id:'a1',groupId:'g1',subjectId:'m1',teacherId:'t1',assignmentType:'main',
      weeklySessions:2,weeklyMinutes:120,fixedSlots:[],active:true,
    }],
  }
}

const assignment=(project:ViyeuticaProject)=>project.assignments[0] as TeachingAssignment
const run=(entries:GenerationRun['entries']):GenerationRun=>({
  id:'r1',createdAt:'2026-10-26T00:00:00.000Z',status:'complete',score:10000,
  hardViolations:0,softPenalty:0,placedSessions:entries.length,requestedSessions:2,entries,notes:[],
})

describe('unified validation engine',()=>{
  it('uses the same required session calculation for weekly loads',()=>{
    const project=baseProject()
    expect(requiredSessionsForAssignment(project,assignment(project))).toBe(2)
  })

  it('rejects teacher overlap and blocked availability during placement',()=>{
    const project=baseProject()
    project.teacherAvailability=[{teacherId:'t1',day:'L',session:'s2',status:'unavailable',detail:'Reunión'}]
    const existing=[{
      id:'e1',assignmentId:'a1',groupId:'g1',subjectId:'m1',teacherId:'t1',day:'L' as const,sessionId:'s1',
    }]

    const overlap=validatePlacement(project,assignment(project),{day:'L',sessionId:'s1',order:0,duration:60},existing)
    expect(overlap.violations.map(item=>item.code)).toContain('TEACHER_BUSY')

    const unavailable=validatePlacement(project,assignment(project),{day:'L',sessionId:'s2',order:1,duration:60},[])
    expect(unavailable.violations.map(item=>item.code)).toContain('TEACHER_UNAVAILABLE')
  })

  it('applies structured HARD rules even when group overlap is explicitly allowed',()=>{
    const project=baseProject()
    project.rules=[{
      id:'rule-1',scope:'teacher',ruleType:'HARD',code:'NO_LUNES_2',
      description:'Evitar lunes segunda sesión',
      parameters:{conditionKind:'avoid_slot',comparison:'avoid',teacherId:'t1',day:'L',sessionId:'s2'},
      active:true,
    }]
    const result=validatePlacement(
      project,
      assignment(project),
      {day:'L',sessionId:'s2',order:1,duration:60},
      [],
      {allowGroupOverlap:true},
    )
    expect(result.allowed).toBe(false)
    expect(result.violations.some(item=>item.code==='HARD_RULE'&&item.ruleCode==='NO_LUNES_2')).toBe(true)
  })

  it('combines explicit and rule-based fixed slots without duplicates',()=>{
    const project=baseProject()
    project.assignments[0].fixedSlots=[{day:'L',session:'s1'}]
    project.rules=[{
      id:'rule-fixed',scope:'assignment',ruleType:'HARD',code:'FIJA_1',
      description:'Fijar primera sesión',
      parameters:{conditionKind:'fixed_slot',comparison:'equals',groupId:'g1',subjectId:'m1',teacherId:'t1',day:'L',sessionId:'s1'},
      active:true,
    }]
    expect(fixedSlotsForAssignment(project,assignment(project))).toEqual([{day:'L',session:'s1'}])
  })

  it('reports incomplete coverage, missed fixed slots and teacher overload in one final validation',()=>{
    const project=baseProject()
    project.teachers[0].weeklyTeachingMinutes=30
    project.assignments[0].fixedSlots=[{day:'L',session:'s2'}]
    const result=validateRunCore(project,run([{
      id:'e1',assignmentId:'a1',groupId:'g1',subjectId:'m1',teacherId:'t1',day:'L',sessionId:'s1',
    }]))
    const codes=result.map(issue=>issue.code)
    expect(codes).toContain('SESIONES_INCOMPLETAS')
    expect(codes).toContain('FRANJA_FIJA_INCUMPLIDA')
    expect(codes).toContain('CARGA_DOCENTE_EXCEDIDA')
    expect(codes).toContain('HUECO_LECTIVO_GRUPO')
  })
})
