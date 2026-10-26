import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  BookOpen, CheckCircle2, ChevronDown, Copy, GraduationCap, Pencil, Plus, Save, Trash2,
} from 'lucide-react'
import {
  isStructureComplete,
  validateStudyPlan,
  type EducationStage,
  type StudyPlanEntry,
  type StudyPlanMode,
  type Subject,
  type SubjectType,
  type TeacherRequirement,
  type ViyeuticaProject,
} from '../domain/project'
import { saveProject } from '../store/projectStorage'
import { WizardStepper } from '../components/WizardStepper'
import { TemplatePanel } from '../components/TemplatePanel'
import {
  applyInfantExtremaduraTemplate,
  applyPrimaryExtremaduraTemplate,
} from '../domain/studyPlanTemplates'

interface SubjectDraft {
  name:string
  code:string
  stage:EducationStage|''
  type:SubjectType
  defaultSessionMinutes:string
}

interface EntryDraft {
  groupId:string
  subjectId:string
  weeklySessions:string
  weeklyMinutes:string
  mandatory:boolean
  mode:StudyPlanMode
  teacherRequirement:TeacherRequirement
  fixedSessionMinutes:string
  notes:string
}

const emptySubject:SubjectDraft={
  name:'',code:'',stage:'',type:'common',defaultSessionMinutes:'',
}
const emptyEntry:EntryDraft={
  groupId:'',subjectId:'',weeklySessions:'1',weeklyMinutes:'',mandatory:true,mode:'ordinary',
  teacherRequirement:'any',fixedSessionMinutes:'',notes:'',
}
const uid=(prefix:string)=>prefix+'_'+crypto.randomUUID()

const subjectTypes:{value:SubjectType;label:string}[]=[
  {value:'common',label:'Común'},
  {value:'specific',label:'Específica'},
  {value:'optional',label:'Optativa'},
  {value:'other',label:'Otra'},
]
const planModes:{value:StudyPlanMode;label:string}[]=[
  {value:'ordinary',label:'Ordinaria'},
  {value:'split',label:'Desdoble'},
  {value:'co_teaching',label:'Codocencia'},
  {value:'alternative',label:'Alternativa / simultánea'},
  {value:'other',label:'Otro'},
]
const teacherRequirements:{value:TeacherRequirement;label:string}[]=[
  {value:'any',label:'Sin requisito previo'},
  {value:'tutor',label:'Tutor/a del grupo'},
  {value:'specialist',label:'Especialista'},
  {value:'specific',label:'Profesor concreto (paso 5)'},
]

