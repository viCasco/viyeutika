const DB_NAME='viyeutica-files'
const STORE='normative-files'
const VERSION=1

function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,VERSION)
    request.onupgradeneeded=()=>{
      const db=request.result
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error??new Error('No se pudo abrir el almacén de documentos.'))
  })
}

export async function saveNormativeFile(sourceId:string,file:Blob){
  const db=await openDb()
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite')
    tx.objectStore(STORE).put(file,sourceId)
    tx.oncomplete=()=>resolve()
    tx.onerror=()=>reject(tx.error??new Error('No se pudo guardar el documento.'))
  })
  db.close()
}

export async function getNormativeFile(sourceId:string){
  const db=await openDb()
  const value=await new Promise<Blob|undefined>((resolve,reject)=>{
    const request=db.transaction(STORE,'readonly').objectStore(STORE).get(sourceId)
    request.onsuccess=()=>resolve(request.result as Blob|undefined)
    request.onerror=()=>reject(request.error??new Error('No se pudo recuperar el documento.'))
  })
  db.close()
  return value
}

export async function deleteNormativeFile(sourceId:string){
  const db=await openDb()
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite')
    tx.objectStore(STORE).delete(sourceId)
    tx.oncomplete=()=>resolve()
    tx.onerror=()=>reject(tx.error??new Error('No se pudo eliminar el documento.'))
  })
  db.close()
}
