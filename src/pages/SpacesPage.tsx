import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, ChevronDown, Clock3, Plus, Trash2 } from 'lucide-react'
import { DataViewControls, type DataView } from '../components/DataCollectionView'
import { AppModal } from '../components/AppModal'
import type { BuildingTravelTime, SchoolSpace, SpaceAvailability, ViyeuticaProject, Weekday } from '../domain/project'
import { saveProject } from '../store/projectStorage'

const uid=()=> 'space_'+crypto.randomUUID()
const dayLabels:Record<Weekday,string>={L:'Lunes',M:'Martes',X:'Miércoles',J:'Jueves',V:'Viernes',S:'Sábado'}
const dayOrder:Record<Weekday,number>={L:0,M:1,X:2,J:3,V:4,S:5}

type SpaceModal='space'|'availability'|'travel'|null
type SortDirection='asc'|'desc'
type SortState<K extends string>={key:K|null;direction:SortDirection}

function compareText(a:string,b:string){return a.localeCompare(b,'es',{numeric:true,sensitivity:'base'})}
function nextSort<K extends string>(current:SortState<K>,key:K):SortState<K>{
  if(current.key!==key)return {key,direction:'asc'}
  if(current.direction==='asc')return {key,direction:'desc'}
  return {key:null,direction:'asc'}
}

