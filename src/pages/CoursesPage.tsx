import { useEffect, useMemo, useState } from 'react'
import {
  Archive, CalendarDays, CheckCircle2, Copy, History, Plus, RotateCcw,
} from 'lucide-react'
import { AppModal } from '../components/AppModal'
import { EMPTY_PROJECT, type ViyeuticaProject } from '../domain/project'
import { saveProject } from '../store/projectStorage'
import {
  activateCourseRecord,
  loadCourseRecords,
  storeCourseProject,
  syncCurrentCourse,
  type CourseRecord,
} from '../store/courseStorage'

export function CoursesPage({
  project,
  navigate,
}:{
  project:ViyeuticaProject
  navigate:(path:string)=>void
}) {
  const [records,setRecords]=useState<CourseRecord[]>([])
  const [showNew,setShowNew]=useState(false)
  const [showDuplicate,setShowDuplicate]=useState(false)
  const [activateId,setActivateId]=useState<string|null>(null)
  const [startYear,setStartYear]=useState(project.academicYear.endYear)

  useEffect(()=>{
    setRecords(syncCurrentCourse(project))
  },[project])

  const sorted=useMemo(
    ()=>[...records].sort((a,b)=>b.startYear-a.startYear),
    [records],
  )
  const active=sorted.find(item=>item.status==='active')??null
  const archived=sorted.filter(item=>item.status==='archived')

  const switchToProject=(next:ViyeuticaProject)=>{
    storeCourseProject(project,'archived')
    saveProject(next)
    activateCourseRecord(next.academicYear.id)
    setRecords(syncCurrentCourse(next))
    window.setTimeout(()=>navigate('/'),180)
  }

  const createBlank=()=>{
    const nextStart=Number(startYear)
    if(!Number.isFinite(nextStart)||nextStart<2000||nextStart>2100)return
    const nextEnd=nextStart+1
    const next:ViyeuticaProject={
      ...structuredClone(EMPTY_PROJECT),
      center:structuredClone(project.center),
      academicYear:{
        id:nextStart+'-'+nextEnd,
        label:nextStart+'/'+nextEnd,
        startYear:nextStart,
        endYear:nextEnd,
      },
    }
    setShowNew(false)
    switchToProject(next)
  }

  const duplicateCurrent=()=>{
    const nextStart=project.academicYear.endYear
    const nextEnd=nextStart+1
    const next:ViyeuticaProject={
      ...structuredClone(project),
      academicYear:{
        id:nextStart+'-'+nextEnd,
        label:nextStart+'/'+nextEnd,
        startYear:nextStart,
        endYear:nextEnd,
      },
      generationRuns:[],
      selectedGenerationRunId:null,
      updatedAt:null,
    }
    setShowDuplicate(false)
    switchToProject(next)
  }

  const confirmActivation=()=>{
    if(!activateId)return
    const record=records.find(item=>item.id===activateId)
    if(!record)return
    setActivateId(null)
    switchToProject(structuredClone(record.project))
  }

  return <div className="courses-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><CalendarDays size={28}/> Curso académico</h1>
        <p>Conserva el histórico del centro por curso y trabaja siempre sobre un único curso activo para evitar mezclar configuraciones, horarios o auditorías de años distintos.</p>
      </div>
    </section>

    {active&&<section className="course-active-card">
      <div className="course-active-icon"><CheckCircle2 size={24}/></div>
      <div className="course-active-main">
        <span className="panel-kicker">Curso activo</span>
        <h2>{active.label}</h2>
        <p>{project.center.name||'Centro sin configurar'} · actualizado {formatDate(active.updatedAt)}</p>
      </div>
      <div className="course-active-stats">
        <CourseStat label="Grupos" value={project.groups.filter(item=>item.active).length}/>
        <CourseStat label="Profesorado" value={project.teachers.filter(item=>item.active).length}/>
        <CourseStat label="Propuestas" value={project.generationRuns.length}/>
      </div>
    </section>}

    <section className="course-actions-grid">
      <article className="course-action-card">
        <div className="course-action-icon"><Plus size={22}/></div>
        <div><h2>Crear curso nuevo</h2><p>Empieza un curso vacío conservando únicamente los datos identificativos del centro.</p></div>
        <button className="btn primary" onClick={()=>{setStartYear(project.academicYear.endYear);setShowNew(true)}}>Crear curso</button>
      </article>
      <article className="course-action-card">
        <div className="course-action-icon"><Copy size={22}/></div>
        <div><h2>Duplicar curso actual</h2><p>Crea el curso siguiente reutilizando estructura, jornada, plan, profesorado, asignaciones y reglas, pero sin propuestas generadas.</p></div>
        <button className="btn secondary-light" onClick={()=>setShowDuplicate(true)}>Duplicar {project.academicYear.label}</button>
      </article>
    </section>

    <section className="course-history-card">
      <div className="groups-table-heading">
        <div><span className="panel-kicker"><History size={14}/> Histórico</span><h2>Cursos anteriores</h2><p>Los cursos archivados se conservan completos y pueden reactivarse cuando necesites consultarlos o modificarlos.</p></div>
      </div>
      {archived.length===0
        ? <div className="course-history-empty"><Archive size={20}/><span>Todavía no hay cursos archivados.</span></div>
        : <div className="course-history-list">{archived.map(record=><article key={record.id}>
            <div className="course-history-icon"><Archive size={18}/></div>
            <div className="course-history-main">
              <strong>{record.label}</strong>
              <small>{record.project.center.name||'Centro sin configurar'} · {record.project.groups.filter(item=>item.active).length} grupos · {record.project.teachers.filter(item=>item.active).length} docentes</small>
              <span>Actualizado {formatDate(record.updatedAt)}</span>
            </div>
            <button className="btn ghost-inline" onClick={()=>setActivateId(record.id)}><RotateCcw size={15}/> Reactivar</button>
          </article>)}</div>}
    </section>

    {showNew&&<AppModal
      title="Crear curso académico"
      icon={<CalendarDays size={22}/>}
      onClose={()=>setShowNew(false)}
      footer={<>
        <button className="btn secondary-light" onClick={()=>setShowNew(false)}>Cancelar</button>
        <button className="btn primary" onClick={createBlank}>Crear curso</button>
      </>}
    >
      <p>El nuevo curso conservará los datos del centro, pero empezará sin grupos, jornada, plan de estudios, profesorado, asignaciones, reglas ni horarios.</p>
      <label className="course-year-field">
        <span>Año de inicio</span>
        <input type="number" min="2000" max="2100" value={startYear} onChange={event=>setStartYear(Number(event.target.value))}/>
        <small>Se creará el curso {Number(startYear)||'—'}/{Number(startYear)?Number(startYear)+1:'—'}.</small>
      </label>
    </AppModal>}

    {showDuplicate&&<AppModal
      title="Duplicar curso actual"
      icon={<Copy size={22}/>}
      onClose={()=>setShowDuplicate(false)}
      footer={<>
        <button className="btn secondary-light" onClick={()=>setShowDuplicate(false)}>Cancelar</button>
        <button className="btn primary" onClick={duplicateCurrent}>Crear {project.academicYear.endYear}/{project.academicYear.endYear+1}</button>
      </>}
    >
      <p>Se guardará <strong>{project.academicYear.label}</strong> en el histórico y se creará <strong>{project.academicYear.endYear}/{project.academicYear.endYear+1}</strong> como curso activo.</p>
      <p style={{marginTop:8}}>Se copiará toda la configuración editable del curso. Las propuestas generadas y la selección de horario se reiniciarán para evitar arrastrar resultados del año anterior.</p>
    </AppModal>}

    {activateId&&<AppModal
      title="Reactivar curso"
      icon={<RotateCcw size={22}/>}
      onClose={()=>setActivateId(null)}
      footer={<>
        <button className="btn secondary-light" onClick={()=>setActivateId(null)}>Cancelar</button>
        <button className="btn primary" onClick={confirmActivation}>Reactivar curso</button>
      </>}
    >
      <p>El curso actual se guardará automáticamente en el histórico antes de cambiar al curso <strong>{records.find(item=>item.id===activateId)?.label}</strong>.</p>
    </AppModal>}
  </div>
}

function CourseStat({label,value}:{label:string;value:number}){
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function formatDate(value:string){
  const date=new Date(value)
  if(Number.isNaN(date.getTime()))return 'sin fecha'
  return date.toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'})
}
