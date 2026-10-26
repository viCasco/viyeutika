import type { ViyeuticaProject } from '../domain/project'

export type CourseRecordStatus='active'|'archived'

export interface CourseRecord{
  id:string
  label:string
  startYear:number
  endYear:number
  status:CourseRecordStatus
  createdAt:string
  updatedAt:string
  project:ViyeuticaProject
}

const STORAGE_KEY='viyeutica.courses.v1'

export function loadCourseRecords():CourseRecord[]{
  try{
    const parsed=JSON.parse(window.localStorage.getItem(STORAGE_KEY)??'[]')
    return Array.isArray(parsed)?parsed:[]
  }catch{
    return []
  }
}

function persist(records:CourseRecord[]){
  window.localStorage.setItem(STORAGE_KEY,JSON.stringify(records))
  return records
}

export function syncCurrentCourse(project:ViyeuticaProject){
  const now=new Date().toISOString()
  const current=loadCourseRecords()
  const existing=current.find(item=>item.id===project.academicYear.id)
  const next:CourseRecord={
    id:project.academicYear.id,
    label:project.academicYear.label,
    startYear:project.academicYear.startYear,
    endYear:project.academicYear.endYear,
    status:'active',
    createdAt:existing?.createdAt??now,
    updatedAt:project.updatedAt??now,
    project:structuredClone(project),
  }
  return persist([
    next,
    ...current
      .filter(item=>item.id!==next.id)
      .map(item=>({...item,status:'archived' as const})),
  ])
}

export function storeCourseProject(project:ViyeuticaProject,status:CourseRecordStatus='archived'){
  const now=new Date().toISOString()
  const current=loadCourseRecords()
  const existing=current.find(item=>item.id===project.academicYear.id)
  const record:CourseRecord={
    id:project.academicYear.id,
    label:project.academicYear.label,
    startYear:project.academicYear.startYear,
    endYear:project.academicYear.endYear,
    status,
    createdAt:existing?.createdAt??now,
    updatedAt:project.updatedAt??now,
    project:structuredClone(project),
  }
  return persist([
    record,
    ...current.filter(item=>item.id!==record.id),
  ])
}

export function activateCourseRecord(id:string){
  const records=loadCourseRecords()
  return persist(records.map(item=>({...item,status:item.id===id?'active':'archived'})))
}
