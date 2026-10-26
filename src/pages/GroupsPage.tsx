import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowLeft, BookOpen, CalendarClock, CheckCircle2, GraduationCap, LayoutGrid,
  Pencil, Plus, Save, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Users,
} from 'lucide-react'
import {
  EDUCATION_LEVELS,
  isCenterComplete,
  isStructureComplete,
  type EducationStage,
  type SchoolGroup,
  type ViyeuticaProject,
} from '../domain/project'
import { saveProject } from '../store/projectStorage'
import { WizardStepper } from '../components/WizardStepper'
import { TemplatePanel } from '../components/TemplatePanel'

interface GroupDraft {
  stage: EducationStage | ''
  level: string
  line: string
  students: string
  classroom: string
  combined: boolean
  notes: string
}

const emptyDraft: GroupDraft = {
  stage: '',
  level: '',
  line: 'A',
  students: '',
  classroom: '',
  combined: false,
  notes: '',
}

function uid() {
  return 'grp_' + crypto.randomUUID()
}

function groupName(level: string, line: string) {
  return line.trim() ? `${level} ${line.trim().toUpperCase()}` : level
}

export function GroupsPage({
  project,
  navigate,
}: {
  project: ViyeuticaProject
  navigate: (path:string) => void
}) {
  const [draft,setDraft] = useState<GroupDraft>(emptyDraft)
  const [editingId,setEditingId] = useState<string | null>(null)
  const [error,setError] = useState('')
  const [stageFilter,setStageFilter] = useState<'all'|EducationStage>('all')
  const [modalOpen,setModalOpen] = useState(false)
  const groups = project.groups ?? []
  const allowedStages = project.center.stages

  const levels = draft.stage ? EDUCATION_LEVELS[draft.stage] : []
  const activeGroups = groups.filter(group => group.active)
  const visibleGroups = groups.filter(group => stageFilter==='all'||group.stage===stageFilter)
  const studentTotal = activeGroups.reduce((sum,group) => sum + (group.students ?? 0),0)
  const levelTotal = new Set(activeGroups.map(group => `${group.stage}|${group.level}`)).size
  const complete = isStructureComplete(project)
  const groupReady=Boolean(draft.stage&&draft.level&&draft.line.trim())
  const groupGuide=!draft.stage?'Selecciona la etapa del grupo.'
    :!draft.level?'Selecciona el nivel.'
    :!draft.line.trim()?'Indica la línea o identificador del grupo.'
    :'El grupo tiene los datos mínimos necesarios. Ya puedes añadirlo.'

  const resetDraft = () => {
    setDraft(emptyDraft)
    setEditingId(null)
    setError('')
    setModalOpen(false)
  }

  const openCreate = () => {
    setDraft(emptyDraft)
    setEditingId(null)
    setError('')
    setModalOpen(true)
  }

  const persistGroups = (next: SchoolGroup[]) => {
    saveProject({...project,groups:next})
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.stage || !draft.level) {
      setError('Selecciona una etapa y un nivel.')
      return
    }
    if (!draft.line.trim()) {
      setError('Indica una línea o identificador de grupo.')
      return
    }
    const duplicate = groups.some(group =>
      group.id !== editingId &&
      group.stage === draft.stage &&
      group.level === draft.level &&
      group.line.toUpperCase() === draft.line.trim().toUpperCase()
    )
    if (duplicate) {
      setError('Ya existe un grupo con esa etapa, nivel y línea.')
      return
    }

    const nextGroup: SchoolGroup = {
      id: editingId ?? uid(),
      name: groupName(draft.level,draft.line),
      stage: draft.stage,
      level: draft.level,
      line: draft.line.trim().toUpperCase(),
      students: draft.students === '' ? null : Math.max(0,Number(draft.students)),
      classroom: draft.classroom.trim(),
      combined: draft.combined,
      linkedGroupIds: [],
      tutorTeacherId: null,
      notes: draft.notes.trim(),
      active: true,
    }
    const next = editingId
      ? groups.map(group => group.id === editingId ? nextGroup : group)
      : [...groups,nextGroup]
    persistGroups(next)
    resetDraft()
  }

  const edit = (group: SchoolGroup) => {
    setEditingId(group.id)
    setDraft({
      stage:group.stage,
      level:group.level,
      line:group.line,
      students:group.students === null ? '' : String(group.students),
      classroom:group.classroom,
      combined:group.combined,
      notes:group.notes,
    })
    setError('')
    setModalOpen(true)
  }

  const remove = (id:string) => {
    persistGroups(groups.filter(group => group.id !== id))
    if (editingId === id) resetDraft()
  }

  const toggleActive = (id:string) => {
    persistGroups(groups.map(group => group.id === id ? {...group,active:!group.active} : group))
  }

  const generateStandard = () => {
    const existing = new Set(groups.map(group => `${group.stage}|${group.level}|${group.line}`))
    const generated: SchoolGroup[] = []
    for (const stage of allowedStages) {
      for (const level of EDUCATION_LEVELS[stage]) {
        const key = `${stage}|${level}|A`
        if (existing.has(key)) continue
        generated.push({
          id:uid(),name:groupName(level,'A'),stage,level,line:'A',
          students:null,classroom:'',combined:false,linkedGroupIds:[],
          tutorTeacherId:null,notes:'',active:true,
        })
      }
    }
    if (generated.length) persistGroups([...groups,...generated])
  }

  if (!isCenterComplete(project.center)) {
    return <div className="wizard-page groups-page">
      <section className="wizard-intro">
        <div>
          <h1 className="wizard-page-title"><LayoutGrid size={28}/> Estructura y grupos</h1>
          <p>Define las unidades reales del curso. Después ⩒Yeutika relacionará cada grupo con jornada, materias, profesorado y restricciones.</p>
        </div>
        <div className="wizard-progress-summary"><strong>2 <span>de 9</span></strong><small>Estructura y grupos</small></div>
      </section>
      <WizardStepper currentStep={2} project={project} navigate={navigate}/>
      <section className="empty-state-card">
        <GraduationCap size={34}/>
        <h1>Primero configura el centro</h1>
        <p>Las etapas seleccionadas en el paso 1 determinan qué niveles puede ofrecer ⩒Yeutika.</p>
        <button className="btn primary" onClick={() => navigate('/centro')}>Ir a Datos del centro</button>
      </section>
    </div>
  }

  return <div className="wizard-page groups-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><LayoutGrid size={28}/> Estructura y grupos</h1>
        <p>Define las unidades reales del curso. Después ⩒Yeutika relacionará cada grupo con jornada, materias, profesorado y restricciones.</p>
      </div>
      <div className="wizard-progress-summary"><strong>2 <span>de 9</span></strong><small>Estructura y grupos</small></div>
    </section>

    <WizardStepper currentStep={2} project={project} navigate={navigate}/>

    <section className="structure-summary">
      <Summary label="Etapas activas" value={String(allowedStages.length)} detail={allowedStages.join(' · ')}/>
      <Summary label="Niveles creados" value={String(levelTotal)} detail="con al menos un grupo activo"/>
      <Summary label="Grupos" value={String(activeGroups.length)} detail={groups.length !== activeGroups.length ? `${groups.length-activeGroups.length} ${groups.length-activeGroups.length===1?'inactivo':'inactivos'}` : 'unidades activas'}/>
      <Summary label="Alumnado" value={studentTotal ? String(studentTotal) : '—'} detail="total agregado informado"/>
    </section>

    <article className={'aside-card validation section-prevalidation-card '+(complete?'ready':'incomplete')}>
      <span className="panel-kicker">ESTADO:</span>
      <strong>{complete?'Sección Estructura y grupos válida':'Sección Estructura y grupos incompleta'}</strong>
      <p>{complete
        ? `${activeGroups.length} ${activeGroups.length===1?'grupo activo':'grupos activos'} distribuidos en ${allowedStages.length} ${allowedStages.length===1?'etapa':'etapas'}. Todas las etapas seleccionadas tienen al menos una unidad activa.`
        : 'Falta crear al menos un grupo activo en alguna de las etapas seleccionadas. Añádelo para completar la estructura.'}</p>
      {!complete&&<button type="button" className="section-status-action" onClick={openCreate}>Añadir grupo pendiente</button>}
    </article>

    {modalOpen&&<div className="modal-backdrop section-form-modal-backdrop">
      <form className="app-modal section-form-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={editingId?'Editar grupo':'Añadir grupo'}>
        <div className="app-modal-header"><div><LayoutGrid size={20}/><h2>{editingId?'Editar grupo':'Añadir grupo'}</h2></div></div>
        <div className="app-modal-body">
          <div className="form-card-heading">
            <div className="form-card-number">02</div>
            <div><span className="panel-kicker">{editingId?'Edición':'Nueva unidad'}</span><h2>{editingId?'Editar grupo':'Añadir grupo'}</h2><p>Los tutores se asignarán cuando exista la plantilla docente en el paso 5.</p></div>
          </div>
          <div className="form-grid two">
            <Field label="Etapa" required><select value={draft.stage} onChange={e => setDraft({...draft,stage:e.target.value as EducationStage,level:''})}><option value="">Selecciona...</option>{allowedStages.map(stage => <option key={stage} value={stage}>{stage}</option>)}</select></Field>
            <Field label="Nivel" required><select value={draft.level} disabled={!draft.stage} onChange={e => setDraft({...draft,level:e.target.value})}><option value="">{draft.stage?'Selecciona...':'Selecciona primero la etapa'}</option>{levels.map(level => <option key={level} value={level}>{level}</option>)}</select></Field>
            <Field label="Línea / grupo" required><input value={draft.line} maxLength={8} onChange={e => setDraft({...draft,line:e.target.value})} placeholder="A"/></Field>
            <Field label="Número de alumnos"><input type="number" min="0" max="99" value={draft.students} onChange={e => setDraft({...draft,students:e.target.value})} placeholder="Opcional"/></Field>
            <Field label="Aula ordinaria"><input value={draft.classroom} onChange={e => setDraft({...draft,classroom:e.target.value})} placeholder="Ej. Aula 1º A"/></Field>
            <label className="checkbox-field"><input type="checkbox" checked={draft.combined} onChange={e => setDraft({...draft,combined:e.target.checked})}/><span><strong>Grupo combinado</strong><small>Unidad que agrupa alumnado de más de un nivel.</small></span></label>
          </div>
          <label className="form-field notes-field"><span>Observaciones</span><textarea value={draft.notes} onChange={e => setDraft({...draft,notes:e.target.value})} placeholder="Información útil para la planificación..."/></label>
          {error && <div className="inline-error">{error}</div>}
          <div className={'form-guide '+(groupReady?'complete':'partial')}><strong>{groupReady?'Grupo listo':'Siguiente paso'}</strong><span>{groupGuide}</span></div>
        </div>
        <div className="app-modal-footer"><button type="button" className="btn ghost-inline" onClick={resetDraft}>Cancelar</button><button type="submit" className="btn primary" disabled={!groupReady}>Aceptar</button></div>
      </form>
    </div>}

    <section className="groups-table-card">
      <div className="groups-table-heading">
        <div><span className="panel-kicker">Unidades del curso</span><h2>Grupos creados</h2></div>
        <button className="btn ghost-inline" onClick={openCreate}><Plus size={16}/> Añadir grupo</button>
      </div>
      {groups.length>0&&<div className="list-filter-tags" aria-label="Filtrar grupos por etapa">
        <button type="button" className={stageFilter==='all'?'active':''} onClick={()=>setStageFilter('all')}>Todos</button>
        {allowedStages.map(stage=><button type="button" key={stage} className={stageFilter===stage?'active':''} onClick={()=>setStageFilter(stage)}>{stage}</button>)}
      </div>}
      {groups.length === 0 ? <div className="groups-empty">
        <LayoutGrid size={28}/><strong>No hay grupos todavía</strong><p>Añade el primero manualmente o genera la estructura estándar.</p>
      </div> : visibleGroups.length===0 ? <div className="groups-empty">
        <LayoutGrid size={28}/><strong>No hay grupos para esta etapa</strong><p>Cambia el filtro o crea un grupo nuevo.</p>
      </div> : <div className="groups-table-wrap">
        <table className="groups-table">
          <thead><tr><th>Grupo</th><th>Etapa</th><th>Nivel</th><th>Alumnos</th><th>Aula</th><th>Tipo</th><th>Estado</th><th/></tr></thead>
          <tbody>{visibleGroups.map(group => <tr key={group.id} className={!group.active?'is-inactive':''}>
            <td><strong>{group.name}</strong></td>
            <td>{group.stage}</td>
            <td>{group.level}</td>
            <td>{group.students ?? '—'}</td>
            <td>{group.classroom || '—'}</td>
            <td>{group.combined?<span className="tag amber">Combinado</span>:<span className="tag">Ordinario</span>}</td>
            <td><button className={'status-toggle '+(group.active?'active':'')} onClick={() => toggleActive(group.id)}>{group.active?'Activo':'Inactivo'}</button></td>
            <td><div className="row-actions"><button title="Editar" onClick={() => edit(group)}><Pencil size={15}/></button><button title="Eliminar" className="danger" onClick={() => remove(group.id)}><Trash2 size={15}/></button></div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <div className="section-template-full">
      <TemplatePanel
        title="Estructura estándar"
        description="Genera una línea A para todos los niveles ordinarios de las etapas seleccionadas. No elimina ni sobrescribe grupos existentes."
        actions={[
          {id:'standard-a',label:'Cargar plantilla estándar',description:'Una línea A por nivel',onApply:generateStandard},
        ]}
      />
    </div>
  </div>
}

function Summary({label,value,detail}:{label:string;value:string;detail:string}) {
  return <article className="structure-summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function Field({label,required,children}:{label:string;required?:boolean;children:React.ReactNode}) {
  return <label className="form-field"><span>{label}{required&&<em>*</em>}</span>{children}</label>
}
