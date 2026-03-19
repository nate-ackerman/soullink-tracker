import { create } from 'zustand'
import type { Run, Player, Catch, SoulLink, PartySlot, Note } from '../types'

interface AppState {
  // Active run data
  activeRunId: string | null
  activeRun: Run | null
  players: Player[]
  catches: Catch[]
  soulLinks: SoulLink[]
  partySlots: PartySlot[]
  notes: Note[]

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
  refreshParty(): Promise<void>
  refreshNotes(): Promise<void>
  setActiveRoute(routeId: string | null): void
  setActivePlayerId(playerId: string | null): void
  setSidebarCollapsed(collapsed: boolean): void

  // Derived helpers
  getCatchesByRoute(routeId: string): Catch[]
  getSoulLinksByRoute(routeId: string): SoulLink[]
  getPartyByPlayer(playerId: string): Catch[]
  getDeadByPlayer(playerId: string): Catch[]
  // Returns all catches for a player that are part of an active soul link (available for party)
  getActiveSoulLinkCatches(playerId: string): Catch[]
  // Returns the active soul link containing a given catch (or null)
  getSoulLinkForCatch(catchId: string): SoulLink | null
}

export const useAppStore = create<AppState>((set, get) => ({
  activeRunId: null,
  activeRun: null,
  players: [],
  catches: [],
  soulLinks: [],
  partySlots: [],
  notes: [],

  activePlayerId: null,
  activeRoute: null,
  sidebarCollapsed: false,
  levelCap: null,

  setActiveRun: (runId) => {
    set({ activeRunId: runId })
    if (runId) {
      get().loadRunData(runId)
    } else {
      set({ activeRun: null, players: [], catches: [], soulLinks: [], partySlots: [], notes: [] })
    }
  },

  loadRunData: async (runId) => {
    try {
      const [run, players, catches, soulLinks, notes] = await Promise.all([
        window.api.runs.get(runId),
        window.api.players.getByRun(runId),
        window.api.catches.getByRun(runId),
        window.api.soulLinks.getByRun(runId),
        window.api.notes.getByRun(runId)
      ])

      // Load all party slots for all players
      const partySlotPromises = players.map((p) => window.api.party.getByPlayer(runId, p.id))
      const partySlotArrays = await Promise.all(partySlotPromises)
      const partySlots = partySlotArrays.flat()

      set({ activeRun: run, players, catches, soulLinks, partySlots, notes })
    } catch (err) {
      console.error('Failed to load run data:', err)
    }
  },

  refreshCatches: async () => {
    const { activeRunId } = get()
    if (!activeRunId) return
    try {
      const catches = await window.api.catches.getByRun(activeRunId)
      set({ catches })
    } catch (err) {
      console.error('Failed to refresh catches:', err)
    }
  },

  refreshParty: async () => {
    const { activeRunId, players } = get()
    if (!activeRunId) return
    try {
      const partySlotPromises = players.map((p) => window.api.party.getByPlayer(activeRunId, p.id))
      const partySlotArrays = await Promise.all(partySlotPromises)
      const partySlots = partySlotArrays.flat()
      set({ partySlots })
    } catch (err) {
      console.error('Failed to refresh party:', err)
    }
  },

  refreshNotes: async () => {
    const { activeRunId } = get()
    if (!activeRunId) return
    try {
      const notes = await window.api.notes.getByRun(activeRunId)
      set({ notes })
    } catch (err) {
      console.error('Failed to refresh notes:', err)
    }
  },

  setActiveRoute: (routeId) => set({ activeRoute: routeId }),
  setActivePlayerId: (playerId) => set({ activePlayerId: playerId }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setLevelCap: (cap) => set({ levelCap: cap }),

  getCatchesByRoute: (routeId) => {
    return get().catches.filter((c) => c.route_id === routeId)
  },

  getSoulLinksByRoute: (routeId) => {
    return get().soulLinks.filter((sl) => sl.route_id === routeId)
  },

  getPartyByPlayer: (playerId) => {
    const { partySlots, catches } = get()
    const slots = partySlots.filter((ps) => ps.player_id === playerId)
    return slots
      .sort((a, b) => a.slot - b.slot)
      .map((slot) => catches.find((c) => c.id === slot.catch_id))
      .filter((c): c is Catch => c !== undefined)
  },

  getDeadByPlayer: (playerId) => {
    return get().catches.filter((c) => c.player_id === playerId && c.status === 'dead')
  },

  getActiveSoulLinkCatches: (playerId) => {
    const { catches, soulLinks } = get()
    const activeLinkCatchIds = new Set(
      soulLinks
        .filter((sl) => sl.status === 'active')
        .flatMap((sl) => sl.catch_ids)
    )
    return catches.filter(
      (c) => c.player_id === playerId && c.status === 'alive' && activeLinkCatchIds.has(c.id)
    )
  },

  getSoulLinkForCatch: (catchId) => {
    return get().soulLinks.find((sl) => sl.catch_ids.includes(catchId)) ?? null
  }
}))
