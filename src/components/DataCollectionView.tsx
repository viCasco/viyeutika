import { ArrowDown, ArrowUp, ArrowUpDown, LayoutGrid, List, RotateCcw } from 'lucide-react'

export type DataView='table'|'cards'
export type SortDirection='asc'|'desc'
export type SortState<K extends string>={key:K|null;direction:SortDirection}
export type SortOption<K extends string>={key:K;label:string}

export function cycleSort<K extends string>(state:SortState<K>,key:K):SortState<K>{
  if(state.key!==key)return {key,direction:'asc'}
  if(state.direction==='asc')return {key,direction:'desc'}
  return {key:null,direction:'asc'}
}

export function sortCollection<T,K extends string>(
  items:T[],
  state:SortState<K>,
  getter:(item:T,key:K)=>string|number|boolean|null|undefined,
){
  if(!state.key)return items
  const direction=state.direction==='asc'?1:-1
  return [...items].sort((a,b)=>{
    const av=getter(a,state.key as K)
    const bv=getter(b,state.key as K)
    if(typeof av==='number'&&typeof bv==='number')return (av-bv)*direction
    if(typeof av==='boolean'&&typeof bv==='boolean')return (Number(av)-Number(bv))*direction
    return String(av??'').localeCompare(String(bv??''),'es',{numeric:true,sensitivity:'base'})*direction
  })
}

export function DataViewControls<K extends string>({
  view,onView,sort,onSort,options,
}:{
  view:DataView
  onView:(view:DataView)=>void
  sort:SortState<K>
  onSort:(sort:SortState<K>)=>void
  options:SortOption<K>[]
}){
  return <div className="data-view-controls">
    <div className="staff-view-toggle" role="group" aria-label="Cambiar vista">
      <button type="button" className={view==='table'?'active':''} title="Vista de tabla" aria-label="Vista de tabla" aria-pressed={view==='table'} onClick={()=>onView('table')}><List size={16}/></button>
      <button type="button" className={view==='cards'?'active':''} title="Vista de tarjetas" aria-label="Vista de tarjetas" aria-pressed={view==='cards'} onClick={()=>onView('cards')}><LayoutGrid size={16}/></button>
    </div>
    <label className="data-sort-select">
      <span>Orden</span>
      <select value={sort.key??''} onChange={event=>onSort(event.target.value?{key:event.target.value as K,direction:'asc'}:{key:null,direction:'asc'})}>
        <option value="">Orden original</option>
        {options.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
    </label>
    {sort.key&&<>
      <button type="button" className="data-sort-direction" onClick={()=>onSort({...sort,direction:sort.direction==='asc'?'desc':'asc'})} title={sort.direction==='asc'?'Ascendente':'Descendente'} aria-label={sort.direction==='asc'?'Orden ascendente':'Orden descendente'}>
        {sort.direction==='asc'?<ArrowUp size={15}/>:<ArrowDown size={15}/>}
      </button>
      <button type="button" className="data-sort-reset" onClick={()=>onSort({key:null,direction:'asc'})} title="Restaurar orden original" aria-label="Restaurar orden original"><RotateCcw size={14}/></button>
    </>}
  </div>
}

export function SortableTh<K extends string>({
  label,sortKey,state,onSort,
}:{
  label:string
  sortKey:K
  state:SortState<K>
  onSort:(state:SortState<K>)=>void
}){
  const active=state.key===sortKey
  return <th aria-sort={active?(state.direction==='asc'?'ascending':'descending'):'none'}>
    <button type="button" className={'table-sort-button '+(active?'active':'')} onClick={()=>onSort(cycleSort(state,sortKey))}>
      <span>{label}</span>
      {active?(state.direction==='asc'?<ArrowUp size={13}/>:<ArrowDown size={13}/>):<ArrowUpDown size={13}/>}
    </button>
  </th>
}
