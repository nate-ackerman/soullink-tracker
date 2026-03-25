import { create } from 'zustand'
import type { Run, Player, Catch, SoulLink, PartySlot, Note, BattleRecord, SavedParty } from '../types'
import { supabase, supabaseApi, runIdToJoinCode, findRunByJoinCode } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Module-level channel reference (not in store state — avoids re-render on subscribe/unsubscribe)
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
  refreshCatches(): Promise<void>
  refreshSoulLinks(): Promise<void>
  refreshParty(): Promise<void>
  refreshNotes(): Promise<void>
  refreshBattles(): Promise<void>
  refreshSavedParties(): Promise<void>
  setActiveRoute(routeId: string | null): void
  setActivePlayerId(playerId: string | null): void
  setSidebarCollapsed(collapsed: boolean): void

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
