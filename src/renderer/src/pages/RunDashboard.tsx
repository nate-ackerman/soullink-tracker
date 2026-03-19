import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Map, Link2, Users, Skull, TrendingUp, Heart, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EvolvedCatchSprite } from '../components/pokemon/EvolvedCatchSprite'
import { useAppStore } from '../store/appStore'
import { getGameById } from '../data/games'

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: any; color: string }) {
  return (
    <Card className="flex-1">
      <CardContent className="flex items-center gap-3 py-3">
        <div className="p-2 rounded" style={{ backgroundColor: `${color}20` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div>
          <p className="text-xl font-bold text-text-primary">{value}</p>
          <p className="text-xs text-text-muted">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function RunDashboard() {
  const navigate = useNavigate()
  const { activeRun, activeRunId, players, catches, soulLinks, partySlots, loadRunData, levelCap } = useAppStore()

  useEffect(() => {
    if (activeRunId) loadRunData(activeRunId)
  }, [activeRunId])

  if (!activeRun) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <p className="text-text-secondary">No active run selected</p>
          <Button onClick={() => navigate('/')}>Go to Home</Button>
        </div>
      </div>
    )
  }

  const gameInfo = getGameById(activeRun.game)
  const totalCatches = catches.filter((c) => c.status !== 'released').length
  const totalDeaths = catches.filter((c) => c.status === 'dead').length
  const totalRoutes = new Set(catches.map((c) => c.route_id)).size
  const totalLinks = soulLinks.length

  const quickLinks = [
    { label: 'Routes', icon: Map, to: '/routes', description: 'Log catches per route' },
    { label: 'Soul Links', icon: Link2, to: '/soul-links', description: 'View all pairings' },
    { label: 'Party', icon: Users, to: '/party', description: 'Manage active parties' },
    { label: 'Graveyard', icon: Skull, to: '/graveyard', description: 'View fallen Pokémon' }
  ]

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Run header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-text-primary">{activeRun.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-text-secondary capitalize">
                {gameInfo?.name ?? activeRun.game}
              </span>
              <span className="text-text-muted">•</span>
              <span className="text-sm text-text-muted">Gen {activeRun.generation}</span>
              <span className="text-text-muted">•</span>
              <span className="text-sm text-text-muted">
                Started {new Date(activeRun.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <Badge
            variant={activeRun.status === 'active' ? 'success' : activeRun.status === 'failed' ? 'danger' : 'info'}
          >
            {activeRun.status}
          </Badge>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex gap-3"
      >
        <StatCard label="Routes Visited" value={totalRoutes} icon={Map} color="#38b2ac" />
        <StatCard label="Total Catches" value={totalCatches} icon={Heart} color="#22c55e" />
        <StatCard label="Soul Links" value={totalLinks} icon={Link2} color="#a855f7" />
        <StatCard label="Deaths" value={totalDeaths} icon={AlertTriangle} color="#ef4444" />
      </motion.div>

      {/* Player summaries */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Players</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {players.map((player) => {
            const playerCatches = catches.filter((c) => c.player_id === player.id)
            const playerDeaths = playerCatches.filter((c) => c.status === 'dead').length
            const playerPartySlots = partySlots.filter((ps) => ps.player_id === player.id)
            const partyMembers = playerPartySlots
              .sort((a, b) => a.slot - b.slot)
              .map((ps) => catches.find((c) => c.id === ps.catch_id))
              .filter(Boolean)

            return (
              <Card key={player.id} className="overflow-hidden">
                <div className="h-1" style={{ backgroundColor: player.color }} />
                <CardContent className="pt-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: player.color }} />
                      <span className="font-semibold text-text-primary">{player.name}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-text-muted">
                      <span>{playerCatches.filter(c => c.status === 'alive').length} alive</span>
                      {playerDeaths > 0 && (
                        <span className="text-red-400">{playerDeaths} dead</span>
                      )}
                    </div>
                  </div>

                  {/* Party preview */}
                  <div className="flex gap-1">
                    {Array.from({ length: 6 }).map((_, slot) => {
                      const member = partyMembers[slot] as any
                      return (
                        <div
                          key={slot}
                          className="w-10 h-10 rounded bg-elevated border border-border flex items-center justify-center"
                        >
                          {member ? (
                            <EvolvedCatchSprite
                              pokemonId={member.pokemon_id}
                              pokemonName={member.pokemon_name}
                              levelCap={levelCap}
                              size={36}
                              grayscale={member.status === 'dead'}
                            />
                          ) : (
                            <span className="text-text-muted text-xs">{slot + 1}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </motion.div>

      {/* Quick navigation */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Quick Access</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {quickLinks.map(({ label, icon: Icon, to, description }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-card border border-border hover:bg-elevated hover:border-border-light transition-all text-center group"
            >
              <Icon className="w-5 h-5 text-text-muted group-hover:text-accent-teal transition-colors" />
              <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">
                {label}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Recent activity */}
      {catches.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Recent Catches</h3>
          <Card>
            <div className="divide-y divide-border">
              {[...catches]
                .sort((a, b) => new Date(b.caught_at).getTime() - new Date(a.caught_at).getTime())
                .slice(0, 5)
                .map((c) => {
                  const player = players.find((p) => p.id === c.player_id)
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-2">
                      <EvolvedCatchSprite pokemonId={c.pokemon_id} pokemonName={c.pokemon_name} levelCap={levelCap} size={32} />
                      <div className="flex-1">
                        <span className="text-sm text-text-primary">{c.nickname ?? c.pokemon_name ?? 'Unknown'}</span>
                        <span className="text-xs text-text-muted ml-2">Lv. {levelCap ?? 5}</span>
                      </div>
                      {player && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${player.color}30`, color: player.color }}>
                          {player.name}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">{c.route_id.replace(/-/g, ' ')}</span>
                    </div>
                  )
                })}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Rules summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-text-muted" /> Active Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {activeRun.ruleset.sharedLives && <Badge variant="info">Shared Lives</Badge>}
              {activeRun.ruleset.dupeClause && <Badge variant="info">Dupe Clause</Badge>}
              {activeRun.ruleset.speciesClause && <Badge variant="info">Species Clause</Badge>}
              {activeRun.ruleset.nicknameRequired && <Badge variant="info">Nicknames Required</Badge>}
              {!activeRun.ruleset.typeOverlap && <Badge variant="warning">No Type Overlap</Badge>}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
