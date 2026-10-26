import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Eye, FileSearch, FileText, ShieldCheck, Trash2, UploadCloud, XCircle,
} from 'lucide-react'
import type { NormativeRelevance, NormativeRule, NormativeSection, ViyeuticaProject } from '../domain/project'
import { analyzeNormativeFile, findNormativeConflicts } from '../domain/normativeAnalyzer'
import { convertNormativeToCenterRule, isNormativeRuleLinked } from '../domain/normativeRuleBridge'
import { saveProject } from '../store/projectStorage'
import { AppModal } from '../components/AppModal'
import { deleteNormativeFile, getNormativeFile, saveNormativeFile } from '../store/normativeFileStorage'

const SECTION_LABELS:Record<NormativeSection,string>={
  center:'Centro',
  structure:'Estructura y grupos',
  schedule:'Jornada y sesiones',
  study_plan:'Plan de estudios',
  staff:'Profesorado',
  assignments:'Asignaciones',
  rules:'Reglas',
  general:'General',
}

export function NormativePage({project}:{project:ViyeuticaProject}) {
  const inputRef=useRef<HTMLInputElement|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [filter,setFilter]=useState<NormativeSection|'all'>('all')
  const [relevanceFilter,setRelevanceFilter]=useState<NormativeRelevance>('timetable')
  const [viewer,setViewer]=useState<{name:string;url:string}|null>(null)
  const [viewerError,setViewerError]=useState('')
  const [actionMessage,setActionMessage]=useState('')
  const [pendingDeleteSource,setPendingDeleteSource]=useState<string|null>(null)

  const approved=project.normativeRules.filter(rule=>rule.approved)
  const conflicts=useMemo(()=>findNormativeConflicts(project.normativeRules),[project.normativeRules])
  const conflictRuleIds=useMemo(()=>new Set(conflicts.flatMap(item=>item.ruleIds)),[conflicts])
  const visibleRules=useMemo(
    ()=>project.normativeRules.filter(rule=>
      (rule.relevance??inferLegacyRelevance(rule))===relevanceFilter &&
      (filter==='all'||rule.section===filter)
    ),
    [project.normativeRules,filter,relevanceFilter],
  )

  const persist=(patch:Partial<ViyeuticaProject>)=>saveProject({...project,...patch})

  const uploadMany=async(files:FileList|File[])=>{
    const selected=Array.from(files)
    if(!selected.length)return
    setBusy(true)
    setError('')
    try{
      const nextSources=[...project.normativeSources]
      const nextRules=[...project.normativeRules]
      const knownByHash=new Map(nextSources.map(source=>[source.sha256,source]))
      const messages:string[]=[]

      for(const file of selected){
        try{
          const result=await analyzeNormativeFile(file)
          const existing=knownByHash.get(result.source.sha256)
          if(existing){
            await saveNormativeFile(existing.id,file)
            messages.push(`${file.name}: ya estaba registrado; se ha actualizado el archivo original para poder visualizarlo.`)
            continue
          }
          nextSources.push(result.source)
          nextRules.push(...result.rules)
          knownByHash.set(result.source.sha256,result.source)
          await saveNormativeFile(result.source.id,file)
        }catch(err){
          messages.push(`${file.name}: ${err instanceof Error?err.message:'no se ha podido analizar'}`)
        }
      }

      if(nextSources.length!==project.normativeSources.length||nextRules.length!==project.normativeRules.length){
        persist({normativeSources:nextSources,normativeRules:nextRules})
      }
      if(messages.length)setError(messages.join(' · '))
    }finally{
      setBusy(false)
      if(inputRef.current) inputRef.current.value=''
    }
  }

  const openSource=async(sourceId:string,name:string,page?:number)=>{
    setViewerError('')
    try{
      const blob=await getNormativeFile(sourceId)
      if(!blob){
        setViewerError('El documento se cargó antes de que ⩒Yeutika almacenase los archivos originales. Selecciónalo de nuevo y se asociará a esta ficha sin duplicarlo.')
        return
      }
      const baseUrl=URL.createObjectURL(blob)
      const url=page&&page>0?baseUrl+'#page='+page:baseUrl
      setViewer({name:page&&page>0?name+' · pág. '+page:name,url})
    }catch(err){
      setViewerError(err instanceof Error?err.message:'No se ha podido abrir el documento.')
    }
  }

  const closeViewer=()=>{
    if(viewer)URL.revokeObjectURL(viewer.url)
    setViewer(null)
  }

  const toggleRule=(id:string)=>persist({
    normativeRules:project.normativeRules.map(rule=>rule.id===id?{...rule,approved:!rule.approved}:rule),
  })

  const approveHighConfidence=()=>persist({
    normativeRules:project.normativeRules.map(rule=>
      (rule.relevance??inferLegacyRelevance(rule))==='timetable'&&rule.confidence>=0.78&&!conflictRuleIds.has(rule.id)
        ? {...rule,approved:true}
        : rule
    ),
  })

  const setRuleRelevance=(id:string,relevance:NormativeRelevance)=>persist({
    normativeRules:project.normativeRules.map(rule=>rule.id===id?{...rule,relevance}:rule),
  })

  const rejectAll=()=>persist({
    normativeRules:project.normativeRules.map(rule=>({...rule,approved:false})),
  })

  const incorporateRule=(rule:NormativeRule)=>{
    if(!rule.approved||conflictRuleIds.has(rule.id))return
    if(isNormativeRuleLinked(project.rules,rule.id))return
    const source=project.normativeSources.find(item=>item.id===rule.sourceId)
    persist({rules:[...project.rules,convertNormativeToCenterRule(rule,source)]})
    setActionMessage('Regla incorporada. Revisa ahora sus parámetros en Reglas antes de considerarla definitiva.')
  }

  const removeSource=async(sourceId:string)=>{
    await deleteNormativeFile(sourceId).catch(()=>undefined)
    const normativeRuleIds=new Set(project.normativeRules.filter(rule=>rule.sourceId===sourceId).map(rule=>rule.id))
    persist({
      normativeSources:project.normativeSources.filter(source=>source.id!==sourceId),
      normativeRules:project.normativeRules.filter(rule=>rule.sourceId!==sourceId),
      rules:project.rules.filter(rule=>!rule.normativeRuleId||!normativeRuleIds.has(rule.normativeRuleId)),
    })
    setPendingDeleteSource(null)
    setActionMessage('Fuente normativa eliminada junto con las reglas incorporadas que dependían exclusivamente de ella.')
  }

  return <div className="normative-page">
    <section className="wizard-intro">
      <div>
        <h1 className="wizard-page-title"><FileSearch size={28}/> Normativa</h1>
        <p>Carga documentos normativos para que ⩒Yeutika extraiga reglas candidatas. Ninguna regla se utiliza en plantillas hasta que sea revisada y aprobada.</p>
      </div>
      <div className="normative-kpis">
        <span><strong>{project.normativeSources.length}</strong><small>{project.normativeSources.length===1?'documento':'documentos'}</small></span>
        <span><strong>{project.normativeRules.length}</strong><small>{project.normativeRules.length===1?'regla detectada':'reglas detectadas'}</small></span>
        <span><strong>{approved.length}</strong><small>{approved.length===1?'aprobada':'aprobadas'}</small></span>
        <span className={conflicts.length?'warning':''}><strong>{conflicts.length}</strong><small>{conflicts.length===1?'contradicción':'contradicciones'}</small></span>
      </div>
    </section>

    <section className="normative-upload-card">
      <div className="normative-upload-icon"><UploadCloud size={30}/></div>
      <div>
        <span className="panel-kicker">Importar fuente</span>
        <h2>Subir normativa</h2>
        <p>Compatible actualmente con PDF con texto, TXT y Markdown. El análisis se realiza en el navegador; el archivo no se envía a un servidor de ⩒Yeutika.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        multiple
        hidden
        onChange={event=>event.target.files&&uploadMany(event.target.files)}
      />
      <button className="btn primary" disabled={busy} onClick={()=>inputRef.current?.click()}>
        <UploadCloud size={16}/>{busy?'Analizando...':'Seleccionar documentos'}
      </button>
    </section>

    {error&&<div className="inline-error normative-error">{error}</div>}
    {actionMessage&&<div className="template-result"><CheckCircle2 size={16}/><span>{actionMessage}</span></div>}

    {project.normativeSources.length>0&&<section className="normative-sources">
      {project.normativeSources.map(source=>{
        const sourceRules=project.normativeRules.filter(rule=>rule.sourceId===source.id)
        const sourceApproved=sourceRules.filter(rule=>rule.approved).length
        return <article className="normative-source-card" key={source.id}>
          <FileText size={22}/>
          <div className="normative-source-main">
            <strong>{source.name}</strong>
            <span>{source.pageCount} pág. · {formatBytes(source.size)} · {source.extractedChars.toLocaleString('es-ES')} caracteres</span>
            <small>{source.stages.length?source.stages.join(' · '):'Etapa no determinada'} · SHA-256 {source.sha256.slice(0,12)}…</small>
          </div>
          <div className="normative-source-count"><strong>{sourceApproved}/{sourceRules.length}</strong><small>reglas aprobadas</small></div>
          <div className="normative-source-actions">
            <button title="Ver documento" onClick={()=>openSource(source.id,source.name)}><Eye size={16}/></button>
            <button className="row-delete" title="Eliminar fuente" onClick={()=>setPendingDeleteSource(source.id)}><Trash2 size={16}/></button>
          </div>
        </article>
      })}
    </section>}

    {conflicts.length>0&&<section className="normative-conflicts-card">
      <div className="normative-conflicts-heading">
        <AlertTriangle size={20}/>
        <div>
          <strong>Posibles contradicciones normativas</strong>
          <p>⩒Yeutika ha detectado reglas equivalentes con valores distintos. Revísalas antes de aprobarlas o convertirlas en reglas del horario.</p>
        </div>
      </div>
      <div className="normative-conflict-list">
        {conflicts.map((conflict,index)=><article key={conflict.key}>
          <span>{index+1}</span>
          <p>{conflict.description}</p>
        </article>)}
      </div>
    </section>}

    <section className="normative-rules-card">
      <div className="normative-rules-heading">
        <div>
          <span className="panel-kicker">Extracción estructurada</span>
          <h2>Reglas candidatas</h2>
          <p>Comprueba el fragmento original antes de aprobar. Las reglas aprobadas son las únicas disponibles para las plantillas.</p>
        </div>
        <div className="normative-rule-actions">
          <button className="btn ghost-inline" onClick={approveHighConfidence}><CheckCircle2 size={15}/> Aprobar alta confianza</button>
          <button className="btn ghost-inline" onClick={rejectAll}><XCircle size={15}/> Desmarcar todas</button>
        </div>
      </div>

      <div className="normative-relevance-tabs">
        <button className={relevanceFilter==='timetable'?'active':''} onClick={()=>setRelevanceFilter('timetable')}>
          Aplicable al horario
          <span>{project.normativeRules.filter(rule=>(rule.relevance??inferLegacyRelevance(rule))==='timetable').length}</span>
        </button>
        <button className={relevanceFilter==='reference'?'active':''} onClick={()=>setRelevanceFilter('reference')}>
          Normativa de referencia
          <span>{project.normativeRules.filter(rule=>(rule.relevance??inferLegacyRelevance(rule))==='reference').length}</span>
        </button>
      </div>

      <div className="normative-filter-row">
        <button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Todas</button>
        {(Object.keys(SECTION_LABELS) as NormativeSection[]).map(section=>
          <button key={section} className={filter===section?'active':''} onClick={()=>setFilter(section)}>{SECTION_LABELS[section]}</button>
        )}
      </div>

      {visibleRules.length===0
        ? <div className="groups-empty"><ShieldCheck size={28}/><strong>No hay reglas en esta vista</strong><p>Sube un documento o cambia el filtro.</p></div>
        : <div className="normative-rule-list">
            {visibleRules.map(rule=>{
              const source=project.normativeSources.find(source=>source.id===rule.sourceId)
              return <RuleCard
                key={rule.id}
                rule={rule}
                sourceName={source?.name??'Fuente eliminada'}
                sourceMimeType={source?.mimeType??''}
                onToggle={()=>toggleRule(rule.id)}
                onOpen={()=>source&&openSource(source.id,source.name,rule.page)}
                relevance={rule.relevance??inferLegacyRelevance(rule)}
                onMove={value=>setRuleRelevance(rule.id,value)}
                conflict={conflictRuleIds.has(rule.id)}
                linked={isNormativeRuleLinked(project.rules,rule.id)}
                onIncorporate={()=>incorporateRule(rule)}
              />
            })}
          </div>}
    </section>

    {viewerError&&<div className="inline-error normative-error">{viewerError}</div>}

    {pendingDeleteSource&&<AppModal
      title="Eliminar fuente normativa"
      icon={<Trash2 size={22}/>}
      onClose={()=>setPendingDeleteSource(null)}
      footer={<>
        <button className="btn secondary-light" onClick={()=>setPendingDeleteSource(null)}>Cancelar</button>
        <button className="btn primary" onClick={()=>removeSource(pendingDeleteSource)}>Eliminar fuente</button>
      </>}
    >
      <p>Se eliminará el documento, sus reglas candidatas y cualquier regla de horario incorporada que dependa de esta fuente.</p>
      <p style={{marginTop:8}}>Esta acción también invalidará las propuestas generadas existentes, porque cambia la configuración del proyecto.</p>
    </AppModal>}

    {viewer&&<AppModal
      title={viewer.name}
      icon={<FileText size={22}/>}
      onClose={closeViewer}
      wide
      footer={<button className="btn secondary-light" onClick={closeViewer}>Cerrar</button>}
    >
      <div className="normative-document-viewer">
        <iframe src={viewer.url} title={viewer.name}/>
      </div>
    </AppModal>}

    <section className="notice amber normative-notice">
      <ShieldCheck size={18}/>
      <span><strong>Importante:</strong> la extracción es asistida y puede interpretar mal tablas, columnas o PDFs escaneados. La aprobación humana es obligatoria antes de reutilizar una regla.</span>
    </section>
  </div>
}

