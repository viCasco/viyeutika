import type { CenterRule } from './project'

export type RuleLibraryCategory =
  | 'Profesorado'
  | 'Grupo'
  | 'Materia'
  | 'Jornada'
  | 'Distribución'
  | 'Espacios'
  | 'Desplazamientos'

export interface RuleTemplate {
  id:string
  category:RuleLibraryCategory
  label:string
  description:string
  ruleType:CenterRule['ruleType']
  scope:string
  conditionKind:string
  comparison:string
  value?:number
  weight?:number
  code:string
}

export const RULE_LIBRARY:RuleTemplate[]=[
  {
    id:'teacher-max-daily',
    category:'Profesorado',
    label:'Máximo de sesiones diarias',
    description:'Limita el número de sesiones lectivas de un docente en un mismo día.',
    ruleType:'HARD',scope:'teacher',conditionKind:'daily_limit',comparison:'maximum',value:5,code:'MAX_SESIONES_DIARIAS_DOCENTE',
  },
  {
    id:'teacher-min-daily',
    category:'Profesorado',
    label:'Mínimo de sesiones diarias',
    description:'Evita desplazamientos para impartir una única sesión cuando sea una preferencia del centro.',
    ruleType:'SOFT',scope:'teacher',conditionKind:'daily_limit',comparison:'minimum',value:2,weight:3,code:'MIN_SESIONES_DIARIAS_DOCENTE',
  },
  {
    id:'teacher-gaps',
    category:'Distribución',
    label:'Minimizar huecos',
    description:'Penaliza huecos entre la primera y la última sesión diaria del profesorado.',
    ruleType:'SOFT',scope:'teacher',conditionKind:'minimize_gaps',comparison:'minimum',value:0,weight:5,code:'REDUCIR_HUECOS_DOCENTES',
  },
  {
    id:'teacher-days',
    category:'Profesorado',
    label:'Máximo de días de asistencia',
    description:'Reduce los días con presencia lectiva semanal del docente cuando sea posible.',
    ruleType:'SOFT',scope:'teacher',conditionKind:'teaching_days',comparison:'maximum',value:5,weight:3,code:'MAX_DIAS_ASISTENCIA_DOCENTE',
  },
  {
    id:'teacher-compact',
    category:'Distribución',
    label:'Jornada compacta',
    description:'Penaliza jornadas con una permanencia lectiva excesivamente extendida.',
    ruleType:'SOFT',scope:'teacher',conditionKind:'daily_span',comparison:'maximum',value:5,weight:4,code:'JORNADA_COMPACTA_DOCENTE',
  },
  {
    id:'avoid-first',
    category:'Jornada',
    label:'Evitar primera sesión',
    description:'Permite señalar la primera sesión como preferencia a evitar.',
    ruleType:'SOFT',scope:'teacher',conditionKind:'avoid_slot',comparison:'avoid',weight:3,code:'EVITAR_PRIMERA_SESION',
  },
  {
    id:'avoid-last',
    category:'Jornada',
    label:'Evitar última sesión',
    description:'Permite señalar la última sesión como preferencia a evitar.',
    ruleType:'SOFT',scope:'teacher',conditionKind:'avoid_slot',comparison:'avoid',weight:3,code:'EVITAR_ULTIMA_SESION',
  },
  {
    id:'group-max-daily',
    category:'Grupo',
    label:'Máximo diario de una materia',
    description:'Limita la repetición diaria de una materia en un grupo.',
    ruleType:'HARD',scope:'subject',conditionKind:'daily_limit',comparison:'maximum',value:2,code:'MAX_MATERIA_DIA',
  },
  {
    id:'subject-spread',
    category:'Materia',
    label:'Distribución semanal de materia',
    description:'Permite controlar la carga semanal de una materia mediante un valor mínimo, máximo o exacto.',
    ruleType:'HARD',scope:'subject',conditionKind:'weekly_load',comparison:'equals',value:1,code:'CARGA_SEMANAL_MATERIA',
  },
  {
    id:'fixed-session',
    category:'Jornada',
    label:'Franja fija',
    description:'Fija una asignación o selección en un día y sesión concretos.',
    ruleType:'HARD',scope:'assignment',conditionKind:'fixed_slot',comparison:'equals',code:'FRANJA_FIJA',
  },
  {
    id:'space-required',
    category:'Espacios',
    label:'Espacio obligatorio',
    description:'Reserva un espacio concreto para una asignación. Se completa desde Espacios y asignaciones.',
    ruleType:'HARD',scope:'resource',conditionKind:'generic',comparison:'equals',code:'ESPACIO_OBLIGATORIO',
  },
  {
    id:'travel',
    category:'Desplazamientos',
    label:'Respetar desplazamientos',
    description:'Evita cambios de edificio incompatibles con el tiempo de desplazamiento configurado.',
    ruleType:'HARD',scope:'teacher',conditionKind:'generic',comparison:'equals',code:'RESPETAR_DESPLAZAMIENTOS',
  },
]
