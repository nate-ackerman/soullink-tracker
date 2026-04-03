import { useQuery, useQueries, type QueryClient } from '@tanstack/react-query'
import { getTypeMatchups } from '../data/typeColors'

const BASE_URL = 'https://pokeapi.co/api/v2'

export function getSpriteUrl(pokemonId: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonId}.png`
}

export function getShinyUrl(pokemonId: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${pokemonId}.png`
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`PokéAPI error: ${res.status} ${url}`)
  return res.json()
}

export const GEN_NAME_TO_NUM: Record<string, number> = {
  'generation-i': 1, 'generation-ii': 2, 'generation-iii': 3,
  'generation-iv': 4, 'generation-v': 5, 'generation-vi': 6,
  'generation-vii': 7, 'generation-viii': 8, 'generation-ix': 9
}

export interface PokemonData {
  id: number
  name: string
  types: { slot: number; type: { name: string } }[]
  past_types: {
    generation: { name: string }
    types: { slot: number; type: { name: string } }[]
  }[]
  sprites: {
    front_default: string | null
    front_shiny: string | null
    other?: {
      'official-artwork'?: { front_default: string | null }
    }
  }
  stats: { base_stat: number; stat: { name: string } }[]
  moves: {
    move: { name: string; url: string }
    version_group_details: {
      level_learned_at: number
      move_learn_method: { name: string }
      version_group: { name: string }
    }[]
  }[]
  height: number
  weight: number
  base_experience: number
  species: { name: string; url: string }
  abilities: { ability: { name: string; url: string }; is_hidden: boolean; slot: number }[]
}

export interface AbilityData {
  id: number
  name: string
  effect_entries: { effect: string; short_effect: string; language: { name: string } }[]
  effect_changes: {
    version_group: { name: string }
    effect_entries: { effect: string; language: { name: string } }[]
  }[]
  flavor_text_entries: { flavor_text: string; language: { name: string }; version_group: { name: string } }[]
}

// Returns the types a Pokémon had in a given generation, using past_types when applicable.
export function getPokemonTypes(data: PokemonData, generation: number): string[] {
  if (data.past_types && data.past_types.length > 0) {
    const relevant = data.past_types
      .map((pt) => ({ genNum: GEN_NAME_TO_NUM[pt.generation.name] ?? 99, types: pt.types }))
      .filter((pt) => pt.genNum >= generation)
      .sort((a, b) => a.genNum - b.genNum)
    if (relevant.length > 0) return relevant[0].types.map((t) => t.type.name)
  }
  return data.types.map((t) => t.type.name)
}

export interface PokemonSpeciesData {
  id: number
  name: string
  capture_rate: number
  base_happiness: number
  is_legendary: boolean
  is_mythical: boolean
  generation: { name: string }
  flavor_text_entries: { flavor_text: string; language: { name: string } }[]
  genera: { genus: string; language: { name: string } }[]
  evolution_chain: { url: string }
}

export interface ChainLink {
  species: { name: string; url: string }
  evolves_to: ChainLink[]
  evolution_details: {
    trigger: { name: string }
    min_level: number | null
    item: { name: string } | null
  }[]
}

export interface EvolutionChainData {
  id: number
  chain: ChainLink
}

export interface PokemonListItem {
  name: string
  url: string
}

export interface PokemonListResponse {
  count: number
  results: PokemonListItem[]
}

export interface MoveData {
  id: number
  name: string
  type: { name: string }
  damage_class: { name: string }
  power: number | null
  accuracy: number | null
  pp: number | null
  effect_chance: number | null
  effect_entries: { effect: string; short_effect: string; language: { name: string } }[]
  effect_changes: {
    version_group: { name: string }
    effect_entries: { effect: string; language: { name: string } }[]
  }[]
  machines: { machine: { url: string }; version_group: { name: string } }[]
}

export interface MachineData {
  id: number
  item: { name: string }   // e.g. "tm01", "hm06"
  move: { name: string }
  version_group: { name: string }
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function usePokemonByName(name: string) {
  return useQuery({
    queryKey: ['pokemon', name.toLowerCase()],
    queryFn: () => fetchJson<PokemonData>(`${BASE_URL}/pokemon/${name.toLowerCase()}`),
    enabled: !!name && name.length > 0,
    staleTime: Infinity,
    retry: 1
  })
}

// Prefetch a pokemon by ID into an existing queryClient (for background preloading)
export function prefetchPokemonById(queryClient: QueryClient, id: number): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: ['pokemon', id],
    queryFn: () => fetchJson<PokemonData>(`${BASE_URL}/pokemon/${id}`),
    staleTime: Infinity,
  })
}