function RuleCard({
  rule,sourceName,sourceMimeType,onToggle,onOpen,relevance,onMove,conflict,linked,onIncorporate,
}:{
  rule:NormativeRule
  sourceName:string
  sourceMimeType:string
  onToggle:()=>void
  onOpen:()=>void
  relevance:NormativeRelevance
  onMove:(value:NormativeRelevance)=>void
  conflict:boolean
  linked:boolean
  onIncorporate:()=>void
}) {
  return <article className={'normative-rule '+(rule.approved?'approved':'')}>
    <button className={'normative-approve '+(rule.approved?'approved':'')} onClick={onToggle}>
      {rule.approved?<CheckCircle2 size={18}/>:<span/>}
    </button>
    <div className="normative-rule-body">
      <div className="normative-rule-meta">
        <span>{SECTION_LABELS[rule.section]}</span>
        {rule.reference&&<span className="normative-reference">{rule.reference}</span>}
        {conflict&&<span className="normative-conflict-badge"><AlertTriangle size={12}/> Posible contradicción</span>}
        {rule.stage&&<span>{rule.stage}</span>}
        {rule.level&&<span>{rule.level}</span>}
        {rule.subject&&<span>{rule.subject}</span>}
        <span>Pág. {rule.page}</span>
      </div>
      <strong>{rule.label}</strong>
      <blockquote>{rule.excerpt}</blockquote>
      <div className="normative-rule-footer">
        <span>{sourceName}</span>
        <span>{rule.value!==null?`${rule.value} ${unitLabel(rule.unit)}`:'Regla textual'}</span>
        <span>Confianza {Math.round(rule.confidence*100)}%</span>
        {sourceMimeType==='application/pdf'&&<button className="normative-open-page" onClick={onOpen}><Eye size={14}/> Ver pág. {rule.page} en PDF</button>}
        <button className="normative-move-rule" onClick={()=>onMove(relevance==='timetable'?'reference':'timetable')}>
          {relevance==='timetable'?'Mover a referencia':'Usar para horario'}
        </button>
        {linked
          ? <span className="normative-linked-badge"><CheckCircle2 size={13}/> Incorporada a Reglas</span>
          : rule.approved
            ? <span className="normative-incorporate-wrap">
                <button
                  className="normative-incorporate-rule"
                  onClick={onIncorporate}
                  disabled={relevance!=='timetable'||conflict}
                  title={
                    conflict
                      ? 'Resuelve la posible contradicción antes de incorporar esta regla.'
                      : relevance!=='timetable'
                        ? 'Mueve primero esta regla a Aplicable al horario.'
                        : 'Incorporar esta regla normativa al módulo Reglas.'
                  }
                >
                  <ShieldCheck size={14}/> Incorporar a Reglas
                </button>
                {conflict&&<small>Requiere resolver la contradicción.</small>}
                {!conflict&&relevance!=='timetable'&&<small>Muévela antes a Aplicable al horario.</small>}
              </span>
            : null}
      </div>
    </div>
  </article>
}

function unitLabel(unit:NormativeRule['unit']){
  if(unit==='hours') return 'h'
  if(unit==='minutes') return 'min'
  if(unit==='periods') return 'periodos'
  return ''
}

function formatBytes(bytes:number){
  if(bytes<1024) return bytes+' B'
  if(bytes<1024*1024) return (bytes/1024).toFixed(1)+' KB'
  return (bytes/(1024*1024)).toFixed(1)+' MB'
}


function inferLegacyRelevance(rule:NormativeRule):NormativeRelevance{
  if(rule.section==='schedule'||rule.section==='assignments'||rule.section==='staff'||rule.section==='structure') return 'timetable'
  if(rule.section==='study_plan'&&['weekly_hours','weekly_minutes','weekly_periods','session_minutes','subject_rule'].includes(rule.kind)) return 'timetable'
  if(rule.section==='rules'&&/horario|sesión|periodo|jornada|docente|grupo|asignación|disponibilidad|simult|solap|recreo/i.test(rule.excerpt)) return 'timetable'
  return 'reference'
}
