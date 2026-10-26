import type {
  EducationStage,
  NormativeRule,
  NormativeRuleKind,
  NormativeSection,
  NormativeSource,
} from './project'

const uid=(prefix:string)=>prefix+'_'+crypto.randomUUID()

const SUBJECT_PATTERNS:[RegExp,string][]=[
  [/religión|atención educativa/i,'Religión / Atención Educativa'],
  [/lengua castellana/i,'Lengua Castellana y Literatura'],
  [/matemáticas?/i,'Matemáticas'],
  [/conocimiento del medio/i,'Conocimiento del Medio Natural, Social y Cultural'],
  [/educación física/i,'Educación Física'],
  [/educación artística/i,'Educación Artística'],
  [/valores cívicos|educación en valores/i,'Educación en Valores Cívicos y Éticos'],
  [/lengua extranjera|inglés/i,'Inglés / Lengua Extranjera'],
  [/segunda lengua extranjera/i,'Segunda Lengua Extranjera'],
  [/crecimiento en armonía/i,'Crecimiento en armonía'],
  [/descubrimiento y exploración del entorno/i,'Descubrimiento y exploración del entorno'],
  [/comunicación y representación de la realidad/i,'Comunicación y representación de la realidad'],
]

function cleanText(value:string){
  return value.replace(/\u00ad/g,'').replace(/\s+/g,' ').trim()
}

function inferStage(text:string):EducationStage|null{
  if(/educaci[oó]n infantil|\binfantil\b/i.test(text)) return 'Infantil'
  if(/educaci[oó]n primaria|\bprimaria\b/i.test(text)) return 'Primaria'
  if(/educaci[oó]n secundaria obligatoria|\bESO\b/i.test(text)) return 'ESO'
  if(/bachillerato/i.test(text)) return 'Bachillerato'
  return null
}

function inferLevel(text:string){
  const cycle=text.match(/\b(primer|segundo|tercer) ciclo\b/i)
  if(cycle) return cycle[0]
  const course=text.match(/\b([1-6])[.ººª]?\s*(?:de\s*)?(primaria|eso|bachillerato)\b/i)
  if(course) return course[0]
  const infant=text.match(/\b[345]\s*años\b/i)
  if(infant) return infant[0]
  return null
}

function inferSubject(text:string){
  for(const [pattern,label] of SUBJECT_PATTERNS){
    if(pattern.test(text)) return label
  }
  return null
}

function inferSection(text:string):NormativeSection{
  if(/horario lectivo del profesorado|plantilla funcional|reducci[oó]n|media jornada|profesorado/i.test(text)) return 'staff'
  if(/materia|área|curr[ií]cul|religión|atención educativa|lengua extranjera|matemáticas|educación física|educación artística/i.test(text)) return 'study_plan'
  if(/jornada|recreo|sesi[oó]n|tramo|periodo lectivo|per[ií]odo lectivo/i.test(text)) return 'schedule'
  if(/grupo|agrupamiento|ratio|unidad escolar/i.test(text)) return 'structure'
  if(/centro docente|tipo de centro|código de centro/i.test(text)) return 'center'
  if(/asignaci[oó]n|especialidad|impartici[oó]n/i.test(text)) return 'assignments'
  if(/restricci[oó]n|incompatibilidad|obligatori|garantizar|deber[aá]n|deberá/i.test(text)) return 'rules'
  return 'general'
}

