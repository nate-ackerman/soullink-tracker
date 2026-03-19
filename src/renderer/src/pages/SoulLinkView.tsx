import { useState } from 'react'
import { Link2, Skull, CheckCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { EvolvedCatchSprite } from '../components/pokemon/EvolvedCatchSprite'
import { useAppStore } from '../store/appStore'
import { getGameById } from '../data/games'
import type { SoulLink, Catch, Player } from '../types'

type FilterMode = 'all' | 'active' | 'broken'

function LinkRow({ link, catches, players, routeName, levelCap }: {
  link: SoulLink
  catches: Catch[]
  players: Player[]
  routeName: string
  levelCap: number | null
}) {
  const linkedCatches = link.catch_ids
    .map((cid) => catches.find((c) => c.id === cid))
    .filter(Boolean) as Catch[]
  const isBroken = link.status === 'broken'

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={isBroken ? 'border-red-800/50' : 'border-border'}>
        <CardContent className="py-3">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <Link2 className={`w-3.5 h-3.5 ${isBroken ? 'text-red-400' : 'text-accent-teal'}`} />
            <span className="text-xs font-medium text-text-secondary capitalize">{routeName}</span>
            {isBroken ? (
              <Badge variant="danger">Broken</Badge>
            ) : (
              <Badge variant="success">Active</Badge>
            )}
          </div>

          {/* Pokémon cards side by side */}
          <div className="flex items-center gap-3 flex-wrap">
            {linkedCatches.map((c, idx) => {
              const player = players.find((p) => p.id === c.player_id)
              const isDead = c.status === 'dead'
              return (
                <div key={c.id} className="flex items-center gap-2">
                  {idx > 0 && (
                    <div className={isBroken ? 'text-red-400' : 'text-accent-teal'}>
                      <Link2 className="w-3 h-3" />
                    </div>
                  )}
                  <div
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border ${
                      isDead ? 'border-red-800/40 bg-red-900/10' : 'border-border bg-elevated'
                    }`}
                    style={player ? { borderLeftColor: player.color, borderLeftWidth: 2 } : undefined}
                  >
                    <div className="relative">
                      <EvolvedCatchSprite
                        pokemonId={c.pokemon_id}
                        pokemonName={c.pokemon_name}
                        levelCap={levelCap}
                        size={48}
                        grayscale={isDead}
                      />
                      {isDead && (
                        <Skull className="absolute -top-1 -right-1 w-3.5 h-3.5 text-red-400" />
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-text-primary">
                        {c.nickname ?? c.pokemon_name ?? 'Unknown'}
                      </p>
                      {c.nickname && c.pokemon_name && (
                        <p className="text-[10px] text-text-muted capitalize">{c.pokemon_name}</p>
                      )}
                      <div className="flex flex-col items-center gap-0.5 mt-0.5">
                        <span className="text-[10px] text-text-secondary">Lv. {levelCap ?? 5}</span>
                        {player && (
                          <span className="text-[10px] px-1 rounded" style={{ color: player.color }}>
                            {player.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Broken note */}
          {isBroken && (
            <p className="text-xs text-red-400/80 mt-2 flex items-center gap-1">
              <Skull className="w-3 h-3" />
              All Pokémon in this soul link are unusable going forward.
              {linkedCatches.find((c) => c.died_route) && (
                <span className="text-text-muted ml-1">
                  Broke on: {linkedCatches.find((c) => c.died_route)?.died_route?.replace(/-/g, ' ')}
                </span>
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

export function SoulLinkView() {
  const { activeRun, catches, soulLinks, players, levelCap } = useAppStore()
  const [filter, setFilter] = useState<FilterMode>('all')

  if (!activeRun) return <div className="p-6 text-text-muted">No active run</div>

  const gameInfo = getGameById(activeRun.game)

  function getRouteName(routeId: string): string {
    return gameInfo?.routes.find((r) => r.id === routeId)?.name ?? routeId.replace(/-/g, ' ')
  }

  const active = soulLinks.filter((sl) => sl.status === 'active')
  const broken = soulLinks.filter((sl) => sl.status === 'broken')

  const filtered =
    filter === 'all' ? soulLinks
    : filter === 'active' ? active
    : broken

  const stats = { total: soulLinks.length, active: active.length, broken: broken.length }

  return (
    <div className="p-4 space-y-4">
      {/* Stats */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-card border border-border rounded-lg px-4 py-2 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-accent-teal" />
          <span className="text-sm font-medium text-text-primary">{stats.total}</span>
          <span className="text-xs text-text-muted">Total Links</span>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-2 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium text-text-primary">{stats.active}</span>
          <span className="text-xs text-text-muted">Active</span>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-2 flex items-center gap-2">
          <Skull className="w-4 h-4 text-red-400" />
          <span className="text-sm font-medium text-text-primary">{stats.broken}</span>
          <span className="text-xs text-text-muted">Broken</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'active', 'broken'] as FilterMode[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-xs font-medium capitalize border transition-colors ${
              filter === f
                ? 'bg-elevated border-border-light text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Broken'}
            <span className="ml-1.5 opacity-60">
              {f === 'all' ? stats.total : f === 'active' ? stats.active : stats.broken}
            </span>
          </button>
        ))}
      </div>

      {/* Links */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Link2 className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-40" />
          <p className="text-text-secondary text-sm">
            {soulLinks.length === 0
              ? 'No soul links yet'
              : `No ${filter} links`}
          </p>
          {soulLinks.length === 0 && (
            <p className="text-text-muted text-xs mt-1">
              When all players catch on the same route, a soul link forms automatically
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              catches={catches}
              players={players}
              routeName={getRouteName(link.route_id)}
              levelCap={levelCap}
            />
          ))}
        </div>
      )}
    </div>
  )
}
