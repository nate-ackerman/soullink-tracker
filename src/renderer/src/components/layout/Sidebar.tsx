import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Map, Link2, Users, BookOpen,
  Calculator, FileText, Settings, ChevronLeft, ChevronRight, Home, Info
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useAppStore } from '../../store/appStore'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/routes', icon: Map, label: 'Encounters' },
  { to: '/soul-links', icon: Link2, label: 'Soul Links' },
  { to: '/party', icon: Users, label: 'Party' },
  { to: '/learnset', icon: BookOpen, label: 'Learnset & Stats' },
  { to: '/catch-calc', icon: Calculator, label: 'Catch Calc' },
  { to: '/notes', icon: FileText, label: 'Notes' },
  { to: '/info', icon: Info, label: 'Info' },
  { to: '/settings', icon: Settings, label: 'Settings' }
]

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, activeRun, setActiveRun } = useAppStore()
  const navigate = useNavigate()

  return (
    <aside
      className={cn(
        'flex flex-col bg-primary border-r border-border transition-all duration-200 shrink-0',
        sidebarCollapsed ? 'w-14' : 'w-52'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-border">
        {!sidebarCollapsed && (
          <span className="text-sm font-bold text-accent-red tracking-wide">SOUL LINK</span>
        )}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-1 rounded hover:bg-elevated text-text-muted hover:text-text-primary transition-colors ml-auto"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Run indicator */}
      {activeRun && !sidebarCollapsed && (
        <div className="px-3 py-2 border-b border-border">
          <p className="text-[10px] text-text-muted uppercase tracking-wider">Active Run</p>
          <p className="text-xs font-medium text-text-secondary truncate">{activeRun.name}</p>
          <p className="text-[10px] text-text-muted capitalize">{activeRun.game}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {activeRun ? (
          NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                  'hover:bg-elevated',
                  isActive
                    ? 'text-text-primary bg-elevated border-r-2 border-accent-teal'
                    : 'text-text-secondary'
                )
              }
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))
        ) : (
          <div className={cn('px-3 py-2', sidebarCollapsed && 'px-2')}>
            {!sidebarCollapsed && (
              <p className="text-xs text-text-muted">No active run. Select or create one.</p>
            )}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-2 space-y-1">
        <button
          onClick={() => {
            setActiveRun(null)
            navigate('/')
          }}
          className={cn(
            'flex items-center gap-3 px-3 py-2 w-full rounded text-sm text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors',
            sidebarCollapsed && 'justify-center px-2'
          )}
          title={sidebarCollapsed ? 'Home' : undefined}
        >
          <Home className="w-4 h-4 shrink-0" />
          {!sidebarCollapsed && <span>Home</span>}
        </button>
      </div>
    </aside>
  )
}
