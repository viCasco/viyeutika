import { EMPTY_PROJECT, type ViyeuticaProject } from '../domain/project'

const STORAGE_KEY = 'viyeutica.project.v1'
export const PROJECT_UPDATED_EVENT = 'viyeutica:project-updated'

export function loadProject(): ViyeuticaProject {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(EMPTY_PROJECT)
    const parsed = JSON.parse(raw) as Partial<ViyeuticaProject>
    if (parsed.schemaVersion !== 1) return structuredClone(EMPTY_PROJECT)
    const generationRuns=Array.isArray(parsed.generationRuns) ? parsed.generationRuns : []
    const selectedGenerationRunId=
      parsed.selectedGenerationRunId &&
      generationRuns.some(run=>run.id===parsed.selectedGenerationRunId)
        ? parsed.selectedGenerationRunId
        : null
    const draftScheduleRun=
      parsed.draftScheduleRun &&
      typeof parsed.draftScheduleRun==='object' &&
      Array.isArray(parsed.draftScheduleRun.entries)
        ? parsed.draftScheduleRun
        : null
    const draftScheduleSavedAt=
      typeof parsed.draftScheduleSavedAt==='string'
        ? parsed.draftScheduleSavedAt
        : null
    const establishedScheduleRun=
      parsed.establishedScheduleRun &&
      typeof parsed.establishedScheduleRun==='object' &&
      Array.isArray(parsed.establishedScheduleRun.entries)
        ? parsed.establishedScheduleRun
        : null
    const establishedScheduleSavedAt=
      typeof parsed.establishedScheduleSavedAt==='string'
        ? parsed.establishedScheduleSavedAt
        : null
    return {
      ...structuredClone(EMPTY_PROJECT),
      ...parsed,
      center: { ...structuredClone(EMPTY_PROJECT.center), ...(parsed.center ?? {}) },
      academicYear: { ...EMPTY_PROJECT.academicYear, ...(parsed.academicYear ?? {}) },
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
      studyPlan: Array.isArray(parsed.studyPlan) ? parsed.studyPlan : [],
      teachers: Array.isArray(parsed.teachers)
        ? parsed.teachers.map(teacher=>({...teacher,dedications:Array.isArray(teacher.dedications)?teacher.dedications:[]}))
        : [],
      teacherAvailability: Array.isArray(parsed.teacherAvailability) ? parsed.teacherAvailability : [],
      assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [],
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      generationRuns,
      selectedGenerationRunId,
      draftScheduleRun,
      draftScheduleSavedAt,
      establishedScheduleRun,
      establishedScheduleSavedAt,
      normativeSources: Array.isArray(parsed.normativeSources) ? parsed.normativeSources : [],
      normativeRules: Array.isArray(parsed.normativeRules) ? parsed.normativeRules : [],
      schedule: {
        ...structuredClone(EMPTY_PROJECT.schedule),
        ...(parsed.schedule ?? {}),
        activeDays: Array.isArray(parsed.schedule?.activeDays) ? parsed.schedule!.activeDays : [...EMPTY_PROJECT.schedule.activeDays],
        blocks: Array.isArray(parsed.schedule?.blocks) ? parsed.schedule!.blocks : [],
      },
    }
  } catch {
    return structuredClone(EMPTY_PROJECT)
  }
}

function configurationFingerprint(project:ViyeuticaProject){
  const {
    generationRuns:_generationRuns,
    selectedGenerationRunId:_selectedGenerationRunId,
    updatedAt:_updatedAt,
    ...configuration
  }=project
  return JSON.stringify(configuration)
}

export function saveProject(
  project: ViyeuticaProject,
  options:{preserveGeneration?:boolean}={},
) {
  let nextProject=project
  if(!options.preserveGeneration){
    try{
      const raw=window.localStorage.getItem(STORAGE_KEY)
      if(raw){
        const current=JSON.parse(raw) as ViyeuticaProject
        if(
          current.schemaVersion===1 &&
          configurationFingerprint(current)!==configurationFingerprint(project)
        ){
          nextProject={...project,generationRuns:[],selectedGenerationRunId:null}
        }
      }
    }catch{
      // Si el estado previo no puede leerse, se guarda el nuevo proyecto tal como llega.
    }
  }
  const next = { ...nextProject, updatedAt: new Date().toISOString() }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(PROJECT_UPDATED_EVENT, { detail: next }))
  return next
}

export function resetProject() {
  window.localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new CustomEvent(PROJECT_UPDATED_EVENT, { detail: structuredClone(EMPTY_PROJECT) }))
}
