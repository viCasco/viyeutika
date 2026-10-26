import { useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, CircleAlert, ClipboardCheck, Info, RefreshCcw,
  ShieldCheck, Sparkles,
} from 'lucide-react'
import {
  isRulesComplete,
  runPrevalidation,
  type PrevalidationIssue,
  type ViyeuticaProject,
} from '../domain/project'
import { WizardStepper } from '../components/WizardStepper'

export function PrevalidationPage({
  project,
  navigate,
}:{
  project:ViyeuticaProject
  navigate:(path:string)=>void
}) {
  const [version,setVersion]=useState(0)
  const [refreshing,setRefreshing]=useState(false)
  const issues=useMemo(()=>runPrevalidation(project),[project,version])
  const errors=issues.filter(issue=>issue.severity==='error')
  const warnings=issues.filter(issue=>issue.severity==='warning')
  const infos=issues.filter(issue=>issue.severity==='info')
  const ready=errors.length===0 && isRulesComplete(project)
  const engineHardCount=3
  const normativeDerivedHardCount=project.teachers.flatMap(teacher=>
    (teacher.dedications??[]).filter(item=>
      item.source==='normative'&&item.status==='applicable'&&item.affectsTeachingLoad
    )
  ).length
  const projectHardCount=project.rules.filter(rule=>rule.active&&rule.ruleType==='HARD').length
  const softCount=project.rules.filter(rule=>rule.active&&rule.ruleType==='SOFT').length
  const effectiveHardCount=engineHardCount+normativeDerivedHardCount+projectHardCount
  const effectiveRuleCount=effectiveHardCount+softCount

  const refreshPrevalidation=()=>{
    if(refreshing)return
    setRefreshing(true)
    window.setTimeout(()=>{
      setVersion(value=>value+1)
      setRefreshing(false)
    },500)
  }

  return <div className="wizard-page prevalidation-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><ClipboardCheck size={28}/> Prevalidación</h1>
        <p>Comprueba la coherencia completa del proyecto antes de generar horarios. Los errores bloquean la generación; las advertencias requieren revisión; la información no bloquea.</p>
      </div>
      <div className="wizard-progress-summary"><strong>8 <span>de 9</span></strong><small>Prevalidación</small></div>
    </section>

    <WizardStepper currentStep={8} project={project} navigate={navigate}/>

    {refreshing
      ? <PrevalidationSummarySkeleton/>
      : <section className="structure-summary">
          <Summary label="Errores" value={String(errors.length)} detail="Bloquean generación"/>
          <Summary label="Advertencias" value={String(warnings.length)} detail="Requieren revisión"/>
          <Summary label="Información" value={String(infos.length)} detail="Observaciones"/>
          <Summary label="Reglas activas" value={String(effectiveRuleCount)} detail="Incluye Motor + HARD + SOFT"/>
        </section>}

    <section className="prevalidation-hero">
      {refreshing
        ? <div className="prevalidation-status-skeleton" aria-live="polite" aria-label="Comprobando proyecto">
            <div className="prevalidation-skeleton-icon"/>
            <div className="prevalidation-skeleton-copy">
              <span className="prevalidation-skeleton-line short"/>
              <span className="prevalidation-skeleton-line title"/>
              <span className="prevalidation-skeleton-line"/>
            </div>
          </div>
        : <div className={'prevalidation-status '+(ready?'ready':'blocked')}>
            {ready?<CheckCircle2 size={34}/>:<CircleAlert size={34}/>}
            <div>
              <span className="panel-kicker">{ready?'Resultado':'Revisión necesaria'}</span>
              <h2>{ready?'Proyecto listo para generar':'La generación está bloqueada'}</h2>
              <p>{ready
                ? warnings.length
                  ? `No hay errores bloqueantes. Quedan ${warnings.length} ${warnings.length===1?'advertencia que conviene revisar':'advertencias que conviene revisar'} antes de generar.`
                  : 'No se han detectado errores estructurales ni incumplimientos bloqueantes en la configuración actual.'
                : `Hay ${errors.length} ${errors.length===1?'error que debe resolverse':'errores que deben resolverse'} antes de generar un horario.`}</p>
            </div>
          </div>}
      <button className="btn ghost-inline" disabled={refreshing} onClick={refreshPrevalidation}>
        <RefreshCcw size={15} className={refreshing?'spin':''}/> {refreshing?'Comprobando…':'Volver a comprobar'}
      </button>
    </section>

    {refreshing
      ? <PrevalidationSectionsSkeleton/>
      : <section className="prevalidation-sections">
      <IssueSection
        title="Errores que bloquean"
        description="Deben quedar a cero antes de permitir la generación."
        issues={errors}
        severity="error"
        project={project}
        navigate={navigate}
      />
      <IssueSection
        title="Advertencias"
        description="No bloquean automáticamente, pero conviene revisarlas antes de generar."
        issues={warnings}
        severity="warning"
        project={project}
        navigate={navigate}
      />
      <IssueSection
        title="Información"
        description="Observaciones sobre el estado del proyecto y preferencias activas."
        issues={infos}
        severity="info"
        project={project}
        navigate={navigate}
      />
    </section>}

    {refreshing
      ? <PrevalidationRuleSummarySkeleton/>
      : <section className="prevalidation-rule-summary">
      <div>
        <ShieldCheck size={24}/>
        <span>
          <strong>Cómo se usan las reglas</strong>
          <small>Las HARD forman parte de los bloqueos y restricciones obligatorias. Las SOFT no invalidan el proyecto: se trasladarán al generador como preferencias con prioridad para comparar soluciones.</small>
        </span>
      </div>
      <div className="rule-counts">
        <span><strong>{effectiveHardCount}</strong><small>HARD</small></span>
        <span><strong>{softCount}</strong><small>SOFT</small></span>
      </div>
    </section>}

    <section className="prevalidation-actions">
      <button className="btn secondary-light" disabled={refreshing} onClick={()=>navigate('/reglas')}>Volver a Reglas</button>
      <button className="btn primary" disabled={!ready||refreshing} onClick={()=>navigate('/horarios')}><Sparkles size={16}/> Ir a Horarios</button>
    </section>
  </div>
}

