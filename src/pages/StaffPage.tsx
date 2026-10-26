import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronDown, Clock3, GraduationCap, LayoutGrid, List, Pencil, Plus,
  Trash2, UserRoundCog, Users,
} from 'lucide-react'
import type { GenerationRun, Teacher, TeacherDedication, TeacherDedicationType, ViyeuticaProject, Weekday } from '../domain/project'
import { isGenerationProposalValid, isStudyPlanComplete, uniqueGenerationRuns, validateStaff } from '../domain/project'
import { saveProject } from '../store/projectStorage'
import { WizardStepper } from '../components/WizardStepper'
import { TemplatePanel } from '../components/TemplatePanel'

type EmploymentType=Teacher['employmentType']
type TeacherStatus=Teacher['status']

interface Draft {
  name:string
  status:TeacherStatus
  employmentType:EmploymentType
  specialties:string
  roles:string
  weeklyTeachingMinutes:string
  tutorGroupIds:string[]
  dedications:TeacherDedication[]
}

interface DedicationDraft {
  type:TeacherDedicationType
  label:string
  weeklyPeriods:string
  weeklyMinutes:string
  notes:string
  source:'manual'|'normative'
  status:'planned'|'applicable'
  affectsTeachingLoad:boolean
  reference:string
}

const emptyDedication:DedicationDraft={
  type:'management',
  label:'',
  weeklyPeriods:'',
  weeklyMinutes:'',
  notes:'',
  source:'manual',
  status:'planned',
  affectsTeachingLoad:false,
  reference:'',
}

const emptyDraft:Draft={
  name:'',
  status:'confirmed',
  employmentType:'full',
  specialties:'',
  roles:'',
  weeklyTeachingMinutes:'',
  tutorGroupIds:[],
  dedications:[],
}

const employmentLabels:Record<EmploymentType,string>={
  full:'Jornada completa',
  partial:'Jornada parcial',
  itinerant:'Itinerante',
  other:'Otra',
}

const dedicationLabels:Record<TeacherDedicationType,string>={
  management:'Cargo directivo',
  coordination:'Coordinación',
  reduction:'Reducción',
  support:'Apoyo / programa',
  other:'Otra dedicación',
}

const uid=()=> 'teacher_'+crypto.randomUUID()

function parseList(value:string){
  return value.split(',').map(item=>item.trim()).filter(Boolean)
}

