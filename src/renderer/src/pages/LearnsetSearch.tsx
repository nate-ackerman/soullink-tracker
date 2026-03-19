import { useState } from 'react'
import { BookOpen, Search } from 'lucide-react'
import { Input } from '../components/ui/Input'
import { TypeBadge } from '../components/pokemon/TypeBadge'
import { PokemonSprite } from '../components/pokemon/PokemonSprite'
import { Spinner } from '../components/ui/Spinner'
import { Tabs, TabContent } from '../components/ui/Tabs'
import { useAppStore } from '../store/appStore'
import { usePokemonByName, usePokemonMoves, useMoveDetails, usePokemonSearch } from '../api/pokeapi'
import type { LearnsetMove } from '../api/pokeapi'

const LEARN_METHOD_TABS = [
  { id: 'level-up', label: 'Level Up' },
  { id: 'machine', label: 'TM/HM' },
  { id: 'egg', label: 'Egg' },
  { id: 'tutor', label: 'Tutor' }
]

function MoveRow({ move }: { move: LearnsetMove }) {
  const { data: moveData, isLoading } = useMoveDetails(move.name)

  return (
    <tr className="border-b border-border hover:bg-elevated/50 transition-colors">
      <td className="px-3 py-2 text-xs text-text-muted w-12">
        {move.learnMethod === 'level-up' && move.levelLearnedAt > 0 ? move.levelLearnedAt : '—'}
      </td>
      <td className="px-3 py-2 text-sm text-text-primary capitalize">
        {move.name.replace(/-/g, ' ')}
      </td>
      <td className="px-3 py-2">
        {isLoading ? (
          <div className="w-14 h-4 bg-elevated rounded animate-pulse" />
        ) : moveData ? (
          <TypeBadge type={moveData.type.name} size="sm" />
        ) : null}
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
        {isLoading ? '...' : moveData?.power ?? '—'}
      </td>
      <td className="px-3 py-2 text-xs text-text-secondary text-center">
        {isLoading ? '...' : moveData?.accuracy ? `${moveData.accuracy}%` : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-text-secondary text-center">
        {isLoading ? '...' : moveData?.pp ?? '—'}
      </td>
    </tr>
  )
}

export function LearnsetSearch() {
  const { activeRun } = useAppStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPokemon, setSelectedPokemon] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeTab, setActiveTab] = useState('level-up')

  const generation = activeRun?.generation ?? 3

  const { data: searchResults } = usePokemonSearch(searchQuery)
  const { data: pokemonData, isLoading: pokemonLoading } = usePokemonByName(selectedPokemon)
  const { data: movesData, isLoading: movesLoading } = usePokemonMoves(pokemonData?.id ?? 0, generation)

  const movesByMethod = movesData?.reduce((acc, move) => {
    const method = move.learnMethod
    if (!acc[method]) acc[method] = []
    acc[method].push(move)
    return acc
  }, {} as Record<string, LearnsetMove[]>) ?? {}

  // Sort level-up moves by level
  if (movesByMethod['level-up']) {
    movesByMethod['level-up'].sort((a, b) => a.levelLearnedAt - b.levelLearnedAt)
  }

  const currentMoves = (LEARN_METHOD_TABS.find(t => t.id === activeTab)?.id === activeTab
    ? movesByMethod[activeTab] ?? []
    : [])

  return (
    <div className="flex flex-col">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <Input
              label="Search Pokémon"
              placeholder="Type a Pokémon name..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            />
            {showDropdown && searchResults && searchResults.results.length > 0 && searchQuery.length >= 2 && (
              <div className="absolute z-50 w-full mt-1 bg-elevated border border-border rounded shadow-xl max-h-48 overflow-y-auto">
                {searchResults.results.map((p) => (
                  <button
                    key={p.name}
                    onMouseDown={() => {
                      setSelectedPokemon(p.name)
                      setSearchQuery(p.name)
                      setShowDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-card capitalize"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {activeRun && (
            <div className="text-xs text-text-muted pb-2">
              Gen {generation} learnset
            </div>
          )}
        </div>

        {pokemonData && (
          <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
            <PokemonSprite pokemonId={pokemonData.id} pokemonName={pokemonData.name} size={56} />
            <div>
              <p className="font-semibold text-text-primary capitalize">{pokemonData.name}</p>
              <p className="text-xs text-text-muted">#{pokemonData.id}</p>
              <div className="flex gap-1 mt-1">
                {pokemonData.types.map((t) => (
                  <TypeBadge key={t.type.name} type={t.type.name} size="sm" />
                ))}
              </div>
            </div>
            <div className="ml-auto grid grid-cols-3 gap-4 text-center">
              {pokemonData.stats.slice(0, 6).map((s) => (
                <div key={s.stat.name}>
                  <p className="text-sm font-bold text-text-primary">{s.base_stat}</p>
                  <p className="text-[10px] text-text-muted uppercase">{s.stat.name.replace('special-', 'sp.').replace('-', ' ')}</p>
                </div>
              ))}
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
                  No moves via this method in Gen {generation}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-secondary border-b border-border">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs text-text-muted font-medium w-12">Lv</th>
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
                      <MoveRow key={move.name} move={move} />
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
