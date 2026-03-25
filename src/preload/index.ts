import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  runs: {
    getAll: () => ipcRenderer.invoke('runs:getAll'),
    get: (id: string) => ipcRenderer.invoke('runs:get', id),
    create: (data: any) => ipcRenderer.invoke('runs:create', data),
    createStub: (data: any) => ipcRenderer.invoke('runs:createStub', data),
    update: (id: string, data: any) => ipcRenderer.invoke('runs:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('runs:delete', id),
    exportRun: (id: string) => ipcRenderer.invoke('runs:export', id),
    importRun: (data: any) => ipcRenderer.invoke('runs:import', data)
  },
  players: {
    getByRun: (runId: string) => ipcRenderer.invoke('players:getByRun', runId),
    create: (data: any) => ipcRenderer.invoke('players:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('players:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('players:delete', id)
  },
  catches: {
    getByRun: (runId: string) => ipcRenderer.invoke('catches:getByRun', runId),
    create: (data: any) => ipcRenderer.invoke('catches:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('catches:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('catches:delete', id),
    kill: (catchId: string, diedRoute: string) => ipcRenderer.invoke('catches:kill', catchId, diedRoute),
    failEncounter: (runId: string, playerId: string, routeId: string) =>
      ipcRenderer.invoke('catches:failEncounter', runId, playerId, routeId)
  },
  soulLinks: {
    getByRun: (runId: string) => ipcRenderer.invoke('soulLinks:getByRun', runId),
    create: (data: any) => ipcRenderer.invoke('soulLinks:create', data),
    update: (id: string, data: { catchIds?: string[]; nickname?: string | null }) => ipcRenderer.invoke('soulLinks:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('soulLinks:delete', id)
  },
  party: {
    getByPlayer: (runId: string, playerId: string) => ipcRenderer.invoke('party:getByPlayer', runId, playerId),
    setSlot: (runId: string, playerId: string, slot: number, catchId: string) =>
      ipcRenderer.invoke('party:setSlot', runId, playerId, slot, catchId),
    clearSlot: (runId: string, playerId: string, slot: number) =>
      ipcRenderer.invoke('party:clearSlot', runId, playerId, slot),
    clearAll: (runId: string, playerId: string) => ipcRenderer.invoke('party:clearAll', runId, playerId),
    addSoulLink: (runId: string, catchId: string) => ipcRenderer.invoke('party:addSoulLink', runId, catchId),
    removeSoulLink: (runId: string, catchId: string) => ipcRenderer.invoke('party:removeSoulLink', runId, catchId)
  },
  notes: {
    getByRun: (runId: string) => ipcRenderer.invoke('notes:getByRun', runId),
    create: (data: any) => ipcRenderer.invoke('notes:create', data),
    update: (id: string, content: string) => ipcRenderer.invoke('notes:update', id, content),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id)
  },
  battles: {
    getByRun: (runId: string) => ipcRenderer.invoke('battles:getByRun', runId),
    create: (data: any) => ipcRenderer.invoke('battles:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('battles:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('battles:delete', id)
  },
  savedParties: {
    getByRun: (runId: string) => ipcRenderer.invoke('savedParties:getByRun', runId),
    create: (data: any) => ipcRenderer.invoke('savedParties:create', data),
    delete: (id: string) => ipcRenderer.invoke('savedParties:delete', id)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in d.ts)
  window.electron = electronAPI
  // @ts-ignore (define in d.ts)
  window.api = api
}
