import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  CheckCircle2, ChevronDown, FileCheck2, Pencil, Plus, Save, Search, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Trash2,
} from 'lucide-react'
import {
  isAssignmentsComplete,
  validateRules,
  type CenterRule,
  type NormativeRule,
  type ViyeuticaProject,
} from '../domain/project'
import { saveProject } from '../store/projectStorage'
import { convertNormativeToCenterRule } from '../domain/normativeRuleBridge'
import { WizardStepper } from '../components/WizardStepper'
import { TemplatePanel } from '../components/TemplatePanel'

type RuleType=CenterRule['ruleType']

interface Draft {
  scope:string
  ruleType:RuleType
  code:string
  description:string
  weight:string
  conditionKind:string
  teacherId:string
  teacherIds:string[]
  groupId:string
  groupIds:string[]
  subjectId:string
  subjectIds:string[]
  stage:string
  day:string
  days:string[]
  sessionId:string
  sessionIds:string[]
  value:string
  comparison:string
}

const emptyDraft:Draft={
  scope:'',
  ruleType:'HARD',
  code:'',
  description:'',
  weight:'',
  conditionKind:'',
  teacherId:'',
  teacherIds:[],
  groupId:'',
  groupIds:[],
  subjectId:'',
  subjectIds:[],
  stage:'',
  day:'',
  days:[],
  sessionId:'',
  sessionIds:[],
  value:'',
  comparison:'',
}

const scopes=[
  ['center','Centro'],
  ['group','Grupo'],
  ['teacher','Profesorado'],
  ['subject','Materia'],
  ['schedule','Jornada'],
  ['assignment','Asignación'],
  ['resource','Recurso'],
] as const

const CONDITION_SCOPES:Record<string,string[]>={
  generic:['center','group','teacher','subject','schedule','assignment','resource'],
  availability:['teacher','group','subject','assignment'],
  daily_limit:['teacher','group','subject'],
  consecutive_limit:['teacher','group','subject'],
  fixed_slot:['assignment','teacher','group','subject'],
  avoid_slot:['teacher','group','subject','assignment','schedule'],
  weekly_load:['teacher','group','subject'],
}

function allowedScopes(kind:string){
  if(!kind)return []
  return CONDITION_SCOPES[kind]??CONDITION_SCOPES.generic
}

const uid=()=> 'rule_'+crypto.randomUUID()

type ConditionField='comparison'|'teacherId'|'groupId'|'subjectId'|'stage'|'day'|'sessionId'|'value'

const CONDITION_FIELDS:Record<string,ConditionField[]>={
  generic:[],
  availability:['comparison','teacherId','groupId','subjectId','day','sessionId'],
  daily_limit:['comparison','teacherId','groupId','subjectId','value'],
  consecutive_limit:['comparison','teacherId','groupId','subjectId','value'],
  fixed_slot:['teacherId','groupId','subjectId','day','sessionId'],
  avoid_slot:['comparison','teacherId','groupId','subjectId','day','sessionId'],
  weekly_load:['comparison','teacherId','groupId','subjectId','value'],
}

const CONDITION_COMPARISONS:Record<string,string[]>={
  generic:['equals','not_equals','minimum','maximum','avoid','prefer'],
  availability:['equals','not_equals','prefer'],
  daily_limit:['maximum','minimum','equals'],
  consecutive_limit:['maximum','minimum','equals'],
  fixed_slot:['equals'],
  avoid_slot:['avoid','prefer'],
  weekly_load:['maximum','minimum','equals'],
}

function conditionUses(kind:string,field:ConditionField){
  if(!kind)return false
  return (CONDITION_FIELDS[kind]??CONDITION_FIELDS.generic).includes(field)
}

function normalizeDraftForCondition(draft:Draft,kind:string):Draft{
  if(!kind){
    return {
      ...emptyDraft,
      ruleType:draft.ruleType,
      weight:draft.ruleType==='SOFT'?draft.weight:'',
    }
  }
  const fields=CONDITION_FIELDS[kind]??CONDITION_FIELDS.generic
  const allowed=CONDITION_COMPARISONS[kind]??CONDITION_COMPARISONS.generic
  const next:Draft={
    ...draft,
    conditionKind:kind,
    scope:'',
    comparison:allowed[0]??'',
    teacherId:'',
    teacherIds:[],
    groupId:'',
    groupIds:[],
    subjectId:'',
    subjectIds:[],
    stage:'',
    day:'',
    days:[],
    sessionId:'',
    sessionIds:[],
    value:'',
  }
  for(const field of ['teacherId','groupId','subjectId','stage','day','sessionId','value'] as ConditionField[]){
    if(!fields.includes(field)){
      (next as any)[field]=''
      const plural=field==='teacherId'?'teacherIds':field==='groupId'?'groupIds':field==='subjectId'?'subjectIds':field==='day'?'days':field==='sessionId'?'sessionIds':null
      if(plural) (next as any)[plural]=[]
    }
  }
  return next
}

function normalizeDraftForScope(draft:Draft,scope:string):Draft{
  if(scope===draft.scope) return draft
  return {
    ...draft,
    scope,
    teacherId:'',
    teacherIds:[],
    groupId:'',
    groupIds:[],
    subjectId:'',
    subjectIds:[],
    stage:'',
    day:'',
    days:[],
    sessionId:'',
    sessionIds:[],
  }
}

function targetFieldOrder(scope:string):ConditionField[]{
  if(scope==='assignment'||scope==='group') return ['groupId','subjectId','teacherId','stage','day','sessionId']
  if(scope==='teacher') return ['teacherId','groupId','subjectId','stage','day','sessionId']
  if(scope==='subject') return ['subjectId','groupId','teacherId','stage','day','sessionId']
  if(scope==='schedule') return ['day','sessionId','stage','groupId','subjectId','teacherId']
  return ['stage','groupId','subjectId','teacherId','day','sessionId']
}

function isMultiField(draft:Draft,field:ConditionField){
  if(draft.conditionKind==='fixed_slot'||draft.scope==='assignment'||draft.conditionKind==='generic') return false
  if((draft.conditionKind==='availability'||draft.conditionKind==='avoid_slot')&&(field==='day'||field==='sessionId')) return true
  if(field==='groupId'||field==='subjectId') return true
  if(draft.scope==='teacher'&&field==='teacherId') return true
  return false
}

function conditionKindLabel(kind:string){
  const labels:Record<string,string>={
    generic:'Condición general',
    availability:'Disponibilidad',
    daily_limit:'Límite diario',
    consecutive_limit:'Sesiones consecutivas',
    fixed_slot:'Franja fija',
    avoid_slot:'Evitar franja',
    weekly_load:'Carga semanal',
  }
  return labels[kind]??kind
}

function uniqueDisplayNames(names:string[]){
  return [...new Set(names.map(name=>name.trim()).filter(Boolean))]
}

function selectedNames(ids:string[],items:{id:string;name:string}[]){
  const names=uniqueDisplayNames(ids.map(id=>items.find(item=>item.id===id)?.name).filter(Boolean) as string[])
  if(!names.length)return ''
  if(names.length<=2)return names.join(' y ')
  return names.slice(0,2).join(', ')+` y ${names.length-2} más`
}

function sessionCountLabel(value:string){
  return Number(value)===1?'sesión':'sesiones'
}

function ruleCountLabel(count:number){
  return `${count} ${count===1?'regla activa':'reglas activas'}`
}

function generateRuleDescription(draft:Draft,project:ViyeuticaProject){
  if(!draft.conditionKind||!draft.scope)return ''
  const teachers=draft.teacherIds.length?draft.teacherIds:draft.teacherId?[draft.teacherId]:[]
  const groups=draft.groupIds.length?draft.groupIds:draft.groupId?[draft.groupId]:[]
  const subjects=draft.subjectIds.length?draft.subjectIds:draft.subjectId?[draft.subjectId]:[]
  const days=draft.days.length?draft.days:draft.day?[draft.day]:[]
  const sessions=draft.sessionIds.length?draft.sessionIds:draft.sessionId?[draft.sessionId]:[]

  const target=draft.scope==='teacher'
    ? selectedNames(teachers,project.teachers)
    : draft.scope==='group'
      ? selectedNames(groups,project.groups)
      : draft.scope==='subject'
        ? selectedNames(subjects,project.subjects)
        : draft.scope==='assignment'
          ? [selectedNames(groups,project.groups),selectedNames(subjects,project.subjects),selectedNames(teachers,project.teachers)].filter(Boolean).join(' · ')
          : scopeLabel(draft.scope)

  const targetText=target||scopeLabel(draft.scope)
  const dayText=days.length?days.map(dayName).join(', '):''
  const sessionText=sessions.length?sessions.map(id=>project.schedule.blocks.find(block=>block.id===id)?.label??id).join(', '):''
  const place=[dayText,sessionText].filter(Boolean).join(' · ')
  const cmp=comparisonLabel(draft.comparison).toLowerCase()
  const value=draft.value.trim()

  if(draft.conditionKind==='fixed_slot') return `${targetText}: franja fija${place?' en '+place:''}.`
  if(draft.conditionKind==='avoid_slot') return `${draft.comparison==='prefer'?'Preferir':'Evitar'} ${place||'la franja seleccionada'} para ${targetText}.`
  if(draft.conditionKind==='availability'){
    const verb=draft.comparison==='not_equals'?'No disponible':draft.comparison==='prefer'?'Preferencia de disponibilidad':'Disponible'
    return `${targetText}: ${verb.toLowerCase()}${place?' en '+place:''}.`
  }
  if(draft.conditionKind==='daily_limit') return `${targetText}: ${cmp} ${value||'—'} ${sessionCountLabel(value)} al día.`
  if(draft.conditionKind==='consecutive_limit') return `${targetText}: ${cmp} ${value||'—'} ${sessionCountLabel(value)} consecutivas.`
  if(draft.conditionKind==='weekly_load') return `${targetText}: ${cmp} ${value||'—'} ${sessionCountLabel(value)} semanales.`
  return `${conditionKindLabel(draft.conditionKind)} · ${targetText}${place?' · '+place:''}${value?' · '+comparisonLabel(draft.comparison)+' '+value:''}.`
}

