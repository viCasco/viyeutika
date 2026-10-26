import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Save, Sparkles,
} from 'lucide-react'
import {
  isCenterComplete,
  type CenterData,
  type CenterType,
  type EducationStage,
  type Ownership,
  type ViyeuticaProject,
} from '../domain/project'
import { saveProject } from '../store/projectStorage'
import { WizardStepper } from '../components/WizardStepper'
import { TemplatePanel } from '../components/TemplatePanel'

const stages: EducationStage[] = ['Infantil', 'Primaria', 'ESO', 'Bachillerato']
const ownershipOptions: { value: Ownership; label: string }[] = [
  { value: 'publico', label: 'Público' },
  { value: 'concertado', label: 'Concertado' },
  { value: 'privado', label: 'Privado' },
]
const centerTypes: { value: CenterType; label: string }[] = [
  { value: 'CEIP', label: 'CEIP · Infantil y Primaria' },
  { value: 'IES', label: 'IES · Secundaria' },
  { value: 'CEIPSO', label: 'CEIPSO · Infantil, Primaria y Secundaria' },
  { value: 'CRA', label: 'CRA · Colegio Rural Agrupado' },
  { value: 'COLEGIO', label: 'Colegio' },
  { value: 'OTRO', label: 'Otro centro' },
]

type Errors = Partial<Record<keyof CenterData | 'stages', string>>

