import { useMemo, useState, type ReactNode } from 'react'
import {
  CheckCircle2, DatabaseBackup, Download, FileOutput, FileSpreadsheet,
  FileText, Printer, ShieldAlert, ShieldCheck,
} from 'lucide-react'
import { auditGeneration } from '../domain/auditEngine'
import {
  isGenerationProposalValid,
  uniqueGenerationRuns,
  type AuditIssue,
  type GenerationRun,
  type ViyeuticaProject,
  type Weekday,
} from '../domain/project'

const dayLabels:Record<Weekday,string>={
  L:'Lunes',M:'Martes',X:'Miércoles',J:'Jueves',V:'Viernes',S:'Sábado',
}

export function ExportPage({project,navigate,embedded=false}:{project:ViyeuticaProject;navigate:(path:string)=>void;embedded?:boolean}) {
  const runs=uniqueGenerationRuns(project.generationRuns).filter(run=>isGenerationProposalValid(project,run))
  const established=project.establishedScheduleRun&&isGenerationProposalValid(project,project.establishedScheduleRun)
    ? project.establishedScheduleRun
    : null
  const selected=established??runs.find(run=>run.id===project.selectedGenerationRunId)??runs[runs.length-1]??null
  const audit=useMemo(()=>selected?auditGeneration(project,selected):null,[project,selected])
  const [message,setMessage]=useState('')

  if(!selected||!audit){
    return <section className={embedded?'export-embedded-section':'empty-state-card'}>
      {embedded&&<div className="groups-table-heading"><div><span className="panel-kicker">Exportar</span><h2>Horario y datos del proyecto</h2></div></div>}
      <div className={embedded?'groups-empty':''}>
        <FileOutput size={34}/>
        <h1>No hay una propuesta válida para exportar</h1>
        <p>Selecciona primero una propuesta completa y sin huecos en Horarios.</p>
        <button className="btn primary" onClick={()=>navigate('/horarios')}>Ir a Horarios</button>
      </div>
    </section>
  }

  const proposalNumber=Math.max(1,runs.findIndex(run=>run.id===selected.id)+1)
  const isEstablished=Boolean(established&&selected.id===established.id)
  const official=audit.errors===0
  const prefix=official?'':'BORRADOR_'

  const downloadWorkbook=(scope:'groups'|'teachers'|'full')=>{
    const xmlText=buildWorkbook(project,selected,audit.issues,scope)
    const suffix=scope==='groups'?'Grupos':scope==='teachers'?'Docentes':'Completo'
    downloadBlob(xmlText,prefix+fileBase(project)+'_'+(isEstablished?'Horario_establecido':'Propuesta_'+proposalNumber)+'_'+suffix+'.xls','application/vnd.ms-excel')
    setMessage('Excel generado correctamente.')
  }

  const downloadAudit=()=>{
    const rows=[
      ['Severidad','Categoría','Mensaje','Detalle','Grupo','Materia','Docente','Día','Sesión'],
      ...audit.issues.map(issue=>auditRow(project,issue)),
    ]
    const csv=rows.map(row=>row.map(csvCell).join(';')).join('\n')
    downloadBlob('\ufeff'+csv,prefix+fileBase(project)+'_'+(isEstablished?'Horario_establecido':'Propuesta_'+proposalNumber)+'_Auditoria.csv','text/csv;charset=utf-8')
    setMessage('Informe de validaciones descargado.')
  }

  const downloadJson=()=>{
    const envelope={
      format:'viyeutica-school-project',
      formatVersion:1,
      exportedAt:new Date().toISOString(),
      selectedProposalId:selected.id,
      audit:{passed:audit.passed,errors:audit.errors,warnings:audit.warnings},
      project,
    }
    downloadBlob(JSON.stringify(envelope,null,2),fileBase(project)+'_respaldo_completo.json','application/json')
    setMessage('Respaldo JSON descargado.')
  }

  const printReport=()=>{
    const html=buildPrintableReport(project,selected,audit.issues,proposalNumber,official)
    const win=window.open('','_blank','noopener,noreferrer')
    if(!win){
      setMessage('El navegador ha bloqueado la ventana de impresión. Permite ventanas emergentes para ⩒Yeutika.')
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    window.setTimeout(()=>win.print(),250)
  }

  return <div className={'export-page '+(embedded?'export-embedded-section':'')}>
    {!embedded&&<section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><FileOutput size={28}/> Exportaciones</h1>
        <p>Descarga la propuesta seleccionada en formatos utilizables por el centro y conserva un respaldo completo del proyecto.</p>
      </div>
      <div className={'export-audit-status '+(official?'passed':'failed')}>
        {official?<CheckCircle2 size={20}/>:<ShieldAlert size={20}/>}
        <span>
          <strong>{official?'Lista para exportación definitiva':'Solo exportación como borrador'}</strong>
          <small>{isEstablished?'Horario establecido':'Propuesta '+proposalNumber} · {audit.errors} {audit.errors===1?'error':'errores'} · {audit.warnings} {audit.warnings===1?'advertencia':'advertencias'}</small>
        </span>
      </div>
    </section>}
    {embedded&&<div className="groups-table-heading import-export-section-heading">
      <div><span className="panel-kicker">Exportar</span><h2>Horario y datos del proyecto</h2><p>Descarga el horario seleccionado en formatos utilizables por el centro y conserva un respaldo completo del proyecto.</p></div>
      <div className={'export-audit-status '+(official?'passed':'failed')}>
        {official?<CheckCircle2 size={20}/>:<ShieldAlert size={20}/>}
        <span><strong>{official?'Lista para exportación definitiva':'Solo exportación como borrador'}</strong><small>{isEstablished?'Horario establecido':'Propuesta '+proposalNumber} · {audit.errors} {audit.errors===1?'error':'errores'} · {audit.warnings} {audit.warnings===1?'advertencia':'advertencias'}</small></span>
      </div>
    </div>}

    <section className="export-selected-proposal">
      <div>
        <span className="panel-kicker">{isEstablished?'Horario oficial del curso':'Propuesta activa'}</span>
        <h2>{isEstablished?'Horario establecido':'Propuesta '+proposalNumber}</h2>
        <p>{selected.placedSessions} sesiones · HARD {selected.hardViolations} · SOFT {selected.softPenalty} · puntuación {selected.score}</p>
      </div>
      <button className="btn ghost-inline" onClick={()=>navigate('/horarios')}>{isEstablished?'Ver Horarios':'Cambiar propuesta'}</button>
    </section>

    {!official&&<section className="export-blocker">
      <ShieldAlert size={20}/>
      <div>
        <strong>El horario contiene errores de validación</strong>
        <p>Los archivos de horario se generan identificados como <strong>BORRADOR</strong>. La versión definitiva se habilita cuando las validaciones del horario no tienen errores.</p>
      </div>
      <button className="btn secondary-light" onClick={()=>navigate('/horarios')}>Revisar Horarios</button>
    </section>}

    {message&&<section className="template-result"><CheckCircle2 size={16}/><span>{message}</span></section>}

    <section className="export-grid">
      <ExportCard icon={<FileSpreadsheet size={24}/>} title="Horarios por grupos" description="Libro Excel con una hoja independiente para cada grupo activo." action="Descargar Excel" onClick={()=>downloadWorkbook('groups')}/>
      <ExportCard icon={<FileSpreadsheet size={24}/>} title="Horarios por docentes" description="Libro Excel con una hoja independiente para cada docente activo." action="Descargar Excel" onClick={()=>downloadWorkbook('teachers')}/>
      <ExportCard icon={<FileSpreadsheet size={24}/>} title="Libro completo" description="Excel con grupos, docentes y una hoja final de validaciones." action="Descargar completo" onClick={()=>downloadWorkbook('full')}/>
      <ExportCard icon={<Printer size={24}/>} title="Horario en PDF" description="Abre un informe maquetado para imprimir o guardar como PDF desde el navegador." action="Imprimir / PDF" onClick={printReport}/>
      <ExportCard icon={<ShieldCheck size={24}/>} title="Informe de validaciones" description="Listado CSV de errores, advertencias y contexto de cada incidencia." action="Descargar validaciones" onClick={downloadAudit}/>
      <ExportCard icon={<DatabaseBackup size={24}/>} title="Respaldo completo JSON" description="Copia íntegra del proyecto, propuesta seleccionada y estado de validación." action="Descargar JSON" onClick={downloadJson}/>
    </section>

    <section className="export-footnote">
      <FileText size={18}/>
      <div><strong>Nombres de archivo trazables</strong><p>Los archivos incluyen centro, curso y número de propuesta para evitar confusiones entre distintas versiones del horario.</p></div>
    </section>
  </div>
}

function ExportCard({icon,title,description,action,onClick}:{icon:ReactNode;title:string;description:string;action:string;onClick:()=>void}) {
  return <article className="export-card">
    <div className="export-card-icon">{icon}</div>
    <div><h2>{title}</h2><p>{description}</p></div>
    <button className="btn primary" onClick={onClick}><Download size={16}/>{action}</button>
  </article>
}

function fileBase(project:ViyeuticaProject){
  const center=(project.center.name||'Centro').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'')
  return '⩒Yeutika_'+center+'_'+project.academicYear.id
}