function sanitizeCode(value:string){
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')
}

function generatedRuleCode(draft:Draft,project:ViyeuticaProject,editingId:string|null){
  const parts=[draft.conditionKind,draft.scope,draft.comparison]
  if(draft.value) parts.push(draft.value)
  const base=sanitizeCode(parts.join('_'))||'REGLA'
  const used=new Set(project.rules.filter(rule=>rule.id!==editingId).map(rule=>rule.code))
  if(!used.has(base))return base
  let index=2
  while(used.has(base+'_'+index)) index++
  return base+'_'+index
}

const PRIORITY_OPTIONS=[
  {value:'1',label:'Baja'},
  {value:'3',label:'Normal'},
  {value:'5',label:'Alta'},
  {value:'8',label:'Muy alta'},
  {value:'10',label:'Crítica'},
] as const

function selectedDraftValues(single:string,multiple:string[]){
  return multiple.length?multiple:single?[single]:[]
}

function conditionUsesTeachingCoverage(kind:string){
  return ['daily_limit','consecutive_limit','weekly_load'].includes(kind)
}

function singular(count:number){
  return count===1
}

function valueGuideMessage(draft:Draft){
  const comparison=draft.comparison
  const unit=
    draft.conditionKind==='weekly_load' ? 'sesiones semanales' :
    draft.conditionKind==='daily_limit' ? 'sesiones al día' :
    draft.conditionKind==='consecutive_limit' ? 'sesiones consecutivas' :
    'unidades'

  if(comparison==='maximum'){
    return `Introduce el límite que no quieres superar. Por ejemplo, Valor 5 significa que la selección actual podrá tener como máximo 5 ${unit}. Usa este valor cuando quieras poner un techo.`
  }
  if(comparison==='minimum'){
    return `Introduce la cantidad mínima que quieres alcanzar. Por ejemplo, Valor 5 significa que la selección actual debe tener al menos 5 ${unit}. Usa este valor cuando quieras fijar un suelo.`
  }
  if(comparison==='equals'){
    return `Introduce la cantidad exacta que quieres obtener. Por ejemplo, Valor 5 significa exactamente 5 ${unit}. Usa esta comparación cuando no quieras ni más ni menos.`
  }
  if(comparison==='not_equals'){
    return 'Introduce la cantidad que no debe coincidir con el resultado de la regla.'
  }
  return `Introduce el número que se comparará usando “${comparisonLabel(comparison)}”.`
}

function isRuleDraftReady(draft:Draft,project:ViyeuticaProject){
  if(!draft.conditionKind||!draft.scope)return false
  if(draft.ruleType==='SOFT'&&!draft.weight)return false

  const teachers=selectedDraftValues(draft.teacherId,draft.teacherIds)
  const groups=selectedDraftValues(draft.groupId,draft.groupIds)
  const subjects=selectedDraftValues(draft.subjectId,draft.subjectIds)
  const days=selectedDraftValues(draft.day,draft.days)
  const sessions=selectedDraftValues(draft.sessionId,draft.sessionIds)
  const activeAssignments=project.assignments.filter(item=>item.active)

  if(draft.conditionKind!=='generic'&&draft.scope==='teacher'&&conditionUses(draft.conditionKind,'teacherId')&&!teachers.length)return false
  if(draft.conditionKind!=='generic'&&draft.scope==='group'&&conditionUses(draft.conditionKind,'groupId')&&!groups.length)return false
  if(draft.conditionKind!=='generic'&&draft.scope==='subject'&&conditionUses(draft.conditionKind,'subjectId')&&!subjects.length)return false
  if(draft.scope==='assignment'&&(!groups.length||!subjects.length||!teachers.length))return false

  if(conditionUsesTeachingCoverage(draft.conditionKind)&&draft.scope==='teacher'&&conditionUses(draft.conditionKind,'groupId')&&teachers.length){
    if(!groups.length)return false
    const allTeachersCovered=teachers.every(teacherId=>
      activeAssignments.some(item=>item.teacherId===teacherId&&groups.includes(item.groupId))
    )
    if(!allTeachersCovered)return false
  }

  if(conditionUsesTeachingCoverage(draft.conditionKind)&&draft.scope==='teacher'&&conditionUses(draft.conditionKind,'subjectId')&&teachers.length&&groups.length){
    if(!subjects.length)return false
    const allTeachersCoveredBySubject=teachers.every(teacherId=>
      activeAssignments.some(item=>
        item.teacherId===teacherId&&
        groups.includes(item.groupId)&&
        subjects.includes(item.subjectId)
      )
    )
    if(!allTeachersCoveredBySubject)return false
  }

  if(conditionUsesTeachingCoverage(draft.conditionKind)&&draft.scope==='group'&&conditionUses(draft.conditionKind,'subjectId')&&groups.length&&!subjects.length)return false
  if(conditionUsesTeachingCoverage(draft.conditionKind)&&draft.scope==='subject'&&conditionUses(draft.conditionKind,'groupId')&&subjects.length&&!groups.length)return false

  if(conditionUses(draft.conditionKind,'value')&&!draft.value)return false
  if(draft.conditionKind==='fixed_slot'&&(!days.length||!sessions.length))return false
  if(['avoid_slot','availability'].includes(draft.conditionKind)&&!days.length&&!sessions.length)return false
  return true
}

function buildParameters(draft:Draft){
  const parameters:Record<string,unknown>={conditionKind:draft.conditionKind}
  if(conditionUses(draft.conditionKind,'teacherId')){
    if(draft.teacherIds.length) parameters.teacherIds=draft.teacherIds
    else if(draft.teacherId) parameters.teacherId=draft.teacherId
  }
  if(conditionUses(draft.conditionKind,'groupId')){
    if(draft.groupIds.length) parameters.groupIds=draft.groupIds
    else if(draft.groupId) parameters.groupId=draft.groupId
  }
  if(conditionUses(draft.conditionKind,'subjectId')){
    if(draft.subjectIds.length) parameters.subjectIds=draft.subjectIds
    else if(draft.subjectId) parameters.subjectId=draft.subjectId
  }
  if(conditionUses(draft.conditionKind,'stage')&&draft.stage) parameters.stage=draft.stage
  if(conditionUses(draft.conditionKind,'day')){
    if(draft.days.length) parameters.days=draft.days
    else if(draft.day) parameters.day=draft.day
  }
  if(conditionUses(draft.conditionKind,'sessionId')){
    if(draft.sessionIds.length) parameters.sessionIds=draft.sessionIds
    else if(draft.sessionId) parameters.sessionId=draft.sessionId
  }
  if(conditionUses(draft.conditionKind,'value')&&draft.value!=='') parameters.value=Number.isNaN(Number(draft.value))?draft.value:Number(draft.value)
  if(conditionUses(draft.conditionKind,'comparison')&&draft.comparison) parameters.comparison=draft.comparison
  if(draft.conditionKind==='fixed_slot') parameters.comparison='equals'
  return parameters
}

function draftFromRule(rule:CenterRule):Draft{
  const p=rule.parameters??{}
  return {
    scope:rule.scope,
    ruleType:rule.ruleType,
    code:rule.code,
    description:rule.description,
    weight:rule.weight?String(rule.weight):'',
    conditionKind:String(p.conditionKind??'generic'),
    teacherId:String(p.teacherId??''),
    teacherIds:Array.isArray(p.teacherIds)?p.teacherIds.map(String):[],
    groupId:String(p.groupId??''),
    groupIds:Array.isArray(p.groupIds)?p.groupIds.map(String):[],
    subjectId:String(p.subjectId??''),
    subjectIds:Array.isArray(p.subjectIds)?p.subjectIds.map(String):[],
    stage:String(p.stage??''),
    day:String(p.day??''),
    days:Array.isArray(p.days)?p.days.map(String):[],
    sessionId:String(p.sessionId??''),
    sessionIds:Array.isArray(p.sessionIds)?p.sessionIds.map(String):[],
    value:p.value===undefined||p.value===null?'':String(p.value),
    comparison:String(p.comparison??'equals'),
  }
}

