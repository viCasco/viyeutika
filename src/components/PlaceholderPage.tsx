import { Construction } from 'lucide-react'

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="placeholder-page">
      <div className="placeholder-icon"><Construction size={28} /></div>
      <h1>{title}</h1>
      <p>{description}</p>
      <span className="status-pill neutral">Arquitectura preparada · pendiente de implementar</span>
    </section>
  )
}
