import type {
  StudyPlanEntry,
  Teacher,
  TeachingAssignment,
  ViyeuticaProject,
} from './project'
import { findReference, normalizeAssignment, normalizeTeacher, splitTabular } from './projectNormalizer'

export type BulkEditMode='teachers'|'studyPlan'|'assignments'

export interface BulkRowResult {
  index:number
  raw:string[]
  valid:boolean
  error?:string
  value?:Teacher|StudyPlanEntry|TeachingAssignment
}

const uid=(prefix:string)=>prefix+'_'+crypto.randomUUID()

function numberOrNull(value:string){
  if(!value)return null
  const parsed=Number(value.replace(',','.'))
  return Number.isFinite(parsed)?parsed:null
}

export function parseBulkRows(project:ViyeuticaProject,mode:BulkEditMode,text:string):BulkRowResult[]{
  const rows=splitTabular(text)
  return rows.map((raw,index)=>{
    if(mode==='teachers'){
      const [name,specialties='',minutes='',employment='full']=raw
      if(!name?.trim())return {index,raw,valid:false,error:'Falta el nombre del docente.'}
      const weeklyTeachingMinutes=minutes?numberOrNull(minutes):null
      if(minutes&&weeklyTeachingMinutes===null)return {index,raw,valid:false,error:'La carga lectiva no es numérica.'}
      const existing=project.teachers.find(item=>item.name.trim().toLocaleLowerCase('es')===name.trim().toLocaleLowerCase('es'))
      const value=normalizeTeacher({
        id:existing?.id??uid('teacher'),
        name:name.trim(),
        status:existing?.status??'confirmed',
        employmentType:['full','partial','itinerant','other'].includes(employment)?employment as Teacher['employmentType']:'full',
        specialties:specialties.split(/[;,]/).map(item=>item.trim()).filter(Boolean),
        roles:existing?.roles??[],
        weeklyTeachingMinutes,
        dedications:existing?.dedications??[],
        active:true,
      })
      if(!value.specialties.length)return {index,raw,valid:false,error:'Indica al menos una especialidad.'}
      return {index,raw,valid:true,value}
    }

    if(mode==='studyPlan'){
      const [groupRef,subjectRef,sessions='',minutes='']=raw
      const group=findReference(project.groups,groupRef??'')
      const subject=findReference(project.subjects,subjectRef??'')
      if(!group)return {index,raw,valid:false,error:'Grupo inexistente: '+(groupRef||'—')}
      if(!subject)return {index,raw,valid:false,error:'Materia inexistente: '+(subjectRef||'—')}
      const weeklySessions=numberOrNull(sessions)??0
      const weeklyMinutes=numberOrNull(minutes)
      if(weeklySessions<=0&&(weeklyMinutes??0)<=0)return {index,raw,valid:false,error:'Indica sesiones o minutos semanales.'}
      const existing=project.studyPlan.find(item=>item.groupId===group.id&&item.subjectId===subject.id)
      const value:StudyPlanEntry={
        id:existing?.id??uid('plan'),
        groupId:group.id,
        subjectId:subject.id,
        weeklySessions,
        weeklyMinutes,
        mandatory:existing?.mandatory??true,
        mode:existing?.mode??'ordinary',
        teacherRequirement:existing?.teacherRequirement??'any',
        teacherId:existing?.teacherId??null,
        fixedSessionMinutes:existing?.fixedSessionMinutes??null,
        notes:existing?.notes??'',
        pendingOrganization:existing?.pendingOrganization??false,
        active:true,
      }
      return {index,raw,valid:true,value}
    }

    const [groupRef,subjectRef,teacherRef,type='main',sessions='',minutes='']=raw
    const group=findReference(project.groups,groupRef??'')
    const subject=findReference(project.subjects,subjectRef??'')
    const teacher=findReference(project.teachers,teacherRef??'')
    if(!group)return {index,raw,valid:false,error:'Grupo inexistente: '+(groupRef||'—')}
    if(!subject)return {index,raw,valid:false,error:'Materia inexistente: '+(subjectRef||'—')}
    if(!teacher)return {index,raw,valid:false,error:'Docente inexistente: '+(teacherRef||'—')}
    if(!['main','support','co_teaching'].includes(type))return {index,raw,valid:false,error:'Tipo no válido: '+type}
    const weeklySessions=numberOrNull(sessions)
    const weeklyMinutes=numberOrNull(minutes)
    if((weeklySessions??0)<=0&&(weeklyMinutes??0)<=0)return {index,raw,valid:false,error:'Indica sesiones o minutos semanales.'}
    const existing=project.assignments.find(item=>
      item.groupId===group.id&&item.subjectId===subject.id&&item.teacherId===teacher.id&&item.assignmentType===type
    )
    const value=normalizeAssignment({
      id:existing?.id??uid('asg'),
      groupId:group.id,
      subjectId:subject.id,
      teacherId:teacher.id,
      assignmentType:type as TeachingAssignment['assignmentType'],
      weeklySessions,
      weeklyMinutes,
      fixedSlots:existing?.fixedSlots??[],
      active:true,
      source:existing?.source??'manual',
    })
    return {index,raw,valid:true,value}
  })
}

function upsertBy<T>(current:T[],incoming:T[],key:(item:T)=>string){
  const map=new Map(current.map(item=>[key(item),item]))
  for(const item of incoming)map.set(key(item),item)
  return [...map.values()]
}

export function applyBulkRows(project:ViyeuticaProject,mode:BulkEditMode,rows:BulkRowResult[]):ViyeuticaProject{
  const valid=rows.filter(row=>row.valid&&row.value).map(row=>row.value!)
  if(mode==='teachers'){
    return {...project,teachers:upsertBy(project.teachers,valid as Teacher[],item=>item.name.trim().toLocaleLowerCase('es'))}
  }
  if(mode==='studyPlan'){
    return {...project,studyPlan:upsertBy(project.studyPlan,valid as StudyPlanEntry[],item=>item.groupId+'|'+item.subjectId)}
  }
  return {
    ...project,
    assignments:upsertBy(
      project.assignments,
      valid as TeachingAssignment[],
      item=>item.groupId+'|'+item.subjectId+'|'+item.teacherId+'|'+item.assignmentType,
    ),
  }
}
