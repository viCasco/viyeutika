import { useEffect, useMemo, useState } from 'react'
import {
  Bell, BookOpen, CalendarClock, CalendarDays, ChevronDown, ClipboardCheck,
  FileInput, FileSearch, Gauge, GraduationCap, LayoutGrid, Menu, PanelLeftClose,
  ShieldCheck, SlidersHorizontal, Sparkles, Users, X,
} from 'lucide-react'
import { Logo } from './components/Logo'
import { PlaceholderPage } from './components/PlaceholderPage'
import { ThemeToggle } from './components/ThemeToggle'
import { Dashboard } from './pages/Dashboard'
import { CoursesPage } from './pages/CoursesPage'
import { SetupWizard } from './pages/SetupWizard'
import { GroupsPage } from './pages/GroupsPage'
import { SchedulePage } from './pages/SchedulePage'
import { StudyPlanPage } from './pages/StudyPlanPage'
import { NormativePage } from './pages/NormativePage'
import { ProjectImportPage } from './pages/ProjectImportPage'
import { StaffPage } from './pages/StaffPage'
import { AssignmentsPage } from './pages/AssignmentsPage'
import { RulesPage } from './pages/RulesPage'
import { PrevalidationPage } from './pages/PrevalidationPage'
import { GenerationPage } from './pages/GenerationPage'
import { useProject } from './hooks/useProject'
import { useTheme } from './hooks/useTheme'

const navigation = [
  { path: '/', label: 'Inicio', icon: Gauge },
  { path: '/cursos', label: 'Curso académico', icon: CalendarDays },
  { path: '/normativa', label: 'Normativa', icon: FileSearch },
  { path: '/proyecto-json', label: 'Importar | Exportar', icon: FileInput },
  { path: '/centro', label: 'Centro', icon: GraduationCap },
  { path: '/grupos', label: 'Estructura y grupos', icon: LayoutGrid },
  { path: '/jornada', label: 'Jornada y sesiones', icon: CalendarClock },
  { path: '/materias', label: 'Plan de estudios', icon: BookOpen },
  { path: '/profesorado', label: 'Profesorado', icon: Users },
  { path: '/asignaciones', label: 'Asignaciones', icon: SlidersHorizontal },
  { path: '/reglas', label: 'Reglas', icon: ShieldCheck },
  { path: '/prevalidacion', label: 'Prevalidación', icon: ClipboardCheck },
  { path: '/horarios', label: 'Horarios', icon: CalendarDays },
]

const descriptions: Record<string,string> = {
  '/cursos': 'Creación, histórico y estado de los cursos académicos.',
  '/normativa': 'Fuentes normativas, extracción de reglas y revisión antes de aplicar plantillas.',
  '/proyecto-json': 'Importación de plantillas y exportación de horarios, informes y respaldos.',
  '/profesorado': 'Plantilla docente, especialidades, jornadas, cargos y reducciones.',
  '/asignaciones': 'Relación entre grupos, materias, profesorado y responsabilidades docentes.',
  '/reglas': 'Restricciones legales, reglas del centro y preferencias ponderadas.',
  '/prevalidacion': 'Comprobación de integridad antes de ejecutar la generación automática.',
  '/horarios': 'Generación, comparación y revisión de propuestas de horario.',
}

