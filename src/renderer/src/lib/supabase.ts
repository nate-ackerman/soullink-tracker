/**
 * supabase.ts — Supabase client and collaborative-run API layer
 *
 * This file has two responsibilities:
 *
 * 1. SUPABASE CLIENT — exports `supabase` for direct Postgres queries and
 *    Realtime subscriptions used in appStore.ts.
 *
 * 2. SUPABASE API (`supabaseApi`) — a mirror of the `window.api` interface
 *    (defined in src/preload/index.ts) that routes all mutations to Supabase
 *    instead of local SQLite. The `useApi()` hook in src/renderer/src/lib/useApi.ts
 *    returns either `window.api` or `supabaseApi` based on `activeRun.collaborative`.
 *
 * Complex operations (kill, failEncounter, addSoulLink, removeSoulLink) are
 * implemented as private `_*` helpers because they involve multiple table
 * mutations that must stay in sync — the same logic that lives in db.ts for
 * local runs.
 *
 * Join code format: first 8 hex characters of the run UUID, uppercase.
 * Matching uses ilike so it's case-insensitive on lookup.
 */

import { createClient } from '@supabase/supabase-js'

// Anon key is intentionally public — Supabase RLS policies enforce row-level
// access. This key has no admin privileges.
const SUPABASE_URL = 'https://vyodmscaavjvabkzykvu.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5b2Rtc2NhYXZqdmFia3p5a3Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTQ0MDAsImV4cCI6MjA4OTk3MDQwMH0.aj2LIzoVIzm4NOD-MfvftVQyk3kEiUd-45qp0oftmSY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Join code = first segment of the UUID (8 hex chars), displayed uppercase
export function runIdToJoinCode(runId: string): string {
  return runId.split('-')[0].toUpperCase()
}

export async function findRunByJoinCode(code: string): Promise<any | null> {
  const { data } = await supabase
    .from('runs')
    .select('*')
    .ilike('id', `${code.toLowerCase()}%`)
    .limit(1)
  if (!data?.length) return null
  const r = data[0]
  return { ...r, ruleset: typeof r.ruleset === 'string' ? JSON.parse(r.ruleset) : r.ruleset, collaborative: true }
}

// ── Private helpers for complex operations ─────────────────────────────────────

function parseCatchIds(val: any): string[] {
  return Array.isArray(val) ? val : JSON.parse(val ?? '[]')
}

function parseSnapshot(val: any): any[] {
  return Array.isArray(val) ? val : JSON.parse(val ?? '[]')
}

async function _killCatch(catchId: string, diedRoute: string) {
  const now = new Date().toISOString()
  const { data: c } = await supabase.from('catches').select('*').eq('id', catchId).single()
  if (!c) return { killed: [] }

  const { data: links } = await supabase.from('soul_links').select('*').eq('run_id', c.run_id)
  const affectedLink = (links ?? []).find((l: any) => parseCatchIds(l.catch_ids).includes(catchId))

  const toKill = new Set<string>([catchId])
  if (affectedLink) parseCatchIds(affectedLink.catch_ids).forEach((id: string) => toKill.add(id))

  const killed: any[] = []
  for (const id of toKill) {
    await supabase.from('catches').update({ status: 'dead', died_at: now, died_route: diedRoute }).eq('id', id).eq('status', 'alive')
    await supabase.from('party_slots').delete().eq('catch_id', id)
    const { data: updated } = await supabase.from('catches').select('*').eq('id', id).single()
    if (updated) killed.push(updated)
  }
  if (affectedLink) {
    await supabase.from('soul_links').update({ status: 'broken' }).eq('id', affectedLink.id)
  }
  return { killed }
}

async function _failEncounter(runId: string, playerId: string, routeId: string) {
  const now = new Date().toISOString()
  const { data: existing } = await supabase.from('catches').select('id').eq('run_id', runId).eq('route_id', routeId).eq('status', 'alive')
  for (const c of existing ?? []) {
    await supabase.from('catches').update({ status: 'failed' }).eq('id', c.id)
    await supabase.from('party_slots').delete().eq('catch_id', c.id)
  }
  await supabase.from('soul_links').delete().eq('run_id', runId).eq('route_id', routeId)
  const id = crypto.randomUUID()
  await supabase.from('catches').insert({ id, run_id: runId, player_id: playerId, route_id: routeId, status: 'failed', caught_at: now })
  const { data } = await supabase.from('catches').select('*').eq('id', id).single()
  return data
}