function detectNumericRule(text:string,section:NormativeSection){
  const decimal='([0-9]+(?:[.,][0-9]+)?)'
  const patterns:{regex:RegExp;kind:NormativeRuleKind;unit:'hours'|'minutes'|'periods'}[]=[
    {regex:new RegExp(decimal+'\\s*horas?\\s+semanales?','i'),kind:'weekly_hours',unit:'hours'},
    {regex:new RegExp(decimal+'\\s*minutos?\\s+semanales?','i'),kind:'weekly_minutes',unit:'minutes'},
    {regex:new RegExp(decimal+'\\s*periodos?\\s+(?:lectivos?|semanales?)','i'),kind:section==='staff'?'teacher_periods':'weekly_periods',unit:'periods'},
    {regex:new RegExp(decimal+'\\s*per[ií]odos?\\s+(?:lectivos?|semanales?)','i'),kind:section==='staff'?'teacher_periods':'weekly_periods',unit:'periods'},
    {regex:new RegExp(decimal+'\\s*minutos?','i'),kind:'session_minutes',unit:'minutes'},
  ]
  for(const pattern of patterns){
    const match=text.match(pattern.regex)
    if(match){
      return {
        value:Number(match[1].replace(',','.')),
        kind:pattern.kind,
        unit:pattern.unit,
      }
    }
  }
  if(/media hora/i.test(text)) return {value:30,kind:'session_minutes' as NormativeRuleKind,unit:'minutes' as const}
  return null
}

function detectReference(text:string){
  const patterns=[
    /\bArt[ií]culo\s+\d+(?:[.ºª]\d+)?(?:\s*[a-z])?/i,
    /\bArt\.\s*\d+(?:[.ºª]\d+)?(?:\s*[a-z])?/i,
    /\bApartado\s+\d+(?:\.\d+)*/i,
    /\bDisposici[oó]n\s+(?:adicional|transitoria|final)\s+[\wÁÉÍÓÚáéíóúñÑ.-]+/i,
  ]
  for(const pattern of patterns){
    const match=text.match(pattern)
    if(match)return cleanText(match[0])
  }
  return null
}

function sentenceCandidates(text:string){
  const normalized=text
    .replace(/\s*\n\s*/g,' ')
    .replace(/([.;:])\s+/g,'$1\n')
  const segments=normalized.split(/\n+/).map(cleanText).filter(Boolean)
  const out:{text:string;reference:string|null}[]=[]
  let currentReference:string|null=null

  for(const segment of segments){
    const directReference=detectReference(segment)
    if(directReference)currentReference=directReference
    if(segment.length>=24&&segment.length<=650){
      out.push({text:segment,reference:directReference??currentReference})
    }
  }
  return out
}

function inferRelevance(section:NormativeSection, kind:NormativeRuleKind, text:string){
  if(section==='schedule'||section==='assignments'||section==='staff'||section==='structure') return 'timetable' as const
  if(section==='study_plan'&&(kind==='weekly_hours'||kind==='weekly_minutes'||kind==='weekly_periods'||kind==='session_minutes'||kind==='subject_rule')) return 'timetable' as const
  if(section==='rules'&&/horario|sesión|periodo|jornada|docente|grupo|asignación|disponibilidad|simult|solap|recreo/i.test(text)) return 'timetable' as const
  return 'reference' as const
}