const getRoute = () => {
  const raw = window.location.hash.replace(/^#/,'') || '/'
  const normalized = raw.startsWith('/') ? raw : '/' + raw
  const [path]=normalized.split('?')
  if(path==='/configuracion')return '/centro'
  if(path==='/generacion')return '/horarios'
  if(path==='/exportaciones')return '/proyecto-json'
  return path
}

export default function App() {
  const project = useProject()
  const {theme,toggleTheme} = useTheme()
  const [route,setRoute] = useState(getRoute)
  const [sidebarOpen,setSidebarOpen] = useState(false)
  const [collapsed,setCollapsed] = useState(false)

  useEffect(() => {
    const fn = () => { setRoute(getRoute()); setSidebarOpen(false) }
    window.addEventListener('hashchange',fn)
    return () => window.removeEventListener('hashchange',fn)
  },[])

  const active = useMemo(
    () => navigation.find(item => item.path === route) ?? navigation[0],
    [route],
  )

  const go = (path:string) => { window.location.hash = path }
  const centerName = project.center.name.trim() || 'Centro sin configurar'

  const renderContent = () => {
    if (route === '/') return <Dashboard navigate={go} project={project}/>
    if (route === '/cursos') return <CoursesPage project={project} navigate={go}/>
    if (route === '/centro') return <SetupWizard project={project} navigate={go}/>
    if (route === '/grupos') return <GroupsPage project={project} navigate={go}/>
    if (route === '/jornada') return <SchedulePage project={project} navigate={go}/>
    if (route === '/materias') return <StudyPlanPage project={project} navigate={go}/>
    if (route === '/normativa') return <NormativePage project={project}/>
    if (route === '/proyecto-json') return <ProjectImportPage project={project} navigate={go}/>
    if (route === '/profesorado') return <StaffPage project={project} navigate={go}/>
    if (route === '/asignaciones') return <AssignmentsPage project={project} navigate={go}/>
    if (route === '/reglas') return <RulesPage project={project} navigate={go}/>
    if (route === '/prevalidacion') return <PrevalidationPage project={project} navigate={go}/>
    if (route === '/horarios') return <GenerationPage project={project} navigate={go}/>
    return <PlaceholderPage title={active.label} description={descriptions[route] ?? 'Módulo preparado para su implementación.'}/>
  }

  return (
    <div className={'app-shell ' + (collapsed ? 'is-collapsed' : '')}>
      <div className={'mobile-overlay ' + (sidebarOpen ? 'show' : '')} onClick={() => setSidebarOpen(false)} />
      <aside className={'sidebar ' + (sidebarOpen ? 'mobile-open' : '')}>
        <div className="sidebar-brand">
          <Logo compact={collapsed}/>
          <button className="icon-button collapse-button" onClick={() => setCollapsed(value => !value)} aria-label="Contraer navegación"><PanelLeftClose size={19}/></button>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar"><X size={19}/></button>
        </div>
        <nav className="nav-list">
          {navigation.map(item => {
            const Icon=item.icon
            const isActive=route===item.path
            return <button key={item.path} className={'nav-item '+(isActive?'active':'')} onClick={() => go(item.path)} title={collapsed?item.label:undefined}><Icon size={19}/><span>{item.label}</span></button>
          })}
        </nav>
        <div className="sidebar-user"><span className="avatar">AD</span><div><strong>Administrador</strong><small>{centerName}</small></div><ChevronDown size={16}/></div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Abrir navegación"><Menu size={21}/></button>
            <div><span className="topbar-context">{centerName}</span><strong>{active.label}</strong></div>
          </div>
          <div className="topbar-actions">
            <ThemeToggle theme={theme} onToggle={toggleTheme}/>
            <button className="course-selector"><CalendarDays size={16}/><span>{project.academicYear.label}</span><ChevronDown size={15}/></button>
            <button className="icon-button notification-button" aria-label="Notificaciones"><Bell size={19}/><span className="notification-dot"/></button>
            <span className="top-avatar">AD</span>
          </div>
        </header>
        <div className="content-area">{renderContent()}</div>
      </main>
      <nav className="mobile-bottom-nav">
        <button className={route==='/'?'active':''} onClick={() => go('/')}><Gauge size={20}/><span>Inicio</span></button>
        <button className={route==='/centro'?'active':''} onClick={() => go('/centro')}><GraduationCap size={20}/><span>Centro</span></button>
        <button className={route==='/grupos'?'active':''} onClick={() => go('/grupos')}><LayoutGrid size={20}/><span>Grupos</span></button>
        <button className={route==='/jornada'?'active':''} onClick={() => go('/jornada')}><CalendarClock size={20}/><span>Jornada</span></button>
        <button className={route==='/materias'?'active':''} onClick={() => go('/materias')}><BookOpen size={20}/><span>Plan</span></button>
      </nav>
    </div>
  )
}
