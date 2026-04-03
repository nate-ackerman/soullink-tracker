import { useState, useMemo } from 'react'
import { useSessionState } from '../hooks/useSessionState'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Link2, AlertTriangle } from 'lucide-react'

import { useQueries } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Tabs, TabContent } from '../components/ui/Tabs'
import { PokemonSprite } from '../components/pokemon/PokemonSprite'
import { EvolvedCatchSprite } from '../components/pokemon/EvolvedCatchSprite'
import { TypeBadge } from '../components/pokemon/TypeBadge'
import { useAppStore } from '../store/appStore'
import { useApi } from '../lib/useApi'
import { usePokemonById, usePokemonSpecies, useEvolutionChain, usePokemonByName, getPokemonTypes } from '../api/pokeapi'
import type { PokemonData, PokemonSpeciesData, EvolutionChainData } from '../api/pokeapi'
import { formatPokemonName } from '../utils/cn'
import { resolveEvolutionAtLevel, resolveFullEvolution } from '../utils/evolutionUtils'
import { getTypeMatchups, getTypesForGeneration } from '../data/typeColors'
import type { Catch, Player, SoulLink, PartySlot, BattleRecord, SavedParty } from '../types'

// Rating thresholds based on net-weak type count (weaknesses.length after netting)
const RATING_THRESHOLDS: [number, string, string][] = [
  [1,        'Excellent',          'bg-green-500/20 text-green-400 border-green-500/30'],
  [2,        'Relatively Superior','bg-teal-500/20 text-teal-400 border-teal-500/30'],
  [3,        'Above Average',      'bg-sky-500/20 text-sky-400 border-sky-500/30'],
  [4,        'Decent',             'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'],
  [Infinity, 'Below Average',      'bg-red-500/20 text-red-400 border-red-500/30'],
]

// Normal/Flying Pokémon are treated as Flying primary for type-overlap purposes.
// Uses generation-correct types so e.g. Granbull counts as Normal in Gen 1-5.
function getEffectivePrimaryType(data: PokemonData, generation: number): string | null {
  const types = getPokemonTypes(data, generation)
  const primary = types[0] ?? null
  const secondary = types[1] ?? null
  if (primary === 'normal' && secondary === 'flying') return 'flying'
  return primary
}

// ── Type badge loader ─────────────────────────────────────────────────────────

