import {describe,expect,it} from 'vitest'
import {EMPTY_PROJECT, type GeneratedScheduleEntry, type SubstitutionRecord, type ViyeuticaProject} from './project'
import {coverageState, eligibleReplacement, confirmSubstitution, isTeacherAbsent, reassignSubstitution, registerTeacherAbsence} from './substitutionCoverage'

const entry:GeneratedScheduleEntry={id:'entry',assignmentId:'a',groupId:'g',subjectId:'s',teacherId:'absent',day:'L',sessionId:'session'}
const base:SubstitutionRecord={
  id:'coverage',date:'2026-11-02',sessionId:'session',absentTeacherId:'absent',substituteTeacherId:'replacement',
  assignmentId:'a',groupId:'g',coverageType:'substitute',status:'planned',notes:'',createdAt:'2026-11-02T08:00:00Z',
}
function fixture():ViyeuticaProject{
  return {...structuredClone(EMPTY_PROJECT),
    schedule:{activeDays:['L'],mode:'morning',blocks:[
      {id:'session',label:'1ª',start:'09:00',end:'10:00',type:'teaching',stageScope:['Primaria'],active:true},
      {id:'session2',label:'2ª',start:'10:00',end:'11:00',type:'teaching',stageScope:['Primaria'],active:true},
    ]},
    teachers:['absent','replacement','new','other'].map(id=>({
      id,name:id,active:true,status:'confirmed' as const,employmentType:'full' as const,specialties:[],roles:[],weeklyTeachingMinutes:null,
    })),
    establishedScheduleRun:{id:'official',createdAt:'',status:'complete',score:100,hardViolations:0,softPenalty:0,
      placedSessions:1,requestedSessions:1,notes:[],entries:[entry]},
    substitutionRecords:[{...base}],
  }
}
const absent=(project:ViyeuticaProject,teacher='replacement',sessionIds=['session'])=>registerTeacherAbsence(project,{
  id:'absence1',teacherId:teacher,date:'2026-11-02',sessionIds,
  notes:'Ausencia sobrevenida',createdAt:'2026-11-02T08:30:00Z',
})
describe('validación en cascada de sustituciones',()=>{
  it('marca como pendiente una cobertura previamente asignada al docente ausente',()=>{
    const p=absent(fixture())
    expect(isTeacherAbsent(p,'replacement','2026-11-02','session')).toBe(true)
    expect(coverageState(p,p.substitutionRecords[0])).toBe('needs_reassignment')
    expect(p.substitutionRecords[0].substituteTeacherId).toBe('replacement')
    expect(p.establishedScheduleRun?.entries).toEqual([entry])
  })
  it('solo afecta las sesiones y fechas incluidas en la ausencia',()=>{
    const p=fixture()
    p.substitutionRecords.push({...base,id:'second',sessionId:'session2'})
    const next=absent(p)
    expect(next.substitutionRecords[0].status).toBe('needs_reassignment')
    expect(next.substitutionRecords[1].status).toBe('planned')
    expect(isTeacherAbsent(next,'replacement','2026-11-03','session')).toBe(false)
    expect(isTeacherAbsent(next,'replacement','2026-11-02','session2')).toBe(false)
  })
  it('bloquea la confirmación mientras la cobertura siga pendiente',()=>{
    const p=absent(fixture())
    expect(()=>confirmSubstitution(p,'coverage','2026-11-02T09:00:00Z')).toThrow()
    expect(eligibleReplacement(p,p.substitutionRecords[0],'replacement','substitute')).toBe(false)
  })
  it('reasigna sin borrar el sustituto anterior y conserva el historial de cambios',()=>{
    const p=absent(fixture())
    const after=reassignSubstitution(p,'coverage','new','substitute','Ausencia del sustituto','2026-11-02T08:45:00Z')
    expect(coverageState(after,after.substitutionRecords[0])).toBe('planned')
    expect(after.substitutionRecords[0].reassignmentHistory).toEqual([{
      previousTeacherId:'replacement',newTeacherId:'new',
      changedAt:'2026-11-02T08:45:00Z',reason:'Ausencia del sustituto',
    }])
    expect(confirmSubstitution(after,'coverage','2026-11-02T10:00:00Z').substitutionRecords[0].status).toBe('completed')
    expect(p.substitutionRecords[0].status).toBe('needs_reassignment')
  })
  it('no sobrescribe una cobertura realizada cuando aparece una ausencia contradictoria',()=>{
    const p=fixture()
    p.substitutionRecords[0].status='completed'
    const next=absent(p)
    expect(next.substitutionRecords[0].status).toBe('completed')
    expect(coverageState(next,next.substitutionRecords[0])).toBe('review_completed')
    expect(()=>reassignSubstitution(next,'coverage','new','substitute','',new Date().toISOString())).toThrow()
  })
  it('acumula sesiones de ausencia sin duplicar el historial de ausencia',()=>{
    const p=absent(fixture())
    const next=absent(p,'replacement',['session2'])
    expect(next.substitutionAbsences).toHaveLength(1)
    expect(next.substitutionAbsences[0].sessionIds).toEqual(['session','session2'])
  })
})