export function StudyPlanPage({
  project,
  navigate,
}:{
  project:ViyeuticaProject
  navigate:(path:string)=>void
}) {
  const [subjectDraft,setSubjectDraft]=useState<SubjectDraft>(emptySubject)
  const [entryDraft,setEntryDraft]=useState<EntryDraft>(emptyEntry)
  const [editingSubject,setEditingSubject]=useState<string|null>(null)
  const [editingEntry,setEditingEntry]=useState<string|null>(null)
  const [subjectError,setSubjectError]=useState('')
  const [entryError,setEntryError]=useState('')
  const [templateMessage,setTemplateMessage]=useState('')
  const [subjectStageFilter,setSubjectStageFilter]=useState<'all'|EducationStage>('all')
  const [entryGroupFilter,setEntryGroupFilter]=useState<'all'|string>('all')
  const [subjectModalOpen,setSubjectModalOpen]=useState(false)
  const [entryModalOpen,setEntryModalOpen]=useState(false)
  const [subjectsExpanded,setSubjectsExpanded]=useState(false)
  const [entriesExpanded,setEntriesExpanded]=useState(false)

  const activeGroups=project.groups.filter(group=>group.active)
  const activeSubjects=project.subjects.filter(subject=>subject.active)
  const activeEntries=project.studyPlan.filter(entry=>entry.active)
  const visibleSubjects=project.subjects.filter(subject=>subjectStageFilter==='all'||subject.stage===subjectStageFilter)
  const visibleEntries=project.studyPlan.filter(entry=>entryGroupFilter==='all'||entry.groupId===entryGroupFilter)
  const validation=useMemo(()=>validateStudyPlan(project),[project])
  const coveredGroups=new Set(activeEntries.map(entry=>entry.groupId)).size
  const weeklySessionTotal=activeEntries.reduce((sum,entry)=>sum+(entry.weeklySessions||0),0)
  const weeklyMinuteTotal=activeEntries.reduce((sum,entry)=>sum+(entry.weeklyMinutes??0),0)
  const subjectReady=Boolean(subjectDraft.name.trim()&&subjectDraft.stage)
  const subjectGuide=!subjectDraft.name.trim()?'Indica el nombre de la materia.'
    :!subjectDraft.stage?'Selecciona la etapa de la materia.'
    :'La materia tiene los datos mínimos necesarios. Ya puedes añadirla.'
  const weeklySessionsValue=entryDraft.weeklySessions===''?0:Number(entryDraft.weeklySessions)
  const weeklyMinutesValue=entryDraft.weeklyMinutes===''?0:Number(entryDraft.weeklyMinutes)
  const entryReady=Boolean(
    entryDraft.groupId&&
    entryDraft.subjectId&&
    ((Number.isFinite(weeklySessionsValue)&&weeklySessionsValue>0)||(Number.isFinite(weeklyMinutesValue)&&weeklyMinutesValue>0))
  )
  const entryGuide=!entryDraft.groupId?'Selecciona primero el grupo.'
    :!entryDraft.subjectId?'Selecciona la materia.'
    :!((Number.isFinite(weeklySessionsValue)&&weeklySessionsValue>0)||(Number.isFinite(weeklyMinutesValue)&&weeklyMinutesValue>0))
      ?'Indica la carga semanal mediante sesiones o minutos.'
      :'La carga tiene los datos mínimos necesarios. Ya puedes añadirla.'

  useEffect(()=>{
    const raw=window.location.hash.split('?')[1]
    if(!raw)return
    const params=new URLSearchParams(raw)
    const groupId=params.get('groupId')??''
    if(!groupId||!project.groups.some(group=>group.id===groupId))return
    setEntryGroupFilter(groupId)
    setEntriesExpanded(true)
    window.setTimeout(()=>document.querySelector('.plan-table')?.scrollIntoView({behavior:'smooth',block:'start'}),80)
  },[])

  const assignedSubjectIdsForGroup=(groupId:string)=>new Set(
    activeEntries
      .filter(entry=>entry.groupId===groupId&&entry.id!==editingEntry)
      .map(entry=>entry.subjectId)
  )

  const compatibleSubjectsForGroup=(groupId:string)=>{
    const group=activeGroups.find(item=>item.id===groupId)
    return group?activeSubjects.filter(subject=>subject.stage===group.stage):[]
  }

  const groupPlanComplete=(groupId:string)=>{
    const compatible=compatibleSubjectsForGroup(groupId)
    if(!compatible.length)return false
    const assigned=assignedSubjectIdsForGroup(groupId)
    return compatible.every(subject=>assigned.has(subject.id))
  }

  const subjectAlreadyAssigned=(groupId:string,subjectId:string)=>
    assignedSubjectIdsForGroup(groupId).has(subjectId)

  const persist=(patch:Partial<ViyeuticaProject>)=>saveProject({...project,...patch})

  const resetSubject=()=>{
    setSubjectDraft(emptySubject)
    setEditingSubject(null)
    setSubjectError('')
    setSubjectModalOpen(false)
  }
  const resetEntry=()=>{
    setEntryDraft(emptyEntry)
    setEditingEntry(null)
    setEntryError('')
    setEntryModalOpen(false)
  }
  const openSubjectCreate=()=>{setSubjectDraft(emptySubject);setEditingSubject(null);setSubjectError('');setSubjectModalOpen(true)}
  const openEntryCreate=()=>{setEntryDraft(emptyEntry);setEditingEntry(null);setEntryError('');setEntryModalOpen(true)}

  const applyTemplate=(kind:'infantil'|'primaria')=>{
    const result=kind==='infantil'
      ? applyInfantExtremaduraTemplate(project)
      : applyPrimaryExtremaduraTemplate(project)
    saveProject(result.project)
    setTemplateMessage(
      result.addedEntries
        ? `Plantilla aplicada: ${result.addedEntries} cargas nuevas y ${result.addedSubjects} materias nuevas. ${result.skippedEntries ? `${result.skippedEntries} cargas existentes se conservaron sin cambios.` : ''}`
        : 'La plantilla no añadió cargas nuevas porque los grupos ya tienen esas materias configuradas.'
    )
  }

  const submitSubject=(event:FormEvent)=>{
    event.preventDefault()
    if(!subjectDraft.name.trim()||!subjectDraft.stage){
      setSubjectError('Indica el nombre y la etapa de la materia.')
      return
    }
    const duplicate=project.subjects.some(subject=>
      subject.id!==editingSubject &&
      subject.stage===subjectDraft.stage &&
      subject.name.trim().toLowerCase()===subjectDraft.name.trim().toLowerCase()
    )
    if(duplicate){
      setSubjectError('Ya existe una materia con ese nombre en la misma etapa.')
      return
    }

    const subject:Subject={
      id:editingSubject??uid('sub'),
      name:subjectDraft.name.trim(),
      code:subjectDraft.code.trim(),
      stage:subjectDraft.stage,
      type:subjectDraft.type,
      defaultSessionMinutes:subjectDraft.defaultSessionMinutes===''?null:Math.max(1,Number(subjectDraft.defaultSessionMinutes)),
      active:true,
    }
    const next=editingSubject
      ? project.subjects.map(item=>item.id===editingSubject?subject:item)
      : [...project.subjects,subject]
    persist({subjects:next})
    resetSubject()
  }

  const editSubject=(subject:Subject)=>{
    setEditingSubject(subject.id)
    setSubjectDraft({
      name:subject.name,
      code:subject.code,
      stage:subject.stage,
      type:subject.type,
      defaultSessionMinutes:subject.defaultSessionMinutes===null?'':String(subject.defaultSessionMinutes),
    })
    setSubjectError('')
    setSubjectModalOpen(true)
  }

  const removeSubject=(id:string)=>{
    if(project.studyPlan.some(entry=>entry.subjectId===id)){
      setSubjectError('No puedes eliminar una materia que ya tiene cargas asignadas. Elimina primero esas cargas o desactiva la materia.')
      return
    }
    persist({subjects:project.subjects.filter(subject=>subject.id!==id)})
  }

  const toggleSubject=(id:string)=>{
    persist({subjects:project.subjects.map(subject=>subject.id===id?{...subject,active:!subject.active}:subject)})
  }

  const submitEntry=(event:FormEvent)=>{
    event.preventDefault()
    if(!entryDraft.groupId||!entryDraft.subjectId){
      setEntryError('Selecciona un grupo y una materia.')
      return
    }
    const weekly=entryDraft.weeklySessions===''?0:Number(entryDraft.weeklySessions)
    const weeklyMinutes=entryDraft.weeklyMinutes===''?null:Number(entryDraft.weeklyMinutes)
    if((!Number.isFinite(weekly)||weekly<0) || (weeklyMinutes!==null && (!Number.isFinite(weeklyMinutes)||weeklyMinutes<=0))){
      setEntryError('Revisa la carga semanal indicada.')
      return
    }
    if(weekly<=0 && (weeklyMinutes??0)<=0){
      setEntryError('Indica sesiones semanales o minutos semanales.')
      return
    }
    const subject=project.subjects.find(item=>item.id===entryDraft.subjectId)
    const group=project.groups.find(item=>item.id===entryDraft.groupId)
    if(!subject||!group){
      setEntryError('La materia o el grupo ya no existen.')
      return
    }
    if(subject.stage!==group.stage){
      setEntryError('La etapa de la materia no coincide con la del grupo.')
      return
    }
    const duplicate=project.studyPlan.some(entry=>
      entry.id!==editingEntry &&
      entry.groupId===entryDraft.groupId &&
      entry.subjectId===entryDraft.subjectId &&
      entry.active
    )
    if(duplicate){
      setEntryError('Ese grupo ya tiene una carga activa para esta materia.')
      return
    }

    const entry:StudyPlanEntry={
      id:editingEntry??uid('plan'),
      groupId:entryDraft.groupId,
      subjectId:entryDraft.subjectId,
      weeklySessions:weekly,
      weeklyMinutes,
      mandatory:entryDraft.mandatory,
      mode:entryDraft.mode,
      teacherRequirement:entryDraft.teacherRequirement,
      teacherId:null,
      fixedSessionMinutes:entryDraft.fixedSessionMinutes===''?null:Math.max(1,Number(entryDraft.fixedSessionMinutes)),
      notes:entryDraft.notes.trim(),
      active:true,
    }
    const next=editingEntry
      ? project.studyPlan.map(item=>item.id===editingEntry?entry:item)
      : [...project.studyPlan,entry]
    persist({studyPlan:next})
    resetEntry()
  }

  const editEntry=(entry:StudyPlanEntry)=>{
    setEditingEntry(entry.id)
    setEntryDraft({
      groupId:entry.groupId,
      subjectId:entry.subjectId,
      weeklySessions:entry.weeklySessions>0?String(entry.weeklySessions):'',
      weeklyMinutes:entry.weeklyMinutes?String(entry.weeklyMinutes):'',
      mandatory:entry.mandatory,
      mode:entry.mode,
      teacherRequirement:entry.teacherRequirement,
      fixedSessionMinutes:entry.fixedSessionMinutes===null?'':String(entry.fixedSessionMinutes),
      notes:entry.notes,
    })
    setEntryError('')
    setEntryModalOpen(true)
  }

  const removeEntry=(id:string)=>persist({studyPlan:project.studyPlan.filter(entry=>entry.id!==id)})
  const toggleEntry=(id:string)=>persist({studyPlan:project.studyPlan.map(entry=>entry.id===id?{...entry,active:!entry.active}:entry)})

  const duplicateGroupPlan=(sourceGroupId:string,targetGroupIds:string[])=>{
    const validTargets=targetGroupIds.filter(targetGroupId=>targetGroupId&&targetGroupId!==sourceGroupId)
    if(!sourceGroupId||!validTargets.length)return
    const sourceEntries=project.studyPlan.filter(entry=>entry.groupId===sourceGroupId&&entry.active)
    const copies=validTargets.flatMap(targetGroupId=>{
      const existing=new Set(project.studyPlan.filter(entry=>entry.groupId===targetGroupId).map(entry=>entry.subjectId))
      return sourceEntries
        .filter(entry=>!existing.has(entry.subjectId))
        .map(entry=>({...entry,id:uid('plan'),groupId:targetGroupId,teacherId:null}))
    })
    if(copies.length){
      persist({studyPlan:[...project.studyPlan,...copies]})
      setTemplateMessage(`Plantilla aplicada: ${copies.length} ${copies.length===1?'carga copiada':'cargas copiadas'} en ${validTargets.length} ${validTargets.length===1?'grupo':'grupos'} destino.`)
    }else{
      setTemplateMessage('No se añadieron cargas nuevas porque los grupos seleccionados ya tenían las materias disponibles de la plantilla.')
    }
  }

  if(!isStructureComplete(project)){
    return <div className="wizard-page study-plan-page">
      <section className="wizard-intro">
        <div>
          <h1 className="wizard-page-title"><BookOpen size={28}/> Plan de estudios</h1>
          <p>Define las materias y su carga semanal por grupo. ⩒Yeutika no aplica aquí cargas normativas inventadas: los valores deben corresponder al centro y al curso configurado.</p>
        </div>
        <div className="wizard-progress-summary"><strong>4 <span>de 9</span></strong><small>Plan de estudios</small></div>
      </section>
      <WizardStepper currentStep={4} project={project} navigate={navigate}/>
      <section className="empty-state-card">
        <BookOpen size={34}/>
        <h1>Primero define los grupos</h1>
        <p>El plan de estudios se asigna a unidades reales del centro. Puedes volver a este paso después aunque la jornada no esté terminada.</p>
        <button className="btn primary" onClick={()=>navigate('/grupos')}>Ir a Estructura y grupos</button>
      </section>
    </div>
  }

  const groupSubjects=(groupId:string)=>activeSubjects.filter(subject=>{
    const group=project.groups.find(item=>item.id===groupId)
    return group ? subject.stage===group.stage : false
  })

  const groupPlanCompleteForCopy=(groupId:string)=>{
    const compatible=compatibleSubjectsForGroup(groupId)
    if(!compatible.length)return false
    const assigned=new Set(activeEntries.filter(entry=>entry.groupId===groupId).map(entry=>entry.subjectId))
    return compatible.every(subject=>assigned.has(subject.id))
  }

  return <div className="wizard-page study-plan-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><BookOpen size={28}/> Plan de estudios</h1>
        <p>Define las materias y su carga semanal por grupo. ⩒Yeutika no aplica aquí cargas normativas inventadas: los valores deben corresponder al centro y al curso configurado.</p>
      </div>
      <div className="wizard-progress-summary"><strong>4 <span>de 9</span></strong><small>Plan de estudios</small></div>
    </section>

    <WizardStepper currentStep={4} project={project} navigate={navigate}/>

    <section className="structure-summary">
      <Summary label="Materias activas" value={String(activeSubjects.length)} detail="catálogo del centro"/>
      <Summary label="Cargas configuradas" value={String(activeEntries.length)} detail="grupo + materia"/>
      <Summary label="Grupos cubiertos" value={`${coveredGroups}/${activeGroups.length}`} detail="con al menos una materia"/>
      <Summary label="Carga objetivo" value={weeklyMinuteTotal?formatWeeklyMinutes(weeklyMinuteTotal):(weeklySessionTotal?String(weeklySessionTotal):'—')} detail={weeklyMinuteTotal?'minutos semanales acumulados':'sesiones configuradas'}/>
    </section>

    <article className={'aside-card validation section-prevalidation-card '+(validation.length?'error':activeEntries.length?'ready':'incomplete')}>
      <span className="panel-kicker">ESTADO:</span>
      <strong>{validation.length?'Sección Plan de estudios con errores':activeEntries.length?'Sección Plan de estudios válida':'Sección Plan de estudios incompleta'}</strong>
      <p>{validation.length
        ? `${validation[0]} Revisa las materias o cargas semanales implicadas y corrige la referencia o valor indicado.`
        : activeEntries.length
          ? `${activeSubjects.length} materias activas · ${activeEntries.length} cargas configuradas · ${coveredGroups}/${activeGroups.length} grupos cubiertos. No hay referencias inválidas en el plan.`
          : 'Todavía no hay cargas semanales configuradas. Añade materias y vincúlalas a los grupos para completar el plan.'}</p>
      {validation.length>0&&<button type="button" className="section-status-action" onClick={()=>document.querySelector('.groups-table-card')?.scrollIntoView({behavior:'smooth',block:'start'})}>Revisar plan de estudios</button>}
      {!validation.length&&!activeEntries.length&&<button type="button" className="section-status-action" onClick={openEntryCreate}>Añadir primera carga</button>}
    </article>

    {subjectModalOpen&&<div className="modal-backdrop section-form-modal-backdrop">
      <form className="app-modal section-form-modal" onSubmit={submitSubject} role="dialog" aria-modal="true" aria-label={editingSubject?'Editar materia':'Añadir materia'}>
        <div className="app-modal-header"><div><BookOpen size={20}/><h2>{editingSubject?'Editar materia':'Añadir materia'}</h2></div></div>
        <div className="app-modal-body">
          <div className="form-card-heading"><div className="form-card-number">04A</div><div><span className="panel-kicker">Catálogo</span><h2>{editingSubject?'Editar materia':'Nueva materia'}</h2><p>Una materia pertenece a una etapa y puede reutilizarse en todos sus grupos.</p></div></div>
          <div className="form-grid two">
            <Field label="Nombre" required><input value={subjectDraft.name} onChange={e=>setSubjectDraft({...subjectDraft,name:e.target.value})} placeholder="Ej. Lengua Castellana"/></Field>
            <Field label="Código"><input value={subjectDraft.code} onChange={e=>setSubjectDraft({...subjectDraft,code:e.target.value})} placeholder="Ej. LEN"/></Field>
            <Field label="Etapa" required><select value={subjectDraft.stage} onChange={e=>setSubjectDraft({...subjectDraft,stage:e.target.value as EducationStage})}><option value="">Selecciona...</option>{project.center.stages.map(stage=><option key={stage} value={stage}>{stage}</option>)}</select></Field>
            <Field label="Tipo"><select value={subjectDraft.type} onChange={e=>setSubjectDraft({...subjectDraft,type:e.target.value as SubjectType})}>{subjectTypes.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
            <Field label="Duración habitual de sesión (min)"><input type="number" min="1" max="240" value={subjectDraft.defaultSessionMinutes} onChange={e=>setSubjectDraft({...subjectDraft,defaultSessionMinutes:e.target.value})} placeholder="Opcional"/></Field>
          </div>
          {subjectError&&<div className="inline-error">{subjectError}</div>}
          <div className={'form-guide '+(subjectReady?'complete':'partial')}><strong>{subjectReady?'Materia lista':'Siguiente paso'}</strong><span>{subjectGuide}</span></div>
        </div>
        <div className="app-modal-footer"><button type="button" className="btn ghost-inline" onClick={resetSubject}>Cancelar</button><button className="btn primary" type="submit" disabled={!subjectReady}>Aceptar</button></div>
      </form>
    </div>}

    {entryModalOpen&&<div className="modal-backdrop section-form-modal-backdrop">
      <form className="app-modal section-form-modal" onSubmit={submitEntry} role="dialog" aria-modal="true" aria-label={editingEntry?'Editar carga':'Añadir carga'}>
        <div className="app-modal-header"><div><BookOpen size={20}/><h2>{editingEntry?'Editar carga':'Añadir carga semanal'}</h2></div></div>
        <div className="app-modal-body">
          <div className="form-card-heading"><div className="form-card-number">04B</div><div><span className="panel-kicker">Carga semanal</span><h2>{editingEntry?'Editar carga':'Asignar materia a grupo'}</h2><p>El profesorado concreto se asignará en el siguiente paso.</p></div></div>
          <div className="form-grid two">
            <Field label="Grupo" required><select value={entryDraft.groupId} onChange={e=>setEntryDraft({...entryDraft,groupId:e.target.value,subjectId:''})}><option value="">Selecciona...</option>{activeGroups.map(group=>{const complete=groupPlanComplete(group.id);return <option key={group.id} value={group.id} disabled={complete}>{group.name}{complete?' · completo':''}</option>})}</select></Field>
            <Field label="Materia" required><select value={entryDraft.subjectId} disabled={!entryDraft.groupId} onChange={e=>setEntryDraft({...entryDraft,subjectId:e.target.value})}><option value="">Selecciona...</option>{groupSubjects(entryDraft.groupId).map(subject=>{const assigned=subjectAlreadyAssigned(entryDraft.groupId,subject.id);return <option key={subject.id} value={subject.id} disabled={assigned}>{subject.name}{assigned?' · ya asignada':''}</option>})}</select></Field>
            <Field label="Sesiones semanales"><input type="number" min="0" step="0.25" value={entryDraft.weeklySessions} onChange={e=>setEntryDraft({...entryDraft,weeklySessions:e.target.value})} placeholder="Opcional"/></Field>
            <Field label="Carga semanal (min)"><input type="number" min="1" step="5" value={entryDraft.weeklyMinutes} onChange={e=>setEntryDraft({...entryDraft,weeklyMinutes:e.target.value})} placeholder="Opcional / normativa"/></Field>
            <Field label="Organización"><select value={entryDraft.mode} onChange={e=>setEntryDraft({...entryDraft,mode:e.target.value as StudyPlanMode})}>{planModes.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
            <Field label="Requisito docente"><select value={entryDraft.teacherRequirement} onChange={e=>setEntryDraft({...entryDraft,teacherRequirement:e.target.value as TeacherRequirement})}>{teacherRequirements.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
            <Field label="Duración fija de sesión (min)"><input type="number" min="1" max="240" value={entryDraft.fixedSessionMinutes} onChange={e=>setEntryDraft({...entryDraft,fixedSessionMinutes:e.target.value})} placeholder="Opcional"/></Field>
          </div>
          <label className="checkbox-field plan-checkbox"><input type="checkbox" checked={entryDraft.mandatory} onChange={e=>setEntryDraft({...entryDraft,mandatory:e.target.checked})}/><span><strong>Materia obligatoria para este grupo</strong><small>Desmárcalo solo cuando sea optativa/alternativa.</small></span></label>
          <label className="form-field notes-field"><span>Observaciones</span><textarea value={entryDraft.notes} onChange={e=>setEntryDraft({...entryDraft,notes:e.target.value})} placeholder="Restricciones o detalles del plan..."/></label>
          {entryError&&<div className="inline-error">{entryError}</div>}
          <div className={'form-guide '+(entryReady?'complete':'partial')}><strong>{entryReady?'Carga lista':'Siguiente paso'}</strong><span>{entryGuide}</span></div>
        </div>
        <div className="app-modal-footer"><button type="button" className="btn ghost-inline" onClick={resetEntry}>Cancelar</button><button className="btn primary" type="submit" disabled={!entryReady}>Aceptar</button></div>
      </form>
    </div>}

    <section className={'groups-table-card study-collapsible-card '+(subjectsExpanded?'is-expanded':'is-collapsed')}>
      <div className="groups-table-heading study-collapsible-heading">
        <button type="button" className="availability-collapse-toggle" onClick={()=>setSubjectsExpanded(value=>!value)} aria-expanded={subjectsExpanded} aria-label={subjectsExpanded?'Plegar catálogo':'Desplegar catálogo'}><ChevronDown size={17}/></button>
        <div className="availability-heading-copy"><span className="panel-kicker">Catálogo</span><h2>Materias <span className="availability-count">{project.subjects.length}</span></h2></div>
        <button className="btn ghost-inline" onClick={openSubjectCreate}><Plus size={16}/> Añadir materia</button>
      </div>
      {subjectsExpanded&&<div className="study-collapsible-content">
        {project.subjects.length>0&&<div className="list-filter-tags" aria-label="Filtrar materias por etapa"><button type="button" className={subjectStageFilter==='all'?'active':''} onClick={()=>setSubjectStageFilter('all')}>Todas</button>{project.center.stages.map(stage=><button type="button" key={stage} className={subjectStageFilter===stage?'active':''} onClick={()=>setSubjectStageFilter(stage)}>{stage}</button>)}</div>}
        {project.subjects.length===0?<Empty text="Todavía no hay materias en el catálogo."/>:visibleSubjects.length===0?<Empty text="No hay materias para esta etapa."/>:<div className="groups-table-wrap"><table className="groups-table"><thead><tr><th>Materia</th><th>Código</th><th>Etapa</th><th>Tipo</th><th>Duración</th><th>Estado</th><th/></tr></thead><tbody>{visibleSubjects.map(subject=><tr key={subject.id} className={!subject.active?'is-inactive':''}><td><strong>{subject.name}</strong></td><td>{subject.code||'—'}</td><td>{subject.stage}</td><td>{subjectTypeLabel(subject.type)}</td><td>{subject.defaultSessionMinutes?`${subject.defaultSessionMinutes} min`:'—'}</td><td><button className={'status-toggle '+(subject.active?'active':'')} onClick={()=>toggleSubject(subject.id)}>{subject.active?'Activa':'Inactiva'}</button></td><td><div className="row-actions"><button onClick={()=>editSubject(subject)}><Pencil size={15}/></button><button className="danger" onClick={()=>removeSubject(subject.id)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
      </div>}
    </section>

    <section className={'groups-table-card study-collapsible-card '+(entriesExpanded?'is-expanded':'is-collapsed')}>
      <div className="groups-table-heading study-collapsible-heading">
        <button type="button" className="availability-collapse-toggle" onClick={()=>setEntriesExpanded(value=>!value)} aria-expanded={entriesExpanded} aria-label={entriesExpanded?'Plegar cargas':'Desplegar cargas'}><ChevronDown size={17}/></button>
        <div className="availability-heading-copy"><span className="panel-kicker">Cargas</span><h2>Plan semanal por grupo <span className="availability-count">{project.studyPlan.length}</span></h2></div>
        <button className="btn ghost-inline" onClick={openEntryCreate}><Plus size={16}/> Añadir carga</button>
      </div>
      {entriesExpanded&&<div className="study-collapsible-content">
        {project.studyPlan.length>0&&<div className="list-filter-tags" aria-label="Filtrar cargas por grupo"><button type="button" className={entryGroupFilter==='all'?'active':''} onClick={()=>setEntryGroupFilter('all')}>Todos</button>{activeGroups.map(group=><button type="button" key={group.id} className={entryGroupFilter===group.id?'active':''} onClick={()=>setEntryGroupFilter(group.id)}>{group.name}</button>)}</div>}
        {project.studyPlan.length===0?<Empty text="Todavía no hay cargas semanales configuradas."/>:visibleEntries.length===0?<Empty text="No hay cargas configuradas para este grupo."/>:<div className="groups-table-wrap"><table className="groups-table plan-table"><thead><tr><th>Grupo</th><th>Materia</th><th>Ses./sem.</th><th>Carga semanal</th><th>Organización</th><th>Docente</th><th>Duración</th><th>Estado</th><th/></tr></thead><tbody>{visibleEntries.map(entry=>{
          const group=project.groups.find(x=>x.id===entry.groupId)
          const subject=project.subjects.find(x=>x.id===entry.subjectId)
          return <tr key={entry.id} className={!entry.active?'is-inactive':''}><td><strong>{group?.name??'Grupo eliminado'}</strong></td><td>{subject?.name??'Materia eliminada'}</td><td>{entry.weeklySessions>0?entry.weeklySessions:'—'}</td><td>{entry.weeklyMinutes?formatWeeklyMinutes(entry.weeklyMinutes):'—'}</td><td>{planModeLabel(entry.mode)}</td><td>{teacherRequirementLabel(entry.teacherRequirement)}</td><td>{entry.fixedSessionMinutes?`${entry.fixedSessionMinutes} min`:'—'}</td><td><button className={'status-toggle '+(entry.active?'active':'')} onClick={()=>toggleEntry(entry.id)}>{entry.active?'Activa':'Inactiva'}</button></td><td><div className="row-actions"><button onClick={()=>editEntry(entry)}><Pencil size={15}/></button><button className="danger" onClick={()=>removeEntry(entry.id)}><Trash2 size={15}/></button></div></td></tr>
        })}</tbody></table></div>}
      </div>}
    </section>


    <CopyPlan
      groups={activeGroups}
      isGroupComplete={groupPlanCompleteForCopy}
      onCopy={duplicateGroupPlan}
    />

    <div className="section-template-full">
      <TemplatePanel
        title="Plantillas de plan de estudios"
        description="Bases editables para el curso 2026/2027. Las plantillas añaden solo materias/cargas que aún no existan y conservan cualquier configuración previa."
        actions={[
          {id:'extremadura-infantil',label:'Infantil · Extremadura 2026/27',description:project.center.stages.includes('Infantil')?'Aplicar a 3, 4 y 5 años':'El centro no tiene Infantil activa',disabled:!project.center.stages.includes('Infantil'),onApply:()=>applyTemplate('infantil')},
          {id:'extremadura-primaria',label:'Primaria · Extremadura 2026/27',description:project.center.stages.includes('Primaria')?'Aplicar a 1.º–6.º según ciclo':'El centro no tiene Primaria activa',disabled:!project.center.stages.includes('Primaria'),onApply:()=>applyTemplate('primaria')},
          {id:'copy-group-plan',label:'Usar grupo como plantilla',description:activeEntries.length?'Seleccionar origen y destino':'Configura primero al menos una carga semanal',disabled:activeEntries.length===0,onApply:()=>document.getElementById('copy-plan-template')?.scrollIntoView({behavior:'smooth',block:'center'})},
        ]}
      />
    </div>
    {templateMessage&&<div className="template-result"><CheckCircle2 size={16}/><span>{templateMessage}</span></div>}
  </div>
}

type CopyPlanOption={value:string;label:string;disabled?:boolean}

function CopyPlan({
  groups,
  isGroupComplete,
  onCopy,
}:{
  groups:ViyeuticaProject['groups']
  isGroupComplete:(groupId:string)=>boolean
  onCopy:(source:string,targets:string[])=>void
}) {
  const [source,setSource]=useState('')
  const [targets,setTargets]=useState<string[]>([])
  const targetOptions=groups
    .filter(group=>group.id!==source)
    .map(group=>({
      value:group.id,
      label:group.name+(isGroupComplete(group.id)?' · completo':''),
      disabled:isGroupComplete(group.id),
    }))

  useEffect(()=>{
    setTargets(current=>current.filter(id=>id!==source&&!isGroupComplete(id)))
  },[source])

  return <section className="copy-plan-card" id="copy-plan-template">
    <div><Copy size={22}/><span><strong>Plantilla desde otro grupo</strong><small>Selecciona un grupo origen y uno o varios destinos. Solo se copiarán las materias que todavía no existan en cada destino.</small></span></div>
    <select value={source} onChange={e=>setSource(e.target.value)}>
      <option value="">Grupo origen</option>
      {groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}
    </select>
    <PlanMultiCheck
      placeholder="Grupo destino"
      options={targetOptions}
      values={targets}
      onChange={setTargets}
      disabled={!source}
    />
    <button className="btn ghost-inline" disabled={!source||targets.length===0} onClick={()=>onCopy(source,targets)}>Aplicar plantilla</button>
  </section>
}

function PlanMultiCheck({
  placeholder,
  options,
  values,
  onChange,
  disabled=false,
}:{
  placeholder:string
  options:CopyPlanOption[]
  values:string[]
  onChange:(values:string[])=>void
  disabled?:boolean
}){
  const [open,setOpen]=useState(false)
  const rootRef=useRef<HTMLDivElement>(null)

  useEffect(()=>{
    const closeOutside=(event:PointerEvent)=>{
      if(open&&rootRef.current&&!rootRef.current.contains(event.target as Node))setOpen(false)
    }
    document.addEventListener('pointerdown',closeOutside)
    return ()=>document.removeEventListener('pointerdown',closeOutside)
  },[open])

  const toggle=(option:CopyPlanOption)=>{
    if(option.disabled)return
    onChange(values.includes(option.value)
      ? values.filter(value=>value!==option.value)
      : [...values,option.value])
  }

  const selectedLabels=values
    .map(value=>options.find(option=>option.value===value)?.label)
    .filter(Boolean) as string[]
  const summary=values.length===0
    ? placeholder
    : selectedLabels.length<=2
      ? selectedLabels.join(', ')
      : values.length+' seleccionados'

  return <div
    ref={rootRef}
    className={'multicheck-field copy-plan-multicheck'+(disabled?' disabled':'')}
    onBlur={event=>{
      const next=event.relatedTarget as Node|null
      if(!next||!event.currentTarget.contains(next))setOpen(false)
    }}
  >
    <div className={'multicheck-select'+(open?' open':'')}>
      <button
        type="button"
        className="multicheck-trigger"
        disabled={disabled}
        aria-expanded={open}
        onClick={()=>setOpen(current=>!current)}
      >
        <span className={values.length?'has-value':'placeholder'}>{summary}</span>
        <ChevronDown size={16}/>
      </button>
      {open&&!disabled&&<div className="multicheck-menu">
        <div className="multicheck-options">
          {options.map(option=><label key={option.value} className={'multicheck-option'+(option.disabled?' disabled':'')}>
            <input
              type="checkbox"
              checked={values.includes(option.value)}
              disabled={option.disabled}
              onChange={()=>toggle(option)}
            />
            <span>{option.label}</span>
          </label>)}
          {!options.length&&<div className="multicheck-empty">Sin grupos destino disponibles</div>}
        </div>
        {values.length>0&&<button type="button" className="multicheck-clear" onClick={()=>onChange([])}>Limpiar selección</button>}
      </div>}
    </div>
  </div>
}
function Summary({label,value,detail}:{label:string;value:string;detail:string}){return <article className="structure-summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>}
function Field({label,required,children}:{label:string;required?:boolean;children:React.ReactNode}){return <label className="form-field"><span>{label}{required&&<em>*</em>}</span>{children}</label>}
function Empty({text}:{text:string}){return <div className="groups-empty"><BookOpen size={26}/><strong>{text}</strong></div>}
function subjectTypeLabel(v:SubjectType){return subjectTypes.find(x=>x.value===v)?.label??v}
function planModeLabel(v:StudyPlanMode){return planModes.find(x=>x.value===v)?.label??v}
function teacherRequirementLabel(v:TeacherRequirement){return teacherRequirements.find(x=>x.value===v)?.label??v}

function formatWeeklyMinutes(minutes:number){
  const hours=Math.floor(minutes/60)
  const rest=minutes%60
  return hours ? (rest ? `${hours} h ${rest} min` : `${hours} h`) : `${rest} min`
}