function downloadBlob(content:string,name:string,type:string){
  const blob=new Blob([content],{type})
  const url=URL.createObjectURL(blob)
  const anchor=document.createElement('a')
  anchor.href=url
  anchor.download=name
  anchor.click()
  window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}

function csvCell(value:unknown){
  const text=String(value??'')
  return '"'+text.replace(/"/g,'""')+'"'
}

function auditRow(project:ViyeuticaProject,issue:AuditIssue){
  const group=issue.groupId?project.groups.find(item=>item.id===issue.groupId)?.name??'':''
  const subject=issue.subjectId?project.subjects.find(item=>item.id===issue.subjectId)?.name??'':''
  const teacher=issue.teacherId?project.teachers.find(item=>item.id===issue.teacherId)?.name??'':''
  const block=issue.sessionId?project.schedule.blocks.find(item=>item.id===issue.sessionId)?.label??'':''
  return [
    issue.severity==='error'?'Error':issue.severity==='warning'?'Advertencia':'Información',
    issue.category,issue.message,issue.detail??'',group,subject,teacher,
    issue.day?dayLabels[issue.day]:'',block,
  ]
}

function buildWorkbook(project:ViyeuticaProject,run:GenerationRun,issues:AuditIssue[],scope:'groups'|'teachers'|'full'){
  const sheets:string[]=[]
  if(scope!=='teachers'){
    for(const group of project.groups.filter(item=>item.active)){
      sheets.push(workbookSheet(safeSheetName(group.name),scheduleRows(project,run,'group',group.id)))
    }
  }
  if(scope!=='groups'){
    for(const teacher of project.teachers.filter(item=>item.active)){
      sheets.push(workbookSheet(safeSheetName(teacher.name),scheduleRows(project,run,'teacher',teacher.id)))
    }
  }
  if(scope==='full'){
    const auditRows=[
      ['Severidad','Categoría','Código','Mensaje','Detalle','Grupo','Materia','Docente','Día','Sesión'],
      ...issues.map(issue=>auditRow(project,issue)),
    ]
    sheets.push(workbookSheet('Auditoria',auditRows))
  }
  return '<?xml version="1.0" encoding="UTF-8"?>'
    +'<?mso-application progid="Excel.Sheet"?>'
    +'<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
    +'<Styles><Style ss:ID="Default"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style>'
    +'<Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#EAF1F7" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style></Styles>'
    +sheets.join('')
    +'</Workbook>'
}

function workbookSheet(name:string,rows:string[][]){
  return '<Worksheet ss:Name="'+xml(name)+'"><Table>'
    +rows.map((row,rowIndex)=>'<Row>'+row.map(value=>'<Cell ss:StyleID="'+(rowIndex===0?'Header':'Default')+'"><Data ss:Type="String">'+xml(value)+'</Data></Cell>').join('')+'</Row>').join('')
    +'</Table></Worksheet>'
}

function scheduleRows(project:ViyeuticaProject,run:GenerationRun,mode:'group'|'teacher',entityId:string){
  const blocks=project.schedule.blocks.filter(item=>item.active&&item.type==='teaching')
  const rows:string[][]=[['Sesión',...project.schedule.activeDays.map(day=>dayLabels[day])]]
  for(const block of blocks){
    const row=[block.label+' '+block.start+'–'+block.end]
    for(const day of project.schedule.activeDays){
      const entries=run.entries.filter(entry=>entry.day===day&&entry.sessionId===block.id&&(mode==='group'?entry.groupId===entityId:entry.teacherId===entityId))
      if(!entries.length){row.push('');continue}
      if(mode==='group'){
        const subject=project.subjects.find(item=>item.id===entries[0].subjectId)?.name??'Materia'
        const teachers=[...new Set(entries.map(entry=>project.teachers.find(item=>item.id===entry.teacherId)?.name).filter(Boolean))]
        row.push(subject+(teachers.length?' ('+teachers.join(' + ')+')':''))
      }else{
        row.push(entries.map(entry=>{
          const subject=project.subjects.find(item=>item.id===entry.subjectId)?.name??'Materia'
          const group=project.groups.find(item=>item.id===entry.groupId)?.name??'Grupo'
          return subject+' ('+group+')'
        }).join(' + '))
      }
    }
    rows.push(row)
  }
  return rows
}

function safeSheetName(value:string){
  return value.replace(/[\\/?*\[\]:]/g,' ').trim().slice(0,31)||'Hoja'
}

function xml(value:unknown){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
}

function buildPrintableReport(project:ViyeuticaProject,run:GenerationRun,issues:AuditIssue[],proposalNumber:number,official:boolean){
  const groupSections=project.groups.filter(item=>item.active).map(group=>printableSchedule(project,run,'group',group.id,group.name)).join('')
  const teacherSections=project.teachers.filter(item=>item.active).map(teacher=>printableSchedule(project,run,'teacher',teacher.id,teacher.name)).join('')
  const auditRows=issues.length
    ? issues.map(issue=>'<tr><td>'+xml(issue.severity)+'</td><td>'+xml(issue.category)+'</td><td>'+xml(issue.message)+'</td><td>'+xml(issue.detail??'')+'</td></tr>').join('')
    : '<tr><td colspan="4">Sin incidencias</td></tr>'
  return '<!doctype html><html><head><meta charset="utf-8"><title>⩒Yeutika · Propuesta '+proposalNumber+'</title>'
    +'<style>body{font-family:Arial,sans-serif;color:#1e293b;margin:24px}.cover{margin-bottom:28px}.draft{color:#b91c1c;font-weight:800}h1{font-size:24px;margin:0 0 6px}h2{font-size:17px;margin:24px 0 8px}p{font-size:12px}table{width:100%;border-collapse:collapse;margin:8px 0 24px;page-break-inside:avoid}th,td{border:1px solid #cbd5e1;padding:7px;font-size:10px;vertical-align:top}th{background:#edf2f7}.section-break{page-break-before:always}@media print{body{margin:10mm}h2{page-break-after:avoid}}</style>'
    +'</head><body><div class="cover"><h1>'+xml(project.center.name||'⩒Yeutika')+'</h1><p>Curso '+xml(project.academicYear.label)+' · Propuesta '+proposalNumber+'</p>'
    +(official?'':'<p class="draft">BORRADOR · Validaciones con errores</p>')+'</div>'
    +'<h1>Horarios por grupos</h1>'+groupSections
    +'<div class="section-break"><h1>Horarios por docentes</h1></div>'+teacherSections
    +'<div class="section-break"><h1>Validaciones</h1><table><thead><tr><th>Severidad</th><th>Categoría</th><th>Mensaje</th><th>Detalle</th></tr></thead><tbody>'+auditRows+'</tbody></table></div>'
    +'</body></html>'
}

function printableSchedule(project:ViyeuticaProject,run:GenerationRun,mode:'group'|'teacher',entityId:string,title:string){
  const rows=scheduleRows(project,run,mode,entityId)
  return '<section><h2>'+xml(title)+'</h2><table><thead><tr>'+rows[0].map(cell=>'<th>'+xml(cell)+'</th>').join('')+'</tr></thead><tbody>'
    +rows.slice(1).map(row=>'<tr>'+row.map(cell=>'<td>'+xml(cell)+'</td>').join('')+'</tr>').join('')
    +'</tbody></table></section>'
}
