import { LayoutTemplate, WandSparkles } from 'lucide-react'

export interface TemplateAction {
  id:string
  label:string
  description:string
  onApply:()=>void
  disabled?:boolean
}

export function TemplatePanel({
  title='Plantilla rápida',
  description='Carga una base editable para acelerar la configuración.',
  actions,
  showActionIcons=false,
}:{
  title?:string
  description?:string
  actions:TemplateAction[]
  showActionIcons?:boolean
}) {
  return (
    <article className="aside-card template-panel">
      <WandSparkles size={21}/>
      <span className="panel-kicker">Plantillas</span>
      <strong>{title}</strong>
      <p>{description}</p>
      <div className="template-actions">
        {actions.map(action=>(
          <button
            key={action.id}
            type="button"
            className="template-action"
            onClick={action.onApply}
            disabled={action.disabled}
          >
            {showActionIcons&&<LayoutTemplate className="template-action-icon" size={22}/>}
            <span>{action.label}</span>
            <small>{action.description}</small>
          </button>
        ))}
      </div>
    </article>
  )
}
