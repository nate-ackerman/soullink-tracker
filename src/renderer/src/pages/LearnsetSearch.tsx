import { useLocation } from 'react-router-dom'
import { BookOpen, ChevronRight } from 'lucide-react'
import { Input } from '../components/ui/Input'
import { TypeBadge } from '../components/pokemon/TypeBadge'
import { PokemonSprite } from '../components/pokemon/PokemonSprite'
import { Spinner } from '../components/ui/Spinner'
import { Tabs, TabContent } from '../components/ui/Tabs'
import { useAppStore } from '../store/appStore'
import { useState, useMemo } from 'react'
import { usePokemonByName, useMoveDetailsBatch, useMachineBatch, usePokemonSearch, usePokemonSpecies, useEvolutionChain, getPokemonTypes, extractMovesForGeneration, getVersionGroups } from '../api/pokeapi'
import type { LearnsetMove, MoveData, ChainLink } from '../api/pokeapi'

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
  const { data } = usePokemonByName(name)
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-colors ${
        isSelected ? 'bg-accent-teal/20 ring-1 ring-accent-teal' : 'hover:bg-elevated'
      }`}
    >
      <PokemonSprite pokemonId={data?.id ?? null} pokemonName={name} size={36} />
      <span className="text-[10px] capitalize text-text-secondary whitespace-nowrap">{name.replace(/-/g, ' ')}</span>
    </button>
  )
}

const LEARN_METHOD_TABS = [
  { id: 'level-up', label: 'Level Up' },
  { id: 'machine', label: 'TM/HM' },
  { id: 'egg', label: 'Egg' },
  { id: 'tutor', label: 'Tutor' }
]

function MoveRow({ move, moveData, tmNumber, showTmColumn }: { move: LearnsetMove; moveData: MoveData | undefined; tmNumber?: string; showTmColumn?: boolean }) {
  return (
    <tr className="border-b border-border hover:bg-elevated/50 transition-colors">
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

export function LearnsetSearch() {
  const { activeRun } = useAppStore()
  const location = useLocation()
  const prefill = (location.state as { pokemon?: string } | null)?.pokemon ?? ''
  const [searchQuery, setSearchQuery] = useState(prefill)
  const [selectedPokemon, setSelectedPokemon] = useState(prefill)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [activeTab, setActiveTab] = useState('level-up')

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
  const evoLine = chainData ? flattenChain(chainData.chain) : []

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
          {activeRun && (
            <div className="text-xs text-text-muted pb-2">
              {activeRun.game ? `${activeRun.game} learnset` : `Gen ${generation} learnset`}
            </div>
          )}
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
      ) : movesLoading || pokemonLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : (
        <div>
          <Tabs
            tabs={LEARN_METHOD_TABS.map(t => ({
              ...t,
              label: `${t.label} (${movesByMethod[t.id]?.length ?? 0})`
            }))}
            value={activeTab}
            onValueChange={setActiveTab}
          >
            <TabContent value={activeTab}>
              {currentMoves.length === 0 ? (
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
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </TabContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}
