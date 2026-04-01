import { useState, useEffect, useRef } from 'react'
import { Search, Plus, Link2, Skull, XCircle, CheckCircle, Clock, Pencil, RotateCcw, X, Settings2, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Card, CardContent } from '../components/ui/Card'
import { ScrollArea } from '../components/ui/ScrollArea'
import { PokemonSprite } from '../components/pokemon/PokemonSprite'
import { StatusBadge } from '../components/pokemon/StatusBadge'
import { useAppStore } from '../store/appStore'
import { useApi } from '../lib/useApi'
import { getGameById } from '../data/games'
import type { RouteInfo } from '../data/games'
import { usePokemonByName } from '../api/pokeapi'
import { PokemonAutocomplete } from '../components/pokemon/PokemonAutocomplete'
import { EditPokemonModal } from '../components/pokemon/EditPokemonModal'
import type { Catch, Player, Ruleset } from '../types'

// ── Encounter filter ──────────────────────────────────────────────────────────

const NON_ENCOUNTER_IDS = new Set([
  'ss-anne', 'silph-co',
  'indigo-plateau', 'indigo-plateau-johto',
  'pokemon-league-hoenn', 'pokemon-league-sinnoh', 'pokemon-league-unova', 'pokemon-league-b2w2',
  'team-rocket-hq',
  'join-avenue',
  'floaroma-meadow',
  'mt-chimney',
])

function isDefaultEncounter(id: string): boolean {
  if (NON_ENCOUNTER_IDS.has(id)) return false
  return true
}

// ── Route status helpers ──────────────────────────────────────────────────────

type RouteStatus = 'empty' | 'pending' | 'linked' | 'failed'

function playerHasLogged(playerId: string, routeId: string, catches: Catch[]): boolean {
  return catches.some((c) => c.player_id === playerId && c.route_id === routeId)
}

// ── Log catch modal ───────────────────────────────────────────────────────────

interface LogCatchModalProps {
  open: boolean
  onClose: () => void
  routeId: string
  player: Player
  runId: string
  defaultLevel: number
  onSaved: () => void
}

