import type {
  EducationStage,
  StudyPlanEntry,
  StudyPlanMode,
  Subject,
  SubjectType,
  TeacherRequirement,
  ViyeuticaProject,
} from './project'

type SubjectSeed = {
  code:string
  name:string
  stage:EducationStage
  type:SubjectType
  teacherRequirement:TeacherRequirement
  defaultSessionMinutes:number|null
}

type LoadSeed = {
  code:string
  weeklyMinutes:number
  mode?:StudyPlanMode
  mandatory?:boolean
  fixedSessionMinutes?:number|null
  note?:string
}

export interface TemplateApplyResult {
  project:ViyeuticaProject
  addedSubjects:number
  addedEntries:number
  skippedEntries:number
}

const uid=(prefix:string)=>prefix+'_'+crypto.randomUUID()

const INFANT_SUBJECTS:SubjectSeed[]=[
  {code:'INF-CEA',name:'Crecimiento en armonía',stage:'Infantil',type:'common',teacherRequirement:'tutor',defaultSessionMinutes:null},
  {code:'INF-DEE',name:'Descubrimiento y exploración del entorno',stage:'Infantil',type:'common',teacherRequirement:'tutor',defaultSessionMinutes:null},
  {code:'INF-CRR',name:'Comunicación y representación de la realidad',stage:'Infantil',type:'common',teacherRequirement:'tutor',defaultSessionMinutes:null},
  {code:'INF-ING',name:'Inglés',stage:'Infantil',type:'specific',teacherRequirement:'specialist',defaultSessionMinutes:30},
  {code:'INF-REL-AE',name:'Religión / Atención Educativa',stage:'Infantil',type:'specific',teacherRequirement:'specialist',defaultSessionMinutes:30},
]

const INFANT_LOADS:LoadSeed[]=[
  {
    code:'INF-CEA',weeklyMinutes:410,
    note:'Reparto interno orientativo de Viyeutica. En Infantil las tres áreas se trabajan de forma globalizada y la normativa no fija minutos por área.',
  },
  {
    code:'INF-DEE',weeklyMinutes:410,
    note:'Reparto interno orientativo de Viyeutica. En Infantil las tres áreas se trabajan de forma globalizada y la normativa no fija minutos por área.',
  },
  {
    code:'INF-CRR',weeklyMinutes:410,
    note:'Reparto interno orientativo de Viyeutica. En Infantil las tres áreas se trabajan de forma globalizada y la normativa no fija minutos por área.',
  },
  {
    code:'INF-ING',weeklyMinutes:60,fixedSessionMinutes:30,
    note:'Mínimo normativo: dos periodos semanales de 30 minutos en el segundo ciclo de Infantil.',
  },
  {
    code:'INF-REL-AE',weeklyMinutes:60,fixedSessionMinutes:30,mode:'alternative',
    note:'Religión o Atención Educativa en franja simultánea: dos periodos semanales de 30 minutos.',
  },
]

const PRIMARY_SUBJECTS:SubjectSeed[]=[
  {code:'PRI-CMED',name:'Conocimiento del Medio Natural, Social y Cultural',stage:'Primaria',type:'common',teacherRequirement:'tutor',defaultSessionMinutes:null},
  {code:'PRI-EART',name:'Educación Artística',stage:'Primaria',type:'common',teacherRequirement:'any',defaultSessionMinutes:null},
  {code:'PRI-EF',name:'Educación Física',stage:'Primaria',type:'specific',teacherRequirement:'specialist',defaultSessionMinutes:null},
  {code:'PRI-LCL',name:'Lengua Castellana y Literatura',stage:'Primaria',type:'common',teacherRequirement:'tutor',defaultSessionMinutes:null},
  {code:'PRI-ING',name:'Inglés',stage:'Primaria',type:'specific',teacherRequirement:'specialist',defaultSessionMinutes:null},
  {code:'PRI-MAT',name:'Matemáticas',stage:'Primaria',type:'common',teacherRequirement:'tutor',defaultSessionMinutes:null},
  {code:'PRI-REL-AE',name:'Religión / Atención Educativa',stage:'Primaria',type:'specific',teacherRequirement:'specialist',defaultSessionMinutes:null},
  {code:'PRI-ACT',name:'Área de carácter transversal (ACT)',stage:'Primaria',type:'specific',teacherRequirement:'any',defaultSessionMinutes:null},
  {code:'PRI-EVCE',name:'Educación en Valores Cívicos y Éticos',stage:'Primaria',type:'common',teacherRequirement:'any',defaultSessionMinutes:null},
]

