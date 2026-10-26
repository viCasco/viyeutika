import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowLeft, BookOpen, CalendarClock, CheckCircle2, Clock3, Copy, GraduationCap,
  GripVertical, LayoutGrid, Pencil, Plus, Save, ShieldCheck, SlidersHorizontal,
  Sparkles, Trash2, Users,
} from 'lucide-react'
import {
  isScheduleComplete,
  isStructureComplete,
  timeBlockDuration,
  validateSchedule,
  type EducationStage,
  type ScheduleMode,
  type TimeBlock,
  type TimeBlockType,
  type ViyeuticaProject,
  type Weekday,
} from '../domain/project'
import { saveProject } from '../store/projectStorage'
import { AppModal } from '../components/AppModal'
import { WizardStepper } from '../components/WizardStepper'
import { TemplatePanel } from '../components/TemplatePanel'

const days: {id:Weekday; short:string; label:string}[] = [
  {id:'L',short:'L',label:'Lunes'},
  {id:'M',short:'M',label:'Martes'},
  {id:'X',short:'X',label:'Miércoles'},
  {id:'J',short:'J',label:'Jueves'},
  {id:'V',short:'V',label:'Viernes'},
  {id:'S',short:'S',label:'Sábado'},
]

const typeOptions: {value:TimeBlockType;label:string}[] = [
  {value:'teaching',label:'Lectiva'},
  {value:'break',label:'Recreo / descanso'},
  {value:'complementary',label:'Complementaria'},
  {value:'other',label:'Otro tramo'},
]

interface Draft {
  label:string
  start:string
  end:string
  type:TimeBlockType
  stageScope:EducationStage[]
}
const emptyDraft:Draft = {label:'',start:'09:00',end:'10:00',type:'teaching',stageScope:[]}
const uid=()=> 'slot_'+crypto.randomUUID()

function formatMinutes(value:number) {
  if (!Number.isFinite(value) || value <= 0) return '—'
  const h=Math.floor(value/60), m=value%60
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}

