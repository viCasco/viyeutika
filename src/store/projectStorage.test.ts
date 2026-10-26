import { beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_PROJECT, type GenerationRun, type ViyeuticaProject } from '../domain/project'
import { loadProject, saveProject } from './projectStorage'

class MemoryStorage {
  private data = new Map<string,string>()
  getItem(key:string){ return this.data.get(key) ?? null }
  setItem(key:string,value:string){ this.data.set(key,value) }
  removeItem(key:string){ this.data.delete(key) }
  clear(){ this.data.clear() }
}

const storage = new MemoryStorage()

Object.defineProperty(globalThis,'window',{
  configurable:true,
  value:{
    localStorage:storage,
    dispatchEvent:()=>true,
  },
})

const run:GenerationRun={
  id:'run-1',
  createdAt:'2026-10-26T00:00:00.000Z',
  status:'complete',
  score:100,
  hardViolations:0,
  softPenalty:0,
  placedSessions:1,
  requestedSessions:1,
  entries:[{
    id:'entry-1',
    assignmentId:'assignment-1',
    groupId:'group-1',
    subjectId:'subject-1',
    teacherId:'teacher-1',
    day:'L',
    sessionId:'session-1',
  }],
  notes:[],
}

function projectWithArtifacts():ViyeuticaProject{
  return {
    ...structuredClone(EMPTY_PROJECT),
    center:{...structuredClone(EMPTY_PROJECT.center),name:'Centro de prueba'},
    generationRuns:[structuredClone(run)],
    selectedGenerationRunId:run.id,
    generationNeedsRevalidation:false,
    draftScheduleRun:structuredClone(run),
    draftScheduleSavedAt:'2026-10-26T00:00:00.000Z',
    draftScheduleNeedsRevalidation:false,
    establishedScheduleRun:structuredClone(run),
    establishedScheduleSavedAt:'2026-10-26T00:00:00.000Z',
    establishedScheduleNeedsRevalidation:false,
  }
}

describe('project persistence policy',()=>{
  beforeEach(()=>storage.clear())

  it('preserves proposals and marks all schedule artifacts when configuration changes',()=>{
    const original=projectWithArtifacts()
    saveProject(original,{intent:'replace_project'})

    saveProject({
      ...original,
      center:{...original.center,locality:'Almendralejo'},
    })

    const reloaded=loadProject()
    expect(reloaded.generationRuns).toHaveLength(1)
    expect(reloaded.selectedGenerationRunId).toBe(run.id)
    expect(reloaded.draftScheduleRun?.id).toBe(run.id)
    expect(reloaded.establishedScheduleRun?.id).toBe(run.id)
    expect(reloaded.generationNeedsRevalidation).toBe(true)
    expect(reloaded.draftScheduleNeedsRevalidation).toBe(true)
    expect(reloaded.establishedScheduleNeedsRevalidation).toBe(true)
  })

  it('keeps persistence state across reloads',()=>{
    const project=projectWithArtifacts()
    project.generationNeedsRevalidation=true
    project.draftScheduleNeedsRevalidation=true
    saveProject(project,{intent:'replace_project'})

    const reloaded=loadProject()
    expect(reloaded.generationNeedsRevalidation).toBe(true)
    expect(reloaded.draftScheduleNeedsRevalidation).toBe(true)
    expect(reloaded.generationRuns[0]?.id).toBe(run.id)
  })

  it('loads legacy projects without freshness fields as current',()=>{
    window.localStorage.setItem('viyeutica.project.v1',JSON.stringify({
      ...projectWithArtifacts(),
      generationNeedsRevalidation:undefined,
      draftScheduleNeedsRevalidation:undefined,
      establishedScheduleNeedsRevalidation:undefined,
    }))

    const reloaded=loadProject()
    expect(reloaded.generationNeedsRevalidation).toBe(false)
    expect(reloaded.draftScheduleNeedsRevalidation).toBe(false)
    expect(reloaded.establishedScheduleNeedsRevalidation).toBe(false)
  })

  it('does not compare a replacement project against the previous course or import',()=>{
    saveProject(projectWithArtifacts(),{intent:'replace_project'})
    const imported=projectWithArtifacts()
    imported.academicYear={id:'2027-2028',label:'2027/2028',startYear:2027,endYear:2028}

    saveProject(imported,{intent:'replace_project'})
    const reloaded=loadProject()
    expect(reloaded.academicYear.id).toBe('2027-2028')
    expect(reloaded.generationNeedsRevalidation).toBe(false)
    expect(reloaded.generationRuns).toHaveLength(1)
  })

  it('clears only proposals when the user explicitly cleans proposals',()=>{
    const project=projectWithArtifacts()
    saveProject(project,{intent:'replace_project'})

    saveProject({
      ...project,
      generationRuns:[],
      selectedGenerationRunId:null,
    },{intent:'clear_proposals'})

    const reloaded=loadProject()
    expect(reloaded.generationRuns).toHaveLength(0)
    expect(reloaded.selectedGenerationRunId).toBeNull()
    expect(reloaded.draftScheduleRun?.id).toBe(run.id)
    expect(reloaded.establishedScheduleRun?.id).toBe(run.id)
    expect(reloaded.generationNeedsRevalidation).toBe(false)
  })
})
