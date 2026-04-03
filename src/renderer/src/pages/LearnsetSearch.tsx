import { useLocation } from 'react-router-dom'
import { BookOpen, ChevronRight } from 'lucide-react'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { TypeBadge } from '../components/pokemon/TypeBadge'
import { PokemonSprite } from '../components/pokemon/PokemonSprite'
import { Spinner } from '../components/ui/Spinner'
import { Tabs, TabContent } from '../components/ui/Tabs'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useAppStore } from '../store/appStore'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useSessionState } from '../hooks/useSessionState'
import { usePokemonByName, useMoveDetailsBatch, useMachineBatch, usePokemonSearch, usePokemonSpecies, usePokemonSpeciesBatch, useEvolutionChain, useAbilityBatch, getPokemonTypes, extractMovesForGeneration, getVersionGroups, GEN_NAME_TO_NUM, VERSION_GROUP_TO_GEN } from '../api/pokeapi'
import type { LearnsetMove, MoveData, AbilityData, ChainLink, PokemonData, PokemonSpeciesData } from '../api/pokeapi'
import { Modal } from '../components/ui/Modal'
import { getTypeMatchups } from '../data/typeColors'
import {
  getAvailableBalls, getBallBonus, calculateCatchProbability, calculateAllBalls,
  STATUS_BONUSES, STATUS_OPTIONS,
} from '../utils/catchRate'

interface EvoStage { name: string; level: number | null }

// Collect all species in the chain via DFS, carrying the level required to reach each stage
function flattenChain(link: ChainLink, incomingLevel: number | null = null): EvoStage[] {
  return [
    { name: link.species.name, level: incomingLevel },
    ...link.evolves_to.flatMap((next) => {
      const detail = next.evolution_details.find((d) => d.trigger.name === 'level-up' && d.min_level !== null)
      return flattenChain(next, detail?.min_level ?? null)
    }),
  ]
}

