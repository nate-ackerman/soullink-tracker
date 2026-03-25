import { ipcMain } from 'electron'
import {
  dbGetAllRuns, dbGetRun, dbCreateRun, dbUpdateRun, dbDeleteRun, dbCreateCollaborativeStub,
  dbGetPlayersByRun, dbCreatePlayer, dbUpdatePlayer, dbDeletePlayer,
  dbGetCatchesByRun, dbCreateCatch, dbUpdateCatch, dbDeleteCatch, dbKillCatch, dbFailEncounter,
  dbGetSoulLinksByRun, dbCreateSoulLink, dbUpdateSoulLink, dbDeleteSoulLink,
  dbGetPartyByPlayer, dbSetPartySlot, dbClearPartySlot, dbClearAllParty,
  dbAddSoulLinkToParty, dbRemoveSoulLinkFromParty,
  dbGetNotesByRun, dbCreateNote, dbUpdateNote, dbDeleteNote,
  dbExportRun, dbImportRun,
  dbGetBattlesByRun, dbCreateBattle, dbUpdateBattle, dbDeleteBattle,
  dbGetSavedPartiesByRun, dbCreateSavedParty, dbDeleteSavedParty
} from './db'

export function registerIpcHandlers(): void {
  // ── Runs ────────────────────────────────────────────────────────────────────
  ipcMain.handle('runs:getAll', () => dbGetAllRuns())
  ipcMain.handle('runs:get', (_e, id: string) => dbGetRun(id))
  ipcMain.handle('runs:create', (_e, data) => dbCreateRun(data))
  ipcMain.handle('runs:createStub', (_e, data) => dbCreateCollaborativeStub(data))
  ipcMain.handle('runs:update', (_e, id: string, data) => dbUpdateRun(id, data))
  ipcMain.handle('runs:delete', (_e, id: string) => dbDeleteRun(id))

  // Export: returns the serialized run data to the renderer (renderer triggers the download)
  ipcMain.handle('runs:export', (_e, runId: string) => {
    try {
      return { success: true, data: dbExportRun(runId) }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Import: receives the parsed JSON from the renderer, inserts into DB
  ipcMain.handle('runs:import', (_e, data: any) => {
    try {
      const run = dbImportRun(data)
      return { success: true, run }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Players ─────────────────────────────────────────────────────────────────
  ipcMain.handle('players:getByRun', (_e, runId: string) => dbGetPlayersByRun(runId))
  ipcMain.handle('players:create', (_e, data) => dbCreatePlayer(data))
  ipcMain.handle('players:update', (_e, id: string, data) => dbUpdatePlayer(id, data))
  ipcMain.handle('players:delete', (_e, id: string) => dbDeletePlayer(id))

  // ── Catches ─────────────────────────────────────────────────────────────────
  ipcMain.handle('catches:getByRun', (_e, runId: string) => dbGetCatchesByRun(runId))
  ipcMain.handle('catches:create', (_e, data) => dbCreateCatch(data))
  ipcMain.handle('catches:update', (_e, id: string, data) => dbUpdateCatch(id, data))
  ipcMain.handle('catches:delete', (_e, id: string) => dbDeleteCatch(id))
  ipcMain.handle('catches:kill', (_e, catchId: string, diedRoute: string) => dbKillCatch(catchId, diedRoute))
  ipcMain.handle('catches:failEncounter', (_e, runId: string, playerId: string, routeId: string) =>
    dbFailEncounter(runId, playerId, routeId)
  )

  // ── Soul Links ──────────────────────────────────────────────────────────────
  ipcMain.handle('soulLinks:getByRun', (_e, runId: string) => dbGetSoulLinksByRun(runId))
  ipcMain.handle('soulLinks:create', (_e, data) => dbCreateSoulLink(data))
  ipcMain.handle('soulLinks:update', (_e, id: string, data: { catchIds?: string[]; nickname?: string | null }) => dbUpdateSoulLink(id, data))
  ipcMain.handle('soulLinks:delete', (_e, id: string) => dbDeleteSoulLink(id))

  // ── Party ───────────────────────────────────────────────────────────────────
  ipcMain.handle('party:getByPlayer', (_e, runId: string, playerId: string) => dbGetPartyByPlayer(runId, playerId))
  ipcMain.handle('party:setSlot', (_e, runId: string, playerId: string, slot: number, catchId: string) => dbSetPartySlot(runId, playerId, slot, catchId))
  ipcMain.handle('party:clearSlot', (_e, runId: string, playerId: string, slot: number) => dbClearPartySlot(runId, playerId, slot))
  ipcMain.handle('party:clearAll', (_e, runId: string, playerId: string) => dbClearAllParty(runId, playerId))
  ipcMain.handle('party:addSoulLink', (_e, runId: string, catchId: string) => dbAddSoulLinkToParty(runId, catchId))
  ipcMain.handle('party:removeSoulLink', (_e, runId: string, catchId: string) => dbRemoveSoulLinkFromParty(runId, catchId))

  // ── Notes ───────────────────────────────────────────────────────────────────
  ipcMain.handle('notes:getByRun', (_e, runId: string) => dbGetNotesByRun(runId))
  ipcMain.handle('notes:create', (_e, data) => dbCreateNote(data))
  ipcMain.handle('notes:update', (_e, id: string, content: string) => dbUpdateNote(id, content))
  ipcMain.handle('notes:delete', (_e, id: string) => dbDeleteNote(id))

  // ── Battle Records ──────────────────────────────────────────────────────────
  ipcMain.handle('battles:getByRun', (_e, runId: string) => dbGetBattlesByRun(runId))
  ipcMain.handle('battles:create', (_e, data) => dbCreateBattle(data))
  ipcMain.handle('battles:update', (_e, id: string, data) => dbUpdateBattle(id, data))
  ipcMain.handle('battles:delete', (_e, id: string) => dbDeleteBattle(id))

  // ── Saved Parties ───────────────────────────────────────────────────────────
  ipcMain.handle('savedParties:getByRun', (_e, runId: string) => dbGetSavedPartiesByRun(runId))
  ipcMain.handle('savedParties:create', (_e, data) => dbCreateSavedParty(data))
  ipcMain.handle('savedParties:delete', (_e, id: string) => dbDeleteSavedParty(id))
}
