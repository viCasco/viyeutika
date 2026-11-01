import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECT, type GenerationRun, type ViyeuticaProject } from '../domain/project'
import { candidatesForFilter, candidatesForSlot } from './SubstitutionsPage'

const run: GenerationRun = {
  id: 'test', createdAt: '', status: 'complete', score: 0, hardViolations: 0,
  softPenalty: 0, placedSessions: 1, requestedSessions: 1, notes: [],
  entries: [{ id: 'e1', assignmentId: 'a1', groupId: 'g1', subjectId: 's1', teacherId: 't1', day: 'L', sessionId: 'h1' }],
}

function fixture(): ViyeuticaProject {
  return {
    ...EMPTY_PROJECT,
    groups: [{ id:'g1', name:'1.º', stage:'Primaria', level:'1.º', line:'A', students:null, classroom:'',
      combined:false,linkedGroupIds:[],tutorTeacherId:null,notes:'',active:true }],
    subjects: [{ id:'s1', name:'Lengua', code:'LEN', stage:'Primaria', type:'common', defaultSessionMinutes:null,active:true }],
    teachers: ['t1','t2','t3','t4','t5'].map(id=>({
      id,name:id,status:'confirmed' as const,employmentType:'full' as const,
      specialties:[],roles:[],weeklyTeachingMinutes:null,active:true,
    })),
    teacherAvailability: [
      { teacherId:'t3', day:'L', session:'h1', status:'unavailable', detail:'Reducción' },
      { teacherId:'t4', day:'L', session:'h1', status:'avoid', detail:'' },
      { teacherId:'t5', day:'L', session:'h1', status:'travel', detail:'Otro centro' },
    ],
  }
}

describe('candidatesForSlot', () => {
  it('separates assigned, free, SOFT and HARD availability without mutating the run', () => {
    const project = fixture()
    const before = JSON.stringify(run)
    const result = candidatesForSlot(project, run, 'L', 'h1')
    expect(Object.fromEntries(result.map(item=>[item.id,item.status]))).toEqual({
      t1:'busy', t2:'free', t3:'blocked', t4:'avoid', t5:'blocked',
    })
    expect(result.find(item=>item.id==='t1')?.detail).toContain('Lengua')
    expect(JSON.stringify(run)).toBe(before)
  })

  it('reports teachers without classes on another day as free', () => {
    const result = candidatesForSlot(fixture(),run,'M','h1')
    expect(result.every(item=>item.status==='free')).toBe(true)
  })

  it('ignores inactive teachers', () => {
    const project=fixture()
    project.teachers[1].active=false
    expect(candidatesForSlot(project,run,'L','h1').some(item=>item.id==='t2')).toBe(false)
  })
})

describe('candidatesForFilter', () => {
  it('filters available, no-class and all across the same slot', () => {
    const candidates = candidatesForSlot(fixture(), run, 'L', 'h1')
    expect(candidatesForFilter(candidates, 'available').map(candidate=>candidate.id)).toEqual(['t2','t4'])
    expect(candidatesForFilter(candidates, 'no-class').map(candidate=>candidate.id)).toEqual(['t2','t3','t4','t5'])
    expect(candidatesForFilter(candidates, 'all')).toHaveLength(5)
  })

  it('does not mutate the source candidates', () => {
    const candidates = candidatesForSlot(fixture(), run, 'L', 'h1')
    const before = JSON.stringify(candidates)
    candidatesForFilter(candidates, 'available')
    expect(JSON.stringify(candidates)).toBe(before)
  })
})
