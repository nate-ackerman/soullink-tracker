import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Link2, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { useQueries } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { PokemonSprite } from '../components/pokemon/PokemonSprite'
import { EvolvedCatchSprite } from '../components/pokemon/EvolvedCatchSprite'
import { TypeBadge } from '../components/pokemon/TypeBadge'
import { useAppStore } from '../store/appStore'
import { usePokemonById, usePokemonSpecies, useEvolutionChain, usePokemonByName } from '../api/pokeapi'
import type { PokemonData, PokemonSpeciesData, EvolutionChainData } from '../api/pokeapi'
import { formatPokemonName } from '../utils/cn'
import { resolveEvolutionAtLevel } from '../utils/evolutionUtils'
import type { Catch, Player, SoulLink, BattleRecord } from '../types'

// Normal/Flying Pokémon are treated as Flying primary for type-overlap purposes
function getEffectivePrimaryType(data: PokemonData): string | null {
  const primary = data.types.find((t) => t.slot === 1)?.type.name ?? null
  const secondary = data.types.find((t) => t.slot === 2)?.type.name ?? null
  if (primary === 'normal' && secondary === 'flying') return 'flying'
  return primary
}

// ── Type badge loader ─────────────────────────────────────────────────────────

function PokemonTypes({ pokemonId }: { pokemonId: number | null }) {
  const { data } = usePokemonById(pokemonId ?? 0)
  if (!data || !pokemonId) return null
  return (
    <div className="flex gap-0.5 flex-wrap mt-0.5">
      {data.types.map((t) => <TypeBadge key={t.type.name} type={t.type.name} size="sm" />)}
    </div>
  )
}

// ── Evolution lookup hook (3 hooks — call 6× for fixed count) ────────────────

function useSlotEvolution(pokemonId: number, pokemonName: string | undefined, levelCap: number | null): PokemonData | null {
  const { data: speciesData } = usePokemonSpecies(pokemonId)
  const chainUrl = speciesData?.evolution_chain?.url ?? ''
  const { data: chainData } = useEvolutionChain(chainUrl)

  const evolvedName = useMemo(() => {
    if (!chainData || levelCap === null || !pokemonName) return ''
    const resolved = resolveEvolutionAtLevel(chainData.chain, pokemonName, levelCap)
    return resolved !== pokemonName ? resolved : ''
  }, [chainData, levelCap, pokemonName])

  const { data: evolvedData } = usePokemonByName(evolvedName)
  return evolvedName && evolvedData ? evolvedData : null
}

// ── Avg BST hook (fixed 6 calls — stable) ────────────────────────────────────

function usePartyBST(party: (Catch | undefined)[], evolutions: (PokemonData | null)[]): number | null {
  const r0 = usePokemonById(party[0]?.pokemon_id ?? 0)
  const r1 = usePokemonById(party[1]?.pokemon_id ?? 0)
  const r2 = usePokemonById(party[2]?.pokemon_id ?? 0)
  const r3 = usePokemonById(party[3]?.pokemon_id ?? 0)
  const r4 = usePokemonById(party[4]?.pokemon_id ?? 0)
  const r5 = usePokemonById(party[5]?.pokemon_id ?? 0)
  const results = [r0, r1, r2, r3, r4, r5]
  const bsts = results
    .map((r, i) => {
      if (!party[i]) return null
      const data = evolutions[i] ?? r.data
      return data ? data.stats.reduce((s, x) => s + x.base_stat, 0) : null
    })
    .filter((v): v is number => v !== null)
  return bsts.length > 0 ? Math.round(bsts.reduce((a, b) => a + b, 0) / bsts.length) : null
}

// ── Soul link pair picker modal ───────────────────────────────────────────────

interface SoulLinkPickerProps {
  open: boolean
  onClose: () => void
  runId: string
  onAdded: () => void
}