const PRIMARY_MINUTES:Record<string,LoadSeed[]>={
  '1.º Primaria':[
    {code:'PRI-CMED',weeklyMinutes:210},{code:'PRI-EART',weeklyMinutes:150},{code:'PRI-EF',weeklyMinutes:180},
    {code:'PRI-LCL',weeklyMinutes:270},{code:'PRI-ING',weeklyMinutes:180},{code:'PRI-MAT',weeklyMinutes:240},
    {code:'PRI-REL-AE',weeklyMinutes:90,mode:'alternative'},{code:'PRI-ACT',weeklyMinutes:30},
  ],
  '2.º Primaria':[
    {code:'PRI-CMED',weeklyMinutes:210},{code:'PRI-EART',weeklyMinutes:150},{code:'PRI-EF',weeklyMinutes:180},
    {code:'PRI-LCL',weeklyMinutes:270},{code:'PRI-ING',weeklyMinutes:180},{code:'PRI-MAT',weeklyMinutes:240},
    {code:'PRI-REL-AE',weeklyMinutes:90,mode:'alternative'},{code:'PRI-ACT',weeklyMinutes:30},
  ],
  '3.º Primaria':[
    {code:'PRI-CMED',weeklyMinutes:240},{code:'PRI-EART',weeklyMinutes:150},{code:'PRI-EF',weeklyMinutes:150},
    {code:'PRI-LCL',weeklyMinutes:270},{code:'PRI-ING',weeklyMinutes:180},{code:'PRI-MAT',weeklyMinutes:240},
    {code:'PRI-REL-AE',weeklyMinutes:60,mode:'alternative'},{code:'PRI-ACT',weeklyMinutes:60},
  ],
  '4.º Primaria':[
    {code:'PRI-CMED',weeklyMinutes:240},{code:'PRI-EART',weeklyMinutes:150},{code:'PRI-EF',weeklyMinutes:150},
    {code:'PRI-LCL',weeklyMinutes:270},{code:'PRI-ING',weeklyMinutes:180},{code:'PRI-MAT',weeklyMinutes:240},
    {code:'PRI-REL-AE',weeklyMinutes:60,mode:'alternative'},{code:'PRI-ACT',weeklyMinutes:60},
  ],
  '5.º Primaria':[
    {code:'PRI-CMED',weeklyMinutes:270,note:'Distribución orientativa por curso: el Decreto fija 7,5 h para el conjunto del tercer ciclo.'},
    {code:'PRI-EART',weeklyMinutes:120},{code:'PRI-EF',weeklyMinutes:150},{code:'PRI-LCL',weeklyMinutes:270},
    {code:'PRI-ING',weeklyMinutes:180},{code:'PRI-MAT',weeklyMinutes:240},
    {code:'PRI-REL-AE',weeklyMinutes:60,mode:'alternative'},{code:'PRI-ACT',weeklyMinutes:60},
  ],
  '6.º Primaria':[
    {code:'PRI-CMED',weeklyMinutes:180,note:'Distribución orientativa por curso: se compensa la incorporación de EVCE en 6.º manteniendo el total del tercer ciclo.'},
    {code:'PRI-EART',weeklyMinutes:120},{code:'PRI-EF',weeklyMinutes:150},{code:'PRI-EVCE',weeklyMinutes:90},
    {code:'PRI-LCL',weeklyMinutes:270},{code:'PRI-ING',weeklyMinutes:180},{code:'PRI-MAT',weeklyMinutes:240},
    {code:'PRI-REL-AE',weeklyMinutes:60,mode:'alternative'},{code:'PRI-ACT',weeklyMinutes:60},
  ],
}

function ensureSubjects(project:ViyeuticaProject,seeds:SubjectSeed[]) {
  const next=[...project.subjects]
  let added=0
  for(const seed of seeds){
    const existing=next.find(subject=>subject.stage===seed.stage && (subject.code===seed.code || subject.name.toLowerCase()===seed.name.toLowerCase()))
    if(existing) continue
    next.push({
      id:uid('sub'),
      name:seed.name,
      code:seed.code,
      stage:seed.stage,
      type:seed.type,
      defaultSessionMinutes:seed.defaultSessionMinutes,
      active:true,
    })
    added++
  }
  return {subjects:next,added}
}

function subjectByCode(subjects:Subject[],stage:EducationStage,code:string) {
  return subjects.find(subject=>subject.stage===stage && subject.code===code)
}


function normalizeLabel(value:string){
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
}

