import { EMPTY_PROJECT, type ViyeuticaProject } from './project'

export function emptyTemplateProject():ViyeuticaProject{
  return structuredClone(EMPTY_PROJECT)
}

export function downloadTextFile(content:string,name:string,type:string){
  const blob=new Blob([content],{type})
  const url=URL.createObjectURL(blob)
  const anchor=document.createElement('a')
  anchor.href=url
  anchor.download=name
  anchor.click()
  window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export function buildEmptyJsonTemplate(){
  return JSON.stringify({
    format:'viyeutica-school-project',
    formatVersion:1,
    template:true,
    instructions:'Completa los datos del proyecto respetando la estructura y vuelve a importarlo en ⩒Yeutika.',
    project:emptyTemplateProject(),
  },null,2)
}

const sheets:{name:string;headers:string[]}[]=[
  {name:'INSTRUCCIONES',headers:['SECCIÓN','INDICACIONES']},
  {name:'CENTRO',headers:['name','officialCode','ownership','centerType','autonomousCommunity','province','locality','stages']},
  {name:'CURSO',headers:['id','label','startYear','endYear']},
  {name:'GRUPOS',headers:['id','name','stage','level','line','students','classroom','combined','linkedGroupIds','tutorTeacherId','notes','active']},
  {name:'JORNADA',headers:['activeDays','mode','blockId','label','start','end','type','stageScope','active']},
  {name:'MATERIAS',headers:['id','name','code','stage','type','defaultSessionMinutes','active']},
  {name:'PLAN_ESTUDIOS',headers:['id','groupId','subjectId','weeklySessions','weeklyMinutes','mandatory','mode','teacherRequirement','teacherId','fixedSessionMinutes','notes','active']},
  {name:'PROFESORADO',headers:['id','name','status','employmentType','specialties','roles','weeklyTeachingMinutes','active']},
  {name:'DISPONIBILIDAD',headers:['teacherId','day','session','status','detail']},
  {name:'ASIGNACIONES',headers:['id','groupId','subjectId','teacherId','assignmentType','weeklySessions','weeklyMinutes','fixedSlots','active','source']},
  {name:'REGLAS',headers:['id','scope','ruleType','code','description','parameters','weight','source','normativeRuleId','active','reviewRequired']},
]

export function buildEmptyXlsTemplate(){
  const instructionRows=[
    ['CENTRO','Una única fila. stages separadas por |. Ejemplo: Infantil|Primaria.'],
    ['CURSO','Una única fila. Ejemplo: 2026-2027 / 2026/2027 / 2026 / 2027.'],
    ['GRUPOS','Una fila por grupo. linkedGroupIds separados por |. active: TRUE/FALSE.'],
    ['JORNADA','Una fila por tramo horario. activeDays separados por | en cada fila. Ejemplo: L|M|X|J|V.'],
    ['MATERIAS','Una fila por materia.'],
    ['PLAN_ESTUDIOS','Una fila por materia y grupo.'],
    ['PROFESORADO','specialties y roles separados por |.'],
    ['DISPONIBILIDAD','status: available, unavailable, travel o assigned.'],
    ['ASIGNACIONES','fixedSlots con formato L:tb_1|M:tb_2.'],
    ['REGLAS','parameters debe contener JSON válido, por ejemplo {"conditionKind":"avoid_slot"}.'],
  ]
  return '<?xml version="1.0" encoding="UTF-8"?>'
    +'<?mso-application progid="Excel.Sheet"?>'
    +'<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
    +'<Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/></Style></Styles>'
    +sheets.map(sheet=>{
      const rows=sheet.name==='INSTRUCCIONES'
        ? instructionRows
        : []
      return '<Worksheet ss:Name="'+xml(sheet.name)+'"><Table>'
        +'<Row>'+sheet.headers.map(h=>cell(h,true)).join('')+'</Row>'
        +rows.map(row=>'<Row>'+row.map(v=>cell(v,false)).join('')+'</Row>').join('')
        +'</Table></Worksheet>'
    }).join('')
    +'</Workbook>'
}

function cell(value:string,header:boolean){
  return '<Cell'+(header?' ss:StyleID="Header"':'')+'><Data ss:Type="String">'+xml(value)+'</Data></Cell>'
}

function xml(value:unknown){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
}

function bool(value:string,defaultValue=true){
  if(!value.trim())return defaultValue
  return ['true','1','sí','si','yes'].includes(value.trim().toLowerCase())
}
function num(value:string){
  if(!value.trim())return null
  const n=Number(value.replace(',','.'))
  return Number.isFinite(n)?n:null
}
function list(value:string){return value.split('|').map(v=>v.trim()).filter(Boolean)}

function workbookRows(text:string){
  const doc=new DOMParser().parseFromString(text,'application/xml')
  if(doc.querySelector('parsererror'))throw new Error('La hoja de cálculo no tiene un formato de plantilla ⩒Yeutika reconocido.')
  const result=new Map<string,Record<string,string>[]>()
  for(const sheet of Array.from(doc.getElementsByTagName('Worksheet'))){
    const name=sheet.getAttribute('ss:Name')??sheet.getAttribute('Name')??''
    const rows=Array.from(sheet.getElementsByTagName('Row'))
    if(!rows.length)continue
    const values=rows.map(row=>Array.from(row.getElementsByTagName('Cell')).map(cell=>cell.getElementsByTagName('Data')[0]?.textContent??''))
    const headers=values[0]
    result.set(name,values.slice(1).filter(row=>row.some(Boolean)).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??'']))))
  }
  return result
}

