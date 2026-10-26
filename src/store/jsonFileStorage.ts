export type StoredTemplateFile={
  id:string
  name:string
  size:number
  addedAt:string
  rawText:string
  format:'json'|'xls'
}

const STORAGE_KEY='viyeutica.imported-template-files.v1'
const LEGACY_KEY='viyeutica.imported-json-files.v1'

export function loadStoredTemplateFiles():StoredTemplateFile[]{
  try{
    const current=JSON.parse(window.localStorage.getItem(STORAGE_KEY)??'[]')
    if(Array.isArray(current)&&current.length)return current
    const legacy=JSON.parse(window.localStorage.getItem(LEGACY_KEY)??'[]')
    if(Array.isArray(legacy)&&legacy.length){
      const migrated=legacy.map((item:any)=>({...item,format:'json' as const}))
      persist(migrated)
      return migrated
    }
    return []
  }catch{
    return []
  }
}

function persist(items:StoredTemplateFile[]){
  window.localStorage.setItem(STORAGE_KEY,JSON.stringify(items))
}

export async function storeTemplateFile(file:File,rawText:string,format:'json'|'xls'){
  const hashBuffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rawText))
  const hash=Array.from(new Uint8Array(hashBuffer)).map(value=>value.toString(16).padStart(2,'0')).join('')
  const id=format+'_'+hash
  const current=loadStoredTemplateFiles()
  const item:StoredTemplateFile={id,name:file.name,size:file.size,addedAt:new Date().toISOString(),rawText,format}
  persist([item,...current.filter(entry=>entry.id!==id)])
  return item
}

export function deleteStoredTemplateFile(id:string){
  persist(loadStoredTemplateFiles().filter(item=>item.id!==id))
}
