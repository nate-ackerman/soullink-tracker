// ── Domain Types ──────────────────────────────────────────────────────────────
//
// All types mirror the SQLite schema in src/main/db.ts. JSON columns (ruleset,
// catch_ids, party_snapshot) are parsed to their object forms before reaching
// the renderer — never raw strings.

// ── Ruleset ───────────────────────────────────────────────────────────────────

/** Configuration rules for a run. Stored as JSON in the runs.ruleset column. */
export interface Ruleset {
  playerCount: 2 | 3 | 4
  typeOverlap: boolean           // Whether type-overlap restrictions are active
  dupeClause: boolean            // Can't catch the same species twice per player
  speciesClause: boolean         // Only one of each species across all players
  nicknameRequired: boolean      // Nicknames must be set for all Pokémon
  sharedLives: boolean           // Any death ends the run for all players
  customRules: string[]          // Free-text custom rules displayed on dashboard

  // Type limit rules (0 = no limit)
  maxSharedTypeCount?: number    // Max of any one primary type across all parties combined
  maxSameTeamTypeCount?: number  // Max of any one primary type within a single player's party

  trainerLevelModifier?: number  // Level cap scaling: 100 = normal, 150 = +50% harder

  guaranteedEvolutionLevel?: number | null  // All Pokémon are treated as fully evolved at this level

  // Encounter customization (stored per-run, applied when rendering the route list)
  hiddenEncounters?: string[]                        // Route IDs to hide from the encounter list
  addedEncounters?: { id: string; name: string }[]  // User-defined extra encounter slots
  renamedEncounters?: Record<string, string>         // Display name overrides keyed by route ID
}

// ── Run ───────────────────────────────────────────────────────────────────────

/** A Soul Link Nuzlocke run. The top-level container for all run data. */
export interface Run {
  id: string
  name: string
  game: string          // Game ID, e.g. 'sword-shield' — matches GAMES in src/renderer/src/data/games.ts
  generation: number    // Pokémon generation number, used for gen-accurate type matchups
  status: 'active' | 'completed' | 'failed'
  ruleset: Ruleset
  created_at: string
  updated_at: string
  collaborative?: boolean  // If true, data lives in Supabase; local DB only holds a stub
  players?: Player[]       // Populated by some API responses; prefer the separate players array in the store
}

// ── Player ────────────────────────────────────────────────────────────────────

/** One participant in a run. Each player has their own encounter slots. */
export interface Player {
  id: string
  run_id: string
  name: string
  position: number  // Display order (0-indexed)
  color: string     // Hex color used for player labels and borders
}

// ── Catch ─────────────────────────────────────────────────────────────────────

/**
 * A single encounter attempt on a route. One row per player per route.
 *
 * Status flow:
 *   'alive'  — Pokémon was caught and is still living
 *   'dead'   — Pokémon fainted (and all soul link partners were also killed)
 *   'failed' — Encounter was attempted but the Pokémon was not caught,
 *              OR the route failed because a linked partner failed theirs
 *
 * Note: 'boxed' was a legacy status that has since been removed. Existing DB
 * rows may still carry it, but no new rows will ever be created with it.
 */
export interface Catch {
  id: string
  run_id: string
  player_id: string
  route_id: string        // Matches a route ID from GAMES in src/renderer/src/data/games.ts
  pokemon_id: number | null   // PokéAPI Pokémon ID (null if not yet identified)
  pokemon_name: string | null // Base species name, lowercase (e.g. 'pikachu')
  nickname: string | null     // Player-given nickname; synced with soul_links.nickname
  level: number               // Level at time of catch (used for level cap display)
  status: 'alive' | 'dead' | 'failed'
  notes: string | null        // Per-catch free-text notes
  caught_at: string           // ISO timestamp
  died_at: string | null      // ISO timestamp, set when killed
  died_route: string | null   // Location name where the Pokémon died
}

// ── Soul Link ─────────────────────────────────────────────────────────────────

/**
 * A soul link ties one catch per player on the same route together.
 * Created automatically by the DB when all players have caught on a route.
 *
 * catch_ids is stored as a JSON array in SQLite but is always parsed to string[]
 * before reaching the renderer.
 *
 * Status:
 *   'active'  — All linked Pokémon are alive
 *   'broken'  — At least one linked Pokémon has died
 */
export interface SoulLink {
  id: string
  run_id: string
  route_id: string
  catch_ids: string[]     // One catch ID per player; parsed from JSON column
  nickname: string | null // Shared nickname; synced with each linked catch's nickname
  status: 'active' | 'broken'
}

// ── Party Slot ────────────────────────────────────────────────────────────────

/**
 * Represents one Pokémon in a player's active battle party (max 6 per player).
 * Slots are 0-indexed and always compacted (no gaps) after removal.
 */
export interface PartySlot {
  id: string
  run_id: string
  player_id: string
  catch_id: string
  slot: number  // 0–5
}

// ── Note ──────────────────────────────────────────────────────────────────────

/**
 * A free-text note scoped to a run. Optionally linked to a specific catch,
 * route, or player for contextual display. All link fields are nullable.
 */
export interface Note {
  id: string
  run_id: string
  catch_id: string | null
  route_id: string | null
  player_id: string | null
  content: string
  created_at: string
  updated_at: string
}

// ── Battle Record ─────────────────────────────────────────────────────────────

/**
 * Snapshot of the party used for a major battle (gym, rival, E4, Champion).
 *
 * party_snapshot is stored as JSON in SQLite but is always parsed before
 * reaching the renderer.
 *
 * Lifecycle: created as 'pending' when the party is locked in, then moved to
 * 'victory' when the battle is completed. Deaths can be marked while pending.
 */
export interface BattleRecord {
  id: string
  run_id: string
  gym_leader_name: string
  level_cap: number           // The adjusted cap at the time the party was locked in
  party_snapshot: PartySnapshot[]
  outcome: 'pending' | 'victory'
  created_at: string
  completed_at: string | null
}

// ── Saved Party ───────────────────────────────────────────────────────────────

/**
 * A named snapshot of a party composition saved for later recall.
 * Separate from battle_records — these are user-curated, not battle-gated.
 */
export interface SavedParty {
  id: string
  run_id: string
  name: string
  party_snapshot: PartySnapshot[]
  created_at: string
}

// ── Shared sub-types ──────────────────────────────────────────────────────────

/** Slot-level party snapshot. One entry per player; used in BattleRecord and SavedParty. */
export interface PartySnapshot {
  player_id: string
  slots: { slot: number; catch_id: string }[]
}

// ── Input types ───────────────────────────────────────────────────────────────
// These mirror the DB function signatures and are used as IPC/API call payloads.

export interface CreateRunInput {
  name: string
  game: string
  generation: number
  players: { name: string; color: string }[]
  ruleset: Ruleset
}

export interface CreatePlayerInput {
  run_id: string
  name: string
  position: number
  color: string
}

export interface CreateCatchInput {
  run_id: string
  player_id: string
  route_id: string
  pokemon_id?: number
  pokemon_name?: string
  nickname?: string
  level?: number
  notes?: string
}

export interface CreateSoulLinkInput {
  run_id: string
  route_id: string
  catch_ids: string[]
}

export interface CreateNoteInput {
  run_id: string
  catch_id?: string
  route_id?: string
  player_id?: string
  content: string
}
