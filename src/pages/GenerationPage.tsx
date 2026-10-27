import { useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowDownUp, CalendarCheck2, CalendarDays, CheckCircle2, Info, Plus, RefreshCcw, Sparkles,
  Lock, Pencil, Trash2, Trophy, Undo2, Unlock, XCircle,
} from 'lucide-react'
import {
  emptyGroupTeachingSlots,
  generationDifference,
  generationSignature,
  isGenerationProposalValid,
  isPrevalidationComplete,
  latestGeneration,
  uniqueGenerationRuns,
  type GenerationRun,
  type ScheduleLockMode,
  type ViyeuticaProject,
  type Weekday,
} from '../domain/project'
import { generateSchedule } from '../domain/generationEngine'
import { auditGeneration } from '../domain/auditEngine'
import { saveProject } from '../store/projectStorage'
import {
  clearGenerationUndo,
  loadGenerationUndo,
  saveGenerationUndo,
  type GenerationUndoSnapshot,
} from '../store/generationUndoStorage'
import { WizardStepper } from '../components/WizardStepper'
import { AppModal } from '../components/AppModal'
import { assignmentLabel, prepareScheduleEntryChange, previewScheduleEntryChange } from '../domain/scheduleEditing'
import { recommendedRun, scheduleCellState, scheduleMetrics } from '../domain/scheduleMetrics'

type GenerationAlternativeAction =
  | {kind:'review_plan';groupId:string}
  | {kind:'review_assignment';assignmentId:string}
  | {kind:'free_availability';teacherId:string;day:Weekday;sessionId:string}
  | {kind:'fix_slot';assignmentId:string;day:Weekday;sessionId:string}

type GenerationAlternative={
  id:string
  title:string
  detail:string
  route:string
  action:GenerationAlternativeAction
}

const dayLabels:Record<Weekday,string>={
  L:'Lunes',M:'Martes',X:'Miércoles',J:'Jueves',V:'Viernes',S:'Sábado',
}

