import {
  EMPTY_PROJECT,
  type TeachingAssignment,
  type Teacher,
  type ViyeuticaProject,
} from './project'

export function normalizeProjectData(raw:Partial<ViyeuticaProject>):ViyeuticaProject {
  return {
    ...structuredClone(EMPTY_PROJECT),
    ...raw,
    center:{...structuredClone(EMPTY_PROJECT.center),...(raw.center??{})},
    academicYear:{...EMPTY_PROJECT.academicYear,...(raw.academicYear??{})},
    groups:Array.isArray(raw.groups)?raw.groups:[],
    subgroups:Array.isArray(raw.subgroups)?raw.subgroups:[],
    spaces:Array.isArray(raw.spaces)?raw.spaces:[],
    spaceAvailability:Array.isArray(raw.spaceAvailability)?raw.spaceAvailability:[],
    buildingTravelTimes:Array.isArray(raw.buildingTravelTimes)?raw.buildingTravelTimes:[],
    schedule:{
      ...structuredClone(EMPTY_PROJECT.schedule),
      ...(raw.schedule??{}),
      activeDays:Array.isArray(raw.schedule?.activeDays)?raw.schedule!.activeDays:[...EMPTY_PROJECT.schedule.activeDays],
      blocks:Array.isArray(raw.schedule?.blocks)?raw.schedule!.blocks:[],
    },
    subjects:Array.isArray(raw.subjects)?raw.subjects:[],
    studyPlan:Array.isArray(raw.studyPlan)?raw.studyPlan:[],
    teachers:Array.isArray(raw.teachers)?raw.teachers.map(normalizeTeacher):[],
    teacherAvailability:Array.isArray(raw.teacherAvailability)
      ? raw.teacherAvailability.map(item=>({...item,status:String((item as {status?:string}).status)==='assigned'?'available':item.status})) as ViyeuticaProject['teacherAvailability']
      : [],
    assignments:Array.isArray(raw.assignments)?raw.assignments.map(normalizeAssignment):[],
    rules:Array.isArray(raw.rules)?raw.rules:[],
    scheduleLocks:Array.isArray(raw.scheduleLocks)?raw.scheduleLocks:[],
    generationRuns:Array.isArray(raw.generationRuns)?raw.generationRuns:[],
    selectedGenerationRunId:raw.selectedGenerationRunId??null,
    generationNeedsRevalidation:Boolean(raw.generationNeedsRevalidation),
    draftScheduleRun:raw.draftScheduleRun??null,
    draftScheduleSavedAt:raw.draftScheduleSavedAt??null,
    draftScheduleNeedsRevalidation:Boolean(raw.draftScheduleNeedsRevalidation),
    establishedScheduleRun:raw.establishedScheduleRun??null,
    establishedScheduleSavedAt:raw.establishedScheduleSavedAt??null,
    establishedScheduleNeedsRevalidation:Boolean(raw.establishedScheduleNeedsRevalidation),
    normativeSources:Array.isArray(raw.normativeSources)?raw.normativeSources:[],
    normativeRules:Array.isArray(raw.normativeRules)?raw.normativeRules:[],
    collaboration:{
      ...structuredClone(EMPTY_PROJECT.collaboration),
      ...(raw.collaboration??{}),
      versions:Array.isArray(raw.collaboration?.versions)?raw.collaboration!.versions:[],
    },
    temporaryChanges:Array.isArray(raw.temporaryChanges)?raw.temporaryChanges:[],
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