export function usePokemonById(id: number) {
  return useQuery({
    queryKey: ['pokemon', id],
    queryFn: () => fetchJson<PokemonData>(`${BASE_URL}/pokemon/${id}`),
    enabled: !!id && id > 0,
    staleTime: Infinity,
    retry: 1
  })
}

export function usePokemonList(limit = 151, offset = 0) {
  return useQuery({
    queryKey: ['pokemon-list', limit, offset],
    queryFn: () => fetchJson<PokemonListResponse>(`${BASE_URL}/pokemon?limit=${limit}&offset=${offset}`),
    staleTime: Infinity
  })
}

export function usePokemonSearch(query: string) {
  return useQuery({
    queryKey: ['pokemon-search-list'],
    queryFn: () => fetchJson<PokemonListResponse>(`${BASE_URL}/pokemon?limit=1010&offset=0`),
    staleTime: Infinity,
    select: (data) => ({
      ...data,
      results: query
        ? data.results.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 20)
        : data.results.slice(0, 20)
    })
  })
}

export function usePokemonSpecies(id: number) {
  return useQuery({
    queryKey: ['pokemon-species', id],
    queryFn: () => fetchJson<PokemonSpeciesData>(`${BASE_URL}/pokemon-species/${id}`),
    enabled: !!id && id > 0,
    staleTime: Infinity,
    retry: 1
  })
}

// Batch-fetch species by name (PokeAPI accepts name or id). Returns a map of name → data.
export function usePokemonSpeciesBatch(names: string[]): Map<string, PokemonSpeciesData> {
  const results = useQueries({
    queries: names.map((name) => ({
      queryKey: ['pokemon-species-name', name],
      queryFn: () => fetchJson<PokemonSpeciesData>(`${BASE_URL}/pokemon-species/${name}`),
      staleTime: Infinity,
      enabled: !!name,
    })),
  })
  const map = new Map<string, PokemonSpeciesData>()
  names.forEach((name, i) => {
    const data = results[i]?.data
    if (data) map.set(name, data)
  })
  return map
}

export interface LearnsetMove {
  name: string
  url: string
  learnMethod: string
  levelLearnedAt: number
  type?: string
  damageClass?: string
  power?: number | null
  accuracy?: number | null
  pp?: number | null
}

// Maps game IDs (as stored in Run.game) to their PokeAPI version group name(s).
// A game maps to exactly one version group; the array form is kept for filter consistency.
export const GAME_VERSION_GROUPS: Record<string, string[]> = {
  red:        ['red-blue'],
  blue:       ['red-blue'],
  yellow:     ['yellow'],
  gold:       ['gold-silver'],
  silver:     ['gold-silver'],
  crystal:    ['crystal'],
  ruby:       ['ruby-sapphire'],
  sapphire:   ['ruby-sapphire'],
  emerald:    ['emerald'],
  firered:    ['firered-leafgreen'],
  leafgreen:  ['firered-leafgreen'],
  diamond:    ['diamond-pearl'],
  pearl:      ['diamond-pearl'],
  platinum:   ['platinum'],
  heartgold:  ['heartgold-soulsilver'],
  soulsilver: ['heartgold-soulsilver'],
  black:           ['black-white'],
  white:           ['black-white'],
  black2:          ['black-2-white-2'],
  white2:          ['black-2-white-2'],
  x:               ['x-y'],
  y:               ['x-y'],
  'omega-ruby':    ['omega-ruby-alpha-sapphire'],
  'alpha-sapphire':['omega-ruby-alpha-sapphire'],
  sun:             ['sun-moon'],
  moon:            ['sun-moon'],
  'ultra-sun':     ['ultra-sun-ultra-moon'],
  'ultra-moon':    ['ultra-sun-ultra-moon'],
}

// Fallback: all version groups for a generation (used when game ID is unknown).
const GEN_VERSION_GROUPS: Record<number, string[]> = {
  1: ['red-blue', 'yellow'],
  2: ['gold-silver', 'crystal'],
  3: ['ruby-sapphire', 'emerald', 'firered-leafgreen'],
  4: ['diamond-pearl', 'platinum', 'heartgold-soulsilver'],
  5: ['black-white', 'black-2-white-2'],
  6: ['x-y', 'omega-ruby-alpha-sapphire'],
  7: ['sun-moon', 'ultra-sun-ultra-moon'],
}

