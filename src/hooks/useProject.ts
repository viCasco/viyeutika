import { useEffect, useState } from 'react'
import type { ViyeuticaProject } from '../domain/project'
import { loadProject, PROJECT_UPDATED_EVENT } from '../store/projectStorage'

export function useProject() {
  const [project, setProject] = useState<ViyeuticaProject>(() => loadProject())

  useEffect(() => {
    const onProjectUpdate = (event: Event) => {
      const custom = event as CustomEvent<ViyeuticaProject>
      setProject(custom.detail ?? loadProject())
    }
    const onStorage = () => setProject(loadProject())

    window.addEventListener(PROJECT_UPDATED_EVENT, onProjectUpdate)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(PROJECT_UPDATED_EVENT, onProjectUpdate)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return project
}
