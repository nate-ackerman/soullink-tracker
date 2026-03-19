import { useQuery } from '@tanstack/react-query'
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

export interface PokemonData {
  id: number
  name: string
  types: { slot: number; type: { name: string } }[]
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
}

export interface PokemonSpeciesData {
  id: number
  name: string
  capture_rate: number
  base_happiness: number
  is_legendary: boolean
  is_mythical: boolean
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
  effect_entries: { effect: string; short_effect: string }[]
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

const GEN_VERSION_GROUPS: Record<number, string[]> = {
  1: ['red-blue', 'yellow'],
  2: ['gold-silver', 'crystal'],
  3: ['ruby-sapphire', 'emerald', 'firered-leafgreen'],
  4: ['diamond-pearl', 'platinum', 'heartgold-soulsilver'],
  5: ['black-white', 'black-2-white-2']
}

export function usePokemonMoves(pokemonId: number, generation: number) {
  const validGroups = Object.entries(GEN_VERSION_GROUPS)
    .filter(([gen]) => parseInt(gen) <= generation)
    .flatMap(([, groups]) => groups)

  return useQuery({
    queryKey: ['pokemon-moves', pokemonId, generation],
    queryFn: async () => {
      const data = await fetchJson<PokemonData>(`${BASE_URL}/pokemon/${pokemonId}`)
      const moves: LearnsetMove[] = []

      for (const moveEntry of data.moves) {
        const relevantDetails = moveEntry.version_group_details.filter((d) =>
          validGroups.includes(d.version_group.name)
        )
        if (relevantDetails.length === 0) continue

        // Prefer the latest generation's data
        const latest = relevantDetails[relevantDetails.length - 1]
        moves.push({
          name: moveEntry.move.name,
          url: moveEntry.move.url,
          learnMethod: latest.move_learn_method.name,
          levelLearnedAt: latest.level_learned_at
        })
      }

      return moves
    },
    enabled: pokemonId > 0,
    staleTime: Infinity
  })
}

export function useMoveDetails(moveName: string) {
  return useQuery({
    queryKey: ['move', moveName],
    queryFn: () => fetchJson<MoveData>(`${BASE_URL}/move/${moveName}`),
    enabled: !!moveName,
    staleTime: Infinity
  })
}

export function useTypeMatchup(types: string[]) {
  return useQuery({
    queryKey: ['type-matchup', [...types].sort().join(',')],
    queryFn: () => Promise.resolve(getTypeMatchups(types)),
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
