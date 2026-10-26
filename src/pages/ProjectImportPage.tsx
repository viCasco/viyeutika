import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpToLine, CheckCircle2, Eye, FileInput, FileJson,
  FileSpreadsheet, ShieldAlert, Trash2, TriangleAlert,
} from 'lucide-react'
import {
  EMPTY_PROJECT,
  isCenterComplete,
  isStructureComplete,
  validateAssignments,
  validateRules,
  validateSchedule,
  validateStaff,
  validateStudyPlan,
  type ViyeuticaProject,
} from '../domain/project'
import {
  buildEmptyJsonTemplate,
  buildEmptyXlsTemplate,
  downloadTextFile,
  projectFromXlsTemplate,
} from '../domain/templateIO'
import { saveProject } from '../store/projectStorage'
import { AppModal } from '../components/AppModal'
import { ExportPage } from './ExportPage'
import {
  deleteStoredTemplateFile,
  loadStoredTemplateFiles,
  storeTemplateFile,
  type StoredTemplateFile,
} from '../store/jsonFileStorage'

type ImportEnvelope = {
  format?: string
  formatVersion?: number
  project?: Partial<ViyeuticaProject>
  reviewRequired?: { path:string; reason:string }[]
}

function normalizeProject(raw:Partial<ViyeuticaProject>):ViyeuticaProject {
  return {
    ...structuredClone(EMPTY_PROJECT),
    ...raw,
    center:{...structuredClone(EMPTY_PROJECT.center),...(raw.center??{})},
    academicYear:{...EMPTY_PROJECT.academicYear,...(raw.academicYear??{})},
    groups:Array.isArray(raw.groups)?raw.groups:[],
    schedule:{
      ...structuredClone(EMPTY_PROJECT.schedule),
      ...(raw.schedule??{}),
      activeDays:Array.isArray(raw.schedule?.activeDays)?raw.schedule!.activeDays:[...EMPTY_PROJECT.schedule.activeDays],
      blocks:Array.isArray(raw.schedule?.blocks)?raw.schedule!.blocks:[],
    },
    subjects:Array.isArray(raw.subjects)?raw.subjects:[],
    studyPlan:Array.isArray(raw.studyPlan)?raw.studyPlan:[],
    teachers:Array.isArray(raw.teachers)?raw.teachers:[],
    teacherAvailability:Array.isArray(raw.teacherAvailability)?raw.teacherAvailability:[],
    assignments:Array.isArray(raw.assignments)?raw.assignments:[],
    rules:Array.isArray(raw.rules)?raw.rules:[],
    generationRuns:Array.isArray(raw.generationRuns)?raw.generationRuns:[],
    selectedGenerationRunId:raw.selectedGenerationRunId??null,
    normativeSources:Array.isArray(raw.normativeSources)?raw.normativeSources:[],
    normativeRules:Array.isArray(raw.normativeRules)?raw.normativeRules:[],
    updatedAt:null,
  }
}

function nextAcademicYear(project:ViyeuticaProject):ViyeuticaProject {
  const start=project.academicYear.startYear+1
  const end=project.academicYear.endYear+1
  return {
    ...project,
    academicYear:{id:start+'-'+end,label:start+'/'+end,startYear:start,endYear:end},
    generationRuns:[],
    selectedGenerationRunId:null,
    updatedAt:null,
  }
}

