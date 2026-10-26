import { EMPTY_PROJECT, type ViyeuticaProject } from '../domain/project'

const STORAGE_KEY = 'viyeutica.project.v1'
export const PROJECT_UPDATED_EVENT = 'viyeutica:project-updated'

export function loadProject(): ViyeuticaProject {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(EMPTY_PROJECT)
    const parsedWithLegacy = JSON.parse(raw) as Partial<ViyeuticaProject> & {collaboration?:unknown}
    if (parsedWithLegacy.schemaVersion !== 1) return structuredClone(EMPTY_PROJECT)
    const {collaboration:_legacyCollaboration,...parsed}=parsedWithLegacy
    const generationRuns=Array.isArray(parsed.generationRuns) ? parsed.generationRuns : []
    const draftScheduleRun=
      parsed.draftScheduleRun &&
      typeof parsed.draftScheduleRun==='object' &&
      Array.isArray(parsed.draftScheduleRun.entries)
        ? parsed.draftScheduleRun
        : null
    const selectedGenerationRunId=
      parsed.selectedGenerationRunId &&
      (
        generationRuns.some(run=>run.id===parsed.selectedGenerationRunId) ||
        draftScheduleRun?.id===parsed.selectedGenerationRunId ||
        parsed.establishedScheduleRun?.id===parsed.selectedGenerationRunId
      )
        ? parsed.selectedGenerationRunId
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
      teacherAvailability: Array.isArray(parsed.teacherAvailability)
        ? parsed.teacherAvailability.map(item=>({
            ...item,
            status:String((item as {status?:string}).status)==='assigned'?'available':item.status,
          })) as ViyeuticaProject['teacherAvailability']
        : [],
      assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [],
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      scheduleLocks: Array.isArray(parsed.scheduleLocks) ? parsed.scheduleLocks : [],
      generationRuns,
      selectedGenerationRunId,
      generationNeedsRevalidation: Boolean(parsed.generationNeedsRevalidation),
      draftScheduleRun,
      draftScheduleSavedAt,
      draftScheduleNeedsRevalidation: Boolean(parsed.draftScheduleNeedsRevalidation),
      establishedScheduleRun,
      establishedScheduleSavedAt,
      establishedScheduleNeedsRevalidation: Boolean(parsed.establishedScheduleNeedsRevalidation),
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

export type ProjectSaveIntent =
  | 'configuration'
  | 'generation'
  | 'selection'
  | 'draft'
  | 'established'
  | 'revalidation'
  | 'clear_proposals'
  | 'replace_project'

function configurationFingerprint(project:ViyeuticaProject){
  const legacyProject=project as ViyeuticaProject & {collaboration?:unknown}
  const {
    collaboration:_legacyCollaboration,
    generationRuns:_generationRuns,
    selectedGenerationRunId:_selectedGenerationRunId,
    generationNeedsRevalidation:_generationNeedsRevalidation,
    draftScheduleRun:_draftScheduleRun,
    draftScheduleSavedAt:_draftScheduleSavedAt,
    draftScheduleNeedsRevalidation:_draftScheduleNeedsRevalidation,
    establishedScheduleRun:_establishedScheduleRun,
    establishedScheduleSavedAt:_establishedScheduleSavedAt,
    establishedScheduleNeedsRevalidation:_establishedScheduleNeedsRevalidation,
    updatedAt:_updatedAt,
    ...configuration
  }=project
  return JSON.stringify(configuration)
}

function markArtifactsForRevalidation(project:ViyeuticaProject):ViyeuticaProject {
  return {
    ...project,
    generationNeedsRevalidation: project.generationRuns.length > 0,
    draftScheduleNeedsRevalidation: Boolean(project.draftScheduleRun),
    establishedScheduleNeedsRevalidation: Boolean(project.establishedScheduleRun),
  }
}

export function saveProject(
  project: ViyeuticaProject,
  options:{intent?:ProjectSaveIntent;preserveGeneration?:boolean}={},
) {
  const intent=options.intent ?? (options.preserveGeneration ? 'replace_project' : 'configuration')
  let nextProject=project

  if(intent==='configuration'){
    try{
      const raw=window.localStorage.getItem(STORAGE_KEY)
      if(raw){
        const current=JSON.parse(raw) as ViyeuticaProject
        if(
          current.schemaVersion===1 &&
          configurationFingerprint(current)!==configurationFingerprint(project)
        ){
          nextProject=markArtifactsForRevalidation(project)
        }
      }
    }catch{
      // Si el estado previo no puede leerse, se guarda el nuevo proyecto tal como llega.
    }
  }

  if(intent==='generation'){
    nextProject={...nextProject,generationNeedsRevalidation:false}
  }else if(intent==='draft'){
    nextProject={...nextProject,draftScheduleNeedsRevalidation:false}
  }else if(intent==='established'){
    nextProject={
      ...nextProject,
      establishedScheduleNeedsRevalidation:false,
      draftScheduleNeedsRevalidation:nextProject.draftScheduleRun ? nextProject.draftScheduleNeedsRevalidation : false,
    }
  }else if(intent==='clear_proposals'){
    nextProject={...nextProject,generationNeedsRevalidation:false}
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