function normativeLoadOverride(
  project:ViyeuticaProject,
  stage:EducationStage,
  level:string,
  subjectName:string,
){
  const subjectKey=normalizeLabel(subjectName)
  const candidates=project.normativeRules.filter(rule=>{
    if(!rule.approved||rule.section!=='study_plan') return false
    if(rule.stage&&rule.stage!==stage) return false
    if(rule.level&&normalizeLabel(level)!==normalizeLabel(rule.level)) return false
    if(!rule.subject) return false
    const ruleKey=normalizeLabel(rule.subject)
    return ruleKey.includes(subjectKey)||subjectKey.includes(ruleKey)||(
      subjectKey.includes('ingles')&&ruleKey.includes('lengua extranjera')
    )
  })
  const weekly=candidates.find(rule=>rule.kind==='weekly_minutes'&&rule.value!==null)
    ?? candidates.find(rule=>rule.kind==='weekly_hours'&&rule.value!==null)
  const session=candidates.find(rule=>rule.kind==='session_minutes'&&rule.value!==null)
  if(!weekly&&!session) return null
  const source=project.normativeSources.find(item=>item.id===(weekly??session)?.sourceId)
  return {
    weeklyMinutes:weekly
      ? weekly.kind==='weekly_hours'
        ? Math.round((weekly.value??0)*60)
        : Math.round(weekly.value??0)
      : null,
    fixedSessionMinutes:session?Math.round(session.value??0):null,
    note:`Fuente normativa aprobada: ${source?.name??'documento cargado'}, pág. ${(weekly??session)?.page}.`,
  }
}

function addLoads(
  project:ViyeuticaProject,
  subjects:Subject[],
  stage:EducationStage,
  loadsForGroup:(level:string)=>LoadSeed[],
  sourceNote:string,
) {
  const next=[...project.studyPlan]
  let added=0
  let skipped=0
  for(const group of project.groups.filter(item=>item.active&&item.stage===stage)){
    for(const seed of loadsForGroup(group.level)){
      const subject=subjectByCode(subjects,stage,seed.code)
      if(!subject) continue
      const duplicate=next.some(entry=>entry.active&&entry.groupId===group.id&&entry.subjectId===subject.id)
      if(duplicate){ skipped++; continue }
      const requirement = stage==='Infantil'
        ? INFANT_SUBJECTS.find(item=>item.code===seed.code)?.teacherRequirement ?? 'any'
        : PRIMARY_SUBJECTS.find(item=>item.code===seed.code)?.teacherRequirement ?? 'any'
      const normative=normativeLoadOverride(project,stage,group.level,subject.name)
      next.push({
        id:uid('plan'),
        groupId:group.id,
        subjectId:subject.id,
        weeklySessions:0,
        weeklyMinutes:normative?.weeklyMinutes ?? seed.weeklyMinutes,
        mandatory:seed.mandatory ?? true,
        mode:seed.mode ?? 'ordinary',
        teacherRequirement:requirement,
        teacherId:null,
        fixedSessionMinutes:normative?.fixedSessionMinutes ?? seed.fixedSessionMinutes ?? null,
        notes:[sourceNote,seed.note,normative?.note].filter(Boolean).join(' · '),
        active:true,
      })
      added++
    }
  }
  return {studyPlan:next,added,skipped}
}

export function applyInfantExtremaduraTemplate(project:ViyeuticaProject):TemplateApplyResult {
  const ensured=ensureSubjects(project,INFANT_SUBJECTS)
  const loaded=addLoads(
    project,
    ensured.subjects,
    'Infantil',
    ()=>INFANT_LOADS,
    'Plantilla Infantil · Extremadura 2026/2027 · Decreto 98/2022 mod. Decreto 240/2023.',
  )
  return {
    project:{...project,subjects:ensured.subjects,studyPlan:loaded.studyPlan},
    addedSubjects:ensured.added,
    addedEntries:loaded.added,
    skippedEntries:loaded.skipped,
  }
}

export function applyPrimaryExtremaduraTemplate(project:ViyeuticaProject):TemplateApplyResult {
  const ensured=ensureSubjects(project,PRIMARY_SUBJECTS)
  const loaded=addLoads(
    project,
    ensured.subjects,
    'Primaria',
    level=>PRIMARY_MINUTES[level] ?? [],
    'Plantilla Primaria · Extremadura 2026/2027 · Decreto 107/2022 mod. Decreto 241/2023. ACT elegida como opción inicial del tiempo de Segunda Lengua Extranjera/área transversal.',
  )
  return {
    project:{...project,subjects:ensured.subjects,studyPlan:loaded.studyPlan},
    addedSubjects:ensured.added,
    addedEntries:loaded.added,
    skippedEntries:loaded.skipped,
  }
}