export function RulesPage({
  project,
  navigate,
}:{
  project:ViyeuticaProject
  navigate:(path:string)=>void
}) {
  const [draft,setDraft]=useState<Draft>(emptyDraft)
  const [editingId,setEditingId]=useState<string|null>(null)
  const [error,setError]=useState('')
  const [templateMessage,setTemplateMessage]=useState('')
  const [filter,setFilter]=useState<'all'|'HARD'|'SOFT'>('all')
  const [originFilter,setOriginFilter]=useState<'all'|'engine'|'normative'|'manual'|'imported'>('all')
  const [auditFocus,setAuditFocus]=useState('')
  const [descriptionCustomized,setDescriptionCustomized]=useState(false)
  const [ruleModalOpen,setRuleModalOpen]=useState(false)

  const validation=useMemo(()=>validateRules(project),[project])
  const activeRules=project.rules.filter(rule=>rule.active)
  const hardCount=activeRules.filter(rule=>rule.ruleType==='HARD').length
  const softCount=activeRules.filter(rule=>rule.ruleType==='SOFT').length
  const normativeCount=activeRules.filter(rule=>rule.source==='normative').length
  const importedCount=activeRules.filter(rule=>rule.source==='imported').length
  const normativeDedications=project.teachers.flatMap(teacher=>
    (teacher.dedications??[])
      .filter(item=>item.source==='normative'&&item.status==='applicable'&&item.affectsTeachingLoad)
      .map(item=>({teacher,item}))
  )
  const engineRules=[
    {id:'engine_teacher_overlap',title:'Sin solape de profesorado',description:'Un docente no puede ocupar dos actividades en la misma franja.',detail:'Aplicación automática durante cada intento de colocación.'},
    {id:'engine_group_overlap',title:'Sin solape de grupos',description:'Un grupo no puede ocupar dos actividades en la misma franja.',detail:'Aplicación automática durante cada intento de colocación.'},
    {id:'engine_availability',title:'Respetar indisponibilidad docente',description:'No se asigna docencia en franjas registradas como No disponible o Desplazamiento.',detail:'Lee directamente las restricciones de Disponibilidad configuradas en Asignaciones.'},
  ]
  const effectiveActiveCount=activeRules.length+engineRules.length+normativeDedications.length
  const effectiveHardCount=hardCount+engineRules.length+normativeDedications.length
  const effectiveNormativeCount=normativeCount+normativeDedications.length

  const automaticDescription=generateRuleDescription(draft,project)
  const displayedDescription=descriptionCustomized?draft.description:automaticDescription

  useEffect(()=>{
    const raw=window.location.hash.split('?')[1]
    if(!raw)return
    const params=new URLSearchParams(raw)
    const code=params.get('auditCode')
    if(!code)return
    const rule=project.rules.find(item=>item.code===code)
    if(rule){
      setEditingId(rule.id)
      setDraft(draftFromRule(rule))
      setDescriptionCustomized(true)
      setFilter(rule.ruleType)
      setOriginFilter(rule.source??'manual')
      setAuditFocus('Regla cargada desde Auditoría: '+humanRuleName(rule.code))
      setRuleModalOpen(true)
    }else{
      setAuditFocus('Auditoría ha señalado '+code+', pero no existe una regla editable con ese código.')
    }
  },[])

  const persist=(rules:CenterRule[])=>saveProject({...project,rules})

  const reset=()=>{
    setDraft(emptyDraft)
    setEditingId(null)
    setDescriptionCustomized(false)
    setError('')
    setRuleModalOpen(false)
  }

  const openCreate=()=>{
    setDraft(emptyDraft)
    setEditingId(null)
    setDescriptionCustomized(false)
    setError('')
    setRuleModalOpen(true)
  }

  const submit=(event:FormEvent)=>{
    event.preventDefault()
    if(!isRuleDraftReady(draft,project)){
      setError('Completa los campos indicados por la guía antes de añadir la regla.')
      return
    }
    const parameters=buildParameters(draft)
    const weight=draft.ruleType==='SOFT'
      ? Number(draft.weight)
      : null
    if(draft.ruleType==='SOFT'&&(weight===null||!Number.isFinite(weight)||weight<=0)){
      setError('Las reglas SOFT necesitan un peso mayor que cero.')
      return
    }
    const previous=editingId?project.rules.find(rule=>rule.id===editingId):undefined
    const code=previous?.code??generatedRuleCode(draft,project,editingId)
    const description=(displayedDescription.trim()||automaticDescription).trim()
    const rule:CenterRule={
      id:editingId??uid(),
      scope:draft.scope,
      ruleType:draft.ruleType,
      code,
      description,
      parameters,
      weight,
      source:previous?.source??'manual',
      normativeRuleId:previous?.normativeRuleId??null,
      active:true,
      reviewRequired:false,
    }
    persist(editingId
      ? project.rules.map(item=>item.id===editingId?rule:item)
      : [...project.rules,rule]
    )
    reset()
  }

  const edit=(rule:CenterRule)=>{
    setEditingId(rule.id)
    setDraft(draftFromRule(rule))
    setDescriptionCustomized(true)
    setError('')
    setRuleModalOpen(true)
  }

  const remove=(id:string)=>persist(project.rules.filter(rule=>rule.id!==id))
  const toggle=(id:string)=>persist(project.rules.map(rule=>rule.id===id?{...rule,active:!rule.active}:rule))

  const markImportedReviewed=()=>{
    const count=project.rules.filter(rule=>rule.source==='imported'||rule.reviewRequired).length
    if(!count){
      setTemplateMessage('No hay reglas importadas pendientes de revisión.')
      return
    }
    persist(project.rules.map(rule=>
      rule.source==='imported'||rule.reviewRequired
        ? {...rule,source:'imported',reviewRequired:false}
        : rule
    ))
    setTemplateMessage(`${count} reglas importadas marcadas como revisadas. Comprueba individualmente su vigencia antes de generar.`)
  }

  const createNormativeRules=()=>{
    const approved=project.normativeRules.filter(rule=>rule.approved&&(rule.relevance??legacyNormativeRelevance(rule))==='timetable')
    const existingNormIds=new Set(project.rules.map(rule=>rule.normativeRuleId).filter(Boolean))
    const additions:CenterRule[]=[]
    for(const normative of approved){
      if(existingNormIds.has(normative.id)) continue
      const source=project.normativeSources.find(item=>item.id===normative.sourceId)
      additions.push(convertNormativeToCenterRule(normative,source))
    }
    if(!additions.length){
      setTemplateMessage('No hay reglas normativas aprobadas nuevas para incorporar.')
      return
    }
    persist([...project.rules,...additions])
    setTemplateMessage(`Se han creado ${additions.length} reglas desde normativa aprobada. Quedan marcadas para revisión antes de considerarlas definitivas.`)
  }

  const addBaseRules=()=>{
    const seed:CenterRule={
      id:uid(),
      scope:'teacher',
      ruleType:'SOFT',
      code:'REDUCIR_HUECOS_DOCENTES',
      description:'Minimizar huecos innecesarios en el horario individual del profesorado.',
      parameters:{conditionKind:'generic'},
      weight:5,
      source:'manual',
      active:true,
      reviewRequired:false,
    }
    if(project.rules.some(rule=>rule.code===seed.code)){
      setTemplateMessage('La preferencia para reducir huecos del profesorado ya existe.')
      return
    }
    persist([...project.rules,seed])
    setTemplateMessage('Se ha añadido la preferencia para reducir huecos del profesorado.')
  }

  if(!isAssignmentsComplete(project)){
    return <div className="wizard-page rules-page">
      <section className="wizard-intro">
        <div>
          <h1 className="wizard-page-title"><ShieldCheck size={28}/> Reglas</h1>
          <p>Define qué condiciones son obligatorias (HARD) y qué preferencias debe optimizar el generador (SOFT). Cada regla se guarda de forma estructurada para el solver y la auditoría.</p>
        </div>
        <div className="wizard-progress-summary"><strong>7 <span>de 9</span></strong><small>Reglas</small></div>
      </section>
      <WizardStepper currentStep={7} project={project} navigate={navigate}/>
      <section className="empty-state-card">
        <ShieldCheck size={34}/>
        <h1>Completa primero Asignaciones</h1>
        <p>Las reglas necesitan una estructura docente y curricular coherente para poder validarse.</p>
        <button className="btn primary" onClick={()=>navigate('/asignaciones')}>Ir a Asignaciones</button>
      </section>
    </div>
  }

  const visibleEngineRules=engineRules.filter(()=>(
    (filter==='all'||filter==='HARD') &&
    (originFilter==='all'||originFilter==='engine')
  ))
  const visibleNormativeDedications=normativeDedications.filter(()=>(
    (filter==='all'||filter==='HARD') &&
    (originFilter==='all'||originFilter==='normative')
  ))
  const visibleProjectRules=project.rules.filter(rule=>{
    const origin=rule.source??'manual'
    return (filter==='all'||rule.ruleType===filter) &&
      (originFilter==='all'||originFilter===origin)
  })
  const visibleRuleCount=visibleEngineRules.length+visibleNormativeDedications.length+visibleProjectRules.length

  return <div className="wizard-page rules-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><ShieldCheck size={28}/> Reglas</h1>
        <p>Define qué condiciones son obligatorias (HARD) y qué preferencias debe optimizar el generador (SOFT). Cada regla se guarda de forma estructurada para el solver y la auditoría.</p>
      </div>
      <div className="wizard-progress-summary"><strong>7 <span>de 9</span></strong><small>Reglas</small></div>
    </section>

    <WizardStepper currentStep={7} project={project} navigate={navigate}/>

    {auditFocus&&<section className="template-result audit-context-banner"><CheckCircle2 size={16}/><span>{auditFocus}</span></section>}

    <section className="structure-summary">
      <Summary label="Reglas activas" value={String(effectiveActiveCount)} detail="total aplicable"/>
      <Summary label="HARD" value={String(effectiveHardCount)} detail="obligatorias"/>
      <Summary label="SOFT" value={String(softCount)} detail="preferencias ponderadas"/>
      <Summary label="Normativa / importadas" value={`${effectiveNormativeCount}/${importedCount}`} detail="por procedencia"/>
    </section>

    <article className={'aside-card validation section-prevalidation-card '+(validation.length?'error':effectiveActiveCount?'ready':'incomplete')}>
      <span className="panel-kicker">ESTADO:</span>
      <strong>{validation.length?'Sección Reglas con errores':effectiveActiveCount?'Sección Reglas válida':'Sección Reglas incompleta'}</strong>
      <p>{validation.length
        ? `${validation[0]} Edita la regla afectada y corrige su condición, ámbito o prioridad antes de generar horarios.`
        : effectiveActiveCount
          ? `${ruleCountLabel(effectiveActiveCount)} · ${effectiveHardCount} HARD · ${softCount} SOFT · ${effectiveNormativeCount} normativas. Todas las reglas aplicables tienen una estructura válida.`
          : 'Todavía no hay reglas activas. Añade las restricciones obligatorias y preferencias que debe utilizar el generador.'}</p>
      {validation.length>0&&<button type="button" className="section-status-action" onClick={()=>document.querySelector('.groups-table-card')?.scrollIntoView({behavior:'smooth',block:'start'})}>Revisar reglas</button>}
      {!validation.length&&!effectiveActiveCount&&<button type="button" className="section-status-action" onClick={openCreate}>Añadir regla</button>}
    </article>

    {ruleModalOpen&&<div className="modal-backdrop section-form-modal-backdrop">
      <form className="app-modal section-form-modal rule-editor-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={editingId?'Editar regla':'Crear regla'}>
        <div className="app-modal-header"><div><ShieldCheck size={20}/><h2>{editingId?'Editar regla':'Crear regla'}</h2></div></div>
        <div className="app-modal-body">
          <div className="form-card-heading"><div className="form-card-number">07</div><div><span className="panel-kicker">{editingId?'Edición':'Nueva restricción'}</span><h2>{editingId?'Editar regla':'Crear regla'}</h2><p>Una regla HARD invalida una solución si se incumple. Una SOFT aporta penalización al score.</p></div></div>
          <div className="form-grid two">
            <Field label="Tipo" required><select value={draft.ruleType} onChange={e=>{const ruleType=e.target.value as RuleType;setDraft({...draft,ruleType,weight:ruleType==='HARD'?'':draft.weight})}}><option value="HARD">HARD · obligatoria</option><option value="SOFT">SOFT · preferencia</option></select></Field>
            <Field label="Prioridad"><select disabled={draft.ruleType==='HARD'} value={draft.ruleType==='HARD'?'':draft.weight} onChange={e=>setDraft({...draft,weight:e.target.value})}><option value="">{draft.ruleType==='HARD'?'No aplica · las reglas HARD son obligatorias':'Selecciona prioridad'}</option>{draft.weight&&!PRIORITY_OPTIONS.some(option=>option.value===draft.weight)&&<option value={draft.weight}>Personalizada · {draft.weight}</option>}{PRIORITY_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><small className="field-help">{draft.ruleType==='HARD'?'Las reglas HARD se cumplen obligatoriamente.':'Cuanto mayor sea la prioridad, más penalizará el generador incumplir esta preferencia.'}</small></Field>
          </div>
          <section className="rule-condition-builder">
            <div className="rule-condition-builder-heading"><span className="panel-kicker">Condición de la regla</span><h3>Construir condición</h3><p>Selecciona únicamente los campos que necesites. ⩒Yeutika guardará la estructura técnica automáticamente.</p></div>
            <div className="form-grid two">
              <Field label="Tipo de condición" required><select value={draft.conditionKind} onChange={e=>setDraft(normalizeDraftForCondition(draft,e.target.value))}><option value="">Selecciona el tipo de condición</option><option value="generic">Condición general</option><option value="availability">Disponibilidad / indisponibilidad</option><option value="daily_limit">Límite diario</option><option value="consecutive_limit">Sesiones consecutivas</option><option value="fixed_slot">Franja fija</option><option value="avoid_slot">Evitar franja</option><option value="weekly_load">Carga semanal</option></select></Field>
              <Field label="Ámbito" required><select disabled={!draft.conditionKind} value={draft.scope} onChange={e=>setDraft(normalizeDraftForScope(draft,e.target.value))}><option value="">{draft.conditionKind?'Selecciona el ámbito':'Selecciona primero el tipo de condición'}</option>{scopes.filter(([value])=>allowedScopes(draft.conditionKind).includes(value)).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
              <RuleTargetFields draft={draft} project={project} onChange={setDraft}/>
              {conditionUses(draft.conditionKind,'comparison')&&<Field label="Comparación"><select disabled={!draft.scope} value={draft.comparison} onChange={e=>setDraft({...draft,comparison:e.target.value})}>{(CONDITION_COMPARISONS[draft.conditionKind]??CONDITION_COMPARISONS.generic).map(value=><option key={value} value={value}>{comparisonLabel(value)}</option>)}</select></Field>}
              {conditionUses(draft.conditionKind,'value')&&<Field label="Valor"><input disabled={!draft.scope} type="number" min="1" value={draft.value} onChange={e=>setDraft({...draft,value:e.target.value})} placeholder="Ej. 2"/></Field>}
            </div>
            <RuleConditionGuide draft={draft} project={project}/>
          </section>
          <Field label="Descripción" required><textarea disabled={!draft.conditionKind||!draft.scope} value={displayedDescription} onChange={e=>{setDescriptionCustomized(true);setDraft({...draft,description:e.target.value})}} placeholder={draft.conditionKind&&draft.scope?'La descripción se genera automáticamente a partir de la condición.':'Completa primero el tipo de condición y el ámbito.'}/>{descriptionCustomized&&<button type="button" className="btn ghost-inline rule-auto-description" onClick={()=>setDescriptionCustomized(false)}>Usar descripción automática</button>}</Field>
          {error&&<div className="inline-error">{error}</div>}
        </div>
        <div className="app-modal-footer"><button type="button" className="btn ghost-inline" onClick={reset}>Cancelar</button><button className="btn primary" type="submit" disabled={!isRuleDraftReady(draft,project)}>Aceptar</button></div>
      </form>
    </div>}

    {templateMessage&&<div className="template-result"><CheckCircle2 size={16}/><span>{templateMessage}</span></div>}

    <section className="groups-table-card">
      <div className="groups-table-heading">
        <div><span className="panel-kicker">Motor de restricciones</span><h2>Reglas configuradas</h2></div>
        <div className="groups-table-actions"><button className="btn ghost-inline" onClick={openCreate}><Plus size={16}/> Añadir regla</button></div>
      </div>

      <div className="rules-filter-toolbar">
        <div className="rule-origin-filter" aria-label="Filtrar reglas por procedencia">
          <button className={originFilter==='all'?'active all':''} onClick={()=>setOriginFilter('all')}>Todas</button>
          <button className={'engine'+(originFilter==='engine'?' active':'')} onClick={()=>setOriginFilter('engine')}><i/>Motor</button>
          <button className={'normative'+(originFilter==='normative'?' active':'')} onClick={()=>setOriginFilter('normative')}><i/>Normativa</button>
          <button className={'manual'+(originFilter==='manual'?' active':'')} onClick={()=>setOriginFilter('manual')}><i/>Manual</button>
          <button className={'imported'+(originFilter==='imported'?' active':'')} onClick={()=>setOriginFilter('imported')}><i/>Importada</button>
        </div>
        <div className="rule-filter" aria-label="Filtrar reglas por tipo">
          <button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Todas</button>
          <button className={filter==='HARD'?'active hard':''} onClick={()=>setFilter('HARD')}>HARD</button>
          <button className={filter==='SOFT'?'active soft':''} onClick={()=>setFilter('SOFT')}>SOFT</button>
        </div>
      </div>

      {visibleRuleCount===0
        ? <div className="groups-empty"><ShieldAlert size={28}/><strong>No hay reglas para estos filtros</strong><p>Cambia la procedencia o el tipo HARD/SOFT para ampliar el listado.</p></div>
        : <div className="rules-list">
            {visibleEngineRules.map(rule=><article className="rule-card hard rule-origin-engine" key={rule.id}>
              <div className="rule-type-badge engine">MOTOR</div>
              <div className="rule-card-main">
                <div className="rule-title-row"><strong>{rule.title}</strong><span>HARD</span><span className="origin-tag engine">Motor</span></div>
                <p>{rule.description}</p><small>{rule.detail}</small>
              </div>
              <div className="engine-rule-lock"><ShieldCheck size={17}/><span>Siempre activa</span></div>
            </article>)}
            {visibleNormativeDedications.map(({teacher,item})=><article className="rule-card hard rule-origin-normative" key={'norm-ded-'+teacher.id+'-'+item.id}>
              <div className="rule-type-badge normative">NORMA</div>
              <div className="rule-card-main">
                <div className="rule-title-row"><strong>{item.label}</strong><span>HARD</span><span className="origin-tag normative">Normativa</span></div>
                <p>{teacher.name}: descuenta {item.weeklyMinutes??0} min semanales de docencia directa.</p>
                <small>{item.reference||'Dedicación normativa registrada en Profesorado'} · Se aplica al cálculo de carga lectiva efectiva y a Generación.</small>
              </div>
              <div className="engine-rule-lock"><ShieldCheck size={17}/><span>Derivada de Profesorado</span></div>
            </article>)}
            {visibleProjectRules.map(rule=><article className={'rule-card '+rule.ruleType.toLowerCase()+' rule-origin-'+(rule.source??'manual')+(!rule.active?' inactive':'')} key={rule.id}>
              <div className="rule-type-badge">{rule.ruleType}</div>
              <div className="rule-card-main">
                <div className="rule-title-row"><strong>{ruleDisplayName(rule)}</strong><span>{scopeLabel(rule.scope)}</span>{rule.source&&<span className={'origin-tag '+rule.source}>{sourceLabel(rule.source)}</span>}{rule.reviewRequired&&<span className="review-tag">Revisar</span>}</div>
                <p>{rule.description}</p>
                <small>{describeParameters(rule,project)}{rule.ruleType==='SOFT'&&<> · Peso <strong>{rule.weight??'—'}</strong></>}</small>
                {rule.source==='normative'&&rule.normativeRuleId&&<NormativeTrace project={project} id={rule.normativeRuleId}/>}
              </div>
              <div className="rule-card-actions">
                <button className={'status-toggle '+(rule.active?'active':'')} onClick={()=>toggle(rule.id)}>{rule.active?'Activa':'Inactiva'}</button>
                <button title="Editar" onClick={()=>edit(rule)}><Pencil size={15}/></button>
                <button title="Eliminar" className="danger" onClick={()=>remove(rule.id)}><Trash2 size={15}/></button>
              </div>
            </article>)}
          </div>}
    </section>

    <div className="section-template-full">
      <TemplatePanel
        title="Plantillas de reglas"
        description="Combina reglas base del motor, reglas importadas del curso anterior y reglas obtenidas de normativa aprobada."
        actions={[
          {id:'base-rules',label:'Añadir optimización base',description:'Preferencia SOFT para reducir huecos del profesorado',onApply:addBaseRules},
          {id:'imported-rules',label:'Revisar reglas importadas',description:project.rules.some(rule=>rule.source==='imported'||rule.reviewRequired)?'Hay reglas del curso anterior':'No hay reglas importadas pendientes',disabled:!project.rules.some(rule=>rule.source==='imported'||rule.reviewRequired),onApply:markImportedReviewed},
          {id:'normative-rules',label:'Incorporar normativa aprobada',description:project.normativeRules.some(rule=>rule.approved&&(rule.relevance??legacyNormativeRelevance(rule))==='timetable')?'Crear reglas trazables desde Normativa':'No hay normativa aplicable al horario aprobada',disabled:!project.normativeRules.some(rule=>rule.approved&&(rule.relevance??legacyNormativeRelevance(rule))==='timetable'),onApply:createNormativeRules},
        ]}
      />
    </div>
    {templateMessage&&<div className="template-result"><CheckCircle2 size={16}/><span>{templateMessage}</span></div>}

  </div>
}

function Summary({label,value,detail}:{label:string;value:string;detail:string}){return <article className="structure-summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>}
function Field({label,required,children}:{label:string;required?:boolean;children:React.ReactNode}){return <div className="form-field"><span>{label}{required&&<em>*</em>}</span>{children}</div>}

interface MultiCheckOption{value:string;label:string;values?:string[]}

function MultiCheckSelect({
  label,placeholder,options,values,onChange,disabled=false,searchable=false,
}:{
  label:string
  placeholder:string
  options:MultiCheckOption[]
  values:string[]
  onChange:(values:string[])=>void
  disabled?:boolean
  searchable?:boolean
}){
  const [query,setQuery]=useState('')
  const [open,setOpen]=useState(false)
  const rootRef=useRef<HTMLDivElement>(null)

  useEffect(()=>{
    const closeOutside=(event:PointerEvent)=>{
      if(open&&rootRef.current&&!rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown',closeOutside)
    return ()=>document.removeEventListener('pointerdown',closeOutside)
  },[open])

  useEffect(()=>{
    if(disabled&&open)setOpen(false)
  },[disabled,open])

  const normalized=query.trim().toLowerCase()
  const visibleOptions=normalized
    ? options.filter(option=>option.label.toLowerCase().includes(normalized))
    : options
  const optionValues=(option:MultiCheckOption)=>option.values?.length?option.values:[option.value]
  const optionSelected=(option:MultiCheckOption)=>optionValues(option).every(value=>values.includes(value))
  const selectedLabels=options.filter(optionSelected).map(option=>option.label)
  const summary=!selectedLabels.length
    ? placeholder
    : selectedLabels.length<=2
      ? selectedLabels.join(', ')
      : selectedLabels.length+' seleccionados'

  const toggle=(option:MultiCheckOption)=>{
    const underlying=optionValues(option)
    const selected=underlying.every(value=>values.includes(value))
    const next=selected
      ? values.filter(value=>!underlying.includes(value))
      : [...new Set([...values,...underlying])]
    onChange(next)
  }

  return <div
    ref={rootRef}
    className={'availability-compact-field multicheck-field'+(disabled?' disabled':'')}
    onBlur={event=>{
      const next=event.relatedTarget as Node|null
      if(!next||!event.currentTarget.contains(next))setOpen(false)
    }}
  >
    <span>{label}</span>
    <div className={'multicheck-select'+(open?' open':'')}>
      <button
        type="button"
        className="multicheck-trigger"
        aria-expanded={open}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={()=>setOpen(current=>!current)}
      >
        <span className={values.length?'has-value':'placeholder'}>{summary}</span>
        <ChevronDown size={16}/>
      </button>

      {open&&!disabled&&<div className="multicheck-menu">
        {searchable&&<div className="multicheck-search">
          <Search size={14}/>
          <input
            value={query}
            onChange={event=>setQuery(event.target.value)}
            placeholder="Buscar..."
          />
        </div>}

        <div className="multicheck-options">
          {visibleOptions.map(option=><label key={option.value} className="multicheck-option">
            <input
              type="checkbox"
              checked={optionSelected(option)}
              onChange={()=>toggle(option)}
            />
            <span>{option.label}</span>
          </label>)}
          {!visibleOptions.length&&<div className="multicheck-empty">Sin resultados</div>}
        </div>

        {values.length>0&&<button
          type="button"
          className="multicheck-clear"
          onClick={()=>onChange([])}
        >Limpiar selección</button>}
      </div>}
    </div>
  </div>
}

function RuleTargetFields({
  draft,project,onChange,
}:{
  draft:Draft
  project:ViyeuticaProject
  onChange:(draft:Draft)=>void
}){
  const activeAssignments=project.assignments.filter(item=>item.active)
  const selectedTeachers=draft.teacherIds.length?draft.teacherIds:draft.teacherId?[draft.teacherId]:[]
  const selectedGroups=draft.groupIds.length?draft.groupIds:draft.groupId?[draft.groupId]:[]
  const selectedSubjects=draft.subjectIds.length?draft.subjectIds:draft.subjectId?[draft.subjectId]:[]

  const groupOptions=project.groups.filter(group=>{
    if(!group.active)return false
    if(draft.scope==='teacher'&&selectedTeachers.length){
      return activeAssignments.some(item=>selectedTeachers.includes(item.teacherId)&&item.groupId===group.id)
    }
    if(draft.scope==='subject'&&selectedSubjects.length){
      return activeAssignments.some(item=>selectedSubjects.includes(item.subjectId)&&item.groupId===group.id) ||
        project.studyPlan.some(item=>item.active&&selectedSubjects.includes(item.subjectId)&&item.groupId===group.id)
    }
    return true
  })

  const subjectOptions=project.subjects.filter(subject=>{
    if(!subject.active)return false
    if(selectedGroups.length){
      const assignmentMatch=activeAssignments.some(item=>
        selectedGroups.includes(item.groupId)&&
        item.subjectId===subject.id&&
        (!selectedTeachers.length||selectedTeachers.includes(item.teacherId))
      )
      const planMatch=!selectedTeachers.length&&project.studyPlan.some(item=>
        item.active&&selectedGroups.includes(item.groupId)&&item.subjectId===subject.id
      )
      return assignmentMatch||planMatch
    }
    if(draft.scope==='teacher'&&selectedTeachers.length){
      return activeAssignments.some(item=>selectedTeachers.includes(item.teacherId)&&item.subjectId===subject.id)
    }
    return true
  })

  const normalizedSubjectName=(name:string)=>name.trim().toLocaleLowerCase('es-ES')
  const subjectOptionGroups=Array.from(
    subjectOptions.reduce((map,subject)=>{
      const key=normalizedSubjectName(subject.name)
      const current=map.get(key)
      if(current){
        map.set(key,{...current,values:[...(current.values??[]),subject.id]})
      }else{
        map.set(key,{value:'subject-name:'+key,label:subject.name,values:[subject.id]})
      }
      return map
    },new Map<string,MultiCheckOption>()).values()
  )

  const teacherOptions=project.teachers.filter(teacher=>{
    if(!teacher.active)return false
    if(draft.scope==='teacher')return true
    if(selectedGroups.length||selectedSubjects.length){
      return activeAssignments.some(item=>
        item.teacherId===teacher.id &&
        (!selectedGroups.length||selectedGroups.includes(item.groupId)) &&
        (!selectedSubjects.length||selectedSubjects.includes(item.subjectId))
      )
    }
    return true
  })

  const updateSingle=(field:ConditionField,value:string)=>{
    const next={...draft,[field]:value} as Draft
    if(field==='teacherId'){
      next.teacherIds=[]
      if(draft.scope==='teacher'){next.groupId='';next.groupIds=[];next.subjectId='';next.subjectIds=[]}
    }
    if(field==='groupId'){
      next.groupIds=[]
      if(draft.scope!=='subject'){next.subjectId='';next.subjectIds=[]}
      if(draft.scope==='group'||draft.scope==='assignment'){next.teacherId='';next.teacherIds=[]}
    }
    if(field==='subjectId'){
      next.subjectIds=[]
      if(draft.scope==='subject'){next.teacherId='';next.teacherIds=[]}
      if(draft.scope==='group'||draft.scope==='assignment'){next.teacherId='';next.teacherIds=[]}
    }
    if(field==='day'){next.days=[];if(draft.conditionKind==='fixed_slot'){next.sessionId='';next.sessionIds=[]}}
    if(field==='sessionId')next.sessionIds=[]
    onChange(next)
  }

  const updateMulti=(field:ConditionField,values:string[])=>{
    const next={...draft} as Draft

    if(field==='teacherId'){
      next.teacherId=''
      next.teacherIds=values
      if(draft.scope==='teacher'){
        next.groupId=''
        next.groupIds=[]
        next.subjectId=''
        next.subjectIds=[]

        const compatibleGroups=project.groups.filter(group=>
          group.active&&activeAssignments.some(item=>values.includes(item.teacherId)&&item.groupId===group.id)
        )
        if(values.length>0&&compatibleGroups.length===1){
          next.groupIds=[compatibleGroups[0].id]
        }
      }
    }

    if(field==='groupId'){
      next.groupId=''
      next.groupIds=values
      if(draft.scope!=='subject'){
        next.subjectId=''
        next.subjectIds=[]
      }

      const compatibleSubjects=project.subjects.filter(subject=>{
        if(!subject.active)return false
        return activeAssignments.some(item=>
          values.includes(item.groupId)&&
          item.subjectId===subject.id&&
          (!selectedTeachers.length||selectedTeachers.includes(item.teacherId))
        ) || (!selectedTeachers.length&&project.studyPlan.some(item=>
          item.active&&values.includes(item.groupId)&&item.subjectId===subject.id
        ))
      })
      const compatibleSubjectGroups=compatibleSubjects.reduce((map,subject)=>{
        const key=subject.name.trim().toLocaleLowerCase('es-ES')
        map.set(key,[...(map.get(key)??[]),subject.id])
        return map
      },new Map<string,string[]>())
      if(draft.scope!=='subject'&&values.length>0&&compatibleSubjectGroups.size===1){
        next.subjectIds=[...compatibleSubjectGroups.values()][0]
      }

      if(draft.scope==='group'||draft.scope==='subject'){
        next.teacherId=''
        next.teacherIds=[]
      }
    }

    if(field==='subjectId'){
      next.subjectId=''
      next.subjectIds=values
      if(draft.scope==='subject'){
        next.teacherId=''
        next.teacherIds=[]
      }
      if(draft.scope==='group'){
        next.teacherId=''
        next.teacherIds=[]
      }
    }

    if(field==='day'){next.day='';next.days=values}
    if(field==='sessionId'){next.sessionId='';next.sessionIds=values}
    onChange(next)
  }

  const disabled=(field:ConditionField)=>{
    if(!draft.scope)return true
    if(field==='groupId'){
      if(draft.scope==='teacher') return selectedTeachers.length===0
      if(draft.scope==='subject') return selectedSubjects.length===0
    }
    if(field==='subjectId'){
      if(draft.scope==='group'||draft.scope==='assignment'||draft.scope==='teacher') return selectedGroups.length===0
    }
    if(field==='teacherId'){
      if(draft.scope==='group'||draft.scope==='assignment') return selectedSubjects.length===0
      if(draft.scope==='subject') return selectedGroups.length===0
    }
    if(field==='sessionId'&&draft.conditionKind==='fixed_slot') return !draft.day
    return false
  }

  const placeholder=(field:ConditionField)=>{
    if(draft.conditionKind==='generic'&&field==='teacherId'&&draft.scope==='teacher')return 'Todo el profesorado'
    if(draft.conditionKind==='generic'&&field==='groupId'&&draft.scope==='group')return 'Todos los grupos'
    if(draft.conditionKind==='generic'&&field==='subjectId'&&draft.scope==='subject')return 'Todas las materias'
    if(field==='groupId'&&draft.scope==='teacher'&&selectedTeachers.length===0)return 'Selecciona primero Profesor/a'
    if(field==='groupId'&&draft.scope==='subject'&&selectedSubjects.length===0)return 'Selecciona primero Materia'
    if(field==='subjectId'&&selectedGroups.length===0&&['group','assignment','teacher'].includes(draft.scope))return 'Selecciona primero Grupo'
    if(field==='teacherId'&&selectedSubjects.length===0&&['group','assignment'].includes(draft.scope))return 'Selecciona primero Materia'
    if(field==='teacherId'&&selectedGroups.length===0&&draft.scope==='subject')return 'Selecciona primero Grupo'
    if(field==='sessionId'&&draft.conditionKind==='fixed_slot'&&!draft.day)return 'Selecciona primero Día'
    return 'Cualquiera / no aplica'
  }

  const render=(field:ConditionField)=>{
    if(!conditionUses(draft.conditionKind,field))return null
    const multi=isMultiField(draft,field)

    if(field==='teacherId'){
      if(multi)return <MultiCheckSelect key={field} label="Profesor/a" placeholder={placeholder(field)} disabled={disabled(field)}
        searchable options={teacherOptions.map(item=>({value:item.id,label:item.name}))} values={draft.teacherIds} onChange={values=>updateMulti(field,values)}/>
      return <Field key={field} label="Profesor/a"><select disabled={disabled(field)} value={draft.teacherId} onChange={e=>updateSingle(field,e.target.value)}>
        <option value="">{placeholder(field)}</option>{teacherOptions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field>
    }

    if(field==='groupId'){
      const control=multi
        ? <MultiCheckSelect key={field} label="Grupo" placeholder={placeholder(field)} disabled={disabled(field)||groupOptions.length===1}
            searchable options={groupOptions.map(item=>({value:item.id,label:item.name}))} values={draft.groupIds} onChange={values=>updateMulti(field,values)}/>
        : <Field key={field} label="Grupo"><select disabled={disabled(field)} value={draft.groupId} onChange={e=>updateSingle(field,e.target.value)}>
            <option value="">{placeholder(field)}</option>{groupOptions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select></Field>

      return control
    }

    if(field==='subjectId'){
      if(multi)return <MultiCheckSelect key={field} label="Materia" placeholder={placeholder(field)} disabled={disabled(field)||subjectOptions.length===1}
        searchable options={subjectOptionGroups} values={draft.subjectIds} onChange={values=>updateMulti(field,values)}/>
      return <Field key={field} label="Materia"><select disabled={disabled(field)} value={draft.subjectId} onChange={e=>updateSingle(field,e.target.value)}>
        <option value="">{placeholder(field)}</option>{subjectOptions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field>
    }

    if(field==='stage')return <Field key={field} label="Etapa"><select value={draft.stage} onChange={e=>updateSingle(field,e.target.value)}>
      <option value="">Cualquiera / no aplica</option>{project.center.stages.map(stage=><option key={stage} value={stage}>{stage}</option>)}
    </select></Field>

    if(field==='day'){
      const options=project.schedule.activeDays.map(day=>({value:day,label:dayName(day)}))
      if(multi)return <MultiCheckSelect key={field} label="Día" placeholder="Cualquiera / no aplica" options={options} values={draft.days} onChange={values=>updateMulti(field,values)}/>
      return <Field key={field} label="Día"><select value={draft.day} onChange={e=>updateSingle(field,e.target.value)}>
        <option value="">Cualquiera / no aplica</option>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
      </select></Field>
    }

    if(field==='sessionId'){
      const options=project.schedule.blocks.filter(block=>block.active).map(block=>({value:block.id,label:`${block.label} · ${block.start}-${block.end}`}))
      if(multi)return <MultiCheckSelect key={field} label="Sesión" placeholder={placeholder(field)} disabled={disabled(field)} options={options} values={draft.sessionIds} onChange={values=>updateMulti(field,values)}/>
      return <Field key={field} label="Sesión"><select disabled={disabled(field)} value={draft.sessionId} onChange={e=>updateSingle(field,e.target.value)}>
        <option value="">{placeholder(field)}</option>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
      </select></Field>
    }

    return null
  }

  return <>{targetFieldOrder(draft.scope).map(render)}</>
}
function scopeLabel(scope:string){return scopes.find(([value])=>value===scope)?.[1]??scope}
function sourceLabel(source:CenterRule['source']){return source==='normative'?'Normativa':source==='imported'?'Importada':'Manual'}
function NormativeTrace({project,id}:{project:ViyeuticaProject;id:string}){
  const rule=project.normativeRules.find(item=>item.id===id)
  const source=rule?project.normativeSources.find(item=>item.id===rule.sourceId):undefined
  if(!rule)return null
  return <div className="rule-trace"><FileCheck2 size={13}/><span>{source?.name??'Fuente normativa'} · {rule.reference?rule.reference+' · ':''}pág. {rule.page} · confianza {Math.round(rule.confidence*100)}%</span></div>
}


function humanRuleName(code:string){
  const names:Record<string,string>={
    SIN_SOLAPE_DOCENTE:'Sin solape de profesorado',
    SIN_SOLAPE_GRUPO:'Sin solape de grupos',
    RESPETAR_DISPONIBILIDAD_DOCENTE:'Respetar disponibilidad docente',
    RESPETAR_FRANJAS_FIJAS:'Respetar franjas fijas',
    REDUCIR_HUECOS_DOCENTES:'Reducir huecos del profesorado',
  }
  return names[code]??code.replace(/_/g,' ').toLowerCase().replace(/^./,letter=>letter.toUpperCase())
}

function ruleDisplayName(rule:CenterRule){
  const builtin=['SIN_SOLAPE_DOCENTE','SIN_SOLAPE_GRUPO','RESPETAR_DISPONIBILIDAD_DOCENTE','RESPETAR_FRANJAS_FIJAS','REDUCIR_HUECOS_DOCENTES']
  if(builtin.includes(rule.code)) return humanRuleName(rule.code)
  return conditionKindLabel(String(rule.parameters?.conditionKind??'generic'))
}


function describeParameters(rule:CenterRule, project:ViyeuticaProject){
  const p=rule.parameters??{}
  const parts:string[]=[]
  const teacherIds=Array.isArray(p.teacherIds)?p.teacherIds.map(String):p.teacherId?[String(p.teacherId)]:[]
  const groupIds=Array.isArray(p.groupIds)?p.groupIds.map(String):p.groupId?[String(p.groupId)]:[]
  const subjectIds=Array.isArray(p.subjectIds)?p.subjectIds.map(String):p.subjectId?[String(p.subjectId)]:[]
  const days=Array.isArray(p.days)?p.days.map(String):p.day?[String(p.day)]:[]
  const sessionIds=Array.isArray(p.sessionIds)?p.sessionIds.map(String):p.sessionId?[String(p.sessionId)]:[]
  const teacherNames=uniqueDisplayNames(teacherIds.map(id=>project.teachers.find(item=>item.id===id)?.name).filter(Boolean) as string[])
  const groupNames=uniqueDisplayNames(groupIds.map(id=>project.groups.find(item=>item.id===id)?.name).filter(Boolean) as string[])
  const subjectNames=uniqueDisplayNames(subjectIds.map(id=>project.subjects.find(item=>item.id===id)?.name).filter(Boolean) as string[])
  const blockNames=uniqueDisplayNames(sessionIds.map(id=>project.schedule.blocks.find(item=>item.id===id)?.label).filter(Boolean) as string[])
  if(teacherNames.length) parts.push('Profesorado: '+teacherNames.join(', '))
  if(groupNames.length) parts.push('Grupos: '+groupNames.join(', '))
  if(subjectNames.length) parts.push('Materias: '+subjectNames.join(', '))
  if(p.stage) parts.push('Etapa: '+String(p.stage))
  if(days.length) parts.push('Días: '+days.map(dayName).join(', '))
  if(blockNames.length) parts.push('Sesiones: '+blockNames.join(', '))
  if(p.value!==undefined) parts.push(comparisonLabel(String(p.comparison??'equals'))+' '+String(p.value))
  return parts.length?parts.join(' · '):'Sin condiciones específicas'
}

function RuleConditionGuide({draft,project}:{draft:Draft;project:ViyeuticaProject}){
  const teachers=draft.teacherIds.length?draft.teacherIds:draft.teacherId?[draft.teacherId]:[]
  const groups=draft.groupIds.length?draft.groupIds:draft.groupId?[draft.groupId]:[]
  const subjects=draft.subjectIds.length?draft.subjectIds:draft.subjectId?[draft.subjectId]:[]
  const days=draft.days.length?draft.days:draft.day?[draft.day]:[]
  const sessions=draft.sessionIds.length?draft.sessionIds:draft.sessionId?[draft.sessionId]:[]
  const activeAssignments=project.assignments.filter(item=>item.active)

  const teacherCoverage=teachers.map(teacherId=>{
    const teacher=project.teachers.find(item=>item.id===teacherId)
    const teacherGroupIds=[...new Set(activeAssignments
      .filter(item=>item.teacherId===teacherId)
      .map(item=>item.groupId))]
    const covered=groups.length>0&&teacherGroupIds.some(groupId=>groups.includes(groupId))
    return {
      teacherId,
      name:teacher?.name??teacherId,
      groupIds:teacherGroupIds,
      covered,
    }
  })
  const coveredTeachers=teacherCoverage.filter(item=>item.covered)
  const pendingTeachers=teacherCoverage.filter(item=>!item.covered)
  const coveredTeacherCount=coveredTeachers.length

  const commonGroupIds=teachers.length>1
    ? teacherCoverage.reduce<string[]>((common,item,index)=>
        index===0
          ? item.groupIds
          : common.filter(groupId=>item.groupIds.includes(groupId))
      ,[])
    : []

  const groupName=(groupId:string)=>project.groups.find(item=>item.id===groupId)?.name??groupId
  const commonGroupNames=commonGroupIds.map(groupName)
  const pendingTeacherDetails=pendingTeachers.map(item=>{
    const names=item.groupIds.map(groupName)
    return `${item.name}: ${names.length?names.join(', '):'sin grupos asignados'}`
  })

  const subjectCoverage=teachers.map(teacherId=>{
    const teacher=project.teachers.find(item=>item.id===teacherId)
    const assignments=activeAssignments.filter(item=>
      item.teacherId===teacherId&&
      (!groups.length||groups.includes(item.groupId))
    )
    const subjectIds=[...new Set(assignments.map(item=>item.subjectId))]
    const subjectNames=[...new Set(subjectIds
      .map(subjectId=>project.subjects.find(item=>item.id===subjectId)?.name)
      .filter(Boolean) as string[])]
    const covered=subjects.length>0&&subjectIds.some(subjectId=>subjects.includes(subjectId))
    return {
      teacherId,
      name:teacher?.name??teacherId,
      subjectIds,
      subjectNames,
      covered,
    }
  })
  const coveredSubjectTeachers=subjectCoverage.filter(item=>item.covered)
  const pendingSubjectTeachers=subjectCoverage.filter(item=>!item.covered)

  const commonSubjectNames=teachers.length>1
    ? subjectCoverage.reduce<string[]>((common,item,index)=>{
        const normalized=item.subjectNames.map(name=>name.trim().toLocaleLowerCase('es-ES'))
        if(index===0)return [...item.subjectNames]
        return common.filter(name=>normalized.includes(name.trim().toLocaleLowerCase('es-ES')))
      },[])
    : []

  const pendingSubjectDetails=pendingSubjectTeachers.map(item=>
    `${item.name}: ${item.subjectNames.length?item.subjectNames.join(', '):'sin materias compatibles'}`
  )

  const condition=conditionKindLabel(draft.conditionKind)

  let title='Configura la regla paso a paso'
  let message='Selecciona el tipo de condición para comenzar.'
  let tone='empty'

  if(draft.conditionKind){
    if(!draft.scope){
      title=`Selecciona el ámbito para ${condition}`
      message='El ámbito determina sobre qué elemento se aplicará y cómo se contará la regla.'
    }else if(draft.conditionKind==='generic'&&draft.scope==='teacher'&&teachers.length===0){
      title='Condición general descriptiva para todo el profesorado'
      message='No necesita Profesor/a, Comparación ni Valor. Úsala solo para documentar una condición general; las restricciones estructurales del generador se aplican automáticamente.'
      tone='complete'
    }else if(draft.conditionKind==='generic'&&draft.scope==='group'&&groups.length===0){
      title='Condición general descriptiva para todos los grupos'
      message='No necesita Grupo, Comparación ni Valor. Úsala solo para documentar una condición general; las restricciones estructurales del generador se aplican automáticamente.'
      tone='complete'
    }else if(draft.conditionKind==='generic'&&draft.scope==='subject'&&subjects.length===0){
      title='Condición general descriptiva para todas las materias'
      message='No necesita Materia, Comparación ni Valor. Úsala solo para documentar una condición general.'
      tone='complete'
    }else if(draft.scope==='teacher'&&teachers.length===0&&conditionUses(draft.conditionKind,'teacherId')){
      title=`Selecciona Profesor/a para ${condition}`
      message='Puedes seleccionar uno o varios docentes cuando la regla admita aplicación múltiple.'
    }else if(draft.scope==='group'&&groups.length===0&&conditionUses(draft.conditionKind,'groupId')){
      title=`Selecciona Grupo para ${condition}`
      message='Elige uno o varios grupos a los que se aplicará esta condición.'
    }else if(draft.scope==='subject'&&subjects.length===0&&conditionUses(draft.conditionKind,'subjectId')){
      title=`Selecciona Materia para ${condition}`
      message='Elige una o varias materias para delimitar la regla.'
    }else if(draft.scope==='assignment'&&groups.length===0){
      title=`Selecciona Grupo para ${condition}`
      message='La asignación se identifica en orden: Grupo → Materia → Profesor/a.'
    }else if(draft.scope==='assignment'&&subjects.length===0){
      title=`Selecciona Materia para ${condition}`
      message='Ahora selecciona la materia asociada al grupo elegido.'
    }else if(draft.scope==='assignment'&&teachers.length===0){
      title=`Selecciona Profesor/a para ${condition}`
      message='Completa la asignación seleccionando el docente correspondiente.'
    }else if(
      conditionUsesTeachingCoverage(draft.conditionKind)&&
      draft.scope==='teacher'&&
      teachers.length===1&&
      conditionUses(draft.conditionKind,'groupId')&&
      groups.length===0
    ){
      const availableGroups=teacherCoverage[0]?.groupIds.map(groupName)??[]
      title=`Selecciona Grupo para ${condition}`
      message=availableGroups.length
        ? `${selectedNames(teachers,project.teachers)} tiene asignados los grupos: ${availableGroups.join(', ')}. Selecciona el grupo o grupos a los que quieres aplicar la regla.`
        : `${selectedNames(teachers,project.teachers)} no tiene grupos activos asociados en Asignaciones.`
      tone='partial'
    }else if(
      conditionUsesTeachingCoverage(draft.conditionKind)&&
      draft.scope==='teacher'&&
      teachers.length>1&&
      conditionUses(draft.conditionKind,'groupId')&&
      (groups.length===0||coveredTeacherCount<teachers.length)
    ){
      if(groups.length===0){
        title=`Selecciona Grupo para ${condition}`
        if(commonGroupNames.length){
          message=`Debes seleccionar un grupo de al menos uno de los docentes. ${selectedNames(teachers,project.teachers)} tienen en común ${singular(commonGroupNames.length)?'el grupo':'los grupos'} ${commonGroupNames.join(', ')}.`
        }else{
          message=`Debes seleccionar un grupo de al menos uno de los docentes. No tienen ningún grupo en común, por lo que tendrás que seleccionar grupos compatibles de uno o varios docentes.`
        }
        tone='partial'
      }else{
        const coveredNames=coveredTeachers.map(item=>item.name).join(', ')
        title=`Has cubierto ${singular(coveredTeacherCount)?'al profesor':'a los profesores'} ${coveredNames}`
        if(singular(pendingTeachers.length)){
          const pending=pendingTeachers[0]
          const available=pending.groupIds.map(groupName)
          message=available.length===0
            ? `Queda pendiente ${pending.name}. No tiene grupos compatibles disponibles.`
            : singular(available.length)
              ? `Queda pendiente ${pending.name}. Su grupo disponible es ${available[0]}.`
              : `Queda pendiente ${pending.name}. Sus grupos disponibles son: ${available.join(', ')}.`
        }else{
          message=`Quedan pendientes ${pendingTeachers.map(item=>item.name).join(', ')}. Grupos disponibles: ${pendingTeacherDetails.join(' · ')}.`
        }
        tone='partial'
      }
    }else if(
      conditionUsesTeachingCoverage(draft.conditionKind)&&
      draft.scope==='teacher'&&
      teachers.length>1&&
      conditionUses(draft.conditionKind,'subjectId')&&
      groups.length>0
    ){
      const coveredCount=coveredSubjectTeachers.length
      if(subjects.length===0){
        title=`Selecciona Materia para ${condition}`
        if(commonSubjectNames.length){
          message=`${selectedNames(teachers,project.teachers)} tienen en común ${singular(commonSubjectNames.length)?'la materia':'las materias'} ${commonSubjectNames.join(', ')}. Puedes seleccionar una materia común o elegir materias compatibles de cada docente.`
        }else{
          message='Los profesores seleccionados no tienen ninguna materia en común dentro de los grupos elegidos. Selecciona una o varias materias compatibles.'
        }
        tone='partial'
      }else if(coveredCount<teachers.length){
        const coveredNames=coveredSubjectTeachers.map(item=>item.name).join(', ')
        title=`Has cubierto ${singular(coveredCount)?'al profesor':'a los profesores'} ${coveredNames}`
        if(singular(pendingSubjectTeachers.length)){
          const pending=pendingSubjectTeachers[0]
          message=pending.subjectNames.length===0
            ? `Queda pendiente ${pending.name}. No tiene materias compatibles disponibles.`
            : singular(pending.subjectNames.length)
              ? `Queda pendiente ${pending.name}. Su materia disponible es ${pending.subjectNames[0]}.`
              : `Queda pendiente ${pending.name}. Sus materias disponibles son: ${pending.subjectNames.join(', ')}.`
        }else{
          message=`Quedan pendientes ${pendingSubjectTeachers.map(item=>item.name).join(', ')}. Materias disponibles: ${pendingSubjectDetails.join(' · ')}.`
        }
        tone='partial'
      }else if(conditionUses(draft.conditionKind,'value')&&!draft.value){
        title=`Indica el valor para ${condition}`
        message=valueGuideMessage(draft)
        tone='empty'
      }else if(draft.ruleType==='SOFT'&&!draft.weight){
        title='Selecciona la prioridad de la preferencia'
        message='La selección de profesorado, grupos y materias ya está completa. Indica ahora cuánto debe priorizar ⩒Yeutika esta preferencia.'
        tone='empty'
      }else{
        title='Regla lista para revisar'
        message=generateRuleDescription(draft,project)
        tone='complete'
      }
    }else if(
      conditionUsesTeachingCoverage(draft.conditionKind)&&
      draft.scope==='subject'&&
      subjects.length>0&&
      conditionUses(draft.conditionKind,'groupId')&&
      groups.length===0
    ){
      title=`Selecciona Grupo para ${condition}`
      message='Selecciona el grupo o grupos en los que quieres aplicar esta condición a la materia elegida.'
      tone='partial'
    }else if(conditionUses(draft.conditionKind,'subjectId')&&
      ((draft.scope==='teacher'&&groups.length>0)||(draft.scope==='group'&&groups.length>0))&&subjects.length===0){
      title=`Selecciona Materia para ${condition}`
      message='El listado ya está filtrado por los datos seleccionados anteriormente.'
    }else if(
      ['availability','avoid_slot'].includes(draft.conditionKind)&&
      days.length===0&&
      sessions.length===0
    ){
      title=`Selecciona Día o Sesión para ${condition}`
      message='Debes indicar al menos una referencia temporal. Puedes elegir uno o varios días, una o varias sesiones, o combinar ambas opciones.'
    }else if(conditionUses(draft.conditionKind,'day')&&days.length===0&&draft.conditionKind==='fixed_slot'){
      title=`Selecciona Día para ${condition}`
      message='Después podrás seleccionar la sesión concreta.'
    }else if(conditionUses(draft.conditionKind,'sessionId')&&sessions.length===0&&draft.conditionKind==='fixed_slot'){
      title=`Selecciona Sesión para ${condition}`
      message='La sesión depende del día seleccionado.'
    }else if(conditionUses(draft.conditionKind,'value')&&!draft.value){
      title=`Indica el valor para ${condition}`
      message=valueGuideMessage(draft)
    }else if(draft.ruleType==='SOFT'&&!draft.weight){
      title='Selecciona la prioridad de la preferencia'
      message='La prioridad indica cuánto debe intentar ⩒Yeutika respetar esta regla frente a otras preferencias.'
    }else{
      title='Regla lista para revisar'
      message=generateRuleDescription(draft,project)
      tone='complete'
    }
  }

  return <div className={'rule-condition-preview rule-guide '+tone}>
    <strong>{title}</strong>
    <span>{message}</span>
  </div>
}

function dayName(day:string){
  return day==='L'?'Lunes':day==='M'?'Martes':day==='X'?'Miércoles':day==='J'?'Jueves':day==='V'?'Viernes':day==='S'?'Sábado':day
}
function comparisonLabel(value:string){
  const labels:Record<string,string>={
    equals:'Igual a',not_equals:'Distinto de',minimum:'Mínimo',maximum:'Máximo',avoid:'Evitar',prefer:'Preferir'
  }
  return labels[value]??value
}


function NormativeTraceabilityPanel({project}:{project:ViyeuticaProject}){
  const linkedRules=project.rules.filter(rule=>rule.source==='normative'&&rule.normativeRuleId)
  const approvedNormative=project.normativeRules.filter(rule=>rule.approved&&(rule.relevance??legacyNormativeRelevance(rule))==='timetable')

  const stateClass=linkedRules.length?'linked':approvedNormative.length?'pending-link':'missing'
  return <section className={'normative-traceability-panel '+stateClass}>
    <div className="normative-traceability-heading">
      <div>
        <span className="panel-kicker">Trazabilidad normativa</span>
        <h2>Qué normativa está influyendo en las reglas</h2>
        <p>⩒Yeutika conserva el vínculo entre la regla operativa y el fragmento normativo que la originó para poder justificarla durante la prevalidación, generación y auditoría.</p>
      </div>
      <div className="normative-traceability-kpis">
        <span><strong>{approvedNormative.length}</strong><small>reglas normativas aprobadas</small></span>
        <span><strong>{linkedRules.length}</strong><small>incorporadas a Reglas</small></span>
      </div>
    </div>

    {linkedRules.length===0
      ? <div className="normative-traceability-empty">
          <ShieldAlert size={20}/>
          <div>
            <strong>{approvedNormative.length
              ? 'Hay normativa aprobada pendiente de incorporar'
              : 'No hay reglas normativas aprobadas'}</strong>
            <p>{approvedNormative.length
              ? `Hay ${approvedNormative.length} reglas aprobadas en Normativa, pero todavía no influyen en Generación ni Auditoría porque no se han incorporado a Reglas. Usa “Incorporar normativa aprobada”.`
              : 'Las reglas actuales proceden únicamente de configuración manual o de una importación anterior. Si el centro necesita justificar restricciones con normativa vigente, revisa primero el módulo Normativa.'}</p>
          </div>
        </div>
      : <div className="normative-traceability-list">
          {linkedRules.map(rule=><NormativeTraceabilityItem key={rule.id} project={project} rule={rule}/>)}
        </div>}
  </section>
}

function NormativeTraceabilityItem({project,rule}:{project:ViyeuticaProject;rule:CenterRule}){
  const normative=project.normativeRules.find(item=>item.id===rule.normativeRuleId)
  const source=normative?project.normativeSources.find(item=>item.id===normative.sourceId):undefined

  if(!normative){
    return <article className="normative-traceability-item broken">
      <div className="normative-traceability-title">
        <ShieldAlert size={18}/>
        <div><strong>{humanRuleName(rule.code)}</strong><span>La referencia normativa original ya no está disponible.</span></div>
      </div>
    </article>
  }

  const applies=[
    normative.stage&&`Etapa: ${normative.stage}`,
    normative.level&&`Nivel: ${normative.level}`,
    normative.subject&&`Materia: ${normative.subject}`,
  ].filter(Boolean)

  return <article className="normative-traceability-item">
    <div className="normative-traceability-title">
      <FileCheck2 size={18}/>
      <div>
        <strong>{humanRuleName(rule.code)}</strong>
        <span>{rule.ruleType} · {rule.active?'Activa':'Inactiva'}{rule.reviewRequired?' · pendiente de revisión':''}</span>
      </div>
    </div>

    <div className="normative-traceability-grid">
      <div>
        <span className="trace-label">Regla normativa de origen</span>
        <strong>{normative.label}</strong>
        <p>{normative.excerpt||'Sin fragmento textual disponible.'}</p>
      </div>
      <div>
        <span className="trace-label">Fuente</span>
        <strong>{source?.name??'Documento no disponible'}</strong>
        <p>Página {normative.page} · confianza {Math.round(normative.confidence*100)}%</p>
      </div>
      <div>
        <span className="trace-label">Dato extraído</span>
        <strong>{normative.value!==null?`${normative.value} ${normativeUnitLabel(normative.unit)}`:'Regla textual'}</strong>
        <p>{applies.length?applies.join(' · '):'Aplicación general o no determinada automáticamente.'}</p>
      </div>
      <div>
        <span className="trace-label">Cómo se usa en ⩒Yeutika</span>
        <strong>{explainNormativeUse(rule,normative)}</strong>
        <p>{explainNormativeImpact(rule,normative)}</p>
      </div>
    </div>
  </article>
}

function normativeUnitLabel(unit:NormativeRule['unit']){
  if(unit==='hours')return 'horas'
  if(unit==='minutes')return 'minutos'
  if(unit==='periods')return 'periodos'
  return ''
}

function explainNormativeUse(rule:CenterRule,normative:NormativeRule){
  if(normative.kind==='weekly_hours'||normative.kind==='weekly_minutes'||normative.kind==='weekly_periods'){
    return 'Control de carga semanal'
  }
  if(normative.kind==='session_minutes'){
    return 'Control de duración de sesiones'
  }
  if(normative.kind==='teacher_periods'){
    return 'Control de carga del profesorado'
  }
  if(normative.kind==='subject_rule'){
    return 'Restricción asociada a una materia'
  }
  if(normative.kind==='stage_rule'){
    return 'Restricción asociada a una etapa'
  }
  return rule.ruleType==='HARD'?'Restricción obligatoria':'Preferencia de optimización'
}

function explainNormativeImpact(rule:CenterRule,normative:NormativeRule){
  const value=normative.value!==null?` (${normative.value} ${normativeUnitLabel(normative.unit)})`:''
  if(rule.reviewRequired){
    return `Se ha creado a partir de la normativa${value}, pero todavía requiere revisión humana antes de considerarla definitiva.`
  }
  if(rule.ruleType==='HARD'){
    return `Generación deberá respetarla obligatoriamente${value}. Auditoría comprobará su cumplimiento cuando la condición sea evaluable automáticamente.`
  }
  return `Generación la tratará como preferencia ponderada${value}; no invalida por sí sola el horario.`
}


function legacyNormativeRelevance(rule:NormativeRule){
  if(rule.section==='schedule'||rule.section==='assignments'||rule.section==='staff'||rule.section==='structure') return 'timetable'
  if(rule.section==='study_plan'&&['weekly_hours','weekly_minutes','weekly_periods','session_minutes','subject_rule'].includes(rule.kind)) return 'timetable'
  if(rule.section==='rules'&&/horario|sesión|periodo|jornada|docente|grupo|asignación|disponibilidad|simult|solap|recreo/i.test(rule.excerpt)) return 'timetable'
  return 'reference'
}
