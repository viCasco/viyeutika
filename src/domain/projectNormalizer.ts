import {
  EMPTY_PROJECT,
  type TeachingAssignment,
  type Teacher,
  type ViyeuticaProject,
} from './project'

export function normalizeProjectData(raw:Partial<ViyeuticaProject> & {collaboration?:unknown}):ViyeuticaProject {
  const {collaboration:_legacyCollaboration,...cleanRaw}=raw
  return {
    ...structuredClone(EMPTY_PROJECT),
    ...cleanRaw,
    center:{...structuredClone(EMPTY_PROJECT.center),...(cleanRaw.center??{})},
    academicYear:{...EMPTY_PROJECT.academicYear,...(cleanRaw.academicYear??{})},
    groups:Array.isArray(cleanRaw.groups)?cleanRaw.groups:[],
    subgroups:Array.isArray(cleanRaw.subgroups)?cleanRaw.subgroups:[],
    spaces:Array.isArray(cleanRaw.spaces)?cleanRaw.spaces:[],
    spaceAvailability:Array.isArray(cleanRaw.spaceAvailability)?cleanRaw.spaceAvailability:[],
    buildingTravelTimes:Array.isArray(cleanRaw.buildingTravelTimes)?cleanRaw.buildingTravelTimes:[],
    schedule:{
      ...structuredClone(EMPTY_PROJECT.schedule),
      ...(cleanRaw.schedule??{}),
      activeDays:Array.isArray(cleanRaw.schedule?.activeDays)?cleanRaw.schedule!.activeDays:[...EMPTY_PROJECT.schedule.activeDays],
      blocks:Array.isArray(cleanRaw.schedule?.blocks)?cleanRaw.schedule!.blocks:[],
    },
    subjects:Array.isArray(cleanRaw.subjects)?cleanRaw.subjects:[],
    studyPlan:Array.isArray(cleanRaw.studyPlan)?cleanRaw.studyPlan:[],
    teachers:Array.isArray(cleanRaw.teachers)?cleanRaw.teachers.map(normalizeTeacher):[],
    teacherAvailability:Array.isArray(cleanRaw.teacherAvailability)
      ? cleanRaw.teacherAvailability.map(item=>({...item,status:String((item as {status?:string}).status)==='assigned'?'available':item.status})) as ViyeuticaProject['teacherAvailability']
      : [],
    assignments:Array.isArray(cleanRaw.assignments)?cleanRaw.assignments.map(normalizeAssignment):[],
    rules:Array.isArray(cleanRaw.rules)?cleanRaw.rules:[],
    scheduleLocks:Array.isArray(cleanRaw.scheduleLocks)?cleanRaw.scheduleLocks:[],
    generationRuns:Array.isArray(cleanRaw.generationRuns)?cleanRaw.generationRuns:[],
    selectedGenerationRunId:cleanRaw.selectedGenerationRunId??null,
    generationNeedsRevalidation:Boolean(cleanRaw.generationNeedsRevalidation),
    draftScheduleRun:cleanRaw.draftScheduleRun??null,
    draftScheduleSavedAt:cleanRaw.draftScheduleSavedAt??null,
    draftScheduleNeedsRevalidation:Boolean(cleanRaw.draftScheduleNeedsRevalidation),
    establishedScheduleRun:cleanRaw.establishedScheduleRun??null,
    establishedScheduleSavedAt:cleanRaw.establishedScheduleSavedAt??null,
    establishedScheduleNeedsRevalidation:Boolean(cleanRaw.establishedScheduleNeedsRevalidation),
    normativeSources:Array.isArray(cleanRaw.normativeSources)?cleanRaw.normativeSources:[],
    normativeRules:Array.isArray(cleanRaw.normativeRules)?cleanRaw.normativeRules:[],
    temporaryChanges:Array.isArray(cleanRaw.temporaryChanges)?cleanRaw.temporaryChanges:[],
    updatedAt:null,
  }
}

export function normalizeTeacher(value:Teacher):Teacher{
  return {
    ...value,
    name:String(value.name??'').trim(),
    specialties:Array.isArray(value.specialties)?value.specialties.map(String).map(item=>item.trim()).filter(Boolean):[],
    roles:Array.isArray(value.roles)?value.roles.map(String).map(item=>item.trim()).filter(Boolean):[],
    dedications:Array.isArray(value.dedications)?value.dedications:[],
    active:value.active!==false,
  }
}

export function normalizeAssignment(value:TeachingAssignment):TeachingAssignment{
  return {
    ...value,
    fixedSlots:Array.isArray(value.fixedSlots)?value.fixedSlots:[],
    active:value.active!==false,
  }
}

export function splitTabular(text:string){
  return text
    .split(/\r?\n/)
    .map(line=>line.trimEnd())
    .filter(line=>line.trim())
    .map(line=>line.split('\t').map(cell=>cell.trim()))
}

export function findReference<T extends {id:string;name:string}>(items:T[],value:string){
  const normalized=value.trim().toLocaleLowerCase('es')
  return items.find(item=>item.id===value||item.name.trim().toLocaleLowerCase('es')===normalized)??null
}