// Inverted map: version group name → generation number.
// Covers gen 6–9 too so effect_changes entries from later gens can be correctly ordered.
export const VERSION_GROUP_TO_GEN: Record<string, number> = (() => {
  const map: Record<string, number> = {}
  const all: Record<number, string[]> = {
    ...GEN_VERSION_GROUPS,
    6: ['x-y', 'omega-ruby-alpha-sapphire'],
    7: ['sun-moon', 'ultra-sun-ultra-moon', 'lets-go-pikachu-lets-go-eevee'],
    8: ['sword-shield', 'brilliant-diamond-and-shining-pearl', 'legends-arceus'],
    9: ['scarlet-violet'],
  }
  for (const [gen, groups] of Object.entries(all)) {
    for (const vg of groups) map[vg] = Number(gen)
  }
  return map
})()

export function getVersionGroups(gameId: string, generation: number): string[] {
  return GAME_VERSION_GROUPS[gameId] ?? GEN_VERSION_GROUPS[generation] ?? []
}

// Pure extraction — works on already-fetched PokemonData, no extra request needed.
export function extractMovesForGeneration(data: PokemonData, gameId: string, generation: number): LearnsetMove[] {
  const exactGroups = getVersionGroups(gameId, generation)
  const moves: LearnsetMove[] = []
  for (const moveEntry of data.moves) {
    const relevantDetails = moveEntry.version_group_details.filter((d) =>
      exactGroups.includes(d.version_group.name)
    )
    if (relevantDetails.length === 0) continue
    const seen = new Set<string>()
    for (const detail of relevantDetails) {
      const method = detail.move_learn_method.name
      if (!seen.has(method)) {
        seen.add(method)
        moves.push({
          name: moveEntry.move.name,
          url: moveEntry.move.url,
          learnMethod: method,
          levelLearnedAt: detail.level_learned_at
        })
      }
    }
  }
  return moves
}

export function useMoveDetails(moveName: string) {
  return useQuery({
    queryKey: ['move', moveName],
    queryFn: () => fetchJson<MoveData>(`${BASE_URL}/move/${moveName}`),
    enabled: !!moveName,
    staleTime: Infinity
  })
}

// Fetches machine data for a list of machine URLs in parallel.
// Returns a map of machine URL → MachineData.
export function useMachineBatch(machineUrls: string[]): Map<string, MachineData> {
  const results = useQueries({
    queries: machineUrls.map((url) => ({
      queryKey: ['machine', url],
      queryFn: () => fetchJson<MachineData>(url),
      staleTime: Infinity,
      enabled: !!url,
    })),
  })
  const map = new Map<string, MachineData>()
  machineUrls.forEach((url, i) => {
    const data = results[i]?.data
    if (data) map.set(url, data)
  })
  return map
}

// Fetches details for a list of moves in parallel. Returns a map of name → MoveData.
export function useMoveDetailsBatch(moveNames: string[]): Map<string, MoveData> {
  const results = useQueries({
    queries: moveNames.map((name) => ({
      queryKey: ['move', name],
      queryFn: () => fetchJson<MoveData>(`${BASE_URL}/move/${name}`),
      staleTime: Infinity,
      enabled: !!name,
    })),
  })
  const map = new Map<string, MoveData>()
  moveNames.forEach((name, i) => {
    const data = results[i]?.data
    if (data) map.set(name, data)
  })
  return map
}

export function useAbilityBatch(abilityNames: string[]): Map<string, AbilityData> {
  const results = useQueries({
    queries: abilityNames.map((name) => ({
      queryKey: ['ability', name],
      queryFn: () => fetchJson<AbilityData>(`${BASE_URL}/ability/${name}`),
      staleTime: Infinity,
      enabled: !!name,
    })),
  })
  const map = new Map<string, AbilityData>()
  abilityNames.forEach((name, i) => {
    const data = results[i]?.data
    if (data) map.set(name, data)
  })
  return map
}

export function useTypeMatchup(types: string[], generation = 6) {
  return useQuery({
    queryKey: ['type-matchup', [...types].sort().join(','), generation],
    queryFn: () => Promise.resolve(getTypeMatchups(types, generation)),
    enabled: types.length > 0,
    staleTime: Infinity
  })
}

export function useEvolutionChain(url: string) {
  return useQuery({
    queryKey: ['evolution-chain', url],
    queryFn: () => fetchJson<EvolutionChainData>(url),
    enabled: !!url,
    staleTime: Infinity,
    retry: 1,
  })
}
