import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'soullink.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initializeSchema()
    runMigrations()
  }
  return db
}

function runMigrations(): void {
  const database = db
  // Add status column to soul_links if missing (schema migration)
  try {
    database.exec("ALTER TABLE soul_links ADD COLUMN status TEXT DEFAULT 'active'")
  } catch (_) {
    // Column already exists
  }
  // Add nickname column to soul_links
  try {
    database.exec('ALTER TABLE soul_links ADD COLUMN nickname TEXT DEFAULT NULL')
  } catch (_) {
    // Column already exists
  }
  // Backfill soul_links.nickname from catches for any links that still have NULL nickname.
  // Picks the first non-null nickname found among the linked catches.
  const nullLinks = database.prepare("SELECT id, catch_ids FROM soul_links WHERE nickname IS NULL").all() as { id: string; catch_ids: string }[]
  for (const link of nullLinks) {
    let catchIds: string[] = []
    try { catchIds = JSON.parse(link.catch_ids) } catch (_) { continue }
    for (const cid of catchIds) {
      const row = database.prepare('SELECT nickname FROM catches WHERE id = ? AND nickname IS NOT NULL').get(cid) as { nickname: string } | undefined
      if (row?.nickname) {
        database.prepare('UPDATE soul_links SET nickname = ? WHERE id = ?').run(row.nickname, link.id)
        break
      }
    }
  }
  // Add collaborative flag to runs
  try {
    database.exec('ALTER TABLE runs ADD COLUMN collaborative INTEGER NOT NULL DEFAULT 0')
  } catch (_) {
    // Column already exists
  }
  // Drop old statuses no longer used in catches
  // (no-op: SQLite doesn't support DROP COLUMN before 3.35, just leave boxed/released as dead-equivalent)
}

