import type { CollaborationRole, GenerationRun, ViyeuticaProject } from './project'

export type CollaborationPermission =
  | 'edit_project'
  | 'edit_availability'
  | 'generate'
  | 'publish'
  | 'view_all'
  | 'view_own'

const ROLE_PERMISSIONS:Record<CollaborationRole,CollaborationPermission[]>={
  direction:['edit_project','edit_availability','generate','publish','view_all','view_own'],
  head:['edit_project','edit_availability','generate','publish','view_all','view_own'],
  teacher:['edit_availability','view_own'],
}

export function can(role:CollaborationRole,permission:CollaborationPermission){
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function publishEstablishedSchedule(project:ViyeuticaProject,label?:string):ViyeuticaProject{
  const run=project.establishedScheduleRun
  if(!run)return project
  const version={
    id:'pub_'+crypto.randomUUID(),
    createdAt:new Date().toISOString(),
    label:label?.trim()||'Publicación '+new Date().toLocaleString('es-ES'),
    role:project.collaboration.localRole,
    run:structuredClone(run),
  }
  return {
    ...project,
    collaboration:{
      ...project.collaboration,
      publicationStatus:'published',
      publishedRun:structuredClone(run),
      publishedAt:new Date().toISOString(),
      versions:[...project.collaboration.versions,version],
    },
  }
}

export function restorePublicationVersion(project:ViyeuticaProject,versionId:string):ViyeuticaProject{
  const version=project.collaboration.versions.find(item=>item.id===versionId)
  if(!version)return project
  return {
    ...project,
    collaboration:{
      ...project.collaboration,
      publicationStatus:'published',
      publishedRun:structuredClone(version.run),
      publishedAt:new Date().toISOString(),
    },
  }
}

export function visiblePublishedRun(project:ViyeuticaProject):GenerationRun|null{
  return project.collaboration.publishedRun??project.establishedScheduleRun??null
}
