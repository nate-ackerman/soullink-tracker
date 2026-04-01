import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Link2, Users, Skull, Sword, ChevronRight, Lock, CheckCircle, X } from 'lucide-react'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { TypeBadge } from '../components/pokemon/TypeBadge'
import { EvolvedCatchSprite } from '../components/pokemon/EvolvedCatchSprite'
import { useAppStore } from '../store/appStore'
import { useApi } from '../lib/useApi'
import { getGameById } from '../data/games'
import { usePokemonSpecies, useEvolutionChain, usePokemonByName } from '../api/pokeapi'
import { resolveEvolutionAtLevel } from '../utils/evolutionUtils'
import type { RouteInfo } from '../data/games'
import type { Catch, SoulLink } from '../types'

// ── Trainer sprite ────────────────────────────────────────────────────────────

function trainerSpriteKey(name: string): string {
  // For "A & B" or "A / B" names, use just the first person's sprite
  const primary = name.split(/[&/]/)[0]
  return primary
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function TrainerSprite({ name, size = 40 }: { name: string; size?: number }) {
  const [visible, setVisible] = useState(true)
  if (!visible) return null
  return (
    <img
      src={`https://play.pokemonshowdown.com/sprites/trainers/${trainerSpriteKey(name)}.png`}
      alt={name}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', objectFit: 'contain' }}
      onError={() => setVisible(false)}
    />
  )
}

// ── Party member cell (resolves evolution for learnset navigation) ────────────

function PartyMemberCell({ member, levelCap }: { member: Catch; levelCap: number | null }) {
  const navigate = useNavigate()
  const { data: speciesData } = usePokemonSpecies(member.pokemon_id ?? 0)
  const { data: chainData } = useEvolutionChain(speciesData?.evolution_chain?.url ?? '')
  const evolvedName = useMemo(() => {
    if (!chainData || levelCap === null || !member.pokemon_name) return ''
    const resolved = resolveEvolutionAtLevel(chainData.chain, member.pokemon_name, levelCap)
    return resolved !== member.pokemon_name ? resolved : ''
  }, [chainData, levelCap, member.pokemon_name])
  const { data: evolvedData } = usePokemonByName(evolvedName)
  const displayName = evolvedData?.name ?? member.pokemon_name

  return (
    <div
      onClick={() => displayName && navigate('/learnset', { state: { pokemon: displayName } })}
      className="aspect-square rounded bg-elevated border border-border flex items-center justify-center cursor-pointer hover:opacity-75 transition-opacity"
    >
      <EvolvedCatchSprite
        pokemonId={member.pokemon_id}
        pokemonName={member.pokemon_name}
        levelCap={levelCap}
        size={56}
        grayscale={member.status === 'dead'}
      />
    </div>
  )
}

// ── Route Progress Bar ────────────────────────────────────────────────────────

const EXCLUDED_ENCOUNTER_IDS = new Set([
  'ss-anne', 'silph-co',
  'indigo-plateau', 'indigo-plateau-johto',
  'pokemon-league-hoenn', 'pokemon-league-sinnoh', 'pokemon-league-unova', 'pokemon-league-b2w2',
  'team-rocket-hq', 'join-avenue', 'floaroma-meadow', 'mt-chimney',
])

interface RouteBarProps {
  succeeded: number
  failed: number
  accessible: number
  upcoming: number
  total: number
}

function RouteProgressBar({ succeeded, failed, accessible, upcoming, total }: RouteBarProps) {
  if (total === 0) return null
  const segments = [
    { key: 'succeeded', count: succeeded, label: 'Succeeded', color: '#22c55e' },
    { key: 'failed', count: failed, label: 'Failed', color: '#ef4444' },
    { key: 'accessible', count: accessible, label: 'Accessible', color: '#38b2ac' },
    { key: 'upcoming', count: upcoming, label: 'Upcoming', color: '#ecc94b' },
  ].filter((s) => s.count > 0)

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Encounters</p>
      <div className="flex h-3 rounded-full overflow-visible gap-px">
        {segments.map((seg, i) => (
          <div
            key={seg.key}
            className="relative group flex-shrink-0 transition-opacity hover:opacity-80 cursor-default"
            style={{
              width: `${(seg.count / total) * 100}%`,
              backgroundColor: seg.color,
              borderRadius: i === 0 ? '9999px 0 0 9999px' : i === segments.length - 1 ? '0 9999px 9999px 0' : '0',
            }}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 pointer-events-none">
              <div className="bg-elevated border border-border rounded px-2 py-1 text-xs text-text-primary whitespace-nowrap shadow-lg">
                <span className="font-bold" style={{ color: seg.color }}>{seg.count}</span>
                <span className="text-text-secondary ml-1">{seg.label}</span>
              </div>
              <div className="w-1.5 h-1.5 bg-elevated border-r border-b border-border rotate-45 mx-auto -mt-[3px]" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-[10px] text-text-muted">
        {[
          { label: 'Succeeded', color: '#22c55e', count: succeeded },
          { label: 'Failed', color: '#ef4444', count: failed },
          { label: 'Accessible', color: '#38b2ac', count: accessible },
          { label: 'Upcoming', color: '#ecc94b', count: upcoming },
        ].map(({ label, color, count }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
            <span>{count} {label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Mark Death Modal ──────────────────────────────────────────────────────────

interface MarkDeathModalProps {
  activeLinks: SoulLink[]
  prefillRoute?: string
  onConfirm: (linkId: string, route: string) => Promise<void>
  onClose: () => void
}

function MarkDeathModal({ activeLinks, prefillRoute, onConfirm, onClose }: MarkDeathModalProps) {
  const { catches, players, levelCap } = useAppStore()
  const [selectedLinkId, setSelectedLinkId] = useState<string>('')
  const [route, setRoute] = useState(prefillRoute ?? '')
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    if (!selectedLinkId || !route.trim()) return
    setSaving(true)
    const link = activeLinks.find((l) => l.id === selectedLinkId)
    if (link) {
      const aliveCatch = link.catch_ids
        .map((cid) => catches.find((c) => c.id === cid))
        .find((c) => c?.status === 'alive')
      if (aliveCatch) await onConfirm(aliveCatch.id, route.trim())
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg w-full max-w-sm mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-sm font-semibold text-text-primary">Mark a Death</p>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-3">
          {/* Soul link picker */}
          <div className="space-y-1 max-h-52 overflow-y-auto">
            {activeLinks.map((link) => {
              const members = link.catch_ids
                .map((cid) => catches.find((c) => c.id === cid))
                .filter(Boolean) as typeof catches
              return (
                <button
                  key={link.id}
                  onClick={() => setSelectedLinkId(link.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded border transition-colors text-left ${
                    selectedLinkId === link.id
                      ? 'border-accent-teal bg-accent-teal/10'
                      : 'border-border hover:border-border-light'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {members.map((m) => {
                      const player = players.find((p) => p.id === m.player_id)
                      return (
                        <div key={m.id} className="flex items-center gap-0.5">
                          <EvolvedCatchSprite
                            pokemonId={m.pokemon_id}
                            pokemonName={m.pokemon_name}
                            levelCap={levelCap}
                            size={28}
                          />
                          {player && (
                            <span className="text-[9px]" style={{ color: player.color }}>{player.name}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <span className="text-xs text-text-secondary ml-auto">
                    {members.map((m) => m.nickname ?? m.pokemon_name ?? '?').join(' & ')}
                  </span>
                </button>
              )
            })}
            {activeLinks.length === 0 && (
              <p className="text-xs text-text-muted text-center py-4">No active soul links</p>
            )}
          </div>

          {/* Route input */}
          <input
            type="text"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="e.g. Route 4, Victory Road"
            className="w-full text-xs bg-elevated border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-light"
            readOnly={!!prefillRoute}
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
              disabled={!selectedLinkId || !route.trim() || saving}
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

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export function RunDashboard() {
  const navigate = useNavigate()
  const {
    activeRun, activeRunId, players, catches, soulLinks, partySlots,
    loadRunData, levelCap, setLevelCap, battleRecords, refreshBattles,
    optimisticAddBattle, optimisticUpdateBattle,
  } = useAppStore()
  const api = useApi()

  const [showDeathModal, setShowDeathModal] = useState(false)
  const [deathPrefillRoute, setDeathPrefillRoute] = useState<string | undefined>()

  useEffect(() => {
    if (activeRunId) loadRunData(activeRunId)
  }, [activeRunId])

  // Derive level cap from battle progression whenever run or battles change
  useEffect(() => {
    if (!activeRun) return
    const gameInfo = getGameById(activeRun.game)
    const modifier = activeRun.ruleset.trainerLevelModifier ?? 100
    const leaders = [...(gameInfo?.gymLeaders ?? [])].sort((a, b) => a.levelCap - b.levelCap)
    if (leaders.length === 0) return
    const adj = (base: number) => Math.round(base * modifier / 100)

    // Use victory count as a position index into the sorted leader list.
    // This correctly handles duplicate level caps and same-named leaders.
    const completedCount = battleRecords.filter((b) => b.outcome === 'victory').length
    const next = leaders[completedCount]
    if (next) {
      setLevelCap(adj(next.levelCap))
    } else if (leaders.length > 0) {
      // All fights done — hold at the champion's cap
      setLevelCap(adj(leaders[leaders.length - 1].levelCap))
    }
  }, [activeRunId, battleRecords])

  if (!activeRun) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <p className="text-text-secondary">No active run selected</p>
          <button onClick={() => navigate('/')} className="text-sm text-accent-teal hover:underline">
            Go to Home
          </button>
        </div>
      </div>
    )
  }

  const gameInfo = getGameById(activeRun.game)
  const modifier = activeRun.ruleset.trainerLevelModifier ?? 100
  const gymLeaders = [...(gameInfo?.gymLeaders ?? [])].sort((a, b) => a.levelCap - b.levelCap)
  const adjustedCap = (base: number) => Math.round(base * modifier / 100)

  const pendingBattle = battleRecords.find((b) => b.outcome === 'pending') ?? null
  const pastBattles = battleRecords.filter((b) => b.outcome === 'victory')

  // Next gym: index by victory count — handles duplicate level caps and same-named leaders correctly
  const completedCount = battleRecords.filter((b) => b.outcome === 'victory').length
  const nextGym = gymLeaders[completedCount] ?? null

  // Route progress stats
  const allRoutes: RouteInfo[] = [
    ...(gameInfo?.routes ?? []).filter((r) => !EXCLUDED_ENCOUNTER_IDS.has(r.id) && !(activeRun.ruleset.hiddenEncounters ?? []).includes(r.id)),
    ...(activeRun.ruleset.addedEncounters ?? []),
  ]
  const sortedLeadersForBar = [...gymLeaders] // already sorted above
  const hasGatingForBar = sortedLeadersForBar.some((g) => (g.locations?.length ?? 0) > 0)

  function getAccessForBar(routeId: string): 'accessible' | 'completed' | 'inaccessible' | 'ungated' {
    if (!hasGatingForBar) return 'ungated'
    for (let i = 0; i < sortedLeadersForBar.length; i++) {
      if ((sortedLeadersForBar[i].locations ?? []).some((l) => l.id === routeId)) {
        if (i < completedCount) return 'completed'
        if (i === completedCount) return 'accessible'
        return 'inaccessible'
      }
    }
    return 'ungated'
  }

  function getStatusForBar(routeId: string): 'empty' | 'failed' | 'logged' {
    const rc = catches.filter((c) => c.route_id === routeId)
    if (rc.length === 0) return 'empty'
    if (rc.some((c) => c.status === 'failed')) return 'failed'
    return 'logged'
  }

  const barSucceeded = allRoutes.filter((r) => getAccessForBar(r.id) !== 'inaccessible' && getStatusForBar(r.id) === 'logged').length
  const barFailed = allRoutes.filter((r) => getAccessForBar(r.id) !== 'inaccessible' && getStatusForBar(r.id) === 'failed').length
  const barAccessible = allRoutes.filter((r) => getAccessForBar(r.id) !== 'inaccessible' && getStatusForBar(r.id) === 'empty').length
  const barUpcoming = allRoutes.filter((r) => getAccessForBar(r.id) === 'inaccessible').length

  // Stats
  const activeLinks = soulLinks.filter((sl) => sl.status === 'active')
  const brokenLinks = soulLinks.filter((sl) => sl.status === 'broken').length

  // Links that have at least one member currently in the party (for battle death modal)
  const partyCatchIds = new Set(partySlots.map((ps) => ps.catch_id))
  const partyActiveLinks = activeLinks.filter((sl) =>
    sl.catch_ids.some((cid) => partyCatchIds.has(cid))
  )

  // Recent dead soul links — sorted by most recent death within each link
  const recentDeadLinks = [...soulLinks]
    .filter((sl) => sl.status === 'broken')
    .map((sl) => {
      const linkedCatches = sl.catch_ids
        .map((cid) => catches.find((c) => c.id === cid))
        .filter(Boolean) as typeof catches
      const latestDeath = Math.max(
        ...linkedCatches.filter((c) => c.status === 'dead').map((c) => new Date(c.died_at ?? 0).getTime())
      )
      const diedRoute = linkedCatches.find((c) => c.died_route)?.died_route ?? null
      return { sl, linkedCatches, latestDeath, diedRoute }
    })
    .sort((a, b) => b.latestDeath - a.latestDeath)
    .slice(0, 3)

  async function handleLockIn() {
    if (!activeRun || !nextGym || pendingBattle) return
    const snapshot = players.map((player) => {
      const slots = partySlots
        .filter((ps) => ps.player_id === player.id)
        .map((ps) => ({ slot: ps.slot, catch_id: ps.catch_id }))
      return { player_id: player.id, slots }
    })
    const now = new Date().toISOString()
    optimisticAddBattle({
      id: `optimistic-${crypto.randomUUID()}`,
      run_id: activeRun.id,
      gym_leader_name: nextGym.name,
      level_cap: adjustedCap(nextGym.levelCap),
      party_snapshot: snapshot,
      outcome: 'pending',
      created_at: now,
      completed_at: null,
    })
    await api.battles.create({
      run_id: activeRun.id,
      gym_leader_name: nextGym.name,
      level_cap: adjustedCap(nextGym.levelCap),
      party_snapshot: snapshot
    })
    await refreshBattles()
  }

  async function handleCompleteBattle() {
    if (!pendingBattle || !activeRunId) return
    optimisticUpdateBattle(pendingBattle.id, { outcome: 'victory', completed_at: new Date().toISOString() })
    await api.battles.update(pendingBattle.id, { outcome: 'victory' })
    await refreshBattles()
    // Auto-fail the run if every party slot is dead after the battle
    const allPartyDead = partySlots.length > 0 && partySlots.every((ps) => {
      const c = catches.find((x) => x.id === ps.catch_id)
      return c?.status === 'dead'
    })
    if (allPartyDead) {
      await api.runs.update(activeRunId, { status: 'failed' })
      if (activeRunId) await loadRunData(activeRunId)
    }
  }

  async function handleMarkDeath(catchId: string, route: string) {
    await api.catches.kill(catchId, route)
    if (activeRunId) await loadRunData(activeRunId)
  }

  function openBattleDeath() {
    setDeathPrefillRoute(pendingBattle?.gym_leader_name)
    setShowDeathModal(true)
  }

  function openWildDeath() {
    setDeathPrefillRoute(undefined)
    setShowDeathModal(true)
  }

  return (
    <div className="p-5 space-y-5 max-w-5xl mx-auto">

      {/* Run header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-text-primary">{activeRun.name}</h2>
            <div className="flex items-center gap-2 mt-1 text-sm text-text-muted">
              <span className="text-text-secondary">{gameInfo?.name ?? activeRun.game}</span>
              <span>·</span>
              <span>Gen {activeRun.generation}</span>
              <span>·</span>
              <span>{players.map((p) => p.name).join(' & ')}</span>
              <span>·</span>
              <span>Since {new Date(activeRun.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <Badge variant={activeRun.status === 'active' ? 'success' : activeRun.status === 'failed' ? 'danger' : 'info'}>
            {activeRun.status}
          </Badge>
        </div>
      </motion.div>

      {/* Stat row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 gap-3"
      >
        {[
          { label: 'Active Links', value: activeLinks.length, color: '#38b2ac' },
          { label: 'Broken Links', value: brokenLinks, color: brokenLinks > 0 ? '#f97316' : '#6b7280' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold" style={{ color }}>{value}</p>
              <p className="text-xs text-text-muted mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Encounter progress bar */}
      {allRoutes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="px-1"
        >
          <RouteProgressBar
            succeeded={barSucceeded}
            failed={barFailed}
            accessible={barAccessible}
            upcoming={barUpcoming}
            total={allRoutes.length}
          />
        </motion.div>
      )}

      {/* Main content grid */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-4"
      >
        {/* Left column */}
        <div className="col-span-2 space-y-4">

          {/* Upcoming Battle */}
          {(nextGym || pendingBattle) && (
            <Card className="border-accent-gold/30 bg-accent-gold/5">
              <CardContent className="py-3">
                <div className="flex items-center gap-2 mb-3">
                  <Sword className="w-3.5 h-3.5 text-accent-gold" />
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Upcoming Battle
                  </span>
                  {pendingBattle && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Locked
                    </span>
                  )}
                </div>

                {(() => {
                  const battle = pendingBattle
                    ? gymLeaders.find((g) => g.name === pendingBattle.gym_leader_name) ?? null
                    : nextGym ?? null
                  const displayName = pendingBattle?.gym_leader_name ?? battle?.name ?? ''
                  const displayCap = pendingBattle?.level_cap ?? (battle ? adjustedCap(battle.levelCap) : 0)
                  const displayCity = battle?.city ?? ''
                  const displayTypes = battle?.types ?? []
                  const displayKind = battle?.kind

                  return (
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <TrainerSprite name={displayName} size={48} />
                        <div>
                          <p className={`text-base font-bold ${
                            displayKind === 'champion' ? 'text-accent-gold' :
                            displayKind === 'elite4' ? 'text-purple-400' :
                            displayKind === 'rival' ? 'text-blue-400' :
                            displayKind === 'boss' ? 'text-red-400' :
                            'text-text-primary'
                          }`}>{displayName}</p>
                          {displayCity && <p className="text-xs text-text-muted">{displayCity}</p>}
                          {displayTypes.length > 0 && (
                            <div className="flex gap-1 mt-1.5">
                              {displayTypes.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-accent-gold">Lv. {displayCap}</p>
                        <p className="text-xs text-text-muted">Ace Level</p>
                      </div>
                    </div>
                  )
                })()}

                {/* Actions */}
                {pendingBattle ? (
                  <div className="flex gap-2">
                    <button
                      onClick={openBattleDeath}
                      className="flex-1 py-2 text-xs rounded border border-red-700/40 bg-red-900/30 text-red-300 hover:bg-red-900/50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Skull className="w-3 h-3" /> Mark a Death
                    </button>
                    <button
                      onClick={handleCompleteBattle}
                      className="flex-1 py-2 text-xs rounded border border-green-700/40 bg-green-900/30 text-green-300 hover:bg-green-900/50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-3 h-3" /> Complete Battle
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleLockIn}
                    className="w-full py-2 text-xs rounded border border-accent-gold/30 bg-accent-gold/10 text-accent-gold hover:bg-accent-gold/20 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3 h-3" /> Lock in Party
                  </button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Wild death button (always shown when there are active links) */}
          {activeLinks.length > 0 && (
            <button
              onClick={openWildDeath}
              className="w-full py-2 text-xs rounded border border-border text-text-muted hover:text-red-300 hover:border-red-700/40 hover:bg-red-900/20 transition-colors flex items-center justify-center gap-1.5"
            >
              <Skull className="w-3 h-3" /> Mark Wild / Route Death
            </button>
          )}

          {/* Upcoming fights */}
          {gymLeaders.length > completedCount && (
            <Card>
              <CardContent className="py-3">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Upcoming Fights</p>
                <div className="space-y-1">
                  {gymLeaders.slice(completedCount).map((leader, i) => (
                    <div key={`upcoming-${i}`} className="flex items-center gap-2 px-1 py-1">
                      <TrainerSprite name={leader.name} size={28} />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs text-text-secondary font-medium">{leader.name}</span>
                        <span className="text-[10px] text-text-muted ml-1.5">Lv.{adjustedCap(leader.levelCap)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent deaths */}
          {recentDeadLinks.length > 0 && (
            <Card className="border-red-900/30">
              <CardContent className="py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Skull className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Recent Deaths</span>
                </div>
                <div className="space-y-1">
                  {recentDeadLinks.map(({ sl, linkedCatches, diedRoute }) => (
                    <div key={sl.id} className="flex items-center gap-2 px-1 py-1">
                      <div className="flex items-center gap-1">
                        {linkedCatches.map((c, i) => (
                          <div key={c.id} className="flex items-center gap-1">
                            {i > 0 && <Link2 className="w-2.5 h-2.5 text-red-400/60" />}
                            <EvolvedCatchSprite
                              pokemonId={c.pokemon_id}
                              pokemonName={c.pokemon_name}
                              levelCap={levelCap}
                              size={28}
                              grayscale
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-text-secondary truncate">
                          {linkedCatches[0]?.nickname ?? linkedCatches.map((c) => c.pokemon_name ?? 'Unknown').join(' & ')}
                        </p>
                        {linkedCatches[0]?.nickname && (
                          <p className="text-[10px] text-text-muted capitalize truncate">
                            {linkedCatches.map((c) => c.pokemon_name ?? '?').join(' & ')}
                          </p>
                        )}
                        {diedRoute && (
                          <p className="text-[10px] text-text-muted">on {diedRoute}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: parties */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Parties</p>
          {players.map((player) => {
            const playerSlots = partySlots
              .filter((ps) => ps.player_id === player.id)
              .sort((a, b) => a.slot - b.slot)
            const partyMembers = [0, 1, 2, 3, 4, 5].map((slot) => {
              const ps = playerSlots.find((s) => s.slot === slot)
              return ps ? catches.find((c) => c.id === ps.catch_id) : undefined
            })
            return (
              <Card key={player.id} className="overflow-hidden">
                <div className="h-1" style={{ backgroundColor: player.color }} />
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center mb-2 gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: player.color }} />
                    <span className="text-sm font-semibold text-text-primary">{player.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {partyMembers.map((member, slot) => (
                      member ? (
                        <PartyMemberCell key={slot} member={member} levelCap={levelCap} />
                      ) : (
                        <div key={slot} className="aspect-square rounded bg-elevated border border-border flex items-center justify-center">
                          <span className="text-[10px] text-text-muted opacity-40">{slot + 1}</span>
                        </div>
                      )
                    ))}
                  </div>
                  <button
                    onClick={() => navigate('/party')}
                    className="w-full mt-2 text-[10px] text-text-muted hover:text-accent-teal transition-colors text-center"
                  >
                    Manage party →
                  </button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </motion.div>

      {/* Mark Death Modal */}
      {showDeathModal && (
        <MarkDeathModal
          activeLinks={deathPrefillRoute ? partyActiveLinks : activeLinks}
          prefillRoute={deathPrefillRoute}
          onConfirm={async (catchId, route) => {
            await handleMarkDeath(catchId, route)
            setShowDeathModal(false)
          }}
          onClose={() => setShowDeathModal(false)}
        />
      )}
    </div>
  )
}