export function StaffPage({
  project,
  navigate,
}:{
  project:ViyeuticaProject
  navigate:(path:string)=>void
}) {
  const [draft,setDraft]=useState<Draft>(emptyDraft)
  const [editingId,setEditingId]=useState<string|null>(null)
  const [error,setError]=useState('')
  const [templateMessage,setTemplateMessage]=useState('')
  const [dedicationDraft,setDedicationDraft]=useState<DedicationDraft>(emptyDedication)
  const [modalOpen,setModalOpen]=useState(false)
  const [staffView,setStaffView]=useState<'list'|'cards'>('list')
  const [scheduleTeacherId,setScheduleTeacherId]=useState<string|null>(null)

  const teachers=project.teachers
  const validRuns=uniqueGenerationRuns(project.generationRuns).filter(run=>isGenerationProposalValid(project,run))
  const scheduleRun=project.establishedScheduleRun
    ?? project.draftScheduleRun
    ?? validRuns.find(run=>run.id===project.selectedGenerationRunId)
    ?? validRuns[validRuns.length-1]
    ?? null
  const activeTeachers=teachers.filter(teacher=>teacher.active)
  const confirmed=activeTeachers.filter(teacher=>teacher.status==='confirmed').length
  const pending=activeTeachers.filter(teacher=>teacher.status==='to_determine').length
  const itinerant=activeTeachers.filter(teacher=>teacher.employmentType==='itinerant').length
  const validation=useMemo(()=>validateStaff(project),[project])
  const hasName=Boolean(draft.name.trim())
  const hasSpecialties=parseList(draft.specialties).length>0
  const teacherReady=Boolean(hasName&&hasSpecialties)
  const dedicationPeriods=dedicationDraft.weeklyPeriods===''?0:Number(dedicationDraft.weeklyPeriods)
  const dedicationMinutes=dedicationDraft.weeklyMinutes===''?0:Number(dedicationDraft.weeklyMinutes)
  const dedicationReady=Boolean(
    hasSpecialties &&
    dedicationDraft.label.trim() &&
    ((Number.isFinite(dedicationPeriods)&&dedicationPeriods>0)||(Number.isFinite(dedicationMinutes)&&dedicationMinutes>0))
  )
  const teacherGuide=!hasName?'Indica el nombre del docente o un identificador provisional.'
    :!hasSpecialties?'Indica al menos una especialidad. Después podrás completar tutorías, carga objetivo, cargos y dedicaciones.'
    :'Datos mínimos completos. Puedes guardar el docente o completar, si corresponde, tutorías, carga objetivo, cargos y dedicaciones.'

  useEffect(()=>{
    const raw=window.location.hash.split('?')[1]
    if(!raw)return
    const params=new URLSearchParams(raw)
    const teacherId=params.get('teacherId')
    if(!teacherId)return
    const teacher=project.teachers.find(item=>item.id===teacherId)
    if(!teacher)return
    setEditingId(teacher.id)
    setDraft({
      name:teacher.name,
      status:teacher.status,
      employmentType:teacher.employmentType,
      specialties:teacher.specialties.join(', '),
      roles:teacher.roles.join(', '),
      weeklyTeachingMinutes:teacher.weeklyTeachingMinutes===null?'':String(teacher.weeklyTeachingMinutes),
      tutorGroupIds:project.groups.filter(group=>group.tutorTeacherId===teacher.id).map(group=>group.id),
      dedications:teacher.dedications??[],
    })
    setError('')
    setModalOpen(true)
  },[])

  const persist=(nextTeachers:Teacher[],nextGroups=project.groups)=>saveProject({...project,teachers:nextTeachers,groups:nextGroups})

  const reset=()=>{
    setDraft(emptyDraft)
    setDedicationDraft(emptyDedication)
    setEditingId(null)
    setError('')
    setModalOpen(false)
  }

  const openCreate=()=>{
    setDraft(emptyDraft)
    setDedicationDraft(emptyDedication)
    setEditingId(null)
    setError('')
    setModalOpen(true)
  }

  const addDedication=()=>{
    if(!dedicationReady)return
    const dedication:TeacherDedication={
      id:'ded_'+crypto.randomUUID(),
      type:dedicationDraft.type,
      label:dedicationDraft.label.trim(),
      weeklyPeriods:dedicationDraft.weeklyPeriods===''?null:Number(dedicationDraft.weeklyPeriods),
      weeklyMinutes:dedicationDraft.weeklyMinutes===''?null:Number(dedicationDraft.weeklyMinutes),
      notes:dedicationDraft.notes.trim(),
      source:dedicationDraft.source,
      status:dedicationDraft.status,
      affectsTeachingLoad:dedicationDraft.affectsTeachingLoad,
      reference:dedicationDraft.reference.trim(),
    }
    setDraft(current=>({...current,dedications:[...current.dedications,dedication]}))
    setDedicationDraft(emptyDedication)
  }

  const removeDedication=(id:string)=>{
    setDraft(current=>({...current,dedications:current.dedications.filter(item=>item.id!==id)}))
  }

  const submit=(event:FormEvent)=>{
    event.preventDefault()
    if(!draft.name.trim()){
      setError('Indica el nombre del docente o un identificador provisional.')
      return
    }
    const specialties=parseList(draft.specialties)
    if(!specialties.length){
      setError('Indica al menos una especialidad.')
      return
    }
    const teacherId=editingId??uid()
    const teacher:Teacher={
      id:teacherId,
      name:draft.name.trim(),
      status:draft.status,
      employmentType:draft.employmentType,
      specialties,
      roles:parseList(draft.roles),
      weeklyTeachingMinutes:draft.weeklyTeachingMinutes===''?null:Math.max(0,Number(draft.weeklyTeachingMinutes)),
      dedications:draft.dedications,
      active:true,
    }
    const nextTeachers=editingId
      ? teachers.map(item=>item.id===editingId?teacher:item)
      : [...teachers,teacher]
    const selectedTutorGroups=new Set(draft.tutorGroupIds)
    const nextGroups=project.groups.map(group=>{
      if(selectedTutorGroups.has(group.id))return {...group,tutorTeacherId:teacherId}
      if(group.tutorTeacherId===teacherId)return {...group,tutorTeacherId:null}
      return group
    })
    persist(nextTeachers,nextGroups)
    reset()
  }

  const edit=(teacher:Teacher)=>{
    setEditingId(teacher.id)
    setDraft({
      name:teacher.name,
      status:teacher.status,
      employmentType:teacher.employmentType,
      specialties:teacher.specialties.join(', '),
      roles:teacher.roles.join(', '),
      weeklyTeachingMinutes:teacher.weeklyTeachingMinutes===null?'':String(teacher.weeklyTeachingMinutes),
      tutorGroupIds:project.groups.filter(group=>group.tutorTeacherId===teacher.id).map(group=>group.id),
      dedications:teacher.dedications??[],
    })
    setError('')
    setModalOpen(true)
  }

  const remove=(id:string)=>{
    const usedByGroup=project.groups.some(group=>group.tutorTeacherId===id)
    const usedByAssignment=project.assignments.some(assignment=>assignment.teacherId===id&&assignment.active)
    if(usedByGroup||usedByAssignment){
      setError('Este docente está vinculado a una tutoría o asignación. Desactívalo en lugar de eliminarlo, o elimina primero esas relaciones.')
      return
    }
    persist(teachers.filter(teacher=>teacher.id!==id))
  }

  const toggleActive=(id:string)=>persist(
    teachers.map(teacher=>teacher.id===id?{...teacher,active:!teacher.active}:teacher),
  )

  const applyImportedTemplate=()=>{
    const imported=project.teachers.filter(teacher=>teacher.active)
    if(!imported.length){
      setTemplateMessage('No hay una plantilla docente importada en el proyecto.')
      return
    }
    setTemplateMessage(`La plantilla importada ya contiene ${imported.length} ${imported.length===1?'docente':'docentes'}. Revísalos y actualiza altas, bajas, jornadas, cargos y especialidades para ${project.academicYear.label}.`)
  }

  if(!isStudyPlanComplete(project)){
    return <div className="wizard-page staff-page">
      <section className="wizard-intro">
        <div>
          <h1 className="wizard-page-title"><Users size={28}/> Profesorado</h1>
          <p>Define la plantilla docente que podrá participar en el horario: especialidades, tipo de jornada, cargos/reducciones e itinerancias.</p>
        </div>
        <div className="wizard-progress-summary"><strong>5 <span>de 9</span></strong><small>Profesorado</small></div>
      </section>
      <WizardStepper currentStep={5} project={project} navigate={navigate}/>
      <section className="empty-state-card">
        <Users size={34}/>
        <h1>Completa primero el Plan de estudios</h1>
        <p>El profesorado se configurará sobre las etapas, grupos y materias ya definidas.</p>
        <button className="btn primary" onClick={()=>navigate('/materias')}>Ir a Plan de estudios</button>
      </section>
    </div>
  }

  return <div className="wizard-page staff-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><Users size={28}/> Profesorado</h1>
        <p>Define la plantilla docente que podrá participar en el horario: especialidades, tipo de jornada, cargos/reducciones e itinerancias.</p>
      </div>
      <div className="wizard-progress-summary"><strong>5 <span>de 9</span></strong><small>Profesorado</small></div>
    </section>

    <WizardStepper currentStep={5} project={project} navigate={navigate}/>

    <section className="structure-summary">
      <Summary label="Docentes activos" value={String(activeTeachers.length)} detail="plantilla del curso"/>
      <Summary label="Confirmados" value={String(confirmed)} detail="nombre conocido"/>
      <Summary label="Por determinar" value={String(pending)} detail="vacantes / pendientes"/>
      <Summary label="Itinerantes" value={String(itinerant)} detail="desplazamientos entre centros"/>
    </section>

    <section className="staff-main-tools">
      <article className={'aside-card validation section-prevalidation-card '+(validation.length?'error':activeTeachers.length?'ready':'incomplete')}>
        <span className="panel-kicker">ESTADO:</span>
        <strong>{validation.length?'Sección Profesorado con errores':activeTeachers.length?'Sección Profesorado válida':'Sección Profesorado incompleta'}</strong>
        <p>{validation.length
          ? `${validation[0]} Edita el docente afectado y completa o corrige sus datos antes de continuar.`
          : activeTeachers.length
            ? `${activeTeachers.length} docentes activos · ${confirmed} confirmados · ${pending} por determinar · ${itinerant} itinerantes. Todos los docentes activos tienen al menos una especialidad válida.`
            : 'Todavía no hay profesorado activo. Añade al menos un docente con nombre y especialidad para poder continuar.'}</p>
        {validation.length>0&&<button type="button" className="section-status-action" onClick={()=>document.querySelector('.groups-table-card')?.scrollIntoView({behavior:'smooth',block:'start'})}>Revisar profesorado</button>}
        {!validation.length&&!activeTeachers.length&&<button type="button" className="section-status-action" onClick={openCreate}>Añadir docente</button>}
      </article>

    </section>

    {modalOpen&&<div className="modal-backdrop staff-modal-backdrop" role="presentation">
      <form className="app-modal staff-teacher-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={editingId?'Editar docente':'Añadir docente'}>
        <div className="app-modal-header">
          <div><Users size={20}/><div><span className="panel-kicker">{editingId?'Edición':'Plantilla docente'}</span><h2>{editingId?'Editar docente':'Añadir docente'}</h2></div></div>
        </div>
        <div className="staff-modal-body">
        <div className="form-card-heading staff-modal-intro">
          <div className="form-card-number">05</div>
          <div>
            <span className="panel-kicker">{editingId?'Edición':'Plantilla docente'}</span>
            <h2>{editingId?'Editar docente':'Añadir docente'}</h2>
            <p>Las asignaciones concretas a grupos y materias se realizarán en el Paso 6.</p>
          </div>
        </div>

        <div className="form-grid two">
          <Field label="Nombre / identificador" required>
            <input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="Ej. María López / Inglés PDTE"/>
          </Field>
          <Field label="Estado">
            <select disabled={!hasName} value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as TeacherStatus})}>
              <option value="confirmed">Confirmado</option>
              <option value="to_determine">Por determinar</option>
            </select>
          </Field>
          <Field label="Tipo de jornada">
            <select disabled={!hasName} value={draft.employmentType} onChange={e=>setDraft({...draft,employmentType:e.target.value as EmploymentType})}>
              {(Object.entries(employmentLabels) as [EmploymentType,string][]).map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Especialidades" required>
            <input disabled={!hasName} value={draft.specialties} onChange={e=>setDraft({...draft,specialties:e.target.value})} placeholder={hasName?"Primaria, Inglés, PT...":"Indica primero el nombre"}/>
          </Field>
          <Field label="Carga lectiva objetivo / máxima (min)">
            <input disabled={!hasSpecialties} type="number" min="0" step="5" value={draft.weeklyTeachingMinutes} onChange={e=>setDraft({...draft,weeklyTeachingMinutes:e.target.value})} placeholder={hasSpecialties?"Opcional":"Indica primero una especialidad"}/>
          </Field>
          <Field label="Cargos / funciones">
            <input disabled={!hasSpecialties} value={draft.roles} onChange={e=>setDraft({...draft,roles:e.target.value})} placeholder={hasSpecialties?"Dirección, Secretaría, Coordinación...":"Indica primero una especialidad"}/>
          </Field>
        </div>

        <div className={'staff-dependent-section'+(!hasSpecialties?' disabled':'')}>
          <div className="staff-subsection-heading">
            <div><span className="panel-kicker">Tutoría</span><h3>Grupos tutorados</h3><p>La tutoría se vincula directamente al grupo y podrá utilizarse después en Asignaciones y Reglas.</p></div>
          </div>
          <StaffMultiCheck
            placeholder={hasSpecialties?'Selecciona uno o varios grupos':'Indica primero una especialidad'}
            values={draft.tutorGroupIds}
            disabled={!hasSpecialties}
            options={project.groups.filter(group=>group.active).map(group=>{
              const assignedTeacher=teachers.find(teacher=>teacher.id===group.tutorTeacherId)
              const assignedToOther=Boolean(group.tutorTeacherId&&group.tutorTeacherId!==editingId)
              return {
                value:group.id,
                label:group.name+(assignedToOther&&assignedTeacher?` · ${assignedTeacher.name}`:''),
                disabled:assignedToOther,
              }
            })}
            onChange={values=>setDraft({...draft,tutorGroupIds:values})}
          />
        </div>

        <div className={'staff-dependent-section'+(!hasSpecialties?' disabled':'')}>
          <div className="staff-subsection-heading">
            <div><span className="panel-kicker">Dedicaciones</span><h3>Cargos, coordinaciones y reducciones</h3><p>Registra cada dedicación con su carga semanal e indica si descuenta docencia. Para reducciones normativas expresadas en horas, usa minutos para que el motor pueda aplicarlas exactamente.</p></div>
          </div>
          <div className="form-grid three staff-dedication-grid">
            <Field label="Tipo">
              <select disabled={!hasSpecialties} value={dedicationDraft.type} onChange={e=>setDedicationDraft({...dedicationDraft,type:e.target.value as TeacherDedicationType})}>
                {(Object.entries(dedicationLabels) as [TeacherDedicationType,string][]).map(([value,label])=><option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Nombre">
              <input disabled={!hasSpecialties} value={dedicationDraft.label} onChange={e=>setDedicationDraft({...dedicationDraft,label:e.target.value})} placeholder="Ej. Dirección"/>
            </Field>
            <Field label="Periodos semanales">
              <input disabled={!hasSpecialties} type="number" min="0" step="1" value={dedicationDraft.weeklyPeriods} onChange={e=>setDedicationDraft({...dedicationDraft,weeklyPeriods:e.target.value})} placeholder="Ej. 14"/>
            </Field>
            <Field label="Minutos semanales">
              <input disabled={!hasSpecialties} type="number" min="0" step="5" value={dedicationDraft.weeklyMinutes} onChange={e=>setDedicationDraft({...dedicationDraft,weeklyMinutes:e.target.value})} placeholder="Alternativa a periodos"/>
            </Field>
            <Field label="Observación">
              <input disabled={!hasSpecialties} value={dedicationDraft.notes} onChange={e=>setDedicationDraft({...dedicationDraft,notes:e.target.value})} placeholder="Opcional"/>
            </Field>
            <Field label="Origen">
              <select disabled={!hasSpecialties} value={dedicationDraft.source} onChange={e=>setDedicationDraft({...dedicationDraft,source:e.target.value as 'manual'|'normative'})}>
                <option value="manual">Manual / centro</option>
                <option value="normative">Normativa</option>
              </select>
            </Field>
            <Field label="Estado">
              <select disabled={!hasSpecialties} value={dedicationDraft.status} onChange={e=>setDedicationDraft({...dedicationDraft,status:e.target.value as 'planned'|'applicable'})}>
                <option value="planned">Registrada / pendiente</option>
                <option value="applicable">Aplicable al horario</option>
              </select>
            </Field>
            <Field label="Referencia normativa">
              <input disabled={!hasSpecialties||dedicationDraft.source!=='normative'} value={dedicationDraft.reference} onChange={e=>setDedicationDraft({...dedicationDraft,reference:e.target.value})} placeholder="Ej. Orden 29/08/2024 · art. 32"/>
            </Field>
            <label className="staff-dedication-toggle">
              <input disabled={!hasSpecialties} type="checkbox" checked={dedicationDraft.affectsTeachingLoad} onChange={e=>setDedicationDraft({...dedicationDraft,affectsTeachingLoad:e.target.checked})}/>
              <span><strong>Descuenta docencia</strong><small>Reduce la carga lectiva efectiva cuando la dedicación esté marcada como Aplicable.</small></span>
            </label>
            <div className="staff-dedication-action">
              <button type="button" className="btn ghost-inline" disabled={!dedicationReady} onClick={addDedication}><Plus size={15}/> Añadir dedicación</button>
            </div>
          </div>
          {draft.dedications.length>0&&<div className="staff-dedication-list">
            {draft.dedications.map(item=><article key={item.id}>
              <div><strong>{item.label}</strong><span>{dedicationLabels[item.type]} · {item.weeklyPeriods?`${item.weeklyPeriods} periodos`:item.weeklyMinutes?formatMinutes(item.weeklyMinutes):'Sin carga'} · {item.source==='normative'?'Normativa':'Manual'} · {item.status==='applicable'?'Aplicable':'Pendiente'}{item.affectsTeachingLoad?' · Descuenta docencia':''}{item.reference?` · ${item.reference}`:''}{item.notes?` · ${item.notes}`:''}</span></div>
              <button type="button" className="row-delete" onClick={()=>removeDedication(item.id)}><Trash2 size={14}/></button>
            </article>)}
          </div>}
        </div>

        {error&&<div className="inline-error">{error}</div>}
        <div className={'form-guide '+(teacherReady?'complete':'partial')}><strong>{teacherReady?'Docente listo':'Siguiente paso'}</strong><span>{teacherGuide}</span></div>

        </div>
        <div className="app-modal-footer">
          <button type="button" className="btn ghost-inline" onClick={reset}>Cancelar</button>
          <button className="btn primary" type="submit" disabled={!teacherReady}>Aceptar</button>
        </div>
      </form>
    </div>}

    {templateMessage&&<div className="template-result"><CheckCircle2 size={16}/><span>{templateMessage}</span></div>}

    <section className="groups-table-card">
      <div className="groups-table-heading">
        <div><span className="panel-kicker">Plantilla del curso</span><h2>Profesorado</h2></div>
        <div className="staff-heading-actions">
          <div className="staff-view-toggle" role="group" aria-label="Cambiar vista del profesorado">
            <button
              type="button"
              className={staffView==='list'?'active':''}
              title="Vista de lista"
              aria-label="Vista de lista"
              aria-pressed={staffView==='list'}
              onClick={()=>setStaffView('list')}
            ><List size={16}/></button>
            <button
              type="button"
              className={staffView==='cards'?'active':''}
              title="Vista de tarjetas"
              aria-label="Vista de tarjetas"
              aria-pressed={staffView==='cards'}
              onClick={()=>setStaffView('cards')}
            ><LayoutGrid size={16}/></button>
          </div>
          <button className="btn ghost-inline" onClick={openCreate}><Plus size={16}/> Añadir docente</button>
        </div>
      </div>
      {teachers.length===0
        ? <div className="groups-empty"><UserRoundCog size={28}/><strong>No hay docentes todavía</strong><p>Añádelos manualmente o importa el JSON del curso anterior.</p></div>
        : staffView==='list'
          ? <div className="groups-table-wrap">
              <table className="groups-table staff-table">
                <thead><tr><th>Docente</th><th>Estado</th><th>Jornada</th><th>Especialidades</th><th>Tutoría</th><th>Dedicaciones</th><th>Carga objetivo</th><th>Estado</th><th/></tr></thead>
                <tbody>{teachers.map(teacher=>{
                  const tutorGroups=project.groups.filter(group=>group.tutorTeacherId===teacher.id)
                  const dedications=teacher.dedications??[]
                  return <tr key={teacher.id} className={!teacher.active?'is-inactive':''}>
                    <td><strong>{teacher.name}</strong>{teacher.roles.length>0&&<small className="staff-row-detail">{teacher.roles.join(', ')}</small>}</td>
                    <td>{teacher.status==='confirmed'?<span className="tag">Confirmado</span>:<span className="tag amber">Por determinar</span>}</td>
                    <td>{employmentLabels[teacher.employmentType]}</td>
                    <td>{teacher.specialties.length?teacher.specialties.join(', '):'—'}</td>
                    <td>{tutorGroups.length?tutorGroups.map(group=>group.name).join(', '):'—'}</td>
                    <td>{dedications.length?dedications.map(item=>item.label).join(', '):'—'}</td>
                    <td>{teacher.weeklyTeachingMinutes===null?'—':formatMinutes(teacher.weeklyTeachingMinutes)}</td>
                    <td><button className={'status-toggle '+(teacher.active?'active':'')} onClick={()=>toggleActive(teacher.id)}>{teacher.active?'Activo':'Inactivo'}</button></td>
                    <td><div className="row-actions"><button title={scheduleRun?'Ver horario':'Horario no disponible'} aria-label={scheduleRun?'Ver horario de '+teacher.name:'Horario no disponible'} disabled={!scheduleRun} onClick={()=>scheduleRun&&setScheduleTeacherId(teacher.id)}><CalendarDays size={15}/></button><button title="Editar" onClick={()=>edit(teacher)}><Pencil size={15}/></button><button title="Eliminar" className="danger" onClick={()=>remove(teacher.id)}><Trash2 size={15}/></button></div></td>
                  </tr>
                })}</tbody>
              </table>
            </div>
          : <div className="staff-card-grid">
              {teachers.map(teacher=>{
                const tutorGroups=project.groups.filter(group=>group.tutorTeacherId===teacher.id)
                const dedications=teacher.dedications??[]
                return <article className={'staff-card '+(!teacher.active?'is-inactive':'')} key={teacher.id}>
                  <div className="staff-card-heading">
                    <div>
                      <strong>{teacher.name}</strong>
                      {teacher.roles.length>0&&<small>{teacher.roles.join(', ')}</small>}
                    </div>
                    {teacher.status==='confirmed'?<span className="tag">Confirmado</span>:<span className="tag amber">Por determinar</span>}
                  </div>
                  <div className="staff-card-data">
                    <div><span>Jornada</span><strong>{employmentLabels[teacher.employmentType]}</strong></div>
                    <div><span>Especialidades</span><strong>{teacher.specialties.length?teacher.specialties.join(', '):'—'}</strong></div>
                    <div><span>Tutoría</span><strong>{tutorGroups.length?tutorGroups.map(group=>group.name).join(', '):'—'}</strong></div>
                    <div><span>Dedicaciones</span><strong>{dedications.length?dedications.map(item=>item.label).join(', '):'—'}</strong></div>
                    <div><span>Carga objetivo</span><strong>{teacher.weeklyTeachingMinutes===null?'—':formatMinutes(teacher.weeklyTeachingMinutes)}</strong></div>
                  </div>
                  <div className="staff-card-footer">
                    <button className={'status-toggle '+(teacher.active?'active':'')} onClick={()=>toggleActive(teacher.id)}>{teacher.active?'Activo':'Inactivo'}</button>
                    <div className="row-actions">
                      <button title={scheduleRun?'Ver horario':'Horario no disponible'} aria-label={scheduleRun?'Ver horario de '+teacher.name:'Horario no disponible'} disabled={!scheduleRun} onClick={()=>scheduleRun&&setScheduleTeacherId(teacher.id)}><CalendarDays size={15}/></button>
                      <button title="Editar" onClick={()=>edit(teacher)}><Pencil size={15}/></button>
                      <button title="Eliminar" className="danger" onClick={()=>remove(teacher.id)}><Trash2 size={15}/></button>
                    </div>
                  </div>
                </article>
              })}
            </div>}
    </section>

    {scheduleTeacherId&&scheduleRun&&<TeacherScheduleModal
      project={project}
      run={scheduleRun}
      teacherId={scheduleTeacherId}
      onClose={()=>setScheduleTeacherId(null)}
    />}

    <div className="staff-template-full">
        <TemplatePanel
          title="Plantilla del curso anterior"
          description="Si has importado un JSON, conserva la plantilla docente para revisar únicamente cambios de este curso."
          actions={[
            {
              id:'imported-staff',
              label:'Revisar plantilla importada',
              description:project.teachers.length?`${project.teachers.length} ${project.teachers.length===1?'docente disponible':'docentes disponibles'}`:'No hay profesorado importado',
              disabled:project.teachers.length===0,
              onApply:applyImportedTemplate,
            },
          ]}
        />
      </div>

    <section className="staff-info-grid">
      <article className="panel compact-info-panel"><BriefcaseBusiness size={22}/><div><strong>Dedicaciones estructuradas</strong><p>Dirección, coordinaciones, reducciones y otros programas guardan ahora su carga semanal en periodos o minutos.</p></div></article>
      <article className="panel compact-info-panel"><Clock3 size={22}/><div><strong>Carga lectiva</strong><p>El valor manual es el objetivo o máximo. La carga realmente asignada se calculará después a partir de Asignaciones y del horario generado.</p></div></article>
      <article className="panel compact-info-panel"><GraduationCap size={22}/><div><strong>Tutorías vinculadas</strong><p>La tutoría se guarda directamente en cada grupo. Un grupo ya tutorado por otro docente queda bloqueado en el selector.</p></div></article>
    </section>
  </div>
}

const staffDayLabels:Record<Weekday,string>={
  L:'Lunes',M:'Martes',X:'Miércoles',J:'Jueves',V:'Viernes',S:'Sábado',
}

function TeacherScheduleModal({
  project,run,teacherId,onClose,
}:{
  project:ViyeuticaProject
  run:GenerationRun
  teacherId:string
  onClose:()=>void
}){
  const teacher=project.teachers.find(item=>item.id===teacherId)
  const blocks=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
  const entries=run.entries.filter(entry=>entry.teacherId===teacherId)

  return <div className="modal-backdrop staff-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section className="app-modal wide staff-schedule-modal" role="dialog" aria-modal="true" aria-label={'Horario de '+(teacher?.name??'docente')}>
      <div className="app-modal-header">
        <div><CalendarDays size={20}/><div><span className="panel-kicker">Horario docente</span><h2>{teacher?.name??'Docente'}</h2></div></div>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
      </div>
      <div className="app-modal-body">
        <div className="staff-schedule-summary">
          <strong>{entries.length} {entries.length===1?'sesión':'sesiones'}</strong>
          <span>Propuesta activa · Materia y grupo por franja</span>
        </div>
        <div className="generated-schedule-wrap staff-schedule-wrap">
          <table className="generated-schedule staff-schedule-table">
            <thead><tr><th>Sesión</th>{project.schedule.activeDays.map(day=><th key={day}>{staffDayLabels[day]}</th>)}</tr></thead>
            <tbody>{blocks.map(block=><tr key={block.id}>
              <th><strong>{block.label}</strong><small>{block.start}–{block.end}</small></th>
              {project.schedule.activeDays.map(day=>{
                const cell=entries.filter(entry=>entry.day===day&&entry.sessionId===block.id)
                if(!cell.length)return <td key={day} className="empty-slot"><span>Libre</span></td>
                return <td key={day}>
                  {cell.map(entry=>{
                    const subject=project.subjects.find(item=>item.id===entry.subjectId)
                    const group=project.groups.find(item=>item.id===entry.groupId)
                    return <div className="staff-schedule-entry" key={entry.id}>
                      <strong>{subject?.name??'Materia'}</strong>
                      <small>{group?.name??'Grupo'}</small>
                    </div>
                  })}
                </td>
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="app-modal-footer">
        <button type="button" className="btn secondary-light" onClick={onClose}>Cerrar</button>
      </div>
    </section>
  </div>
}

type StaffMultiCheckOption={value:string;label:string;disabled?:boolean}

function StaffMultiCheck({
  placeholder,
  options,
  values,
  onChange,
  disabled=false,
}:{
  placeholder:string
  options:StaffMultiCheckOption[]
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

  const toggle=(option:StaffMultiCheckOption)=>{
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
    className={'multicheck-field staff-tutor-multicheck'+(disabled?' disabled':'')}
    onBlur={event=>{
      const next=event.relatedTarget as Node|null
      if(!next||!event.currentTarget.contains(next))setOpen(false)
    }}
  >
    <div className={'multicheck-select'+(open?' open':'')}>
      <button type="button" className="multicheck-trigger" disabled={disabled} aria-expanded={open} onClick={()=>setOpen(current=>!current)}>
        <span className={values.length?'has-value':'placeholder'}>{summary}</span>
        <ChevronDown size={16}/>
      </button>
      {open&&!disabled&&<div className="multicheck-menu">
        <div className="multicheck-options">
          {options.map(option=><label key={option.value} className={'multicheck-option'+(option.disabled?' disabled':'')}>
            <input type="checkbox" checked={values.includes(option.value)} disabled={option.disabled} onChange={()=>toggle(option)}/>
            <span>{option.label}</span>
          </label>)}
          {!options.length&&<div className="multicheck-empty">No hay grupos activos disponibles</div>}
        </div>
        {values.length>0&&<button type="button" className="multicheck-clear" onClick={()=>onChange([])}>Limpiar selección</button>}
      </div>}
    </div>
  </div>
}

function Summary({label,value,detail}:{label:string;value:string;detail:string}){return <article className="structure-summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>}
function Field({label,required,children}:{label:string;required?:boolean;children:React.ReactNode}){return <label className="form-field"><span>{label}{required&&<em>*</em>}</span>{children}</label>}
function formatMinutes(minutes:number){const h=Math.floor(minutes/60),m=minutes%60;return h?(m?`${h} h ${m} min`:`${h} h`):`${m} min`}