async function _checkAndAutoLink(runId: string, routeId: string) {
  const { data: players } = await supabase.from('players').select('id').eq('run_id', runId).order('position')
  if (!players?.length) return
  const { data: failed } = await supabase.from('catches').select('id').eq('run_id', runId).eq('route_id', routeId).eq('status', 'failed')
  if (failed?.length) return
  const { data: alive } = await supabase.from('catches').select('*').eq('run_id', runId).eq('route_id', routeId).eq('status', 'alive')
  const byPlayer = new Map<string, any>()
  for (const c of alive ?? []) { if (!byPlayer.has(c.player_id)) byPlayer.set(c.player_id, c) }
  if (byPlayer.size < players.length) return
  const catchIds = players.map((p: any) => byPlayer.get(p.id)!.id)
  const { data: existing } = await supabase.from('soul_links').select('*').eq('run_id', runId).eq('route_id', routeId).limit(1)
  if (existing?.length) {
    await supabase.from('soul_links').update({ catch_ids: catchIds, status: 'active' }).eq('id', existing[0].id)
  } else {
    await supabase.from('soul_links').insert({ id: crypto.randomUUID(), run_id: runId, route_id: routeId, catch_ids: catchIds, status: 'active', nickname: null })
  }
}

async function _addSoulLinkToParty(runId: string, catchId: string) {
  const { data: links } = await supabase.from('soul_links').select('*').eq('run_id', runId).eq('status', 'active')
  const link = (links ?? []).find((l: any) => parseCatchIds(l.catch_ids).includes(catchId))
  if (!link) return []
  const catchIds = parseCatchIds(link.catch_ids)
  const created: any[] = []
  for (const cid of catchIds) {
    const { data: c } = await supabase.from('catches').select('*').eq('id', cid).single()
    if (!c || c.status !== 'alive') continue
    const { data: used } = await supabase.from('party_slots').select('slot').eq('run_id', runId).eq('player_id', c.player_id)
    const usedSet = new Set((used ?? []).map((s: any) => s.slot as number))
    const nextSlot = [0, 1, 2, 3, 4, 5].find((s) => !usedSet.has(s))
    if (nextSlot === undefined) continue
    const { data: slot } = await supabase.from('party_slots').insert({
      id: crypto.randomUUID(), run_id: runId, player_id: c.player_id, catch_id: cid, slot: nextSlot
    }).select().single()
    if (slot) created.push(slot)
  }
  return created
}

async function _removeSoulLinkFromParty(runId: string, catchId: string) {
  const { data: links } = await supabase.from('soul_links').select('*').eq('run_id', runId)
  const link = (links ?? []).find((l: any) => parseCatchIds(l.catch_ids).includes(catchId))
  const toRemove = link ? parseCatchIds(link.catch_ids) : [catchId]
  const affectedPlayerIds = new Set<string>()
  for (const cid of toRemove) {
    const { data: slot } = await supabase.from('party_slots').select('player_id').eq('catch_id', cid).maybeSingle()
    if (slot) affectedPlayerIds.add(slot.player_id)
    await supabase.from('party_slots').delete().eq('catch_id', cid)
  }
  for (const playerId of affectedPlayerIds) {
    const { data: remaining } = await supabase.from('party_slots').select('id, slot').eq('run_id', runId).eq('player_id', playerId).order('slot')
    for (let i = 0; i < (remaining ?? []).length; i++) {
      if (remaining![i].slot !== i) await supabase.from('party_slots').update({ slot: i }).eq('id', remaining![i].id)
    }
  }
}

// ── Public API (mirrors window.api interface) ─────────────────────────────────

