import { useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { Badge } from '../ui/Badge'
import { getGameById } from '../../data/games'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Home',
  '/dashboard': 'Run Dashboard',
  '/routes': 'Encounter Tracker',
  '/soul-links': 'Soul Links',
  '/party': 'Party Tracker',
  '/graveyard': 'Graveyard',
  '/learnset': 'Learnset Search',
  '/catch-calc': 'Catch Calculator',
  '/party-builder': 'Party Builder',
  '/notes': 'Notes',
  '/settings': 'Settings',
}

export function TopBar() {
  const location = useLocation()
  const { activeRun, levelCap, setLevelCap } = useAppStore()
  const title = PAGE_TITLES[location.pathname] ?? 'Soul Link Tracker'

  const statusVariant =
    activeRun?.status === 'active'
      ? 'success'
      : activeRun?.status === 'completed'
      ? 'info'
      : 'danger'

  const gameInfo = activeRun ? getGameById(activeRun.game) : undefined
  const gymLeaders = gameInfo?.gymLeaders ?? []
  const modifier = activeRun?.ruleset.trainerLevelModifier ?? 100

  function adjustedCap(base: number): number {
    return Math.round(base * modifier / 100)
  }

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-secondary shrink-0">
      <h1 className="text-sm font-semibold text-text-primary">{title}</h1>
      {activeRun && (
        <div className="flex items-center gap-3">
          {gymLeaders.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">Level cap:</span>
              <select
                value={levelCap ?? ''}
                onChange={(e) => setLevelCap(e.target.value ? Number(e.target.value) : null)}
                className="text-xs bg-elevated border border-border rounded px-1.5 py-0.5 text-text-primary focus:outline-none focus:border-border-light cursor-pointer"
                title="Set global level cap (auto-evolves Pokémon)"
              >
                <option value="">None</option>
                {gymLeaders.map((gym) => {
                  const cap = adjustedCap(gym.levelCap)
                  return (
                    <option key={gym.badge} value={cap}>
                      Lv. {cap} — {gym.name}{modifier !== 100 ? ` (base ${gym.levelCap})` : ''}
                    </option>
                  )
                })}
              </select>
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