function LogCatchModal({ open, onClose, routeId, player, runId, defaultLevel, onSaved }: LogCatchModalProps) {
  const [pokemonName, setPokemonName] = useState('')
  const [pokemonId, setPokemonId] = useState<number | undefined>()
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const api = useApi()
  const { optimisticAddCatch } = useAppStore()

  const { data: resolved } = usePokemonByName(pokemonName)

  async function handleSubmit() {
    if (!pokemonName) return
    setLoading(true)
    try {
      const resolvedId = resolved?.id ?? pokemonId
      // Show the catch immediately; refreshCatches() will reconcile the real server row.
      optimisticAddCatch({
        id: `optimistic-${crypto.randomUUID()}`,
        run_id: runId, player_id: player.id, route_id: routeId,
        pokemon_id: resolvedId ?? null, pokemon_name: pokemonName,
        level: defaultLevel, notes: notes || null,
        status: 'alive', nickname: null, died_route: null, died_at: null,
        caught_at: new Date().toISOString(),
      })
      onClose()
      setPokemonName(''); setPokemonId(undefined); setNotes('')
      await api.catches.create({
        run_id: runId, player_id: player.id, route_id: routeId,
        pokemon_id: resolvedId, pokemon_name: pokemonName || undefined,
        level: defaultLevel, notes: notes || undefined
      })
      onSaved()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={`Log Catch — ${player.name}`}>
      <div className="space-y-3">
        <PokemonAutocomplete
          value={pokemonName}
          onChange={(name, id) => { setPokemonName(name); if (id) setPokemonId(id) }}
        />
        <Input
          label="Notes"
          placeholder="Optional"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!pokemonName} className="flex-1">
            <Plus className="w-4 h-4" /> Save Catch
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Kill modal ────────────────────────────────────────────────────────────────

function KillModal({
  open, onClose, catch_, routeId, onKilled
}: {
  open: boolean; onClose: () => void; catch_: Catch | null; routeId: string; onKilled: () => void
}) {
  const [loading, setLoading] = useState(false)
  const api = useApi()
  if (!catch_) return null

  async function handleKill() {
    setLoading(true)
    try {
      await api.catches.kill(catch_!.id, routeId)
      onKilled()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Mark as Fainted">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Mark <strong className="text-text-primary">{catch_.nickname ?? catch_.pokemon_name}</strong> as fainted?
        </p>
        <p className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded p-2">
          All soul-linked partners will also be marked as fainted and removed from all parties.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="danger" onClick={handleKill} loading={loading} className="flex-1">
            <Skull className="w-4 h-4" /> Confirm Faint
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Fail encounter modal ──────────────────────────────────────────────────────

function FailEncounterModal({
  open, onClose, player, routeName, runId, routeId, onFailed
}: {
  open: boolean; onClose: () => void; player: Player; routeName: string
  runId: string; routeId: string; onFailed: () => void
}) {
  const [loading, setLoading] = useState(false)
  const api = useApi()

  async function handleFail() {
    setLoading(true)
    try {
      await api.catches.failEncounter(runId, player.id, routeId)
      onFailed()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Failed Encounter">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Mark <strong className="text-text-primary">{player.name}</strong>'s encounter on{' '}
          <strong className="text-text-primary">{routeName}</strong> as failed?
        </p>
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded p-2">
          This will mark the route as failed for all players. Any Pokémon already caught on this
          route by other players will become unusable, and no soul link can be formed here.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="danger" onClick={handleFail} loading={loading} className="flex-1">
            <XCircle className="w-4 h-4" /> Confirm Failed
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Manage encounters modal ───────────────────────────────────────────────────

function ManageEncountersModal({
  open, onClose, gameRoutes, ruleset, onSave
}: {
  open: boolean
  onClose: () => void
  gameRoutes: RouteInfo[]
  ruleset: Ruleset
  onSave: (updates: Partial<Ruleset>) => Promise<void>
}) {
  const [localHidden, setLocalHidden] = useState<string[]>([])
  const [localAdded, setLocalAdded] = useState<{ id: string; name: string }[]>([])
  const [localRenamed, setLocalRenamed] = useState<Record<string, string>>({})
  const [newEncounterName, setNewEncounterName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setLocalHidden(ruleset.hiddenEncounters ?? [])
      setLocalAdded(ruleset.addedEncounters ?? [])
      setLocalRenamed(ruleset.renamedEncounters ?? {})
      setNewEncounterName('')
      setSearch('')
      setEditingId(null)
    }
  }, [open])

  const defaultEncounterRoutes = gameRoutes.filter((r) => isDefaultEncounter(r.id))
  const filtered = defaultEncounterRoutes.filter((r) =>
    (localRenamed[r.id] ?? r.name).toLowerCase().includes(search.toLowerCase())
  )

  function toggleHide(id: string) {
    setLocalHidden((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function startRename(id: string, currentName: string) {
    setEditingId(id)
    setEditingName(currentName)
  }

  function commitRename(id: string) {
    if (editingName.trim()) {
      setLocalRenamed((prev) => ({ ...prev, [id]: editingName.trim() }))
    }
    setEditingId(null)
  }

  function resetRename(id: string) {
    setLocalRenamed((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setEditingId(null)
  }

  function addCustomEncounter() {
    if (!newEncounterName.trim()) return
    const id = `custom-${Date.now()}`
    setLocalAdded((prev) => [...prev, { id, name: newEncounterName.trim() }])
    setNewEncounterName('')
  }

  async function handleSave() {
    setSaving(true)
    await onSave({
      hiddenEncounters: localHidden,
      addedEncounters: localAdded,
      renamedEncounters: localRenamed,
    })
    setSaving(false)
    onClose()
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Manage Encounters" size="lg">
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            className="w-full bg-input border border-border rounded pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-border-light"
            placeholder="Search encounters..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded divide-y divide-border">
          {filtered.map((route) => {
            const isHidden = localHidden.includes(route.id)
            const displayName = localRenamed[route.id] ?? route.name
            const isEditing = editingId === route.id

            return (
              <div key={route.id} className="flex items-center gap-2 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => toggleHide(route.id)}
                  className="w-3.5 h-3.5 rounded shrink-0"
                />
                {isEditing ? (
                  <input
                    autoFocus
                    className="flex-1 bg-input border border-border rounded px-2 py-0.5 text-xs"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => commitRename(route.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(route.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                  />
                ) : (
                  <span className={`flex-1 text-xs truncate ${isHidden ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                    {displayName}
                    {localRenamed[route.id] && (
                      <span className="text-text-muted ml-1">({route.name})</span>
                    )}
                  </span>
                )}
                <button
                  onClick={() => localRenamed[route.id] ? resetRename(route.id) : startRename(route.id, displayName)}
                  className="shrink-0 p-0.5 text-text-muted hover:text-text-primary transition-colors"
                  title={localRenamed[route.id] ? 'Reset name' : 'Rename'}
                >
                  {localRenamed[route.id] ? <RotateCcw className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                </button>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-text-muted text-center py-3">No encounters found</p>
          )}
        </div>

        {localAdded.length > 0 && (
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Custom Encounters</p>
            <div className="border border-border rounded divide-y divide-border">
              {localAdded.map((enc) => (
                <div key={enc.id} className="flex items-center gap-2 px-2 py-1.5">
                  <span className="flex-1 text-xs text-text-primary">{enc.name}</span>
                  <button
                    onClick={() => setLocalAdded((prev) => prev.filter((r) => r.id !== enc.id))}
                    className="shrink-0 p-0.5 text-text-muted hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 shrink-0">
          <input
            className="flex-1 bg-input border border-border rounded px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
            placeholder="Add custom encounter (e.g. Hidden Grotto)"
            value={newEncounterName}
            onChange={(e) => setNewEncounterName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomEncounter()}
          />
          <Button size="sm" variant="secondary" onClick={addCustomEncounter} disabled={!newEncounterName.trim()}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex gap-2 pt-1 border-t border-border shrink-0">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} loading={saving} className="flex-1">Save Changes</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Route status badge ────────────────────────────────────────────────────────

function RouteStatusBadge({ status }: { status: RouteStatus }) {
  if (status === 'empty') return null
  if (status === 'pending') return (
    <span className="flex items-center gap-1 text-[10px] text-yellow-400">
      <Clock className="w-2.5 h-2.5" /> Pending
    </span>
  )
  if (status === 'linked') return (
    <span className="flex items-center gap-1 text-[10px] text-accent-teal">
      <Link2 className="w-2.5 h-2.5" /> Linked
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-[10px] text-red-400">
      <XCircle className="w-2.5 h-2.5" /> Failed
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function RouteTracker() {
  const {
    activeRun, players, catches, soulLinks, activeRunId, levelCap, battleRecords,
    refreshRun, refreshCatches, refreshSoulLinks, refreshParty,
    optimisticAddCatch, optimisticUpdateCatch, optimisticUpdateNickname,
  } = useAppStore()
  const api = useApi()
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [logModal, setLogModal] = useState<{ open: boolean; playerId: string }>({ open: false, playerId: '' })
  const [killModal, setKillModal] = useState<{ open: boolean; catch_: Catch | null }>({ open: false, catch_: null })
  const [failModal, setFailModal] = useState<{ open: boolean; playerId: string }>({ open: false, playerId: '' })
  const [editModal, setEditModal] = useState<{ open: boolean; catch_: Catch | null }>({ open: false, catch_: null })
  const [manageModal, setManageModal] = useState(false)
  const [linkNickname, setLinkNickname] = useState('')
  const [savingNick, setSavingNick] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)

  // Sync nickname field and reset clear confirm when navigating between routes
  useEffect(() => {
    const existing = catches
      .filter((c) => c.route_id === selectedRoute && c.status !== 'failed')
      .find((c) => c.nickname)?.nickname ?? ''
    setLinkNickname(existing)
    setClearConfirm(false)
  }, [selectedRoute, catches])

  if (!activeRun) return <div className="p-6 text-text-muted">No active run</div>

  const defaultLevel = levelCap ?? 5

  const gameInfo = getGameById(activeRun.game)
  const gameRoutes = gameInfo?.routes.sort((a, b) => a.order - b.order) ?? []
  const hiddenEncounters = activeRun.ruleset.hiddenEncounters ?? []
  const addedEncounters = activeRun.ruleset.addedEncounters ?? []
  const renamedEncounters = activeRun.ruleset.renamedEncounters ?? {}

  // Build the displayed route list: filtered defaults + custom encounters
  const routes: RouteInfo[] = [
    ...gameRoutes
      .filter((r) => isDefaultEncounter(r.id) && !hiddenEncounters.includes(r.id))
      .map((r) => ({ ...r, name: renamedEncounters[r.id] ?? r.name })),
    ...addedEncounters.map((r) => ({ ...r, order: 9999, name: renamedEncounters[r.id] ?? r.name })),
  ]

  const filteredRoutes = routes.filter((r) => {
    const q = searchQuery.toLowerCase()
    if (!q) return true
    if (r.name.toLowerCase().includes(q)) return true
    return catches
      .filter((c) => c.route_id === r.id && c.status !== 'failed')
      .some((c) =>
        (c.pokemon_name ?? '').toLowerCase().includes(q) ||
        (c.nickname ?? '').toLowerCase().includes(q)
      )
  })

  // Checkpoint-gated accessibility (only for games with locations data on gymLeaders)
  const sortedLeaders = [...(gameInfo?.gymLeaders ?? [])].sort((a, b) => a.levelCap - b.levelCap)
  const hasGating = sortedLeaders.some((g) => (g.locations?.length ?? 0) > 0)
  const completedCount = battleRecords.filter((b) => b.outcome === 'victory').length

  function getAccess(routeId: string): 'accessible' | 'completed' | 'inaccessible' | 'ungated' {
    if (!hasGating) return 'ungated'
    for (let i = 0; i < sortedLeaders.length; i++) {
      if ((sortedLeaders[i].locations ?? []).some((l) => l.id === routeId)) {
        if (i < completedCount) return 'completed'
        if (i === completedCount) return 'accessible'
        return 'inaccessible'
      }
    }
    return 'ungated' // custom encounter or not in any checkpoint
  }

  // Accessible = not upcoming AND no catch logged yet
  // Complete = not upcoming AND a catch (or fail) has been logged
  const accessibleRoutes = filteredRoutes.filter((r) => getAccess(r.id) !== 'inaccessible' && getRouteStatus(r.id) === 'empty')
  const completedRoutes = filteredRoutes.filter((r) => getAccess(r.id) !== 'inaccessible' && getRouteStatus(r.id) !== 'empty')
  const inaccessibleRoutes = filteredRoutes.filter((r) => getAccess(r.id) === 'inaccessible')
  const ungatedRoutes: RouteInfo[] = [] // absorbed into accessible/completed above

  function renderRouteBtn(route: RouteInfo, muted = false) {
    const status = getRouteStatus(route.id)
    const isSelected = selectedRoute === route.id
    const playerDots = status !== 'empty'
      ? [...new Set(catches.filter((c) => c.route_id === route.id).map((c) => c.player_id))]
      : []
    return (
      <button
        key={route.id}
        onClick={() => setSelectedRoute(route.id)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors border-l-2 ${
          isSelected
            ? 'bg-elevated border-accent-teal text-text-primary'
            : muted
            ? 'border-transparent text-text-muted hover:bg-elevated/50 hover:text-text-secondary'
            : 'border-transparent hover:bg-elevated/50 text-text-secondary hover:text-text-primary'
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{route.name}</p>
          <RouteStatusBadge status={status} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {playerDots.map((pid) => {
            const p = players.find((pl) => pl.id === pid)
            const hasFailed = catches.some((c) => c.player_id === pid && c.route_id === route.id && c.status === 'failed')
            return p ? (
              <div
                key={pid}
                className={`w-2 h-2 rounded-full ${hasFailed ? 'opacity-30' : ''}`}
                style={{ backgroundColor: p.color }}
              />
            ) : null
          })}
        </div>
      </button>
    )
  }

  function getRouteStatus(routeId: string): RouteStatus {
    const rc = catches.filter((c) => c.route_id === routeId)
    if (rc.length === 0) return 'empty'
    if (rc.some((c) => c.status === 'failed')) return 'failed'
    const caughtIds = new Set(rc.map((c) => c.player_id))
    if (players.every((p) => caughtIds.has(p.id))) return 'linked'
    return 'pending'
  }

  const selectedRouteStatus = selectedRoute ? getRouteStatus(selectedRoute) : 'empty'
  const routeCatches = selectedRoute ? catches.filter((c) => c.route_id === selectedRoute) : []
  const routeLink = selectedRoute ? soulLinks.find((sl) => sl.route_id === selectedRoute) : null
  const selectedRouteName = routes.find((r) => r.id === selectedRoute)?.name ?? selectedRoute ?? ''

  const activeLogPlayer = logModal.playerId ? players.find((p) => p.id === logModal.playerId) : null
  const activeFailPlayer = failModal.playerId ? players.find((p) => p.id === failModal.playerId) : null

  async function saveRuleset(updates: Partial<typeof activeRun.ruleset>) {
    await api.runs.update(activeRun.id, {
      ruleset: { ...activeRun.ruleset, ...updates }
    })
    await refreshRun()
  }

  async function handleClearRoute() {
    if (!selectedRoute) return
    setClearing(true)
    try {
      const routeCatchIds = catches.filter((c) => c.route_id === selectedRoute).map((c) => c.id)
      const link = soulLinks.find((sl) => sl.route_id === selectedRoute)
      await Promise.all([
        ...routeCatchIds.map((id) => api.catches.delete(id)),
        ...(link ? [api.soulLinks.delete(link.id)] : []),
      ])
      await Promise.all([refreshCatches(), refreshSoulLinks()])
    } finally {
      setClearing(false)
      setClearConfirm(false)
    }
  }

  async function handleSaveNickname() {
    if (!selectedRoute) return
    setSavingNick(true)
    try {
      const nickname = linkNickname || null
      optimisticUpdateNickname(selectedRoute, nickname)
      const targets = catches.filter((c) => c.route_id === selectedRoute && c.status !== 'failed')
      const link = soulLinks.find((sl) => sl.route_id === selectedRoute)
      await Promise.all([
        ...targets.map((c) => api.catches.update(c.id, { nickname } as Partial<Catch>)),
        ...(link ? [api.soulLinks.update(link.id, { nickname })] : []),
      ])
      await Promise.all([refreshCatches(), refreshSoulLinks()])
    } finally {
      setSavingNick(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* Encounter list */}
      <div className="w-60 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                className="w-full bg-input border border-border rounded pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-border-light"
                placeholder="Search encounters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => setManageModal(true)}
              className="p-1.5 rounded border border-border text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
              title="Manage encounters"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          {hasGating ? (
            <>
              {accessibleRoutes.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[9px] uppercase tracking-wider font-semibold text-accent-teal bg-accent-teal/5 border-b border-border">
                    Accessible
                  </div>
                  {accessibleRoutes.map((r) => renderRouteBtn(r))}
                </>
              )}
              {completedRoutes.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[9px] uppercase tracking-wider font-semibold text-text-muted bg-elevated/40 border-b border-border">
                    Complete
                  </div>
                  {completedRoutes.map((r) => renderRouteBtn(r, true))}
                </>
              )}
              {inaccessibleRoutes.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[9px] uppercase tracking-wider font-semibold text-text-muted border-b border-border flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Upcoming
                  </div>
                  {inaccessibleRoutes.map((r) => renderRouteBtn(r, true))}
                </>
              )}
              {ungatedRoutes.map((r) => renderRouteBtn(r))}
            </>
          ) : (
            filteredRoutes.map((r) => renderRouteBtn(r))
          )}
        </ScrollArea>
      </div>

      {/* Encounter detail */}
      <div className="flex-1 overflow-auto p-4">
        {!selectedRoute ? (
          <div className="flex items-center justify-center h-full text-text-muted">
            <p>Select an encounter to view details</p>
          </div>
        ) : (
          <motion.div key={selectedRoute} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-text-primary capitalize">{selectedRouteName}</h2>
              <RouteStatusBadge status={selectedRouteStatus} />
              {routeCatches.length > 0 && (
                <div className="ml-auto flex items-center gap-1.5">
                  {clearConfirm ? (
                    <>
                      <span className="text-xs text-text-muted">Clear all catches?</span>
                      <button
                        onClick={handleClearRoute}
                        disabled={clearing}
                        className="text-xs px-2 py-1 rounded border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                      >
                        {clearing ? 'Clearing…' : 'Yes, clear'}
                      </button>
                      <button
                        onClick={() => setClearConfirm(false)}
                        className="text-xs px-2 py-1 rounded border border-border text-text-muted hover:text-text-secondary transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setClearConfirm(true)}
                      className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
                      title="Clear catches for this route"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Status banner */}
            {selectedRouteStatus === 'linked' && (
              <Card className="border-accent-teal/40 bg-accent-teal/5">
                <CardContent className="py-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-accent-teal" />
                  <span className="text-xs text-accent-teal font-medium">Soul Linked</span>
                  <span className="text-xs text-text-muted">
                    All {players.length} players caught — soul link formed automatically
                  </span>
                </CardContent>
              </Card>
            )}
            {selectedRouteStatus === 'failed' && (
              <Card className="border-red-500/40 bg-red-500/5">
                <CardContent className="py-2 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-red-400 font-medium">Encounter Failed</span>
                  <span className="text-xs text-text-muted">
                    A player failed their encounter — no Pokémon from here can be used
                  </span>
                </CardContent>
              </Card>
            )}
            {selectedRouteStatus === 'pending' && (
              <Card className="border-yellow-500/30 bg-yellow-500/5">
                <CardContent className="py-2 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs text-yellow-400 font-medium">Waiting</span>
                  <span className="text-xs text-text-muted">
                    Waiting for all players to log their encounter
                  </span>
                </CardContent>
              </Card>
            )}

            {/* Shared soul link nickname */}
            {routeCatches.some((c) => c.status !== 'failed') && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Soul Link Nickname (shared)"
                    placeholder="Nickname for all Pokémon in this link"
                    value={linkNickname}
                    onChange={(e) => setLinkNickname(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveNickname()}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleSaveNickname}
                  loading={savingNick}
                  disabled={savingNick}
                  className="mb-0.5"
                >
                  Save
                </Button>
              </div>
            )}

            {/* Per-player columns */}
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${players.length}, 1fr)` }}
            >
              {players.map((player) => {
                const playerCatch = routeCatches.find(
                  (c) => c.player_id === player.id && c.status !== 'failed'
                )
                const playerFailed = routeCatches.some(
                  (c) => c.player_id === player.id && c.status === 'failed'
                )
                const hasLogged = playerHasLogged(player.id, selectedRoute, catches)
                const isLinked = routeLink?.catch_ids.includes(playerCatch?.id ?? '') ?? false

                return (
                  <div key={player.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: player.color }} />
                      <span className="text-sm font-semibold text-text-secondary">{player.name}</span>
                      {isLinked && <Link2 className="w-3 h-3 text-accent-teal" />}
                    </div>

                    {playerFailed && (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        <span className="text-xs text-red-400">Encounter failed</span>
                      </div>
                    )}

                    {playerCatch && (
                      <Card className={isLinked ? 'border-accent-teal/40' : ''}>
                        <CardContent className="py-2 flex items-center gap-2">
                          <PokemonSprite
                            pokemonId={playerCatch.pokemon_id}
                            pokemonName={playerCatch.pokemon_name}
                            size={40}
                            grayscale={playerCatch.status === 'dead'}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate capitalize">
                              {playerCatch.pokemon_name ?? 'Unknown'}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <StatusBadge status={playerCatch.status} />
                            </div>
                          </div>
                          {/* Edit species button */}
                          <button
                            onClick={() => setEditModal({ open: true, catch_: playerCatch })}
                            className="p-1 rounded hover:bg-elevated text-text-muted hover:text-text-primary transition-colors"
                            title="Edit Pokémon species"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {playerCatch.status === 'alive' && (
                            <button
                              onClick={() => setKillModal({ open: true, catch_: playerCatch })}
                              className="p-1 rounded hover:bg-elevated text-text-muted hover:text-red-400 transition-colors"
                              title="Mark as fainted"
                            >
                              <Skull className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {!hasLogged && selectedRouteStatus !== 'failed' && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setLogModal({ open: true, playerId: player.id })}
                        >
                          <Plus className="w-3.5 h-3.5" /> Caught
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-red-400 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50"
                          onClick={() => setFailModal({ open: true, playerId: player.id })}
                        >
                          <XCircle className="w-3.5 h-3.5" /> Failed
                        </Button>
                      </div>
                    )}

                    {!hasLogged && selectedRouteStatus === 'failed' && (
                      <div className="rounded-lg border border-dashed border-border p-3 text-center">
                        <p className="text-xs text-text-muted">Encounter failed</p>
                      </div>
                    )}

                    {!playerCatch && !playerFailed && hasLogged && (
                      <div className="rounded-lg border border-dashed border-border p-3 text-center">
                        <p className="text-xs text-text-muted">No catch recorded</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </div>

      {/* Modals */}
      {activeLogPlayer && selectedRoute && (
        <LogCatchModal
          open={logModal.open}
          onClose={() => setLogModal({ open: false, playerId: '' })}
          routeId={selectedRoute}
          player={activeLogPlayer}
          runId={activeRun.id}
          defaultLevel={defaultLevel}
          onSaved={refreshCatches}
        />
      )}

      <KillModal
        open={killModal.open}
        onClose={() => setKillModal({ open: false, catch_: null })}
        catch_={killModal.catch_}
        routeId={selectedRoute ?? ''}
        onKilled={() => Promise.all([refreshCatches(), refreshSoulLinks(), refreshParty()])}
      />

      {activeFailPlayer && selectedRoute && (
        <FailEncounterModal
          open={failModal.open}
          onClose={() => setFailModal({ open: false, playerId: '' })}
          player={activeFailPlayer}
          routeName={selectedRouteName}
          runId={activeRun.id}
          routeId={selectedRoute}
          onFailed={() => Promise.all([refreshCatches(), refreshSoulLinks(), refreshParty()])}
        />
      )}

      <EditPokemonModal
        open={editModal.open}
        onClose={() => setEditModal({ open: false, catch_: null })}
        catch_={editModal.catch_}
        onSaved={refreshCatches}
      />

      <ManageEncountersModal
        open={manageModal}
        onClose={() => setManageModal(false)}
        gameRoutes={gameRoutes}
        ruleset={activeRun.ruleset}
        onSave={saveRuleset}
      />
    </div>
  )
}