export function SpacesPage({
  project,
  navigate,
  embedded=false,
}:{
  project:ViyeuticaProject
  navigate:(path:string)=>void
  embedded?:boolean
}){
  const [name,setName]=useState('')
  const [type,setType]=useState('')
  const [building,setBuilding]=useState('')
  const [capacity,setCapacity]=useState('')
  const [shared,setShared]=useState(false)
  const [travelFrom,setTravelFrom]=useState('')
  const [travelTo,setTravelTo]=useState('')
  const [travelMinutes,setTravelMinutes]=useState('')
  const [availabilitySpaceId,setAvailabilitySpaceId]=useState(project.spaces.find(space=>space.active)?.id??'')
  const [availabilityDay,setAvailabilityDay]=useState<Weekday>(project.schedule.activeDays[0]??'L')
  const [availabilitySession,setAvailabilitySession]=useState(project.schedule.blocks.find(block=>block.active&&block.type==='teaching')?.id??'')
  const [modal,setModal]=useState<SpaceModal>(null)

  const [spacesExpanded,setSpacesExpanded]=useState(false)
  const [assignmentsExpanded,setAssignmentsExpanded]=useState(false)
  const [availabilityExpanded,setAvailabilityExpanded]=useState(false)
  const [travelExpanded,setTravelExpanded]=useState(false)
  const [spacesView,setSpacesView]=useState<DataView>('table')
  const [reservationsView,setReservationsView]=useState<DataView>('table')
  const [availabilityView,setAvailabilityView]=useState<DataView>('table')
  const [travelView,setTravelView]=useState<DataView>('table')

  const [groupFilter,setGroupFilter]=useState('all')
  const [subjectFilter,setSubjectFilter]=useState('all')
  const [teacherFilter,setTeacherFilter]=useState('all')
  const [reservationFilterView,setReservationFilterView]=useState<'group'|'subject'|'teacher'>('group')

  const [spaceSort,setSpaceSort]=useState<SortState<'name'|'type'|'building'|'capacity'|'shared'>>({key:null,direction:'asc'})
  const [assignmentSort,setAssignmentSort]=useState<SortState<'group'|'subject'|'teacher'|'space'>>({key:null,direction:'asc'})
  const [availabilitySort,setAvailabilitySort]=useState<SortState<'space'|'day'|'session'>>({key:null,direction:'asc'})
  const [travelSort,setTravelSort]=useState<SortState<'from'|'to'|'minutes'>>({key:null,direction:'asc'})

  const buildings=[...new Set(project.spaces.map(space=>space.building).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))
  const activeGroups=project.groups.filter(item=>item.active)
  const activeSubjects=project.subjects.filter(item=>item.active)
  const activeTeachers=project.teachers.filter(item=>item.active)

  const sortedSpaces=useMemo(()=>{
    const sortKey=spaceSort.key
    if(!sortKey)return project.spaces
    return [...project.spaces].sort((a,b)=>{
      let result=0
      if(sortKey==='capacity')result=(a.capacity??-1)-(b.capacity??-1)
      else if(sortKey==='shared')result=Number(a.shared)-Number(b.shared)
      else result=compareText(String(a[sortKey]??''),String(b[sortKey]??''))
      return spaceSort.direction==='asc'?result:-result
    })
  },[project.spaces,spaceSort])

  const assignmentRows=useMemo(()=>project.assignments.filter(item=>item.active).map(assignment=>({
    assignment,
    group:project.groups.find(item=>item.id===assignment.groupId),
    subject:project.subjects.find(item=>item.id===assignment.subjectId),
    teacher:project.teachers.find(item=>item.id===assignment.teacherId),
    space:project.spaces.find(item=>item.id===assignment.spaceId),
  })).filter(row=>
    (groupFilter==='all'||row.assignment.groupId===groupFilter)&&
    (subjectFilter==='all'||row.assignment.subjectId===subjectFilter)&&
    (teacherFilter==='all'||row.assignment.teacherId===teacherFilter)
  ),[project.assignments,project.groups,project.subjects,project.teachers,project.spaces,groupFilter,subjectFilter,teacherFilter])
  const sortedAssignmentRows=useMemo(()=>{
    if(!assignmentSort.key)return assignmentRows
    return [...assignmentRows].sort((a,b)=>{
    const av=assignmentSort.key==='group'?a.group?.name??''
      :assignmentSort.key==='subject'?a.subject?.name??''
      :assignmentSort.key==='teacher'?a.teacher?.name??''
      :a.space?.name??''
    const bv=assignmentSort.key==='group'?b.group?.name??''
      :assignmentSort.key==='subject'?b.subject?.name??''
      :assignmentSort.key==='teacher'?b.teacher?.name??''
      :b.space?.name??''
    const result=compareText(av,bv)
      return assignmentSort.direction==='asc'?result:-result
    })
  },[assignmentRows,assignmentSort])

  const sortedAvailability=useMemo(()=>{
    if(!availabilitySort.key)return project.spaceAvailability
    return [...project.spaceAvailability].sort((a,b)=>{
    let result=0
    if(availabilitySort.key==='space'){
      result=compareText(
        project.spaces.find(space=>space.id===a.spaceId)?.name??'',
        project.spaces.find(space=>space.id===b.spaceId)?.name??''
      )
    }else if(availabilitySort.key==='day'){
      result=dayOrder[a.day]-dayOrder[b.day]
    }else{
      const aBlock=project.schedule.blocks.find(block=>block.id===a.sessionId)
      const bBlock=project.schedule.blocks.find(block=>block.id===b.sessionId)
      result=compareText(aBlock?.start??aBlock?.label??a.sessionId,bBlock?.start??bBlock?.label??b.sessionId)
    }
      return availabilitySort.direction==='asc'?result:-result
    })
  },[project.spaceAvailability,project.spaces,project.schedule.blocks,availabilitySort])

  const sortedTravel=useMemo(()=>{
    if(!travelSort.key)return project.buildingTravelTimes
    return [...project.buildingTravelTimes].sort((a,b)=>{
    const result=travelSort.key==='minutes'
      ? a.minutes-b.minutes
      : compareText(travelSort.key==='from'?a.fromBuilding:a.toBuilding,travelSort.key==='from'?b.fromBuilding:b.toBuilding)
      return travelSort.direction==='asc'?result:-result
    })
  },[project.buildingTravelTimes,travelSort])

  const closeModal=()=>setModal(null)

  const addSpace=()=>{
    if(!name.trim()||!type.trim()||!building.trim())return
    const space:SchoolSpace={
      id:uid(),name:name.trim(),type:type.trim(),building:building.trim(),
      capacity:capacity?Math.max(0,Number(capacity)):null,shared,active:true,
    }
    saveProject({...project,spaces:[...project.spaces,space]})
    setName('');setType('');setBuilding('');setCapacity('');setShared(false)
    if(!availabilitySpaceId)setAvailabilitySpaceId(space.id)
    closeModal()
  }

  const removeSpace=(id:string)=>{
    saveProject({
      ...project,
      spaces:project.spaces.filter(space=>space.id!==id),
      spaceAvailability:project.spaceAvailability.filter(item=>item.spaceId!==id),
      assignments:project.assignments.map(item=>item.spaceId===id?{...item,spaceId:null}:item),
    })
  }

  const assignSpace=(assignmentId:string,spaceId:string)=>{
    saveProject({
      ...project,
      assignments:project.assignments.map(item=>item.id===assignmentId?{...item,spaceId:spaceId||null}:item),
    })
  }

  const addAvailability=()=>{
    if(!availabilitySpaceId||!availabilitySession)return
    const filtered=project.spaceAvailability.filter(item=>!(
      item.spaceId===availabilitySpaceId&&item.day===availabilityDay&&item.sessionId===availabilitySession
    ))
    const next:SpaceAvailability={
      spaceId:availabilitySpaceId,day:availabilityDay,sessionId:availabilitySession,status:'unavailable',detail:'',
    }
    saveProject({...project,spaceAvailability:[...filtered,next]})
    closeModal()
  }

  const removeAvailability=(item:SpaceAvailability)=>{
    saveProject({...project,spaceAvailability:project.spaceAvailability.filter(current=>current!==item)})
  }

  const addTravel=()=>{
    const minutes=Number(travelMinutes)
    if(!travelFrom||!travelTo||travelFrom===travelTo||!Number.isFinite(minutes)||minutes<0)return
    const filtered=project.buildingTravelTimes.filter(item=>!(
      (item.fromBuilding===travelFrom&&item.toBuilding===travelTo)||
      (item.fromBuilding===travelTo&&item.toBuilding===travelFrom)
    ))
    const next:BuildingTravelTime={fromBuilding:travelFrom,toBuilding:travelTo,minutes}
    saveProject({...project,buildingTravelTimes:[...filtered,next]})
    setTravelMinutes('')
    closeModal()
  }

  return <div className={embedded?'spaces-page embedded':'wizard-page spaces-page'}>
    {!embedded&&<section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><Building2 size={28}/> Espacios y desplazamientos</h1>
        <p>Modela aulas, instalaciones, edificios, disponibilidad y tiempos de desplazamiento. Las reservas incompatibles se validan junto con docentes y grupos.</p>
      </div>
    </section>}

    {modal==='space'&&<AppModal
      title="Añadir espacio"
      icon={<Building2 size={20}/>}
      onClose={closeModal}
      footer={<>
        <button type="button" className="btn ghost-inline" onClick={closeModal}>Cancelar</button>
        <button type="button" className="btn primary" disabled={!name.trim()||!type.trim()||!building.trim()} onClick={addSpace}>Aceptar</button>
      </>}
    >
      <div className="form-grid two">
        <label className="form-field"><span>Nombre</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Gimnasio"/></label>
        <label className="form-field"><span>Tipo</span><input value={type} onChange={e=>setType(e.target.value)} placeholder="Gimnasio, aula, laboratorio..."/></label>
        <label className="form-field"><span>Edificio</span><input value={building} onChange={e=>setBuilding(e.target.value)} placeholder="Principal"/></label>
        <label className="form-field"><span>Capacidad</span><input type="number" min="0" value={capacity} onChange={e=>setCapacity(e.target.value)} placeholder="Opcional"/></label>
      </div>
      <label className="checkbox-field"><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/><span><strong>Uso compartido permitido</strong><small>Solo actívalo si varias actividades pueden usar simultáneamente el recurso sin conflicto.</small></span></label>
    </AppModal>}

    {modal==='availability'&&<AppModal
      title="Añadir bloqueo de disponibilidad"
      icon={<Clock3 size={20}/>}
      onClose={closeModal}
      footer={<>
        <button type="button" className="btn ghost-inline" onClick={closeModal}>Cancelar</button>
        <button type="button" className="btn primary" disabled={!availabilitySpaceId||!availabilitySession} onClick={addAvailability}>Aceptar</button>
      </>}
    >
      <div className="form-grid three">
        <label className="form-field"><span>Espacio</span><select value={availabilitySpaceId} onChange={e=>setAvailabilitySpaceId(e.target.value)}><option value="">Selecciona...</option>{project.spaces.filter(space=>space.active).map(space=><option key={space.id} value={space.id}>{space.name}</option>)}</select></label>
        <label className="form-field"><span>Día</span><select value={availabilityDay} onChange={e=>setAvailabilityDay(e.target.value as Weekday)}>{project.schedule.activeDays.map(day=><option key={day} value={day}>{dayLabels[day]}</option>)}</select></label>
        <label className="form-field"><span>Sesión</span><select value={availabilitySession} onChange={e=>setAvailabilitySession(e.target.value)}><option value="">Selecciona...</option>{project.schedule.blocks.filter(block=>block.active&&block.type==='teaching').map(block=><option key={block.id} value={block.id}>{block.label}</option>)}</select></label>
      </div>
    </AppModal>}

    {modal==='travel'&&<AppModal
      title="Añadir tiempo de desplazamiento"
      icon={<Building2 size={20}/>}
      onClose={closeModal}
      footer={<>
        <button type="button" className="btn ghost-inline" onClick={closeModal}>Cancelar</button>
        <button type="button" className="btn primary" disabled={!travelFrom||!travelTo||travelFrom===travelTo||travelMinutes===''||Number(travelMinutes)<0} onClick={addTravel}>Aceptar</button>
      </>}
    >
      <div className="form-grid three">
        <label className="form-field"><span>Origen</span><select value={travelFrom} onChange={e=>setTravelFrom(e.target.value)}><option value="">Selecciona...</option>{buildings.map(value=><option key={value}>{value}</option>)}</select></label>
        <label className="form-field"><span>Destino</span><select value={travelTo} onChange={e=>setTravelTo(e.target.value)}><option value="">Selecciona...</option>{buildings.map(value=><option key={value}>{value}</option>)}</select></label>
        <label className="form-field"><span>Minutos</span><input type="number" min="0" value={travelMinutes} onChange={e=>setTravelMinutes(e.target.value)}/></label>
      </div>
    </AppModal>}

    <section className={'groups-table-card study-collapsible-card '+(spacesExpanded?'is-expanded':'is-collapsed')}>
      <div className="groups-table-heading study-collapsible-heading">
        <button type="button" className="availability-collapse-toggle" onClick={()=>setSpacesExpanded(value=>!value)} aria-expanded={spacesExpanded} aria-label={spacesExpanded?'Plegar espacios':'Desplegar espacios'}><ChevronDown size={17}/></button>
        <div className="availability-heading-copy"><span className="panel-kicker">Inventario</span><h2>Espacios <span className="availability-count">{project.spaces.length}</span></h2></div>
        <div className="groups-table-actions">
          <DataViewControls view={spacesView} onView={setSpacesView} sort={spaceSort} onSort={setSpaceSort} options={[
            {key:'name',label:'Espacio'},{key:'type',label:'Tipo'},{key:'building',label:'Edificio'},{key:'capacity',label:'Capacidad'},{key:'shared',label:'Compartido'},
          ]}/>
          <button className="btn ghost-inline" onClick={()=>setModal('space')}><Plus size={16}/> Añadir espacio</button>
        </div>
      </div>
      {spacesExpanded&&<div className="study-collapsible-content">
        {project.spaces.length===0
          ? <div className="groups-empty"><Building2 size={28}/><strong>No hay espacios configurados</strong><p>Añade solo los recursos que necesiten reserva o tengan restricciones de horario.</p></div>
          : spacesView==='table' ? <div className="groups-table-wrap"><table className="groups-table sortable-table">
            <thead><tr>
              <SortHeader label="Espacio" sortKey="name" state={spaceSort} onSort={key=>setSpaceSort(nextSort(spaceSort,key))}/>
              <SortHeader label="Tipo" sortKey="type" state={spaceSort} onSort={key=>setSpaceSort(nextSort(spaceSort,key))}/>
              <SortHeader label="Edificio" sortKey="building" state={spaceSort} onSort={key=>setSpaceSort(nextSort(spaceSort,key))}/>
              <SortHeader label="Capacidad" sortKey="capacity" state={spaceSort} onSort={key=>setSpaceSort(nextSort(spaceSort,key))}/>
              <SortHeader label="Compartido" sortKey="shared" state={spaceSort} onSort={key=>setSpaceSort(nextSort(spaceSort,key))}/>
              <th/>
            </tr></thead>
            <tbody>{sortedSpaces.map(space=><tr key={space.id}><td><strong>{space.name}</strong></td><td>{space.type}</td><td>{space.building}</td><td>{space.capacity??'—'}</td><td>{space.shared?'Sí':'No'}</td><td><button className="row-delete" onClick={()=>removeSpace(space.id)}><Trash2 size={15}/></button></td></tr>)}</tbody>
          </table></div> : <div className="data-card-grid">{sortedSpaces.map(space=><article className="data-record-card" key={space.id}>
            <div className="data-record-card-heading"><div><strong>{space.name}</strong><small>{space.type} · {space.building}</small></div><span className="tag">{space.shared?'Compartido':'Exclusivo'}</span></div>
            <div className="data-record-card-data"><div><span>Capacidad</span><strong>{space.capacity??'—'}</strong></div><div><span>Edificio</span><strong>{space.building}</strong></div></div>
            <div className="data-record-card-footer"><span/><button className="row-delete" title="Eliminar" onClick={()=>removeSpace(space.id)}><Trash2 size={15}/></button></div>
          </article>)}</div>}
      </div>}
    </section>

    <section className={'groups-table-card study-collapsible-card '+(assignmentsExpanded?'is-expanded':'is-collapsed')}>
      <div className="groups-table-heading study-collapsible-heading">
        <button type="button" className="availability-collapse-toggle" onClick={()=>setAssignmentsExpanded(value=>!value)} aria-expanded={assignmentsExpanded} aria-label={assignmentsExpanded?'Plegar reservas':'Desplegar reservas'}><ChevronDown size={17}/></button>
        <div className="availability-heading-copy"><span className="panel-kicker">Asignaciones</span><h2>Reserva por actividad <span className="availability-count">{project.assignments.filter(item=>item.active).length}</span></h2></div>
        <div className="groups-table-actions">
          <DataViewControls view={reservationsView} onView={setReservationsView} sort={assignmentSort} onSort={setAssignmentSort} options={[
            {key:'group',label:'Grupo'},{key:'subject',label:'Materia'},{key:'teacher',label:'Docente'},{key:'space',label:'Espacio'},
          ]}/>
          <button className="btn ghost-inline" onClick={()=>navigate('/asignaciones')}>Ir a Asignaciones</button>
        </div>
      </div>
      {assignmentsExpanded&&<div className="study-collapsible-content">
        {project.assignments.filter(item=>item.active).length>0&&<div className="generation-toolbar generation-view-toolbar">
          <div className="generation-filter-stack">
            <span className="panel-kicker">Filtro</span>
            <div className="generation-view-switch">
              <button type="button" className={reservationFilterView==='group'?'active':''} onClick={()=>{setReservationFilterView('group');setSubjectFilter('all');setTeacherFilter('all')}}>Por grupo</button>
              <button type="button" className={reservationFilterView==='subject'?'active':''} onClick={()=>{setReservationFilterView('subject');setGroupFilter('all');setTeacherFilter('all')}}>Por materia</button>
              <button type="button" className={reservationFilterView==='teacher'?'active':''} onClick={()=>{setReservationFilterView('teacher');setGroupFilter('all');setSubjectFilter('all')}}>Por docente</button>
            </div>
            {reservationFilterView==='group'&&<div className="generation-group-tags">
              <button type="button" className={groupFilter==='all'?'active':''} onClick={()=>setGroupFilter('all')}>Todos</button>
              {activeGroups.map(group=><button type="button" key={group.id} className={groupFilter===group.id?'active':''} onClick={()=>setGroupFilter(group.id)}>{group.name}</button>)}
            </div>}
            {reservationFilterView==='subject'&&<div className="generation-group-tags">
              <button type="button" className={subjectFilter==='all'?'active':''} onClick={()=>setSubjectFilter('all')}>Todas</button>
              {activeSubjects.map(subject=><button type="button" key={subject.id} className={subjectFilter===subject.id?'active':''} onClick={()=>setSubjectFilter(subject.id)}>{subject.name}</button>)}
            </div>}
            {reservationFilterView==='teacher'&&<div className="generation-group-tags">
              <button type="button" className={teacherFilter==='all'?'active':''} onClick={()=>setTeacherFilter('all')}>Todos</button>
              {activeTeachers.map(teacher=><button type="button" key={teacher.id} className={teacherFilter===teacher.id?'active':''} onClick={()=>setTeacherFilter(teacher.id)}>{teacher.name}</button>)}
            </div>}
          </div>
        </div>}
        {project.assignments.filter(item=>item.active).length===0
          ? <div className="groups-empty"><Building2 size={28}/><strong>No hay asignaciones activas</strong><p>Configura primero las asignaciones docentes del curso.</p></div>
          : assignmentRows.length===0
            ? <div className="groups-empty"><Building2 size={28}/><strong>Sin resultados para estos filtros</strong><p>Cambia alguno de los filtros de grupo, materia o docente.</p></div>
            : reservationsView==='table' ? <div className="groups-table-wrap"><table className="groups-table sortable-table">
              <thead><tr>
                <SortHeader label="Grupo" sortKey="group" state={assignmentSort} onSort={key=>setAssignmentSort(nextSort(assignmentSort,key))}/>
                <SortHeader label="Materia" sortKey="subject" state={assignmentSort} onSort={key=>setAssignmentSort(nextSort(assignmentSort,key))}/>
                <SortHeader label="Docente" sortKey="teacher" state={assignmentSort} onSort={key=>setAssignmentSort(nextSort(assignmentSort,key))}/>
                <SortHeader label="Espacio" sortKey="space" state={assignmentSort} onSort={key=>setAssignmentSort(nextSort(assignmentSort,key))}/>
              </tr></thead>
              <tbody>{sortedAssignmentRows.map(({assignment,group,subject,teacher})=><tr key={assignment.id}>
                <td>{group?.name??'—'}</td>
                <td>{subject?.name??'—'}</td>
                <td>{teacher?.name??'—'}</td>
                <td><select value={assignment.spaceId??''} onChange={e=>assignSpace(assignment.id,e.target.value)}><option value="">Sin espacio fijo</option>{project.spaces.filter(space=>space.active).map(space=><option key={space.id} value={space.id}>{space.name} · {space.building}</option>)}</select></td>
              </tr>)}</tbody>
            </table></div> : <div className="data-card-grid">{sortedAssignmentRows.map(({assignment,group,subject,teacher,space})=><article className="data-record-card" key={assignment.id}>
              <div className="data-record-card-heading"><div><strong>{group?.name??'—'} · {subject?.name??'—'}</strong><small>{teacher?.name??'—'}</small></div></div>
              <div className="data-record-card-data"><div><span>Espacio</span><strong>{space?.name??'Sin espacio fijo'}</strong></div></div>
              <div className="data-record-card-footer"><span/><select value={assignment.spaceId??''} onChange={e=>assignSpace(assignment.id,e.target.value)}><option value="">Sin espacio fijo</option>{project.spaces.filter(space=>space.active).map(space=><option key={space.id} value={space.id}>{space.name} · {space.building}</option>)}</select></div>
            </article>)}</div>}
      </div>}
    </section>

    <section className={'groups-table-card study-collapsible-card '+(availabilityExpanded?'is-expanded':'is-collapsed')}>
      <div className="groups-table-heading study-collapsible-heading">
        <button type="button" className="availability-collapse-toggle" onClick={()=>setAvailabilityExpanded(value=>!value)} aria-expanded={availabilityExpanded} aria-label={availabilityExpanded?'Plegar franjas':'Desplegar franjas'}><ChevronDown size={17}/></button>
        <div className="availability-heading-copy"><span className="panel-kicker">Disponibilidad</span><h2>Franjas no disponibles <span className="availability-count">{project.spaceAvailability.length}</span></h2></div>
        <div className="groups-table-actions">
          <DataViewControls view={availabilityView} onView={setAvailabilityView} sort={availabilitySort} onSort={setAvailabilitySort} options={[
            {key:'space',label:'Espacio'},{key:'day',label:'Día'},{key:'session',label:'Sesión'},
          ]}/>
          <button className="btn ghost-inline" disabled={project.spaces.filter(space=>space.active).length===0} onClick={()=>setModal('availability')}><Plus size={16}/> Añadir bloqueo</button>
        </div>
      </div>
      {availabilityExpanded&&<div className="study-collapsible-content">
        {project.spaceAvailability.length===0
          ? <div className="groups-empty"><Clock3 size={28}/><strong>Sin bloqueos de espacio</strong><p>Todos los espacios se consideran disponibles salvo las restricciones que añadas.</p></div>
          : availabilityView==='table' ? <div className="groups-table-wrap"><table className="groups-table sortable-table">
            <thead><tr>
              <SortHeader label="Espacio" sortKey="space" state={availabilitySort} onSort={key=>setAvailabilitySort(nextSort(availabilitySort,key))}/>
              <SortHeader label="Día" sortKey="day" state={availabilitySort} onSort={key=>setAvailabilitySort(nextSort(availabilitySort,key))}/>
              <SortHeader label="Sesión" sortKey="session" state={availabilitySort} onSort={key=>setAvailabilitySort(nextSort(availabilitySort,key))}/>
              <th/>
            </tr></thead>
            <tbody>{sortedAvailability.map((item,index)=><tr key={`${item.spaceId}-${item.day}-${item.sessionId}-${index}`}>
              <td>{project.spaces.find(space=>space.id===item.spaceId)?.name??'Espacio eliminado'}</td>
              <td>{dayLabels[item.day]}</td>
              <td>{project.schedule.blocks.find(block=>block.id===item.sessionId)?.label??item.sessionId}</td>
              <td><button className="row-delete" onClick={()=>removeAvailability(item)}><Trash2 size={15}/></button></td>
            </tr>)}</tbody>
          </table></div> : <div className="data-card-grid">{sortedAvailability.map((item,index)=><article className="data-record-card" key={`${item.spaceId}-${item.day}-${item.sessionId}-${index}`}>
            <div className="data-record-card-heading"><div><strong>{project.spaces.find(space=>space.id===item.spaceId)?.name??'Espacio eliminado'}</strong><small>{dayLabels[item.day]}</small></div></div>
            <div className="data-record-card-data"><div><span>Sesión</span><strong>{project.schedule.blocks.find(block=>block.id===item.sessionId)?.label??item.sessionId}</strong></div></div>
            <div className="data-record-card-footer"><span/><button className="row-delete" onClick={()=>removeAvailability(item)}><Trash2 size={15}/></button></div>
          </article>)}</div>}
      </div>}
    </section>

    <section className={'groups-table-card study-collapsible-card '+(travelExpanded?'is-expanded':'is-collapsed')}>
      <div className="groups-table-heading study-collapsible-heading">
        <button type="button" className="availability-collapse-toggle" onClick={()=>setTravelExpanded(value=>!value)} aria-expanded={travelExpanded} aria-label={travelExpanded?'Plegar desplazamientos':'Desplegar desplazamientos'}><ChevronDown size={17}/></button>
        <div className="availability-heading-copy"><span className="panel-kicker">Edificios</span><h2>Tiempos de desplazamiento <span className="availability-count">{project.buildingTravelTimes.length}</span></h2></div>
        <div className="groups-table-actions">
          <DataViewControls view={travelView} onView={setTravelView} sort={travelSort} onSort={setTravelSort} options={[
            {key:'from',label:'Origen'},{key:'to',label:'Destino'},{key:'minutes',label:'Tiempo'},
          ]}/>
          <button className="btn ghost-inline" disabled={buildings.length<2} onClick={()=>setModal('travel')}><Plus size={16}/> Añadir desplazamiento</button>
        </div>
      </div>
      {travelExpanded&&<div className="study-collapsible-content">
        {project.buildingTravelTimes.length===0
          ? <div className="groups-empty"><Building2 size={28}/><strong>Sin desplazamientos configurados</strong><p>Añade tiempos cuando el centro tenga actividades en edificios diferentes.</p></div>
          : travelView==='table' ? <div className="groups-table-wrap"><table className="groups-table sortable-table">
            <thead><tr>
              <SortHeader label="Origen" sortKey="from" state={travelSort} onSort={key=>setTravelSort(nextSort(travelSort,key))}/>
              <SortHeader label="Destino" sortKey="to" state={travelSort} onSort={key=>setTravelSort(nextSort(travelSort,key))}/>
              <SortHeader label="Tiempo" sortKey="minutes" state={travelSort} onSort={key=>setTravelSort(nextSort(travelSort,key))}/>
            </tr></thead>
            <tbody>{sortedTravel.map((item,index)=><tr key={index}><td>{item.fromBuilding}</td><td>{item.toBuilding}</td><td>{item.minutes} min</td></tr>)}</tbody>
          </table></div> : <div className="data-card-grid">{sortedTravel.map((item,index)=><article className="data-record-card" key={index}>
            <div className="data-record-card-heading"><div><strong>{item.fromBuilding} → {item.toBuilding}</strong><small>Desplazamiento entre edificios</small></div><span className="tag">{item.minutes} min</span></div>
          </article>)}</div>}
      </div>}
    </section>
  </div>
}

function SortHeader<K extends string>({
  label,sortKey,state,onSort,
}:{
  label:string
  sortKey:K
  state:SortState<K>
  onSort:(key:K)=>void
}){
  const active=state.key===sortKey
  return <th aria-sort={active?(state.direction==='asc'?'ascending':'descending'):'none'}>
    <button type="button" className={'table-sort-button '+(active?'active':'')} onClick={()=>onSort(sortKey)}>
      <span>{label}</span>
      {active?(state.direction==='asc'?<ArrowUp size={13}/>:<ArrowDown size={13}/>):<ArrowUpDown size={13}/>}
    </button>
  </th>
}

function FilterTagRow({
  label,allLabel,value,options,onChange,
}:{
  label:string
  allLabel:string
  value:string
  options:{value:string;label:string}[]
  onChange:(value:string)=>void
}){
  return <div className="spaces-filter-row">
    <span>{label}</span>
    <div className="list-filter-tags">
      <button type="button" className={value==='all'?'active':''} onClick={()=>onChange('all')}>{allLabel}</button>
      {options.map(option=><button type="button" key={option.value} className={value===option.value?'active':''} onClick={()=>onChange(option.value)}>{option.label}</button>)}
    </div>
  </div>
}