export function SetupWizard({
  project,
  navigate,
}: {
  project: ViyeuticaProject
  navigate: (path: string) => void
}) {
  const [form, setForm] = useState<CenterData>(() => ({ ...project.center, stages: [...project.center.stages] }))
  const [errors, setErrors] = useState<Errors>({})
  const [saved, setSaved] = useState(false)
  const [modalOpen,setModalOpen]=useState(()=>!isCenterComplete(project.center))

  const complete = useMemo(() => isCenterComplete(form), [form])
  const guide=!form.name.trim()?'Introduce el nombre oficial del centro.'
    :!form.officialCode.trim()?'Introduce el código oficial del centro.'
    :!form.ownership?'Selecciona la titularidad.'
    :!form.centerType?'Selecciona el tipo de centro.'
    :!form.autonomousCommunity.trim()?'Indica la comunidad autónoma.'
    :!form.province.trim()?'Indica la provincia.'
    :!form.locality.trim()?'Indica la localidad.'
    :!form.stages.length?'Selecciona al menos una etapa educativa.'
    :'Los datos mínimos del centro están completos. Ya puedes guardar y continuar.'

  const setField = <K extends keyof CenterData>(key: K, value: CenterData[K]) => {
    setSaved(false)
    setForm(current => ({ ...current, [key]: value }))
    if (errors[key]) setErrors(current => ({ ...current, [key]: undefined }))
  }

  const toggleStage = (stage: EducationStage) => {
    const next = form.stages.includes(stage)
      ? form.stages.filter(item => item !== stage)
      : [...form.stages, stage]
    setField('stages', next)
  }

  const applyCenterTemplate = (centerType: CenterType, templateStages: EducationStage[]) => {
    setSaved(false)
    setErrors({})
    setForm(current => ({
      ...current,
      centerType,
      ownership: current.ownership || 'publico',
      stages: templateStages,
    }))
  }

  const validate = () => {
    const next: Errors = {}
    if (!form.name.trim()) next.name = 'Introduce el nombre oficial del centro.'
    if (!form.officialCode.trim()) next.officialCode = 'Introduce el código oficial del centro.'
    if (!form.ownership) next.ownership = 'Selecciona la titularidad.'
    if (!form.centerType) next.centerType = 'Selecciona el tipo de centro.'
    if (!form.autonomousCommunity.trim()) next.autonomousCommunity = 'Indica la comunidad autónoma.'
    if (!form.province.trim()) next.province = 'Indica la provincia.'
    if (!form.locality.trim()) next.locality = 'Indica la localidad.'
    if (!form.stages.length) next.stages = 'Selecciona al menos una etapa educativa.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const persist = () => {
    if (!validate()) return false
    saveProject({ ...project, center: { ...form, name: form.name.trim(), officialCode: form.officialCode.trim() } })
    setSaved(true)
    return true
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (persist()) setModalOpen(false)
  }

  return (
    <div className="wizard-page">
      <section className="wizard-intro">
        <div>
          <h1 className="wizard-page-title"><Sparkles size={28}/> Prepara el curso {project.academicYear.label}</h1>
          <p>⩒Yeutika usará estos datos como base para grupos, profesorado, reglas, generación y auditoría del horario.</p>
        </div>
        <div className="wizard-progress-summary">
          <strong>1 <span>de 9</span></strong>
          <small>Datos del centro</small>
        </div>
      </section>

      <WizardStepper currentStep={1} project={project} navigate={navigate}/>

      <section className="structure-summary">
        <Summary label="Centro" value={project.center.name||'—'} detail={project.center.locality||'sin localidad'}/>
        <Summary label="Código oficial" value={project.center.officialCode||'—'} detail={project.center.ownership?ownershipOptions.find(item=>item.value===project.center.ownership)?.label??project.center.ownership:'sin titularidad'}/>
        <Summary label="Tipo" value={project.center.centerType||'—'} detail={project.center.province||'sin provincia'}/>
        <Summary label="Etapas" value={String(project.center.stages.length)} detail={project.center.stages.join(' · ')||'sin etapas'}/>
      </section>

      <article className={'aside-card validation section-prevalidation-card '+(isCenterComplete(project.center)?'ready':'incomplete')}>
        <span className="panel-kicker">ESTADO:</span>
        <strong>{isCenterComplete(project.center)?'Sección Datos del centro válida':'Sección Datos del centro incompleta'}</strong>
        <p>{isCenterComplete(project.center)
          ? `${project.center.name} · ${project.center.centerType} · ${project.center.stages.join(', ')}. La identificación, ubicación, titularidad y etapas necesarias están guardadas.`
          : 'Faltan datos obligatorios de identificación, ubicación o etapas. Completa el formulario para poder validar la estructura del centro.'}</p>
        {!isCenterComplete(project.center)&&<button type="button" className="section-status-action" onClick={()=>setModalOpen(true)}>Completar datos del centro</button>}
      </article>

      <section className="groups-table-card center-data-card">
        <div className="groups-table-heading"><div><span className="panel-kicker">Datos maestros</span><h2>Datos del centro</h2></div><button className="btn ghost-inline" onClick={()=>setModalOpen(true)}>Editar datos</button></div>
        <div className="center-data-grid">
          <div><span>Nombre oficial</span><strong>{project.center.name||'—'}</strong></div>
          <div><span>Código oficial</span><strong>{project.center.officialCode||'—'}</strong></div>
          <div><span>Titularidad</span><strong>{ownershipOptions.find(item=>item.value===project.center.ownership)?.label??'—'}</strong></div>
          <div><span>Tipo de centro</span><strong>{centerTypes.find(item=>item.value===project.center.centerType)?.label??'—'}</strong></div>
          <div><span>Comunidad autónoma</span><strong>{project.center.autonomousCommunity||'—'}</strong></div>
          <div><span>Provincia</span><strong>{project.center.province||'—'}</strong></div>
          <div><span>Localidad</span><strong>{project.center.locality||'—'}</strong></div>
          <div><span>Etapas</span><strong>{project.center.stages.join(', ')||'—'}</strong></div>
        </div>
      </section>

      {modalOpen&&<div className="modal-backdrop section-form-modal-backdrop">
        <form className="app-modal section-form-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Editar datos del centro">
          <div className="app-modal-header"><div><Sparkles size={20}/><h2>Datos del centro</h2></div></div>
          <div className="app-modal-body">
            <div className="form-card-heading"><div className="form-card-number">01</div><div><span className="panel-kicker">Datos maestros</span><h2>Datos del centro</h2><p>Información identificativa y etapas que imparte el centro.</p></div></div>
            <div className="form-grid two">
              <Field label="Nombre oficial del centro" required error={errors.name} wide><input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Ej. CEIP Santa María del Prado" autoComplete="organization"/></Field>
              <Field label="Código oficial del centro" required error={errors.officialCode}><input value={form.officialCode} onChange={e => setField('officialCode', e.target.value)} placeholder="Ej. 0600XXXX"/></Field>
              <Field label="Titularidad" required error={errors.ownership}><select value={form.ownership} onChange={e => setField('ownership', e.target.value as Ownership)}><option value="">Selecciona...</option>{ownershipOptions.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></Field>
              <Field label="Tipo de centro" required error={errors.centerType}><select value={form.centerType} onChange={e => setField('centerType', e.target.value as CenterType)}><option value="">Selecciona...</option>{centerTypes.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></Field>
            </div>
            <div className="form-section-title"><h3>Ubicación</h3><p>Se utilizará más adelante para seleccionar el paquete normativo aplicable.</p></div>
            <div className="form-grid three">
              <Field label="Comunidad autónoma" required error={errors.autonomousCommunity}><input value={form.autonomousCommunity} onChange={e => setField('autonomousCommunity', e.target.value)} /></Field>
              <Field label="Provincia" required error={errors.province}><input value={form.province} onChange={e => setField('province', e.target.value)} placeholder="Ej. Badajoz"/></Field>
              <Field label="Localidad" required error={errors.locality}><input value={form.locality} onChange={e => setField('locality', e.target.value)} placeholder="Ej. La Roca de la Sierra"/></Field>
            </div>
            <div className="form-section-title"><h3>Etapas educativas</h3><p>Marca todas las etapas que deben participar en la planificación.</p></div>
            <div className="stage-grid">{stages.map(stage => {const selected=form.stages.includes(stage);return <button type="button" className={'stage-option '+(selected?'selected':'')} onClick={()=>toggleStage(stage)} key={stage}><span className="stage-check">{selected&&<Check size={15}/>}</span><span><strong>{stage}</strong><small>{stage==='Infantil'?'Segundo ciclo':stage==='Primaria'?'1.º a 6.º':stage==='ESO'?'1.º a 4.º':'1.º y 2.º'}</small></span></button>})}</div>
            {errors.stages&&<p className="field-error standalone">{errors.stages}</p>}
            <div className={'form-guide '+(complete?'complete':'partial')}><strong>{complete?'Centro listo':'Siguiente paso'}</strong><span>{guide}</span></div>
          </div>
          <div className="app-modal-footer"><button type="button" className="btn ghost-inline" onClick={()=>setModalOpen(false)}>Cancelar</button><button type="submit" className="btn primary" disabled={!complete}>Aceptar</button></div>
        </form>
      </div>}

      <div className="section-template-full">
        <TemplatePanel
          title="Tipo de centro"
          description="Rellena tipo, titularidad pública si aún no está indicada y etapas habituales. No modifica nombre, código ni ubicación."
          actions={[
            {id:'ceip',label:'Plantilla CEIP',description:'Infantil + Primaria',onApply:()=>{applyCenterTemplate('CEIP',['Infantil','Primaria']);setModalOpen(true)}},
            {id:'ies',label:'Plantilla IES',description:'ESO + Bachillerato',onApply:()=>{applyCenterTemplate('IES',['ESO','Bachillerato']);setModalOpen(true)}},
            {id:'ceipso',label:'Plantilla CEIPSO',description:'Infantil + Primaria + ESO',onApply:()=>{applyCenterTemplate('CEIPSO',['Infantil','Primaria','ESO']);setModalOpen(true)}},
            {id:'cra',label:'Plantilla CRA',description:'Infantil + Primaria',onApply:()=>{applyCenterTemplate('CRA',['Infantil','Primaria']);setModalOpen(true)}},
          ]}
        />
      </div>

      <section className="section-info-grid">
        <article className="aside-card"><span className="panel-kicker">Curso activo</span><strong>{project.academicYear.label}</strong><p>Los datos de configuración quedan asociados al curso académico activo.</p></article>
        <article className="aside-card info"><span className="panel-kicker">Privacidad</span><strong>Prototipo local</strong><p>En esta fase los datos se guardan únicamente en este navegador. No se envían a un servidor.</p></article>
      </section>
    </div>
  )
}

function Summary({label,value,detail}:{label:string;value:string;detail:string}){return <article className="structure-summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>}

function Field({
  label, required, error, wide, children,
}: {
  label: string
  required?: boolean
  error?: string
  wide?: boolean
  children: React.ReactNode
}) {
  return <label className={'form-field ' + (wide ? 'wide' : '')}>
    <span>{label}{required && <em>*</em>}</span>
    {children}
    {error && <small className="field-error">{error}</small>}
  </label>
}
