import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2, Skull, CheckCircle, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { EvolvedCatchSprite } from '../components/pokemon/EvolvedCatchSprite'
import { useAppStore } from '../store/appStore'
import { getGameById } from '../data/games'
import { usePokemonSpecies, useEvolutionChain, usePokemonByName } from '../api/pokeapi'
import { resolveEvolutionAtLevel } from '../utils/evolutionUtils'
import type { SoulLink, Catch, Player } from '../types'

type FilterMode = 'all' | 'active' | 'broken'

function LinkedPokemonMiniCard({ c, player, levelCap, isBroken }: {
  c: Catch
  player: Player | undefined
  levelCap: number | null
  isBroken: boolean
}) {
  const navigate = useNavigate()
  const isDead = c.status === 'dead'

  const { data: speciesData } = usePokemonSpecies(c.pokemon_id ?? 0)
  const { data: chainData } = useEvolutionChain(speciesData?.evolution_chain?.url ?? '')
  const evolvedName = useMemo(() => {
    if (!chainData || levelCap === null || !c.pokemon_name) return ''
    const resolved = resolveEvolutionAtLevel(chainData.chain, c.pokemon_name, levelCap)
    return resolved !== c.pokemon_name ? resolved : ''
  }, [chainData, levelCap, c.pokemon_name])
  const { data: evolvedData } = usePokemonByName(evolvedName)
  const displayName = evolvedData?.name ?? c.pokemon_name

  return (
    <div
      onClick={() => displayName && navigate('/learnset', { state: { pokemon: displayName } })}
      className={`flex flex-col items-center gap-1 p-2 rounded-lg border w-[7rem] cursor-pointer transition-opacity hover:opacity-75 ${
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
        <p className="text-xs font-medium text-text-primary capitalize">
          {c.pokemon_name ?? 'Unknown'}
        </p>
        {player && (
          <span className="text-[10px] px-1 rounded mt-0.5" style={{ color: player.color }}>
            {player.name}
          </span>
        )}
      </div>
    </div>
  )
}

function LinkRow({ link, catches, players, routeName, levelCap, onMarkDeath }: {
  link: SoulLink
  catches: Catch[]
  players: Player[]
  routeName: string
  levelCap: number | null
  onMarkDeath?: () => void
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

          {/* Shared nickname */}
          {linkedCatches[0]?.nickname && (
            <p className="text-xs font-semibold text-text-primary mb-2">"{linkedCatches[0].nickname}"</p>
          )}

          {/* Pokémon cards side by side */}
          <div className="flex items-center gap-3 flex-wrap">
            {linkedCatches.map((c, idx) => {
              const player = players.find((p) => p.id === c.player_id)
              return (
                <div key={c.id} className="flex items-center gap-2">
                  {idx > 0 && (
                    <div className={isBroken ? 'text-red-400' : 'text-accent-teal'}>
                      <Link2 className="w-3 h-3" />
                    </div>
                  )}
                  <LinkedPokemonMiniCard c={c} player={player} levelCap={levelCap} isBroken={isBroken} />
                </div>
              )
            })}
          </div>

          {/* Broken note */}
          {isBroken && (
            <p className="mt-2 w-full py-1.5 text-[11px] rounded border border-transparent text-red-400/70 flex items-center justify-center gap-1">
              <Skull className="w-2.5 h-2.5" />
              All Pokémon in this soul link are unusable going forward.
            </p>
          )}

          {/* Mark Death button for active links */}
          {!isBroken && onMarkDeath && (
            <button
              onClick={onMarkDeath}
              className="mt-2 w-full py-1.5 text-[11px] rounded border border-red-800/30 text-red-400/70 hover:bg-red-900/20 hover:text-red-300 transition-colors flex items-center justify-center gap-1"
            >
              <Skull className="w-2.5 h-2.5" /> Mark Death
            </button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Mark Death Modal (route-only, link pre-selected) ──────────────────────────

interface DeathModalProps {
  link: SoulLink
  catches: Catch[]
  players: Player[]
  levelCap: number | null
  onConfirm: (catchId: string, route: string) => Promise<void>
  onClose: () => void
}

function DeathModal({ link, catches, players, levelCap, onConfirm, onClose }: DeathModalProps) {
  const [route, setRoute] = useState('')
  const [saving, setSaving] = useState(false)

  const members = link.catch_ids
    .map((cid) => catches.find((c) => c.id === cid))
    .filter(Boolean) as Catch[]

  async function handleConfirm() {
    if (!route.trim()) return
    setSaving(true)
    const aliveCatch = members.find((c) => c.status === 'alive')
    if (aliveCatch) await onConfirm(aliveCatch.id, route.trim())
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg w-full max-w-xs mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-sm font-semibold text-text-primary">Mark Death</p>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-3">
          {/* Show linked members */}
          <div className="flex items-center gap-2 justify-center py-1">
            {members.map((m, idx) => {
              const player = players.find((p) => p.id === m.player_id)
              return (
                <div key={m.id} className="flex items-center gap-1.5">
                  {idx > 0 && <Link2 className="w-3 h-3 text-text-muted" />}
                  <div className="flex flex-col items-center">
                    <EvolvedCatchSprite
                      pokemonId={m.pokemon_id}
                      pokemonName={m.pokemon_name}
                      levelCap={levelCap}
                      size={32}
                    />
                    <span className="text-[9px] text-text-muted mt-0.5">
                      {m.nickname ?? m.pokemon_name ?? '?'}
                    </span>
                    {player && (
                      <span className="text-[9px]" style={{ color: player.color }}>{player.name}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <input
            type="text"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="e.g. Route 4, Victory Road"
            autoFocus
            className="w-full text-xs bg-elevated border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-light"
          />

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 text-xs rounded border border-border text-text-secondary hover:bg-elevated transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!route.trim() || saving}
              className="flex-1 py-2 text-xs rounded bg-red-900/60 border border-red-700/40 text-red-300 hover:bg-red-900/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Confirm Death'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function SoulLinkView() {
  const { activeRun, activeRunId, catches, soulLinks, players, levelCap, loadRunData } = useAppStore()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [deathLink, setDeathLink] = useState<SoulLink | null>(null)

  if (!activeRun) return <div className="p-6 text-text-muted">No active run</div>

  const gameInfo = getGameById(activeRun.game)

  const renamedEncounters = activeRun.ruleset.renamedEncounters ?? {}
  const addedEncounters = activeRun.ruleset.addedEncounters ?? []

  function getRouteName(routeId: string): string {
    if (renamedEncounters[routeId]) return renamedEncounters[routeId]
    const custom = addedEncounters.find((r) => r.id === routeId)
    if (custom) return custom.name
    return gameInfo?.routes.find((r) => r.id === routeId)?.name ?? routeId.replace(/-/g, ' ')
  }

  const active = soulLinks.filter((sl) => sl.status === 'active')
  const broken = soulLinks.filter((sl) => sl.status === 'broken')

  const filtered =
    filter === 'all' ? soulLinks
    : filter === 'active' ? active
    : broken

  const stats = { total: soulLinks.length, active: active.length, broken: broken.length }

  async function handleMarkDeath(catchId: string, route: string) {
    await window.api.catches.kill(catchId, route)
    if (activeRunId) await loadRunData(activeRunId)
    setDeathLink(null)
  }

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
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
          {filtered.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              catches={catches}
              players={players}
              routeName={getRouteName(link.route_id)}
              levelCap={levelCap}
              onMarkDeath={link.status === 'active' ? () => setDeathLink(link) : undefined}
            />
          ))}
        </div>
      )}

      {/* Death Modal */}
      {deathLink && (
        <DeathModal
          link={deathLink}
          catches={catches}
          players={players}
          levelCap={levelCap}
          onConfirm={handleMarkDeath}
          onClose={() => setDeathLink(null)}
        />
      )}
    </div>
  )
}
