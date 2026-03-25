export interface Ruleset {
  playerCount: 2 | 3 | 4
  typeOverlap: boolean
  dupeClause: boolean
  speciesClause: boolean
  nicknameRequired: boolean
  sharedLives: boolean
  customRules: string[]
  maxSharedTypeCount?: number    // 0 = no limit; 1–6 = max of any one type across all parties combined
  maxSameTeamTypeCount?: number  // 0 = no limit; 1–6 = max of any one type within a single player's party
  trainerLevelModifier?: number  // 100 = normal; 150 = +50% harder; stored as full percentage
  guaranteedEvolutionLevel?: number | null  // null = off; number = level at which all Pokémon become fully evolved
  hiddenEncounters?: string[]                        // default encounter IDs to hide
  addedEncounters?: { id: string; name: string }[]  // custom user-added encounters
  renamedEncounters?: Record<string, string>         // overridden display names keyed by route ID
}

export interface Run {
  id: string
  name: string
  game: string
  generation: number
  status: 'active' | 'completed' | 'failed'
  ruleset: Ruleset
  created_at: string
  updated_at: string
  collaborative?: boolean
  players?: Player[]
}

export interface Player {
  id: string
  run_id: string
  name: string
  position: number
  color: string
}

export interface Catch {
  id: string
  run_id: string
  player_id: string
  route_id: string
  pokemon_id: number | null
  pokemon_name: string | null
  nickname: string | null
  level: number
  // 'failed' = encounter attempted but Pokémon not caught (or route failed due to partner)
  status: 'alive' | 'dead' | 'failed'
  notes: string | null
  caught_at: string
  died_at: string | null
  died_route: string | null
}

export interface SoulLink {
  id: string
  run_id: string
  route_id: string
  catch_ids: string[]
  nickname: string | null
  // 'active' = all members alive; 'broken' = any member has fainted
  status: 'active' | 'broken'
}

export interface PartySlot {
  id: string
  run_id: string
  player_id: string
  catch_id: string
  slot: number
}

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

export interface PartySnapshot {
  player_id: string
  slots: { slot: number; catch_id: string }[]
}

export interface BattleRecord {
  id: string
  run_id: string
  gym_leader_name: string
  level_cap: number
  party_snapshot: PartySnapshot[]
  outcome: 'pending' | 'victory'
  created_at: string
  completed_at: string | null
}

export interface SavedParty {
  id: string
  run_id: string
  name: string
  party_snapshot: PartySnapshot[]
  created_at: string
}
