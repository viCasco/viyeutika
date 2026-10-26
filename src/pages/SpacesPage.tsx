import { useState } from 'react'
import { Building2, Plus, Trash2 } from 'lucide-react'
import type { BuildingTravelTime, SchoolSpace, SpaceAvailability, ViyeuticaProject, Weekday } from '../domain/project'
import { saveProject } from '../store/projectStorage'

const uid=()=> 'space_'+crypto.randomUUID()
const dayLabels:Record<Weekday,string>={L:'Lunes',M:'Martes',X:'Miércoles',J:'Jueves',V:'Viernes',S:'Sábado'}

export function SpacesPage({
  project,
  navigate,
}:{
  project:ViyeuticaProject
  navigate:(path:string)=>void
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
  const buildings=[...new Set(project.spaces.map(space=>space.building).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))

  const addSpace=()=>{
    if(!name.trim()||!type.trim()||!building.trim())return
    const space:SchoolSpace={
      id:uid(),name:name.trim(),type:type.trim(),building:building.trim(),
      capacity:capacity?Math.max(0,Number(capacity)):null,shared,active:true,
    }
    saveProject({...project,spaces:[...project.spaces,space]})
    setName('');setType('');setBuilding('');setCapacity('');setShared(false)
    if(!availabilitySpaceId)setAvailabilitySpaceId(space.id)
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
  }

  return <div className="wizard-page spaces-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><Building2 size={28}/> Espacios y desplazamientos</h1>
        <p>Modela aulas, instalaciones, edificios, disponibilidad y tiempos de desplazamiento. Las reservas incompatibles se validan junto con docentes y grupos.</p>
      </div>
    </section>

    <section className="space-create-card">
      <div className="groups-table-heading"><div><span className="panel-kicker">Recursos</span><h2>Añadir espacio</h2></div></div>
      <div className="form-grid four">
        <label className="form-field"><span>Nombre</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Gimnasio"/></label>
        <label className="form-field"><span>Tipo</span><input value={type} onChange={e=>setType(e.target.value)} placeholder="Gimnasio, aula, laboratorio..."/></label>
        <label className="form-field"><span>Edificio</span><input value={building} onChange={e=>setBuilding(e.target.value)} placeholder="Principal"/></label>
        <label className="form-field"><span>Capacidad</span><input type="number" min="0" value={capacity} onChange={e=>setCapacity(e.target.value)} placeholder="Opcional"/></label>
      </div>
      <label className="checkbox-field"><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/><span><strong>Uso compartido permitido</strong><small>Solo actívalo si varias actividades pueden usar simultáneamente el recurso sin conflicto.</small></span></label>
      <button className="btn primary" disabled={!name.trim()||!type.trim()||!building.trim()} onClick={addSpace}><Plus size={16}/> Añadir espacio</button>
    </section>

    <section className="groups-table-card">
      <div className="groups-table-heading"><div><span className="panel-kicker">Inventario</span><h2>Espacios</h2></div></div>
      {project.spaces.length===0
        ? <div className="groups-empty"><Building2 size={28}/><strong>No hay espacios configurados</strong><p>Añade solo los recursos que necesiten reserva o tengan restricciones de horario.</p></div>
        : <div className="groups-table-wrap"><table className="groups-table">
          <thead><tr><th>Espacio</th><th>Tipo</th><th>Edificio</th><th>Capacidad</th><th>Compartido</th><th/></tr></thead>
          <tbody>{project.spaces.map(space=><tr key={space.id}><td><strong>{space.name}</strong></td><td>{space.type}</td><td>{space.building}</td><td>{space.capacity??'—'}</td><td>{space.shared?'Sí':'No'}</td><td><button className="row-delete" onClick={()=>removeSpace(space.id)}><Trash2 size={15}/></button></td></tr>)}</tbody>
        </table></div>}
    </section>

    <section className="groups-table-card">
      <div className="groups-table-heading"><div><span className="panel-kicker">Asignaciones</span><h2>Reserva por actividad</h2></div><button className="btn ghost-inline" onClick={()=>navigate('/asignaciones')}>Ir a Asignaciones</button></div>
      <div className="groups-table-wrap"><table className="groups-table">
        <thead><tr><th>Grupo</th><th>Materia</th><th>Docente</th><th>Espacio</th></tr></thead>
        <tbody>{project.assignments.filter(item=>item.active).map(assignment=><tr key={assignment.id}>
          <td>{project.groups.find(item=>item.id===assignment.groupId)?.name??'—'}</td>
          <td>{project.subjects.find(item=>item.id===assignment.subjectId)?.name??'—'}</td>
          <td>{project.teachers.find(item=>item.id===assignment.teacherId)?.name??'—'}</td>
          <td><select value={assignment.spaceId??''} onChange={e=>assignSpace(assignment.id,e.target.value)}><option value="">Sin espacio fijo</option>{project.spaces.filter(space=>space.active).map(space=><option key={space.id} value={space.id}>{space.name} · {space.building}</option>)}</select></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section className="space-tools-grid">
      <article className="space-tool-card">
        <div><span className="panel-kicker">Disponibilidad</span><h2>Bloquear franja de espacio</h2></div>
        <div className="form-grid three">
          <label className="form-field"><span>Espacio</span><select value={availabilitySpaceId} onChange={e=>setAvailabilitySpaceId(e.target.value)}><option value="">Selecciona...</option>{project.spaces.filter(space=>space.active).map(space=><option key={space.id} value={space.id}>{space.name}</option>)}</select></label>
          <label className="form-field"><span>Día</span><select value={availabilityDay} onChange={e=>setAvailabilityDay(e.target.value as Weekday)}>{project.schedule.activeDays.map(day=><option key={day} value={day}>{dayLabels[day]}</option>)}</select></label>
          <label className="form-field"><span>Sesión</span><select value={availabilitySession} onChange={e=>setAvailabilitySession(e.target.value)}>{project.schedule.blocks.filter(block=>block.active&&block.type==='teaching').map(block=><option key={block.id} value={block.id}>{block.label}</option>)}</select></label>
        </div>
        <button className="btn secondary-light" onClick={addAvailability}>Marcar no disponible</button>
        <div className="space-chip-list">{project.spaceAvailability.map((item,index)=><span key={index}>{project.spaces.find(space=>space.id===item.spaceId)?.name??'Espacio'} · {dayLabels[item.day]} · {project.schedule.blocks.find(block=>block.id===item.sessionId)?.label??item.sessionId}<button onClick={()=>removeAvailability(item)}>×</button></span>)}</div>
      </article>

      <article className="space-tool-card">
        <div><span className="panel-kicker">Edificios</span><h2>Tiempo de desplazamiento</h2></div>
        <div className="form-grid three">
          <label className="form-field"><span>Origen</span><select value={travelFrom} onChange={e=>setTravelFrom(e.target.value)}><option value="">Selecciona...</option>{buildings.map(value=><option key={value}>{value}</option>)}</select></label>
          <label className="form-field"><span>Destino</span><select value={travelTo} onChange={e=>setTravelTo(e.target.value)}><option value="">Selecciona...</option>{buildings.map(value=><option key={value}>{value}</option>)}</select></label>
          <label className="form-field"><span>Minutos</span><input type="number" min="0" value={travelMinutes} onChange={e=>setTravelMinutes(e.target.value)}/></label>
        </div>
        <button className="btn secondary-light" onClick={addTravel}>Guardar tiempo</button>
        <div className="space-chip-list">{project.buildingTravelTimes.map((item,index)=><span key={index}>{item.fromBuilding} ↔ {item.toBuilding} · {item.minutes} min</span>)}</div>
      </article>
    </section>
  </div>
}
