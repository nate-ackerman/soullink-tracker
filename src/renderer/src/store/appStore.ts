/**
 * appStore.ts — Global Zustand store for all active-run state
 *
 * Single source of truth for the currently open run. All pages read from this
 * store rather than fetching data independently.
 *
 * API routing:
 *   Local runs   → window.api (IPC → SQLite via src/main/db.ts)
 *   Collaborative → supabaseApi (direct Supabase REST calls)
 *
 * The distinction is made at two levels:
 *   - loadRunData / refresh* actions — check activeRun.collaborative and pick
 *     the right API before fetching.
 *   - Page-level mutations (create catch, kill, etc.) — go through the useApi()
 *     hook (src/renderer/src/lib/useApi.ts) which returns the correct API object.
 *
 * Realtime:
 *   When a collaborative run is loaded, a Supabase Realtime channel is opened
 *   that listens for Postgres changes on the run's tables. Each change triggers
 *   the corresponding refresh* action so all connected clients stay in sync.
 *   The channel is torn down on run switch or close via _unsubscribe().
 *
 * Granular refresh actions (refreshCatches, refreshParty, etc.) exist so that
 * mutations can re-fetch only what changed rather than reloading the entire run.
 */

import { create } from 'zustand'
import type { Run, Player, Catch, SoulLink, PartySlot, Note, BattleRecord, SavedParty } from '../types'
import { supabase, supabaseApi, runIdToJoinCode, findRunByJoinCode } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Kept outside the store to avoid triggering re-renders on channel state changes
let _realtimeChannel: RealtimeChannel | null = null

function _unsubscribe() {
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel)
    _realtimeChannel = null
  }
}

interface AppState {
  // Active run data
  activeRunId: string | null
  activeRun: Run | null
  players: Player[]
  catches: Catch[]
  soulLinks: SoulLink[]
  partySlots: PartySlot[]
  notes: Note[]
  battleRecords: BattleRecord[]
  savedParties: SavedParty[]

  // UI state
  activePlayerId: string | null
  activeRoute: string | null
  sidebarCollapsed: boolean
  levelCap: number | null

  // Actions
  setActiveRun(runId: string | null): void
  setLevelCap(cap: number | null): void
  loadRunData(runId: string): Promise<void>
  refreshRun(): Promise<void>
  refreshCatches(): Promise<void>
  refreshSoulLinks(): Promise<void>
  refreshParty(): Promise<void>
  refreshNotes(): Promise<void>
  refreshBattles(): Promise<void>
  refreshSavedParties(): Promise<void>
  setActiveRoute(routeId: string | null): void
  setActivePlayerId(playerId: string | null): void
  setSidebarCollapsed(collapsed: boolean): void

  // Optimistic mutations — update store state immediately without a network call.
  // The caller is responsible for firing the actual API mutation and reconciling via
  // the appropriate refresh* action afterwards.

  // Party mutations — mirror the DB logic in db.ts exactly.
  optimisticAddLink(link: SoulLink): void
  optimisticRemoveLink(catchId: string): void
  optimisticClearParty(): void

  // Catch / encounter mutations.
  optimisticAddCatch(catch_: Catch): void
  optimisticUpdateCatch(id: string, updates: Partial<Catch>): void
  optimisticUpdateNickname(routeId: string, nickname: string | null): void

  // Battle record mutations.
  optimisticAddBattle(battle: BattleRecord): void
  optimisticUpdateBattle(id: string, updates: Partial<BattleRecord>): void

  // Collaborative
  createCollaborativeRun(input: { name: string; game: string; generation: number; ruleset: any; players: { name: string; color: string }[] }): Promise<string>
  convertToCollaborative(runId: string): Promise<string>
  joinRun(code: string): Promise<string>
  getJoinCode(): string | null

  // Derived helpers
  getCatchesByRoute(routeId: string): Catch[]
  getSoulLinksByRoute(routeId: string): SoulLink[]
  getPartyByPlayer(playerId: string): Catch[]
  getDeadByPlayer(playerId: string): Catch[]
}

