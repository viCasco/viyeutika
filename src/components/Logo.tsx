export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'brand brand-compact' : 'brand brand-official'}>
      <img
        src={compact ? './brand/logo_imagen.png' : './brand/logo_viYeutika.png'}
        alt={compact ? '⩒Yeutika' : 'Logo de ⩒Yeutika'}
      />
    </div>
  )
}
