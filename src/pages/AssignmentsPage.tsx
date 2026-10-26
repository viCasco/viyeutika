import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  CalendarClock, CheckCircle2, ChevronDown, Copy, Pencil, Plus, Save, Search, SlidersHorizontal,
  Trash2, UsersRound,
} from 'lucide-react'
import {
  isStaffComplete,
  validateAssignments,
  type TeachingAssignment,
  type TeacherAvailability,
  type ViyeuticaProject,
  type Weekday,
} from '../domain/project'
import { saveProject } from '../store/projectStorage'
import { WizardStepper } from '../components/WizardStepper'
import { TemplatePanel } from '../components/TemplatePanel'

type AssignmentType=TeachingAssignment['assignmentType']
type AvailabilityStatus=TeacherAvailability['status']

interface AssignmentDraft {
  groupId:string
  subjectId:string
  teacherId:string
  assignmentType:AssignmentType
  weeklySessions:string
  weeklyMinutes:string
}

interface AvailabilityDraft {
  teacherIds:string[]
  days:Weekday[]
  sessions:string[]
  status:AvailabilityStatus
  detail:string
}

const emptyAssignment:AssignmentDraft={
  groupId:'',subjectId:'',teacherId:'',assignmentType:'main',weeklySessions:'',weeklyMinutes:'',
}
const emptyAvailability:AvailabilityDraft={
  teacherIds:[],days:[],sessions:[],status:'unavailable',detail:'',
}

const assignmentTypeLabels:Record<AssignmentType,string>={
  main:'Titular',
  support:'Apoyo',
  co_teaching:'Codocencia',
}
const availabilityLabels:Record<AvailabilityStatus,string>={
  available:'Disponible',
  unavailable:'No disponible',
  travel:'Desplazamiento',
  assigned:'Fijado / asignado',
}
const dayLabels:Record<Weekday,string>={
  L:'Lunes',M:'Martes',X:'Miércoles',J:'Jueves',V:'Viernes',S:'Sábado',
}
const uid=(prefix:string)=>prefix+'_'+crypto.randomUUID()