function PokemonTypes({ pokemonId }: { pokemonId: number | null }) {
  const { data } = usePokemonById(pokemonId ?? 0)
  const { activeRun } = useAppStore()
  const generation = activeRun?.generation ?? 6
  if (!data || !pokemonId) return null
  const types = getPokemonTypes(data, generation)
  return (
    <div className="flex gap-0.5 flex-wrap mt-0.5 justify-center">
      {types.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
    </div>
  )
}

// ── Evolution lookup hook (3 hooks — call 6× for fixed count) ────────────────

function useSlotEvolution(pokemonId: number, pokemonName: string | undefined, levelCap: number | null): PokemonData | null {
  const { data: speciesData } = usePokemonSpecies(pokemonId)
  const chainUrl = speciesData?.evolution_chain?.url ?? ''
  const { data: chainData } = useEvolutionChain(chainUrl)
  const { activeRun } = useAppStore()
  const guaranteedLevel = activeRun?.ruleset.guaranteedEvolutionLevel ?? null

  const evolvedName = useMemo(() => {
    if (!chainData || !pokemonName) return ''
    if (guaranteedLevel !== null && levelCap !== null && levelCap >= guaranteedLevel) {
      const resolved = resolveFullEvolution(chainData.chain, pokemonName)
      return resolved !== pokemonName ? resolved : ''
    }
    if (levelCap === null) return ''
    const resolved = resolveEvolutionAtLevel(chainData.chain, pokemonName, levelCap)
    return resolved !== pokemonName ? resolved : ''
  }, [chainData, levelCap, pokemonName, guaranteedLevel])

  const { data: evolvedData } = usePokemonByName(evolvedName)
  return evolvedName && evolvedData ? evolvedData : null
}


// ── Soul link pair picker modal ───────────────────────────────────────────────

interface SoulLinkPickerProps {
  open: boolean
  onClose: () => void
  runId: string
  onAdded: (link: SoulLink) => void
}

function EvolvedPickerName({ c, levelCap }: { c: Catch; levelCap: number | null }) {
  const evolvedData = useSlotEvolution(c.pokemon_id ?? 0, c.pokemon_name ?? undefined, levelCap)
  const name = evolvedData?.name ?? c.pokemon_name
  return <span className="text-xs font-medium text-text-primary capitalize">{formatPokemonName(name)}</span>
}

function SoulLinkPicker({ open, onClose, runId, onAdded }: SoulLinkPickerProps) {
  const { soulLinks, catches, players, partySlots, activeRun, levelCap, refreshParty } = useAppStore()
  const api = useApi()

  const maxTypeLimit = activeRun?.ruleset.maxSharedTypeCount ?? 0
  const perTeamLimit = activeRun?.ruleset.maxSameTeamTypeCount ?? 0

  const available = useMemo(() => {
    const partyLinkIds = new Set(
      soulLinks
        .filter((sl) => sl.catch_ids.some((cid) => partySlots.some((ps) => ps.catch_id === cid)))
        .map((sl) => sl.id)
    )
    return soulLinks.filter((sl) => sl.status === 'active' && !partyLinkIds.has(sl.id))
  }, [soulLinks, partySlots])

  // Load primary types for all party + available link Pokémon (cache hits after sprites load)
  const allPokemonIds = useMemo(() => {
    const partyIds = partySlots
      .map((ps) => catches.find((c) => c.id === ps.catch_id)?.pokemon_id ?? 0)
      .filter((id) => id > 0)
    const linkIds = available.flatMap((link) =>
      link.catch_ids.map((cid) => catches.find((c) => c.id === cid)?.pokemon_id ?? 0)
    ).filter((id) => id > 0)
    return [...new Set([...partyIds, ...linkIds])]
  }, [partySlots, catches, available])

  const typeResults = useQueries({
    queries: allPokemonIds.map((id) => ({
      queryKey: ['pokemon', id],
      queryFn: async (): Promise<PokemonData> => {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
        if (!res.ok) throw new Error(`PokéAPI error: ${res.status}`)
        return res.json()
      },
      staleTime: Infinity,
      enabled: open && id > 0,
    })),
  })

  const generation = activeRun?.generation ?? 6

  const primaryTypeMap = useMemo(() => {
    const map = new Map<number, string>()
    allPokemonIds.forEach((id, i) => {
      const data = typeResults[i]?.data
      if (data) {
        const type = getEffectivePrimaryType(data, generation)
        if (type) map.set(id, type)
      }
    })
    return map
  }, [typeResults, allPokemonIds])

  const partyTypeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    partySlots.forEach((ps) => {
      const pokemonId = catches.find((c) => c.id === ps.catch_id)?.pokemon_id
      if (!pokemonId) return
      const type = primaryTypeMap.get(pokemonId)
      if (type) counts.set(type, (counts.get(type) ?? 0) + 1)
    })
    return counts
  }, [partySlots, catches, primaryTypeMap])

  // Per-player type counts: Map<playerId, Map<type, count>>
  const playerTypeCounts = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    partySlots.forEach((ps) => {
      const catch_ = catches.find((c) => c.id === ps.catch_id)
      if (!catch_?.pokemon_id) return
      const type = primaryTypeMap.get(catch_.pokemon_id)
      if (!type) return
      if (!map.has(catch_.player_id)) map.set(catch_.player_id, new Map())
      const counts = map.get(catch_.player_id)!
      counts.set(type, (counts.get(type) ?? 0) + 1)
    })
    return map
  }, [partySlots, catches, primaryTypeMap])

  // Returns a violation message, or null if the link can safely be added
  function wouldViolate(link: SoulLink): string | null {
    if (maxTypeLimit) {
      const counts = new Map(partyTypeCounts)
      for (const cid of link.catch_ids) {
        const pokemonId = catches.find((c) => c.id === cid)?.pokemon_id
        if (!pokemonId) continue
        const type = primaryTypeMap.get(pokemonId)
        if (!type) continue
        const newCount = (counts.get(type) ?? 0) + 1
        if (newCount > maxTypeLimit) return `${type} (team-wide)`
        counts.set(type, newCount)
      }
    }
    if (perTeamLimit) {
      const perPlayer = new Map<string, Map<string, number>>(
        [...playerTypeCounts.entries()].map(([pid, m]) => [pid, new Map(m)])
      )
      for (const cid of link.catch_ids) {
        const catch_ = catches.find((c) => c.id === cid)
        if (!catch_?.pokemon_id) continue
        const type = primaryTypeMap.get(catch_.pokemon_id)
        if (!type) continue
        if (!perPlayer.has(catch_.player_id)) perPlayer.set(catch_.player_id, new Map())
        const counts = perPlayer.get(catch_.player_id)!
        const newCount = (counts.get(type) ?? 0) + 1
        if (newCount > perTeamLimit) return `${type} (per-team)`
        counts.set(type, newCount)
      }
    }
    return null
  }

  async function handleSelect(link: SoulLink) {
    onAdded(link)    // optimistic update fires immediately
    onClose()        // modal closes immediately
    await api.party.addSoulLink(runId, link.catch_ids[0])
    refreshParty()   // reconcile after API completes
  }

  const isSolo = players.length === 1

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={isSolo ? 'Add Pokémon to Party' : 'Add Soul Link to Party'} size="md">
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {available.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">
            {soulLinks.filter((sl) => sl.status === 'active').length === 0
              ? (isSolo ? 'No Pokémon caught yet' : 'No active soul links yet — catch Pokémon on routes first')
              : (isSolo ? 'All caught Pokémon are already in party' : 'All active soul links are already in party')}
          </p>
        ) : (
          available.map((link) => {
            const linkedCatches = link.catch_ids
              .map((cid) => catches.find((c) => c.id === cid))
              .filter(Boolean) as Catch[]
            const violation = wouldViolate(link)
            const blocked = violation !== null

            return (
              <button
                key={link.id}
                onClick={() => !blocked && handleSelect(link)}
                disabled={blocked}
                title={blocked ? `Exceeds ${maxTypeLimit}-${violation} type limit` : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded border transition-colors text-left ${
                  blocked
                    ? 'bg-input/50 border-border opacity-50 cursor-not-allowed'
                    : 'bg-input border-border hover:border-border-light'
                }`}
              >
                <Link2 className={`w-3.5 h-3.5 shrink-0 ${blocked ? 'text-text-muted' : 'text-accent-teal'}`} />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  {link.nickname && (
                    <span className="text-[11px] font-semibold text-text-primary">"{link.nickname}"</span>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    {linkedCatches.map((c, idx) => {
                      const p = players.find((pl) => pl.id === c.player_id)
                      return (
                        <div key={c.id} className="flex items-center gap-1.5">
                          {idx > 0 && <span className="text-text-muted text-xs">↔</span>}
                          <EvolvedCatchSprite pokemonId={c.pokemon_id} pokemonName={c.pokemon_name} levelCap={levelCap} size={32} />
                          <div>
                            <EvolvedPickerName c={c} levelCap={levelCap} />
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-text-muted">Lv. {levelCap ?? 5}</span>
                              {p && (
                                <span className="text-[10px]" style={{ color: p.color }}>{p.name}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {blocked && (
                  <span className="text-[10px] text-red-400 shrink-0">
                    {violation} limit
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </Modal>
  )
}

// ── Party slot card ───────────────────────────────────────────────────────────

function PartySlotCard({
  catch_,
  onRemove,
  evolvedTo,
}: {
  catch_?: Catch
  onRemove: () => void
  evolvedTo?: PokemonData
  levelCap: number | null
}) {
  const CARD_H = 150
  const navigate = useNavigate()
  const { players } = useAppStore()

  if (!catch_) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-elevated/20 flex items-center justify-center" style={{ height: CARD_H }}>
        <span className="text-text-muted text-xs opacity-30">—</span>
      </div>
    )
  }

  const displayId = evolvedTo?.id ?? catch_.pokemon_id
  const displayName = evolvedTo?.name ?? catch_.pokemon_name

  return (
    <div
      onClick={() => navigate('/learnset', { state: { pokemon: displayName ?? catch_.pokemon_name } })}
      className="relative rounded-lg border border-accent-teal/30 bg-card px-2 pt-4 pb-2 flex flex-col items-center gap-1 cursor-pointer hover:opacity-75 transition-opacity overflow-hidden"
      style={{ height: CARD_H }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="absolute top-1 right-1 p-0.5 rounded text-text-muted hover:text-red-400 hover:bg-elevated transition-colors"
        title={players.length === 1 ? 'Remove from party' : 'Remove soul link from party'}
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <PokemonSprite
        pokemonId={displayId}
        pokemonName={displayName}
        size={56}
        grayscale={catch_.status !== 'alive'}
      />
      <div className="text-center w-full flex flex-col items-center gap-0.5">
        <p className="text-xs font-medium text-text-primary truncate capitalize w-full">
          {formatPokemonName(displayName)}
        </p>
        {/* Fixed-height type area — always 2 rows tall so all cards match */}
        <div className="flex justify-center gap-0.5 flex-wrap" style={{ minHeight: 38, alignContent: 'flex-start' }}>
          <PokemonTypes pokemonId={displayId} />
        </div>
      </div>
    </div>
  )
}

// ── Evolving slot card (component so hooks are per-instance, not per-render) ──

function EvolvingSlotCard({ catch_, onRemove, levelCap }: {
  catch_?: Catch
  onRemove: () => void
  levelCap: number | null
}) {
  const evolvedTo = useSlotEvolution(catch_?.pokemon_id ?? 0, catch_?.pokemon_name ?? undefined, levelCap)
  return <PartySlotCard catch_={catch_} onRemove={onRemove} evolvedTo={evolvedTo ?? undefined} levelCap={levelCap} />
}

// ── Read-only combo slot card (for suggested party combos) ────────────────────

function ComboSlotCard({ catch_, isNew, evolvedTo }: {
  catch_?: Catch
  isNew: boolean
  evolvedTo?: PokemonData
}) {
  const navigate = useNavigate()
  const CARD_H = 150

  if (!catch_) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-elevated/20 flex items-center justify-center"
        style={{ height: CARD_H }}
      >
        <span className="text-text-muted text-xs opacity-30">—</span>
      </div>
    )
  }

  const displayId = evolvedTo?.id ?? catch_.pokemon_id
  const displayName = evolvedTo?.name ?? catch_.pokemon_name

  return (
    <div
      onClick={() => displayName && navigate('/learnset', { state: { pokemon: displayName } })}
      className={`rounded-lg border bg-card px-2 pt-3 pb-2 flex flex-col items-center gap-1 overflow-hidden cursor-pointer hover:opacity-75 transition-opacity ${
        isNew ? 'border-accent-teal/50' : 'border-border opacity-60'
      }`}
      style={{ height: CARD_H }}
    >
      <PokemonSprite
        pokemonId={displayId}
        pokemonName={displayName}
        size={56}
        grayscale={catch_.status !== 'alive'}
      />
      <div className="text-center w-full flex flex-col items-center gap-0.5">
        <p className="text-xs font-medium text-text-primary truncate capitalize w-full">
          {formatPokemonName(displayName)}
        </p>
        <div className="flex justify-center gap-0.5 flex-wrap" style={{ minHeight: 38, alignContent: 'flex-start' }}>
          <PokemonTypes pokemonId={displayId} />
        </div>
      </div>
    </div>
  )
}

function EvolvingComboCard({ catch_, isNew, levelCap }: {
  catch_?: Catch
  isNew: boolean
  levelCap: number | null
}) {
  const evolvedTo = useSlotEvolution(catch_?.pokemon_id ?? 0, catch_?.pokemon_name ?? undefined, levelCap)
  return <ComboSlotCard catch_={catch_} isNew={isNew} evolvedTo={evolvedTo ?? undefined} />
}

// ── Party link table ──────────────────────────────────────────────────────────

function PartyLinkTable({ players, partySlots, catches, soulLinks, levelCap, onRemove }: {
  players: Player[]
  partySlots: PartySlot[]
  catches: Catch[]
  soulLinks: SoulLink[]
  levelCap: number | null
  onRemove: (catchId: string) => void
}) {
  const inPartyLinks = soulLinks.filter((sl) =>
    sl.status === 'active' && sl.catch_ids.some((cid) => partySlots.some((ps) => ps.catch_id === cid))
  )

  // Order links by the earliest slot number across all players
  const orderedLinks = [...inPartyLinks].sort((a, b) => {
    const minSlot = (link: SoulLink) =>
      Math.min(...link.catch_ids.map((cid) => partySlots.find((ps) => ps.catch_id === cid)?.slot ?? 99))
    return minSlot(a) - minSlot(b)
  })

  const { activeRun } = useAppStore()
  const guaranteedLevel = activeRun?.ruleset.guaranteedEvolutionLevel ?? null

  // Unique pokemon IDs for all party slots
  const partyPokemonIds = useMemo(() => {
    return [...new Set(
      partySlots
        .map((ps) => catches.find((c) => c.id === ps.catch_id)?.pokemon_id)
        .filter((id): id is number => id != null && id > 0)
    )]
  }, [partySlots, catches])

  // pokemon_id → pokemon_name needed for evolution resolution
  const pokemonNameMap = useMemo(() => {
    const map = new Map<number, string>()
    partySlots.forEach((ps) => {
      const c = catches.find((x) => x.id === ps.catch_id)
      if (c?.pokemon_id && c.pokemon_name) map.set(c.pokemon_id, c.pokemon_name)
    })
    return map
  }, [partySlots, catches])

  // Base pokemon data (BST fallback + species URL)
  const bstResults = useQueries({
    queries: partyPokemonIds.map((id) => ({
      queryKey: ['pokemon', id],
      queryFn: async (): Promise<PokemonData> => {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
        if (!res.ok) throw new Error(`PokéAPI error: ${res.status}`)
        return res.json()
      },
      staleTime: Infinity,
    })),
  })

  // Species data for evolution chain URL (only when level cap or guaranteed level is set)
  const speciesResults = useQueries({
    queries: partyPokemonIds.map((id) => ({
      queryKey: ['pokemon-species', id],
      queryFn: async (): Promise<PokemonSpeciesData> => {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`)
        if (!res.ok) throw new Error(`PokéAPI error: ${res.status}`)
        return res.json()
      },
      staleTime: Infinity,
      enabled: id > 0 && (levelCap !== null || guaranteedLevel !== null),
    })),
  })

  const chainUrls = useMemo(() => {
    const urls = new Set<string>()
    speciesResults.forEach((r) => { if (r.data?.evolution_chain?.url) urls.add(r.data.evolution_chain.url) })
    return [...urls]
  }, [speciesResults])

  const chainResults = useQueries({
    queries: chainUrls.map((url) => ({
      queryKey: ['evolution-chain', url],
      queryFn: async (): Promise<EvolutionChainData> => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`PokéAPI error: ${res.status}`)
        return res.json()
      },
      staleTime: Infinity,
    })),
  })

  const chainMap = useMemo(() => {
    const map = new Map<string, EvolutionChainData['chain']>()
    chainUrls.forEach((url, i) => { const d = chainResults[i]?.data; if (d) map.set(url, d.chain) })
    return map
  }, [chainResults, chainUrls])

  // Resolve the evolved name for each pokemon at the current level cap
  const evolvedNameMap = useMemo(() => {
    if (levelCap === null && guaranteedLevel === null) return new Map<number, string>()
    const map = new Map<number, string>()
    partyPokemonIds.forEach((id, i) => {
      const name = pokemonNameMap.get(id)
      if (!name) return
      const chainUrl = speciesResults[i]?.data?.evolution_chain?.url ?? ''
      const chain = chainMap.get(chainUrl)
      if (!chain) return
      let evolved: string
      if (guaranteedLevel !== null && levelCap !== null && levelCap >= guaranteedLevel) {
        evolved = resolveFullEvolution(chain, name)
      } else if (levelCap !== null) {
        evolved = resolveEvolutionAtLevel(chain, name, levelCap)
      } else {
        return
      }
      if (evolved !== name) map.set(id, evolved)
    })
    return map
  }, [partyPokemonIds, pokemonNameMap, speciesResults, chainMap, levelCap, guaranteedLevel])

  // Fetch evolved-form data so we can read its BST
  const evolvedNames = useMemo(() => [...new Set(evolvedNameMap.values())], [evolvedNameMap])

  const evolvedResults = useQueries({
    queries: evolvedNames.map((name) => ({
      queryKey: ['pokemon', name.toLowerCase()],
      queryFn: async (): Promise<PokemonData> => {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${name.toLowerCase()}`)
        if (!res.ok) throw new Error(`PokéAPI error: ${res.status}`)
        return res.json()
      },
      staleTime: Infinity,
    })),
  })

  const evolvedBstByName = useMemo(() => {
    const map = new Map<string, number>()
    evolvedNames.forEach((name, i) => {
      const data = evolvedResults[i]?.data
      if (data) map.set(name.toLowerCase(), data.stats.reduce((s, x) => s + x.base_stat, 0))
    })
    return map
  }, [evolvedResults, evolvedNames])

  // Effective BST: use evolved form's BST when available, fall back to base form
  const effectiveBstMap = useMemo(() => {
    const map = new Map<number, number>()
    partyPokemonIds.forEach((id, i) => {
      const data = bstResults[i]?.data
      if (!data) return
      const evolvedName = evolvedNameMap.get(id)
      const evolvedBst = evolvedName ? evolvedBstByName.get(evolvedName.toLowerCase()) : undefined
      map.set(id, evolvedBst ?? data.stats.reduce((s, x) => s + x.base_stat, 0))
    })
    return map
  }, [bstResults, partyPokemonIds, evolvedNameMap, evolvedBstByName])

  if (orderedLinks.length === 0) return null

  const LABEL_W = 96   // px — player name column
  const COL_W   = 120  // px — each soul link column
  const GAP     = 10   // px — gap between columns (gap-2.5)

  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4 overflow-x-auto">
        {/* Soul link column headers — spacer matches the player label width exactly */}
        <div className="flex mb-3" style={{ gap: GAP }}>
          <div style={{ width: LABEL_W, flexShrink: 0 }} />
          {orderedLinks.map((link) => (
            <div key={link.id} style={{ width: COL_W, flexShrink: 0 }} className="flex items-center justify-center px-1">
              {link.nickname
                ? <span className="text-xs font-semibold text-text-primary text-center leading-snug">"{link.nickname}"</span>
                : <Link2 className="w-3.5 h-3.5 text-accent-teal" />}
            </div>
          ))}
        </div>

        {/* One row per player */}
        <div className="flex flex-col" style={{ gap: GAP }}>
          {players.map((p) => {
            const playerSlots = partySlots.filter((ps) => catches.find((c) => c.id === ps.catch_id)?.player_id === p.id)
            const playerBst = playerSlots.reduce((sum, ps) => {
              const pokemonId = catches.find((c) => c.id === ps.catch_id)?.pokemon_id
              return sum + (pokemonId ? (effectiveBstMap.get(pokemonId) ?? 0) : 0)
            }, 0)
            const bstCount = playerSlots.filter((ps) => {
              const pokemonId = catches.find((c) => c.id === ps.catch_id)?.pokemon_id
              return pokemonId && effectiveBstMap.has(pokemonId)
            }).length
            const avgBst = bstCount > 0 ? Math.round(playerBst / bstCount) : 0
            return (
            <div key={p.id} className="flex items-center" style={{ gap: GAP }}>
              {/* Player label */}
              <div style={{ width: LABEL_W, flexShrink: 0 }} className="flex flex-col gap-1 pr-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-semibold truncate" style={{ color: p.color }}>{p.name}</span>
                </div>
                {avgBst > 0 && (
                  <span className="text-xs font-semibold text-text-primary leading-none pl-4">avg {avgBst.toLocaleString()}</span>
                )}
              </div>
              {/* One card per soul link */}
              {orderedLinks.map((link) => {
                const catchId = link.catch_ids.find((cid) => catches.find((x) => x.id === cid)?.player_id === p.id)
                const c = catchId ? catches.find((x) => x.id === catchId) : undefined
                return (
                  <div key={link.id} style={{ width: COL_W, flexShrink: 0 }}>
                    <EvolvingSlotCard
                      catch_={c}
                      onRemove={() => c && onRemove(c.id)}
                      levelCap={levelCap}
                    />
                  </div>
                )
              })}
            </div>
          )})}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Type overlap warning ──────────────────────────────────────────────────────

function TypeOverlapWarning({
  partySlots,
  catches,
  players,
  limit,
  perTeamLimit,
  generation,
}: {
  partySlots: { catch_id: string; player_id: string }[]
  catches: Catch[]
  players: Player[]
  limit: number
  perTeamLimit: number
  generation: number
}) {
  const pokemonIds = useMemo(() => {
    const ids = partySlots
      .map((ps) => catches.find((c) => c.id === ps.catch_id)?.pokemon_id ?? 0)
      .filter((id) => id > 0)
    return [...new Set(ids)]
  }, [partySlots, catches])

  const results = useQueries({
    queries: pokemonIds.map((id) => ({
      queryKey: ['pokemon', id],
      queryFn: async (): Promise<PokemonData> => {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
        if (!res.ok) throw new Error(`PokéAPI error: ${res.status}`)
        return res.json()
      },
      staleTime: Infinity,
      enabled: id > 0,
    })),
  })

  const typeMap = useMemo(() => {
    const map = new Map<number, string>()
    pokemonIds.forEach((id, i) => {
      const data = results[i]?.data
      if (data) {
        const type = getEffectivePrimaryType(data, generation)
        if (type) map.set(id, type)
      }
    })
    return map
  }, [results, pokemonIds, generation])

  const crossTeamViolations = useMemo(() => {
    if (!limit) return []
    const typeCounts = new Map<string, number>()
    partySlots.forEach((ps) => {
      const pokemonId = catches.find((c) => c.id === ps.catch_id)?.pokemon_id
      if (!pokemonId) return
      const type = typeMap.get(pokemonId)
      if (type) typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1)
    })
    return [...typeCounts.entries()]
      .filter(([, count]) => count > limit)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }, [partySlots, catches, typeMap, limit])

  const perTeamViolations = useMemo(() => {
    if (!perTeamLimit) return []
    const violations: { playerName: string; type: string; count: number }[] = []
    players.forEach((player) => {
      const typeCounts = new Map<string, number>()
      partySlots
        .filter((ps) => ps.player_id === player.id)
        .forEach((ps) => {
          const pokemonId = catches.find((c) => c.id === ps.catch_id)?.pokemon_id
          if (!pokemonId) return
          const type = typeMap.get(pokemonId)
          if (type) typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1)
        })
      typeCounts.forEach((count, type) => {
        if (count > perTeamLimit) violations.push({ playerName: player.name, type, count })
      })
    })
    return violations.sort((a, b) => b.count - a.count)
  }, [partySlots, catches, typeMap, perTeamLimit, players])

  if (crossTeamViolations.length === 0 && perTeamViolations.length === 0) return null

  return (
    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
      <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
      <div className="space-y-1">
        {crossTeamViolations.length > 0 && (
          <div>
            <p className="text-xs font-medium text-red-400">Cross-team type limit exceeded (max {limit})</p>
            <p className="text-xs text-text-muted">
              {crossTeamViolations.map((v) => `${v.type} ×${v.count}`).join(', ')}
            </p>
          </div>
        )}
        {perTeamViolations.length > 0 && (
          <div>
            <p className="text-xs font-medium text-red-400">Per-team type limit exceeded (max {perTeamLimit})</p>
            <p className="text-xs text-text-muted">
              {perTeamViolations.map((v) => `${v.playerName}: ${v.type} ×${v.count}`).join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Combination helper ────────────────────────────────────────────────────────

function getCombinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = []
  function recurse(start: number, current: T[]) {
    if (current.length === k) { result.push([...current]); return }
    for (let i = start; i <= arr.length - (k - current.length); i++) {
      current.push(arr[i])
      recurse(i + 1, current)
      current.pop()
    }
  }
  recurse(0, [])
  return result
}

// ── Best combos section ───────────────────────────────────────────────────────

function BestCombosSection({
  activeLinks,
  inPartyLinks,
  catches,
  players,
  runId,
  onAdded,
  maxSharedTypeCount,
  maxSameTeamTypeCount,
  levelCap,
  generation,
}: {
  activeLinks: SoulLink[]
  inPartyLinks: SoulLink[]
  catches: Catch[]
  players: Player[]
  runId: string
  onAdded: () => void
  maxSharedTypeCount: number
  maxSameTeamTypeCount: number
  levelCap: number | null
  generation: number
}) {
  const [applying, setApplying] = useState(false)
  const { activeRun: _activeRun, optimisticAddLink } = useAppStore()
  const api = useApi()
  const guaranteedLevel = _activeRun?.ruleset.guaranteedEvolutionLevel ?? null

  // Links not yet in party — candidates to add
  const availableLinks = useMemo(
    () => activeLinks.filter((sl) => !inPartyLinks.some((ip) => ip.id === sl.id)),
    [activeLinks, inPartyLinks],
  )

  const pokemonIds = useMemo(() => {
    const ids = activeLinks.flatMap((link) =>
      link.catch_ids.map((cid) => catches.find((c) => c.id === cid)?.pokemon_id ?? 0)
    ).filter((id) => id > 0)
    return [...new Set(ids)]
  }, [activeLinks, catches])

  // pokemonId → base name (for evolution resolution)
  const pokemonNameMap = useMemo(() => {
    const map = new Map<number, string>()
    activeLinks.forEach((link) => {
      link.catch_ids.forEach((cid) => {
        const c = catches.find((c) => c.id === cid)
        if (c?.pokemon_id && c.pokemon_name) map.set(c.pokemon_id, c.pokemon_name)
      })
    })
    return map
  }, [activeLinks, catches])

  // Base pokemon data (types + fallback BST)
  const results = useQueries({
    queries: pokemonIds.map((id) => ({
      queryKey: ['pokemon', id],
      queryFn: async (): Promise<PokemonData> => {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
        if (!res.ok) throw new Error(`PokéAPI error: ${res.status}`)
        return res.json()
      },
      staleTime: Infinity,
      enabled: id > 0,
    })),
  })

  // Species data — only needed when a level cap is set
  const speciesResults = useQueries({
    queries: pokemonIds.map((id) => ({
      queryKey: ['pokemon-species', id],
      queryFn: async (): Promise<PokemonSpeciesData> => {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`)
        if (!res.ok) throw new Error(`PokéAPI error: ${res.status}`)
        return res.json()
      },
      staleTime: Infinity,
      enabled: id > 0 && (levelCap !== null || guaranteedLevel !== null),
    })),
  })

  const chainUrls = useMemo(() => {
    const urls = new Set<string>()
    speciesResults.forEach((r) => {
      if (r.data?.evolution_chain?.url) urls.add(r.data.evolution_chain.url)
    })
    return [...urls]
  }, [speciesResults])

  const chainResults = useQueries({
    queries: chainUrls.map((url) => ({
      queryKey: ['evolution-chain', url],
      queryFn: async (): Promise<EvolutionChainData> => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`PokéAPI error: ${res.status}`)
        return res.json()
      },
      staleTime: Infinity,
      enabled: !!url,
    })),
  })

  const chainMap = useMemo(() => {
    const map = new Map<string, EvolutionChainData['chain']>()
    chainUrls.forEach((url, i) => {
      const data = chainResults[i]?.data
      if (data) map.set(url, data.chain)
    })
    return map
  }, [chainResults, chainUrls])

  // pokemonId → evolved name (empty map when no level cap and no guaranteed level)
  const evolvedNameMap = useMemo(() => {
    if (levelCap === null && guaranteedLevel === null) return new Map<number, string>()
    const map = new Map<number, string>()
    pokemonIds.forEach((id, i) => {
      const name = pokemonNameMap.get(id)
      if (!name) return
      const chainUrl = speciesResults[i]?.data?.evolution_chain?.url ?? ''
      const chain = chainMap.get(chainUrl)
      if (!chain) return
      let evolved: string
      if (guaranteedLevel !== null && levelCap !== null && levelCap >= guaranteedLevel) {
        evolved = resolveFullEvolution(chain, name)
      } else if (levelCap !== null) {
        evolved = resolveEvolutionAtLevel(chain, name, levelCap)
      } else {
        return
      }
      if (evolved !== name) map.set(id, evolved)
    })
    return map
  }, [pokemonIds, pokemonNameMap, speciesResults, chainMap, levelCap, guaranteedLevel])

  const evolvedNames = useMemo(() => [...new Set(evolvedNameMap.values())], [evolvedNameMap])

  const evolvedResults = useQueries({
    queries: evolvedNames.map((name) => ({
      queryKey: ['pokemon', name.toLowerCase()],
      queryFn: async (): Promise<PokemonData> => {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${name.toLowerCase()}`)
        if (!res.ok) throw new Error(`PokéAPI error: ${res.status}`)
        return res.json()
      },
      staleTime: Infinity,
      enabled: !!name,
    })),
  })

  const evolvedBstByName = useMemo(() => {
    const map = new Map<string, number>()
    evolvedNames.forEach((name, i) => {
      const data = evolvedResults[i]?.data
      if (data) map.set(name.toLowerCase(), data.stats.reduce((s, x) => s + x.base_stat, 0))
    })
    return map
  }, [evolvedResults, evolvedNames])

  // Effective BST uses evolved form when loaded, falls back to base
  const { effectiveBstMap, primaryTypeMap } = useMemo(() => {
    const bst = new Map<number, number>()
    const type = new Map<number, string>()
    pokemonIds.forEach((id, i) => {
      const data = results[i]?.data
      if (!data) return
      const evolvedName = evolvedNameMap.get(id)
      const evolvedBst = evolvedName ? evolvedBstByName.get(evolvedName.toLowerCase()) : undefined
      bst.set(id, evolvedBst ?? data.stats.reduce((s, x) => s + x.base_stat, 0))
      const effectiveType = getEffectivePrimaryType(data, generation)
      if (effectiveType) type.set(id, effectiveType)
    })
    return { effectiveBstMap: bst, primaryTypeMap: type }
  }, [results, pokemonIds, evolvedNameMap, evolvedBstByName, generation])

  const allLoaded = pokemonIds.length > 0 && pokemonIds.every((id) => effectiveBstMap.has(id))

  // Full defensive matchups per Pokémon (uses base form types — good enough for coverage analysis)
  const defensiveMatchupMap = useMemo(() => {
    const map = new Map<number, Record<string, number>>()
    pokemonIds.forEach((id, i) => {
      const data = results[i]?.data
      if (!data) return
      map.set(id, getTypeMatchups(getPokemonTypes(data, generation), generation))
    })
    return map
  }, [results, pokemonIds, generation])

  const attackTypeList = useMemo(() => getTypesForGeneration(generation), [generation])

  function scoreTypeMatchup(links: SoulLink[]): { worstNet: number; playerNets: Map<string, number> } {
    const playerNets = new Map<string, number>()
    for (const player of players) {
      const ids = links
        .flatMap((l) => l.catch_ids)
        .map((cid) => catches.find((c) => c.id === cid))
        .filter((c): c is Catch => c?.player_id === player.id && !!c.pokemon_id)
        .map((c) => c.pokemon_id!)
      if (ids.length === 0) continue
      let netWeakCount = 0
      for (const atkType of attackTypeList) {
        let weak = 0, res = 0
        for (const id of ids) {
          const m = defensiveMatchupMap.get(id)?.[atkType] ?? 1
          if (m > 1) weak++
          else if (m < 1) res++
        }
        if (weak - res > 0) netWeakCount++
      }
      playerNets.set(player.id, netWeakCount)
    }
    const nets = [...playerNets.values()]
    return { worstNet: nets.length > 0 ? Math.max(...nets) : 0, playerNets }
  }

  function scoreCombo(links: SoulLink[]): { total: number; avg: number; weighted: number; worstWeighted: number } {
    const ids = links.flatMap((l) =>
      l.catch_ids.map((cid) => catches.find((c) => c.id === cid)?.pokemon_id ?? 0)
    )
    const bsts = ids.map((id) => effectiveBstMap.get(id)).filter((v): v is number => v !== undefined)
    const total = bsts.reduce((a, b) => a + b, 0)
    const avg = bsts.length > 0 ? Math.round(total / bsts.length) : 0
    // Weighted score: avg BST is the primary driver (85%), with a small bonus for fuller teams (15%).
    // Using a linear blend so teams of the same size still rank by avg, not total.
    const weighted = Math.round(avg * (0.85 + 0.15 * (links.length / 6)))

    // Worst-player weighted BST: maximize the weakest link
    const playerBsts = new Map<string, number[]>()
    for (const link of links) {
      for (const cid of link.catch_ids) {
        const catch_ = catches.find((c) => c.id === cid)
        if (!catch_?.pokemon_id) continue
        const bst = effectiveBstMap.get(catch_.pokemon_id)
        if (bst === undefined) continue
        if (!playerBsts.has(catch_.player_id)) playerBsts.set(catch_.player_id, [])
        playerBsts.get(catch_.player_id)!.push(bst)
      }
    }
    let worstWeighted = 0
    if (playerBsts.size > 0) {
      let min = Infinity
      for (const pbsts of playerBsts.values()) {
        const pavg = pbsts.reduce((a, b) => a + b, 0) / pbsts.length
        min = Math.min(min, Math.round(pavg * Math.sqrt(pbsts.length / 6)))
      }
      worstWeighted = min === Infinity ? 0 : min
    }

    return { total, avg, weighted, worstWeighted }
  }

  function isValidCombo(links: SoulLink[]): boolean {
    if (maxSharedTypeCount) {
      const typeCounts = new Map<string, number>()
      for (const link of links) {
        for (const cid of link.catch_ids) {
          const pokemonId = catches.find((c) => c.id === cid)?.pokemon_id
          if (!pokemonId) continue
          const type = primaryTypeMap.get(pokemonId)
          if (!type) continue
          const count = (typeCounts.get(type) ?? 0) + 1
          if (count > maxSharedTypeCount) return false
          typeCounts.set(type, count)
        }
      }
    }
    if (maxSameTeamTypeCount) {
      const playerCounts = new Map<string, Map<string, number>>()
      for (const link of links) {
        for (const cid of link.catch_ids) {
          const catch_ = catches.find((c) => c.id === cid)
          if (!catch_?.pokemon_id) continue
          const type = primaryTypeMap.get(catch_.pokemon_id)
          if (!type) continue
          if (!playerCounts.has(catch_.player_id)) playerCounts.set(catch_.player_id, new Map())
          const counts = playerCounts.get(catch_.player_id)!
          const count = (counts.get(type) ?? 0) + 1
          if (count > maxSameTeamTypeCount) return false
          counts.set(type, count)
        }
      }
    }
    return true
  }

  const { topCombos, topWeightedCombos, topMinWeightedCombos } = useMemo(() => {
    const empty = { topCombos: [], topWeightedCombos: [], topMinWeightedCombos: [] }
    if (!allLoaded || availableLinks.length === 0) return empty

    const slotsUsed = inPartyLinks.length
    const slotsLeft = Math.max(0, 6 - slotsUsed)
    if (slotsLeft === 0) return empty

    let base: { additions: SoulLink[]; combined: SoulLink[]; total: number; avg: number; weighted: number; worstWeighted: number }[]

    if (maxSharedTypeCount === 0 && maxSameTeamTypeCount === 0) {
      const k = Math.min(slotsLeft, availableLinks.length)
      if (k === 0 || availableLinks.length < k) return empty
      base = getCombinations(availableLinks, k).map((additions) => {
        const combined = [...inPartyLinks, ...additions]
        return { additions, combined, ...scoreCombo(combined) }
      })
    } else {
      base = []
      const maxK = Math.min(slotsLeft, availableLinks.length)
      for (let k = maxK; k >= 1; k--) {
        for (const additions of getCombinations(availableLinks, k)) {
          const combined = [...inPartyLinks, ...additions]
          if (isValidCombo(combined)) {
            base.push({ additions, combined, ...scoreCombo(combined) })
          }
        }
      }
    }

    // Attach type matchup scores to every combo so renderComboRow can show ratings
    const scored = base.map((s) => ({ ...s, ...scoreTypeMatchup(s.combined) }))

    return {
      topCombos: [...scored].sort((a, b) => b.total - a.total).slice(0, 2),
      topWeightedCombos: [...scored].sort((a, b) => b.weighted - a.weighted).slice(0, 2),
      topMinWeightedCombos: [...scored].sort((a, b) => b.worstWeighted - a.worstWeighted).slice(0, 2),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLoaded, availableLinks, inPartyLinks, effectiveBstMap, primaryTypeMap, defensiveMatchupMap, catches, maxSharedTypeCount, maxSameTeamTypeCount])

  const hasTypeLimit = maxSharedTypeCount > 0 || maxSameTeamTypeCount > 0
  if (availableLinks.length === 0) return null

  function renderComboRow(
    combo: { additions: SoulLink[]; combined: SoulLink[]; total: number; avg: number; weighted: number; worstNet: number; playerNets: Map<string, number> },
    rank: number,
    scoreLabel: string,
    scoreValue: number,
    secondaryLabel: string,
    secondaryValue: number | string,
  ) {
    const LABEL_W = 96
    const COL_W   = 120
    const GAP     = 10

    const { additions, combined, playerNets } = combo
    const sortedCombined = [...combined].sort((a, b) => {
      const avgBst = (link: SoulLink) => {
        const bsts = link.catch_ids
          .map((cid) => catches.find((c) => c.id === cid)?.pokemon_id)
          .map((id) => (id ? effectiveBstMap.get(id) : undefined))
          .filter((v): v is number => v !== undefined)
        return bsts.length > 0 ? bsts.reduce((s, x) => s + x, 0) / bsts.length : 0
      }
      return avgBst(b) - avgBst(a)
    })

    return (
      <div key={rank} className="p-3 rounded-lg bg-elevated border border-border">
        {/* Header: rank + scores + player ratings + Add button */}
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-text-muted">#{rank + 1}</span>
            <span className="text-xs font-medium text-text-secondary">{scoreLabel}: {scoreValue}</span>
            {secondaryLabel && secondaryValue !== '' && (
              <span className="text-[10px] text-text-muted">{secondaryLabel}: {secondaryValue}</span>
            )}
            <span className="text-[10px] text-text-muted">+{additions.length} link{additions.length !== 1 ? 's' : ''}</span>
            {players.map((p) => {
              const n = playerNets.get(p.id) ?? 0
              const [,, cls] = RATING_THRESHOLDS.find(([max]) => n <= max)!
              return (
                <span key={p.id} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>
                  {p.name}: {n} weakness{n !== 1 ? 'es' : ''}
                </span>
              )
            })}
          </div>
          <button
            onClick={() => applyCombo(additions)}
            disabled={applying}
            className="text-xs px-3 py-1.5 rounded bg-accent-teal text-white hover:bg-teal-500 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title="Add suggested links to party"
          >
            Add
          </button>
        </div>

        {/* Table: soul links as columns, players as rows */}
        <div className="overflow-x-auto">
          <div className="flex mb-2" style={{ gap: GAP }}>
            <div style={{ width: LABEL_W, flexShrink: 0 }} />
            {sortedCombined.map((link) => {
              const isNew = additions.some((a) => a.id === link.id)
              return (
                <div key={link.id} style={{ width: COL_W, flexShrink: 0 }} className="flex items-center justify-center px-1">
                  {link.nickname ? (
                    <span className={`text-xs font-semibold text-center leading-snug ${isNew ? 'text-text-primary' : 'text-text-muted'}`}>
                      "{link.nickname}"
                    </span>
                  ) : (
                    <Link2 className={`w-3.5 h-3.5 ${isNew ? 'text-accent-teal' : 'text-text-muted'}`} />
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex flex-col" style={{ gap: GAP }}>
            {players.map((p) => (
              <div key={p.id} className="flex items-center" style={{ gap: GAP }}>
                <div style={{ width: LABEL_W, flexShrink: 0 }} className="flex items-center gap-2 pr-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-semibold truncate" style={{ color: p.color }}>{p.name}</span>
                </div>
                {sortedCombined.map((link) => {
                  const catchId = link.catch_ids.find(
                    (cid) => catches.find((x) => x.id === cid)?.player_id === p.id
                  )
                  const c = catchId ? catches.find((x) => x.id === catchId) : undefined
                  const isNew = additions.some((a) => a.id === link.id)
                  return (
                    <div key={link.id} style={{ width: COL_W, flexShrink: 0 }}>
                      <EvolvingComboCard catch_={c} isNew={isNew} levelCap={levelCap} />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  async function applyCombo(additions: SoulLink[]) {
    setApplying(true)
    try {
      // Apply optimistic updates immediately so the UI reflects changes before network calls complete
      for (const link of additions) optimisticAddLink(link)
      await Promise.all(additions.map((link) => api.party.addSoulLink(runId, link.catch_ids[0])))
      onAdded()
    } finally {
      setApplying(false)
    }
  }

  const loadingOrEmpty = (empty: boolean) =>
    !allLoaded ? (
      <p className="text-xs text-text-muted">Loading Pokémon data...</p>
    ) : empty ? (
      <p className="text-xs text-text-muted">
        {hasTypeLimit ? 'No valid additions found with the current type limit.' : 'Not enough available links to suggest additions.'}
      </p>
    ) : null

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>
            {inPartyLinks.length > 0
              ? `Best Additions for Your ${inPartyLinks.length}-Link Party`
              : hasTypeLimit ? 'Valid Combos by Total BST' : 'Top Combos by Total BST'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingOrEmpty(topCombos.length === 0) ?? (
            <div className="space-y-2">
              {topCombos.map((combo, rank) =>
                renderComboRow(combo, rank, 'Total BST', combo.total, 'Avg', combo.avg)
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Combos by Weighted Average</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingOrEmpty(topWeightedCombos.length === 0) ?? (
            <div className="space-y-2">
              {topWeightedCombos.map((combo, rank) =>
                renderComboRow(combo, rank, 'Score', combo.weighted, `Avg ${combo.avg} × ${combo.combined.length}/6`, '')
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {players.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Strengthen the Weakest Player</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingOrEmpty(topMinWeightedCombos.length === 0) ?? (
              <div className="space-y-2">
                {topMinWeightedCombos.map((combo, rank) =>
                  renderComboRow(combo, rank, 'Worst', combo.worstWeighted, `Overall ${combo.weighted}`, '')
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  )
}

// ── Shared party snapshot renderer ───────────────────────────────────────────

function PartySnapshotRows({ snapshot, catches, players }: {
  snapshot: { player_id: string; slots: { slot: number; catch_id: string }[] }[]
  catches: Catch[]
  players: Player[]
}) {
  const { levelCap, soulLinks } = useAppStore()

  const LABEL_W = 96
  const COL_W   = 120
  const GAP     = 10

  const allCatchIds = new Set(snapshot.flatMap((ps) => ps.slots.map((s) => s.catch_id)))

  // Find soul links represented in this snapshot (any status — may be broken/dead after the fact)
  const snapshotLinks = soulLinks
    .filter((sl) => sl.catch_ids.some((cid) => allCatchIds.has(cid)))
    .sort((a, b) => {
      const minSlot = (link: SoulLink) => {
        let min = 99
        for (const ps of snapshot) {
          for (const s of ps.slots) {
            if (link.catch_ids.includes(s.catch_id)) min = Math.min(min, s.slot)
          }
        }
        return min
      }
      return minSlot(a) - minSlot(b)
    })

  return (
    <div className="overflow-x-auto mt-2">
      {/* Column headers */}
      <div className="flex mb-2" style={{ gap: GAP }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        {snapshotLinks.map((link) => (
          <div key={link.id} style={{ width: COL_W, flexShrink: 0 }} className="flex items-center justify-center px-1">
            {link.nickname
              ? <span className="text-xs font-semibold text-text-primary text-center leading-snug">"{link.nickname}"</span>
              : <Link2 className="w-3.5 h-3.5 text-accent-teal" />}
          </div>
        ))}
      </div>

      {/* One row per player */}
      <div className="flex flex-col" style={{ gap: GAP }}>
        {snapshot.map((ps) => {
          const player = players.find((p) => p.id === ps.player_id)
          return (
            <div key={ps.player_id} className="flex items-center" style={{ gap: GAP }}>
              <div style={{ width: LABEL_W, flexShrink: 0 }} className="flex items-center gap-2 pr-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: player?.color ?? '#888' }} />
                <span className="text-sm font-semibold truncate" style={{ color: player?.color ?? '#888' }}>
                  {player?.name ?? '?'}
                </span>
              </div>
              {snapshotLinks.map((link) => {
                const catchId = link.catch_ids.find((cid) => ps.slots.some((s) => s.catch_id === cid))
                const c = catchId ? catches.find((x) => x.id === catchId) : undefined
                return (
                  <div key={link.id} style={{ width: COL_W, flexShrink: 0 }}>
                    <EvolvingComboCard catch_={c} isNew={true} levelCap={levelCap} />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Trainer sprite (shared with Dashboard) ────────────────────────────────────

const TRAINER_SPRITE_OVERRIDES: Record<string, string> = {
  'Kimono Girls': 'kimonogirl',
  'Jessie & James': 'jessiejames-gen1',
  'Lorelei': 'lorelei-gen3',
  'Agatha': 'agatha-gen3',
  'Maxie': 'maxie-gen3',
  'Archie': 'archie-gen3',
  'Phoebe': 'phoebe-gen3',
  'Drake': 'drake-gen3',
}

function getSpriteCandidates(name: string): string[] {
  // Check override with full name first, then with just the primary (before & or /)
  if (TRAINER_SPRITE_OVERRIDES[name]) return [TRAINER_SPRITE_OVERRIDES[name]]
  const primaryRaw = name.split(/[&/]/)[0].trim()
  if (TRAINER_SPRITE_OVERRIDES[primaryRaw]) return [TRAINER_SPRITE_OVERRIDES[primaryRaw]]
  const primary = primaryRaw
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
  const words = primary.split(/\s+/).filter(Boolean)
  if (words.length <= 1) return words
  // 1. all special chars stripped with no separator (e.g. "ltsurge")
  // 2. full hyphenated name (e.g. "lt-surge")
  // 3. each word individually (e.g. "lt", "surge")
  return [...new Set([words.join(''), words.join('-'), ...words])]
}

function TrainerSprite({ name, size = 40 }: { name: string; size?: number }) {
  const candidates = useMemo(() => getSpriteCandidates(name), [name])
  const [index, setIndex] = useState(0)
  if (index >= candidates.length) return null
  return (
    <img
      src={`https://play.pokemonshowdown.com/sprites/trainers/${candidates[index]}.png`}
      alt={name}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', objectFit: 'contain' }}
      onError={() => setIndex((i) => i + 1)}
    />
  )
}

// ── Past Battle Parties ───────────────────────────────────────────────────────

function PastBattlePartiesSection({
  battleRecords,
  catches,
  players,
  runId,
  onLoaded,
}: {
  battleRecords: BattleRecord[]
  catches: Catch[]
  players: Player[]
  runId: string
  onLoaded: () => void
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const api = useApi()
  const victories = [...battleRecords].filter((b) => b.outcome === 'victory')
  if (victories.length === 0) return null

  function snapshotKey(battle: BattleRecord): string {
    return battle.party_snapshot
      .map((ps) => `${ps.player_id}:${[...ps.slots].sort((a, b) => a.slot - b.slot).map((s) => s.catch_id).join(',')}`)
      .sort()
      .join('|')
  }

  const groups: { key: string; battles: BattleRecord[] }[] = []
  const seen = new Map<string, number>()
  for (const battle of victories) {
    const key = snapshotKey(battle)
    if (seen.has(key)) {
      groups[seen.get(key)!].battles.push(battle)
    } else {
      seen.set(key, groups.length)
      groups.push({ key, battles: [battle] })
    }
  }

  async function loadParty(battle: BattleRecord) {
    setLoading(battle.id)
    try {
      for (const player of players) {
        await api.party.clearAll(runId, player.id)
      }
      for (const ps of battle.party_snapshot) {
        for (const { slot, catch_id } of ps.slots) {
          const c = catches.find((x) => x.id === catch_id)
          if (c && c.status === 'alive') {
            await api.party.setSlot(runId, ps.player_id, slot, catch_id)
          }
        }
      }
      onLoaded()
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-3">
      {[...groups].reverse().map(({ key, battles }) => {
        const rep = battles[0]
        return (
          <div key={key} className="p-3 rounded-lg bg-elevated border border-border">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <TrainerSprite name={rep.gym_leader_name} size={32} />
                <p className="text-xs font-semibold text-text-primary">
                  {battles.map((b) => `${b.gym_leader_name} (Lv.${b.level_cap})`).join(', ')}
                </p>
              </div>
              <button
                onClick={() => loadParty(rep)}
                disabled={loading === rep.id}
                className="text-xs px-3 py-1.5 rounded bg-accent-teal text-white hover:bg-teal-500 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {loading === rep.id ? '…' : 'Load'}
              </button>
            </div>
            <PartySnapshotRows snapshot={rep.party_snapshot} catches={catches} players={players} />
          </div>
        )
      })}
    </div>
  )
}

// ── Saved Parties ─────────────────────────────────────────────────────────────

function SavedPartiesSection({
  savedParties,
  catches,
  players,
  runId,
  onLoaded,
  onDeleted,
}: {
  savedParties: SavedParty[]
  catches: Catch[]
  players: Player[]
  runId: string
  onLoaded: () => void
  onDeleted: () => void
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const api = useApi()

  if (savedParties.length === 0) return null

  async function loadParty(sp: SavedParty) {
    setLoading(sp.id)
    try {
      for (const player of players) {
        await api.party.clearAll(runId, player.id)
      }
      for (const ps of sp.party_snapshot) {
        for (const { slot, catch_id } of ps.slots) {
          const c = catches.find((x) => x.id === catch_id)
          if (c && c.status === 'alive') {
            await api.party.setSlot(runId, ps.player_id, slot, catch_id)
          }
        }
      }
      onLoaded()
    } finally {
      setLoading(null)
    }
  }

  async function deleteParty(id: string) {
    await api.savedParties.delete(id)
    onDeleted()
  }

  return (
    <div className="space-y-3">
      {savedParties.map((sp) => (
        <div key={sp.id} className="p-3 rounded-lg bg-elevated border border-border">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-text-primary truncate">{sp.name}</p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => loadParty(sp)}
                disabled={loading === sp.id}
                className="text-xs px-3 py-1.5 rounded bg-accent-teal text-white hover:bg-teal-500 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading === sp.id ? '…' : 'Load'}
              </button>
              <button
                onClick={() => deleteParty(sp.id)}
                disabled={loading === sp.id}
                className="text-xs px-2 py-1 rounded border border-border text-text-muted hover:text-red-400 hover:border-red-700/50 transition-colors disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </div>
          <PartySnapshotRows snapshot={sp.party_snapshot} catches={catches} players={players} />
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Main component ────────────────────────────────────────────────────────────

const PARTY_TABS = [
  { id: 'party',       label: 'Party' },
  { id: 'suggestions', label: 'Suggestions' },
  { id: 'saved',       label: 'Saved' },
  { id: 'battles',     label: 'Battles' },
]

export function PartyTracker() {
  const { activeRun, players, catches, partySlots, soulLinks, levelCap, battleRecords, savedParties, refreshSavedParties, refreshParty, optimisticAddLink, optimisticRemoveLink, optimisticClearParty } = useAppStore()
  const api = useApi()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [activeTab, setActiveTab] = useSessionState('party_tab', 'party')

  if (!activeRun) return <div className="p-6 text-text-muted">No active run</div>

  function handleRemove(catchId: string) {
    optimisticRemoveLink(catchId)
    api.party.removeSoulLink(activeRun!.id, catchId).then(() => refreshParty())
  }

  function handleAdded() {
    refreshParty()
  }

  async function handleSaveParty() {
    const name = saveName.trim()
    if (!name || partySlots.length === 0) return
    const snapshot = players.map((p) => ({
      player_id: p.id,
      slots: partySlots
        .filter((ps) => ps.player_id === p.id)
        .map((ps) => ({ slot: ps.slot, catch_id: ps.catch_id })),
    })).filter((ps) => ps.slots.length > 0)
    await api.savedParties.create({ run_id: activeRun!.id, name, party_snapshot: snapshot })
    setSaveName('')
    setSaveModalOpen(false)
    await refreshSavedParties()
  }

  const activeLinks = soulLinks.filter((sl) => sl.status === 'active')
  const inPartyLinks = activeLinks.filter((sl) =>
    sl.catch_ids.some((cid) => partySlots.some((ps) => ps.catch_id === cid))
  )
  const inPartyCount = inPartyLinks.length
  const availableCount = activeLinks.filter(
    (sl) => !sl.catch_ids.some((cid) => partySlots.some((ps) => ps.catch_id === cid))
  ).length

  return (
    <div className="flex flex-col">
      <Tabs tabs={PARTY_TABS} value={activeTab} onValueChange={setActiveTab}>

        {/* ── Party tab ── */}
        <TabContent value="party" className="p-4">
          <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={() => setPickerOpen(true)} disabled={availableCount === 0} className="bg-accent-teal hover:bg-teal-500 focus:ring-accent-teal text-white">
                  <Plus className="w-4 h-4" /> {players.length === 1 ? 'Add Pokémon' : 'Add Soul Link'}
                </Button>
                <span className="text-xs text-text-muted">
                  {players.length === 1
                    ? `${inPartyCount} Pokémon in party`
                    : `${inPartyCount} soul link${inPartyCount !== 1 ? 's' : ''} in party`}
                  {availableCount > 0 && ` · ${availableCount} available`}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {saveModalOpen ? (
                    <>
                      <input
                        autoFocus
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveParty(); if (e.key === 'Escape') setSaveModalOpen(false) }}
                        placeholder="Party name…"
                        className="text-xs bg-elevated border border-border rounded px-2 py-1 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-light w-36"
                      />
                      <button
                        onClick={handleSaveParty}
                        disabled={!saveName.trim() || partySlots.length === 0}
                        className="text-xs px-3 py-1.5 rounded bg-accent-teal text-white hover:bg-teal-500 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Save
                      </button>
                      <button onClick={() => setSaveModalOpen(false)} className="text-text-muted hover:text-text-secondary">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          optimisticClearParty()
                          Promise.all(players.map((player) => api.party.clearAll(activeRun!.id, player.id))).then(() => refreshParty())
                        }}
                        disabled={partySlots.length === 0}
                        className="text-xs px-2 py-1 rounded border border-border text-text-muted hover:text-red-400 hover:border-red-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Clear Party
                      </button>
                      <button
                        onClick={() => setSaveModalOpen(true)}
                        disabled={partySlots.length === 0}
                        className="text-xs px-3 py-1.5 rounded bg-accent-teal text-white hover:bg-teal-500 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Save Party
                      </button>
                    </>
                  )}
                </div>
              </div>

              {((activeRun.ruleset.maxSharedTypeCount ?? 0) > 0 || (activeRun.ruleset.maxSameTeamTypeCount ?? 0) > 0) && partySlots.length > 0 && (
                <TypeOverlapWarning
                  partySlots={partySlots}
                  catches={catches}
                  players={players}
                  limit={activeRun.ruleset.maxSharedTypeCount ?? 0}
                  perTeamLimit={activeRun.ruleset.maxSameTeamTypeCount ?? 0}
                  generation={activeRun.generation}
                />
              )}

              <PartyLinkTable
                players={players}
                partySlots={partySlots}
                catches={catches}
                soulLinks={soulLinks}
                levelCap={levelCap}
                onRemove={handleRemove}
              />
          </div>
        </TabContent>

        {/* ── Suggestions tab ── */}
        <TabContent value="suggestions" className="p-4 space-y-3">
          {activeLinks.length === 0 ? (
            <p className="text-sm text-text-muted">{players.length === 1 ? 'No Pokémon in party yet.' : 'No active soul links yet.'}</p>
          ) : (
            <BestCombosSection
              activeLinks={activeLinks}
              inPartyLinks={inPartyLinks}
              catches={catches}
              players={players}
              runId={activeRun.id}
              onAdded={handleAdded}
              maxSharedTypeCount={activeRun.ruleset.maxSharedTypeCount ?? 0}
              maxSameTeamTypeCount={activeRun.ruleset.maxSameTeamTypeCount ?? 0}
              levelCap={levelCap}
              generation={activeRun.generation}
            />
          )}
        </TabContent>

        {/* ── Saved tab ── */}
        <TabContent value="saved" className="p-4">
          {savedParties.length === 0 ? (
            <p className="text-sm text-text-muted">No saved parties yet. Build a party and use Save Party.</p>
          ) : (
            <SavedPartiesSection
              savedParties={savedParties}
              catches={catches}
              players={players}
              runId={activeRun.id}
              onLoaded={handleAdded}
              onDeleted={refreshSavedParties}
            />
          )}
        </TabContent>

        {/* ── Battles tab ── */}
        <TabContent value="battles" className="p-4">
          {battleRecords.filter((b) => b.outcome === 'victory').length === 0 ? (
            <p className="text-sm text-text-muted">No completed battles yet.</p>
          ) : (
            <PastBattlePartiesSection
              battleRecords={battleRecords}
              catches={catches}
              players={players}
              runId={activeRun.id}
              onLoaded={handleAdded}
            />
          )}
        </TabContent>

      </Tabs>

      <SoulLinkPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        runId={activeRun.id}
        onAdded={(link) => optimisticAddLink(link)}
      />
    </div>
  )
}
