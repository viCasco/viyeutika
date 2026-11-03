import { useRef, useState } from 'react'
import { toBlob } from 'html-to-image'
import { CalendarDays, Check, ClipboardCopy, Eye, Users } from 'lucide-react'
import { AppModal } from '../components/AppModal'
import { coverageState } from '../domain/substitutionCoverage'
import type { SubstitutionRecord, ViyeuticaProject, Weekday } from '../domain/project'

const days:Record<Weekday,string>={L:'Lunes',M:'Martes',X:'Miércoles',J:'Jueves',V:'Viernes',S:'Sábado'}

function teacherName(project:ViyeuticaProject,id:string){
  return project.teachers.find(teacher=>teacher.id===id)?.name??'Docente no encontrado'
}

export function substitutionsForDay(project:ViyeuticaProject,date:string){
  return (project.substitutionRecords??[])
    .filter(record=>record.date===date)
    .sort((a,b)=>{
      const blocks=project.schedule.blocks
      return blocks.findIndex(block=>block.id===a.sessionId)-blocks.findIndex(block=>block.id===b.sessionId)
        ||teacherName(project,a.substituteTeacherId).localeCompare(teacherName(project,b.substituteTeacherId),'es')
    })
}

export function DailySubstitutionsDialog({project,day,date,onClose}:{
  project:ViyeuticaProject
  day:Weekday
  date:string
  onClose:()=>void
}){
  const captureRef=useRef<HTMLDivElement>(null)
  const [copyStatus,setCopyStatus]=useState<'idle'|'copying'|'success'|'error'>('idle')
  const [copyError,setCopyError]=useState('')
  const copyCapture=async()=>{
    const modal=captureRef.current?.closest<HTMLElement>('.app-modal')
    const body=modal?.querySelector<HTMLElement>('.app-modal-body')
    if(!modal||!body)return
    if(!window.isSecureContext||!navigator.clipboard?.write||typeof ClipboardItem==='undefined'){
      setCopyStatus('error')
      setCopyError('Este navegador no permite copiar imágenes. Abre la web mediante HTTPS y utiliza un navegador compatible.')
      return
    }
    setCopyStatus('copying')
    setCopyError('')
    // Temporarily expand the actual scroll container, not an offscreen clone.
    // html-to-image otherwise only captures the visible part of .app-modal-body.
    const oldModalStyle=modal.getAttribute('style')
    const oldBodyStyle=body.getAttribute('style')
    const restore=()=>{
      if(oldModalStyle===null)modal.removeAttribute('style')
      else modal.setAttribute('style',oldModalStyle)
      if(oldBodyStyle===null)body.removeAttribute('style')
      else body.setAttribute('style',oldBodyStyle)
    }
    const createImage=async()=>{
      try{
        Object.assign(modal.style,{
          width:'1200px',maxWidth:'none',maxHeight:'none',height:'auto',
          overflow:'visible',boxShadow:'none',borderRadius:'18px',backgroundColor:'#ffffff',
        })
        Object.assign(body.style,{
          maxHeight:'none',height:'auto',overflow:'visible',backgroundColor:'#ffffff',
        })
        // Force layout before rasterization so every session is in the DOM image.
        void body.scrollHeight
        const blob=await toBlob(modal,{
          backgroundColor:'#ffffff',
          pixelRatio:2,
          cacheBust:true,
          filter:node=>{
            if(!(node instanceof Element))return true
            return !['modal-close','app-modal-footer','daily-substitutions-status','daily-substitutions-footer']
              .some(name=>node.classList.contains(name))
          },
          style:{maxHeight:'none',height:'auto',overflow:'visible',backgroundColor:'#ffffff'},
        })
        if(!blob||blob.size<2000)throw new Error('No se pudo generar una captura válida.')
        return blob
      }finally{
        restore()
      }
    }
    try{
      // Pass a promise to ClipboardItem immediately, preserving click activation.
      await navigator.clipboard.write([new ClipboardItem({'image/png':createImage()})])
      setCopyStatus('success')
    }catch(error){
      setCopyStatus('error')
      setCopyError(error instanceof Error?error.message:'No se pudo copiar la captura al portapapeles.')
    }
  }
  const sessions=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
    .sort((a,b)=>a.start.localeCompare(b.start))
  const records=substitutionsForDay(project,date)
  const planned=records.filter(record=>coverageState(project,record)==='planned').length
  const completed=records.filter(record=>record.status==='completed').length
  const pending=records.filter(record=>coverageState(project,record)==='needs_reassignment').length
  const review=records.filter(record=>coverageState(project,record)==='review_completed').length
  const title=days[day]+' · '+new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'})
    .format(new Date(date+'T12:00:00Z'))

  const locationFor=(record:SubstitutionRecord)=>{
    const group=project.groups.find(item=>item.id===record.groupId)
    const assignment=project.assignments.find(item=>item.id===record.assignmentId)
    const space=project.spaces.find(item=>item.id===assignment?.spaceId)
    return {group:group?.name??'Grupo no encontrado',room:space?.name||group?.classroom||'Aula no indicada',
      subject:project.subjects.find(item=>item.id===assignment?.subjectId)?.name??'Materia no encontrada'}
  }

  const renderReport=()=> <>
      <div className="daily-substitutions-intro">
        <div><strong>⩒Yeutika · Cuadrante diario de sustituciones</strong><p><CalendarDays size={14}/>{title}</p></div>
        <span>{records.length} {records.length===1?'cobertura':'coberturas'} · {planned} previstas · {completed} realizadas{pending>0?' · '+pending+' sin cobertura':''}{review>0?' · '+review+' a revisar':''}</span>
      </div>
      <div className="daily-substitutions-grid">
        {sessions.map(session=>{
          const matching=records.filter(record=>record.sessionId===session.id)
          return <section key={session.id} className={'daily-substitutions-session '+(!matching.length?'is-empty':'')}>
            <header className="daily-substitutions-session-header">
              <strong>{session.label}</strong><span>{session.start}–{session.end}</span>
              <small>{matching.length?matching.length+' '+(matching.length===1?'cobertura':'coberturas'):'Sin sustituciones'}</small>
            </header>
            {matching.length?<div className="daily-substitutions-items">
              {matching.map(record=>{
                const place=locationFor(record)
                const state=coverageState(project,record)
                return <article className={'daily-substitutions-item '+(state==='needs_reassignment'?'has-conflict':'')} key={record.id}>
                  <div className="daily-substitutions-names">
                    <div><span>{state==='needs_reassignment'?'Asignación anterior':'Sustituye'}</span>
                      <strong>{teacherName(project,record.substituteTeacherId)}</strong></div>
                    <div><span>Docente ausente</span><strong>{teacherName(project,record.absentTeacherId)}</strong></div>
                  </div>
                  <p><Users size={13}/> <strong>{place.group}</strong> · {place.subject}</p>
                  <p><strong>Aula:</strong> {place.room}</p>
                  {record.coverageType==='co_teacher'&&<p>Permanece el codocente del grupo.</p>}
                  {record.notes&&<p><strong>Observaciones:</strong> {record.notes}</p>}
                  {state==='needs_reassignment'&&<p className="daily-substitutions-alert">SIN COBERTURA · Pendiente de reasignación. El responsable anterior está ausente.</p>}
                  {state==='review_completed'&&<p className="daily-substitutions-alert">REVISAR HISTÓRICO · Consta una ausencia del responsable de esta cobertura ya confirmada.</p>}
                  <span className={'daily-substitutions-status '+record.status}>{state==='needs_reassignment'?'Pendiente de reasignación':state==='review_completed'?'Revisar histórico':record.status==='completed'?'Realizada':'Prevista'}</span>
                </article>
              })}
            </div>:<p className="daily-substitutions-no-cover">No se han registrado coberturas para esta sesión.</p>}
          </section>
        })}
      </div>
      <p className="daily-substitutions-footer">Información del registro de ⩒Yeutika para la fecha indicada. Las coberturas previstas están pendientes de confirmación.</p>
  </>

  return <AppModal title={'Coberturas · '+title} icon={<Eye size={19}/>} onClose={onClose} wide
    footer={<div className="daily-substitutions-footer-actions">
      <div className="daily-substitutions-copy-feedback" role="status" aria-live="polite">
        {copyStatus==='success'?'Captura copiada. Pégala en WhatsApp o en un mensaje.':copyStatus==='error'?copyError:''}
      </div>
      <button type="button" className="btn ghost-inline" onClick={copyCapture} disabled={copyStatus==='copying'}>
        {copyStatus==='success'?<Check size={16}/>:<ClipboardCopy size={16}/>}
        {copyStatus==='copying'?'Copiando…':copyStatus==='success'?'Copiada':'Copiar captura'}
      </button>
      <button type="button" className="btn primary" onClick={onClose}>Cerrar</button>
    </div>}>
    <div ref={captureRef} className="daily-substitutions-capture">{renderReport()}</div>
  </AppModal>
}