function EvolutionStage({ name, isSelected, onClick }: { name: string; isSelected: boolean; onClick: () => void }) {
  const { data, isLoading } = usePokemonByName(name)
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-colors ${
        isSelected ? 'bg-accent-teal/20 ring-1 ring-accent-teal' : 'hover:bg-elevated'
      }`}
    >
      {isLoading || !data?.id
        ? <div className="rounded bg-elevated animate-pulse" style={{ width: 36, height: 36 }} />
        : <PokemonSprite pokemonId={data.id} pokemonName={name} size={36} />
      }
      <span className="text-[10px] capitalize text-text-secondary whitespace-nowrap">{name.replace(/-/g, ' ')}</span>
    </button>
  )
}

const LEARN_METHOD_TABS = [
  { id: 'level-up', label: 'Level Up' },
  { id: 'machine', label: 'TM/HM' },
  { id: 'tutor', label: 'Tutor' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'matchups', label: 'Matchups' },
  { id: 'catch-calc', label: 'Catch Calc' },
]

// ── Type matchup matrix ───────────────────────────────────────────────────────

const MATCHUP_TIERS = [
  { mult: 4,    label: '4×',  classes: 'text-red-400    bg-red-500/10    border-red-500/30'    },
  { mult: 2,    label: '2×',  classes: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  { mult: 0.5,  label: '½×',  classes: 'text-teal-400   bg-teal-500/10   border-teal-500/30'   },
  { mult: 0.25, label: '¼×',  classes: 'text-blue-400   bg-blue-500/10   border-blue-500/30'   },
  { mult: 0,    label: '0×',  classes: 'text-text-muted  bg-elevated      border-border'        },
]

function TypeMatchupMatrix({ types, generation }: { types: string[]; generation: number }) {
  const matchups = useMemo(() => getTypeMatchups(types, generation), [types, generation])

  return (
    <div className="p-4 space-y-2">
      {MATCHUP_TIERS.map(({ mult, label, classes }) => {
        const attackTypes = Object.entries(matchups)
          .filter(([, m]) => m === mult)
          .map(([t]) => t)
        if (attackTypes.length === 0) return null
        return (
          <div key={label} className="flex items-center gap-3">
            <span className={`text-xs font-bold px-2 py-1 rounded border w-9 text-center shrink-0 ${classes}`}>
              {label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {attackTypes.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AbilityCard({ name, isHidden, data, versionGroups, generation }: {
  name: string
  isHidden: boolean
  data: AbilityData | undefined
  versionGroups: string[]
  generation: number
}) {
  const { flavorText, fullEffect } = useMemo(() => {
    if (!data) return { flavorText: null, fullEffect: null }

    const flavor = data.flavor_text_entries.find(
      e => e.language.name === 'en' && versionGroups.includes(e.version_group.name)
    )?.flavor_text ?? null

    // Find the most specific effect_changes entry that covers the current generation.
    // Each entry describes how the ability behaved up to and including that version group.
    // We want the entry with the smallest gen that is still >= currentGeneration.
    const applicableChange = data.effect_changes
      .map(c => ({ gen: VERSION_GROUP_TO_GEN[c.version_group.name] ?? 99, c }))
      .filter(({ gen }) => gen >= generation)
      .sort((a, b) => a.gen - b.gen)[0]?.c

    const effect = (
      applicableChange?.effect_entries.find(e => e.language.name === 'en')?.effect
      ?? data.effect_entries.find(e => e.language.name === 'en')?.effect
      ?? data.effect_entries[0]?.effect
      ?? null
    )

    return { flavorText: flavor, fullEffect: effect }
  }, [data, versionGroups, generation])

  return (
    <div className="p-4 border border-border rounded-lg space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-text-primary capitalize">
          {name.replace(/-/g, ' ')}
        </span>
        {isHidden && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400 border border-purple-500/30">
            Hidden
          </span>
        )}
      </div>
      {data ? (
        <>
          {flavorText && (
            <p className="text-xs text-text-secondary leading-relaxed">{flavorText}</p>
          )}
          {fullEffect ? (
            <p className={`text-xs leading-relaxed ${flavorText ? 'text-text-muted' : 'text-text-secondary'}`}>
              {fullEffect}
            </p>
          ) : !flavorText && (
            <p className="text-xs text-text-muted italic">No description available.</p>
          )}
        </>
      ) : (
        <div className="space-y-1.5">
          <div className="h-3 bg-elevated rounded animate-pulse w-full" />
          <div className="h-3 bg-elevated rounded animate-pulse w-4/5" />
        </div>
      )}
    </div>
  )
}

function MoveDetailModal({ moveName, moveData, open, onClose, generation }: { moveName: string; moveData: MoveData | undefined; open: boolean; onClose: () => void; generation: number }) {
  const effectText = useMemo(() => {
    if (!moveData) return null
    const applicableChange = moveData.effect_changes
      ?.map(c => ({ gen: VERSION_GROUP_TO_GEN[c.version_group.name] ?? 99, c }))
      .filter(({ gen }) => gen >= generation)
      .sort((a, b) => a.gen - b.gen)[0]?.c
    return (
      applicableChange?.effect_entries.find(e => e.language.name === 'en')?.effect
      ?? moveData.effect_entries.find((e) => e.language.name === 'en')?.effect
      ?? moveData.effect_entries[0]?.effect
      ?? null
    )
  }, [moveData, generation])

  const displayEffect = effectText && moveData?.effect_chance != null
    ? effectText.replace(/\$effect_chance/g, String(moveData.effect_chance))
    : effectText

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={moveName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} size="sm">
      {moveData ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <TypeBadge type={moveData.type.name} size="sm" />
            <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${
              moveData.damage_class.name === 'physical'
                ? 'bg-red-900/30 text-red-400'
                : moveData.damage_class.name === 'special'
                ? 'bg-blue-900/30 text-blue-400'
                : 'bg-gray-700/30 text-gray-400'
            }`}>
              {moveData.damage_class.name}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-elevated rounded p-2">
              <p className="text-sm font-bold text-text-primary">{moveData.power ?? '—'}</p>
              <p className="text-[10px] text-text-muted uppercase">Power</p>
            </div>
            <div className="bg-elevated rounded p-2">
              <p className="text-sm font-bold text-text-primary">{moveData.accuracy ? `${moveData.accuracy}%` : '—'}</p>
              <p className="text-[10px] text-text-muted uppercase">Accuracy</p>
            </div>
            <div className="bg-elevated rounded p-2">
              <p className="text-sm font-bold text-text-primary">{moveData.pp ?? '—'}</p>
              <p className="text-[10px] text-text-muted uppercase">PP</p>
            </div>
          </div>
          {displayEffect && (
            <p className="text-sm text-text-secondary leading-relaxed">{displayEffect}</p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      )}
    </Modal>
  )
}