export function SchedulePage({project,navigate}:{project:ViyeuticaProject;navigate:(path:string)=>void}) {
  const [draft,setDraft]=useState<Draft>(emptyDraft)
  const [editingId,setEditingId]=useState<string|null>(null)
  const [error,setError]=useState('')
  const [showPresetModal,setShowPresetModal]=useState(false)
  const [blockModalOpen,setBlockModalOpen]=useState(false)
  const schedule=project.schedule
  const blocks=[...schedule.blocks].sort((a,b)=>a.start.localeCompare(b.start))
  const validation=useMemo(()=>validateSchedule(schedule),[schedule])
  const complete=isScheduleComplete(project)
  const blockReady=Boolean(draft.label.trim()&&draft.start&&draft.end&&draft.start<draft.end)
  const blockGuide=!draft.label.trim()?'Indica el nombre del tramo.'
    :!draft.start?'Indica la hora de inicio.'
    :!draft.end?'Indica la hora de fin.'
    :draft.start>=draft.end?'La hora final debe ser posterior a la inicial.'
    :'El tramo tiene los datos mínimos necesarios. Ya puedes añadirlo.'

  const persist=(patch:Partial<typeof schedule>)=>{
    saveProject({...project,schedule:{...schedule,...patch}})
  }

  const toggleDay=(day:Weekday)=>{
    const next=schedule.activeDays.includes(day)
      ? schedule.activeDays.filter(item=>item!==day)
      : [...schedule.activeDays,day]
    persist({activeDays:next})
  }


  const toggleStage=(stage:EducationStage)=>{
    const next=draft.stageScope.includes(stage)
      ? draft.stageScope.filter(item=>item!==stage)
      : [...draft.stageScope,stage]
    setDraft({...draft,stageScope:next})
  }

  const reset=()=>{setDraft(emptyDraft);setEditingId(null);setError('');setBlockModalOpen(false)}
  const openCreate=()=>{setDraft(emptyDraft);setEditingId(null);setError('');setBlockModalOpen(true)}

  const submit=(event:FormEvent)=>{
    event.preventDefault()
    if(!draft.label.trim()){setError('Indica un nombre para el tramo.');return}
    if(draft.start>=draft.end){setError('La hora final debe ser posterior a la inicial.');return}
    const next:TimeBlock={
      id:editingId??uid(),
      label:draft.label.trim(),
      start:draft.start,
      end:draft.end,
      type:draft.type,
      stageScope:[...draft.stageScope],
      active:true,
    }
    const updated=editingId
      ? schedule.blocks.map(block=>block.id===editingId?next:block)
      : [...schedule.blocks,next]
    persist({blocks:updated})
    reset()
  }

  const edit=(block:TimeBlock)=>{
    setEditingId(block.id)
    setDraft({label:block.label,start:block.start,end:block.end,type:block.type,stageScope:[...block.stageScope]})
    setError('')
    setBlockModalOpen(true)
  }

  const remove=(id:string)=>{
    persist({blocks:schedule.blocks.filter(block=>block.id!==id)})
    if(editingId===id) reset()
  }

  const toggleActive=(id:string)=>persist({
    blocks:schedule.blocks.map(block=>block.id===id?{...block,active:!block.active}:block)
  })

  const duplicate=(block:TimeBlock)=>{
    persist({blocks:[...schedule.blocks,{...block,id:uid(),label:block.label+' copia'}]})
  }

  const applyPreset=()=>{
    const preset:TimeBlock[]=[
      ['1.ª sesión','09:00','10:00','teaching'],
      ['2.ª sesión','10:00','11:00','teaching'],
      ['3.ª sesión','11:00','11:45','teaching'],
      ['Recreo','11:45','12:15','break'],
      ['4.ª sesión','12:15','13:00','teaching'],
      ['5.ª sesión','13:00','14:00','teaching'],
    ].map(([label,start,end,type])=>({id:uid(),label,start,end,type:type as TimeBlockType,stageScope:[],active:true}))
    persist({mode:'morning',activeDays:['L','M','X','J','V'],blocks:preset})
    setShowPresetModal(false)
  }

  const createPreset=()=>{
    if(schedule.blocks.length){
      setShowPresetModal(true)
      return
    }
    applyPreset()
  }

  const teachingMinutes=blocks.filter(b=>b.active&&b.type==='teaching').reduce((sum,b)=>sum+timeBlockDuration(b),0)
  const first=blocks.find(b=>b.active)
  const last=[...blocks].reverse().find(b=>b.active)

  if(!isStructureComplete(project)) {
    return <div className="wizard-page schedule-page">
      <section className="wizard-intro">
        <div>
          <h1 className="wizard-page-title"><CalendarClock size={28}/> Jornada y sesiones</h1>
          <p>Define cuándo puede existir actividad en el centro. Estos tramos serán la rejilla temporal sobre la que trabajará el generador.</p>
        </div>
        <div className="wizard-progress-summary"><strong>3 <span>de 9</span></strong><small>Jornada y sesiones</small></div>
      </section>
      <WizardStepper currentStep={3} project={project} navigate={navigate}/>
      <section className="empty-state-card">
        <CalendarClock size={34}/>
        <h1>Completa primero la estructura del centro</h1>
        <p>La jornada se configura sobre los grupos y etapas activas del curso.</p>
        <button className="btn primary" onClick={()=>navigate('/grupos')}>Ir a Estructura y grupos</button>
      </section>
    </div>
  }

  return <div className="wizard-page schedule-page">
    {showPresetModal&&<AppModal
      title="Sustituir la jornada actual"
      icon={<CalendarClock size={22}/>}
      onClose={()=>setShowPresetModal(false)}
      footer={<>
        <button className="btn secondary-light" onClick={()=>setShowPresetModal(false)}>Cancelar</button>
        <button className="btn primary" onClick={applyPreset}>Cargar plantilla</button>
      </>}
    >
      <p>La plantilla <strong>09:00–14:00</strong> sustituirá todos los tramos actuales de la jornada.</p>
      <p style={{marginTop:8}}>Los grupos, profesorado, materias y demás datos del proyecto no se modificarán.</p>
    </AppModal>}
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><CalendarClock size={28}/> Jornada y sesiones</h1>
        <p>Define cuándo puede existir actividad en el centro. Estos tramos serán la rejilla temporal sobre la que trabajará el generador.</p>
      </div>
      <div className="wizard-progress-summary"><strong>3 <span>de 9</span></strong><small>Jornada y sesiones</small></div>
    </section>

    <WizardStepper currentStep={3} project={project} navigate={navigate}/>

    <section className="schedule-summary">
      <Summary label="Días lectivos" value={String(schedule.activeDays.length)} detail={schedule.activeDays.join(' · ')||'Sin días'}/>
      <Summary label="Sesiones lectivas" value={String(blocks.filter(b=>b.active&&b.type==='teaching').length)} detail={formatMinutes(teachingMinutes)}/>
      <Summary label="Tramos totales" value={String(blocks.filter(b=>b.active).length)} detail="incluye recreos y otros"/>
      <Summary label="Horario" value={first&&last?`${first.start}–${last.end}`:'—'} detail={modeLabel(schedule.mode)}/>
    </section>

    <article className={'aside-card validation section-prevalidation-card '+(validation.length?'error':blocks.length?'ready':'incomplete')}>
      <span className="panel-kicker">ESTADO:</span>
      <strong>{validation.length?'Sección Jornada y sesiones con errores':blocks.length?'Sección Jornada y sesiones válida':'Sección Jornada y sesiones incompleta'}</strong>
      <p>{validation.length
        ? `${validation[0]} Revisa los tramos configurados y corrige horarios o solapamientos antes de continuar.`
        : blocks.length
          ? `${schedule.activeDays.length} días activos · ${blocks.filter(b=>b.active&&b.type==='teaching').length} sesiones lectivas · ${first&&last?`${first.start}–${last.end}`:'horario definido'}. No hay solapamientos ni intervalos inválidos.`
          : 'Todavía no hay tramos configurados. Añade las sesiones lectivas y pausas que forman la jornada.'}</p>
      {validation.length>0&&<button type="button" className="section-status-action" onClick={()=>document.querySelector('.timeline-card')?.scrollIntoView({behavior:'smooth',block:'start'})}>Revisar tramos</button>}
      {!validation.length&&!blocks.length&&<button type="button" className="section-status-action" onClick={openCreate}>Añadir primer tramo</button>}
    </article>

    {blockModalOpen&&<div className="modal-backdrop section-form-modal-backdrop">
      <form className="app-modal section-form-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={editingId?'Modificar sesión':'Añadir sesión o pausa'}>
        <div className="app-modal-header"><div><CalendarClock size={20}/><h2>{editingId?'Modificar sesión':'Añadir sesión o pausa'}</h2></div></div>
        <div className="app-modal-body">
          <div className="form-card-heading"><div className="form-card-number">03</div><div><span className="panel-kicker">{editingId?'Editar tramo':'Nuevo tramo'}</span><h2>{editingId?'Modificar sesión':'Añadir sesión o pausa'}</h2><p>Las duraciones pueden ser distintas; no se presupone una sesión fija de 45, 50 o 60 minutos.</p></div></div>
          <div className="form-grid two">
            <Field label="Nombre" required><input value={draft.label} onChange={e=>setDraft({...draft,label:e.target.value})} placeholder="Ej. 1.ª sesión"/></Field>
            <Field label="Tipo" required><select value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value as TimeBlockType})}>{typeOptions.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}</select></Field>
            <Field label="Inicio" required><input type="time" value={draft.start} onChange={e=>setDraft({...draft,start:e.target.value})}/></Field>
            <Field label="Fin" required><input type="time" value={draft.end} onChange={e=>setDraft({...draft,end:e.target.value})}/></Field>
          </div>
          <div className="form-section-title"><h3>Etapas a las que aplica</h3><p>Si no seleccionas ninguna, el tramo se considera común a todo el centro.</p></div>
          <div className="stage-scope-picker">{project.center.stages.map(stage=><button type="button" key={stage} className={draft.stageScope.includes(stage)?'active':''} onClick={()=>toggleStage(stage)}>{stage}</button>)}</div>
          <div className="duration-preview"><Clock3 size={16}/><span>Duración:</span><strong>{formatMinutes(new Date(`1970-01-01T${draft.end}:00`).getTime()/60000-new Date(`1970-01-01T${draft.start}:00`).getTime()/60000)}</strong></div>
          {error&&<div className="inline-error">{error}</div>}
          <div className={'form-guide '+(blockReady?'complete':'partial')}><strong>{blockReady?'Tramo listo':'Siguiente paso'}</strong><span>{blockGuide}</span></div>
        </div>
        <div className="app-modal-footer"><button type="button" className="btn ghost-inline" onClick={reset}>Cancelar</button><button className="btn primary" type="submit" disabled={!blockReady}>Aceptar</button></div>
      </form>
    </div>}

    <section className="timeline-card">
      <div className="groups-table-heading">
        <div><span className="panel-kicker">Secuencia diaria</span><h2>Tramos configurados</h2></div>
        <button className="btn ghost-inline" onClick={openCreate}><Plus size={16}/> Añadir tramo</button>
      </div>
      {blocks.length===0?<div className="groups-empty"><CalendarClock size={28}/><strong>No hay sesiones todavía</strong><p>Añade los tramos manualmente o utiliza el ejemplo editable.</p></div>:
      <div className="timeline-list">{blocks.map(block=><article className={'timeline-row '+(!block.active?'is-inactive':'')} key={block.id}>
        <GripVertical size={17} className="timeline-grip"/>
        <div className={'timeline-type '+block.type}/>
        <div className="timeline-time"><strong>{block.start}</strong><span>{block.end}</span></div>
        <div className="timeline-main"><strong>{block.label}</strong><span>{typeLabel(block.type)} · {formatMinutes(timeBlockDuration(block))}{block.stageScope.length?` · ${block.stageScope.join(', ')}`:' · Todas las etapas'}</span></div>
        <button className={'status-toggle '+(block.active?'active':'')} onClick={()=>toggleActive(block.id)}>{block.active?'Activo':'Inactivo'}</button>
        <div className="row-actions">
          <button title="Duplicar" onClick={()=>duplicate(block)}><Copy size={15}/></button>
          <button title="Editar" onClick={()=>edit(block)}><Pencil size={15}/></button>
          <button title="Eliminar" className="danger" onClick={()=>remove(block.id)}><Trash2 size={15}/></button>
        </div>
      </article>)}</div>}
    </section>

    <section className="schedule-secondary-grid">
      <div className="schedule-secondary-column">
    <section className="schedule-config-card">
      <div className="schedule-config-row">
        <div><span className="panel-kicker">Semana lectiva</span><h2>Días activos</h2><p>Activa únicamente los días en los que el centro puede programar actividad.</p></div>
        <div className="weekday-picker">{days.map(day=><button key={day.id} className={schedule.activeDays.includes(day.id)?'active':''} onClick={()=>toggleDay(day.id)} title={day.label}>{day.short}</button>)}</div>
      </div>
    </section>
      </div>
      <div className="schedule-secondary-column">
    <div className="section-template-full">
      <TemplatePanel
        title="Jornada de ejemplo"
        description="Carga una base editable 09:00–14:00 con cinco sesiones y recreo. Es una plantilla de trabajo, no una regla normativa."
        actions={[
          {id:'morning-9-14',label:'Cargar plantilla 09:00–14:00',description:'5 sesiones + recreo',onApply:createPreset},
        ]}
      />
    </div>
      </div>
    </section>

  </div>
}

function Summary({label,value,detail}:{label:string;value:string;detail:string}) {
  return <article className="structure-summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}
function Field({label,required,children}:{label:string;required?:boolean;children:React.ReactNode}) {
  return <label className="form-field"><span>{label}{required&&<em>*</em>}</span>{children}</label>
}
function typeLabel(type:TimeBlockType){return typeOptions.find(x=>x.value===type)?.label??type}
function modeLabel(mode:ScheduleMode){return ({morning:'Jornada de mañana',afternoon:'Jornada de tarde',split:'Jornada partida',custom:'Jornada personalizada'} as Record<ScheduleMode,string>)[mode]}
