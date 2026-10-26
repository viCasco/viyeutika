import { useMemo, useState } from 'react'
import { CheckCircle2, History, LockKeyhole, Publish, UsersRound } from 'lucide-react'
import type { CollaborationRole, ViyeuticaProject } from '../domain/project'
import { can, publishEstablishedSchedule, restorePublicationVersion, visiblePublishedRun } from '../domain/collaboration'
import { saveProject } from '../store/projectStorage'

const roleLabels:Record<CollaborationRole,string>={
  direction:'Dirección',
  head:'Jefatura de estudios',
  teacher:'Docente',
}

export function PublicationPage({project}:{project:ViyeuticaProject}){
  const [label,setLabel]=useState('')
  const run=visiblePublishedRun(project)
  const role=project.collaboration.localRole
  const selectedTeacher=project.collaboration.teacherId??project.teachers.find(item=>item.active)?.id??null
  const teacherEntries=useMemo(
    ()=>run&&selectedTeacher?run.entries.filter(entry=>entry.teacherId===selectedTeacher):[],
    [run,selectedTeacher],
  )

  const setRole=(value:CollaborationRole)=>{
    saveProject({
      ...project,
      collaboration:{
        ...project.collaboration,
        localRole:value,
        teacherId:value==='teacher'?(project.collaboration.teacherId??project.teachers.find(item=>item.active)?.id??null):project.collaboration.teacherId,
      },
    },{intent:'replace_project'})
  }

  const setTeacher=(teacherId:string)=>{
    saveProject({...project,collaboration:{...project.collaboration,teacherId:teacherId||null}},{intent:'replace_project'})
  }

  const publish=()=>{
    if(!can(role,'publish')||!project.establishedScheduleRun)return
    saveProject(publishEstablishedSchedule(project,label),{intent:'replace_project'})
    setLabel('')
  }

  const restore=(versionId:string)=>{
    if(!can(role,'publish'))return
    saveProject(restorePublicationVersion(project,versionId),{intent:'replace_project'})
  }

  const unpublish=()=>{
    if(!can(role,'publish'))return
    saveProject({
      ...project,
      collaboration:{...project.collaboration,publicationStatus:'draft',publishedRun:null,publishedAt:null},
    },{intent:'replace_project'})
  }

  return <div className="wizard-page publication-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><Publish size={28}/> Publicación y colaboración</h1>
        <p>Prepara roles, publicación controlada e historial de versiones. La colaboración multiusuario segura quedará habilitada cuando exista backend y autenticación.</p>
      </div>
    </section>

    <section className="collaboration-backend-notice">
      <LockKeyhole size={20}/>
      <div><strong>Modo local preparatorio</strong><p>Los roles de esta pantalla sirven para validar permisos y flujos, pero no constituyen autenticación real. Los datos siguen guardándose en este navegador y no se comparten con otros usuarios.</p></div>
    </section>

    <section className="collaboration-role-card">
      <div><span className="panel-kicker">Rol de prueba</span><h2>Permisos de la sesión local</h2></div>
      <div className="collaboration-role-buttons">
        {(Object.keys(roleLabels) as CollaborationRole[]).map(value=><button type="button" key={value} className={role===value?'active':''} onClick={()=>setRole(value)}>{roleLabels[value]}</button>)}
      </div>
      <div className="collaboration-permissions">
        <span>{can(role,'view_all')?'Puede consultar todos los horarios':'Solo consulta su propio horario'}</span>
        <span>{can(role,'generate')?'Puede generar propuestas':'No puede generar propuestas'}</span>
        <span>{can(role,'publish')?'Puede publicar versiones':'No puede publicar versiones'}</span>
      </div>
    </section>

    {role==='teacher'&&<section className="teacher-publication-card">
      <div className="groups-table-heading"><div><span className="panel-kicker">Vista docente</span><h2>Horario autorizado</h2></div>
        <select value={selectedTeacher??''} onChange={e=>setTeacher(e.target.value)}>
          {project.teachers.filter(item=>item.active).map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        </select>
      </div>
      {!run?<div className="groups-empty"><UsersRound size={28}/><strong>No hay horario publicado</strong><p>Dirección o Jefatura debe publicar primero una versión.</p></div>
        : <div className="groups-table-wrap"><table className="groups-table">
          <thead><tr><th>Día</th><th>Sesión</th><th>Grupo</th><th>Materia</th></tr></thead>
          <tbody>{teacherEntries.map(entry=><tr key={entry.id}>
            <td>{entry.day}</td>
            <td>{project.schedule.blocks.find(block=>block.id===entry.sessionId)?.label??entry.sessionId}</td>
            <td>{project.groups.find(group=>group.id===entry.groupId)?.name??'—'}</td>
            <td>{project.subjects.find(subject=>subject.id===entry.subjectId)?.name??'—'}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>}

    {role!=='teacher'&&<section className="publication-control-card">
      <div className="groups-table-heading">
        <div><span className="panel-kicker">Publicación</span><h2>Horario del curso</h2><p>Publicar crea una copia versionada del horario establecido; el original no se modifica.</p></div>
        <span className={'publication-status '+project.collaboration.publicationStatus}>{project.collaboration.publicationStatus==='published'?'Publicado':'Borrador'}</span>
      </div>
      <div className="publication-actions">
        <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Etiqueta de versión, opcional"/>
        <button className="btn primary" disabled={!project.establishedScheduleRun||!can(role,'publish')} onClick={publish}><Publish size={16}/> Publicar horario establecido</button>
        {project.collaboration.publicationStatus==='published'&&<button className="btn secondary-light" onClick={unpublish}>Retirar publicación</button>}
      </div>
      {!project.establishedScheduleRun&&<div className="inline-error">Primero guarda una propuesta válida como horario establecido.</div>}
    </section>}

    <section className="groups-table-card">
      <div className="groups-table-heading"><div><span className="panel-kicker">Versiones</span><h2>Historial de publicaciones</h2></div><History size={20}/></div>
      {project.collaboration.versions.length===0
        ? <div className="groups-empty"><History size={28}/><strong>Sin versiones publicadas</strong><p>La primera publicación aparecerá aquí y podrá restaurarse sin borrar las demás.</p></div>
        : <div className="groups-table-wrap"><table className="groups-table">
          <thead><tr><th>Versión</th><th>Fecha</th><th>Rol</th><th>Sesiones</th><th/></tr></thead>
          <tbody>{[...project.collaboration.versions].reverse().map(version=><tr key={version.id}>
            <td><strong>{version.label}</strong></td>
            <td>{new Date(version.createdAt).toLocaleString('es-ES')}</td>
            <td>{roleLabels[version.role]}</td>
            <td>{version.run.placedSessions}/{version.run.requestedSessions}</td>
            <td>{can(role,'publish')&&<button className="btn ghost-inline" onClick={()=>restore(version.id)}><CheckCircle2 size={14}/> Restaurar publicación</button>}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </div>
}