function IssueSection({
  title,description,issues,severity,project,navigate,
}:{
  title:string
  description:string
  issues:PrevalidationIssue[]
  severity:'error'|'warning'|'info'
  project:ViyeuticaProject
  navigate:(path:string)=>void
}) {
  const Icon=severity==='error'?CircleAlert:severity==='warning'?AlertTriangle:Info
  return <section className={'prevalidation-card '+severity}>
    <div className="prevalidation-card-heading">
      <div><Icon size={20}/><span><strong>{title}</strong><small>{description}</small></span></div>
      <span className="prevalidation-count">{issues.length}</span>
    </div>
    {issues.length===0
      ? <div className="prevalidation-empty"><CheckCircle2 size={18}/><span>Sin incidencias</span></div>
      : <div className="prevalidation-issue-list">{issues.map(issue=><article key={issue.id}>
          <div>
            <div className="prevalidation-issue-meta"><span>{issue.section}</span></div>
            <strong>{issue.message}</strong>
            {issue.detail&&<p>{issue.detail}</p>}
            <p className="prevalidation-guidance"><strong>Qué hacer:</strong> {issueGuidance(issue)}</p>
          </div>
          <button
            className="btn ghost-inline"
            onClick={()=>navigate(issueRoute(issue,project))}
          >{severity==='error'?'Corregir':severity==='warning'?'Revisar':'Ver'}</button>
        </article>)}</div>}
  </section>
}