export function projectFromXlsTemplate(text:string):ViyeuticaProject{
  const sheets=workbookRows(text)
  const project=emptyTemplateProject()
  const center=sheets.get('CENTRO')?.[0]
  if(center){
    project.center={
      name:center.name??'',
      officialCode:center.officialCode??'',
      ownership:(center.ownership??'') as any,
      centerType:(center.centerType??'') as any,
      autonomousCommunity:center.autonomousCommunity||'Extremadura',
      province:center.province??'',
      locality:center.locality??'',
      stages:list(center.stages) as any,
    }
  }
  const course=sheets.get('CURSO')?.[0]
  if(course){
    project.academicYear={
      id:course.id||project.academicYear.id,
      label:course.label||project.academicYear.label,
      startYear:Number(course.startYear)||project.academicYear.startYear,
      endYear:Number(course.endYear)||project.academicYear.endYear,
    }
  }
  project.groups=(sheets.get('GRUPOS')??[]).map(r=>({
    id:r.id,name:r.name,stage:r.stage as any,level:r.level,line:r.line,
    students:num(r.students),classroom:r.classroom,combined:bool(r.combined,false),
    linkedGroupIds:list(r.linkedGroupIds),tutorTeacherId:r.tutorTeacherId||null,notes:r.notes,active:bool(r.active),
  }))
  const scheduleRows=sheets.get('JORNADA')??[]
  if(scheduleRows.length){
    project.schedule={
      activeDays:list(scheduleRows[0].activeDays) as any,
      mode:(scheduleRows[0].mode||'morning') as any,
      blocks:scheduleRows.map(r=>({
        id:r.blockId,label:r.label,start:r.start,end:r.end,type:r.type as any,
        stageScope:list(r.stageScope) as any,active:bool(r.active),
      })),
    }
  }
  project.subjects=(sheets.get('MATERIAS')??[]).map(r=>({
    id:r.id,name:r.name,code:r.code,stage:r.stage as any,type:(r.type||'common') as any,
    defaultSessionMinutes:num(r.defaultSessionMinutes),active:bool(r.active),
  }))
  project.studyPlan=(sheets.get('PLAN_ESTUDIOS')??[]).map(r=>({
    id:r.id,groupId:r.groupId,subjectId:r.subjectId,weeklySessions:Number(r.weeklySessions)||0,
    weeklyMinutes:num(r.weeklyMinutes),mandatory:bool(r.mandatory),mode:(r.mode||'ordinary') as any,
    teacherRequirement:(r.teacherRequirement||'any') as any,teacherId:r.teacherId||null,
    fixedSessionMinutes:num(r.fixedSessionMinutes),notes:r.notes,active:bool(r.active),
  }))
  project.teachers=(sheets.get('PROFESORADO')??[]).map(r=>({
    id:r.id,name:r.name,status:(r.status||'confirmed') as any,employmentType:(r.employmentType||'full') as any,
    specialties:list(r.specialties),roles:list(r.roles),weeklyTeachingMinutes:num(r.weeklyTeachingMinutes),active:bool(r.active),
  }))
  project.teacherAvailability=(sheets.get('DISPONIBILIDAD')??[]).map(r=>({
    teacherId:r.teacherId,day:r.day,session:r.session,status:(r.status||'available') as any,detail:r.detail,
  }))
  project.assignments=(sheets.get('ASIGNACIONES')??[]).map(r=>({
    id:r.id,groupId:r.groupId,subjectId:r.subjectId,teacherId:r.teacherId,
    assignmentType:(r.assignmentType||'main') as any,weeklySessions:num(r.weeklySessions),
    weeklyMinutes:num(r.weeklyMinutes),
    fixedSlots:list(r.fixedSlots).map(item=>{const [day,session]=item.split(':');return {day,session}}).filter(item=>item.day&&item.session),
    active:bool(r.active),source:r.source||undefined,
  }))
  project.rules=(sheets.get('REGLAS')??[]).map(r=>{
    let parameters:Record<string,unknown>={}
    if(r.parameters.trim()){
      try{parameters=JSON.parse(r.parameters)}catch{throw new Error('Hay una regla con parameters que no contiene JSON válido.')}
    }
    return {
      id:r.id,scope:r.scope,ruleType:(r.ruleType||'HARD') as any,code:r.code,description:r.description,
      parameters,weight:num(r.weight),source:(r.source||'manual') as any,normativeRuleId:r.normativeRuleId||null,
      active:bool(r.active),reviewRequired:bool(r.reviewRequired,false),
    }
  })
  project.generationRuns=[]
  project.selectedGenerationRunId=null
  return project
}
