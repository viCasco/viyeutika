import type { ViyeuticaProject } from '../domain/project'

export interface GenerationUndoSnapshot{
  createdAt:string
  label:string
  project:ViyeuticaProject
}

const STORAGE_KEY='viyeutica.generation.undo.v1'

export function loadGenerationUndo():GenerationUndoSnapshot|null{
  try{
    const raw=window.localStorage.getItem(STORAGE_KEY)
    if(!raw)return null
    const parsed=JSON.parse(raw) as GenerationUndoSnapshot
    return parsed?.project?parsed:null
  }catch{
    return null
  }
}

export function saveGenerationUndo(project:ViyeuticaProject,label:string){
  const snapshot:GenerationUndoSnapshot={
    createdAt:new Date().toISOString(),
    label,
    project:structuredClone(project),
  }
  window.localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot))
  return snapshot
}

export function clearGenerationUndo(){
  window.localStorage.removeItem(STORAGE_KEY)
}
