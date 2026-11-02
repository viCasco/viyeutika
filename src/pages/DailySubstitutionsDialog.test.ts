import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECT, type SubstitutionRecord, type ViyeuticaProject } from '../domain/project'
import { substitutionsForDay } from './DailySubstitutionsDialog'

const first:SubstitutionRecord={
  id:'one',date:'2026-11-02',sessionId:'s2',
  absentTeacherId:'a',substituteTeacherId:'b',
  groupId:'g',assignmentId:'x',coverageType:'substitute',
  status:'planned',notes:'',createdAt:'',
}
const second:SubstitutionRecord={...first,id:'two',sessionId:'s1',status:'completed'}
const third:SubstitutionRecord={...first,id:'three',date:'2026-11-03'}
const fixture:ViyeuticaProject={
  ...structuredClone(EMPTY_PROJECT),
  schedule:{activeDays:['L','M'],mode:'morning',blocks:[
    {id:'s1',label:'Primera',start:'09:00',end:'10:00',type:'teaching',stageScope:['Primaria'],active:true},
    {id:'s2',label:'Segunda',start:'10:00',end:'11:00',type:'teaching',stageScope:['Primaria'],active:true},
  ]},
  substitutionRecords:[first,second,third],
}
describe('resumen diario de sustituciones',()=>{
  it('includes planned and completed records only for requested date in session order',()=>{
    expect(substitutionsForDay(fixture,'2026-11-02').map(r=>r.id)).toEqual(['two','one'])
  })
  it('does not combine separate dates or alter the historic records',()=>{
    const snapshot=JSON.stringify(fixture.substitutionRecords)
    expect(substitutionsForDay(fixture,'2026-11-03').map(r=>r.id)).toEqual(['three'])
    expect(substitutionsForDay(fixture,'2026-11-04')).toEqual([])
    expect(JSON.stringify(fixture.substitutionRecords)).toBe(snapshot)
  })
})