function SoulLinkPicker({ open, onClose, runId, onAdded }: SoulLinkPickerProps) {
  const { soulLinks, catches, players, partySlots, activeRun, levelCap } = useAppStore()
  const [loading, setLoading] = useState(false)

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
      enabled: id > 0,
    })),
  })

  const primaryTypeMap = useMemo(() => {
    const map = new Map<number, string>()
    allPokemonIds.forEach((id, i) => {
      const data = typeResults[i]?.data
      if (data) {
        const type = getEffectivePrimaryType(data)
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
    setLoading(true)
    try {
      await window.api.party.addSoulLink(runId, link.catch_ids[0])
      onAdded()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Add Soul Link to Party" size="md">
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {available.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">
            {soulLinks.filter((sl) => sl.status === 'active').length === 0
              ? 'No active soul links yet — catch Pokémon on routes first'
              : 'All active soul links are already in party'}
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
                disabled={loading || blocked}
                title={blocked ? `Exceeds ${maxTypeLimit}-${violation} type limit` : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded border transition-colors text-left ${
                  blocked
                    ? 'bg-input/50 border-border opacity-50 cursor-not-allowed'
                    : 'bg-input border-border hover:border-border-light'
                }`}
              >
                <Link2 className={`w-3.5 h-3.5 shrink-0 ${blocked ? 'text-text-muted' : 'text-accent-teal'}`} />
                <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
                  {linkedCatches.map((c, idx) => {
                    const p = players.find((pl) => pl.id === c.player_id)
                    return (
                      <div key={c.id} className="flex items-center gap-1.5">
                        {idx > 0 && <span className="text-text-muted text-xs">↔</span>}
                        <PokemonSprite pokemonId={c.pokemon_id} pokemonName={c.pokemon_name} size={32} />
                        <div>
                          <p className="text-xs font-medium text-text-primary">
                            {formatPokemonName(c.nickname ?? c.pokemon_name)}
                          </p>
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
  levelCap,
}: {
  catch_?: Catch
  onRemove: () => void
  evolvedTo?: PokemonData
  levelCap: number | null
}) {
  if (!catch_) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-elevated/20 flex flex-col items-center justify-center gap-1 p-2"
        style={{ minHeight: 90 }}
      >
        <span className="text-text-muted text-xs opacity-50">—</span>
      </div>
    )
  }

  const navigate = useNavigate()
  const displayId = evolvedTo?.id ?? catch_.pokemon_id
  const displayName = evolvedTo?.name ?? catch_.pokemon_name

  return (
    <div
      onClick={() => navigate('/learnset', { state: { pokemon: displayName ?? catch_.pokemon_name } })}
      className="relative rounded-lg border border-accent-teal/30 bg-card p-2 flex flex-col items-center gap-1 cursor-pointer hover:opacity-75 transition-opacity"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="absolute top-0.5 right-0.5 p-0.5 rounded text-text-muted hover:text-red-400 hover:bg-elevated transition-colors"
        title="Remove soul link from party"
      >
        <X className="w-3 h-3" />
      </button>
      <PokemonSprite
        pokemonId={displayId}
        pokemonName={displayName}
        size={48}
        grayscale={catch_.status !== 'alive'}
      />
      <div className="text-center w-full">
        <p className="text-xs font-medium text-text-primary truncate">
          {formatPokemonName(catch_.nickname ?? catch_.pokemon_name)}
        </p>
        {evolvedTo && (
          <p className="text-[10px] text-accent-teal truncate capitalize">→ {evolvedTo.name}</p>
        )}
        <p className="text-[10px] text-text-secondary">Lv. {levelCap ?? 5}</p>
        <PokemonTypes pokemonId={displayId} />
      </div>
    </div>
  )
}

// ── Player party card (extracts hook call out of map loop) ────────────────────

function PlayerPartyCard({
  player,
  party,
  runId,
  onRemove,
  levelCap,
}: {
  player: Player
  party: (Catch | undefined)[]
  runId: string
  onRemove: (catchId: string) => void
  levelCap: number | null
}) {
  // 6 fixed evolution lookups (each is 3 hooks = 18 hooks total, always called)
  const evol0 = useSlotEvolution(party[0]?.pokemon_id ?? 0, party[0]?.pokemon_name ?? undefined, levelCap)
  const evol1 = useSlotEvolution(party[1]?.pokemon_id ?? 0, party[1]?.pokemon_name ?? undefined, levelCap)
  const evol2 = useSlotEvolution(party[2]?.pokemon_id ?? 0, party[2]?.pokemon_name ?? undefined, levelCap)
  const evol3 = useSlotEvolution(party[3]?.pokemon_id ?? 0, party[3]?.pokemon_name ?? undefined, levelCap)
  const evol4 = useSlotEvolution(party[4]?.pokemon_id ?? 0, party[4]?.pokemon_name ?? undefined, levelCap)
  const evol5 = useSlotEvolution(party[5]?.pokemon_id ?? 0, party[5]?.pokemon_name ?? undefined, levelCap)
  const evolutions = [evol0, evol1, evol2, evol3, evol4, evol5]

  const avgBST = usePartyBST(party, evolutions)

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="overflow-hidden">
        <div className="h-1.5" style={{ backgroundColor: player.color }} />
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: player.color }} />
            <span className="font-semibold text-text-primary">{player.name}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            {avgBST !== null && <span>Avg BST: {avgBST}</span>}
            <span>{party.filter(Boolean).length}/6</span>
          </div>
        </div>
        <CardContent>
          <div className="grid grid-cols-6 gap-2">
            {party.map((catch_, slot) => (
              <PartySlotCard
                key={slot}
                catch_={catch_}
                onRemove={() => catch_ && onRemove(catch_.id)}
                evolvedTo={evolutions[slot] ?? undefined}
                levelCap={levelCap}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Type overlap warning ──────────────────────────────────────────────────────

function TypeOverlapWarning({
  partySlots,
  catches,
  players,
  limit,
  perTeamLimit,
}: {
  partySlots: { catch_id: string; player_id: string }[]
  catches: Catch[]
  players: Player[]
  limit: number
  perTeamLimit: number
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
        const type = getEffectivePrimaryType(data)
        if (type) map.set(id, type)
      }
    })
    return map
  }, [results, pokemonIds])

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
}) {
  const [applying, setApplying] = useState(false)

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
      enabled: id > 0 && levelCap !== null,
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

  // pokemonId → evolved name (empty map when no level cap)
  const evolvedNameMap = useMemo(() => {
    if (levelCap === null) return new Map<number, string>()
    const map = new Map<number, string>()
    pokemonIds.forEach((id, i) => {
      const name = pokemonNameMap.get(id)
      if (!name) return
      const chainUrl = speciesResults[i]?.data?.evolution_chain?.url ?? ''
      const chain = chainMap.get(chainUrl)
      if (!chain) return
      const evolved = resolveEvolutionAtLevel(chain, name, levelCap)
      if (evolved !== name) map.set(id, evolved)
    })
    return map
  }, [pokemonIds, pokemonNameMap, speciesResults, chainMap, levelCap])

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
      const effectiveType = getEffectivePrimaryType(data)
      if (effectiveType) type.set(id, effectiveType)
    })
    return { effectiveBstMap: bst, primaryTypeMap: type }
  }, [results, pokemonIds, evolvedNameMap, evolvedBstByName])

  const allLoaded = pokemonIds.length > 0 && pokemonIds.every((id) => effectiveBstMap.has(id))

  function scoreCombo(links: SoulLink[]): { total: number; avg: number; weighted: number; worstWeighted: number } {
    const ids = links.flatMap((l) =>
      l.catch_ids.map((cid) => catches.find((c) => c.id === cid)?.pokemon_id ?? 0)
    )
    const bsts = ids.map((id) => effectiveBstMap.get(id)).filter((v): v is number => v !== undefined)
    const total = bsts.reduce((a, b) => a + b, 0)
    const avg = bsts.length > 0 ? Math.round(total / bsts.length) : 0
    const weighted = Math.round(avg * Math.sqrt(links.length / 6))

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
    if (!allLoaded || availableLinks.length === 0) return { topCombos: [], topWeightedCombos: [], topMinWeightedCombos: [] }

    const slotsUsed = inPartyLinks.length
    const slotsLeft = Math.max(0, 6 - slotsUsed)

    let scored: { additions: SoulLink[]; combined: SoulLink[]; total: number; avg: number; weighted: number; worstWeighted: number }[]

    if (maxSharedTypeCount === 0 && maxSameTeamTypeCount === 0) {
      const k = Math.min(slotsLeft > 0 ? slotsLeft : 6, availableLinks.length)
      if (k === 0 || availableLinks.length < k) return { topCombos: [], topWeightedCombos: [], topMinWeightedCombos: [] }
      scored = getCombinations(availableLinks, k).map((additions) => {
        const combined = [...inPartyLinks, ...additions]
        return { additions, combined, ...scoreCombo(combined) }
      })
    } else {
      scored = []
      const maxK = Math.min(slotsLeft > 0 ? slotsLeft : 6, availableLinks.length)
      for (let k = maxK; k >= 1; k--) {
        for (const additions of getCombinations(availableLinks, k)) {
          const combined = [...inPartyLinks, ...additions]
          if (isValidCombo(combined)) {
            scored.push({ additions, combined, ...scoreCombo(combined) })
          }
        }
      }
    }

    return {
      topCombos: [...scored].sort((a, b) => b.total - a.total).slice(0, 3),
      topWeightedCombos: [...scored].sort((a, b) => b.weighted - a.weighted).slice(0, 3),
      topMinWeightedCombos: [...scored].sort((a, b) => b.worstWeighted - a.worstWeighted).slice(0, 3),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLoaded, availableLinks, inPartyLinks, effectiveBstMap, primaryTypeMap, catches, maxSharedTypeCount, maxSameTeamTypeCount])

  const hasTypeLimit = maxSharedTypeCount > 0 || maxSameTeamTypeCount > 0
  if (availableLinks.length === 0) return null

  function renderComboRow(
    combo: { additions: SoulLink[]; combined: SoulLink[]; total: number; avg: number; weighted: number },
    rank: number,
    scoreLabel: string,
    scoreValue: number,
    secondaryLabel: string,
    secondaryValue: number | string,
  ) {
    const { additions, combined } = combo
    return (
      <div key={rank} className="flex items-center gap-3 p-2 rounded-lg bg-elevated border border-border">
        <span className="text-xs font-bold text-text-muted w-5 shrink-0">#{rank + 1}</span>
        <div className="flex items-center gap-2 flex-1 flex-wrap min-w-0">
          {combined.map((link, li) => {
            const linkedCatches = link.catch_ids
              .map((cid) => catches.find((c) => c.id === cid))
              .filter(Boolean) as Catch[]
            const isNew = additions.some((a) => a.id === link.id)
            return (
              <div key={link.id} className={`flex items-center gap-1 ${isNew ? 'ring-1 ring-accent-teal/50 rounded' : 'opacity-60'}`}>
                {li > 0 && <span className="text-text-muted text-[10px] mx-0.5">·</span>}
                {linkedCatches.map((c, ci) => {
                  const p = players.find((pl) => pl.id === c.player_id)
                  return (
                    <div key={c.id} className="flex items-center gap-0.5" title={`${formatPokemonName(c.nickname ?? c.pokemon_name)} (${p?.name})${isNew ? ' — new' : ' — in party'}`}>
                      {ci > 0 && <Link2 className="w-2.5 h-2.5 text-accent-teal" />}
                      <EvolvedCatchSprite pokemonId={c.pokemon_id} pokemonName={c.pokemon_name} levelCap={levelCap} size={24} />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-xs font-medium text-text-secondary">{scoreLabel}: {scoreValue}</span>
          <span className="text-[10px] text-text-muted">{secondaryLabel}: {secondaryValue}</span>
          <span className="text-[10px] text-text-muted">+{additions.length} link{additions.length !== 1 ? 's' : ''}</span>
        </div>
        <button
          onClick={() => applyCombo(additions)}
          disabled={applying}
          className="text-xs px-2 py-1 rounded border border-border hover:border-accent-teal hover:text-accent-teal text-text-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          title="Add suggested links to party"
        >
          Add
        </button>
      </div>
    )
  }

  async function applyCombo(additions: SoulLink[]) {
    setApplying(true)
    try {
      for (const link of additions) {
        await window.api.party.addSoulLink(runId, link.catch_ids[0])
      }
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
          <CardTitle className="flex items-center gap-2">
            Top Party Combos
            <span className="text-xs text-text-muted font-normal">
              {inPartyLinks.length > 0
                ? `(best additions for your ${inPartyLinks.length}-link party)`
                : hasTypeLimit ? '(valid combos by total BST)' : '(by total BST)'}
            </span>
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
          <CardTitle className="flex items-center gap-2">
            Top Party Combos
            <span className="text-xs text-text-muted font-normal">(by weighted avg — rewards fuller teams)</span>
          </CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Top Party Combos
            <span className="text-xs text-text-muted font-normal">(strengthen the weakest player)</span>
          </CardTitle>
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
    </div>
  )
}

// ── Past Battle Parties ───────────────────────────────────────────────────────

function PastBattlePartiesSection({
  battleRecords,
  catches,
  players,
  soulLinks,
  runId,
  onLoaded,
}: {
  battleRecords: BattleRecord[]
  catches: Catch[]
  players: Player[]
  soulLinks: SoulLink[]
  runId: string
  onLoaded: () => void
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const victories = [...battleRecords].filter((b) => b.outcome === 'victory')
  if (victories.length === 0) return null

  // Canonical key for a party snapshot — sorted so order doesn't matter
  function snapshotKey(battle: BattleRecord): string {
    return battle.party_snapshot
      .map((ps) => `${ps.player_id}:${[...ps.slots].sort((a, b) => a.slot - b.slot).map((s) => s.catch_id).join(',')}`)
      .sort()
      .join('|')
  }

  // Group battles by identical party, preserving chronological order of first use
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
        await window.api.party.clearAll(runId, player.id)
      }
      for (const ps of battle.party_snapshot) {
        for (const { slot, catch_id } of ps.slots) {
          const c = catches.find((x) => x.id === catch_id)
          if (c && c.status === 'alive') {
            await window.api.party.setSlot(runId, ps.player_id, slot, catch_id)
          }
        }
      }
      onLoaded()
    } finally {
      setLoading(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Past Battle Parties</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {[...groups].reverse().map(({ key, battles }) => {
          const representative = battles[0]
          return (
            <div key={key} className="flex items-center gap-3 p-2 rounded-lg bg-elevated border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-primary">
                  {battles.map((b) => b.gym_leader_name).join(', ')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const allCatchIds = representative.party_snapshot.flatMap((ps) => ps.slots.map((s) => s.catch_id))
                  const assigned = new Set<string>()
                  const groups: string[][] = []
                  for (const cid of allCatchIds) {
                    if (assigned.has(cid)) continue
                    const link = soulLinks.find((sl) => sl.catch_ids.includes(cid))
                    if (link) {
                      const group = link.catch_ids.filter((id) => allCatchIds.includes(id))
                      groups.push(group)
                      group.forEach((id) => assigned.add(id))
                    } else {
                      groups.push([cid])
                      assigned.add(cid)
                    }
                  }
                  return groups.map((group, gi) => (
                    <div key={gi} className="flex items-center gap-1">
                      {gi > 0 && <span className="text-text-muted text-[10px] mx-0.5">·</span>}
                      {group.map((cid, ci) => {
                        const c = catches.find((x) => x.id === cid)
                        const player = c ? players.find((p) => p.id === c.player_id) : undefined
                        return c ? (
                          <div key={cid} className="flex items-center gap-0.5" title={`${player?.name ?? ''}: ${c.nickname ?? c.pokemon_name ?? '?'}`}>
                            {ci > 0 && <Link2 className="w-2.5 h-2.5 text-accent-teal" />}
                            <EvolvedCatchSprite
                              pokemonId={c.pokemon_id}
                              pokemonName={c.pokemon_name}
                              levelCap={null}
                              size={24}
                              grayscale={c.status === 'dead'}
                            />
                          </div>
                        ) : null
                      })}
                    </div>
                  ))
                })()}
              </div>
              <button
                onClick={() => loadParty(representative)}
                disabled={loading === representative.id}
                className="text-xs px-2 py-1 rounded border border-border text-text-muted hover:text-accent-teal hover:border-accent-teal transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {loading === representative.id ? '…' : 'Load'}
              </button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PartyTracker() {
  const { activeRun, players, catches, partySlots, soulLinks, loadRunData, activeRunId, levelCap, battleRecords } = useAppStore()
  const [pickerOpen, setPickerOpen] = useState(false)

  if (!activeRun) return <div className="p-6 text-text-muted">No active run</div>

  async function handleRemove(catchId: string) {
    await window.api.party.removeSoulLink(activeRun!.id, catchId)
    if (activeRunId) await loadRunData(activeRunId)
  }

  async function handleAdded() {
    if (activeRunId) await loadRunData(activeRunId)
  }

  function getPlayerParty(playerId: string): (Catch | undefined)[] {
    const slots = partySlots.filter((ps) => ps.player_id === playerId)
    return [0, 1, 2, 3, 4, 5].map((slot) => {
      const ps = slots.find((s) => s.slot === slot)
      return ps ? catches.find((c) => c.id === ps.catch_id) : undefined
    })
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
    <div className="p-4 space-y-4">
      {/* Add button + stats */}
      <div className="flex items-center gap-3">
        <Button onClick={() => setPickerOpen(true)} disabled={availableCount === 0}>
          <Plus className="w-4 h-4" /> Add Soul Link
        </Button>
        <span className="text-xs text-text-muted">
          {inPartyCount} soul link{inPartyCount !== 1 ? 's' : ''} in party
          {availableCount > 0 && ` · ${availableCount} available`}
        </span>
      </div>

      {/* Type overlap warning */}
      {((activeRun.ruleset.maxSharedTypeCount ?? 0) > 0 || (activeRun.ruleset.maxSameTeamTypeCount ?? 0) > 0) && partySlots.length > 0 && (
        <TypeOverlapWarning
          partySlots={partySlots}
          catches={catches}
          players={players}
          limit={activeRun.ruleset.maxSharedTypeCount ?? 0}
          perTeamLimit={activeRun.ruleset.maxSameTeamTypeCount ?? 0}
        />
      )}

      {/* Per-player party grids */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${Math.min(players.length, 2)}, 1fr)` }}
      >
        {players.map((player) => (
          <PlayerPartyCard
            key={player.id}
            player={player}
            party={getPlayerParty(player.id)}
            runId={activeRun.id}
            onRemove={handleRemove}
            levelCap={levelCap}
          />
        ))}
      </div>

      {/* Soul links in party summary */}
      {inPartyCount > 0 && (
        <Card>
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Soul Links in Party
            </h3>
          </div>
          <CardContent className="space-y-2">
            {soulLinks
              .filter((sl) => sl.catch_ids.some((cid) => partySlots.some((ps) => ps.catch_id === cid)))
              .map((sl) => {
                const linkedCatches = sl.catch_ids
                  .map((cid) => catches.find((c) => c.id === cid))
                  .filter(Boolean) as Catch[]
                return (
                  <div key={sl.id} className="flex items-center gap-3">
                    <Link2 className="w-3.5 h-3.5 text-accent-teal shrink-0" />
                    {linkedCatches[0]?.nickname && (
                      <span className="text-xs font-semibold text-text-primary shrink-0">"{linkedCatches[0].nickname}"</span>
                    )}
                    {linkedCatches.map((c, i) => {
                      const p = players.find((pl) => pl.id === c.player_id)
                      return (
                        <div key={c.id} className="flex items-center gap-1.5">
                          {i > 0 && <span className="text-text-muted text-xs">↔</span>}
                          <PokemonSprite pokemonId={c.pokemon_id} pokemonName={c.pokemon_name} size={22} />
                          <span className="text-xs text-text-secondary capitalize">{c.pokemon_name ?? '?'}</span>
                          {p && <span className="text-[10px]" style={{ color: p.color }}>{p.name}</span>}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
          </CardContent>
        </Card>
      )}

      {/* Best party combos by BST */}
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
      />

      {/* Past battle parties */}
      <PastBattlePartiesSection
        battleRecords={battleRecords}
        catches={catches}
        players={players}
        soulLinks={soulLinks}
        runId={activeRun.id}
        onLoaded={handleAdded}
      />

      <SoulLinkPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        runId={activeRun.id}
        onAdded={handleAdded}
      />
    </div>
  )
}