function initializeSchema(): void {
  const database = db
  database.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      game TEXT NOT NULL,
      generation INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      ruleset TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      color TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS catches (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      route_id TEXT NOT NULL,
      pokemon_id INTEGER,
      pokemon_name TEXT,
      nickname TEXT,
      level INTEGER DEFAULT 1,
      gender TEXT,
      nature TEXT,
      ability TEXT,
      held_item TEXT,
      status TEXT DEFAULT 'alive',
      notes TEXT,
      caught_at TEXT NOT NULL,
      died_at TEXT,
      died_route TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS soul_links (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      route_id TEXT NOT NULL,
      catch_ids TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS party_slots (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      catch_id TEXT NOT NULL,
      slot INTEGER NOT NULL,
      UNIQUE(run_id, player_id, slot),
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
      FOREIGN KEY (catch_id) REFERENCES catches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      catch_id TEXT,
      route_id TEXT,
      player_id TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS battle_records (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      gym_leader_name TEXT NOT NULL,
      level_cap INTEGER NOT NULL,
      party_snapshot TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_parties (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      name TEXT NOT NULL,
      party_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );
  `)
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export function dbGetAllRuns() {
  const database = getDb()
  const runs = database.prepare('SELECT * FROM runs ORDER BY created_at DESC').all() as any[]
  return runs.map((r) => ({ ...r, ruleset: JSON.parse(r.ruleset) }))
}

export function dbGetRun(id: string) {
  const database = getDb()
  const run = database.prepare('SELECT * FROM runs WHERE id = ?').get(id) as any
  if (!run) return null
  return { ...run, ruleset: JSON.parse(run.ruleset) }
}

export function dbCreateRun(data: {
  name: string
  game: string
  generation: number
  ruleset: object
  collaborative?: boolean
}) {
  const database = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  database
    .prepare(
      'INSERT INTO runs (id, name, game, generation, status, ruleset, collaborative, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(id, data.name, data.game, data.generation, 'active', JSON.stringify(data.ruleset), data.collaborative ? 1 : 0, now, now)
  return dbGetRun(id)!
}

// Creates a minimal local stub for a collaborative run that lives in Supabase.
// The stub lets the app list the run and know to load data from Supabase.
export function dbCreateCollaborativeStub(data: {
  id: string
  name: string
  game: string
  generation: number
  ruleset: object
}) {
  const database = getDb()
  const now = new Date().toISOString()
  // Upsert: if this run ID already exists locally, do nothing
  const existing = database.prepare('SELECT id FROM runs WHERE id = ?').get(data.id)
  if (existing) return dbGetRun(data.id)!
  database
    .prepare(
      'INSERT INTO runs (id, name, game, generation, status, ruleset, collaborative, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(data.id, data.name, data.game, data.generation, 'active', JSON.stringify(data.ruleset), 1, now, now)
  return dbGetRun(data.id)!
}

export function dbUpdateRun(id: string, data: Partial<{ name: string; game: string; generation: number; status: string; ruleset: object }>) {
  const database = getDb()
  const now = new Date().toISOString()
  const fields: string[] = []
  const values: any[] = []
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
  if (data.game !== undefined) { fields.push('game = ?'); values.push(data.game) }
  if (data.generation !== undefined) { fields.push('generation = ?'); values.push(data.generation) }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status) }
  if (data.ruleset !== undefined) { fields.push('ruleset = ?'); values.push(JSON.stringify(data.ruleset)) }
  fields.push('updated_at = ?')
  values.push(now)
  values.push(id)
  database.prepare(`UPDATE runs SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return dbGetRun(id)!
}

export function dbDeleteRun(id: string) {
  const database = getDb()
  database.prepare('DELETE FROM runs WHERE id = ?').run(id)
}

// ── Players ───────────────────────────────────────────────────────────────────

export function dbGetPlayersByRun(runId: string) {
  const database = getDb()
  return database.prepare('SELECT * FROM players WHERE run_id = ? ORDER BY position').all(runId)
}

export function dbCreatePlayer(data: { run_id: string; name: string; position: number; color: string }) {
  const database = getDb()
  const id = uuidv4()
  database
    .prepare('INSERT INTO players (id, run_id, name, position, color) VALUES (?, ?, ?, ?, ?)')
    .run(id, data.run_id, data.name, data.position, data.color)
  return database.prepare('SELECT * FROM players WHERE id = ?').get(id)
}

export function dbUpdatePlayer(id: string, data: Partial<{ name: string; position: number; color: string }>) {
  const database = getDb()
  const fields: string[] = []
  const values: any[] = []
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
  if (data.position !== undefined) { fields.push('position = ?'); values.push(data.position) }
  if (data.color !== undefined) { fields.push('color = ?'); values.push(data.color) }
  values.push(id)
  database.prepare(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return database.prepare('SELECT * FROM players WHERE id = ?').get(id)
}

export function dbDeletePlayer(id: string) {
  const database = getDb()
  database.prepare('DELETE FROM players WHERE id = ?').run(id)
}

// ── Catches ───────────────────────────────────────────────────────────────────

export function dbGetCatchesByRun(runId: string) {
  const database = getDb()
  return database.prepare('SELECT * FROM catches WHERE run_id = ? ORDER BY caught_at').all(runId)
}

export function dbCreateCatch(data: {
  run_id: string
  player_id: string
  route_id: string
  pokemon_id?: number
  pokemon_name?: string
  nickname?: string
  level?: number
  gender?: string
  nature?: string
  ability?: string
  held_item?: string
  notes?: string
}) {
  const database = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO catches (id, run_id, player_id, route_id, pokemon_id, pokemon_name, nickname, level, gender, nature, ability, held_item, status, notes, caught_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'alive', ?, ?)`
    )
    .run(
      id, data.run_id, data.player_id, data.route_id,
      data.pokemon_id ?? null, data.pokemon_name ?? null,
      data.nickname ?? null, data.level ?? 1,
      data.gender ?? null, data.nature ?? null,
      data.ability ?? null, data.held_item ?? null,
      data.notes ?? null, now
    )
  const newCatch = database.prepare('SELECT * FROM catches WHERE id = ?').get(id)
  // Attempt to auto-create a soul link if all players have now caught on this route
  dbCheckAndAutoLink(data.run_id, data.route_id)
  return newCatch
}

export function dbUpdateCatch(id: string, data: Record<string, any>) {
  const database = getDb()
  const allowed = ['pokemon_id', 'pokemon_name', 'nickname', 'level', 'gender', 'nature', 'ability', 'held_item', 'status', 'notes', 'died_at', 'died_route']
  const fields: string[] = []
  const values: any[] = []
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`)
      values.push(data[key])
    }
  }
  if (fields.length === 0) return database.prepare('SELECT * FROM catches WHERE id = ?').get(id)
  values.push(id)
  database.prepare(`UPDATE catches SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return database.prepare('SELECT * FROM catches WHERE id = ?').get(id)
}

export function dbDeleteCatch(id: string) {
  const database = getDb()
  database.prepare('DELETE FROM catches WHERE id = ?').run(id)
}

export function dbKillCatch(catchId: string, diedRoute: string): { killed: any[] } {
  const database = getDb()
  const now = new Date().toISOString()
  const caught = database.prepare('SELECT * FROM catches WHERE id = ?').get(catchId) as any
  if (!caught) return { killed: [] }

  // Find soul link for this catch's route — kill ALL linked partners
  const link = database
    .prepare('SELECT * FROM soul_links WHERE run_id = ? AND route_id = ?')
    .get(caught.run_id, caught.route_id) as any

  const toKill: string[] = [catchId]
  if (link) {
    const linkedIds: string[] = JSON.parse(link.catch_ids)
    for (const lid of linkedIds) {
      if (!toKill.includes(lid)) toKill.push(lid)
    }
  }

  const killed: any[] = []
  for (const id of toKill) {
    database
      .prepare("UPDATE catches SET status = 'dead', died_at = ?, died_route = ? WHERE id = ? AND status = 'alive'")
      .run(now, diedRoute, id)
    // Remove from any party slot
    database.prepare('DELETE FROM party_slots WHERE catch_id = ?').run(id)
    const updated = database.prepare('SELECT * FROM catches WHERE id = ?').get(id)
    if (updated) killed.push(updated)
  }

  // Mark the soul link as broken
  if (link) {
    database.prepare("UPDATE soul_links SET status = 'broken' WHERE id = ?").run(link.id)
  }

  return { killed }
}

// ── Soul Link auto-management ─────────────────────────────────────────────────

// Called after every new catch. Creates a soul link automatically when all players
// have successfully caught on the same route.
export function dbCheckAndAutoLink(runId: string, routeId: string): any | null {
  const database = getDb()

  // If any player has a failed catch on this route, no auto-link is possible
  const failCount = (database
    .prepare("SELECT COUNT(*) as n FROM catches WHERE run_id = ? AND route_id = ? AND status = 'failed'")
    .get(runId, routeId) as any).n
  if (failCount > 0) return null

  const players = database.prepare('SELECT id FROM players WHERE run_id = ? ORDER BY position').all(runId) as any[]
  if (players.length === 0) return null

  // Collect the alive catches per player on this route (one per player expected)
  const aliveCatches = database
    .prepare("SELECT * FROM catches WHERE run_id = ? AND route_id = ? AND status = 'alive'")
    .all(runId, routeId) as any[]

  // Deduplicate by player_id — take the most recent catch if somehow there are multiple
  const byPlayer = new Map<string, any>()
  for (const c of aliveCatches) {
    if (!byPlayer.has(c.player_id)) byPlayer.set(c.player_id, c)
  }

  // All players must have caught
  if (byPlayer.size < players.length) return null

  const catchIds = players.map((p) => byPlayer.get(p.id)!.id)

  // Update or create the soul link
  const existing = database
    .prepare('SELECT * FROM soul_links WHERE run_id = ? AND route_id = ?')
    .get(runId, routeId) as any

  if (existing) {
    database.prepare("UPDATE soul_links SET catch_ids = ?, status = 'active' WHERE id = ?")
      .run(JSON.stringify(catchIds), existing.id)
    const updated = database.prepare('SELECT * FROM soul_links WHERE id = ?').get(existing.id) as any
    return { ...updated, catch_ids: JSON.parse(updated.catch_ids) }
  }

  const id = uuidv4()
  database
    .prepare("INSERT INTO soul_links (id, run_id, route_id, catch_ids, status) VALUES (?, ?, ?, ?, 'active')")
    .run(id, runId, routeId, JSON.stringify(catchIds))
  const link = database.prepare('SELECT * FROM soul_links WHERE id = ?').get(id) as any
  return { ...link, catch_ids: JSON.parse(link.catch_ids) }
}

// Called when a player fails their encounter on a route. Marks all catches on that
// route (from any player) as 'failed', removes them from party, deletes any soul link.
export function dbFailEncounter(runId: string, playerId: string, routeId: string): any {
  const database = getDb()
  const now = new Date().toISOString()

  // Mark any existing alive catches on this route from any player as failed
  const existingCatches = database
    .prepare("SELECT id FROM catches WHERE run_id = ? AND route_id = ? AND status = 'alive'")
    .all(runId, routeId) as any[]
  for (const c of existingCatches) {
    database.prepare("UPDATE catches SET status = 'failed' WHERE id = ?").run(c.id)
    database.prepare('DELETE FROM party_slots WHERE catch_id = ?').run(c.id)
  }

  // Delete any soul link for this route
  database.prepare('DELETE FROM soul_links WHERE run_id = ? AND route_id = ?').run(runId, routeId)

  // Insert a failed-encounter record for this player (so we know they attempted)
  const id = uuidv4()
  database
    .prepare("INSERT INTO catches (id, run_id, player_id, route_id, status, caught_at) VALUES (?, ?, ?, ?, 'failed', ?)")
    .run(id, runId, playerId, routeId, now)

  return database.prepare('SELECT * FROM catches WHERE id = ?').get(id)
}

// ── Soul Links ────────────────────────────────────────────────────────────────

export function dbGetSoulLinksByRun(runId: string) {
  const database = getDb()
  const links = database.prepare('SELECT * FROM soul_links WHERE run_id = ?').all(runId) as any[]
  return links.map((l) => ({ ...l, catch_ids: JSON.parse(l.catch_ids) }))
}

export function dbCreateSoulLink(data: { run_id: string; route_id: string; catch_ids: string[] }) {
  const database = getDb()
  const id = uuidv4()
  database
    .prepare('INSERT INTO soul_links (id, run_id, route_id, catch_ids) VALUES (?, ?, ?, ?)')
    .run(id, data.run_id, data.route_id, JSON.stringify(data.catch_ids))
  const link = database.prepare('SELECT * FROM soul_links WHERE id = ?').get(id) as any
  return { ...link, catch_ids: JSON.parse(link.catch_ids) }
}

export function dbUpdateSoulLink(id: string, data: { catchIds?: string[]; nickname?: string | null }) {
  const database = getDb()
  if (data.catchIds !== undefined) {
    database.prepare('UPDATE soul_links SET catch_ids = ? WHERE id = ?').run(JSON.stringify(data.catchIds), id)
  }
  if (data.nickname !== undefined) {
    database.prepare('UPDATE soul_links SET nickname = ? WHERE id = ?').run(data.nickname, id)
  }
  const link = database.prepare('SELECT * FROM soul_links WHERE id = ?').get(id) as any
  return { ...link, catch_ids: JSON.parse(link.catch_ids) }
}

export function dbDeleteSoulLink(id: string) {
  const database = getDb()
  database.prepare('DELETE FROM soul_links WHERE id = ?').run(id)
}

// ── Party Slots ───────────────────────────────────────────────────────────────

export function dbGetPartyByPlayer(runId: string, playerId: string) {
  const database = getDb()
  return database
    .prepare('SELECT * FROM party_slots WHERE run_id = ? AND player_id = ? ORDER BY slot')
    .all(runId, playerId)
}

export function dbSetPartySlot(runId: string, playerId: string, slot: number, catchId: string) {
  const database = getDb()
  const existing = database
    .prepare('SELECT * FROM party_slots WHERE run_id = ? AND player_id = ? AND slot = ?')
    .get(runId, playerId, slot)

  if (existing) {
    database
      .prepare('UPDATE party_slots SET catch_id = ? WHERE run_id = ? AND player_id = ? AND slot = ?')
      .run(catchId, runId, playerId, slot)
  } else {
    const id = uuidv4()
    database
      .prepare('INSERT INTO party_slots (id, run_id, player_id, catch_id, slot) VALUES (?, ?, ?, ?, ?)')
      .run(id, runId, playerId, catchId, slot)
  }
  return database
    .prepare('SELECT * FROM party_slots WHERE run_id = ? AND player_id = ? AND slot = ?')
    .get(runId, playerId, slot)
}

export function dbClearPartySlot(runId: string, playerId: string, slot: number) {
  const database = getDb()
  database
    .prepare('DELETE FROM party_slots WHERE run_id = ? AND player_id = ? AND slot = ?')
    .run(runId, playerId, slot)
}

export function dbClearAllParty(runId: string, playerId: string) {
  const database = getDb()
  database.prepare('DELETE FROM party_slots WHERE run_id = ? AND player_id = ?').run(runId, playerId)
}

// Adds ALL members of a soul link to their respective players' parties.
// Each member is placed in the first open slot for their player.
// Returns the created party slots.
export function dbAddSoulLinkToParty(runId: string, catchId: string): any[] {
  const database = getDb()

  // Find the active soul link containing this catch
  const links = database
    .prepare("SELECT * FROM soul_links WHERE run_id = ? AND status = 'active'")
    .all(runId) as any[]
  const link = links.find((l) => {
    const ids: string[] = JSON.parse(l.catch_ids)
    return ids.includes(catchId)
  })
  if (!link) return []

  const catchIds: string[] = JSON.parse(link.catch_ids)
  const created: any[] = []

  for (const cid of catchIds) {
    const c = database.prepare('SELECT * FROM catches WHERE id = ?').get(cid) as any
    if (!c || c.status !== 'alive') continue

    // Find this player's occupied slots
    const usedSlots = (database
      .prepare('SELECT slot FROM party_slots WHERE run_id = ? AND player_id = ?')
      .all(runId, c.player_id) as any[]).map((s) => s.slot as number)

    const nextSlot = [0, 1, 2, 3, 4, 5].find((s) => !usedSlots.includes(s))
    if (nextSlot === undefined) continue // party full for this player

    const id = uuidv4()
    database
      .prepare('INSERT INTO party_slots (id, run_id, player_id, catch_id, slot) VALUES (?, ?, ?, ?, ?)')
      .run(id, runId, c.player_id, cid, nextSlot)
    created.push(database.prepare('SELECT * FROM party_slots WHERE id = ?').get(id))
  }

  return created
}

// Removes ALL members of a soul link from all players' parties, then compacts
// each affected player's remaining slots to fill from left (slot 0) with no gaps.
export function dbRemoveSoulLinkFromParty(runId: string, catchId: string): void {
  const database = getDb()

  const links = database.prepare('SELECT * FROM soul_links WHERE run_id = ?').all(runId) as any[]
  const link = links.find((l) => {
    const ids: string[] = JSON.parse(l.catch_ids)
    return ids.includes(catchId)
  })

  // Collect which player IDs are affected before deleting
  const affectedPlayerIds = new Set<string>()
  if (link) {
    const catchIds: string[] = JSON.parse(link.catch_ids)
    for (const cid of catchIds) {
      const row = database.prepare('SELECT player_id FROM party_slots WHERE catch_id = ?').get(cid) as any
      if (row) affectedPlayerIds.add(row.player_id)
      database.prepare('DELETE FROM party_slots WHERE catch_id = ?').run(cid)
    }
  } else {
    const row = database.prepare('SELECT player_id FROM party_slots WHERE catch_id = ?').get(catchId) as any
    if (row) affectedPlayerIds.add(row.player_id)
    database.prepare('DELETE FROM party_slots WHERE catch_id = ?').run(catchId)
  }

  // Compact: renumber each affected player's remaining slots 0, 1, 2, …
  for (const playerId of affectedPlayerIds) {
    const remaining = database
      .prepare('SELECT id, slot FROM party_slots WHERE run_id = ? AND player_id = ? ORDER BY slot ASC')
      .all(runId, playerId) as { id: string; slot: number }[]
    remaining.forEach(({ id }, i) => {
      database.prepare('UPDATE party_slots SET slot = ? WHERE id = ?').run(i, id)
    })
  }
}

// ── Export / Import ───────────────────────────────────────────────────────────

export function dbExportRun(runId: string) {
  const database = getDb()
  const run = dbGetRun(runId)
  if (!run) throw new Error('Run not found')

  const players = database.prepare('SELECT * FROM players WHERE run_id = ? ORDER BY position').all(runId)
  const catches = database.prepare('SELECT * FROM catches WHERE run_id = ? ORDER BY caught_at').all(runId)
  const soulLinksRaw = database.prepare('SELECT * FROM soul_links WHERE run_id = ?').all(runId) as any[]
  const soulLinks = soulLinksRaw.map((l) => ({ ...l, catch_ids: JSON.parse(l.catch_ids) }))
  const partySlots = database.prepare('SELECT * FROM party_slots WHERE run_id = ?').all(runId)
  const notes = database.prepare('SELECT * FROM notes WHERE run_id = ? ORDER BY created_at').all(runId)
  const battleRecordsRaw = database.prepare('SELECT * FROM battle_records WHERE run_id = ? ORDER BY created_at').all(runId) as any[]
  const battleRecords = battleRecordsRaw.map((b) => ({ ...b, party_snapshot: JSON.parse(b.party_snapshot) }))
  const savedPartiesRaw = database.prepare('SELECT * FROM saved_parties WHERE run_id = ? ORDER BY created_at').all(runId) as any[]
  const savedParties = savedPartiesRaw.map((p) => ({ ...p, party_snapshot: JSON.parse(p.party_snapshot) }))

  return { version: 1, exported_at: new Date().toISOString(), run, players, catches, soul_links: soulLinks, party_slots: partySlots, notes, battle_records: battleRecords, saved_parties: savedParties }
}

export function dbImportRun(data: any) {
  const database = getDb()

  if (data.version !== 1 || !data.run || !Array.isArray(data.players)) {
    throw new Error('Invalid or unsupported export file format')
  }

  const idMap = new Map<string, string>()
  function remap(oldId: string): string {
    if (!idMap.has(oldId)) idMap.set(oldId, uuidv4())
    return idMap.get(oldId)!
  }

  const newRunId = remap(data.run.id)
  const now = new Date().toISOString()

  const doImport = database.transaction(() => {
    database.prepare(
      'INSERT INTO runs (id, name, game, generation, status, ruleset, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(newRunId, data.run.name, data.run.game, data.run.generation, data.run.status ?? 'active', JSON.stringify(data.run.ruleset ?? {}), data.run.created_at, now)

    for (const p of (data.players as any[])) {
      database.prepare('INSERT INTO players (id, run_id, name, position, color) VALUES (?, ?, ?, ?, ?)')
        .run(remap(p.id), newRunId, p.name, p.position, p.color)
    }

    for (const c of (data.catches as any[])) {
      database.prepare(
        `INSERT INTO catches (id, run_id, player_id, route_id, pokemon_id, pokemon_name, nickname, level, gender, nature, ability, held_item, status, notes, caught_at, died_at, died_route)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        remap(c.id), newRunId, remap(c.player_id), c.route_id,
        c.pokemon_id ?? null, c.pokemon_name ?? null, c.nickname ?? null, c.level ?? 1,
        c.gender ?? null, c.nature ?? null, c.ability ?? null, c.held_item ?? null,
        c.status ?? 'alive', c.notes ?? null, c.caught_at, c.died_at ?? null, c.died_route ?? null
      )
    }

    for (const sl of (data.soul_links as any[])) {
      const catchIds = (Array.isArray(sl.catch_ids) ? sl.catch_ids : JSON.parse(sl.catch_ids))
        .map((cid: string) => remap(cid))
      database.prepare("INSERT INTO soul_links (id, run_id, route_id, catch_ids, status) VALUES (?, ?, ?, ?, ?)")
        .run(remap(sl.id), newRunId, sl.route_id, JSON.stringify(catchIds), sl.status ?? 'active')
    }

    for (const ps of (data.party_slots as any[])) {
      database.prepare('INSERT INTO party_slots (id, run_id, player_id, catch_id, slot) VALUES (?, ?, ?, ?, ?)')
        .run(remap(ps.id), newRunId, remap(ps.player_id), remap(ps.catch_id), ps.slot)
    }

    for (const n of ((data.notes ?? []) as any[])) {
      database.prepare(
        'INSERT INTO notes (id, run_id, catch_id, route_id, player_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        remap(n.id), newRunId,
        n.catch_id ? remap(n.catch_id) : null,
        n.route_id ?? null,
        n.player_id ? remap(n.player_id) : null,
        n.content, n.created_at, n.updated_at ?? now
      )
    }

    for (const b of ((data.battle_records ?? []) as any[])) {
      const snapshot = (Array.isArray(b.party_snapshot) ? b.party_snapshot : JSON.parse(b.party_snapshot))
        .map((entry: any) => ({
          player_id: remap(entry.player_id),
          slots: entry.slots.map((s: any) => ({ slot: s.slot, catch_id: remap(s.catch_id) }))
        }))
      database.prepare(
        'INSERT INTO battle_records (id, run_id, gym_leader_name, level_cap, party_snapshot, outcome, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        remap(b.id), newRunId, b.gym_leader_name, b.level_cap,
        JSON.stringify(snapshot), b.outcome ?? 'pending', b.created_at, b.completed_at ?? null
      )
    }

    for (const sp of ((data.saved_parties ?? []) as any[])) {
      const snapshot = (Array.isArray(sp.party_snapshot) ? sp.party_snapshot : JSON.parse(sp.party_snapshot))
        .map((entry: any) => ({
          player_id: remap(entry.player_id),
          slots: entry.slots.map((s: any) => ({ slot: s.slot, catch_id: remap(s.catch_id) }))
        }))
      database.prepare(
        'INSERT INTO saved_parties (id, run_id, name, party_snapshot, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(remap(sp.id), newRunId, sp.name, JSON.stringify(snapshot), sp.created_at)
    }
  })

  doImport()
  return dbGetRun(newRunId)!
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export function dbGetNotesByRun(runId: string) {
  const database = getDb()
  return database.prepare('SELECT * FROM notes WHERE run_id = ? ORDER BY updated_at DESC').all(runId)
}

export function dbCreateNote(data: {
  run_id: string
  catch_id?: string
  route_id?: string
  player_id?: string
  content: string
}) {
  const database = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  database
    .prepare(
      'INSERT INTO notes (id, run_id, catch_id, route_id, player_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(id, data.run_id, data.catch_id ?? null, data.route_id ?? null, data.player_id ?? null, data.content, now, now)
  return database.prepare('SELECT * FROM notes WHERE id = ?').get(id)
}

export function dbUpdateNote(id: string, content: string) {
  const database = getDb()
  const now = new Date().toISOString()
  database.prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?').run(content, now, id)
  return database.prepare('SELECT * FROM notes WHERE id = ?').get(id)
}

export function dbDeleteNote(id: string) {
  const database = getDb()
  database.prepare('DELETE FROM notes WHERE id = ?').run(id)
}

// ── Battle Records ─────────────────────────────────────────────────────────────

export function dbGetBattlesByRun(runId: string) {
  const database = getDb()
  const records = database.prepare('SELECT * FROM battle_records WHERE run_id = ? ORDER BY created_at').all(runId) as any[]
  return records.map((r) => ({ ...r, party_snapshot: JSON.parse(r.party_snapshot) }))
}

export function dbCreateBattle(data: {
  run_id: string
  gym_leader_name: string
  level_cap: number
  party_snapshot: object
}) {
  const database = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  database
    .prepare(
      'INSERT INTO battle_records (id, run_id, gym_leader_name, level_cap, party_snapshot, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(id, data.run_id, data.gym_leader_name, data.level_cap, JSON.stringify(data.party_snapshot), 'pending', now)
  const record = database.prepare('SELECT * FROM battle_records WHERE id = ?').get(id) as any
  return { ...record, party_snapshot: JSON.parse(record.party_snapshot) }
}

export function dbUpdateBattle(id: string, data: { outcome: string }) {
  const database = getDb()
  const now = new Date().toISOString()
  database
    .prepare("UPDATE battle_records SET outcome = ?, completed_at = ? WHERE id = ?")
    .run(data.outcome, now, id)
  const record = database.prepare('SELECT * FROM battle_records WHERE id = ?').get(id) as any
  return { ...record, party_snapshot: JSON.parse(record.party_snapshot) }
}

export function dbDeleteBattle(id: string) {
  const database = getDb()
  database.prepare('DELETE FROM battle_records WHERE id = ?').run(id)
}

// ── Saved Parties ─────────────────────────────────────────────────────────────

export function dbGetSavedPartiesByRun(runId: string) {
  const database = getDb()
  const rows = database.prepare('SELECT * FROM saved_parties WHERE run_id = ? ORDER BY created_at DESC').all(runId) as any[]
  return rows.map((r) => ({ ...r, party_snapshot: JSON.parse(r.party_snapshot) }))
}

export function dbCreateSavedParty(data: { run_id: string; name: string; party_snapshot: object }) {
  const database = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  database
    .prepare('INSERT INTO saved_parties (id, run_id, name, party_snapshot, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, data.run_id, data.name, JSON.stringify(data.party_snapshot), now)
  const row = database.prepare('SELECT * FROM saved_parties WHERE id = ?').get(id) as any
  return { ...row, party_snapshot: JSON.parse(row.party_snapshot) }
}

export function dbDeleteSavedParty(id: string) {
  const database = getDb()
  database.prepare('DELETE FROM saved_parties WHERE id = ?').run(id)
}
