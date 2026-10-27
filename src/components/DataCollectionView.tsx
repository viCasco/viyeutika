import { ArrowDown, ArrowUp, ArrowUpDown, LayoutGrid, List } from 'lucide-react'

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

export function DataViewControls<K extends string>(props:{
  view:DataView
  onView:(view:DataView)=>void
  sort:SortState<K>
  onSort:(sort:SortState<K>)=>void
  options:SortOption<K>[]
}){
  const {view,onView}=props
  return <div className="data-view-controls">
    <div className="staff-view-toggle" role="group" aria-label="Cambiar vista">
      <button type="button" className={view==='table'?'active':''} title="Vista de tabla" aria-label="Vista de tabla" aria-pressed={view==='table'} onClick={()=>onView('table')}><List size={16}/></button>
      <button type="button" className={view==='cards'?'active':''} title="Vista de tarjetas" aria-label="Vista de tarjetas" aria-pressed={view==='cards'} onClick={()=>onView('cards')}><LayoutGrid size={16}/></button>
    </div>
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
