import type { CenterRule, NormativeRule, NormativeSource } from './project'

function uid(){return 'rule_'+crypto.randomUUID()}

export function normativeRuleScope(rule:NormativeRule){
  if(rule.section==='staff') return 'teacher'
  if(rule.section==='study_plan') return 'subject'
  if(rule.section==='schedule') return 'schedule'
  if(rule.section==='assignments') return 'assignment'
  if(rule.section==='structure') return 'group'
  return 'center'
}

function conditionFromNormative(rule:NormativeRule){
  if(rule.kind==='weekly_hours'||rule.kind==='weekly_minutes'||rule.kind==='weekly_periods'||rule.kind==='teacher_periods'){
    return {conditionKind:'weekly_load',comparison:'equals'}
  }
  if(rule.kind==='session_minutes'){
    return {conditionKind:'generic',comparison:'equals'}
  }
  return {conditionKind:'generic',comparison:'equals'}
}

export function convertNormativeToCenterRule(
  rule:NormativeRule,
  source?:NormativeSource,
):CenterRule{
  const condition=conditionFromNormative(rule)
  const code=('NORM_'+rule.section+'_'+rule.kind+'_'+rule.id.slice(-6)).toUpperCase()
  return {
    id:uid(),
    scope:normativeRuleScope(rule),
    ruleType:'HARD',
    code,
    description:rule.excerpt||rule.label,
    parameters:{
      conditionKind:condition.conditionKind,
      comparison:condition.comparison,
      normativeKind:rule.kind,
      value:rule.value,
      unit:rule.unit,
      stage:rule.stage,
      level:rule.level,
      subject:rule.subject,
      page:rule.page,
      reference:rule.reference??null,
      sourceName:source?.name??null,
    },
    weight:null,
    source:'normative',
    normativeRuleId:rule.id,
    active:true,
    reviewRequired:true,
  }
}

export function isNormativeRuleLinked(rules:CenterRule[],normativeRuleId:string){
  return rules.some(rule=>rule.normativeRuleId===normativeRuleId)
}
