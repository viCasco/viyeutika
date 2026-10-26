import { useMemo, useState } from 'react'
import { ClipboardPaste, CheckCircle2, Table2, TriangleAlert } from 'lucide-react'
import type { ViyeuticaProject } from '../domain/project'
import { applyBulkRows, parseBulkRows, type BulkEditMode } from '../domain/bulkEdit'
import { saveProject } from '../store/projectStorage'

const modeLabels:Record<BulkEditMode,{title:string;columns:string;example:string}>={
  teachers:{
    title:'Profesorado',
    columns:'Nombre · Especialidades · Minutos lectivos · Tipo de jornada',
    example:'Ana Pérez\\tPrimaria;Inglés\\t900\\tfull',
  },
  studyPlan:{
    title:'Plan de estudios',
    columns:'Grupo · Materia · Sesiones semanales · Minutos semanales',
    example:'1.º Primaria A\\tLengua\\t5\\t',
  },
  assignments:{
    title:'Asignaciones',
    columns:'Grupo · Materia · Docente · Tipo · Sesiones · Minutos',
    example:'1.º Primaria A\\tLengua\\tAna Pérez\\tmain\\t5\\t',
  },
}

export function BulkEditPage({
  project,
  navigate,
}:{
  project:ViyeuticaProject
  navigate:(path:string)=>void
}){
  const [mode,setMode]=useState<BulkEditMode>('teachers')
  const [text,setText]=useState('')
  const [done,setDone]=useState('')
  const rows=useMemo(()=>parseBulkRows(project,mode,text),[project,mode,text])
  const valid=rows.filter(row=>row.valid)
  const invalid=rows.filter(row=>!row.valid)

  const apply=()=>{
    if(!valid.length)return
    const next=applyBulkRows(project,mode,rows)
    saveProject(next)
    setDone(`${valid.length} ${valid.length===1?'fila válida aplicada':'filas válidas aplicadas'}${invalid.length?`. ${invalid.length} ${invalid.length===1?'fila inválida se ha omitido':'filas inválidas se han omitido'}.`:'.'}`)
  }

  const changeMode=(next:BulkEditMode)=>{
    setMode(next)
    setText('')
    setDone('')
  }

  return <div className="wizard-page bulk-edit-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><Table2 size={28}/> Edición masiva</h1>
        <p>Pega rangos tabulados desde Excel o una hoja de cálculo. ⩒Yeutika valida referencias fila a fila y aplica únicamente los registros válidos sin duplicar claves existentes.</p>
      </div>
    </section>

    <section className="bulk-mode-tabs">
      {(Object.keys(modeLabels) as BulkEditMode[]).map(value=><button type="button" key={value} className={mode===value?'active':''} onClick={()=>changeMode(value)}>{modeLabels[value].title}</button>)}
    </section>

    <section className="bulk-editor-card">
      <div className="groups-table-heading">
        <div><span className="panel-kicker">Pegado tabular</span><h2>{modeLabels[mode].title}</h2><p>{modeLabels[mode].columns}</p></div>
        <button className="btn secondary-light" onClick={()=>setText(modeLabels[mode].example)}><ClipboardPaste size={15}/> Cargar ejemplo</button>
      </div>
      <textarea
        className="bulk-paste-area"
        value={text}
        onChange={event=>{setText(event.target.value);setDone('')}}
        placeholder={`Pega aquí las filas. Ejemplo:\n${modeLabels[mode].example}`}
      />
      <div className="bulk-summary">
        <span className="valid"><CheckCircle2 size={16}/>{valid.length} válidas</span>
        <span className={invalid.length?'invalid':''}><TriangleAlert size={16}/>{invalid.length} con error</span>
        <button className="btn primary" disabled={!valid.length} onClick={apply}>Aplicar filas válidas</button>
      </div>
      {done&&<div className="template-result"><CheckCircle2 size={16}/><span>{done}</span></div>}
    </section>

    {rows.length>0&&<section className="groups-table-card">
      <div className="groups-table-heading"><div><span className="panel-kicker">Previsualización</span><h2>Resultado de validación</h2></div></div>
      <div className="groups-table-wrap"><table className="groups-table bulk-preview-table">
        <thead><tr><th>Fila</th><th>Datos</th><th>Resultado</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.index} className={row.valid?'bulk-valid':'bulk-invalid'}>
          <td>{row.index+1}</td>
          <td>{row.raw.join(' · ')}</td>
          <td>{row.valid?<span className="tag green">Válida</span>:<span className="tag red">{row.error}</span>}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}

    <section className="bulk-navigation-card">
      <button className="btn ghost-inline" onClick={()=>navigate(mode==='teachers'?'/profesorado':mode==='studyPlan'?'/materias':'/asignaciones')}>Volver a {modeLabels[mode].title}</button>
      <p>Las filas válidas actualizan una clave existente o crean una nueva. Las filas con referencias inexistentes nunca se aplican.</p>
    </section>
  </div>
}