export function GenerationPage({
  project,
  navigate,
}:{
  project:ViyeuticaProject
  navigate:(path:string)=>void
}) {
  const [selectedRunId,setSelectedRunId]=useState(project.selectedGenerationRunId??latestGeneration(project)?.id??'')
  const [selectedGroupIds,setSelectedGroupIds]=useState<string[]>(['all'])
  const [viewMode,setViewMode]=useState<'group'|'teacher'|'center'>('group')
  const [selectedTeacherId,setSelectedTeacherId]=useState(project.teachers.find(teacher=>teacher.active)?.id??'')
  const [running,setRunning]=useState(false)
  const [showClearModal,setShowClearModal]=useState(false)
  const [showRegenerateModal,setShowRegenerateModal]=useState(false)
  const [regenerationReferenceId,setRegenerationReferenceId]=useState(
    project.establishedScheduleRun?.id??project.draftScheduleRun?.id??project.selectedGenerationRunId??''
  )
  const [regenerationStrategy,setRegenerationStrategy]=useState<'minimum_change'|'optimize'>('minimum_change')
  const [showIssuesModal,setShowIssuesModal]=useState(false)
  const [showEstablishModal,setShowEstablishModal]=useState(false)
  const [showDraftModal,setShowDraftModal]=useState(false)
  const [ascending,setAscending]=useState(true)
  const [generationNotice,setGenerationNotice]=useState('')
  const [generationAlternatives,setGenerationAlternatives]=useState<GenerationAlternative[]>([])
  const [visibleAlternatives,setVisibleAlternatives]=useState(3)
  const [appliedAlternative,setAppliedAlternative]=useState('')
  const [undoSnapshot,setUndoSnapshot]=useState<GenerationUndoSnapshot|null>(()=>loadGenerationUndo())
  const [simulatingAlternativeId,setSimulatingAlternativeId]=useState('')
  const [editEntryId,setEditEntryId]=useState('')
  const [editAssignmentId,setEditAssignmentId]=useState('')
  const [editDay,setEditDay]=useState<Weekday>('L')
  const [editSessionId,setEditSessionId]=useState('')
  const [editError,setEditError]=useState('')
  const [editLockMode,setEditLockMode]=useState<ScheduleLockMode|'none'>('none')
  const [dragEntryId,setDragEntryId]=useState('')
  const [alternativeSimulation,setAlternativeSimulation]=useState<Record<string,{
    valid:boolean
    emptySlots:number
    hardViolations:number
    softPenalty:number
    placedSessions:number
    requestedSessions:number
  }>>({})

  const runs=uniqueGenerationRuns(project.generationRuns)
  const draftRun=project.draftScheduleRun??null
  const establishedRun=project.establishedScheduleRun??null
  const retainedRuns=[
    ...(draftRun&&!runs.some(run=>run.id===draftRun.id)?[{run:draftRun,kind:'draft' as const}]:[]),
    ...(establishedRun&&!runs.some(run=>run.id===establishedRun.id)&&draftRun?.id!==establishedRun.id
      ? [{run:establishedRun,kind:'established' as const}]
      : []),
  ]
  const selectedRun=
    runs.find(run=>run.id===selectedRunId) ??
    retainedRuns.find(item=>item.run.id===selectedRunId)?.run ??
    runs[runs.length-1] ??
    draftRun ??
    establishedRun ??
    latestGeneration(project)
  const activeGroups=project.groups.filter(group=>group.active)
  const activeTeachers=project.teachers.filter(teacher=>teacher.active)
  const teachingBlocks=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
  const visibleDays=project.schedule.activeDays
  const comparisonRows=runs.map((run,index)=>({run,index,metrics:scheduleMetrics(project,run)}))
  const recommended=recommendedRun(project,runs)
  const baselineRun=runs[0]??draftRun??establishedRun??null
  const regenerationReferences=[
    ...runs.map((run,index)=>({run,label:`Propuesta ${index+1}`})),
    ...(draftRun&&!runs.some(run=>run.id===draftRun.id)?[{run:draftRun,label:'Borrador guardado'}]:[]),
    ...(establishedRun&&!runs.some(run=>run.id===establishedRun.id)&&draftRun?.id!==establishedRun.id
      ? [{run:establishedRun,label:'Horario establecido'}]
      : []),
  ]
  const selectedReferenceRun=selectedRun?.referenceRunId
    ? regenerationReferences.find(item=>item.run.id===selectedRun.referenceRunId)?.run??null
    : null
  const comparisonRun=selectedReferenceRun??baselineRun

  const proposalIsValid=(run:GenerationRun)=>
    isGenerationProposalValid(project,run)&&auditGeneration(project,run).passed
  const selectedIsDraft=Boolean(selectedRun&&draftRun?.id===selectedRun.id)
  const selectedIsEstablished=Boolean(selectedRun&&establishedRun?.id===selectedRun.id)
  const editEntry=selectedRun?.entries.find(entry=>entry.id===editEntryId)??null

  const openScheduleEditor=(entryId:string,target?:{day:Weekday;sessionId:string})=>{
    if(!selectedRun)return
    const entry=selectedRun.entries.find(item=>item.id===entryId)
    if(!entry)return
    setEditEntryId(entry.id)
    setEditAssignmentId(entry.assignmentId)
    setEditDay(target?.day??entry.day)
    setEditSessionId(target?.sessionId??entry.sessionId)
    const lock=(project.scheduleLocks??[]).find(item=>
      item.assignmentId===entry.assignmentId&&item.day===entry.day&&item.sessionId===entry.sessionId
    )
    setEditLockMode(lock?.mode??'none')
    setEditError('')
  }

  const locksForEditedRun=(before:GenerationRun,after:GenerationRun)=>{
    return (project.scheduleLocks??[]).map(lock=>{
      if(lock.mode!=='teacher')return lock
      const beforeEntry=before.entries.find(entry=>
        entry.assignmentId===lock.assignmentId&&
        entry.teacherId===lock.teacherId&&
        entry.day===lock.day&&
        entry.sessionId===lock.sessionId
      )
      if(!beforeEntry)return lock
      const afterEntry=after.entries.find(entry=>entry.id===beforeEntry.id)
      if(!afterEntry)return lock
      if(afterEntry.day===beforeEntry.day&&afterEntry.sessionId===beforeEntry.sessionId&&afterEntry.assignmentId===beforeEntry.assignmentId)return lock
      return {
        ...lock,
        assignmentId:afterEntry.assignmentId,
        teacherId:afterEntry.teacherId,
        day:afterEntry.day,
        sessionId:afterEntry.sessionId,
      }
    })
  }

  const persistEditedRun=(edited:GenerationRun,nextLocks=project.scheduleLocks??[])=>{
    if(!selectedRun)return
    const snapshot=saveGenerationUndo(project,'Edición manual del horario')
    setUndoSnapshot(snapshot)

    if(selectedIsEstablished){
      const draft={...edited,id:'draft_'+crypto.randomUUID(),createdAt:new Date().toISOString()}
      saveProject({
        ...project,
        selectedGenerationRunId:draft.id,
        draftScheduleRun:draft,
        draftScheduleSavedAt:new Date().toISOString(),
        draftScheduleNeedsRevalidation:false,
        scheduleLocks:nextLocks,
      },{intent:'draft'})
      setSelectedRunId(draft.id)
      setGenerationNotice('El horario establecido no se ha sobrescrito. El cambio manual se ha guardado como borrador revalidado.')
    }else if(selectedIsDraft){
      saveProject({
        ...project,
        selectedGenerationRunId:edited.id,
        draftScheduleRun:edited,
        draftScheduleSavedAt:new Date().toISOString(),
        draftScheduleNeedsRevalidation:false,
        scheduleLocks:nextLocks,
      },{intent:'draft'})
      setSelectedRunId(edited.id)
      setGenerationNotice('Borrador actualizado y revalidado correctamente.')
    }else{
      const nextRuns=project.generationRuns.map(run=>run.id===edited.id?edited:run)
      saveProject({
        ...project,
        generationRuns:nextRuns,
        selectedGenerationRunId:edited.id,
        generationNeedsRevalidation:false,
        scheduleLocks:nextLocks,
      },{intent:'generation'})
      setSelectedRunId(edited.id)
      setGenerationNotice('Propuesta actualizada manualmente y revalidada correctamente.')
    }
  }

  const confirmScheduleEdit=()=>{
    if(!selectedRun||!editEntryId)return
    const result=prepareScheduleEntryChange(project,selectedRun,{
      entryId:editEntryId,
      assignmentId:editAssignmentId,
      day:editDay,
      sessionId:editSessionId,
    })
    if(!result.ok){
      setEditError(result.message)
      return
    }
    const nextLocks=locksForEditedRun(selectedRun,result.run)
    persistEditedRun(result.run,nextLocks)
    setEditEntryId('')
    setEditError('')
  }

  const dropScheduleEntry=(entryId:string,day:Weekday,sessionId:string)=>{
    if(!selectedRun||!entryId)return
    const current=selectedRun.entries.find(entry=>entry.id===entryId)
    if(!current)return
    const result=prepareScheduleEntryChange(project,selectedRun,{
      entryId,
      assignmentId:current.assignmentId,
      day,
      sessionId,
    })
    if(!result.ok){
      setGenerationNotice(result.message)
      return
    }
    const nextLocks=locksForEditedRun(selectedRun,result.run)
    persistEditedRun(result.run,nextLocks)
    setDragEntryId('')
  }

  const saveEntryLock=()=>{
    if(!selectedRun||!editEntry)return
    const currentLocks=project.scheduleLocks??[]
    const existing=currentLocks.find(lock=>
      lock.assignmentId===editEntry.assignmentId&&lock.day===editEntry.day&&lock.sessionId===editEntry.sessionId
    )
    const without=currentLocks.filter(lock=>lock.id!==existing?.id)
    const nextLocks=editLockMode==='none'
      ? without
      : [...without,{
          id:existing?.id??'lock_'+crypto.randomUUID(),
          assignmentId:editEntry.assignmentId,
          day:editEntry.day,
          sessionId:editEntry.sessionId,
          teacherId:editEntry.teacherId,
          mode:editLockMode,
          createdAt:existing?.createdAt??new Date().toISOString(),
        }]
    saveProject({...project,scheduleLocks:nextLocks})
    setGenerationNotice(editLockMode==='none'
      ? 'Bloqueo eliminado. Las propuestas se conservan y deben revalidarse con la configuración actual.'
      : 'Bloqueo guardado. Las propuestas se conservan y deben revalidarse antes de regenerar.')
  }

  const revalidateStoredSchedules=()=>{
    const invalidRuns=runs.filter(run=>!proposalIsValid(run))
    const draftValid=!draftRun||proposalIsValid(draftRun)
    const establishedValid=!establishedRun||proposalIsValid(establishedRun)
    saveProject({
      ...project,
      generationNeedsRevalidation:invalidRuns.length>0,
      draftScheduleNeedsRevalidation:draftRun?!draftValid:false,
      establishedScheduleNeedsRevalidation:establishedRun?!establishedValid:false,
    },{intent:'revalidation'})
    setGenerationNotice(invalidRuns.length||!draftValid||!establishedValid
      ? 'La revalidación ha detectado horarios que ya no cumplen la configuración actual. Se conservan para revisión, pero debes corregir o regenerar antes de considerarlos vigentes.'
      : 'Propuestas y horarios guardados revalidados correctamente con la configuración actual.')
  }

  const saveSelectedAsDraft=()=>{
    if(!selectedRun||!proposalIsValid(selectedRun))return
    saveProject({
      ...project,
      selectedGenerationRunId:selectedRun.id,
      draftScheduleRun:structuredClone(selectedRun),
      draftScheduleSavedAt:new Date().toISOString(),
    },{intent:'draft'})
    setShowDraftModal(false)
  }

  const establishSelectedSchedule=()=>{
    if(!selectedRun||!proposalIsValid(selectedRun))return
    saveProject({
      ...project,
      selectedGenerationRunId:selectedRun.id,
      draftScheduleRun:null,
      draftScheduleSavedAt:null,
      establishedScheduleRun:structuredClone(selectedRun),
      establishedScheduleSavedAt:new Date().toISOString(),
    },{intent:'established'})
    setShowEstablishModal(false)
  }

  const toggleGroup=(groupId:string)=>{
    if(groupId==='all'){
      setSelectedGroupIds(['all'])
      return
    }
    setSelectedGroupIds(current=>{
      const withoutAll=current.filter(id=>id!=='all')
      const exists=withoutAll.includes(groupId)
      const next=exists?withoutAll.filter(id=>id!==groupId):[...withoutAll,groupId]
      return next.length?next:['all']
    })
  }

  const visibleGroupIds=selectedGroupIds.includes('all')
    ? activeGroups.map(group=>group.id)
    : selectedGroupIds

  const generateProposals=(mode:'initial'|'add'|'regenerate')=>{
    if(!isPrevalidationComplete(project)) return
    setRunning(true)
    setGenerationNotice('')
    setGenerationAlternatives([])
    setVisibleAlternatives(3)
    setAppliedAlternative('')
    window.setTimeout(()=>{
      const stored=uniqueGenerationRuns(project.generationRuns)
      const baseRuns=mode==='initial'?[]:stored
      const reference=mode==='regenerate'
        ? regenerationReferences.find(item=>item.run.id===regenerationReferenceId)?.run??selectedRun??null
        : null
      const existingSignatures=new Set([
        ...baseRuns.map(generationSignature),
        ...regenerationReferences.map(item=>generationSignature(item.run)),
      ])
      const target=mode==='add'?1:3
      const additions:GenerationRun[]=[]
      const rejected:GenerationRun[]=[]
      const maxSearch=mode==='add'?12:24
      const baseIndex=project.generationRuns.length+(mode==='regenerate'?1000:0)

      for(let index=0;index<maxSearch&&additions.length<target;index++){
        const result=generateSchedule(
          project,
          80,
          baseIndex+index+1,
          mode==='regenerate'
            ? {strategy:regenerationStrategy,referenceRun:reference,moveCost:40}
            : {strategy:'optimize'}
        )
        if(!proposalIsValid(result)){
          rejected.push(result)
          continue
        }
        const signature=generationSignature(result)
        if(existingSignatures.has(signature)) continue
        existingSignatures.add(signature)
        additions.push(result)
      }

      if(mode==='regenerate'&&additions.length===0){
        const diagnostic=[...rejected].sort((a,b)=>
          emptyGroupTeachingSlots(project,a).length-emptyGroupTeachingSlots(project,b).length ||
          a.hardViolations-b.hardViolations ||
          b.score-a.score
        )[0]
        setGenerationNotice('No se ha encontrado una alternativa válida nueva. La referencia y las propuestas existentes se mantienen intactas.')
        setGenerationAlternatives(buildGenerationAlternatives(project,diagnostic))
        setShowRegenerateModal(false)
        setRunning(false)
        return
      }

      const merged=[...baseRuns,...additions]
      const selectedId=additions[0]?.id??project.selectedGenerationRunId??merged[0]?.id??null
      saveProject({...project,generationRuns:merged,selectedGenerationRunId:selectedId},{intent:'generation'})
      if(selectedId)setSelectedRunId(selectedId)
      setShowRegenerateModal(false)

      if(mode==='regenerate'&&additions.length){
        const label=regenerationStrategy==='minimum_change'?'cambiando lo mínimo posible':'optimizando de nuevo'
        setGenerationNotice(`Se han añadido ${additions.length} ${additions.length===1?'alternativa nueva':'alternativas nuevas'} ${label}. La referencia no se ha sobrescrito.`)
      }else if(additions.length===0&&baseRuns.length===0){
        const diagnostic=[...rejected].sort((a,b)=>
          emptyGroupTeachingSlots(project,a).length-emptyGroupTeachingSlots(project,b).length ||
          a.hardViolations-b.hardViolations ||
          b.score-a.score
        )[0]
        setGenerationNotice('No se ha encontrado ninguna propuesta válida sin huecos con la configuración actual.')
        setGenerationAlternatives(buildGenerationAlternatives(project,diagnostic))
      }else if(target===3&&additions.length<3){
        setGenerationNotice(
          additions.length===1
            ? '⩒Yeutika ha encontrado una única propuesta válida sin huecos en la búsqueda realizada.'
            : `⩒Yeutika ha encontrado ${additions.length} propuestas válidas distintas de las 3 solicitadas.`
        )
      }else if(mode==='add'&&additions.length===0){
        setGenerationNotice('No se ha encontrado una nueva propuesta válida y distinta. Se mantienen todas las propuestas existentes.')
        const diagnostic=[...rejected].sort((a,b)=>
          emptyGroupTeachingSlots(project,a).length-emptyGroupTeachingSlots(project,b).length ||
          a.hardViolations-b.hardViolations ||
          b.score-a.score
        )[0]
        if(diagnostic)setGenerationAlternatives(buildGenerationAlternatives(project,diagnostic))
      }

      setRunning(false)
    },20)
  }

  const runGeneration=()=>generateProposals(runs.length===0?'initial':'add')
  const regenerateThree=()=>generateProposals('regenerate')

  const projectWithAlternative=(base:ViyeuticaProject,alternative:GenerationAlternative)=>{
    const action=alternative.action

    if(action.kind==='review_plan'||action.kind==='review_assignment')return base

    if(action.kind==='free_availability'){
      const teacherAvailability=base.teacherAvailability.map(item=>
        item.teacherId===action.teacherId&&item.day===action.day&&item.session===action.sessionId
          ? {...item,status:'available' as const,detail:'Disponibilidad ajustada desde una alternativa de Horarios.'}
          : item
      )
      return {...base,teacherAvailability,generationRuns:[],selectedGenerationRunId:null}
    }

    const assignments=base.assignments.map(assignment=>{
      if(assignment.id!==action.assignmentId)return assignment
      const fixedSlots=[...(assignment.fixedSlots??[])]
      if(!fixedSlots.some(item=>item.day===action.day&&item.session===action.sessionId)){
        fixedSlots.push({day:action.day,session:action.sessionId})
      }
      return {...assignment,fixedSlots}
    })
    return {...base,assignments,generationRuns:[],selectedGenerationRunId:null}
  }

  const simulateGenerationAlternative=(alternative:GenerationAlternative)=>{
    if(simulatingAlternativeId)return
    setSimulatingAlternativeId(alternative.id)
    window.setTimeout(()=>{
      const simulatedProject=projectWithAlternative(project,alternative)
      const result=generateSchedule(simulatedProject,70,9000+generationAlternatives.findIndex(item=>item.id===alternative.id))
      setAlternativeSimulation(current=>({
        ...current,
        [alternative.id]:{
          valid:isGenerationProposalValid(simulatedProject,result)&&auditGeneration(simulatedProject,result).passed,
          emptySlots:emptyGroupTeachingSlots(simulatedProject,result).length,
          hardViolations:result.hardViolations,
          softPenalty:result.softPenalty,
          placedSessions:result.placedSessions,
          requestedSessions:result.requestedSessions,
        },
      }))
      setSimulatingAlternativeId('')
    },20)
  }

  const applyGenerationAlternative=(alternative:GenerationAlternative)=>{
    const snapshot=saveGenerationUndo(project,alternative.title)
    setUndoSnapshot(snapshot)
    const nextProject=projectWithAlternative(project,alternative)
    saveProject(nextProject)
    setSelectedRunId('')
    setAppliedAlternative(alternative.title+' aplicada. Las propuestas anteriores se conservan y requieren revalidación porque la configuración ha cambiado.')
    setGenerationAlternatives([])
    setAlternativeSimulation({})
    setGenerationNotice('Configuración actualizada. Vuelve a generar para comprobar si ya existe una solución válida sin huecos.')
  }

  const undoLastGenerationChange=()=>{
    const snapshot=loadGenerationUndo()
    if(!snapshot)return
    saveProject(structuredClone(snapshot.project),{intent:'replace_project'})
    clearGenerationUndo()
    setUndoSnapshot(null)
    setAppliedAlternative('Se ha restaurado la configuración anterior al último cambio.')
    setGenerationNotice('Se ha deshecho la última alternativa aplicada.')
    setGenerationAlternatives([])
    setAlternativeSimulation({})
    setSelectedRunId(snapshot.project.selectedGenerationRunId??'')
  }

  const clearRuns=()=>{
    saveProject({...project,generationRuns:[],selectedGenerationRunId:null},{intent:'clear_proposals'})
    setSelectedRunId('')
    setShowClearModal(false)
  }

  if(!isPrevalidationComplete(project)){
    return <div className="wizard-page generation-page">
      <section className="wizard-intro">
        <div>
          <h1 className="wizard-page-title"><CalendarDays size={28}/> Horarios</h1>
          <p>Construye propuestas utilizando asignaciones, disponibilidades y reglas activas. Las condiciones HARD restringen la colocación; las SOFT puntúan y permiten comparar soluciones.</p>
        </div>
        <div className="wizard-progress-summary"><strong>9 <span>de 9</span></strong><small>Horarios</small></div>
      </section>
      <WizardStepper currentStep={9} project={project} navigate={navigate}/>
      <section className="empty-state-card">
        <Sparkles size={34}/>
        <h1>Primero debe superarse la Prevalidación</h1>
        <p>Horarios solo se habilita cuando no existen errores bloqueantes en los pasos anteriores.</p>
        <button className="btn primary" onClick={()=>navigate('/prevalidacion')}>Ir a Prevalidación</button>
      </section>
    </div>
  }

  return <div className="wizard-page generation-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><CalendarDays size={28}/> Horarios</h1>
        <p>Construye propuestas utilizando asignaciones, disponibilidades y reglas activas. Las condiciones HARD restringen la colocación; las SOFT puntúan y permiten comparar soluciones.</p>
      </div>
      <div className="wizard-progress-summary"><strong>9 <span>de 9</span></strong><small>Horarios</small></div>
    </section>

    <WizardStepper currentStep={9} project={project} navigate={navigate}/>

    {(project.generationNeedsRevalidation||project.draftScheduleNeedsRevalidation||project.establishedScheduleNeedsRevalidation)&&<section className="generation-uniqueness-notice generation-revalidation-notice">
      <AlertTriangle size={18}/>
      <span>La configuración ha cambiado desde que se guardaron una o más propuestas. Se conservan, pero necesitan revalidarse antes de considerarlas vigentes.</span>
      <button className="btn secondary-light" onClick={revalidateStoredSchedules}>Revalidar ahora</button>
    </section>}

    {runs.length===0&&<>
    <section className="generation-control-card">
      <div>
        <span className="panel-kicker">Motor heurístico</span>
        <h2>{runs.length===0?'Generar 3 propuestas':'Añadir otra propuesta'}</h2>
        <p>{runs.length===0
          ? '⩒Yeutika generará tres alternativas independientes para poder compararlas antes de decidir.'
          : 'Genera una nueva alternativa sin eliminar las propuestas existentes.'}</p>
      </div>
      <div className="generation-control-actions">
        {runs.length>0&&<>
          <button className="btn ghost-inline" onClick={()=>setShowClearModal(true)}>Limpiar propuestas</button>
          <button className="btn ghost-inline" disabled={running} onClick={()=>setShowRegenerateModal(true)}><RefreshCcw size={16}/> Regenerar 3 propuestas</button>
        </>}
        <button className="btn primary" disabled={running} onClick={runGeneration}>
          {running
            ? <RefreshCcw className="spin" size={16}/>
            : runs.length===0?<Sparkles size={16}/>:<Plus size={16}/>}
          {running
            ? (runs.length===0?'Generando 3 propuestas...':'Generando propuesta...')
            : (runs.length===0?'Generar 3 propuestas':'Generar otra propuesta')}
        </button>
      </div>
    </section>
    </>}

    {generationNotice&&<section className="generation-uniqueness-notice"><Info size={18}/><span>{generationNotice}</span></section>}
    {appliedAlternative&&<section className="template-result generation-applied-alternative">
      <CheckCircle2 size={18}/>
      <span>{appliedAlternative}</span>
      <div className="generation-applied-actions">
        {undoSnapshot&&<button className="btn secondary-light" onClick={undoLastGenerationChange}>Deshacer último cambio</button>}
        <button className="btn primary" disabled={running} onClick={runGeneration}>{running?'Generando...':'Generar de nuevo'}</button>
      </div>
    </section>}

    {generationAlternatives.length>0&&<section className="generation-alternatives">
      <div className="groups-table-heading">
        <div><span className="panel-kicker">Alternativas posibles</span><h2>Qué puedes cambiar para desbloquear el horario</h2></div>
        {visibleAlternatives<generationAlternatives.length&&<button className="btn ghost-inline" onClick={()=>setVisibleAlternatives(value=>Math.min(value+1,generationAlternatives.length))}><Plus size={16}/> Añadir solución</button>}
      </div>
      <div className="generation-alternative-list">
        {generationAlternatives.slice(0,visibleAlternatives).map((item,index)=><article key={item.id}>
          <div className="generation-alternative-number">{index+1}</div>
          <div className="generation-alternative-copy"><strong>{item.title}</strong><p>{item.detail}</p></div>
          <div className="generation-alternative-actions">
            <button className="btn ghost-inline" onClick={()=>navigate(item.route)}>Ver datos</button>
            {item.action.kind!=='review_plan'&&item.action.kind!=='review_assignment'&&<>
              <button className="btn secondary-light" disabled={Boolean(simulatingAlternativeId)} onClick={()=>simulateGenerationAlternative(item)}>
                {simulatingAlternativeId===item.id?'Simulando...':'Simular'}
              </button>
              <button className="btn primary" onClick={()=>applyGenerationAlternative(item)}>Aplicar</button>
            </>}
          </div>
          {alternativeSimulation[item.id]&&<div className={'generation-alternative-impact '+(alternativeSimulation[item.id].valid?'valid':'invalid')}>
            <strong>{alternativeSimulation[item.id].valid?'La simulación encuentra una propuesta válida':'La simulación todavía detecta bloqueos'}</strong>
            <span>
              {alternativeSimulation[item.id].emptySlots} huecos · {alternativeSimulation[item.id].hardViolations} HARD · SOFT {alternativeSimulation[item.id].softPenalty} · {alternativeSimulation[item.id].placedSessions}/{alternativeSimulation[item.id].requestedSessions} sesiones
            </span>
          </div>}
        </article>)}
      </div>
    </section>}

    {runs.length===0&&retainedRuns.length===0
      ? <section className="generation-empty">
          <CalendarDays size={38}/>
          <h2>Todavía no hay propuestas</h2>
          <p>Genera tres alternativas iniciales para compararlas y elegir la que mejor encaje con el centro.</p>
        </section>
      : <>
        <section className="generation-history">
          <div className="groups-table-heading">
            <div><span className="panel-kicker">Comparación</span><h2>Propuestas y horarios guardados</h2></div>
            <div className="generation-history-actions">
              <button className="btn ghost-inline" title="Invertir orden" onClick={()=>setAscending(value=>!value)}>
                <ArrowDownUp size={15}/> {ascending?'1 → N':'N → 1'}
              </button>
              <button className="btn ghost-inline generation-add-more" disabled={running} onClick={runGeneration}>
                {running?<RefreshCcw className="spin" size={15}/>:<Plus size={15}/>} {running?'Generando...':'Generar otra propuesta'}
              </button>
            </div>
          </div>
          <div className="generation-run-list">
            {(ascending?[...runs]:[...runs].reverse()).map((run)=>{
              const originalIndex=runs.findIndex(item=>item.id===run.id)
              const first=runs[0]
              const diff=first&&run.id!==first.id?generationDifference(first,run):null
              const savedKind=establishedRun?.id===run.id?'established':draftRun?.id===run.id?'draft':null
              return <RunCard
                key={run.id}
                run={run}
                best={isBestRun(run,runs)}
                selected={run.id===selectedRun?.id}
                label={`Propuesta ${originalIndex+1}`}
                artifactKind={savedKind}
                difference={diff?.differentPlacements??0}
                baseline={run.id===first?.id}
                onClick={()=>{
                  setSelectedRunId(run.id)
                  saveProject({...project,selectedGenerationRunId:run.id},{intent:'selection'})
                }}
              />
            })}
            {retainedRuns.map(({run,kind})=>{
              const diff=baselineRun&&run.id!==baselineRun.id?generationDifference(baselineRun,run):null
              return <RunCard
                key={kind+'-'+run.id}
                run={run}
                best={false}
                selected={run.id===selectedRun?.id}
                label={kind==='draft'?'Borrador guardado':'Horario establecido'}
                artifactKind={kind}
                difference={diff?.differentPlacements??0}
                baseline={run.id===baselineRun?.id}
                onClick={()=>{
                  setSelectedRunId(run.id)
                  saveProject({...project,selectedGenerationRunId:run.id},{intent:'selection'})
                }}
              />
            })}
          </div>
        </section>

        {runs.length>1&&<section className="proposal-comparison-card">
          <div className="groups-table-heading">
            <div><span className="panel-kicker">Comparador avanzado</span><h2>Indicadores homogéneos</h2><p>Solo se recomienda una propuesta si tiene cobertura completa y cero HARD tras auditoría.</p></div>
          </div>
          <div className="proposal-comparison-wrap"><table className="proposal-comparison-table">
            <thead><tr><th>Propuesta</th><th>Cobertura</th><th>HARD</th><th>SOFT</th><th>Huecos docentes</th><th>Jornadas fragmentadas</th><th>Días medios</th><th>Cambios</th><th>Estado</th></tr></thead>
            <tbody>{comparisonRows.map(({run,index,metrics})=><tr key={run.id} className={recommended?.run.id===run.id?'recommended':''}>
              <td><button type="button" onClick={()=>{setSelectedRunId(run.id);saveProject({...project,selectedGenerationRunId:run.id},{intent:'selection'})}}>Propuesta {index+1}</button>{recommended?.run.id===run.id&&<em>Recomendada</em>}</td>
              <td>{Math.round(metrics.coverage*100)}%</td>
              <td>{metrics.hardViolations}</td>
              <td>{metrics.softPenalty}</td>
              <td>{metrics.totalTeacherGaps}</td>
              <td>{metrics.fragmentedTeacherDays}</td>
              <td>{metrics.averageTeachingDays.toFixed(1)}</td>
              <td>{metrics.changeCount}</td>
              <td>{metrics.valid?'Válida':'No válida'}</td>
            </tr>)}</tbody>
          </table></div>
          {recommended&&<div className="proposal-recommendation"><Trophy size={17}/><span><strong>Propuesta recomendada: {runs.findIndex(run=>run.id===recommended.run.id)+1}.</strong> Se prioriza validez, menor penalización SOFT, menos huecos docentes, menos jornadas fragmentadas y, cuando existe referencia, menos cambios. La elección sigue siendo manual.</span></div>}
        </section>}

        {selectedRun&&<section className="generation-result">
          <div className="generation-result-heading">
            <div>
              <span className="panel-kicker">Resultado seleccionado</span>
              <h2>{selectedRun.status==='complete'?'Horario completo':selectedRun.status==='partial'?'Horario parcial':'Horario no generado'}</h2>
              <p>{new Date(selectedRun.createdAt).toLocaleString('es-ES')}</p>
            </div>
            <div className="generation-result-actions">
              {selectedIsEstablished
                ? <span className="established-schedule-badge"><CalendarCheck2 size={16}/> Horario establecido</span>
                : <>
                    {selectedIsDraft
                      ? <span className="draft-schedule-badge"><CalendarDays size={16}/> Borrador guardado</span>
                      : <button
                          type="button"
                          className="btn secondary-light"
                          disabled={!proposalIsValid(selectedRun)}
                          onClick={()=>setShowDraftModal(true)}
                        ><CalendarDays size={16}/> Guardar borrador</button>}
                    <button
                      type="button"
                      className="btn primary"
                      disabled={!proposalIsValid(selectedRun)}
                      onClick={()=>setShowEstablishModal(true)}
                    ><CalendarCheck2 size={16}/> Guardar como horario del curso</button>
                  </>}
              <div className="generation-score"><Trophy size={18}/><strong>{selectedRun.score}</strong><small>puntuación</small></div>
            </div>
          </div>

          <section className="structure-summary">
            <Summary label="Sesiones colocadas" value={String(selectedRun.placedSessions)} detail={`de ${selectedRun.requestedSessions} solicitadas`}/>
            <Summary label="Incumplimientos HARD" value={String(selectedRun.hardViolations)} detail={selectedRun.hardViolations?'requieren revisión':'sin bloqueos'}/>
            <Summary label="Penalización SOFT" value={String(selectedRun.softPenalty)} detail="menor es mejor"/>
            <Summary label="Estado" value={selectedRun.status==='complete'?'Completo':selectedRun.status==='partial'?'Parcial':'Fallido'} detail="resultado del motor"/>
          </section>

          {(selectedRun.issues?.length??selectedRun.notes.length)>0&&<div className="generation-issues-summary">
            <div>
              <AlertTriangle size={18}/>
              <span>
                <strong>Hay incidencias que impiden completar el horario</strong>
                <small>{generationIssueSummary(selectedRun,project)}</small>
              </span>
            </div>
            <button className="btn secondary-light" onClick={()=>setShowIssuesModal(true)}>Ver incidencias</button>
          </div>}

          <div className="generation-toolbar generation-view-toolbar">
            <div className="generation-filter-stack">
              <span className="panel-kicker">Filtro</span>
              <div className="generation-view-switch">
                <button type="button" className={viewMode==='center'?'active':''} onClick={()=>setViewMode('center')}>Centro</button>
                <button type="button" className={viewMode==='group'?'active':''} onClick={()=>setViewMode('group')}>Por grupo</button>
                <button type="button" className={viewMode==='teacher'?'active':''} onClick={()=>setViewMode('teacher')}>Por docente</button>
              </div>
              {viewMode==='group'&&<div className="generation-group-tags">
                <button type="button" className={selectedGroupIds.includes('all')?'active':''} onClick={()=>toggleGroup('all')}>Todos</button>
                {activeGroups.map(group=><button key={group.id} type="button" className={!selectedGroupIds.includes('all')&&selectedGroupIds.includes(group.id)?'active':''} onClick={()=>toggleGroup(group.id)}>{group.name}</button>)}
              </div>}
              {viewMode==='teacher'&&<div className="generation-group-tags">
                {activeTeachers.map(teacher=><button key={teacher.id} type="button" className={selectedTeacherId===teacher.id?'active':''} onClick={()=>setSelectedTeacherId(teacher.id)}>{teacher.name}</button>)}
              </div>}
            </div>
          </div>

          {comparisonRun&&selectedRun.id!==comparisonRun.id&&<div className="generation-diff-legend">
            <span className="diff-swatch"/>
            <span>Marcado = colocación distinta respecto a {selectedReferenceRun?'la referencia de regeneración':'Propuesta 1'}</span>
          </div>}

          <div className="manual-edit-toolbar">
            <span><Pencil size={16}/> Edición segura activa: pulsa una sesión o arrástrala a otra franja.</span>
            {undoSnapshot&&<button className="btn ghost-inline" onClick={undoLastGenerationChange}><Undo2 size={15}/> Deshacer último cambio</button>}
          </div>
          {viewMode==='group'&&<SchedulePreview
            project={project}
            run={selectedRun}
            baselineRun={comparisonRun}
            groupIds={visibleGroupIds}
            days={visibleDays}
            onEdit={openScheduleEditor}
            onDropEntry={dropScheduleEntry}
            dragEntryId={dragEntryId}
            onDragEntry={setDragEntryId}
            locks={project.scheduleLocks??[]}
          />}
          {viewMode==='teacher'&&<TeacherSchedulePreview project={project} run={selectedRun} teacherId={selectedTeacherId} days={visibleDays} onEdit={openScheduleEditor}/>}
          {viewMode==='center'&&<CenterSchedulePreview project={project} run={selectedRun} days={visibleDays} onEdit={openScheduleEditor}/>} 
        </section>}
      </>}

    {runs.length>0&&<>
    <section className="generation-control-card">
      <div>
        <span className="panel-kicker">Motor heurístico</span>
        <h2>{runs.length===0?'Generar 3 propuestas':'Añadir otra propuesta'}</h2>
        <p>{runs.length===0
          ? '⩒Yeutika generará tres alternativas independientes para poder compararlas antes de decidir.'
          : 'Genera una nueva alternativa sin eliminar las propuestas existentes.'}</p>
      </div>
      <div className="generation-control-actions">
        {runs.length>0&&<>
          <button className="btn ghost-inline" onClick={()=>setShowClearModal(true)}>Limpiar propuestas</button>
          <button className="btn ghost-inline" disabled={running} onClick={()=>setShowRegenerateModal(true)}><RefreshCcw size={16}/> Regenerar 3 propuestas</button>
        </>}
        <button className="btn primary" disabled={running} onClick={runGeneration}>
          {running
            ? <RefreshCcw className="spin" size={16}/>
            : runs.length===0?<Sparkles size={16}/>:<Plus size={16}/>}
          {running
            ? (runs.length===0?'Generando 3 propuestas...':'Generando propuesta...')
            : (runs.length===0?'Generar 3 propuestas':'Generar otra propuesta')}
        </button>
      </div>
    </section>
    </>}

    {showRegenerateModal&&<AppModal
      title="Regenerar 3 propuestas"
      icon={<RefreshCcw size={22}/>}
      onClose={()=>setShowRegenerateModal(false)}
      footer={<>
        <button className="btn secondary-light" onClick={()=>setShowRegenerateModal(false)}>Cancelar</button>
        <button className="btn primary" disabled={running||!regenerationReferenceId} onClick={regenerateThree}>{running?'Generando...':'Generar 3 alternativas'}</button>
      </>}
    >
      <div className="regeneration-options">
        <p>Genera nuevas alternativas tomando un horario como referencia. <strong>La referencia nunca se sobrescribe.</strong> Los bloqueos y reglas HARD tienen prioridad sobre cualquier objetivo de cambio mínimo.</p>
        <label><span>Horario de referencia</span><select value={regenerationReferenceId} onChange={event=>setRegenerationReferenceId(event.target.value)}>
          <option value="">Selecciona referencia...</option>
          {regenerationReferences.map(item=><option key={item.run.id} value={item.run.id}>{item.label}</option>)}
        </select></label>
        <div className="regeneration-strategies">
          <button type="button" className={regenerationStrategy==='minimum_change'?'active':''} onClick={()=>setRegenerationStrategy('minimum_change')}>
            <strong>Cambiar lo mínimo posible</strong>
            <small>Penaliza mover sesiones respecto a la referencia después de cumplir HARD y bloqueos.</small>
          </button>
          <button type="button" className={regenerationStrategy==='optimize'?'active':''} onClick={()=>setRegenerationStrategy('optimize')}>
            <strong>Optimizar de nuevo</strong>
            <small>Busca el mejor reparto sin penalizar los cambios respecto a la referencia.</small>
          </button>
        </div>
      </div>
    </AppModal>}

    {showClearModal&&<AppModal
      title="Eliminar propuestas generadas"
      icon={<Trash2 size={22}/>}
      onClose={()=>setShowClearModal(false)}
      footer={<>
        <button className="btn secondary-light" onClick={()=>setShowClearModal(false)}>Cancelar</button>
        <button className="btn danger-modal" onClick={clearRuns}>Eliminar propuestas</button>
      </>}
    >
      <p>Se eliminará el historial de propuestas generadas, pero <strong>no se modificarán</strong> el horario establecido del curso, el centro, profesorado, asignaciones, reglas ni normativa.</p>
    </AppModal>}

    {showDraftModal&&selectedRun&&<AppModal
      title={draftRun?'Sustituir borrador guardado':'Guardar borrador del horario'}
      icon={<CalendarDays size={22}/>}
      onClose={()=>setShowDraftModal(false)}
      footer={<>
        <button className="btn secondary-light" onClick={()=>setShowDraftModal(false)}>Cancelar</button>
        <button className="btn primary" onClick={saveSelectedAsDraft}>
          {draftRun?'Sustituir borrador':'Guardar borrador'}
        </button>
      </>}
    >
      <p>{draftRun
        ? 'Ya existe un borrador temporal guardado. La propuesta seleccionada sustituirá ese borrador, sin modificar el horario establecido del curso.'
        : 'La propuesta seleccionada se guardará como borrador temporal para poder seguir haciendo cambios antes de establecer el horario definitivo.'}</p>
    </AppModal>}

    {showEstablishModal&&selectedRun&&<AppModal
      title={establishedRun?'Sustituir horario establecido':'Guardar horario del curso'}
      icon={<CalendarCheck2 size={22}/>}
      onClose={()=>setShowEstablishModal(false)}
      footer={<>
        <button className="btn secondary-light" onClick={()=>setShowEstablishModal(false)}>Cancelar</button>
        <button className="btn primary" onClick={establishSelectedSchedule}>
          {establishedRun?'Sustituir horario':'Guardar horario'}
        </button>
      </>}
    >
      <p>{establishedRun
        ? 'Ya existe un horario establecido para este curso. La propuesta seleccionada pasará a ser el horario oficial guardado y sustituirá al anterior.'
        : 'La propuesta seleccionada se guardará como horario establecido del curso y permanecerá disponible aunque después compares o generes otras propuestas.'}</p>
    </AppModal>}

    {editEntry&&selectedRun&&<AppModal
      title="Editar sesión"
      icon={<Pencil size={20}/>}
      onClose={()=>{setEditEntryId('');setEditError('')}}
      footer={<>
        <button className="btn secondary-light" onClick={()=>{setEditEntryId('');setEditError('')}}>Cancelar</button>
        <button className="btn primary" onClick={confirmScheduleEdit}>Validar y aplicar</button>
      </>}
    >
      <div className="schedule-edit-form">
        <label><span>Asignación</span><select value={editAssignmentId} onChange={event=>setEditAssignmentId(event.target.value)}>
          {project.assignments.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{assignmentLabel(project,item)}</option>)}
        </select></label>
        <label><span>Día</span><select value={editDay} onChange={event=>setEditDay(event.target.value as Weekday)}>
          {project.schedule.activeDays.map(day=><option key={day} value={day}>{dayLabels[day]}</option>)}
        </select></label>
        <label><span>Sesión</span><select value={editSessionId} onChange={event=>setEditSessionId(event.target.value)}>
          {teachingBlocks.map(block=><option key={block.id} value={block.id}>{block.label} · {block.start}–{block.end}</option>)}
        </select></label>
        <div className="schedule-lock-control">
          <div><strong><Lock size={15}/> Protección de sesión</strong><small>Posición fija la franja; Docente impide cambiar de profesor; Completo protege ambos y la asignación.</small></div>
          <select value={editLockMode} onChange={event=>setEditLockMode(event.target.value as ScheduleLockMode|'none')}>
            <option value="none">Sin bloqueo</option>
            <option value="position">Fijar posición</option>
            <option value="teacher">Fijar docente</option>
            <option value="full">Bloqueo completo</option>
          </select>
          <button type="button" className="btn secondary-light" onClick={saveEntryLock}>
            {editLockMode==='none'?<Unlock size={15}/>:<Lock size={15}/>} Guardar bloqueo
          </button>
        </div>
        {editEntry&&<div className="schedule-destination-map">
          <div className="schedule-destination-legend"><strong>Destinos</strong><span className="compatible">Compatible</span><span className="soft">SOFT</span><span className="occupied">Ocupado / conflicto</span><span className="hard">No disponible HARD</span></div>
          <div className="schedule-destination-grid" style={{'--destination-days':project.schedule.activeDays.length} as React.CSSProperties}>
            <div className="destination-corner">Sesión</div>
            {project.schedule.activeDays.map(day=><div className="destination-day-heading" key={'head-'+day}>{dayLabels[day]}</div>)}
            {teachingBlocks.flatMap(block=>[
              <div className="destination-session-heading" key={'session-'+block.id}><strong>{block.label}</strong><small>{block.start}–{block.end}</small></div>,
              ...project.schedule.activeDays.map(day=>{
                const rawState=scheduleCellState(project,project.draftScheduleRun?.id===selectedRun.id?project.draftScheduleRun:selectedRun,project.assignments.find(item=>item.id===editAssignmentId)?.teacherId??editEntry.teacherId,day,block.id)
                const probe=prepareScheduleEntryChange(project,selectedRun,{entryId:editEntry.id,assignmentId:editAssignmentId,day,sessionId:block.id})
                const state=probe.ok?(rawState==='soft'?'soft':'compatible'):(rawState==='hard'?'hard':'occupied')
                const isSwap=probe.ok&&selectedRun.entries.some(entry=>entry.id!==editEntry.id&&entry.groupId===editEntry.groupId&&entry.day===day&&entry.sessionId===block.id)
                const destinationLabel=isSwap?'Intercambio':probe.ok?(state==='soft'?'SOFT':'Disponible'):state==='hard'?'HARD':'Conflicto'
                return <button
                  type="button"
                  key={day+'-'+block.id}
                  className={'destination-cell '+state+(isSwap?' swap':'')+(editDay===day&&editSessionId===block.id?' selected':'')}
                  title={probe.ok?(isSwap?'Intercambio compatible':probe.message):probe.message}
                  onClick={()=>{if(probe.ok){setEditDay(day);setEditSessionId(block.id);setEditError('')}else setEditError(probe.message)}}
                  disabled={state==='hard'}
                >
                  <strong>{isSwap?'↔':probe.ok?'✓':'×'}</strong>
                  <small>{destinationLabel}</small>
                </button>
              })
            ])}
          </div>
        </div>}
        <div className="schedule-edit-safety"><CheckCircle2 size={17}/><span>El cambio solo se guardará si supera disponibilidad, solapes, carga, reglas HARD y auditoría completa.</span></div>
        {editError&&<div className="notice danger"><AlertTriangle size={17}/><span>{editError}</span></div>}
      </div>
    </AppModal>}

    {showIssuesModal&&selectedRun&&<GenerationIssuesModal
      project={project}
      run={selectedRun}
      onClose={()=>setShowIssuesModal(false)}
      navigate={navigate}
    />}
  </div>
}

