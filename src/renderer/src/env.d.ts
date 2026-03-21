/// <reference types="vite/client" />

import type {
  Run, Player, Catch, SoulLink, PartySlot, Note, BattleRecord,
  CreateRunInput, CreatePlayerInput, CreateCatchInput, CreateSoulLinkInput, CreateNoteInput
} from './types'

interface API {
  runs: {
    getAll(): Promise<Run[]>
    get(id: string): Promise<Run | null>
    create(data: CreateRunInput): Promise<Run>
    update(id: string, data: Partial<Run>): Promise<Run>
    delete(id: string): Promise<void>
    exportRun(id: string): Promise<{ success: boolean; data?: any; error?: string }>
    importRun(data: any): Promise<{ success: boolean; run?: Run; error?: string }>
  }
  players: {
    getByRun(runId: string): Promise<Player[]>
    create(data: CreatePlayerInput): Promise<Player>
    update(id: string, data: Partial<Player>): Promise<Player>
    delete(id: string): Promise<void>
  }
  catches: {
    getByRun(runId: string): Promise<Catch[]>
    create(data: CreateCatchInput): Promise<Catch>
    update(id: string, data: Partial<Catch>): Promise<Catch>
    delete(id: string): Promise<void>
    kill(catchId: string, diedRoute: string): Promise<{ killed: Catch[] }>
  }
  soulLinks: {
    getByRun(runId: string): Promise<SoulLink[]>
    create(data: CreateSoulLinkInput): Promise<SoulLink>
    update(id: string, catchIds: string[]): Promise<SoulLink>
    delete(id: string): Promise<void>
  }
  party: {
    getByPlayer(runId: string, playerId: string): Promise<PartySlot[]>
    setSlot(runId: string, playerId: string, slot: number, catchId: string): Promise<PartySlot>
    clearSlot(runId: string, playerId: string, slot: number): Promise<void>
    clearAll(runId: string, playerId: string): Promise<void>
  }
  notes: {
    getByRun(runId: string): Promise<Note[]>
    create(data: CreateNoteInput): Promise<Note>
    update(id: string, content: string): Promise<Note>
    delete(id: string): Promise<void>
  }
  battles: {
    getByRun(runId: string): Promise<BattleRecord[]>
    create(data: { run_id: string; gym_leader_name: string; level_cap: number; party_snapshot: any }): Promise<BattleRecord>
    update(id: string, data: { outcome: string }): Promise<BattleRecord>
    delete(id: string): Promise<void>
  }
}

declare global {
  interface Window {
    api: API
    electron: any
  }
}