export const useAppStore = create<AppState>((set, get) => ({
  activeRunId: null,
  activeRun: null,
  players: [],
  catches: [],
  soulLinks: [],
  partySlots: [],
  notes: [],
  battleRecords: [],
  savedParties: [],

  activePlayerId: null,
  activeRoute: null,
  sidebarCollapsed: false,
  levelCap: null,

  setActiveRun: (runId) => {
    _unsubscribe()
    set({ activeRunId: runId })
    if (runId) {
      get().loadRunData(runId)
    } else {
      set({ activeRun: null, players: [], catches: [], soulLinks: [], partySlots: [], notes: [], battleRecords: [], savedParties: [] })
    }
  },

  loadRunData: async (runId) => {
    try {
      // Always read local stub first to detect collaborative flag
      const localRun = await window.api.runs.get(runId)
      const isCollab = !!(localRun?.collaborative)
      const api = isCollab ? supabaseApi : window.api

      const [run, players, catches, soulLinks, notes, battleRecords, savedParties] = await Promise.all([
        api.runs.get(runId),
        api.players.getByRun(runId),
        api.catches.getByRun(runId),
        api.soulLinks.getByRun(runId),
        api.notes.getByRun(runId),
        api.battles.getByRun(runId),
        api.savedParties.getByRun(runId)
      ])

      const partySlotPromises = players.map((p) => api.party.getByPlayer(runId, p.id))
      const partySlotArrays = await Promise.all(partySlotPromises)
      const partySlots = partySlotArrays.flat()

      set({ activeRun: run, players, catches, soulLinks, partySlots, notes, battleRecords, savedParties })

      // Subscribe to real-time for collaborative runs
      if (isCollab) {
        _unsubscribe()
        _realtimeChannel = supabase
          .channel(`run:${runId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'catches', filter: `run_id=eq.${runId}` },
            () => get().refreshCatches())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'soul_links', filter: `run_id=eq.${runId}` },
            () => get().refreshSoulLinks())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'party_slots', filter: `run_id=eq.${runId}` },
            () => get().refreshParty())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `run_id=eq.${runId}` },
            () => get().refreshNotes())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'battle_records', filter: `run_id=eq.${runId}` },
            () => get().refreshBattles())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_parties', filter: `run_id=eq.${runId}` },
            () => get().refreshSavedParties())
          .subscribe()
      }
    } catch (err) {
      console.error('Failed to load run data:', err)
    }
  },

  refreshRun: async () => {
    const { activeRunId, activeRun } = get()
    if (!activeRunId) return
    try {
      const api = activeRun?.collaborative ? supabaseApi : window.api
      const run = await api.runs.get(activeRunId)
      set({ activeRun: run })
    } catch (err) {
      console.error('Failed to refresh run:', err)
    }
  },

  refreshCatches: async () => {
    const { activeRunId, activeRun } = get()
    if (!activeRunId) return
    try {
      const api = activeRun?.collaborative ? supabaseApi : window.api
      const catches = await api.catches.getByRun(activeRunId)
      set({ catches })
    } catch (err) {
      console.error('Failed to refresh catches:', err)
    }
  },

  refreshSoulLinks: async () => {
    const { activeRunId, activeRun } = get()
    if (!activeRunId) return
    try {
      const api = activeRun?.collaborative ? supabaseApi : window.api
      const soulLinks = await api.soulLinks.getByRun(activeRunId)
      set({ soulLinks })
    } catch (err) {
      console.error('Failed to refresh soul links:', err)
    }
  },

  refreshParty: async () => {
    const { activeRunId, players, activeRun } = get()
    if (!activeRunId) return
    try {
      const api = activeRun?.collaborative ? supabaseApi : window.api
      const partySlotPromises = players.map((p) => api.party.getByPlayer(activeRunId, p.id))
      const partySlotArrays = await Promise.all(partySlotPromises)
      const partySlots = partySlotArrays.flat()
      set({ partySlots })
    } catch (err) {
      console.error('Failed to refresh party:', err)
    }
  },

  refreshNotes: async () => {
    const { activeRunId, activeRun } = get()
    if (!activeRunId) return
    try {
      const api = activeRun?.collaborative ? supabaseApi : window.api
      const notes = await api.notes.getByRun(activeRunId)
      set({ notes })
    } catch (err) {
      console.error('Failed to refresh notes:', err)
    }
  },

  refreshBattles: async () => {
    const { activeRunId, activeRun } = get()
    if (!activeRunId) return
    try {
      const api = activeRun?.collaborative ? supabaseApi : window.api
      const battleRecords = await api.battles.getByRun(activeRunId)
      set({ battleRecords })
    } catch (err) {
      console.error('Failed to refresh battles:', err)
    }
  },

  refreshSavedParties: async () => {
    const { activeRunId, activeRun } = get()
    if (!activeRunId) return
    try {
      const api = activeRun?.collaborative ? supabaseApi : window.api
      const savedParties = await api.savedParties.getByRun(activeRunId)
      set({ savedParties })
    } catch (err) {
      console.error('Failed to refresh saved parties:', err)
    }
  },

  setActiveRoute: (routeId) => set({ activeRoute: routeId }),
  setActivePlayerId: (playerId) => set({ activePlayerId: playerId }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setLevelCap: (cap) => set({ levelCap: cap }),

  // Mirrors dbAddSoulLinkToParty: assigns each alive catch in the link to the
  // next available slot (0–5) for their player, without touching the backend.
  optimisticAddLink: (link) => {
    const { catches, partySlots, activeRun } = get()
    if (!activeRun) return
    const newSlots = [...partySlots]
    for (const catchId of link.catch_ids) {
      const c = catches.find((x) => x.id === catchId)
      if (!c || c.status !== 'alive') continue
      const used = newSlots.filter((ps) => ps.player_id === c.player_id).map((ps) => ps.slot)
      const nextSlot = [0, 1, 2, 3, 4, 5].find((s) => !used.includes(s))
      if (nextSlot === undefined) continue
      newSlots.push({ id: `optimistic-${catchId}`, run_id: activeRun.id, player_id: c.player_id, catch_id: catchId, slot: nextSlot })
    }
    set({ partySlots: newSlots })
  },

  // Mirrors dbRemoveSoulLinkFromParty: removes all members of the link from the
  // party and compacts each affected player's remaining slots to fill from 0.
  optimisticRemoveLink: (catchId) => {
    const { soulLinks, partySlots } = get()
    const link = soulLinks.find((sl) => sl.catch_ids.includes(catchId))
    const toRemove = new Set(link ? link.catch_ids : [catchId])
    const remaining = partySlots.filter((ps) => !toRemove.has(ps.catch_id))
    // Renumber each affected player's slots starting from 0 with no gaps
    const affectedPlayers = new Set(partySlots.filter((ps) => toRemove.has(ps.catch_id)).map((ps) => ps.player_id))
    const compacted = remaining.map((ps) => {
      if (!affectedPlayers.has(ps.player_id)) return ps
      const idx = remaining.filter((r) => r.player_id === ps.player_id).sort((a, b) => a.slot - b.slot).indexOf(ps)
      return { ...ps, slot: idx }
    })
    set({ partySlots: compacted })
  },

  // Immediately empties the party in the store. Caller must still fire clearAll API calls.
  optimisticClearParty: () => set({ partySlots: [] }),

  // Appends a newly created catch before the server round-trip completes.
  // Use a temporary id (e.g. `optimistic-<uuid>`); refreshCatches() will replace it with the real row.
  optimisticAddCatch: (catch_) => set({ catches: [...get().catches, catch_] }),

  // Patches a single catch in the store. Caller reconciles via refreshCatches().
  optimisticUpdateCatch: (id, updates) =>
    set({ catches: get().catches.map((c) => (c.id === id ? { ...c, ...updates } : c)) }),

  // Sets nickname on all non-failed catches for a route and on the matching soul link.
  // Caller reconciles via refreshCatches() + refreshSoulLinks().
  optimisticUpdateNickname: (routeId, nickname) => {
    const { catches, soulLinks } = get()
    set({
      catches: catches.map((c) => (c.route_id === routeId && c.status !== 'failed' ? { ...c, nickname } : c)),
      soulLinks: soulLinks.map((sl) => (sl.route_id === routeId ? { ...sl, nickname } : sl)),
    })
  },

  // Appends a new battle record before the server round-trip completes.
  // Use a temporary id; refreshBattles() will replace it with the real row.
  optimisticAddBattle: (battle) => set({ battleRecords: [...get().battleRecords, battle] }),

  // Patches a battle record in the store. Caller reconciles via refreshBattles().
  optimisticUpdateBattle: (id, updates) =>
    set({ battleRecords: get().battleRecords.map((b) => (b.id === id ? { ...b, ...updates } : b)) }),

  // ── Collaborative actions ────────────────────────────────────────────────────

  createCollaborativeRun: async ({ name, game, generation, ruleset, players }) => {
    const runId = crypto.randomUUID()
    const now = new Date().toISOString()

    // Create run in Supabase
    await supabase.from('runs').insert({ id: runId, name, game, generation, status: 'active', ruleset, created_at: now, updated_at: now })
    for (let i = 0; i < players.length; i++) {
      await supabase.from('players').insert({ id: crypto.randomUUID(), run_id: runId, name: players[i].name, position: i, color: players[i].color })
    }

    // Create local stub so the run appears on the Home page
    await window.api.runs.createStub({ id: runId, name, game, generation, ruleset })
    return runId
  },

  convertToCollaborative: async (runId: string) => {
    // Read all local data
    const run = await window.api.runs.get(runId)
    if (!run) throw new Error('Run not found')
    const [players, catches, soulLinks, notes, battleRecords, savedParties] = await Promise.all([
      window.api.players.getByRun(runId),
      window.api.catches.getByRun(runId),
      window.api.soulLinks.getByRun(runId),
      window.api.notes.getByRun(runId),
      window.api.battles.getByRun(runId),
      window.api.savedParties.getByRun(runId),
    ])
    const partySlotArrays = await Promise.all(players.map((p) => window.api.party.getByPlayer(runId, p.id)))
    const partySlots = partySlotArrays.flat()

    // Upload to Supabase in dependency order
    await supabase.from('runs').upsert({
      id: run.id, name: run.name, game: run.game, generation: run.generation,
      status: run.status, ruleset: run.ruleset, created_at: run.created_at, updated_at: new Date().toISOString()
    })
    for (const p of players) {
      await supabase.from('players').upsert({ id: p.id, run_id: p.run_id, name: p.name, position: p.position, color: p.color })
    }
    for (const c of catches) {
      await supabase.from('catches').upsert(c)
    }
    for (const sl of soulLinks) {
      await supabase.from('soul_links').upsert({
        id: sl.id, run_id: sl.run_id, route_id: sl.route_id,
        catch_ids: sl.catch_ids, status: sl.status, nickname: sl.nickname ?? null
      })
    }
    for (const ps of partySlots) {
      await supabase.from('party_slots').upsert(ps)
    }
    for (const n of notes) {
      await supabase.from('notes').upsert(n)
    }
    for (const b of battleRecords) {
      await supabase.from('battle_records').upsert(b)
    }
    for (const sp of savedParties) {
      await supabase.from('saved_parties').upsert(sp)
    }

    // Mark local run as collaborative and reload
    await window.api.runs.update(runId, { collaborative: true } as any)
    await get().loadRunData(runId)

    return runIdToJoinCode(runId)
  },

  joinRun: async (code: string) => {
    const run = await findRunByJoinCode(code.trim())
    if (!run) throw new Error('No run found with that code. Check for typos and try again.')
    await window.api.runs.createStub({ id: run.id, name: run.name, game: run.game, generation: run.generation, ruleset: run.ruleset })
    return run.id
  },

  getJoinCode: () => {
    const { activeRun } = get()
    if (!activeRun?.collaborative) return null
    return runIdToJoinCode(activeRun.id)
  },

  // ── Derived helpers ──────────────────────────────────────────────────────────

  getCatchesByRoute: (routeId) => get().catches.filter((c) => c.route_id === routeId),
  getSoulLinksByRoute: (routeId) => get().soulLinks.filter((sl) => sl.route_id === routeId),

  getPartyByPlayer: (playerId) => {
    const { partySlots, catches } = get()
    return partySlots
      .filter((ps) => ps.player_id === playerId)
      .sort((a, b) => a.slot - b.slot)
      .map((slot) => catches.find((c) => c.id === slot.catch_id))
      .filter((c): c is Catch => c !== undefined)
  },

  getDeadByPlayer: (playerId) => get().catches.filter((c) => c.player_id === playerId && c.status === 'dead'),
}))