function MoveRow({ move, moveData, tmNumber, showTmColumn, onClick }: { move: LearnsetMove; moveData: MoveData | undefined; tmNumber?: string; showTmColumn?: boolean; onClick: () => void }) {
  return (
    <tr onClick={onClick} className="border-b border-border hover:bg-elevated/50 transition-colors cursor-pointer">
      {showTmColumn ? (
        <td className="px-3 py-2 text-xs font-medium text-text-secondary w-16">
          {tmNumber ?? <span className="text-text-muted">—</span>}
        </td>
      ) : (
        <td className="px-3 py-2 text-xs text-text-muted w-12">
          {move.learnMethod === 'level-up' && move.levelLearnedAt > 0 ? move.levelLearnedAt : '—'}
        </td>
      )}
      <td className="px-3 py-2 text-sm text-text-primary capitalize">
        {move.name.replace(/-/g, ' ')}
      </td>
      <td className="px-3 py-2">
        {moveData ? (
          <TypeBadge type={moveData.type.name} size="sm" />
        ) : (
          <div className="w-14 h-4 bg-elevated rounded animate-pulse" />
        )}
      </td>
      <td className="px-3 py-2">
        {moveData && (
          <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${
            moveData.damage_class.name === 'physical'
              ? 'bg-red-900/30 text-red-400'
              : moveData.damage_class.name === 'special'
              ? 'bg-blue-900/30 text-blue-400'
              : 'bg-gray-700/30 text-gray-400'
          }`}>
            {moveData.damage_class.name}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-text-secondary text-center">
        {moveData?.power ?? '—'}
      </td>
      <td className="px-3 py-2 text-xs text-text-secondary text-center">
        {moveData?.accuracy ? `${moveData.accuracy}%` : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-text-secondary text-center">
        {moveData?.pp ?? '—'}
      </td>
    </tr>
  )
}

// ── Catch Calculator tab ──────────────────────────────────────────────────────

function getBallSpriteUrl(id: string): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${id.replace('ball', '-ball')}.png`
}
function BallIcon({ id, size = 24 }: { id: string; size?: number }) {
  return <img src={getBallSpriteUrl(id)} alt="" width={size} height={size} style={{ imageRendering: 'pixelated' }} />
}
function getProbColor(prob: number): string {
  if (prob >= 0.75) return '#22c55e'
  if (prob >= 0.4)  return '#f59e0b'
  if (prob >= 0.15) return '#f97316'
  return '#ef4444'
}

function CatchCalcTab({ pokemonData, speciesData, generation, gameId }: {
  pokemonData: PokemonData | undefined
  speciesData: PokemonSpeciesData | undefined
  generation: number
  gameId: string
}) {
  const { levelCap } = useAppStore()
  const [wildLevel, setWildLevel] = useSessionState('catchcalc_level', String(levelCap ?? 5))
  const [turns, setTurns] = useSessionState('catchcalc_turns', '1')
  const [hpPercent, setHpPercent] = useSessionState('catchcalc_hp', '100')
  const [status, setStatus] = useSessionState('catchcalc_status', 'none')
  const [selectedBall, setSelectedBall] = useSessionState('catchcalc_ball', 'pokeball')

  const prevLevelCap = useRef(levelCap)
  useEffect(() => {
    if (levelCap !== null && levelCap !== prevLevelCap.current) setWildLevel(String(levelCap))
    prevLevelCap.current = levelCap
  }, [levelCap])

  const availableBalls = useMemo(() => getAvailableBalls(gameId, generation), [gameId, generation])
  const activeBallId = availableBalls.some((b) => b.id === selectedBall) ? selectedBall : 'pokeball'
  const selectedBallData = availableBalls.find((b) => b.id === activeBallId) ?? availableBalls[0]

  const level = Math.max(1, Math.min(100, parseInt(wildLevel) || 5))
  const turnCount = Math.max(1, Math.min(99, parseInt(turns) || 1))
  const baseHp = pokemonData?.stats.find((s) => s.stat.name === 'hp')?.base_stat ?? 45
  const maxHp = pokemonData ? Math.floor((2 * baseHp * level) / 100) + level + 10 : 100
  const hpPct = Math.max(1, Math.min(100, parseFloat(hpPercent) || 100))
  const currentHp = Math.max(1, Math.floor((maxHp * hpPct) / 100))
  const catchRate = speciesData?.capture_rate ?? 45
  const statusBonus = STATUS_BONUSES[status] ?? 1
  const selectedBallBonus = getBallBonus(activeBallId, level, turnCount, generation)
  const hasTurnBalls = availableBalls.some((b) => b.id === 'timerball' || b.id === 'quickball')

  const mainResult = useMemo(() => calculateCatchProbability({ maxHp, currentHp, catchRate, ballBonus: selectedBallBonus, statusBonus, generation }), [maxHp, currentHp, catchRate, selectedBallBonus, statusBonus, generation])
  const allBallResults = useMemo(() => calculateAllBalls({ maxHp, currentHp, catchRate, statusBonus, generation, level, turns: turnCount }, availableBalls).sort((a, b) => b.probability - a.probability), [maxHp, currentHp, catchRate, statusBonus, generation, level, turnCount, availableBalls])
  const ballOptions = availableBalls.map((b) => ({ value: b.id, label: b.note ? `${b.name} (${b.note})` : b.name }))

  if (!pokemonData) {
    return <div className="text-center py-12 text-text-muted text-sm">Search for a Pokémon above to use the catch calculator.</div>
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      {/* Catch rate summary */}
      <div className="flex items-center gap-3 px-3 py-2 bg-elevated rounded-lg border border-border text-sm">
        <span className="text-text-muted">Base catch rate:</span>
        <span className="font-bold text-text-primary">{catchRate}</span>
        <span className="text-text-muted">Gen {generation} formula</span>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-4">
          {/* Level + Turns */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input label="Wild Pokémon Level" type="number" min="1" max="100" value={wildLevel} onChange={(e) => setWildLevel(e.target.value)} placeholder="1–100" />
              <p className="text-[10px] text-text-muted mt-0.5">Max HP: <span className="font-medium text-text-secondary">{maxHp}</span> (base {baseHp})</p>
            </div>
            <div>
              <Input label="Turn number" type="number" min="1" max="99" value={turns} onChange={(e) => setTurns(e.target.value)} placeholder="1+" />
              {hasTurnBalls && (
                <p className="text-[10px] text-text-muted mt-0.5">
                  Affects {[availableBalls.some(b => b.id === 'timerball') && 'Timer Ball', availableBalls.some(b => b.id === 'quickball') && 'Quick Ball'].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>

          {/* HP + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input label={`HP Percentage (${hpPct}%)`} type="range" min="1" max="100" value={hpPercent} onChange={(e) => setHpPercent(e.target.value)} className="h-2 accent-accent-red px-0 py-0 border-0 bg-transparent" />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>1%</span>
                <span className="flex flex-col items-center gap-0.5">
                  <span className="text-accent-red font-semibold text-sm leading-none">{hpPct}%</span>
                  <span className="text-[10px]">current</span>
                </span>
                <span>100%</span>
              </div>
            </div>
            <Select label="Status Condition" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
          </div>

          <Select label="Poké Ball" options={ballOptions} value={activeBallId} onChange={(e) => setSelectedBall(e.target.value)} />
        </CardContent>
      </Card>

      {/* Main result */}
      <Card className="border-border-light">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BallIcon id={activeBallId} size={32} />
              <div>
                <span className="text-sm text-text-secondary">{selectedBallData.name}</span>
                {selectedBallData.note && <span className="text-xs text-text-muted ml-1.5">({selectedBallData.note})</span>}
                <p className="text-xs text-text-muted">×{selectedBallBonus.toFixed(selectedBallBonus % 1 === 0 ? 0 : 1)} ball bonus</p>
              </div>
            </div>
            <span className="text-2xl font-bold" style={{ color: getProbColor(mainResult.probability) }}>{mainResult.percentDisplay}</span>
          </div>
          <ProgressBar value={mainResult.probability * 100} max={100} color={getProbColor(mainResult.probability)} showPercent={false} />
          <div className="flex gap-4 text-sm">
            <div><p className="text-text-muted text-xs">Expected balls</p><p className="font-medium text-text-primary">{mainResult.probability >= 1 ? '1' : mainResult.expectedBalls.toFixed(1)}</p></div>
            <div><p className="text-text-muted text-xs">HP (approx)</p><p className="font-medium text-text-primary">{currentHp} / {maxHp}</p></div>
            <div><p className="text-text-muted text-xs">Catch rate</p><p className="font-medium text-text-primary">{catchRate}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* All ball comparison */}
      <Card>
        <CardHeader><CardTitle>All Ball Comparison</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {allBallResults.map((ball) => (
            <div key={ball.id} className="flex items-center gap-3">
              <div className="w-36 shrink-0 flex items-center gap-1.5">
                <BallIcon id={ball.id} size={20} />
                <div className="min-w-0">
                  <p className="text-xs text-text-secondary truncate">{ball.name}</p>
                  <p className="text-[10px] text-text-muted">{ball.note ? `${ball.note} · ×${ball.ballBonus.toFixed(ball.ballBonus % 1 === 0 ? 0 : 1)}` : `×${ball.ballBonus.toFixed(ball.ballBonus % 1 === 0 ? 0 : 1)}`}</p>
                </div>
              </div>
              <div className="flex-1"><ProgressBar value={ball.probability * 100} max={100} color={getProbColor(ball.probability)} /></div>
              <span className="text-xs font-medium w-14 text-right" style={{ color: getProbColor(ball.probability) }}>{ball.percentDisplay}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function LearnsetSearch() {
  const { activeRun } = useAppStore()
  const location = useLocation()
  const prefill = (location.state as { pokemon?: string } | null)?.pokemon ?? ''
  const [searchQuery, setSearchQuery] = useSessionState('learnset_query', prefill)
  const [selectedPokemon, setSelectedPokemon] = useSessionState('learnset_pokemon', prefill)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [activeTab, setActiveTab] = useSessionState('learnset_tab', 'level-up')
  const [selectedMoveName, setSelectedMoveName] = useState<string | null>(null)

  // If another page navigates here with a specific pokemon, override session
  useEffect(() => {
    if (prefill) {
      setSearchQuery(prefill)
      setSelectedPokemon(prefill)
    }
  }, [prefill])

  const generation = activeRun?.generation ?? 3
  const gameId = activeRun?.game ?? ''

  const { data: searchResults } = usePokemonSearch(searchQuery)
  const { data: pokemonData, isLoading: pokemonLoading } = usePokemonByName(selectedPokemon)

  // Derive moves directly from already-fetched pokemon data — no second HTTP request
  const movesByMethod = useMemo<Record<string, LearnsetMove[]>>(() => {
    if (!pokemonData) return {}
    const all = extractMovesForGeneration(pokemonData, gameId, generation)
    const grouped: Record<string, LearnsetMove[]> = {}
    for (const move of all) {
      if (!grouped[move.learnMethod]) grouped[move.learnMethod] = []
      grouped[move.learnMethod].push(move)
    }
    if (grouped['level-up']) grouped['level-up'].sort((a, b) => a.levelLearnedAt - b.levelLearnedAt)
    return grouped
  }, [pokemonData, gameId, generation])

  // Batch-fetch details for ALL moves in parallel (one useQueries call, not N individual hooks)
  const allMoveNames = useMemo(() => [...new Set(Object.values(movesByMethod).flat().map((m) => m.name))], [movesByMethod])
  const moveDetailsMap = useMoveDetailsBatch(allMoveNames)
  const movesLoading = allMoveNames.length > 0 && moveDetailsMap.size === 0

  // Abilities — filtered by generation:
  //   Gen 1–2: no abilities at all
  //   Gen 3–4: regular abilities only (hidden ability mechanic added in Gen 5)
  //   Gen 5+:  all abilities
  const abilityEntries = useMemo(() => {
    if (!pokemonData || generation <= 2) return []
    const all = pokemonData.abilities
    return generation <= 4 ? all.filter(a => !a.is_hidden) : all
  }, [pokemonData, generation])
  const abilityNames = useMemo(() => abilityEntries.map(a => a.ability.name), [abilityEntries])
  const abilityDataMap = useAbilityBatch(abilityNames)

  // For TM/HM tab: find each move's machine URL for the current version group, then batch-fetch
  const versionGroups = useMemo(() => getVersionGroups(gameId, generation), [gameId, generation])
  const machineUrls = useMemo(() => {
    return (movesByMethod['machine'] ?? []).map((move) => {
      const details = moveDetailsMap.get(move.name)
      return details?.machines?.find((m) => versionGroups.includes(m.version_group.name))?.machine.url ?? null
    }).filter(Boolean) as string[]
  }, [movesByMethod, moveDetailsMap, versionGroups])
  const machineDataMap = useMachineBatch(machineUrls)

  // Build moveName → "TM01" / "HM06" using machine item names
  const tmNumberMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const [, machine] of machineDataMap) {
      const raw = machine.item.name  // e.g. "tm01", "hm06"
      const match = raw.match(/^(tm|hm)(\d+)$/)
      if (match) {
        const label = `${match[1].toUpperCase()}${match[2].padStart(2, '0')}`
        map.set(machine.move.name, label)
      }
    }
    return map
  }, [machineDataMap])

  const { data: speciesData } = usePokemonSpecies(pokemonData?.id ?? 0)
  const { data: chainData } = useEvolutionChain(speciesData?.evolution_chain?.url ?? '')
  const evoLineRaw = chainData ? flattenChain(chainData.chain) : []

  // Fetch species data for each stage to check which generation it was introduced in
  const evoSpeciesMap = usePokemonSpeciesBatch(evoLineRaw.map(s => s.name))

  // Only show stages that exist in the current generation
  const evoLine = evoLineRaw.filter(stage => {
    const species = evoSpeciesMap.get(stage.name)
    if (!species) return true  // still loading — keep it in so it doesn't flicker out
    return (GEN_NAME_TO_NUM[species.generation.name] ?? 99) <= generation
  })

  const isMachineTab = activeTab === 'machine'

  // Sort TM/HM moves by number (TMs first, then HMs); other tabs keep their existing order
  const currentMoves = useMemo(() => {
    const moves = movesByMethod[activeTab] ?? []
    if (!isMachineTab || tmNumberMap.size === 0) return moves
    return [...moves].sort((a, b) => {
      const ta = tmNumberMap.get(a.name)
      const tb = tmNumberMap.get(b.name)
      if (!ta && !tb) return 0
      if (!ta) return 1
      if (!tb) return -1
      const aHm = ta.startsWith('HM')
      const bHm = tb.startsWith('HM')
      if (aHm !== bHm) return aHm ? 1 : -1
      return parseInt(ta.slice(2)) - parseInt(tb.slice(2))
    })
  }, [movesByMethod, activeTab, isMachineTab, tmNumberMap])

  return (
    <div className="flex flex-col">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <Input
              label="Search Pokémon"
              placeholder="Type a Pokémon name..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); setHighlightedIndex(-1) }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => { setShowDropdown(false); setHighlightedIndex(-1) }, 200)}
              onKeyDown={(e) => {
                const results = searchResults?.results ?? []
                if (!showDropdown || results.length === 0 || searchQuery.length < 2) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHighlightedIndex((i) => Math.min(i + 1, results.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHighlightedIndex((i) => Math.max(i - 1, -1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (highlightedIndex >= 0) {
                    const p = results[highlightedIndex]
                    setSelectedPokemon(p.name)
                    setSearchQuery(p.name)
                    setShowDropdown(false)
                    setHighlightedIndex(-1)
                  }
                } else if (e.key === 'Escape') {
                  setShowDropdown(false)
                  setHighlightedIndex(-1)
                }
              }}
            />
            {showDropdown && searchResults && searchResults.results.length > 0 && searchQuery.length >= 2 && (
              <div className="absolute z-50 w-full mt-1 bg-elevated border border-border rounded shadow-xl max-h-48 overflow-y-auto">
                {searchResults.results.map((p, i) => (
                  <button
                    key={p.name}
                    onMouseDown={() => {
                      setSelectedPokemon(p.name)
                      setSearchQuery(p.name)
                      setShowDropdown(false)
                      setHighlightedIndex(-1)
                    }}
                    className={`w-full text-left px-3 py-2 text-sm text-text-primary capitalize ${i === highlightedIndex ? 'bg-card' : 'hover:bg-card'}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {evoLine.length > 1 && (
          <div className="flex items-center gap-0.5 flex-wrap">
            {evoLine.map((stage, i) => (
              <div key={stage.name} className="flex items-center gap-0.5">
                {i > 0 && (
                  <div className="flex flex-col items-center mx-0.5">
                    <ChevronRight className="w-3 h-3 text-text-muted" />
                    {stage.level !== null && (
                      <span className="text-[9px] text-text-muted leading-none">Lv.{stage.level}</span>
                    )}
                  </div>
                )}
                <EvolutionStage
                  name={stage.name}
                  isSelected={selectedPokemon === stage.name}
                  onClick={() => { setSelectedPokemon(stage.name); setSearchQuery(stage.name) }}
                />
              </div>
            ))}
          </div>
        )}

        {pokemonData && (
          <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
            <PokemonSprite pokemonId={pokemonData.id} pokemonName={pokemonData.name} size={56} />
            <div>
              <p className="font-semibold text-text-primary capitalize">{pokemonData.name}</p>
              <p className="text-xs text-text-muted">#{pokemonData.id}</p>
              <div className="flex gap-1 mt-1">
                {getPokemonTypes(pokemonData, generation).map((t) => (
                  <TypeBadge key={t} type={t} size="sm" />
                ))}
              </div>
            </div>
            <div className="ml-auto grid grid-cols-4 gap-3 text-center">
              {pokemonData.stats.slice(0, 6).map((s) => (
                <div key={s.stat.name}>
                  <p className="text-sm font-bold text-text-primary">{s.base_stat}</p>
                  <p className="text-[10px] text-text-muted uppercase">{s.stat.name.replace('special-', 'sp.').replace('-', ' ')}</p>
                </div>
              ))}
              <div className="border-l border-border pl-3">
                <p className="text-sm font-bold text-accent-teal">
                  {pokemonData.stats.slice(0, 6).reduce((sum, s) => sum + s.base_stat, 0)}
                </p>
                <p className="text-[10px] text-text-muted uppercase">BST</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {!selectedPokemon ? (
        <div className="flex items-center justify-center py-16 text-text-muted">
          <div className="text-center">
            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>Search for a Pokémon to see its learnset</p>
          </div>
        </div>
      ) : pokemonLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : (
        <div>
          <Tabs
            tabs={LEARN_METHOD_TABS.map(t => {
              if (t.id === 'matchups' || t.id === 'catch-calc') return t
              if (t.id === 'abilities') return { ...t, label: `${t.label} (${abilityEntries.length})` }
              return { ...t, label: `${t.label} (${movesByMethod[t.id]?.length ?? 0})` }
            })}
            value={activeTab}
            onValueChange={setActiveTab}
          >
            <TabContent value={activeTab}>
              {activeTab === 'matchups' ? (
                pokemonData ? (
                  <TypeMatchupMatrix
                    types={getPokemonTypes(pokemonData, generation)}
                    generation={generation}
                  />
                ) : null
              ) : activeTab === 'abilities' ? (
                generation <= 2 ? (
                  <div className="text-center py-8 text-text-muted text-sm">
                    Abilities were not present in Generation {generation}.
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    {abilityEntries.map(entry => (
                      <AbilityCard
                        key={entry.ability.name}
                        name={entry.ability.name}
                        isHidden={entry.is_hidden}
                        data={abilityDataMap.get(entry.ability.name)}
                        versionGroups={versionGroups}
                        generation={generation}
                      />
                    ))}
                  </div>
                )
              ) : activeTab === 'catch-calc' ? (
                <CatchCalcTab pokemonData={pokemonData} speciesData={speciesData} generation={generation} gameId={gameId} />
              ) : movesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Spinner size="lg" />
                </div>
              ) : currentMoves.length === 0 ? (
                <div className="text-center py-8 text-text-muted">
                  No moves via this method in {activeRun?.game ?? `Gen ${generation}`}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-secondary border-b border-border">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs text-text-muted font-medium w-16">
                        {isMachineTab ? 'TM/HM' : 'Lv'}
                      </th>
                      <th className="px-3 py-2 text-left text-xs text-text-muted font-medium">Move</th>
                      <th className="px-3 py-2 text-left text-xs text-text-muted font-medium">Type</th>
                      <th className="px-3 py-2 text-left text-xs text-text-muted font-medium">Cat.</th>
                      <th className="px-3 py-2 text-center text-xs text-text-muted font-medium">Pwr</th>
                      <th className="px-3 py-2 text-center text-xs text-text-muted font-medium">Acc</th>
                      <th className="px-3 py-2 text-center text-xs text-text-muted font-medium">PP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMoves.map((move) => (
                      <MoveRow
                        key={move.name}
                        move={move}
                        moveData={moveDetailsMap.get(move.name)}
                        tmNumber={tmNumberMap.get(move.name)}
                        showTmColumn={isMachineTab}
                        onClick={() => setSelectedMoveName(move.name)}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </TabContent>
          </Tabs>
        </div>
      )}

      {selectedMoveName && (
        <MoveDetailModal
          moveName={selectedMoveName}
          moveData={moveDetailsMap.get(selectedMoveName)}
          open={!!selectedMoveName}
          onClose={() => setSelectedMoveName(null)}
          generation={generation}
        />
      )}
    </div>
  )
}