function RunCard({
  run,best,selected,label,difference,baseline,artifactKind,onClick,
}:{
  run:GenerationRun
  best:boolean
  selected:boolean
  label:string
  difference:number
  baseline:boolean
  artifactKind:'draft'|'established'|null
  onClick:()=>void
}) {
  const Icon=run.status==='complete'?CheckCircle2:run.status==='partial'?AlertTriangle:XCircle
  return <button className={'generation-run-card '+(selected?'selected ':'')+run.status} onClick={onClick}>
    <Icon size={18}/>
    <span className="generation-run-main">
      <strong>{label}{best&&<em>Mejor</em>}{artifactKind==='draft'&&<em className="draft-inline-badge">Borrador</em>}{artifactKind==='established'&&<em className="established-inline-badge">Establecido</em>}</strong>
      <small>{run.placedSessions}/{run.requestedSessions} sesiones · HARD {run.hardViolations} · SOFT {run.softPenalty}{run.referenceRunId?` · Cambios ${run.changeCount??0}`:''}</small>
      <small className="generation-difference">{baseline?'Referencia para comparar':difference===0?'Sin diferencias frente a la referencia':`${difference} colocaciones distintas frente a la referencia`}</small>
    </span>
    <span className="generation-run-score">{run.score}</span>
  </button>
}