export function ProjectImportPage({project,navigate}:{project:ViyeuticaProject;navigate:(path:string)=>void}) {
  const jsonInputRef=useRef<HTMLInputElement|null>(null)
  const xlsInputRef=useRef<HTMLInputElement|null>(null)
  const [candidate,setCandidate]=useState<ViyeuticaProject|null>(null)
  const [candidateFormat,setCandidateFormat]=useState<'json'|'xls'|null>(null)
  const [review,setReview]=useState<{path:string;reason:string}[]>([])
  const [filename,setFilename]=useState('')
  const [rawPreview,setRawPreview]=useState('')
  const [error,setError]=useState('')
  const [done,setDone]=useState('')
  const [pendingMode,setPendingMode]=useState<'same'|'next'|null>(null)
  const [showPreview,setShowPreview]=useState(false)
  const [storedFiles,setStoredFiles]=useState<StoredTemplateFile[]>([])
  const [storedPreview,setStoredPreview]=useState<StoredTemplateFile|null>(null)

  useEffect(()=>setStoredFiles(loadStoredTemplateFiles()),[])

  const candidateIssues=candidate?[
    ...(!isCenterComplete(candidate.center)?['Los datos del centro están incompletos.']:[]),
    ...(!isStructureComplete(candidate)?['La estructura y los grupos están incompletos.']:[]),
    ...validateSchedule(candidate.schedule),
    ...validateStudyPlan(candidate),
    ...validateStaff(candidate),
    ...validateAssignments(candidate),
    ...validateRules(candidate),
  ]:[]

  const readJson=async(file:File)=>{
    setError('');setDone('')
    try{
      const rawText=await file.text()
      const parsed=JSON.parse(rawText) as ImportEnvelope|Partial<ViyeuticaProject>
      const envelope=(parsed as ImportEnvelope).project ? parsed as ImportEnvelope : {project:parsed as Partial<ViyeuticaProject>}
      if(envelope.format && envelope.format!=='viyeutica-school-project') throw new Error('El JSON no tiene un formato ⩒Yeutika reconocido.')
      await storeTemplateFile(file,rawText,'json')
      setStoredFiles(loadStoredTemplateFiles())
      setCandidate(normalizeProject(envelope.project??{}))
      setCandidateFormat('json')
      setReview(envelope.reviewRequired??[])
      setFilename(file.name)
      setRawPreview(JSON.stringify(parsed,null,2))
    }catch(err){
      setCandidate(null);setCandidateFormat(null);setRawPreview('')
      setError(err instanceof Error?err.message:'No se ha podido leer el JSON.')
    }finally{
      if(jsonInputRef.current)jsonInputRef.current.value=''
    }
  }

  const readXls=async(file:File)=>{
    setError('');setDone('')
    try{
      const rawText=await file.text()
      const parsed=projectFromXlsTemplate(rawText)
      await storeTemplateFile(file,rawText,'xls')
      setStoredFiles(loadStoredTemplateFiles())
      setCandidate(normalizeProject(parsed))
      setCandidateFormat('xls')
      setReview([])
      setFilename(file.name)
      setRawPreview(rawText)
    }catch(err){
      setCandidate(null);setCandidateFormat(null);setRawPreview('')
      setError(err instanceof Error?err.message:'No se ha podido leer la plantilla XLS.')
    }finally{
      if(xlsInputRef.current)xlsInputRef.current.value=''
    }
  }

  const clearCandidate=()=>{
    setCandidate(null);setCandidateFormat(null);setReview([]);setFilename('');setRawPreview('')
    setPendingMode(null);setShowPreview(false);setError('');setDone('')
  }

  const confirmApply=()=>{
    if(!candidate||!pendingMode)return
    const next=pendingMode==='next'?nextAcademicYear(candidate):candidate
    saveProject(next,{preserveGeneration:pendingMode==='same'})
    setDone(pendingMode==='next'?'Importado como curso '+next.academicYear.label+'.':'Plantilla importada correctamente.')
    setPendingMode(null)
    window.setTimeout(()=>navigate('/'),250)
  }

  const removeStored=(id:string)=>{
    deleteStoredTemplateFile(id)
    setStoredFiles(loadStoredTemplateFiles())
    if(storedPreview?.id===id)setStoredPreview(null)
  }

  return <div className="project-import-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><FileInput size={28}/> Importar | Exportar</h1>
        <p>Importa plantillas del centro en JSON o Excel y exporta horarios, informes y respaldos desde un único módulo. Proyecto actual: <strong>{project.center.name||'sin centro configurado'}</strong>.</p>
      </div>
    </section>

    <section className="import-grid template-import-grid">
      <article className="normative-upload-card">
        <div className="template-card-heading">
          <div className="normative-upload-icon"><FileJson size={28}/></div>
          <div>
            <h2>Importar desde JSON</h2>
            <p>Para centros que ya dispongan de una plantilla ⩒Yeutika o quieran trabajar con un formato estructurado.</p>
          </div>
        </div>
        <input ref={jsonInputRef} hidden type="file" accept=".json,application/json" onChange={e=>e.target.files?.[0]&&readJson(e.target.files[0])}/>
        <div className="template-option-actions">
          <button className="btn secondary-light" onClick={()=>downloadTextFile(buildEmptyJsonTemplate(),'⩒Yeutika_Plantilla_Vacia.json','application/json')}>
            <FileJson size={16}/> Descargar plantilla JSON
          </button>
          <button className="btn primary" onClick={()=>jsonInputRef.current?.click()}><ArrowUpToLine size={16}/> Seleccionar JSON</button>
        </div>
      </article>

      <article className="normative-upload-card">
        <div className="template-card-heading">
          <div className="normative-upload-icon"><FileSpreadsheet size={28}/></div>
          <div>
            <h2>Importar desde hoja de cálculo</h2>
            <p>Utiliza la plantilla XLS de ⩒Yeutika con hojas separadas para Centro, Grupos, Jornada, Materias, Profesorado, Asignaciones y Reglas.</p>
          </div>
        </div>
        <input ref={xlsInputRef} hidden type="file" accept=".xls,application/vnd.ms-excel,application/xml,text/xml" onChange={e=>e.target.files?.[0]&&readXls(e.target.files[0])}/>
        <div className="template-option-actions">
          <button className="btn secondary-light" onClick={()=>downloadTextFile(buildEmptyXlsTemplate(),'⩒Yeutika_Plantilla_Vacia.xls','application/vnd.ms-excel')}>
            <FileSpreadsheet size={16}/> Descargar plantilla XLS
          </button>
          <button className="btn primary" onClick={()=>xlsInputRef.current?.click()}><ArrowUpToLine size={16}/> Seleccionar XLS</button>
        </div>
      </article>
    </section>

    {storedPreview&&<AppModal
      title={storedPreview.name}
      icon={storedPreview.format==='json'?<FileJson size={22}/>:<FileSpreadsheet size={22}/>}
      onClose={()=>setStoredPreview(null)}
      wide
      footer={<button className="btn secondary-light" onClick={()=>setStoredPreview(null)}>Cerrar</button>}
    >
      <div className="json-document-viewer">
        <pre>{storedPreview.format==='json'?formatJson(storedPreview.rawText):storedPreview.rawText}</pre>
      </div>
    </AppModal>}

    {storedFiles.length>0&&<section className="stored-json-section">
      <div className="groups-table-heading">
        <div><span className="panel-kicker">Plantillas cargadas</span><h2>Archivos disponibles en este navegador</h2></div>
      </div>
      <div className="stored-json-list">
        {storedFiles.map(item=><article key={item.id} className="stored-json-item">
          <div className="stored-json-icon">{item.format==='json'?<FileJson size={20}/>:<FileSpreadsheet size={20}/>}</div>
          <div className="stored-json-copy">
            <strong>{item.name}</strong>
            <small>{item.format.toUpperCase()} · {formatBytes(item.size)} · cargado {new Date(item.addedAt).toLocaleString('es-ES')}</small>
          </div>
          <div className="stored-json-actions">
            <button title="Ver archivo" onClick={()=>setStoredPreview(item)}><Eye size={16}/></button>
            <button className="row-delete" title="Eliminar archivo" onClick={()=>removeStored(item.id)}><Trash2 size={16}/></button>
          </div>
        </article>)}
      </div>
    </section>}

    {error&&<div className="inline-error">{error}</div>}
    {done&&<div className="template-result"><CheckCircle2 size={16}/><span>{done}</span></div>}

    {candidate&&<section className="import-preview-card">
      <div className="groups-table-heading">
        <div>
          <span className="panel-kicker">Vista previa · {candidateFormat?.toUpperCase()}</span>
          <h2>{filename}</h2>
        </div>
        <div className="import-preview-actions">
          <button className="btn ghost-inline" onClick={()=>setShowPreview(true)}><Eye size={15}/> Ver archivo</button>
          <button className="btn ghost-inline danger-text" onClick={clearCandidate}><Trash2 size={15}/> Quitar archivo</button>
        </div>
      </div>
      <div className="import-kpis">
        <Kpi label="Curso" value={candidate.academicYear.label}/>
        <Kpi label="Grupos" value={String(candidate.groups.length)}/>
        <Kpi label="Materias" value={String(candidate.subjects.length)}/>
        <Kpi label="Profesorado" value={String(candidate.teachers.length)}/>
        <Kpi label="Asignaciones" value={String(candidate.assignments.length)}/>
        <Kpi label="Reglas" value={String(candidate.rules.length)}/>
      </div>
      <div className="import-center-summary">
        <strong>{candidate.center.name||'Centro sin nombre en la plantilla'}</strong>
        <span>{candidate.center.centerType||'Tipo sin especificar'} · {candidate.center.stages.join(' + ')||'Etapas sin especificar'}</span>
      </div>
      {review.length>0&&<div className="import-review"><ShieldAlert size={18}/><div><strong>{review.length} {review.length===1?'campo requiere':'campos requieren'} revisión</strong>{review.slice(0,6).map(item=><p key={item.path}><strong>{importPathLabel(item.path)}</strong> — {item.reason}</p>)}</div></div>}
      {candidateIssues.length>0&&<div className="import-review"><TriangleAlert size={18}/><div>
        <strong>{candidateIssues.length} {candidateIssues.length===1?'incidencia detectada':'incidencias detectadas'} en la configuración importada</strong>
        <p>La importación está permitida para que puedas corregirlas después. Prevalidación volverá a comprobarlas antes de generar.</p>
        {candidateIssues.slice(0,6).map((item,index)=><p key={index}>{item}</p>)}
      </div></div>}
      <div className="import-actions">
        <button className="btn secondary-light" onClick={()=>setPendingMode('same')}>Importar en {candidate.academicYear.label}</button>
        <button className="btn primary" onClick={()=>setPendingMode('next')}>Usar como base para {candidate.academicYear.startYear+1}/{candidate.academicYear.endYear+1}</button>
      </div>
    </section>}

    {showPreview&&candidate&&<AppModal
      title={filename}
      icon={candidateFormat==='json'?<FileJson size={22}/>:<FileSpreadsheet size={22}/>}
      onClose={()=>setShowPreview(false)}
      wide
      footer={<button className="btn secondary-light" onClick={()=>setShowPreview(false)}>Cerrar</button>}
    >
      <div className="json-document-viewer"><pre>{candidateFormat==='json'?formatJson(rawPreview):rawPreview}</pre></div>
    </AppModal>}

    {pendingMode&&candidate&&<AppModal
      title={pendingMode==='next'?'Usar plantilla como base':'Importar plantilla'}
      icon={<TriangleAlert size={22}/>}
      onClose={()=>setPendingMode(null)}
      footer={<>
        <button className="btn secondary-light" onClick={()=>setPendingMode(null)}>Cancelar</button>
        <button className="btn primary" onClick={confirmApply}>{pendingMode==='next'?'Usar como base':'Importar plantilla'}</button>
      </>}
    >
      <p>Esta acción sustituirá los datos actuales guardados en este navegador por los de <strong>{filename}</strong>.</p>
      <p style={{marginTop:8}}>La plantilla original no se modificará y podrás seguir editando todos los datos después de importarlos.</p>
      {candidateIssues.length>0&&<p style={{marginTop:8}}><strong>Atención:</strong> se han detectado {candidateIssues.length} {candidateIssues.length===1?'incidencia':'incidencias'} que deberán revisarse antes de generar.</p>}
    </AppModal>}

    <ExportPage project={project} navigate={navigate} embedded/>
  </div>
}

function importPathLabel(path:string){
  const root=path.split(/[.[\]]/).filter(Boolean)[0]??path
  const labels:Record<string,string>={
    center:'Centro',
    academicYear:'Curso académico',
    groups:'Estructura y grupos',
    schedule:'Jornada y sesiones',
    subjects:'Materias',
    studyPlan:'Plan de estudios',
    teachers:'Profesorado',
    teacherAvailability:'Disponibilidad',
    assignments:'Asignaciones',
    rules:'Reglas',
  }
  return labels[root]??'Dato importado'
}

function Kpi({label,value}:{label:string;value:string}){return <article><span>{label}</span><strong>{value}</strong></article>}
function formatJson(raw:string){try{return JSON.stringify(JSON.parse(raw),null,2)}catch{return raw}}
function formatBytes(value:number){if(value<1024)return value+' B';if(value<1024*1024)return (value/1024).toFixed(1)+' KB';return (value/(1024*1024)).toFixed(1)+' MB'}