export function AssignmentsPage({
  project,
  navigate,
}:{
  project:ViyeuticaProject
  navigate:(path:string)=>void
}) {
  const [draft,setDraft]=useState<AssignmentDraft>(emptyAssignment)
  const [availabilityDraft,setAvailabilityDraft]=useState<AvailabilityDraft>(emptyAvailability)
  const [editingId,setEditingId]=useState<string|null>(null)
  const [error,setError]=useState('')
  const [availabilityError,setAvailabilityError]=useState('')
  const [templateMessage,setTemplateMessage]=useState('')
  const [auditFocus,setAuditFocus]=useState('')
  const [assignmentModalOpen,setAssignmentModalOpen]=useState(false)
  const [availabilityModalOpen,setAvailabilityModalOpen]=useState(false)
  const [bulkModalOpen,setBulkModalOpen]=useState(false)
  const [bulkSubjectId,setBulkSubjectId]=useState('')
  const [bulkTeacherId,setBulkTeacherId]=useState('')
  const [availabilitySuggestion,setAvailabilitySuggestion]=useState('')
  const [availabilityExpanded,setAvailabilityExpanded]=useState(false)
  const [availabilityTeacherFilter,setAvailabilityTeacherFilter]=useState<'all'|string>('all')
  const [assignmentsExpanded,setAssignmentsExpanded]=useState(false)
  const [assignmentGroupFilter,setAssignmentGroupFilter]=useState<'all'|string>('all')
  const [assignmentTeacherFilter,setAssignmentTeacherFilter]=useState<'all'|string>('all')
  const [progressExpanded,setProgressExpanded]=useState(false)
  const [showOtherTeachers,setShowOtherTeachers]=useState(false)
  const [supportCandidateOrder,setSupportCandidateOrder]=useState<'margin'|'supports'>('margin')
  const [prioritizeNonManagement,setPrioritizeNonManagement]=useState(true)

  const activeGroups=project.groups.filter(group=>group.active)
  const activeSubjects=project.subjects.filter(subject=>subject.active)
  const activeTeachers=project.teachers.filter(teacher=>teacher.active)
  const activeAssignments=project.assignments.filter(assignment=>assignment.active)
  const validation=useMemo(()=>validateAssignments(project),[project])
  const assignmentSessions=draft.weeklySessions===''?0:Number(draft.weeklySessions)
  const assignmentMinutes=draft.weeklyMinutes===''?0:Number(draft.weeklyMinutes)
  const assignmentReady=Boolean(
    draft.groupId&&draft.subjectId&&draft.teacherId&&
    ((Number.isFinite(assignmentSessions)&&assignmentSessions>0)||(Number.isFinite(assignmentMinutes)&&assignmentMinutes>0))
  )
  const assignmentGuide=!draft.groupId?'Selecciona primero el grupo.'
    :!draft.subjectId?'Selecciona la materia.'
    :!draft.teacherId?'Selecciona el docente.'
    :!((Number.isFinite(assignmentSessions)&&assignmentSessions>0)||(Number.isFinite(assignmentMinutes)&&assignmentMinutes>0))
      ?'Indica la carga semanal mediante sesiones o minutos.'
      :'La asignación tiene los datos mínimos necesarios. Ya puedes añadirla.'
  const availabilityReady=Boolean(
    availabilityDraft.teacherIds.length&&availabilityDraft.days.length&&availabilityDraft.sessions.length
  )
  const availabilityReasons=Array.from(new Set(
    project.teacherAvailability.map(item=>item.detail.trim()).filter(Boolean)
  )).sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}))
  const availabilityTeacherIds=Array.from(new Set(project.teacherAvailability.map(item=>item.teacherId)))
  const visibleAvailability=project.teacherAvailability.filter(item=>availabilityTeacherFilter==='all'||item.teacherId===availabilityTeacherFilter)
  const assignmentGroupIds=Array.from(new Set(project.assignments.map(item=>item.groupId)))
  const assignmentTeacherIds=Array.from(new Set(project.assignments.map(item=>item.teacherId)))
  const visibleAssignments=project.assignments.filter(item=>
    (assignmentGroupFilter==='all'||item.groupId===assignmentGroupFilter)&&
    (assignmentTeacherFilter==='all'||item.teacherId===assignmentTeacherFilter)
  )
  const availabilityGuide=!availabilityDraft.teacherIds.length?'Selecciona al menos un docente.'
    :!availabilityDraft.days.length?'Selecciona al menos un día.'
    :!availabilityDraft.sessions.length?'Selecciona al menos una sesión.'
    :'La restricción tiene los datos mínimos necesarios. Ya puedes añadirla.'
  useEffect(()=>{
    const teachingBlocks=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
    const teachingSlots=project.schedule.activeDays.length*teachingBlocks.length
    const assignmentSessions=(assignment:TeachingAssignment)=>{
      if((assignment.weeklySessions??0)>0)return Math.max(1,Math.round(assignment.weeklySessions!))
      const entry=project.studyPlan.find(item=>
        item.active&&item.groupId===assignment.groupId&&item.subjectId===assignment.subjectId
      )
      if((entry?.weeklySessions??0)>0)return Math.max(1,Math.round(entry!.weeklySessions))
      return 1
    }
    const mainSessionsByGroup=new Map<string,number>()
    for(const assignment of project.assignments.filter(item=>item.active&&item.assignmentType==='main')){
      mainSessionsByGroup.set(
        assignment.groupId,
        (mainSessionsByGroup.get(assignment.groupId)??0)+assignmentSessions(assignment)
      )
    }

    const normalized=project.assignments.map(assignment=>{
      if(!assignment.active)return assignment
      const entry=project.studyPlan.find(item=>
        item.active&&item.groupId===assignment.groupId&&item.subjectId===assignment.subjectId
      )
      if(!entry)return assignment

      if(entry.mode==='co_teaching'&&assignment.assignmentType==='main'){
        mainSessionsByGroup.set(
          assignment.groupId,
          Math.max(0,(mainSessionsByGroup.get(assignment.groupId)??0)-assignmentSessions(assignment))
        )
        return {...assignment,assignmentType:'co_teaching' as AssignmentType}
      }

      const subject=project.subjects.find(item=>item.id===assignment.subjectId)
      const semantic=(subject?.name??'').trim().toLocaleLowerCase('es')
      const isSupportLoad=semantic.includes('apoyo')||semantic.includes('refuerzo')
      if(!isSupportLoad)return assignment

      const groupMainSessions=mainSessionsByGroup.get(assignment.groupId)??0
      const sessions=assignmentSessions(assignment)

      if(assignment.assignmentType==='main'&&teachingSlots>0&&groupMainSessions>teachingSlots){
        mainSessionsByGroup.set(assignment.groupId,Math.max(0,groupMainSessions-sessions))
        return {...assignment,assignmentType:'support' as AssignmentType}
      }

      if(assignment.assignmentType==='support'&&teachingSlots>0&&groupMainSessions<teachingSlots){
        const sameLoad=project.assignments.filter(item=>
          item.active&&item.groupId===assignment.groupId&&item.subjectId===assignment.subjectId
        )
        const hasMain=sameLoad.some(item=>item.assignmentType==='main')
        if(!hasMain&&sameLoad.length===1&&groupMainSessions+sessions<=teachingSlots){
          mainSessionsByGroup.set(assignment.groupId,groupMainSessions+sessions)
          return {...assignment,assignmentType:'main' as AssignmentType}
        }
      }

      return assignment
    })
    const changed=normalized.some((assignment,index)=>assignment.assignmentType!==project.assignments[index]?.assignmentType)
    if(changed)saveProject({...project,assignments:normalized})
  },[])

  useEffect(()=>{
    const raw=window.location.hash.split('?')[1]
    if(!raw)return
    const params=new URLSearchParams(raw)
    const teacherId=params.get('teacherId')??''
    const groupId=params.get('groupId')??''
    const subjectId=params.get('subjectId')??''
    const assignmentId=params.get('assignmentId')??''
    const day=(params.get('day')??'') as Weekday|''
    const session=params.get('sessionId')??''
    const auditCode=params.get('auditCode')??''
    const pendingOrganization=params.get('pendingOrganization')==='1'
    const focusAvailability=params.get('focusAvailability')==='1'

    if(assignmentId){
      const assignment=project.assignments.find(item=>item.id===assignmentId)
      if(assignment){
        setEditingId(assignment.id)
        setDraft({
          groupId:assignment.groupId,
          subjectId:assignment.subjectId,
          teacherId:assignment.teacherId,
          assignmentType:assignment.assignmentType,
          weeklySessions:assignment.weeklySessions===null?'':String(assignment.weeklySessions),
          weeklyMinutes:assignment.weeklyMinutes===null?'':String(assignment.weeklyMinutes),
        })
        setShowOtherTeachers(false)
        setError('')
        setAssignmentModalOpen(true)
        setAuditFocus('Prevalidación ha abierto esta asignación para revisar su capacidad semanal.')
      }
    }else if(groupId||subjectId||teacherId){
      setDraft(current=>({
        ...current,
        groupId:groupId||current.groupId,
        subjectId:subjectId||current.subjectId,
        teacherId:teacherId||current.teacherId,
      }))
    }
    if(teacherId||day||session){
      setAvailabilityDraft(current=>({
        ...current,
        teacherIds:teacherId?[teacherId]:current.teacherIds,
        days:day?[day]:current.days,
        sessions:session?[session]:current.sessions,
      }))
      if(teacherId)setAvailabilityTeacherFilter(teacherId)
    }
    if(focusAvailability){
      setAvailabilityExpanded(true)
      setAuditFocus('Prevalidación ha detectado que la carga del docente no cabe en su disponibilidad semanal.')
      window.setTimeout(()=>document.querySelector('.availability-section')?.scrollIntoView({behavior:'smooth',block:'start'}),80)
    }else if(pendingOrganization){
      setProgressExpanded(true)
      setAuditFocus('Prevalidación ha señalado cargas pendientes de organizar. Revísalas antes de cerrar el horario.')
      window.setTimeout(()=>document.querySelector('.assignment-progress-alert')?.scrollIntoView({behavior:'smooth',block:'center'}),80)
    }else if(auditCode){
      setAuditFocus('Datos cargados desde Auditoría para revisar una incidencia del horario.')
      window.setTimeout(()=>document.querySelector('.assignment-form')?.scrollIntoView({behavior:'smooth',block:'start'}),60)
    }
  },[])


  const groupSubjects=(groupId:string)=>{
    const group=project.groups.find(item=>item.id===groupId)
    if(!group)return []
    const subjectIds=new Set(
      project.studyPlan.filter(entry=>entry.active&&entry.groupId===groupId).map(entry=>entry.subjectId)
    )
    return activeSubjects.filter(subject=>subject.stage===group.stage&&subjectIds.has(subject.id))
  }

  const studyPlanLoad=(groupId:string,subjectId:string)=>{
    const entry=project.studyPlan.find(item=>item.active&&item.groupId===groupId&&item.subjectId===subjectId)
    return {
      weeklySessions:entry&&entry.weeklySessions>0?String(entry.weeklySessions):'',
      weeklyMinutes:entry&&(entry.weeklyMinutes??0)>0?String(entry.weeklyMinutes):'',
    }
  }

  const assignmentTypeForStudyEntry=(entry:typeof project.studyPlan[number]):AssignmentType=>{
    if(entry.mode==='co_teaching')return 'co_teaching'
    return 'main'
  }

  const compatibleTeachers=(subjectId:string)=>{
    if(!subjectId)return activeTeachers
    const subject=project.subjects.find(item=>item.id===subjectId)
    if(!subject)return activeTeachers
    const target=[subject.name,subject.code].filter(Boolean).map(value=>String(value).trim().toLocaleLowerCase('es'))
    const matches=activeTeachers.filter(teacher=>
      teacher.specialties.some(specialty=>{
        const normalized=specialty.trim().toLocaleLowerCase('es')
        return target.some(value=>normalized===value||normalized.includes(value)||value.includes(normalized))
      })
    )
    return matches.length?matches:activeTeachers
  }

  const defaultTeacherForAssignment=(groupId:string,subjectId:string)=>{
    if(!groupId||!subjectId)return ''
    const subject=project.subjects.find(item=>item.id===subjectId)
    const group=project.groups.find(item=>item.id===groupId)
    if(subject?.type==='common'&&group?.tutorTeacherId){
      const tutor=activeTeachers.find(teacher=>teacher.id===group.tutorTeacherId)
      if(tutor)return tutor.id
    }
    const teachers=compatibleTeachers(subjectId)
    return teachers.length===1?teachers[0].id:''
  }

  const teachingBlocks=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
  const totalTeachingSlots=project.schedule.activeDays.length*teachingBlocks.length
  const teacherAssignedSessions=(teacherId:string)=>activeAssignments
    .filter(assignment=>assignment.teacherId===teacherId)
    .reduce((total,assignment)=>{
      if((assignment.weeklySessions??0)>0)return total+Math.max(1,Math.round(assignment.weeklySessions!))
      const plan=project.studyPlan.find(entry=>entry.active&&entry.groupId===assignment.groupId&&entry.subjectId===assignment.subjectId)
      if((plan?.weeklySessions??0)>0)return total+Math.max(1,Math.round(plan!.weeklySessions))
      return total+1
    },0)
  const teacherAvailableSlots=(teacherId:string)=>{
    const unavailable=new Set(
      project.teacherAvailability
        .filter(item=>
          item.teacherId===teacherId&&
          (item.status==='unavailable'||item.status==='travel')&&
          project.schedule.activeDays.includes(item.day as Weekday)&&
          teachingBlocks.some(block=>block.id===item.session)
        )
        .map(item=>item.day+'|'+item.session)
    )
    return Math.max(0,totalTeachingSlots-unavailable.size)
  }
  const supportCandidates=(entry:typeof project.studyPlan[number])=>{
    const subject=project.subjects.find(item=>item.id===entry.subjectId)
    const targets=[subject?.name,subject?.code].filter(Boolean).map(value=>String(value).trim().toLocaleLowerCase('es'))
    return activeTeachers
      .map(teacher=>{
        const specialtyMatch=teacher.specialties.some(specialty=>{
          const normalized=specialty.trim().toLocaleLowerCase('es')
          return targets.some(value=>normalized===value||normalized.includes(value)||value.includes(normalized))
        })
        const assigned=teacherAssignedSessions(teacher.id)
        const available=teacherAvailableSlots(teacher.id)
        const margin=available-assigned
        const supportAssignments=activeAssignments.filter(assignment=>{
          if(assignment.teacherId!==teacher.id)return false
          const assignmentSubject=project.subjects.find(item=>item.id===assignment.subjectId)
          const label=(assignmentSubject?.name??'').trim().toLocaleLowerCase('es')
          return label.includes('apoyo')||label.includes('refuerzo')
        }).length
        const management=Boolean(
          teacher.dedications?.some(dedication=>dedication.type==='management'&&dedication.status!=='planned') ||
          teacher.roles.some(role=>/direcci|director|jefatura|secretar|equipo directivo/i.test(role))
        )
        return {teacher,specialtyMatch,assigned,available,margin,supportAssignments,management}
      })
      .filter(candidate=>candidate.margin>0)
      .sort((a,b)=>{
        const compatibility=
          Number(b.specialtyMatch)-Number(a.specialtyMatch) ||
          Number(b.teacher.status==='confirmed')-Number(a.teacher.status==='confirmed')
        if(compatibility)return compatibility
        if(prioritizeNonManagement){
          const managementOrder=Number(a.management)-Number(b.management)
          if(managementOrder)return managementOrder
        }
        if(supportCandidateOrder==='supports'){
          return a.supportAssignments-b.supportAssignments ||
            b.margin-a.margin ||
            a.assigned-b.assigned ||
            a.teacher.name.localeCompare(b.teacher.name,'es')
        }
        return b.margin-a.margin ||
          a.supportAssignments-b.supportAssignments ||
          a.assigned-b.assigned ||
          a.teacher.name.localeCompare(b.teacher.name,'es')
      })
      .slice(0,4)
  }

  const assignmentTeachers=compatibleTeachers(draft.subjectId)
  const selectedAssignmentTeacher=activeTeachers.find(teacher=>teacher.id===draft.teacherId)
  const visibleAssignmentTeachers=selectedAssignmentTeacher&&!assignmentTeachers.some(teacher=>teacher.id===selectedAssignmentTeacher.id)
    ? [selectedAssignmentTeacher,...assignmentTeachers]
    : assignmentTeachers
  const hasSpecialtyFilter=draft.subjectId&&assignmentTeachers.length<activeTeachers.length
  const otherAssignmentTeachers=hasSpecialtyFilter
    ? activeTeachers.filter(teacher=>!visibleAssignmentTeachers.some(item=>item.id===teacher.id))
    : []


  const assignmentExists=(groupId:string,subjectId:string,type:AssignmentType,excludeId:string|null=editingId)=>
    activeAssignments.some(assignment=>
      assignment.id!==excludeId&&
      assignment.groupId===groupId&&
      assignment.subjectId===subjectId&&
      assignment.assignmentType===type
    )

  const groupMainComplete=(groupId:string)=>{
    const entries=project.studyPlan.filter(entry=>entry.active&&entry.groupId===groupId)
    return entries.length>0&&entries.every(entry=>assignmentExists(groupId,entry.subjectId,'main',null))
  }

  const bulkEligibleEntries=project.studyPlan.filter(entry=>
    entry.active&&
    entry.subjectId===bulkSubjectId&&
    !assignmentExists(entry.groupId,entry.subjectId,'main',null)
  )

  const applyBulkAssignment=()=>{
    if(!bulkSubjectId||!bulkTeacherId||!bulkEligibleEntries.length)return
    const additions:TeachingAssignment[]=bulkEligibleEntries.map(entry=>({
      id:uid('asg'),
      groupId:entry.groupId,
      subjectId:entry.subjectId,
      teacherId:bulkTeacherId,
      assignmentType:'main',
      weeklySessions:entry.weeklySessions>0?entry.weeklySessions:null,
      weeklyMinutes:(entry.weeklyMinutes??0)>0?(entry.weeklyMinutes??null):null,
      active:true,
      source:'manual-bulk',
    }))
    persistAssignments([...project.assignments,...additions])
    const subject=project.subjects.find(item=>item.id===bulkSubjectId)
    const teacher=project.teachers.find(item=>item.id===bulkTeacherId)
    setTemplateMessage(`${subject?.name??'Materia'} asignada a ${teacher?.name??'docente'} en ${additions.length} ${additions.length===1?'grupo pendiente':'grupos pendientes'}.`)
    setBulkModalOpen(false)
    setBulkSubjectId('')
    setBulkTeacherId('')
  }

  const pendingAssignmentDraft=(entry:typeof project.studyPlan[number])=>{
    const teacherId=defaultTeacherForAssignment(entry.groupId,entry.subjectId)
    return {
      groupId:entry.groupId,
      subjectId:entry.subjectId,
      teacherId,
      assignmentType:assignmentTypeForStudyEntry(entry),
      weeklySessions:entry.weeklySessions>0?String(entry.weeklySessions):'',
      weeklyMinutes:(entry.weeklyMinutes??0)>0?String(entry.weeklyMinutes):'',
    }
  }

  const pendingAssignmentReady=(entry:typeof project.studyPlan[number])=>{
    const resolved=pendingAssignmentDraft(entry)
    return Boolean(
      resolved.groupId&&resolved.subjectId&&resolved.teacherId&&
      ((Number(resolved.weeklySessions)||0)>0||(Number(resolved.weeklyMinutes)||0)>0)
    )
  }

  const editPendingAssignment=(entry:typeof project.studyPlan[number],teacherId?:string)=>{
    const resolved=pendingAssignmentDraft(entry)
    setDraft({...resolved,teacherId:teacherId??resolved.teacherId})
    setEditingId(null)
    setShowOtherTeachers(false)
    setError('')
    setAssignmentModalOpen(true)
  }

  const addPendingAssignment=(entry:typeof project.studyPlan[number])=>{
    const resolved=pendingAssignmentDraft(entry)
    if(!pendingAssignmentReady(entry))return
    const assignment:TeachingAssignment={
      id:uid('asg'),
      groupId:resolved.groupId,
      subjectId:resolved.subjectId,
      teacherId:resolved.teacherId,
      assignmentType:resolved.assignmentType,
      weeklySessions:resolved.weeklySessions?Number(resolved.weeklySessions):null,
      weeklyMinutes:resolved.weeklyMinutes?Number(resolved.weeklyMinutes):null,
      active:true,
      source:'manual',
    }
    persistAssignments([...project.assignments,assignment])
  }

  const persistAssignments=(assignments:TeachingAssignment[])=>saveProject({...project,assignments})
  const persistAvailability=(teacherAvailability:TeacherAvailability[])=>saveProject({...project,teacherAvailability})

  const reset=()=>{
    setDraft(emptyAssignment)
    setEditingId(null)
    setError('')
    setShowOtherTeachers(false)
    setAssignmentModalOpen(false)
  }
  const openCreate=()=>{setDraft(emptyAssignment);setEditingId(null);setError('');setShowOtherTeachers(false);setAssignmentModalOpen(true)}
  const closeAvailability=()=>{setAvailabilityDraft(emptyAvailability);setAvailabilityError('');setAvailabilitySuggestion('');setAvailabilityModalOpen(false)}

  const submit=(event:FormEvent)=>{
    event.preventDefault()
    if(!draft.groupId||!draft.subjectId||!draft.teacherId){
      setError('Selecciona grupo, materia y docente.')
      return
    }
    const sessions=draft.weeklySessions===''?null:Number(draft.weeklySessions)
    const minutes=draft.weeklyMinutes===''?null:Number(draft.weeklyMinutes)
    if((sessions??0)<=0&&(minutes??0)<=0){
      setError('Indica sesiones o minutos semanales.')
      return
    }

    const duplicate=project.assignments.some(assignment=>
      assignment.id!==editingId &&
      assignment.active &&
      assignment.groupId===draft.groupId &&
      assignment.subjectId===draft.subjectId &&
      assignment.teacherId===draft.teacherId &&
      assignment.assignmentType===draft.assignmentType
    )
    if(duplicate){
      setError('Ya existe una asignación idéntica para ese docente, grupo y materia.')
      return
    }

    const assignment:TeachingAssignment={
      id:editingId??uid('asg'),
      groupId:draft.groupId,
      subjectId:draft.subjectId,
      teacherId:draft.teacherId,
      assignmentType:draft.assignmentType,
      weeklySessions:sessions,
      weeklyMinutes:minutes,
      active:true,
      source:editingId
        ? project.assignments.find(item=>item.id===editingId)?.source
        : 'manual',
    }
    const next=editingId
      ? project.assignments.map(item=>item.id===editingId?assignment:item)
      : [...project.assignments,assignment]
    persistAssignments(next)
    reset()
  }

  const edit=(assignment:TeachingAssignment)=>{
    setEditingId(assignment.id)
    setDraft({
      groupId:assignment.groupId,
      subjectId:assignment.subjectId,
      teacherId:assignment.teacherId,
      assignmentType:assignment.assignmentType,
      weeklySessions:assignment.weeklySessions===null?'':String(assignment.weeklySessions),
      weeklyMinutes:assignment.weeklyMinutes===null?'':String(assignment.weeklyMinutes),
    })
    setError('')
    setAssignmentModalOpen(true)
  }

  const duplicate=(assignment:TeachingAssignment)=>{
    setEditingId(null)
    setDraft({
      groupId:assignment.groupId,
      subjectId:assignment.subjectId,
      teacherId:assignment.teacherId,
      assignmentType:assignment.assignmentType,
      weeklySessions:assignment.weeklySessions===null?'':String(assignment.weeklySessions),
      weeklyMinutes:assignment.weeklyMinutes===null?'':String(assignment.weeklyMinutes),
    })
    setShowOtherTeachers(false)
    setError('Modifica al menos grupo, materia, docente o tipo de intervención. Una asignación idéntica no se puede guardar dos veces.')
    setAssignmentModalOpen(true)
  }

  const remove=(id:string)=>persistAssignments(project.assignments.filter(item=>item.id!==id))
  const toggleActive=(id:string)=>persistAssignments(
    project.assignments.map(item=>item.id===id?{...item,active:!item.active}:item),
  )

  const togglePendingOrganization=(entryId:string)=>{
    saveProject({
      ...project,
      studyPlan:project.studyPlan.map(entry=>entry.id===entryId?{...entry,pendingOrganization:!entry.pendingOrganization}:entry),
    })
  }

  const submitAvailability=(event:FormEvent)=>{
    event.preventDefault()
    if(!availabilityDraft.teacherIds.length||!availabilityDraft.days.length||!availabilityDraft.sessions.length){
      setAvailabilityError('Selecciona al menos un docente, un día y una sesión.')
      return
    }

    const teachingSessionIds=project.schedule.blocks
      .filter(block=>block.active&&block.type==='teaching')
      .map(block=>block.id)
    const sessions=availabilityDraft.sessions.includes('__all__')
      ? teachingSessionIds
      : availabilityDraft.sessions.filter(session=>session!=='__all__')

    if(!sessions.length){
      setAvailabilityError('No hay sesiones lectivas disponibles para aplicar la restricción.')
      return
    }

    const teacherIds=new Set(availabilityDraft.teacherIds)
    const days=new Set(availabilityDraft.days)
    const sessionIds=new Set(sessions)

    const filtered=project.teacherAvailability.filter(item=>!(
      teacherIds.has(item.teacherId)&&days.has(item.day as Weekday)&&sessionIds.has(item.session)
    ))

    const additions:TeacherAvailability[]=[]
    for(const teacherId of availabilityDraft.teacherIds){
      for(const day of availabilityDraft.days){
        for(const session of sessions){
          additions.push({
            teacherId,
            day,
            session,
            status:availabilityDraft.status,
            detail:availabilityDraft.detail.trim(),
          })
        }
      }
    }

    persistAvailability([...filtered,...additions])
    setAvailabilityDraft(emptyAvailability)
    setAvailabilityError('')
    setAvailabilitySuggestion('')
    setAvailabilityModalOpen(false)
  }

  const removeAvailability=(item:TeacherAvailability)=>persistAvailability(
    project.teacherAvailability.filter(current=>!(
      current.teacherId===item.teacherId&&current.day===item.day&&current.session===item.session
    ))
  )

  const importedCount=project.assignments.filter(item=>item.source&&item.source!=='manual'&&item.source!=='duplicated').length

  const useImportedTemplate=()=>{
    if(!project.assignments.length){
      setTemplateMessage('No hay asignaciones importadas en el proyecto.')
      return
    }
    setTemplateMessage(
      `Hay ${project.assignments.length} asignaciones cargadas${importedCount?`, ${importedCount} procedentes del curso anterior`:''}. Revísalas antes de pasar a Reglas.`
    )
  }

  const autoFillMainAssignments=()=>{
    const existing=new Set(
      project.assignments.filter(item=>item.active).map(item=>`${item.groupId}|${item.subjectId}`)
    )
    const additions:TeachingAssignment[]=[]
    for(const entry of project.studyPlan.filter(item=>item.active)){
      const key=`${entry.groupId}|${entry.subjectId}`
      if(existing.has(key)) continue
      const subject=project.subjects.find(item=>item.id===entry.subjectId)
      const group=project.groups.find(item=>item.id===entry.groupId)
      if(!subject||!group) continue
      const candidates=activeTeachers.filter(teacher=>{
        const joined=teacher.specialties.join(' ').toLowerCase()
        if(entry.teacherRequirement==='tutor') return group.tutorTeacherId===teacher.id
        if(entry.teacherRequirement==='specialist') return joined.includes(subject.name.toLowerCase()) || joined.includes(subject.code.toLowerCase())
        return true
      })
      if(candidates.length!==1) continue
      additions.push({
        id:uid('asg'),
        groupId:entry.groupId,
        subjectId:entry.subjectId,
        teacherId:candidates[0].id,
        assignmentType:'main',
        weeklySessions:entry.weeklySessions>0?entry.weeklySessions:null,
        weeklyMinutes:(entry.weeklyMinutes??0)>0?(entry.weeklyMinutes??null):null,
        active:true,
        source:'auto-unique-candidate',
      })
      existing.add(key)
    }
    if(additions.length){
      persistAssignments([...project.assignments,...additions])
      setTemplateMessage(`Se han creado ${additions.length} asignaciones automáticas donde existía un único docente compatible. El resto queda pendiente de decisión.`)
    }else{
      setTemplateMessage('No se han encontrado asignaciones inequívocas nuevas para completar automáticamente.')
    }
  }

  if(!isStaffComplete(project)){
    return <div className="wizard-page assignments-page">
      <section className="wizard-intro">
        <div>
          <h1 className="wizard-page-title"><SlidersHorizontal size={28}/> Asignaciones</h1>
          <p>Relaciona cada carga del plan de estudios con el profesorado que la imparte y define apoyos, codocencias y disponibilidad temporal.</p>
        </div>
        <div className="wizard-progress-summary"><strong>6 <span>de 9</span></strong><small>Asignaciones</small></div>
      </section>
      <WizardStepper currentStep={6} project={project} navigate={navigate}/>
      <section className="empty-state-card">
        <SlidersHorizontal size={34}/>
        <h1>Completa primero Profesorado</h1>
        <p>Las asignaciones necesitan grupos, materias y docentes activos.</p>
        <button className="btn primary" onClick={()=>navigate('/profesorado')}>Ir a Profesorado</button>
      </section>
    </div>
  }

  const coveredKeys=new Set(
    activeAssignments.map(item=>`${item.groupId}|${item.subjectId}`)
  )
  const activeStudyPlanEntries=project.studyPlan.filter(item=>item.active)
  const coveredStudyEntries=activeStudyPlanEntries.filter(entry=>coveredKeys.has(`${entry.groupId}|${entry.subjectId}`)).length
  const pendingOrganizationEntries=activeStudyPlanEntries.filter(entry=>!coveredKeys.has(`${entry.groupId}|${entry.subjectId}`)&&entry.pendingOrganization)
  const uncoveredStudyEntries=activeStudyPlanEntries.filter(entry=>!coveredKeys.has(`${entry.groupId}|${entry.subjectId}`)&&!entry.pendingOrganization)
  const totalStudyEntries=activeStudyPlanEntries.length
  const reviewedStudyEntries=coveredStudyEntries+pendingOrganizationEntries.length
  const teachersWithAssignments=new Set(activeAssignments.map(item=>item.teacherId)).size
  const mainAssignments=activeAssignments.filter(item=>item.assignmentType==='main').length
  const supportAssignmentsCount=activeAssignments.filter(item=>item.assignmentType==='support').length
  const coTeachingAssignments=activeAssignments.filter(item=>item.assignmentType==='co_teaching').length

  return <div className="wizard-page assignments-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><SlidersHorizontal size={28}/> Asignaciones</h1>
        <p>Relaciona cada carga del plan de estudios con el profesorado que la imparte y define apoyos, codocencias y disponibilidad temporal.</p>
      </div>
      <div className="wizard-progress-summary"><strong>6 <span>de 9</span></strong><small>Asignaciones</small></div>
    </section>

    <WizardStepper currentStep={6} project={project} navigate={navigate}/>

    {auditFocus&&<section className="template-result audit-context-banner"><CheckCircle2 size={16}/><span>{auditFocus}</span></section>}

    <section className="structure-summary">
      <Summary label="Asignaciones activas" value={String(activeAssignments.length)} detail={`${mainAssignments} ${mainAssignments===1?'titular':'titulares'} · ${supportAssignmentsCount} ${supportAssignmentsCount===1?'apoyo':'apoyos'} · ${coTeachingAssignments} ${coTeachingAssignments===1?'codocencia':'codocencias'}`}/>
      <Summary label="Cargas revisadas" value={`${reviewedStudyEntries}/${totalStudyEntries}`} detail={pendingOrganizationEntries.length?`${coveredStudyEntries} asignadas · ${pendingOrganizationEntries.length} pendientes de organizar`:'Plan de estudios'}/>
      <Summary label="Docentes implicados" value={String(teachersWithAssignments)} detail={`De ${activeTeachers.length} activos`}/>
      <Summary label="Restricciones temporales" value={String(project.teacherAvailability.length)} detail="Disponibilidad registrada"/>
    </section>

    {(uncoveredStudyEntries.length>0||pendingOrganizationEntries.length>0)&&<section className={'assignment-progress-alert '+(progressExpanded?'is-expanded':'is-collapsed')}>
      <div className="assignment-progress-heading">
        <button
          type="button"
          className="availability-collapse-toggle"
          onClick={()=>setProgressExpanded(value=>!value)}
          aria-expanded={progressExpanded}
          aria-label={progressExpanded?'Plegar asignaciones pendientes':'Desplegar asignaciones pendientes'}
        ><ChevronDown size={17}/></button>
        <div className="assignment-progress-alert-icon"><CheckCircle2 size={18}/></div>
        <div>
          <strong>Asignaciones pendientes <span className="availability-count">{uncoveredStudyEntries.length+pendingOrganizationEntries.length}</span></strong>
          <p>{uncoveredStudyEntries.length>0
            ? `${uncoveredStudyEntries.length} ${uncoveredStudyEntries.length===1?'carga por completar':'cargas por completar'}${pendingOrganizationEntries.length?` · ${pendingOrganizationEntries.length} ${pendingOrganizationEntries.length===1?'pendiente':'pendientes'} de organizar`:''}. Reglas se habilitará cuando todas estén asignadas o revisadas como pendientes de organizar.`
            : `${pendingOrganizationEntries.length} ${pendingOrganizationEntries.length===1?'carga revisada y pendiente':'cargas revisadas y pendientes'} de organizar. Asignaciones ya no bloquea Reglas.`}</p>
        </div>
      </div>

      {progressExpanded&&pendingOrganizationEntries.length>0&&<div className="assignment-candidate-controls">
        <div className="assignment-candidate-sort-row">
          <span>Ordenar candidatos por</span>
          <div className="assignment-candidate-order">
            <button type="button" className={supportCandidateOrder==='margin'?'active':''} onClick={()=>setSupportCandidateOrder('margin')}>Franjas libres</button>
            <button type="button" className={supportCandidateOrder==='supports'?'active':''} onClick={()=>setSupportCandidateOrder('supports')}>Menos apoyos</button>
          </div>
        </div>
        <div className="assignment-candidate-priority-row">
          <div>
            <strong>Priorizar profesorado no directivo</strong>
            <small>Si está activo, el equipo directivo se mantiene como candidato pero aparece después.</small>
          </div>
          <button
            type="button"
            className={'assignment-switch '+(prioritizeNonManagement?'is-on':'')}
            role="switch"
            aria-checked={prioritizeNonManagement}
            aria-label="Priorizar profesorado no directivo"
            onClick={()=>setPrioritizeNonManagement(value=>!value)}
          ><span/></button>
        </div>
      </div>}

      {progressExpanded&&<div className="assignment-missing-list">
        {uncoveredStudyEntries.map(entry=>{
          const group=project.groups.find(item=>item.id===entry.groupId)
          const subject=project.subjects.find(item=>item.id===entry.subjectId)
          const resolved=pendingAssignmentDraft(entry)
          const teacher=project.teachers.find(item=>item.id===resolved.teacherId)
          const ready=pendingAssignmentReady(entry)
          return <article key={entry.id} className="assignment-missing-item">
            <div className="assignment-missing-copy">
              <span><strong>{group?.name??'Grupo'}</strong> · {subject?.name??'Materia'}</span>
              <small>{entry.weeklySessions>0?`${entry.weeklySessions} ses./sem.`:''}{entry.weeklyMinutes?`${entry.weeklySessions>0?' · ':''}${entry.weeklyMinutes} min/sem.`:''}{teacher?` · ${teacher.name}`:''}</small>
            </div>
            <div className="assignment-missing-actions">
              <button type="button" className="btn ghost-inline" onClick={()=>editPendingAssignment(entry)}>Editar</button>
              <button type="button" className="btn primary" disabled={!ready} title={ready?'Crear asignación con los datos resueltos':'Faltan datos por resolver'} onClick={()=>addPendingAssignment(entry)}>Añadir</button>
              <button type="button" className="btn pending-inline" onClick={()=>togglePendingOrganization(entry.id)}>Pendiente de organizar</button>
            </div>
          </article>
        })}
        {pendingOrganizationEntries.map(entry=>{
          const group=project.groups.find(item=>item.id===entry.groupId)
          const subject=project.subjects.find(item=>item.id===entry.subjectId)
          const resolved=pendingAssignmentDraft(entry)
          const suggestedTeacher=project.teachers.find(item=>item.id===resolved.teacherId)
          const candidates=suggestedTeacher?[]:supportCandidates(entry)
          return <article key={entry.id} className="assignment-missing-item is-pending-organization">
            <div className="assignment-missing-copy">
              <span><strong>{group?.name??'Grupo'}</strong> · {subject?.name??'Materia'}</span>
              <small>{entry.weeklySessions>0?`${entry.weeklySessions} ses./sem.`:''}{entry.weeklyMinutes?`${entry.weeklySessions>0?' · ':''}${entry.weeklyMinutes} min/sem.`:''} · Pendiente de organizar</small>
              <small className={'assignment-suggestion '+(suggestedTeacher?'ready':'manual')}>
                {suggestedTeacher
                  ? `Sugerencia automática: ${suggestedTeacher.name}`
                  : 'Requiere decisión: candidatos ordenados por compatibilidad y margen semanal'}
              </small>
              {!suggestedTeacher&&candidates.length>0&&<div className="assignment-candidate-list">
                {candidates.map(candidate=><button
                  type="button"
                  key={candidate.teacher.id}
                  className="assignment-candidate-chip"
                  onClick={()=>editPendingAssignment(entry,candidate.teacher.id)}
                  title={`Resolver con ${candidate.teacher.name}`}
                >
                  <strong>{candidate.teacher.name}</strong>
                  <small>{candidate.specialtyMatch&&<span>Especialidad compatible</span>}{candidate.management&&<span className="candidate-management">Equipo directivo</span>}<span>{candidate.supportAssignments} {candidate.supportAssignments===1?'apoyo asignado':'apoyos asignados'}</span><span>{candidate.margin} franjas de margen</span></small>
                </button>)}
              </div>}
              {!suggestedTeacher&&!candidates.length&&<small className="assignment-candidate-empty">No hay docentes con margen semanal disponible.</small>}
            </div>
            <div className="assignment-missing-actions">
              <button type="button" className="btn primary" onClick={()=>editPendingAssignment(entry)}>Resolver</button>
              <button
                type="button"
                className="btn pending-inline active"
                title="Volver a tratar esta carga como pendiente normal. Asignaciones volverá a bloquear Reglas hasta resolverla o marcarla de nuevo como pendiente de organizar."
                onClick={()=>togglePendingOrganization(entry.id)}
              >Volver a pendiente</button>
            </div>
          </article>
        })}
      </div>}
    </section>}

    <article className={'aside-card validation section-prevalidation-card '+(validation.length?'error':activeAssignments.length?'ready':'incomplete')}>
      <span className="panel-kicker">ESTADO:</span>
      <strong>{validation.length?'Sección Asignaciones con errores':activeAssignments.length?'Sección Asignaciones válida':'Sección Asignaciones incompleta'}</strong>
      <p>{validation.length
        ? `${validation[0]} Revisa la asignación o disponibilidad relacionada y corrige el docente, grupo, materia o carga indicada.`
        : activeAssignments.length
          ? `${activeAssignments.length} asignaciones activas · ${coveredStudyEntries} cargas asignadas${pendingOrganizationEntries.length?` · ${pendingOrganizationEntries.length} pendientes de organizar`:''} · ${teachersWithAssignments} docentes implicados. Las cargas pendientes de organizar han sido revisadas y no bloquean el paso siguiente.`
          : 'Todavía no hay asignaciones docentes. Vincula las cargas del Plan de estudios con el profesorado correspondiente.'}</p>
      {validation.length>0&&<button type="button" className="section-status-action" onClick={()=>document.querySelector('.groups-table-card')?.scrollIntoView({behavior:'smooth',block:'start'})}>Revisar asignaciones</button>}
      {!validation.length&&!activeAssignments.length&&<button type="button" className="section-status-action" onClick={openCreate}>Añadir asignación</button>}
    </article>

    {assignmentModalOpen&&<div className="modal-backdrop section-form-modal-backdrop">
      <form className="app-modal section-form-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={editingId?'Editar asignación':'Añadir asignación'}>
        <div className="app-modal-header"><div><SlidersHorizontal size={20}/><h2>{editingId?'Editar asignación':'Añadir asignación'}</h2></div></div>
        <div className="app-modal-body">
          <div className="form-card-heading"><div className="form-card-number">06A</div><div><span className="panel-kicker">{editingId?'Edición':'Docencia'}</span><h2>{editingId?'Editar asignación':'Asignar docente'}</h2><p>Una misma materia puede tener titular, apoyo y codocencia mediante asignaciones independientes.</p></div></div>
          <div className="form-grid two">
            <Field label="Grupo" required><select value={draft.groupId} onChange={e=>setDraft({...draft,groupId:e.target.value,subjectId:'',weeklySessions:'',weeklyMinutes:''})}><option value="">Selecciona...</option>{activeGroups.map(group=>{const complete=groupMainComplete(group.id)&&draft.assignmentType==='main';return <option key={group.id} value={group.id} disabled={complete}>{group.name}{complete?' · completo':''}</option>})}</select></Field>
            <Field label="Materia" required><select value={draft.subjectId} disabled={!draft.groupId} onChange={e=>{const subjectId=e.target.value;const load=studyPlanLoad(draft.groupId,subjectId);const teacherId=defaultTeacherForAssignment(draft.groupId,subjectId);setShowOtherTeachers(false);setDraft({...draft,subjectId,teacherId,...load})}}> <option value="">Selecciona...</option>{groupSubjects(draft.groupId).map(subject=>{const assigned=assignmentExists(draft.groupId,subject.id,draft.assignmentType);return <option key={subject.id} value={subject.id} disabled={assigned}>{subject.name}{assigned?' · ya asignada':''}</option>})}</select></Field>
            <Field label="Docente" required><select value={draft.teacherId} disabled={!draft.subjectId} onChange={e=>{const value=e.target.value;if(value==='__others__'){setShowOtherTeachers(true);setDraft({...draft,teacherId:''});return}setDraft({...draft,teacherId:value})}}><option value="">Selecciona...</option>{visibleAssignmentTeachers.map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}{hasSpecialtyFilter&&!showOtherTeachers&&otherAssignmentTeachers.length>0&&<option value="__others__">Otros…</option>}{showOtherTeachers&&otherAssignmentTeachers.map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select>{showOtherTeachers&&hasSpecialtyFilter&&<button type="button" className="assignment-teacher-filter-reset" onClick={()=>{setShowOtherTeachers(false);setDraft({...draft,teacherId:''})}}>Volver a docentes compatibles</button>}</Field>
            <Field label="Tipo de intervención"><select value={draft.assignmentType} onChange={e=>{setShowOtherTeachers(false);setDraft({...draft,assignmentType:e.target.value as AssignmentType,subjectId:'',teacherId:'',weeklySessions:'',weeklyMinutes:''})}}>{(Object.entries(assignmentTypeLabels) as [AssignmentType,string][]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Sesiones semanales"><input type="number" min="0" step="0.25" value={draft.weeklySessions} onChange={e=>setDraft({...draft,weeklySessions:e.target.value})} placeholder="Opcional"/></Field>
            <Field label="Minutos semanales"><input type="number" min="0" step="5" value={draft.weeklyMinutes} onChange={e=>setDraft({...draft,weeklyMinutes:e.target.value})} placeholder="Opcional"/></Field>
            {draft.groupId&&draft.subjectId&&<div className="assignment-load-source"><CheckCircle2 size={14}/><span>Carga tomada del Plan de estudios. Puedes modificarla si esta asignación necesita una excepción.</span></div>}
            {draft.subjectId&&<div className="assignment-teacher-source"><UsersRound size={14}/><span>{project.subjects.find(item=>item.id===draft.subjectId)?.type==='common'&&project.groups.find(item=>item.id===draft.groupId)?.tutorTeacherId
              ? 'Materia común: se ha preseleccionado el tutor/a del grupo. Puedes cambiarlo manualmente si existe una excepción.'
              : showOtherTeachers
                ? 'Mostrando también el resto del profesorado activo por selección manual.'
                : hasSpecialtyFilter
                  ? assignmentTeachers.length===1
                    ? 'Docente seleccionado automáticamente porque es el único compatible con esta materia. Puedes elegir “Otros…” si necesitas una excepción.'
                    : 'Docentes filtrados según las especialidades configuradas en Profesorado. Usa “Otros…” para ver el resto.'
                  : 'No hay un filtro específico de especialidad para esta materia; se muestra todo el profesorado activo.'}</span></div>}
          </div>
          {error&&<div className="inline-error">{error}</div>}
          <div className={'form-guide '+(assignmentReady?'complete':'partial')}><strong>{assignmentReady?'Asignación lista':'Siguiente paso'}</strong><span>{assignmentGuide}</span></div>
        </div>
        <div className="app-modal-footer"><button type="button" className="btn ghost-inline" onClick={reset}>Cancelar</button><button className="btn primary" type="submit" disabled={!assignmentReady}>Aceptar</button></div>
      </form>
    </div>}

    {bulkModalOpen&&<div className="modal-backdrop section-form-modal-backdrop">
      <div className="app-modal section-form-modal" role="dialog" aria-modal="true" aria-label="Asignar materia a varios grupos">
        <div className="app-modal-header"><div><UsersRound size={20}/><h2>Asignar materia a grupos</h2></div></div>
        <div className="app-modal-body">
          <div className="form-card-heading"><div className="form-card-number">06B</div><div><span className="panel-kicker">Asignación masiva</span><h2>Una materia · un docente</h2><p>Selecciona una materia y un docente. Se crearán únicamente las asignaciones titulares pendientes en los grupos que tengan esa materia en su Plan de estudios.</p></div></div>
          <div className="form-grid two">
            <Field label="Materia" required><select value={bulkSubjectId} onChange={e=>setBulkSubjectId(e.target.value)}><option value="">Selecciona...</option>{activeSubjects.map(subject=>{const pending=project.studyPlan.filter(entry=>entry.active&&entry.subjectId===subject.id&&!assignmentExists(entry.groupId,subject.id,'main',null)).length;return <option key={subject.id} value={subject.id} disabled={!pending}>{subject.name}{pending?` · ${pending} pendientes`:' · completa'}</option>})}</select></Field>
            <Field label="Docente" required><select value={bulkTeacherId} disabled={!bulkSubjectId} onChange={e=>setBulkTeacherId(e.target.value)}><option value="">Selecciona...</option>{activeTeachers.map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></Field>
          </div>
          {bulkSubjectId&&<div className="bulk-assignment-preview">
            <strong>{bulkEligibleEntries.length} {bulkEligibleEntries.length===1?'grupo pendiente':'grupos pendientes'}</strong>
            <p>{bulkEligibleEntries.length
              ? bulkEligibleEntries.map(entry=>project.groups.find(group=>group.id===entry.groupId)?.name).filter(Boolean).join(' · ')
              : 'Todos los grupos que cursan esta materia ya tienen una asignación titular.'}</p>
          </div>}
          <div className={'form-guide '+(bulkSubjectId&&bulkTeacherId&&bulkEligibleEntries.length?'complete':'partial')}><strong>{bulkSubjectId&&bulkTeacherId&&bulkEligibleEntries.length?'Asignación masiva lista':'Siguiente paso'}</strong><span>{!bulkSubjectId?'Selecciona la materia.':!bulkTeacherId?'Selecciona el docente que la impartirá.':!bulkEligibleEntries.length?'No quedan grupos pendientes para esta materia.':`Se crearán ${bulkEligibleEntries.length} asignaciones titulares conservando la carga semanal definida en el Plan de estudios.`}</span></div>
        </div>
        <div className="app-modal-footer"><button type="button" className="btn ghost-inline" onClick={()=>setBulkModalOpen(false)}>Cancelar</button><button type="button" className="btn primary" disabled={!bulkSubjectId||!bulkTeacherId||!bulkEligibleEntries.length} onClick={applyBulkAssignment}>Aceptar</button></div>
      </div>
    </div>}

    {availabilityModalOpen&&<div className="modal-backdrop section-form-modal-backdrop">
      <form className="app-modal section-form-modal" onSubmit={submitAvailability} role="dialog" aria-modal="true" aria-label="Añadir restricciones de disponibilidad">
        <div className="app-modal-header"><div><CalendarClock size={20}/><h2>Añadir restricciones</h2></div></div>
        <div className="app-modal-body">
          <div className="availability-form">
            <div className="availability-top-grid">
              <MultiCheckSelect label="Docentes" placeholder="Selecciona docentes..." searchable options={activeTeachers.map(teacher=>({value:teacher.id,label:teacher.name}))} values={availabilityDraft.teacherIds} onChange={teacherIds=>setAvailabilityDraft({...availabilityDraft,teacherIds})}/>
              <div className="availability-days-field">
                <span>Días</span>
                <div className="availability-days-box">
                  {project.schedule.activeDays.map(day=>{
                    const checked=availabilityDraft.days.includes(day)
                    return <label key={day} className={'availability-day-option '+(checked?'selected':'')}>
                      <strong>{day}</strong>
                      <input
                        type="checkbox"
                        checked={checked}
                        aria-label={dayLabels[day]}
                        onChange={()=>{
                          const days=checked
                            ? availabilityDraft.days.filter(value=>value!==day)
                            : [...availabilityDraft.days,day]
                          setAvailabilityDraft({...availabilityDraft,days})
                        }}
                      />
                    </label>
                  })}
                </div>
              </div>
              <MultiCheckSelect label="Sesiones" placeholder="Selecciona sesiones..." allValue="__all__" options={[{value:'__all__',label:'Todas las sesiones'},...project.schedule.blocks.filter(block=>block.active&&block.type==='teaching').map(block=>({value:block.id,label:block.label+' · '+block.start+'-'+block.end}))]} values={availabilityDraft.sessions} onChange={sessions=>setAvailabilityDraft({...availabilityDraft,sessions})}/>
            </div>

            <div className="availability-bottom-grid">
              <label className="availability-single-field"><span>Estado</span><select value={availabilityDraft.status} onChange={e=>setAvailabilityDraft({...availabilityDraft,status:e.target.value as AvailabilityStatus})}>{(Object.entries(availabilityLabels) as [AvailabilityStatus,string][]).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
              <label className="availability-single-field availability-detail-field availability-autocomplete">
                <span>Motivo / detalle</span>
                <input
                  value={availabilityDraft.detail}
                  onChange={e=>{
                    const value=e.target.value
                    setAvailabilityDraft({...availabilityDraft,detail:value})
                    const normalized=value.trim().toLocaleLowerCase('es')
                    const match=normalized.length>=3
                      ? availabilityReasons.find(reason=>reason.toLocaleLowerCase('es').startsWith(normalized)&&reason.toLocaleLowerCase('es')!==normalized)
                      : undefined
                    setAvailabilitySuggestion(match??'')
                  }}
                  onKeyDown={e=>{
                    if(e.key==='Tab'&&availabilitySuggestion){
                      e.preventDefault()
                      setAvailabilityDraft({...availabilityDraft,detail:availabilitySuggestion})
                      setAvailabilitySuggestion('')
                    }
                  }}
                  onBlur={()=>window.setTimeout(()=>setAvailabilitySuggestion(''),120)}
                  placeholder="Opcional"
                  autoComplete="off"
                />
                {availabilitySuggestion&&<button
                  type="button"
                  className="availability-suggestion"
                  onMouseDown={e=>e.preventDefault()}
                  onClick={()=>{
                    setAvailabilityDraft({...availabilityDraft,detail:availabilitySuggestion})
                    setAvailabilitySuggestion('')
                  }}
                ><span>{availabilitySuggestion}</span><small>Tab para completar</small></button>}
              </label>
            </div>
          </div>
          <div className={'form-guide '+(availabilityReady?'complete':'partial')}><strong>{availabilityReady?'Restricción lista':'Siguiente paso'}</strong><span>{availabilityGuide}</span></div>
          {availabilityError&&<div className="inline-error">{availabilityError}</div>}
        </div>
        <div className="app-modal-footer"><button type="button" className="btn ghost-inline" onClick={closeAvailability}>Cancelar</button><button className="btn primary" type="submit" disabled={!availabilityReady}>Aceptar</button></div>
      </form>
    </div>}

    {templateMessage&&<div className="template-result"><CheckCircle2 size={16}/><span>{templateMessage}</span></div>}

    <section className={'groups-table-card assignments-matrix-card '+(assignmentsExpanded?'is-expanded':'is-collapsed')}>
      <div className="groups-table-heading assignments-matrix-heading">
        <button
          type="button"
          className="availability-collapse-toggle"
          onClick={()=>setAssignmentsExpanded(value=>!value)}
          aria-expanded={assignmentsExpanded}
          aria-label={assignmentsExpanded?'Plegar matriz docente':'Desplegar matriz docente'}
        ><ChevronDown size={17}/></button>
        <div className="availability-heading-copy">
          <span className="panel-kicker">Matriz docente</span>
          <h2>Asignaciones configuradas <span className="availability-count">{project.assignments.length}</span></h2>
        </div>
        <div className="groups-table-actions assignments-matrix-actions"><button className="btn ghost-inline" onClick={()=>{setBulkSubjectId('');setBulkTeacherId('');setBulkModalOpen(true)}}><UsersRound size={16}/> Asignar materia a docente</button><button className="btn ghost-inline" onClick={openCreate}><Plus size={16}/> Añadir asignación</button></div>
      </div>

      {assignmentsExpanded&&<div className="assignments-matrix-content">
        {project.assignments.length>0&&<div className="assignment-filter-stack">
          <div className="assignment-filter-row">
            <span>Grupos</span>
            <div className="list-filter-tags">
              <button type="button" className={assignmentGroupFilter==='all'?'active':''} onClick={()=>setAssignmentGroupFilter('all')}>Todos</button>
              {assignmentGroupIds.map(groupId=>{
                const group=project.groups.find(item=>item.id===groupId)
                return <button type="button" key={groupId} className={assignmentGroupFilter===groupId?'active':''} onClick={()=>setAssignmentGroupFilter(groupId)}>{group?.name??'Grupo eliminado'}</button>
              })}
            </div>
          </div>
          <div className="assignment-filter-row">
            <span>Docentes</span>
            <div className="list-filter-tags">
              <button type="button" className={assignmentTeacherFilter==='all'?'active':''} onClick={()=>setAssignmentTeacherFilter('all')}>Todos</button>
              {assignmentTeacherIds.map(teacherId=>{
                const teacher=project.teachers.find(item=>item.id===teacherId)
                return <button type="button" key={teacherId} className={assignmentTeacherFilter===teacherId?'active':''} onClick={()=>setAssignmentTeacherFilter(teacherId)}>{teacher?.name??'Docente eliminado'}</button>
              })}
            </div>
          </div>
        </div>}

        {project.assignments.length===0
          ? <div className="groups-empty"><UsersRound size={28}/><strong>No hay asignaciones todavía</strong><p>Asigna profesorado manualmente, importa el JSON anterior o completa los casos inequívocos.</p></div>
          : visibleAssignments.length===0
            ? <div className="groups-empty"><UsersRound size={28}/><strong>No hay asignaciones con estos filtros</strong><p>Cambia el grupo o docente seleccionado para mostrar resultados.</p></div>
            : <div className="groups-table-wrap"><table className="groups-table assignments-table">
          <thead><tr><th>Grupo</th><th>Materia</th><th>Docente</th><th>Intervención</th><th>Ses./sem.</th><th>Min/sem.</th><th>Origen</th><th>Estado</th><th/></tr></thead>
          <tbody>{visibleAssignments.map(assignment=>{
            const group=project.groups.find(item=>item.id===assignment.groupId)
            const subject=project.subjects.find(item=>item.id===assignment.subjectId)
            const teacher=project.teachers.find(item=>item.id===assignment.teacherId)
            return <tr key={assignment.id} className={!assignment.active?'is-inactive':''}>
              <td><strong>{group?.name??'Grupo eliminado'}</strong></td>
              <td>{subject?.name??'Materia eliminada'}</td>
              <td>{teacher?.name??'Docente eliminado'}</td>
              <td>{assignmentTypeLabels[assignment.assignmentType]}</td>
              <td>{assignment.weeklySessions??'—'}</td>
              <td>{assignment.weeklyMinutes??'—'}</td>
              <td>{sourceLabel(assignment.source)}</td>
              <td><button className={'status-toggle '+(assignment.active?'active':'')} onClick={()=>toggleActive(assignment.id)}>{assignment.active?'Activa':'Inactiva'}</button></td>
              <td><div className="row-actions"><button title="Duplicar" onClick={()=>duplicate(assignment)}><Copy size={15}/></button><button title="Editar" onClick={()=>edit(assignment)}><Pencil size={15}/></button><button title="Eliminar" className="danger" onClick={()=>remove(assignment.id)}><Trash2 size={15}/></button></div></td>
            </tr>
          })}</tbody>
        </table></div>}
      </div>}
    </section>

    <section className={'availability-card '+(availabilityExpanded?'is-expanded':'is-collapsed')}>
      <div className="groups-table-heading availability-heading">
        <button
          type="button"
          className="availability-collapse-toggle"
          onClick={()=>setAvailabilityExpanded(value=>!value)}
          aria-expanded={availabilityExpanded}
          aria-label={availabilityExpanded?'Plegar disponibilidad':'Desplegar disponibilidad'}
        ><ChevronDown size={17}/></button>
        <div className="availability-heading-copy">
          <span className="panel-kicker">Disponibilidad</span>
          <h2>Restricciones por día y sesión <span className="availability-count">{project.teacherAvailability.length}</span></h2>
        </div>
        <button className="btn ghost-inline availability-add-action" onClick={()=>setAvailabilityModalOpen(true)}><Plus size={16}/> Añadir restricción</button>
      </div>

      {availabilityExpanded&&<div className="availability-content">
        {project.teacherAvailability.length>0&&<div className="list-filter-tags availability-filter-tags" aria-label="Filtrar restricciones por docente">
          <button type="button" className={availabilityTeacherFilter==='all'?'active':''} onClick={()=>setAvailabilityTeacherFilter('all')}>Todos</button>
          {availabilityTeacherIds.map(teacherId=>{
            const teacher=project.teachers.find(item=>item.id===teacherId)
            return <button type="button" key={teacherId} className={availabilityTeacherFilter===teacherId?'active':''} onClick={()=>setAvailabilityTeacherFilter(teacherId)}>{teacher?.name??'Docente eliminado'}</button>
          })}
        </div>}

        {project.teacherAvailability.length===0
          ? <div className="groups-empty"><CalendarClock size={26}/><strong>No hay restricciones temporales</strong><p>Añade únicamente las excepciones de disponibilidad que afecten al horario.</p></div>
          : visibleAvailability.length===0
            ? <div className="groups-empty"><CalendarClock size={26}/><strong>No hay restricciones para este docente</strong><p>Selecciona otro filtro para consultar sus restricciones.</p></div>
            : <div className="availability-list">{visibleAvailability.map((item,index)=>{
              const teacher=project.teachers.find(value=>value.id===item.teacherId)
              const block=project.schedule.blocks.find(value=>value.id===item.session)
              return <article key={`${item.teacherId}-${item.day}-${item.session}-${index}`}>
                <div><strong>{teacher?.name??'Docente eliminado'}</strong><span>{dayLabels[item.day as Weekday]??item.day} · {block?.label??item.session} · {availabilityLabels[item.status]}</span>{item.detail&&<small>{item.detail}</small>}</div>
                <button className="row-delete" onClick={()=>removeAvailability(item)}><Trash2 size={15}/></button>
              </article>
            })}</div>}
      </div>}
    </section>

    <div className="section-template-full">
      <TemplatePanel
        title="Asignaciones del curso anterior"
        description="Reutiliza las relaciones importadas mediante JSON y revisa únicamente los cambios de este curso."
        actions={[
          {id:'imported-assignments',label:'Revisar asignaciones importadas',description:project.assignments.length?`${project.assignments.length} ${project.assignments.length===1?'asignación disponible':'asignaciones disponibles'}`:'No hay asignaciones importadas',disabled:project.assignments.length===0,onApply:useImportedTemplate},
          {id:'autofill-unique',label:'Completar casos inequívocos',description:'Solo asigna cuando existe un único docente compatible',onApply:autoFillMainAssignments},
        ]}
      />
    </div>

    <section className="section-info-grid">
      <article className="panel compact-info-panel"><UsersRound size={22}/><div><strong>Cobertura del plan</strong><p>Cada carga del Plan de estudios debe quedar vinculada al menos a una asignación docente activa.</p></div></article>
      <article className="panel compact-info-panel"><CalendarClock size={22}/><div><strong>Disponibilidad</strong><p>Registra aquí únicamente excepciones por día y sesión; las restricciones se tendrán en cuenta durante la generación.</p></div></article>
      <article className="panel compact-info-panel"><SlidersHorizontal size={22}/><div><strong>Intervenciones</strong><p>Titular, apoyo y codocencia se guardan como asignaciones independientes para mantener trazabilidad.</p></div></article>
    </section>
  </div>
}

type MultiCheckOption={value:string;label:string}

function MultiCheckSelect({
  label,
  placeholder,
  options,
  values,
  onChange,
  searchable=false,
  allValue,
}:{
  label:string
  placeholder:string
  options:MultiCheckOption[]
  values:string[]
  onChange:(values:string[])=>void
  searchable?:boolean
  allValue?:string
}){
  const [query,setQuery]=useState('')
  const [open,setOpen]=useState(false)
  const rootRef=useRef<HTMLDivElement>(null)

  useEffect(()=>{
    const closeOutside=(event:PointerEvent)=>{
      if(open&&rootRef.current&&!rootRef.current.contains(event.target as Node))setOpen(false)
    }
    document.addEventListener('pointerdown',closeOutside)
    return ()=>document.removeEventListener('pointerdown',closeOutside)
  },[open])

  const normalized=query.trim().toLowerCase()
  const visibleOptions=normalized
    ? options.filter(option=>option.label.toLowerCase().includes(normalized))
    : options

  const toggle=(value:string)=>{
    if(allValue&&value===allValue){
      onChange(values.includes(allValue)?[]:[allValue])
      return
    }
    const current=allValue?values.filter(item=>item!==allValue):values
    onChange(current.includes(value)
      ? current.filter(item=>item!==value)
      : [...current,value])
  }

  const selectedLabels=values
    .map(value=>options.find(option=>option.value===value)?.label)
    .filter(Boolean) as string[]

  const summary=values.length===0
    ? placeholder
    : allValue&&values.includes(allValue)
      ? options.find(option=>option.value===allValue)?.label??'Todos'
      : selectedLabels.length<=2
        ? selectedLabels.join(', ')
        : selectedLabels.length+' seleccionados'

  return <div
    ref={rootRef}
    className="availability-compact-field multicheck-field"
    onBlur={event=>{
      const next=event.relatedTarget as Node|null
      if(!next||!event.currentTarget.contains(next))setOpen(false)
    }}
  >
    <span>{label}</span>
    <div className={'multicheck-select'+(open?' open':'')}>
      <button
        type="button"
        className="multicheck-trigger"
        aria-expanded={open}
        onClick={()=>setOpen(current=>!current)}
      >
        <span className={values.length?'has-value':'placeholder'}>{summary}</span>
        <ChevronDown size={16}/>
      </button>

      {open&&<div className="multicheck-menu">
        {searchable&&<div className="multicheck-search">
          <Search size={14}/>
          <input
            value={query}
            onChange={event=>setQuery(event.target.value)}
            placeholder="Buscar..."
          />
        </div>}
        <div className="multicheck-options">
          {visibleOptions.map(option=><label key={option.value} className="multicheck-option">
            <input
              type="checkbox"
              checked={values.includes(option.value)}
              onChange={()=>toggle(option.value)}
            />
            <span>{option.label}</span>
          </label>)}
          {!visibleOptions.length&&<div className="multicheck-empty">Sin resultados</div>}
        </div>
        {values.length>0&&<button type="button" className="multicheck-clear" onClick={()=>onChange([])}>Limpiar selección</button>}
      </div>}
    </div>
  </div>
}

function Summary({label,value,detail}:{label:string;value:string;detail:string}){return <article className="structure-summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>}
function Field({label,required,children}:{label:string;required?:boolean;children:React.ReactNode}){return <label className="form-field"><span>{label}{required&&<em>*</em>}</span>{children}</label>}
function sourceLabel(source?:string){
  if(!source)return '—'
  if(source==='manual')return 'Manual'
  if(source==='duplicated')return 'Duplicada'
  if(source==='auto-unique-candidate')return 'Automática'
  return 'Importada'
}
