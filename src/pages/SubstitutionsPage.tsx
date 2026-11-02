import { useMemo, useState } from 'react'
import { CalendarSearch, UserRoundPlus, Users } from 'lucide-react'
import { SubstitutionTeacherDialog } from './SubstitutionTeacherDialog'
import { SessionSubstitutionRegister, type SubstitutionSlotRequest } from './SessionSubstitutionRegister'
import {
  latestGeneration,
  type GenerationRun,
  type ViyeuticaProject,
  type Weekday,
} from '../domain/project'
import { teacherAvoidsSlot, teacherIsUnavailable } from '../domain/validationEngine'

const DAY_LABELS: Record<Weekday, string> = {
  L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes', S: 'Sábado',
}
const FILTER_LABELS = {
  available: 'Disponibles',
  'no-class': 'Sin clase',
  all: 'Todos',
} as const
type ViewFilter = keyof typeof FILTER_LABELS
type TeacherStatus = 'free' | 'avoid' | 'blocked' | 'busy'

export interface SubstituteCandidate {
  id: string
  name: string
  status: TeacherStatus
  detail: string
}

export function candidatesForSlot(
  project: ViyeuticaProject,
  run: GenerationRun,
  day: Weekday,
  sessionId: string,
): SubstituteCandidate[] {
  const slot = { day, sessionId }
  return project.teachers
    .filter(teacher => teacher.active)
    .map(teacher => {
      const assigned = run.entries.filter(entry =>
        entry.teacherId === teacher.id && entry.day === day && entry.sessionId === sessionId,
      )
      if (assigned.length) {
        const detail = assigned.map(entry => {
          const group = project.groups.find(group => group.id === entry.groupId)?.name ?? 'Grupo sin identificar'
          const subject = project.subjects.find(subject => subject.id === entry.subjectId)?.name ?? 'Materia sin identificar'
          return group + ' · ' + subject
        }).join('; ')
        return { id: teacher.id, name: teacher.name, status: 'busy' as const, detail }
      }
      if (teacherIsUnavailable(project, teacher.id, slot)) {
        const reasons = project.teacherAvailability
          .filter(item => item.teacherId === teacher.id && item.day === day &&
            item.session === sessionId && (item.status === 'unavailable' || item.status === 'travel'))
        const travelling = reasons.some(item => item.status === 'travel')
        const reason = reasons.map(item => item.detail.trim()).filter(Boolean).join('; ')
        return {
          id: teacher.id,
          name: teacher.name,
          status: 'blocked' as const,
          detail: (travelling ? 'Itinerancia / desplazamiento' : 'No disponible') + (reason ? ': ' + reason : ''),
        }
      }
      if (teacherAvoidsSlot(project, teacher.id, slot)) {
        return { id: teacher.id, name: teacher.name, status: 'avoid' as const, detail: 'Sin clase · franja a evitar (SOFT)' }
      }
      return { id: teacher.id, name: teacher.name, status: 'free' as const, detail: 'Sin sesión asignada' }
    })
    .sort((a,b) => a.name.localeCompare(b.name, 'es'))
}


export function candidatesForFilter(candidates: SubstituteCandidate[], filter: ViewFilter) {
  if (filter === 'available') return candidates.filter(candidate => candidate.status === 'free' || candidate.status === 'avoid')
  if (filter === 'no-class') return candidates.filter(candidate => candidate.status !== 'busy')
  return candidates
}

function candidateStatus(status: TeacherStatus) {
  if (status === 'free') return 'Sin clase'
  if (status === 'avoid') return 'Evitar (SOFT)'
  if (status === 'blocked') return 'No disponible'
  return 'Ocupado'
}

