import { useMemo, useState } from 'react'
import { CalendarSearch, Clock3, Users } from 'lucide-react'
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

export function SubstitutionsPage({ project, navigate }: {
  project: ViyeuticaProject
  navigate: (path: string) => void
}) {
  const runs = useMemo(() => [
    ...(project.establishedScheduleRun ? [{ label: 'Horario establecido', run: project.establishedScheduleRun }] : []),
    ...(project.draftScheduleRun ? [{ label: 'Borrador', run: project.draftScheduleRun }] : []),
    ...project.generationRuns.map((run, index) => ({ label: 'Propuesta ' + (index + 1), run })),
  ], [project])
  const preferredId = project.establishedScheduleRun?.id ??
    project.draftScheduleRun?.id ?? project.selectedGenerationRunId ?? latestGeneration(project)?.id ?? ''
  const [sourceId, setSourceId] = useState('')
  const [day, setDay] = useState<Weekday>(project.schedule.activeDays[0] ?? 'L')
  const [sessionId, setSessionId] = useState('')
  const [filter, setFilter] = useState<'available' | 'no-class' | 'all'>('available')

  const selected = runs.find(item => item.run.id === (sourceId || preferredId)) ?? runs[0]
  const activeDays = project.schedule.activeDays
  const activeDay = activeDays.includes(day) ? day : activeDays[0]
  const sessions = project.schedule.blocks.filter(block => block.active && block.type === 'teaching')
  const activeSession = sessions.find(block => block.id === sessionId) ?? sessions[0]

  const candidates = selected && activeDay && activeSession
    ? candidatesForSlot(project, selected.run, activeDay, activeSession.id)
    : []
  const available = candidates.filter(item => item.status === 'free' || item.status === 'avoid')
  const noClass = candidates.filter(item => item.status !== 'busy')
  const shown = filter === 'available' ? available : filter === 'no-class' ? noClass : candidates
  const needsReview = selected
    ? (selected.run.id === project.establishedScheduleRun?.id && project.establishedScheduleNeedsRevalidation) ||
      (selected.run.id === project.draftScheduleRun?.id && project.draftScheduleNeedsRevalidation) ||
      (project.generationRuns.some(run => run.id === selected.run.id) && project.generationNeedsRevalidation)
    : false

  return <div className="wizard-page substitutions-page">
    <section className="wizard-intro">
      <div>
        <span className="eyebrow dark"><CalendarSearch size={15}/> Consulta de horarios</span>
        <h1>Sustituciones</h1>
        <p>Consulta qué docentes no tienen sesiones asignadas en un día y tramo lectivo. Los bloqueos de disponibilidad se muestran por separado.</p>
      </div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><span className="panel-kicker">Seleccionar franja</span><h2>Buscar profesorado</h2></div><Clock3 size={20}/></div>
      <div className="substitutions-controls">
        <label className="form-field"><span>Horario de referencia</span>
          <select value={selected?.run.id ?? ''} onChange={event => setSourceId(event.target.value)}>
            {runs.map(({ label, run }) => <option key={run.id} value={run.id}>{label}</option>)}
          </select>
        </label>
        <label className="form-field"><span>Día</span>
          <select value={activeDay ?? ''} onChange={event => setDay(event.target.value as Weekday)}>
            {activeDays.map(value => <option key={value} value={value}>{DAY_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="form-field"><span>Sesión</span>
          <select value={activeSession?.id ?? ''} onChange={event => setSessionId(event.target.value)}>
            {sessions.map(block => <option key={block.id} value={block.id}>{block.label} · {block.start}–{block.end}</option>)}
          </select>
        </label>
      </div>
      {!selected || !activeDay || !activeSession
        ? <p className="substitutions-note">Para consultar la disponibilidad, configura sesiones lectivas y genera o establece un horario desde Horarios. <button type="button" onClick={() => navigate('/horarios')}>Ir a Horarios</button></p>
        : <>
          {needsReview && <p className="substitutions-warning">Este horario necesita revalidación. La disponibilidad mostrada puede estar desactualizada.</p>}
          <div className="substitutions-summary" aria-live="polite">
            <div><strong>{available.length}</strong><span>Sin clase y sin bloqueo HARD</span></div>
            <div><strong>{noClass.length}</strong><span>Sin sesión asignada</span></div>
            <div><strong>{candidates.length - noClass.length}</strong><span>Con sesión asignada</span></div>
          </div>
          <div className="substitutions-filters" role="group" aria-label="Filtrar profesorado">
            <button className={filter === 'available' ? 'selected' : ''} onClick={() => setFilter('available')}>Disponibles</button>
            <button className={filter === 'no-class' ? 'selected' : ''} onClick={() => setFilter('no-class')}>Sin clase</button>
            <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>Todos</button>
          </div>
          {shown.length
            ? <div className="substitutions-results">
              {shown.map(item => <div className="substitutions-teacher" key={item.id}>
                <Users size={17}/><div><strong>{item.name || 'Docente sin nombre'}</strong><small>{item.detail}</small></div>
                <span className={'substitutions-state ' + item.status}>{item.status === 'free' ? 'Sin clase' : item.status === 'avoid' ? 'Evitar' : item.status === 'blocked' ? 'No disponible' : 'Ocupado'}</span>
              </div>)}
            </div>
            : <p className="substitutions-empty">No hay docentes que cumplan este filtro en la franja seleccionada.</p>}
          <p className="substitutions-help">«Sin clase» significa que no tiene una sesión asignada en el horario consultado. No equivale a una guardia autorizada: verifica apoyos, reuniones, reducciones y otras obligaciones no representadas en el horario antes de realizar una sustitución.</p>
        </>}
    </section>
  </div>
}
