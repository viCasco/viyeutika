import { useState } from 'react'
import { Layers3, Plus, Trash2 } from 'lucide-react'
import { AppModal } from '../components/AppModal'
import type { SchoolSubgroup, ViyeuticaProject } from '../domain/project'
import { saveProject } from '../store/projectStorage'

const uid=()=> 'sub_'+crypto.randomUUID()

export function SubgroupsPage({
  project,
  navigate,
}:{
  project:ViyeuticaProject
  navigate:(path:string)=>void
}){
  const [parentGroupId,setParentGroupId]=useState(project.groups.find(group=>group.active)?.id??'')
  const [name,setName]=useState('')
  const [students,setStudents]=useState('')
  const [participantKey,setParticipantKey]=useState('')
  const [error,setError]=useState('')
  const [modalOpen,setModalOpen]=useState(false)

  const resetForm=()=>{
    setParentGroupId(project.groups.find(group=>group.active)?.id??'')
    setName('')
    setStudents('')
    setParticipantKey('')
    setError('')
  }

  const closeModal=()=>{
    resetForm()
    setModalOpen(false)
  }

  const add=()=>{
    const group=project.groups.find(item=>item.id===parentGroupId&&item.active)
    if(!group||!name.trim()){
      setError('Selecciona un grupo base e indica el nombre del subgrupo.')
      return
    }
    const key=participantKey.trim()||name.trim()
    if(project.subgroups.some(item=>item.parentGroupId===parentGroupId&&item.name.trim().toLocaleLowerCase('es')===name.trim().toLocaleLowerCase('es'))){
      setError('Ya existe un subgrupo con ese nombre dentro del grupo base.')
      return
    }
    const subgroup:SchoolSubgroup={
      id:uid(),
      parentGroupId,
      name:name.trim(),
      students:students?Math.max(0,Number(students)):null,
      participantKey:key,
      active:true,
    }
    saveProject({...project,subgroups:[...project.subgroups,subgroup]})
    closeModal()
  }

  const remove=(id:string)=>{
    saveProject({
      ...project,
      subgroups:project.subgroups.filter(item=>item.id!==id),
      assignments:project.assignments.map(item=>item.subgroupId===id?{...item,subgroupId:null}:item),
    })
  }

  const setAssignmentSubgroup=(assignmentId:string,subgroupId:string)=>{
    saveProject({
      ...project,
      assignments:project.assignments.map(item=>item.id===assignmentId?{...item,subgroupId:subgroupId||null}:item),
    })
  }

  return <div className="wizard-page subgroups-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><Layers3 size={28}/> Subgrupos y desdobles</h1>
        <p>Define participantes dentro de un grupo base sin cambiar sus IDs históricos. Dos subgrupos distintos pueden coincidir en una sesión si no comparten participantes ni recursos incompatibles.</p>
      </div>
    </section>

    {modalOpen&&<AppModal
      title="Añadir subgrupo"
      icon={<Layers3 size={20}/>}
      onClose={closeModal}
      footer={<>
        <button type="button" className="btn ghost-inline" onClick={closeModal}>Cancelar</button>
        <button type="button" className="btn primary" disabled={!parentGroupId||!name.trim()} onClick={add}>Aceptar</button>
      </>}
    >
      <div className="form-grid two">
        <label className="form-field"><span>Grupo base</span><select value={parentGroupId} onChange={e=>setParentGroupId(e.target.value)}><option value="">Selecciona...</option>{project.groups.filter(group=>group.active).map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label className="form-field"><span>Nombre</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Ej. Inglés A"/></label>
        <label className="form-field"><span>Alumnado</span><input type="number" min="0" value={students} onChange={e=>setStudents(e.target.value)} placeholder="Opcional"/></label>
        <label className="form-field"><span>Clave de participantes</span><input value={participantKey} onChange={e=>setParticipantKey(e.target.value)} placeholder="Ej. optativa-inglés-A"/></label>
      </div>
      {error&&<div className="inline-error">{error}</div>}
    </AppModal>}

    <section className="groups-table-card">
      <div className="groups-table-heading">
        <div><span className="panel-kicker">Estructura</span><h2>Subgrupos configurados</h2></div>
        <button className="btn ghost-inline" onClick={()=>setModalOpen(true)}><Plus size={16}/> Añadir subgrupo</button>
      </div>
      {project.subgroups.length===0
        ? <div className="groups-empty"><Layers3 size={28}/><strong>No hay subgrupos</strong><p>Solo necesitas crearlos cuando exista un desdoble, optativa o agrupación simultánea.</p></div>
        : <div className="groups-table-wrap"><table className="groups-table">
          <thead><tr><th>Subgrupo</th><th>Grupo base</th><th>Alumnado</th><th>Participantes</th><th/></tr></thead>
          <tbody>{project.subgroups.map(subgroup=><tr key={subgroup.id}>
            <td><strong>{subgroup.name}</strong></td>
            <td>{project.groups.find(group=>group.id===subgroup.parentGroupId)?.name??'Grupo eliminado'}</td>
            <td>{subgroup.students??'—'}</td>
            <td>{subgroup.participantKey}</td>
            <td><button className="row-delete" onClick={()=>remove(subgroup.id)}><Trash2 size={15}/></button></td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    <section className="groups-table-card">
      <div className="groups-table-heading"><div><span className="panel-kicker">Asignaciones</span><h2>Vincular actividades a subgrupos</h2><p>Una asignación sin subgrupo sigue ocupando al grupo completo.</p></div><button className="btn ghost-inline" onClick={()=>navigate('/asignaciones')}>Ir a Asignaciones</button></div>
      <div className="groups-table-wrap"><table className="groups-table">
        <thead><tr><th>Grupo</th><th>Materia</th><th>Docente</th><th>Subgrupo</th></tr></thead>
        <tbody>{project.assignments.filter(item=>item.active).map(assignment=>{
          const available=project.subgroups.filter(item=>item.active&&item.parentGroupId===assignment.groupId)
          return <tr key={assignment.id}>
            <td>{project.groups.find(item=>item.id===assignment.groupId)?.name??'—'}</td>
            <td>{project.subjects.find(item=>item.id===assignment.subjectId)?.name??'—'}</td>
            <td>{project.teachers.find(item=>item.id===assignment.teacherId)?.name??'—'}</td>
            <td><select value={assignment.subgroupId??''} onChange={e=>setAssignmentSubgroup(assignment.id,e.target.value)}>
              <option value="">Grupo completo</option>
              {available.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
            </select></td>
          </tr>
        })}</tbody>
      </table></div>
    </section>
  </div>
}
