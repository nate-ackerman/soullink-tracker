import { useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { Badge } from '../ui/Badge'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Home',
  '/dashboard': 'Run Dashboard',
  '/routes': 'Encounter Tracker',
  '/soul-links': 'Soul Links',
  '/party': 'Party Tracker',
  '/graveyard': 'Graveyard',
  '/learnset': 'Pokemon Data',
  '/notes': 'Notes',
  '/settings': 'Settings',
}

export function TopBar() {
  const location = useLocation()
  const { activeRun, levelCap, players } = useAppStore()
  const isSolo = players.length === 1
  const rawTitle = PAGE_TITLES[location.pathname] ?? 'Soul Link Tracker'
  const title = location.pathname === '/soul-links' && isSolo ? 'Pokémon' : rawTitle

  const statusVariant =
    activeRun?.status === 'active'
      ? 'success'
      : activeRun?.status === 'completed'
      ? 'info'
      : 'danger'

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-secondary shrink-0">
      <h1 className="text-sm font-semibold text-text-primary">{title}</h1>
      {activeRun && (
        <div className="flex items-center gap-3">
          {levelCap !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">Level cap:</span>
              <span className="text-xs font-semibold text-text-primary">Lv. {levelCap}</span>
            </div>
          )}
          <span className="text-xs text-text-muted">
            {activeRun.game.charAt(0).toUpperCase() + activeRun.game.slice(1)}
          </span>
          <Badge variant={statusVariant}>
            {activeRun.status.charAt(0).toUpperCase() + activeRun.status.slice(1)}
          </Badge>
        </div>
      )}
    </header>
  )
}