function issueGuidance(issue:PrevalidationIssue){
  if(issue.code==='SOBRECARGA_DOCENTE')return 'Revisa la carga lectiva del docente y sus asignaciones semanales; reduce carga, cambia asignaciones o corrige el máximo configurado.'
  if(issue.code==='ASIGNACION_SIN_CAPACIDAD')return 'Revisa la asignación y la disponibilidad del docente. Reduce sesiones, amplía disponibilidad o reasigna la carga a otro docente compatible.'
  if(issue.code==='GRUPO_SIN_CAPACIDAD')return 'Revisa la carga semanal del grupo y la jornada configurada. Reduce o corrige sesiones del plan de estudios, o amplía las franjas lectivas si la organización del centro lo permite.'
  if(issue.code==='GRUPO_COBERTURA_INCOMPLETA')return 'Revisa el Plan de estudios del grupo. Faltan sesiones principales para cubrir todas las franjas lectivas; corrige la distribución semanal sin aumentar materias de forma arbitraria.'
  if(issue.code==='DOCENTE_SIN_CAPACIDAD')return 'Revisa todas las asignaciones y restricciones temporales del docente. La suma semanal no cabe en sus franjas disponibles.'
  if(issue.code==='DOCENTE_PENDIENTE')return 'Abre la ficha del docente. Si ya conoces quién ocupará el puesto, cambia su estado a Confirmado y actualiza sus datos. Si aún no se conoce, puedes mantenerlo Por determinar; la advertencia seguirá visible como recordatorio.'
  if(issue.code==='REGLA_PENDIENTE_REVISION')return 'Abre la regla, comprueba su origen y parámetros y márcala como revisada cuando sea correcta.'
  if(issue.code==='REGLA_NO_EVALUABLE')return 'Comprueba si esta regla puede expresarse con una condición estructurada compatible con el motor.'
  if(issue.code==='DISPONIBILIDAD_DIA_INVALIDO'||issue.code==='DISPONIBILIDAD_SESION_INVALIDA')return 'Revisa la disponibilidad del docente y elimina o actualiza la restricción que apunta a un día o sesión que ya no existe.'
  if(issue.code==='DISPONIBILIDAD_CONTRADICTORIA')return 'Revisa la disponibilidad del docente y deja un único estado para esa combinación de día y sesión.'
  if(issue.code==='FRANJA_FIJA_DIA_INVALIDO'||issue.code==='FRANJA_FIJA_SESION_INVALIDA')return 'Revisa la asignación y corrige o elimina la franja fija que apunta a un día o sesión inactiva.'
  if(issue.code==='FRANJA_FIJA_SOLAPADA')return 'Revisa las franjas fijas de las asignaciones implicadas: un mismo docente o grupo no puede quedar fijado dos veces en la misma franja.'
  if(issue.code==='FRANJA_FIJA_DUPLICADA')return 'Revisa las franjas fijadas del profesorado y elimina la duplicidad.'
  if(issue.code==='ASIGNACIONES_PENDIENTES_ORGANIZAR')return 'Abre Asignaciones y revisa las cargas marcadas como Pendiente de organizar. Asígnalas cuando conozcas docente/organización o mantenlas pendientes si todavía no pueden resolverse.'
  if(issue.code==='NORMATIVA_SIN_APROBAR')return 'Revisa la normativa detectada y aprueba únicamente las reglas aplicables al horario.'
  if(issue.code==='SIN_NORMATIVA')return 'No es obligatorio corregir nada. Añade normativa solo si quieres trazabilidad normativa en la auditoría.'
  if(issue.code==='LISTO_PARA_GENERAR')return 'No requiere acción. Puedes continuar a Horarios.'
  if(issue.section==='Reglas')return 'Abre Reglas y corrige la condición indicada hasta que la prevalidación deje de marcarla.'
  if(issue.section==='Asignaciones')return 'Revisa las asignaciones relacionadas con la incidencia y vuelve a comprobar.'
  if(issue.section==='Profesorado')return 'Revisa los datos del docente afectado y vuelve a comprobar.'
  return `Revisa la sección ${issue.section} y corrige la configuración señalada.`
}