export function SubstitutionsPage({ project, navigate }: {
  project: ViyeuticaProject
  navigate: (path: string) => void
}) {
  const runs = useMemo(() => [
    ...(project.establishedScheduleRun ? [{ key: 'established', label: 'Horario establecido', run: project.establishedScheduleRun }] : []),
    ...(project.draftScheduleRun ? [{ key: 'draft', label: 'Borrador', run: project.draftScheduleRun }] : []),
    ...project.generationRuns.map((run, index) => ({ key: 'proposal-' + index, label: 'Propuesta ' + (index + 1), run })),
  ], [project])
  const preferredId = project.establishedScheduleRun?.id ??
    project.draftScheduleRun?.id ?? project.selectedGenerationRunId ?? latestGeneration(project)?.id ?? ''
  const [sourceKey, setSourceKey] = useState('')
  const [filter, setFilter] = useState<ViewFilter>('available')
  const [detailSlot, setDetailSlot] = useState<{ day: Weekday; sessionId: string } | null>(null)
  const [registrationSlot, setRegistrationSlot] = useState<SubstitutionSlotRequest | null>(null)

  const selected = runs.find(item => item.key === sourceKey) ??
    runs.find(item => item.run.id === preferredId) ?? runs[0]
  const activeDays = project.schedule.activeDays
  const sessions = project.schedule.blocks.filter(block => block.active && block.type === 'teaching')
  const cells = useMemo(() => {
    if (!selected) return new Map<string, SubstituteCandidate[]>()
    const result = new Map<string, SubstituteCandidate[]>()
    for (const day of activeDays) {
      for (const session of sessions) {
        result.set(day + '|' + session.id, candidatesForSlot(project, selected.run, day, session.id))
      }
    }
    return result
  }, [project, selected, activeDays, sessions])
  const needsReview = selected
    ? (selected.key === 'established' && project.establishedScheduleNeedsRevalidation) ||
      (selected.key === 'draft' && project.draftScheduleNeedsRevalidation) ||
      (selected.key.startsWith('proposal-') && project.generationNeedsRevalidation)
    : false
  const detailSession = sessions.find(session => session.id === detailSlot?.sessionId)
  const detailCandidates = detailSlot ? cells.get(detailSlot.day + '|' + detailSlot.sessionId) ?? [] : []
  const requestCoverage = (day:Weekday,sessionId:string)=>{
    setRegistrationSlot(previous=>({day,sessionId,requestId:(previous?.requestId??0)+1}))
  }
  const coverageCandidates=(day:Weekday,sessionId:string)=>
    project.establishedScheduleRun
      ?candidatesForSlot(project,project.establishedScheduleRun,day,sessionId)
      :[]


  return <div className="wizard-page substitutions-page">
    <section className="wizard-intro">
      <div>
        <span className="eyebrow dark"><CalendarSearch size={15}/> Cobertura docente</span>
        <h1>Sustituciones</h1>
        <p>Consulta las disponibilidades, registra coberturas por sesión y revisa el reparto e historial de sustituciones.</p>
      </div>
    </section>

    <section className="panel">
      <div className="substitutions-toolbar">
        <label className="form-field substitutions-reference"><span>Horario de referencia</span>
          <select value={selected?.key ?? ''} onChange={event => {setSourceKey(event.target.value); setDetailSlot(null)}}>
            {runs.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <div className="substitutions-filters" role="group" aria-label="Filtrar profesorado">
          {(Object.keys(FILTER_LABELS) as ViewFilter[]).map(value =>
            <button type="button" key={value} className={filter === value ? 'selected' : ''}
              aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {FILTER_LABELS[value]}
            </button>
          )}
        </div>
      </div>
      {!selected || !activeDays.length || !sessions.length
        ? <p className="substitutions-note">Para consultar la disponibilidad, configura sesiones lectivas y genera o establece un horario desde Horarios. <button type="button" onClick={() => navigate('/horarios')}>Ir a Horarios</button></p>
        : <>
          {needsReview && <p className="substitutions-warning">Este horario necesita revalidación. Los datos de disponibilidad pueden estar desactualizados.</p>}
          <p className="substitutions-grid-hint">Utiliza los dos iconos de cada sesión: registrar una ausencia o consultar el detalle de disponibilidad.</p>
          <div className="substitutions-grid-scroll" role="region" aria-label="Horario semanal de sustituciones" tabIndex={0}>
            <table className="substitutions-week-grid">
              <thead><tr><th scope="col">Sesión</th>{activeDays.map(day => <th scope="col" key={day}>{DAY_LABELS[day]}</th>)}</tr></thead>
              <tbody>
                {sessions.map((session, index) => <tr key={session.id}>
                  <th scope="row"><strong>{session.label || (index + 1) + '.ª sesión'}</strong><small>{session.start}–{session.end}</small></th>
                  {activeDays.map(day => {
                    const candidates = candidatesForFilter(cells.get(day + '|' + session.id) ?? [], filter)
                    const summary = candidates.slice(0, 3)
                    const remaining = candidates.length - summary.length
                    return <td key={day}>
                      <div className={'substitutions-slot ' + (candidates.length ? '' : 'is-empty')}>
                        <div className="substitutions-slot-header">
                          <strong>{candidates.length} {candidates.length === 1 ? 'docente' : 'docentes'}</strong>
                          <span className="substitutions-cell-actions">
                            <button type="button" className="substitution-cell-action" title="Registrar ausencia y cobertura"
                              aria-label={'Registrar sustitución: '+DAY_LABELS[day]+', '+(session.label||String(index+1))}
                              disabled={!project.establishedScheduleRun||selected?.key!=='established'}
                              onClick={()=>requestCoverage(day,session.id)}><UserRoundPlus size={17}/></button>
                            <button type="button" className="substitution-cell-action" title="Ver disponibilidad docente"
                              aria-label={'Ver detalle docente: '+DAY_LABELS[day]+', '+(session.label||String(index+1))}
                              onClick={()=>setDetailSlot({day,sessionId:session.id})}><Users size={17}/></button>
                          </span>
                        </div>
                        {summary.length
                          ? <span className="substitutions-slot-names">{summary.map(candidate =>
                            <span key={candidate.id} className={'substitutions-slot-name ' + candidate.status}>
                              {candidate.name || 'Docente sin nombre'}
                              {candidate.status !== 'free' && <small> · {candidateStatus(candidate.status)}</small>}
                            </span>)}</span>
                          : <span className="substitutions-slot-empty">Ninguno</span>}
                        {remaining > 0 && <span className="substitutions-slot-more">+{remaining} más</span>}
                      </div>
                    </td>
                  })}
                </tr>)}
              </tbody>
            </table>
          </div>
          <p className="substitutions-help">«Disponibles» incluye docentes sin sesión asignada y sin bloqueo HARD; las preferencias SOFT aparecen identificadas. «Sin clase» también incluye docentes no disponibles. Comprueba apoyos, cargos, reducciones y otras obligaciones antes de asignar una sustitución.</p>
        </>}
    </section>
    <SessionSubstitutionRegister project={project} slotRequest={registrationSlot} candidatesFor={coverageCandidates}/>
    {detailSlot && detailSession && <SubstitutionTeacherDialog
      title={DAY_LABELS[detailSlot.day]+' · '+detailSession.label}
      time={detailSession.start+'–'+detailSession.end}
      candidates={detailCandidates}
      onClose={()=>setDetailSlot(null)}
    />}
  </div>
}
