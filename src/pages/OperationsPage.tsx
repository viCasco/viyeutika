import { useMemo, useState } from 'react'
import { CalendarRange, Plus, RefreshCcw, Trash2, UserRoundX } from 'lucide-react'
import { AppModal } from '../components/AppModal'
import { DataViewControls, SortableTh, sortCollection, type DataView, type SortState } from '../components/DataCollectionView'
import type { TemporaryChangeKind, TemporaryScheduleChange, ViyeuticaProject } from '../domain/project'
import { operationalAudit, operationalScheduleForDate } from '../domain/temporaryOperations'
import { saveProject } from '../store/projectStorage'

const kindLabels:Record<TemporaryChangeKind,string>={
  absence:'Ausencia',
  substitution:'Sustitución',
  swap:'Permuta',
}

export function OperationsPage({project,embedded=false}:{project:ViyeuticaProject;embedded?:boolean}){
  const today=new Date().toISOString().slice(0,10)
  const [kind,setKind]=useState<TemporaryChangeKind>('substitution')
  const [teacherId,setTeacherId]=useState(project.teachers.find(item=>item.active)?.id??'')
  const [otherTeacherId,setOtherTeacherId]=useState('')
  const [startDate,setStartDate]=useState(today)
  const [endDate,setEndDate]=useState(today)
  const [notes,setNotes]=useState('')
  const [previewDate,setPreviewDate]=useState(today)
  const [modalOpen,setModalOpen]=useState(false)
  const [changesView,setChangesView]=useState<DataView>('table')
  const [changesSort,setChangesSort]=useState<SortState<'kind'|'teacher'|'other'|'period'|'active'>>({key:null,direction:'asc'})
  const run=useMemo(()=>operationalScheduleForDate(project,previewDate),[project,previewDate])
  const audit=useMemo(()=>operationalAudit(project,previewDate),[project,previewDate])
  const displayedChanges=sortCollection(project.temporaryChanges,changesSort,(change,key)=>{
    if(key==='kind')return kindLabels[change.kind]
    if(key==='teacher')return project.teachers.find(item=>item.id===change.teacherId)?.name??''
    if(key==='other')return project.teachers.find(item=>item.id===(change.substituteTeacherId??change.swapTeacherId))?.name??''
    if(key==='period')return change.startDate+' '+change.endDate
    return change.active
  })

  const resetForm=()=>{
    setKind('substitution')
    setTeacherId(project.teachers.find(item=>item.active)?.id??'')
    setOtherTeacherId('')
    setStartDate(today)
    setEndDate(today)
    setNotes('')
  }

  const closeModal=()=>{
    resetForm()
    setModalOpen(false)
  }

  const add=()=>{
    if(!teacherId||!startDate||!endDate||endDate<startDate)return
    if((kind==='substitution'||kind==='swap')&&!otherTeacherId)return
    const change:TemporaryScheduleChange={
      id:'tmp_'+crypto.randomUUID(),
      kind,
      startDate,
      endDate,
      teacherId,
      substituteTeacherId:kind==='substitution'?otherTeacherId:null,
      swapTeacherId:kind==='swap'?otherTeacherId:null,
      notes:notes.trim(),
      active:true,
      createdAt:new Date().toISOString(),
    }
    saveProject({...project,temporaryChanges:[...project.temporaryChanges,change]},{intent:'replace_project'})
    closeModal()
  }

  const remove=(id:string)=>{
    saveProject({...project,temporaryChanges:project.temporaryChanges.filter(item=>item.id!==id)},{intent:'replace_project'})
  }

  const toggle=(id:string)=>{
    saveProject({
      ...project,
      temporaryChanges:project.temporaryChanges.map(item=>item.id===id?{...item,active:!item.active}:item),
    },{intent:'replace_project'})
  }

  return <div className={embedded?'operations-page embedded separated-sections':'wizard-page operations-page separated-sections'}>
    {!embedded&&<section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><CalendarRange size={28}/> Sustituciones y explotación</h1>
        <p>Aplica cambios temporales sobre una copia operativa del horario establecido. El horario oficial de referencia nunca se sobrescribe y vuelve a aplicarse automáticamente fuera del periodo de vigencia.</p>
      </div>
    </section>}

    {!project.establishedScheduleRun&&<section className="empty-state-card operations-reference-state"><UserRoundX size={32}/><h2>Necesitas un horario establecido</h2><p>Guarda primero una propuesta válida como horario del curso para utilizarla como referencia operativa.</p></section>}

    {modalOpen&&<AppModal
      title="Añadir cambio temporal"
      icon={<CalendarRange size={20}/>}
      onClose={closeModal}
      wide
      footer={<>
        <button type="button" className="btn ghost-inline" onClick={closeModal}>Cancelar</button>
        <button type="button" className="btn primary" disabled={!project.establishedScheduleRun||!teacherId||endDate<startDate||((kind==='substitution'||kind==='swap')&&!otherTeacherId)} onClick={add}>Aceptar</button>
      </>}
    >
      <div className="form-grid three">
        <label className="form-field"><span>Tipo</span><select value={kind} onChange={e=>{setKind(e.target.value as TemporaryChangeKind);setOtherTeacherId('')}}>{(Object.keys(kindLabels) as TemporaryChangeKind[]).map(value=><option key={value} value={value}>{kindLabels[value]}</option>)}</select></label>
        <label className="form-field"><span>{kind==='absence'?'Docente ausente':'Docente de referencia'}</span><select value={teacherId} onChange={e=>{setTeacherId(e.target.value);setOtherTeacherId('')}}>{project.teachers.filter(item=>item.active).map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
        {kind!=='absence'&&<label className="form-field"><span>{kind==='substitution'?'Docente sustituto':'Docente para permuta'}</span><select value={otherTeacherId} onChange={e=>setOtherTeacherId(e.target.value)}><option value="">Selecciona...</option>{project.teachers.filter(item=>item.active&&item.id!==teacherId).map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>}
        <label className="form-field"><span>Desde</span><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
        <label className="form-field"><span>Hasta</span><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
        <label className="form-field"><span>Observaciones</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional"/></label>
      </div>
    </AppModal>}

    <section className="groups-table-card operations-changes-section">
      <div className="groups-table-heading">
        <div><span className="panel-kicker">Vigencia</span><h2>Cambios registrados</h2></div>
        <div className="groups-table-actions">
          <DataViewControls
            view={changesView}
            onView={setChangesView}
            sort={changesSort}
            onSort={setChangesSort}
            options={[
              {key:'kind',label:'Tipo'},
              {key:'teacher',label:'Docente'},
              {key:'other',label:'Sustituto / permuta'},
              {key:'period',label:'Periodo'},
              {key:'active',label:'Estado'},
            ]}
          />
          <button className="btn ghost-inline" disabled={!project.establishedScheduleRun} onClick={()=>setModalOpen(true)}><Plus size={16}/> Añadir cambio</button>
        </div>
      </div>
      {project.temporaryChanges.length===0
        ? <div className="groups-empty"><CalendarRange size={28}/><strong>No hay cambios temporales</strong><p>El horario operativo coincide con el horario establecido.</p></div>
        : changesView==='table' ? <div className="groups-table-wrap"><table className="groups-table">
          <thead><tr>
            <SortableTh label="Tipo" sortKey="kind" state={changesSort} onSort={setChangesSort}/>
            <SortableTh label="Docente" sortKey="teacher" state={changesSort} onSort={setChangesSort}/>
            <SortableTh label="Sustituto / permuta" sortKey="other" state={changesSort} onSort={setChangesSort}/>
            <SortableTh label="Periodo" sortKey="period" state={changesSort} onSort={setChangesSort}/>
            <SortableTh label="Estado" sortKey="active" state={changesSort} onSort={setChangesSort}/>
            <th/>
          </tr></thead>
          <tbody>{displayedChanges.map(change=><tr key={change.id}>
            <td>{kindLabels[change.kind]}</td>
            <td>{project.teachers.find(item=>item.id===change.teacherId)?.name??'—'}</td>
            <td>{project.teachers.find(item=>item.id===(change.substituteTeacherId??change.swapTeacherId))?.name??'—'}</td>
            <td>{change.startDate} → {change.endDate}</td>
            <td><button className={'status-toggle '+(change.active?'active':'')} onClick={()=>toggle(change.id)}>{change.active?'Activa':'Pausada'}</button></td>
            <td><button className="row-delete" title="Revertir/eliminar cambio" onClick={()=>remove(change.id)}><Trash2 size={15}/></button></td>
          </tr>)}</tbody>
        </table></div> : <div className="data-card-grid">
          {displayedChanges.map(change=><article className={'data-record-card '+(!change.active?'is-inactive':'')} key={change.id}>
            <div className="data-record-card-heading"><div><strong>{kindLabels[change.kind]}</strong><small>{project.teachers.find(item=>item.id===change.teacherId)?.name??'—'}</small></div><span className={'tag '+(change.active?'':'amber')}>{change.active?'Activa':'Pausada'}</span></div>
            <div className="data-record-card-data">
              <div><span>Sustituto / permuta</span><strong>{project.teachers.find(item=>item.id===(change.substituteTeacherId??change.swapTeacherId))?.name??'—'}</strong></div>
              <div><span>Periodo</span><strong>{change.startDate} → {change.endDate}</strong></div>
            </div>
            <div className="data-record-card-footer"><button className={'status-toggle '+(change.active?'active':'')} onClick={()=>toggle(change.id)}>{change.active?'Activa':'Pausada'}</button><button className="row-delete" title="Revertir/eliminar cambio" onClick={()=>remove(change.id)}><Trash2 size={15}/></button></div>
          </article>)}
        </div>}
    </section>

    <section className="operational-preview-card operations-preview-section">
      <div className="groups-table-heading">
        <div><span className="panel-kicker">Explotación</span><h2>Horario operativo por fecha</h2><p>Fuera de la vigencia de los cambios se recupera automáticamente la referencia establecida.</p></div>
        <label className="operational-date"><span>Fecha</span><input type="date" value={previewDate} onChange={e=>setPreviewDate(e.target.value)}/></label>
      </div>
      {!run?<div className="groups-empty"><RefreshCcw size={28}/><strong>Sin horario de referencia</strong></div>:<>
        <section className="structure-summary">
          <article className="structure-summary-card"><span>Estado</span><strong>{run.status==='complete'?'Válido':'Con incidencias'}</strong><small>{run.entries.length} sesiones operativas</small></article>
          <article className="structure-summary-card"><span>HARD</span><strong>{audit?.errors??0}</strong><small>errores bloqueantes</small></article>
          <article className="structure-summary-card"><span>Avisos</span><strong>{audit?.warnings??0}</strong><small>requieren revisión</small></article>
          <article className="structure-summary-card"><span>Referencia</span><strong>{run.id.startsWith('operational_')?'Temporal':'Oficial'}</strong><small>{previewDate}</small></article>
        </section>
        {audit&&audit.issues.length>0&&<div className="operational-issue-list">{audit.issues.slice(0,20).map(issue=><article key={issue.id} className={issue.severity}><strong>{issue.code}</strong><span>{issue.message}</span>{issue.detail&&<small>{issue.detail}</small>}</article>)}</div>}
      </>}
    </section>
  </div>
}