function SchedulePreview({
  project,run,baselineRun,groupIds,days,onEdit,onDropEntry,dragEntryId,onDragEntry,locks,
}:{
  project:ViyeuticaProject
  run:GenerationRun
  baselineRun:GenerationRun|null
  groupIds:string[]
  days:Weekday[]
  onEdit:(entryId:string,target?:{day:Weekday;sessionId:string})=>void
  onDropEntry:(entryId:string,day:Weekday,sessionId:string)=>void
  dragEntryId:string
  onDragEntry:(entryId:string)=>void
  locks:ViyeuticaProject['scheduleLocks']
}) {
  const teachingBlocks=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
  const draggedEntry=dragEntryId?run.entries.find(entry=>entry.id===dragEntryId)??null:null
  return <div className={'generation-multi-schedule '+(draggedEntry?'is-dragging':'')}>
    {groupIds.map(groupId=>{
      const group=project.groups.find(item=>item.id===groupId)
      const entries=run.entries.filter(entry=>entry.groupId===groupId)
      const isDragGroup=Boolean(draggedEntry&&draggedEntry.groupId===groupId)
      const isOtherGroup=Boolean(draggedEntry&&!isDragGroup)
      return <section
        className={'generation-group-schedule '+(isDragGroup?'schedule-drag-active-group ':'')+(isOtherGroup?'schedule-drag-disabled-group':'')}
        key={groupId}
      >
        <div className="generation-group-heading">
          <strong>{group?.name??'Grupo'}</strong>
          {isDragGroup
            ? <small className="schedule-drag-heading">Selecciona una franja verde</small>
            : isOtherGroup
              ? <small>Movimiento disponible solo dentro del grupo de origen</small>
              : baselineRun&&run.id!==baselineRun.id
                ? <small>{groupDifferenceCount(run,baselineRun,groupId)} cambios respecto a Propuesta 1</small>
                : null}
        </div>
        <div className="generated-schedule-wrap">
          <table className="generated-schedule">
            <thead><tr><th>Sesión</th>{days.map(day=><th key={day}>{dayLabels[day]}</th>)}</tr></thead>
            <tbody>{teachingBlocks.map(block=><tr key={block.id}>
              <th><strong>{block.label}</strong><small>{block.start}–{block.end}</small></th>
              {project.schedule.activeDays.map(day=>{
                const cell=entries.filter(entry=>entry.day===day&&entry.sessionId===block.id)
                const primary=cell[0]
                const changed=baselineRun&&run.id!==baselineRun.id
                  ? cellDiffersFromBaseline(run,baselineRun,groupId,day,block.id)
                  : false

                const isOrigin=Boolean(
                  draggedEntry&&isDragGroup&&draggedEntry.day===day&&draggedEntry.sessionId===block.id
                )
                const preview=draggedEntry&&isDragGroup&&!isOrigin
                  ? previewScheduleEntryChange(project,run,{
                      entryId:draggedEntry.id,
                      assignmentId:draggedEntry.assignmentId,
                      day,
                      sessionId:block.id,
                    })
                  : null
                const state=isOrigin?'origin':preview?.allowed?'valid':preview?'invalid':'idle'
                const canDrop=state==='valid'
                const dropProps={
                  onDragOver:(event:React.DragEvent<HTMLTableCellElement>)=>{
                    if(!canDrop)return
                    event.preventDefault()
                    event.dataTransfer.dropEffect='move'
                  },
                  onDrop:(event:React.DragEvent<HTMLTableCellElement>)=>{
                    if(!canDrop)return
                    event.preventDefault()
                    onDropEntry(draggedEntry!.id,day,block.id)
                  },
                }
                const stateClass=state==='valid'
                  ? ' schedule-drop-valid'
                  : state==='invalid'
                    ? ' schedule-drop-invalid'
                    : state==='origin'
                      ? ' schedule-drop-origin'
                      : ''
                const title=state==='valid'
                  ? 'Destino disponible'
                  : state==='invalid'
                    ? preview?.message
                    : state==='origin'
                      ? 'Posición actual'
                      : undefined

                if(!primary)return <td
                  key={day}
                  {...dropProps}
                  title={title}
                  className={'empty-slot schedule-drop-target '+(changed?'proposal-diff-cell ':'')+stateClass}
                >—</td>

                const subject=project.subjects.find(item=>item.id===primary.subjectId)
                const teachers=cell.map(entry=>project.teachers.find(item=>item.id===entry.teacherId)?.name).filter(Boolean)
                return <td
                  key={day}
                  {...dropProps}
                  title={title}
                  className={(changed?'proposal-diff-cell ':'')+'schedule-edit-cell'+stateClass}
                >
                  <button
                    type="button"
                    className={'schedule-entry-edit '+(dragEntryId===primary.id?'is-being-dragged':'')}
                    draggable={!draggedEntry||dragEntryId===primary.id}
                    onDragStart={()=>onDragEntry(primary.id)}
                    onDragEnd={()=>onDragEntry('')}
                    onClick={()=>onEdit(primary.id)}
                    title="Editar o mover sesión"
                  >
                    <strong>{subject?.name??'Materia'}</strong>
                    <small>{teachers.join(' + ')}</small>
                    <Pencil size={12}/>
                    {locks.some(lock=>lock.assignmentId===primary.assignmentId&&lock.day===primary.day&&lock.sessionId===primary.sessionId)&&<span className="schedule-cell-lock" title="Sesión bloqueada"><Lock size={11}/></span>}
                  </button>
                  {changed&&baselineRun&&<span className="proposal-diff-tooltip">{baselineCellLabel(project,baselineRun,groupId,day,block.id)}</span>}
                </td>
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    })}
  </div>
}

function TeacherSchedulePreview({
  project,run,teacherId,days,onEdit,
}:{
  project:ViyeuticaProject
  run:GenerationRun
  teacherId:string
  days:Weekday[]
  onEdit:(entryId:string,target?:{day:Weekday;sessionId:string})=>void
}){
  const teacher=project.teachers.find(item=>item.id===teacherId)
  const blocks=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
  return <section className="generation-group-schedule">
    <div className="generation-group-heading"><strong>{teacher?.name??'Selecciona docente'}</strong><small>Vista docente</small></div>
    <div className="generated-schedule-wrap"><table className="generated-schedule">
      <thead><tr><th>Sesión</th>{days.map(day=><th key={day}>{dayLabels[day]}</th>)}</tr></thead>
      <tbody>{blocks.map(block=><tr key={block.id}>
        <th><strong>{block.label}</strong><small>{block.start}–{block.end}</small></th>
        {days.map(day=>{
          const cell=run.entries.filter(entry=>entry.teacherId===teacherId&&entry.day===day&&entry.sessionId===block.id)
          if(!cell.length)return <td key={day} className="empty-slot">—</td>
          return <td key={day} className="schedule-edit-cell">{cell.map(entry=>{
            const subject=project.subjects.find(item=>item.id===entry.subjectId)?.name??'Materia'
            const group=project.groups.find(item=>item.id===entry.groupId)?.name??'Grupo'
            const assignment=project.assignments.find(item=>item.id===entry.assignmentId)
            return <button type="button" className="schedule-entry-edit" key={entry.id} onClick={()=>onEdit(entry.id)}>
              <strong>{subject}</strong><small>{group}{assignment?.assignmentType!=='main'?' · '+(assignment?.assignmentType==='support'?'Apoyo':'Codocencia'):''}</small><Pencil size={12}/>
            </button>
          })}</td>
        })}
      </tr>)}</tbody>
    </table></div>
  </section>
}

function CenterSchedulePreview({
  project,run,days,onEdit,
}:{
  project:ViyeuticaProject
  run:GenerationRun
  days:Weekday[]
  onEdit:(entryId:string,target?:{day:Weekday;sessionId:string})=>void
}){
  const blocks=project.schedule.blocks.filter(block=>block.active&&block.type==='teaching')
  return <section className="center-schedule-view">
    {days.map(day=><article key={day} className="center-day-card">
      <div className="generation-group-heading"><strong>{dayLabels[day]}</strong><small>{run.entries.filter(entry=>entry.day===day).length} actividades</small></div>
      <div className="center-day-slots">{blocks.map(block=>{
        const entries=run.entries.filter(entry=>entry.day===day&&entry.sessionId===block.id)
        return <div className="center-slot" key={block.id}>
          <header><strong>{block.label}</strong><small>{block.start}–{block.end}</small></header>
          <div>{entries.map(entry=>{
            const subject=project.subjects.find(item=>item.id===entry.subjectId)?.name??'Materia'
            const group=project.groups.find(item=>item.id===entry.groupId)?.name??'Grupo'
            const teacher=project.teachers.find(item=>item.id===entry.teacherId)?.name??'Docente'
            const assignment=project.assignments.find(item=>item.id===entry.assignmentId)
            return <button type="button" key={entry.id} onClick={()=>onEdit(entry.id)}>
              <strong>{group} · {subject}</strong><small>{teacher}{assignment?.assignmentType!=='main'?' · '+(assignment?.assignmentType==='support'?'Apoyo':'Codocencia'):''}</small>
            </button>
          })}</div>
        </div>
      })}</div>
    </article>)}
  </section>
}

function baselineCellLabel(
  project:ViyeuticaProject,
  baseline:GenerationRun,
  groupId:string,
  day:Weekday,
  sessionId:string,
){
  const cell=baseline.entries.filter(entry=>entry.groupId===groupId&&entry.day===day&&entry.sessionId===sessionId)
  if(!cell.length)return 'Propuesta 1: hueco libre'
  const primary=cell[0]
  const subject=project.subjects.find(item=>item.id===primary.subjectId)?.name??'Materia'
  const teachers=[...new Set(cell.map(entry=>project.teachers.find(item=>item.id===entry.teacherId)?.name).filter(Boolean))]
  return 'Propuesta 1:\n'+subject+(teachers.length?' ('+teachers.join(' + ')+')':'')
}

function cellSignature(run:GenerationRun,groupId:string,day:Weekday,sessionId:string){
  return run.entries
    .filter(entry=>entry.groupId===groupId&&entry.day===day&&entry.sessionId===sessionId)
    .map(entry=>[entry.assignmentId,entry.subjectId,entry.teacherId].join('|'))
    .sort()
    .join('||')
}

function cellDiffersFromBaseline(run:GenerationRun,baseline:GenerationRun,groupId:string,day:Weekday,sessionId:string){
  return cellSignature(run,groupId,day,sessionId)!==cellSignature(baseline,groupId,day,sessionId)
}

function groupDifferenceCount(run:GenerationRun,baseline:GenerationRun,groupId:string){
  const slots=new Set<string>()
  for(const entry of [...run.entries,...baseline.entries]){
    if(entry.groupId===groupId)slots.add(entry.day+'|'+entry.sessionId)
  }
  let changes=0
  for(const slot of slots){
    const [day,sessionId]=slot.split('|')
    if(cellDiffersFromBaseline(run,baseline,groupId,day as Weekday,sessionId))changes++
  }
  return changes
}

function isBestRun(run:GenerationRun,runs:GenerationRun[]){
  const best=[...runs].sort((a,b)=>a.hardViolations-b.hardViolations||b.score-a.score)[0]
  return best?.id===run.id
}
function Summary({label,value,detail}:{label:string;value:string;detail:string}){return <article className="structure-summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>}


function generationIssueSummary(run:GenerationRun,project:ViyeuticaProject){
  const issues=humanGenerationIssues(run,project)
  if(!issues.length) return 'La propuesta contiene incidencias técnicas que deben revisarse.'
  const groups=new Set(issues.map(issue=>issue.group))
  const teachers=new Set(issues.map(issue=>issue.teacher))
  return `${issues.length} ${issues.length===1?'incidencia':'incidencias'} · ${groups.size} ${groups.size===1?'grupo afectado':'grupos afectados'} · ${teachers.size} ${teachers.size===1?'docente implicado':'docentes implicados'}`
}

function humanGenerationIssues(run:GenerationRun,project:ViyeuticaProject){
  if(run.issues?.length){
    return run.issues.map(issue=>{
      const group=project.groups.find(item=>item.id===issue.groupId)?.name??'Grupo no identificado'
      const subject=project.subjects.find(item=>item.id===issue.subjectId)?.name??'Materia no identificada'
      const teacher=project.teachers.find(item=>item.id===issue.teacherId)?.name??'Docente no identificado'
      const assignment=project.assignments.find(item=>item.id===issue.assignmentId)
      const type=assignment?.assignmentType==='support'?'apoyo':assignment?.assignmentType==='co_teaching'?'codocencia':'docencia'
      const reason=issue.diagnostics
        ? explainGenerationDiagnostics(project,issue.teacherId,issue.diagnostics)
        : explainGenerationCause(project,issue.teacherId,issue.groupId,issue.subjectId)
      return {
        id:issue.id,
        group,
        subject,
        teacher,
        missing:issue.missingSessions,
        severity:issue.severity,
        title:issue.type==='unplaced_support'
          ? `No se han podido colocar ${issue.missingSessions} sesiones de ${type}`
          : `No se ha podido colocar ${issue.missingSessions===1?'una sesión':issue.missingSessions+' sesiones'}`,
        reason,
      }
    })
  }
  return run.notes.map((note,index)=>({
    id:'legacy_'+index,
    group:'No identificado',
    subject:'No identificada',
    teacher:'No identificado',
    missing:1,
    severity:'error' as const,
    title:'Incidencia de una propuesta anterior',
    reason:'Esta propuesta fue generada con una versión anterior de ⩒Yeutika. Vuelve a generar para obtener un diagnóstico detallado.',
  }))
}

function explainGenerationDiagnostics(
  project:ViyeuticaProject,
  teacherId:string,
  diagnostics:{
    candidateSlots:number
    unavailableCount:number
    groupBusyCount:number
    teacherBusyCount:number
    hardRuleCount:number
    fixedTarget:boolean
  },
){
  const teacher=project.teachers.find(item=>item.id===teacherId)?.name??'El docente'
  const parts:string[]=[]

  if(diagnostics.fixedTarget) parts.push('la sesión estaba condicionada por una franja fija')
  if(diagnostics.unavailableCount) parts.push(teacher+' no estaba disponible en '+diagnostics.unavailableCount+' de '+diagnostics.candidateSlots+' franjas candidatas')
  if(diagnostics.groupBusyCount) parts.push('el grupo ya estaba ocupado en '+diagnostics.groupBusyCount+' franjas')
  if(diagnostics.teacherBusyCount) parts.push(teacher+' ya tenía otra sesión en '+diagnostics.teacherBusyCount+' franjas')
  if(diagnostics.hardRuleCount) parts.push(diagnostics.hardRuleCount+' franjas quedaban descartadas por reglas HARD')
  if(!parts.length) parts.push('las combinaciones candidatas restantes no permitían una colocación compatible')

  return parts.join('; ')+'.'
}
function explainGenerationCause(project:ViyeuticaProject,teacherId:string,groupId:string,subjectId:string){
  const teacher=project.teachers.find(item=>item.id===teacherId)
  const blocked=project.teacherAvailability.filter(item=>item.teacherId===teacherId&&(item.status==='unavailable'||item.status==='travel')).length
  const fixed=project.assignments.find(item=>item.active&&item.teacherId===teacherId&&item.groupId===groupId&&item.subjectId===subjectId)?.fixedSlots?.length??0
  const activeHard=project.rules.filter(rule=>rule.active&&rule.ruleType==='HARD').length
  const clues:string[]=[]
  if(blocked) clues.push(`${teacher?.name??'El docente'} tiene ${blocked} franjas no disponibles o de desplazamiento`)
  if(fixed) clues.push(`la asignación tiene ${fixed} franjas fijadas`)
  if(activeHard) clues.push(`hay ${activeHard} reglas obligatorias activas que restringen la colocación`)
  if(!clues.length) clues.push('no queda una combinación libre de grupo, docente y sesión que cumpla las restricciones actuales')
  return clues.join('; ')+'.'
}

function GenerationIssuesModal({
  project,run,onClose,navigate,
}:{
  project:ViyeuticaProject
  run:GenerationRun
  onClose:()=>void
  navigate:(path:string)=>void
}){
  const issues=humanGenerationIssues(run,project)
  return <AppModal
    title="Incidencias de generación"
    icon={<AlertTriangle size={22}/>}
    onClose={onClose}
    wide
    footer={<>
      <button className="btn secondary-light" onClick={onClose}>Cerrar</button>
      <button className="btn primary" onClick={()=>{onClose();navigate('/prevalidacion')}}>Revisar prevalidación</button>
    </>}
  >
    <div className="generation-issues-intro">
      <Info size={18}/>
      <p>⩒Yeutika no muestra códigos internos. Cada incidencia indica <strong>qué carga no ha podido colocarse</strong>, a quién afecta y una causa probable para orientar la corrección.</p>
    </div>
    <div className="generation-issues-list">
      {issues.map((issue,index)=><article key={issue.id}>
        <div className={'generation-issue-number '+issue.severity}>{index+1}</div>
        <div className="generation-issue-body">
          <strong>{issue.title}</strong>
          <div className="generation-issue-tags">
            <span>{issue.group}</span><span>{issue.subject}</span><span>{issue.teacher}</span>
          </div>
          <p><b>Por qué puede ocurrir:</b> {issue.reason}</p>
          <p><b>Qué revisar:</b> disponibilidad del docente, ocupación del grupo, franjas fijas, número de sesiones exigidas y reglas HARD que afecten a este grupo o materia.</p>
        </div>
      </article>)}
    </div>
  </AppModal>
}


function buildGenerationAlternatives(project:ViyeuticaProject,run?:GenerationRun):GenerationAlternative[]{
  if(!run)return []
  const alternatives:GenerationAlternative[]=[]
  const empty=emptyGroupTeachingSlots(project,run)
  const seen=new Set<string>()

  for(const slot of empty){
    const group=project.groups.find(item=>item.id===slot.groupId)
    const block=project.schedule.blocks.find(item=>item.id===slot.sessionId)
    const assignments=project.assignments.filter(item=>item.active&&item.assignmentType==='main'&&item.groupId===slot.groupId)
    const pending=assignments.filter(assignment=>{
      const plan=project.studyPlan.find(item=>item.active&&item.groupId===assignment.groupId&&item.subjectId===assignment.subjectId)
      const expected=(assignment.weeklySessions??0)>0?assignment.weeklySessions!:(plan?.weeklySessions??0)
      const placed=run.entries.filter(entry=>entry.assignmentId===assignment.id).length
      return placed<expected
    })

    if(!pending.length){
      const key='review-plan|'+slot.groupId
      if(!seen.has(key)){
        seen.add(key)
        alternatives.push({
          id:key,
          title:'Revisar cobertura semanal de '+(group?.name??'el grupo'),
          detail:'Todas las sesiones exigidas ya están colocadas, pero queda al menos una franja lectiva sin sesión principal. Revisa la distribución del Plan de estudios; ⩒Yeutika no aumentará automáticamente la carga de ninguna materia.',
          route:'/materias?groupId='+encodeURIComponent(slot.groupId),
          action:{kind:'review_plan',groupId:slot.groupId},
        })
      }
      continue
    }

    for(const assignment of pending){
      const subject=project.subjects.find(item=>item.id===assignment.subjectId)
      const teacher=project.teachers.find(item=>item.id===assignment.teacherId)
      const blocked=project.teacherAvailability.find(item=>
        item.teacherId===assignment.teacherId &&
        item.day===slot.day &&
        item.session===slot.sessionId &&
        (item.status==='unavailable'||item.status==='travel')
      )
      if(blocked){
        const key='availability|'+assignment.teacherId+'|'+slot.day+'|'+slot.sessionId
        if(!seen.has(key)){
          seen.add(key)
          alternatives.push({
            id:key,
            title:'Habilitar '+(teacher?.name??'docente')+' en '+dayLabels[slot.day]+' · '+(block?.label??'sesión'),
            detail:'Cambiará esa franja de no disponible/desplazamiento a disponible para poder colocar '+(subject?.name??'la materia')+' en '+(group?.name??'el grupo')+'.',
            route:'/asignaciones',
            action:{kind:'free_availability',teacherId:assignment.teacherId,day:slot.day,sessionId:slot.sessionId},
          })
        }
        continue
      }

      const busy=run.entries.some(entry=>
        entry.teacherId===assignment.teacherId &&
        entry.day===slot.day &&
        entry.sessionId===slot.sessionId
      )
      if(!busy){
        const key='fix|'+assignment.id+'|'+slot.day+'|'+slot.sessionId
        if(!seen.has(key)){
          seen.add(key)
          alternatives.push({
            id:key,
            title:'Fijar '+(subject?.name??'materia')+' en '+dayLabels[slot.day]+' · '+(block?.label??'sesión'),
            detail:'Añadirá esta franja fija a la asignación de '+(teacher?.name??'docente')+' para '+(group?.name??'el grupo')+'.',
            route:'/asignaciones',
            action:{kind:'fix_slot',assignmentId:assignment.id,day:slot.day,sessionId:slot.sessionId},
          })
        }
      }
      if(alternatives.length>=8)break
    }
    if(alternatives.length>=8)break
  }

  for(const issue of run.issues??[]){
    if(alternatives.length>=8)break
    const key='issue|'+issue.assignmentId
    if(seen.has(key))continue
    const assignment=project.assignments.find(item=>item.id===issue.assignmentId)
    const group=project.groups.find(item=>item.id===issue.groupId)
    const subject=project.subjects.find(item=>item.id===issue.subjectId)
    const teacher=project.teachers.find(item=>item.id===issue.teacherId)
    const diagnostics=issue.diagnostics
    const reasons:string[]=[]
    if(diagnostics?.fixedTarget)reasons.push('la sesión está condicionada por una franja fija')
    if(diagnostics?.unavailableCount)reasons.push((teacher?.name??'El docente')+' no está disponible en '+diagnostics.unavailableCount+' franjas candidatas')
    if(diagnostics?.teacherBusyCount)reasons.push((teacher?.name??'El docente')+' ya está ocupado en '+diagnostics.teacherBusyCount+' franjas')
    if(diagnostics?.groupBusyCount)reasons.push('el grupo ya está ocupado en '+diagnostics.groupBusyCount+' franjas')
    if(diagnostics?.hardRuleCount)reasons.push(diagnostics.hardRuleCount+' franjas quedan descartadas por reglas HARD')
    if(!reasons.length)reasons.push('el motor no ha encontrado una colocación compatible para todas las sesiones exigidas')
    seen.add(key)
    alternatives.push({
      id:key,
      title:'Revisar '+(subject?.name??'la materia')+' en '+(group?.name??'el grupo'),
      detail:'Falta'+(issue.missingSessions===1?'':'n')+' '+issue.missingSessions+' '+(issue.missingSessions===1?'sesión':'sesiones')+' de '+(teacher?.name??'su docente')+': '+reasons.join('; ')+'.',
      route:'/asignaciones?assignmentId='+encodeURIComponent(assignment?.id??issue.assignmentId),
      action:{kind:'review_assignment',assignmentId:assignment?.id??issue.assignmentId},
    })
  }

  for(const auditIssue of auditGeneration(project,run).issues.filter(issue=>issue.severity==='error')){
    if(alternatives.length>=8)break
    const key='audit|'+auditIssue.code+'|'+(auditIssue.groupId??'')+'|'+(auditIssue.teacherId??'')+'|'+(auditIssue.subjectId??'')+'|'+(auditIssue.day??'')+'|'+(auditIssue.sessionId??'')
    if(seen.has(key))continue
    seen.add(key)
    const group=project.groups.find(item=>item.id===auditIssue.groupId)
    const subject=project.subjects.find(item=>item.id===auditIssue.subjectId)
    const teacher=project.teachers.find(item=>item.id===auditIssue.teacherId)
    const assignment=project.assignments.find(item=>
      item.active&&
      (!auditIssue.groupId||item.groupId===auditIssue.groupId)&&
      (!auditIssue.subjectId||item.subjectId===auditIssue.subjectId)&&
      (!auditIssue.teacherId||item.teacherId===auditIssue.teacherId)
    )
    const route=assignment
      ? '/asignaciones?assignmentId='+encodeURIComponent(assignment.id)
      : auditIssue.category==='Reglas'
        ? '/reglas'
        : auditIssue.category==='Cobertura'&&auditIssue.groupId
          ? '/materias?groupId='+encodeURIComponent(auditIssue.groupId)
          : auditIssue.teacherId
            ? '/asignaciones?teacherId='+encodeURIComponent(auditIssue.teacherId)
            : '/prevalidacion'
    alternatives.push({
      id:key,
      title:'Revisar '+(subject?.name??auditIssue.category)+(group?' en '+group.name:''),
      detail:auditIssue.message+(auditIssue.detail?' '+auditIssue.detail:'')+(teacher?' Docente: '+teacher.name+'.':''),
      route,
      action:assignment
        ? {kind:'review_assignment',assignmentId:assignment.id}
        : {kind:'review_plan',groupId:auditIssue.groupId??''},
    })
  }

  return alternatives.slice(0,8)
}