export const supabaseApi = {
  runs: {
    get: async (id: string) => {
      const { data } = await supabase.from('runs').select('*').eq('id', id).single()
      if (!data) return null
      return { ...data, ruleset: typeof data.ruleset === 'string' ? JSON.parse(data.ruleset) : data.ruleset, collaborative: true }
    },
    update: async (id: string, updates: any) => {
      const payload: any = { ...updates, updated_at: new Date().toISOString() }
      await supabase.from('runs').update(payload).eq('id', id)
    },
  },
  players: {
    getByRun: async (runId: string) => {
      const { data } = await supabase.from('players').select('*').eq('run_id', runId).order('position')
      return data ?? []
    },
    create: async (data: any) => {
      const { data: created } = await supabase.from('players').insert({ id: crypto.randomUUID(), ...data }).select().single()
      return created
    },
    update: async (id: string, updates: any) => {
      await supabase.from('players').update(updates).eq('id', id)
    },
  },
  catches: {
    getByRun: async (runId: string) => {
      const { data } = await supabase.from('catches').select('*').eq('run_id', runId)
      return data ?? []
    },
    create: async (data: any) => {
      const id = crypto.randomUUID()
      const { data: created } = await supabase.from('catches').insert({
        id, caught_at: new Date().toISOString(), status: 'alive', level: 5, ...data,
      }).select().single()
      if (created) await _checkAndAutoLink(created.run_id, created.route_id)
      return created
    },
    update: async (id: string, updates: any) => {
      const { data } = await supabase.from('catches').update(updates).eq('id', id).select().single()
      return data
    },
    delete: async (id: string) => {
      await supabase.from('catches').delete().eq('id', id)
    },
    kill: (catchId: string, diedRoute: string) => _killCatch(catchId, diedRoute),
    failEncounter: (runId: string, playerId: string, routeId: string) => _failEncounter(runId, playerId, routeId),
  },
  soulLinks: {
    getByRun: async (runId: string) => {
      const { data } = await supabase.from('soul_links').select('*').eq('run_id', runId)
      return (data ?? []).map((l: any) => ({ ...l, catch_ids: parseCatchIds(l.catch_ids) }))
    },
    create: async (data: any) => {
      const { data: created } = await supabase.from('soul_links').insert({
        id: crypto.randomUUID(), status: 'active', nickname: null, ...data,
      }).select().single()
      return created ? { ...created, catch_ids: parseCatchIds(created.catch_ids) } : null
    },
    update: async (id: string, updates: { catchIds?: string[]; nickname?: string | null }) => {
      const payload: any = {}
      if (updates.catchIds !== undefined) payload.catch_ids = updates.catchIds
      if (updates.nickname !== undefined) payload.nickname = updates.nickname
      const { data } = await supabase.from('soul_links').update(payload).eq('id', id).select().single()
      return data ? { ...data, catch_ids: parseCatchIds(data.catch_ids) } : null
    },
    delete: async (id: string) => { await supabase.from('soul_links').delete().eq('id', id) },
  },
  party: {
    getByPlayer: async (runId: string, playerId: string) => {
      const { data } = await supabase.from('party_slots').select('*').eq('run_id', runId).eq('player_id', playerId).order('slot')
      return data ?? []
    },
    setSlot: async (runId: string, playerId: string, slot: number, catchId: string) => {
      await supabase.from('party_slots').delete().eq('run_id', runId).eq('player_id', playerId).eq('slot', slot)
      const { data } = await supabase.from('party_slots').insert({
        id: crypto.randomUUID(), run_id: runId, player_id: playerId, catch_id: catchId, slot
      }).select().single()
      return data
    },
    clearSlot: async (runId: string, playerId: string, slot: number) => {
      await supabase.from('party_slots').delete().eq('run_id', runId).eq('player_id', playerId).eq('slot', slot)
    },
    clearAll: async (runId: string, playerId: string) => {
      await supabase.from('party_slots').delete().eq('run_id', runId).eq('player_id', playerId)
    },
    addSoulLink: (runId: string, catchId: string) => _addSoulLinkToParty(runId, catchId),
    removeSoulLink: (runId: string, catchId: string) => _removeSoulLinkFromParty(runId, catchId),
  },
  notes: {
    getByRun: async (runId: string) => {
      const { data } = await supabase.from('notes').select('*').eq('run_id', runId)
      return data ?? []
    },
    create: async (data: any) => {
      const now = new Date().toISOString()
      const { data: created } = await supabase.from('notes').insert({
        id: crypto.randomUUID(), created_at: now, updated_at: now, ...data
      }).select().single()
      return created
    },
    update: async (id: string, content: string) => {
      const { data } = await supabase.from('notes').update({ content, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      return data
    },
    delete: async (id: string) => { await supabase.from('notes').delete().eq('id', id) },
  },
  battles: {
    getByRun: async (runId: string) => {
      const { data } = await supabase.from('battle_records').select('*').eq('run_id', runId).order('created_at')
      return (data ?? []).map((b: any) => ({ ...b, party_snapshot: parseSnapshot(b.party_snapshot) }))
    },
    create: async (data: any) => {
      const { data: created } = await supabase.from('battle_records').insert({
        id: crypto.randomUUID(), created_at: new Date().toISOString(), outcome: 'pending', ...data
      }).select().single()
      return created ? { ...created, party_snapshot: parseSnapshot(created.party_snapshot) } : null
    },
    update: async (id: string, updates: any) => {
      const payload: any = { ...updates }
      if (updates.outcome === 'victory') payload.completed_at = new Date().toISOString()
      const { data } = await supabase.from('battle_records').update(payload).eq('id', id).select().single()
      return data ? { ...data, party_snapshot: parseSnapshot(data.party_snapshot) } : null
    },
    delete: async (id: string) => { await supabase.from('battle_records').delete().eq('id', id) },
  },
  savedParties: {
    getByRun: async (runId: string) => {
      const { data } = await supabase.from('saved_parties').select('*').eq('run_id', runId).order('created_at')
      return (data ?? []).map((sp: any) => ({ ...sp, party_snapshot: parseSnapshot(sp.party_snapshot) }))
    },
    create: async (data: any) => {
      const { data: created } = await supabase.from('saved_parties').insert({
        id: crypto.randomUUID(), created_at: new Date().toISOString(), ...data
      }).select().single()
      return created ? { ...created, party_snapshot: parseSnapshot(created.party_snapshot) } : null
    },
    delete: async (id: string) => { await supabase.from('saved_parties').delete().eq('id', id) },
  },
}
