import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECT, type ViyeuticaProject } from './project'
import { applyBulkRows, parseBulkRows } from './bulkEdit'

function fixture():ViyeuticaProject{
  return {
    ...structuredClone(EMPTY_PROJECT),
    groups:[{id:'g1',name:'1A',stage:'Primaria',level:'1.º Primaria',line:'A',students:20,classroom:'',combined:false,linkedGroupIds:[],tutorTeacherId:null,notes:'',active:true}],
    subjects:[{id:'m1',name:'Lengua',code:'LEN',stage:'Primaria',type:'common',defaultSessionMinutes:60,active:true}],
    teachers:[{id:'t1',name:'Ana',status:'confirmed',employmentType:'full',specialties:['Primaria'],roles:[],weeklyTeachingMinutes:600,dedications:[],active:true}],
  }
}

describe('bulk editing',()=>{
  it('flags unknown references while preserving valid rows',()=>{
    const project=fixture()
    const rows=parseBulkRows(project,'assignments','1A\tLengua\tAna\tmain\t5\t\nGrupo inexistente\tLengua\tAna\tmain\t5\t')
    expect(rows).toHaveLength(2)
    expect(rows[0].valid).toBe(true)
    expect(rows[1].valid).toBe(false)
    const next=applyBulkRows(project,'assignments',rows)
    expect(next.assignments).toHaveLength(1)
    expect(next.assignments[0].groupId).toBe('g1')
  })

  it('upserts identical teacher names instead of duplicating them',()=>{
    const project=fixture()
    const rows=parseBulkRows(project,'teachers','Ana\tPrimaria;Inglés\t720\tfull')
    const next=applyBulkRows(project,'teachers',rows)
    expect(next.teachers).toHaveLength(1)
    expect(next.teachers[0].weeklyTeachingMinutes).toBe(720)
  })
})