function issueRoute(issue:PrevalidationIssue,project:ViyeuticaProject){
  if(issue.section==='Reglas'&&issue.entityId){
    const rule=project.rules.find(item=>item.id===issue.entityId)
    if(rule)return '/reglas?auditCode='+encodeURIComponent(rule.code)
  }
  if(issue.code==='DOCENTE_SIN_CAPACIDAD'&&issue.entityId){
    return '/asignaciones?teacherId='+encodeURIComponent(issue.entityId)+'&focusAvailability=1'
  }
  if(issue.section==='Profesorado'&&issue.entityId){
    return '/profesorado?teacherId='+encodeURIComponent(issue.entityId)
  }
  if(issue.code==='ASIGNACION_SIN_CAPACIDAD'&&issue.entityId){
    return '/asignaciones?assignmentId='+encodeURIComponent(issue.entityId)
  }
  if(issue.code==='GRUPO_SIN_CAPACIDAD'&&issue.entityId){
    return '/asignaciones?groupId='+encodeURIComponent(issue.entityId)
  }
  if(issue.code==='GRUPO_COBERTURA_INCOMPLETA'&&issue.entityId){
    return '/materias?groupId='+encodeURIComponent(issue.entityId)
  }
  if(issue.code==='ASIGNACIONES_PENDIENTES_ORGANIZAR'){
    return '/asignaciones?pendingOrganization=1'
  }
  if(issue.section==='Asignaciones'&&issue.entityId&&[
    'DISPONIBILIDAD_DIA_INVALIDO',
    'DISPONIBILIDAD_SESION_INVALIDA',
    'DISPONIBILIDAD_CONTRADICTORIA',
  ].includes(issue.code)){
    return '/asignaciones?teacherId='+encodeURIComponent(issue.entityId)
  }
  return sectionRoute(issue.section)
}

function sectionRoute(section:string){
  if(section==='Centro')return '/centro'
  if(section==='Estructura y grupos')return '/grupos'
  if(section==='Jornada y sesiones')return '/jornada'
  if(section==='Plan de estudios')return '/materias'
  if(section==='Profesorado')return '/profesorado'
  if(section==='Asignaciones')return '/asignaciones'
  if(section==='Reglas')return '/reglas'
  if(section==='Normativa')return '/normativa'
  return '/'
}

function PrevalidationSummarySkeleton(){
  return <section className="structure-summary prevalidation-loading" aria-hidden="true">
    {[0,1,2,3].map(index=><article className="structure-summary-card prevalidation-skeleton-card" key={index}>
      <span className="prevalidation-skeleton-line label"/>
      <span className="prevalidation-skeleton-line metric"/>
      <span className="prevalidation-skeleton-line detail"/>
    </article>)}
  </section>
}

function PrevalidationSectionsSkeleton(){
  return <section className="prevalidation-sections prevalidation-loading" aria-hidden="true">
    {[0,1,2].map(index=><section className="prevalidation-card prevalidation-skeleton-section" key={index}>
      <div className="prevalidation-card-heading">
        <div className="prevalidation-skeleton-heading">
          <span className="prevalidation-skeleton-icon small"/>
          <span>
            <span className="prevalidation-skeleton-line heading"/>
            <span className="prevalidation-skeleton-line detail"/>
          </span>
        </div>
        <span className="prevalidation-skeleton-count"/>
      </div>
      <div className="prevalidation-skeleton-issue">
        <span className="prevalidation-skeleton-line tag"/>
        <span className="prevalidation-skeleton-line title"/>
        <span className="prevalidation-skeleton-line"/>
      </div>
    </section>)}
  </section>
}

function PrevalidationRuleSummarySkeleton(){
  return <section className="prevalidation-rule-summary prevalidation-loading" aria-hidden="true">
    <div className="prevalidation-skeleton-rule-copy">
      <span className="prevalidation-skeleton-icon small"/>
      <span>
        <span className="prevalidation-skeleton-line heading"/>
        <span className="prevalidation-skeleton-line"/>
      </span>
    </div>
    <div className="rule-counts">
      <span className="prevalidation-skeleton-rule-count"/>
      <span className="prevalidation-skeleton-rule-count"/>
    </div>
  </section>
}

function Summary({label,value,detail}:{label:string;value:string;detail:string}){return <article className="structure-summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>}
