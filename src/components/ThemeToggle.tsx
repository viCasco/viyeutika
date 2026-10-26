import type { ThemeMode } from '../hooks/useTheme'

export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: ThemeMode
  onToggle: () => void
}) {
  const dark = theme === 'dark'
  return (
    <button
      className={'theme-toggle ' + (dark ? 'is-dark' : 'is-light')}
      onClick={onToggle}
      aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      aria-pressed={dark}
      title={dark ? 'Tema oscuro · cambiar a claro' : 'Tema claro · cambiar a oscuro'}
    >
      <span className="theme-sky" aria-hidden="true">
        <span className="theme-stars"><i/><i/><i/><i/></span>
        <span className="theme-cloud cloud-a"/>
        <span className="theme-cloud cloud-b"/>
      </span>
      <span className="theme-orb" aria-hidden="true">
        <span className="moon-crater crater-a"/>
        <span className="moon-crater crater-b"/>
        <span className="moon-crater crater-c"/>
      </span>
    </button>
  )
}