function buildRulesForPage(pageText:string,page:number,sourceId:string):NormativeRule[]{
  const rules:NormativeRule[]=[]
  const pageStage=inferStage(pageText)
  for(const candidate of sentenceCandidates(pageText)){
    const excerpt=candidate.text
    const section=inferSection(excerpt)
    const numeric=detectNumericRule(excerpt,section)
    const subject=inferSubject(excerpt)
    const strongNormative=/deber[aá]n|deberá|se dedicar[aá]n|se concretar[aá]|ser[aá] de|queda establecido|mínimo|m[aá]ximo/i.test(excerpt)
    const relevant=numeric || subject || strongNormative
    if(!relevant) continue
    const kind=numeric?.kind ?? (subject?'subject_rule':'other')
    const confidence=Math.min(0.98,
      0.48 +
      (numeric?0.2:0) +
      (strongNormative?0.16:0) +
      (subject?0.08:0) +
      ((inferStage(excerpt)||pageStage)?0.05:0)
    )
    rules.push({
      id:uid('rule'),
      sourceId,
      section,
      kind,
      label:subject ?? excerpt.slice(0,90)+(excerpt.length>90?'…':''),
      value:numeric?.value ?? null,
      unit:numeric?.unit ?? null,
      stage:inferStage(excerpt) ?? pageStage,
      level:inferLevel(excerpt),
      subject,
      page,
      excerpt,
      confidence,
      approved:false,
      relevance:inferRelevance(section,kind,excerpt),
      reference:candidate.reference,
    })
  }
  const seen=new Set<string>()
  return rules.filter(rule=>{
    const key=[rule.kind,rule.value,rule.stage,rule.level,rule.subject,rule.excerpt].join('|').toLowerCase()
    if(seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function sha256(file:File){
  const buffer=await file.arrayBuffer()
  const hash=await crypto.subtle.digest('SHA-256',buffer)
  return Array.from(new Uint8Array(hash)).map(value=>value.toString(16).padStart(2,'0')).join('')
}

async function extractPdf(file:File){
  const [{ GlobalWorkerOptions, getDocument }, workerModule] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs?url'),
  ])
  GlobalWorkerOptions.workerSrc = workerModule.default

  const data=new Uint8Array(await file.arrayBuffer())
  const pdf=await getDocument({data}).promise
  const pages:{page:number;text:string}[]=[]
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
    const page=await pdf.getPage(pageNumber)
    const content=await page.getTextContent()
    const text=cleanText(content.items.map(item=>('str' in item ? item.str : '')).join(' '))
    pages.push({page:pageNumber,text})
  }
  return pages
}

async function extractPlainText(file:File){
  return [{page:1,text:cleanText(await file.text())}]
}

export async function analyzeNormativeFile(file:File){
  const lower=file.name.toLowerCase()
  const isPdf=file.type==='application/pdf'||lower.endsWith('.pdf')
  const isText=file.type.startsWith('text/')||lower.endsWith('.txt')||lower.endsWith('.md')
  if(!isPdf&&!isText){
    throw new Error('Formato no compatible todavía. Usa PDF, TXT o Markdown.')
  }

  const sourceId=uid('norm')
  const pages=isPdf ? await extractPdf(file) : await extractPlainText(file)
  const fullText=pages.map(item=>item.text).join('\n')
  if(fullText.trim().length<40){
    throw new Error('No se ha podido extraer texto suficiente del documento. Puede ser un PDF escaneado y requerir OCR.')
  }

  const rules=pages.flatMap(item=>buildRulesForPage(item.text,item.page,sourceId))
  const stages=Array.from(new Set(pages.map(item=>inferStage(item.text)).filter(Boolean))) as EducationStage[]
  const source:NormativeSource={
    id:sourceId,
    name:file.name,
    mimeType:file.type||'application/octet-stream',
    size:file.size,
    pageCount:pages.length,
    extractedChars:fullText.length,
    sha256:await sha256(file),
    addedAt:new Date().toISOString(),
    stages,
    ruleCount:rules.length,
  }
  return {source,rules}
}


export interface NormativeConflict {
  key:string
  ruleIds:string[]
  description:string
}

export function findNormativeConflicts(rules:NormativeRule[]):NormativeConflict[]{
  const groups=new Map<string,NormativeRule[]>()

  for(const rule of rules){
    if(rule.value===null||!rule.unit)continue
    const key=[
      rule.kind,
      rule.stage??'',
      rule.level??'',
      rule.subject??'',
      rule.unit,
    ].join('|').toLowerCase()
    const list=groups.get(key)??[]
    list.push(rule)
    groups.set(key,list)
  }

  const conflicts:NormativeConflict[]=[]
  for(const [key,items] of groups){
    if(items.length<2)continue
    const distinctValues=[...new Set(items.map(item=>item.value))]
    if(distinctValues.length<2)continue

    const sample=items[0]
    const scope=[
      sample.subject,
      sample.level,
      sample.stage,
    ].filter(Boolean).join(' · ')||'mismo ámbito'
    const values=items
      .map(item=>item.value+' '+item.unit)
      .filter((value,index,array)=>array.indexOf(value)===index)
      .join(' / ')

    conflicts.push({
      key,
      ruleIds:items.map(item=>item.id),
      description:'Valores incompatibles para '+scope+': '+values+'.',
    })
  }
  return conflicts
}
