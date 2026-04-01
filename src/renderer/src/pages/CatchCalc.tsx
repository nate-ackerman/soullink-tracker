import { useState, useMemo, useEffect } from 'react'
import { Calculator } from 'lucide-react'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { TypeBadge } from '../components/pokemon/TypeBadge'
import { PokemonSprite } from '../components/pokemon/PokemonSprite'
import { useAppStore } from '../store/appStore'
import { usePokemonByName, usePokemonSpecies, usePokemonSearch, getPokemonTypes } from '../api/pokeapi'
import {
  getAvailableBalls,
  getBallBonus,
  calculateCatchProbability,
  calculateAllBalls,
  STATUS_BONUSES,
  STATUS_OPTIONS,
} from '../utils/catchRate'

function getBallSpriteUrl(id: string): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${id.replace('ball', '-ball')}.png`
}

function BallIcon({ id, size = 24 }: { id: string; size?: number }) {
  return (
    <img
      src={getBallSpriteUrl(id)}
      alt=""
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

export function CatchCalc() {
  const { activeRun, levelCap } = useAppStore()
  const [pokemonQuery, setPokemonQuery] = useState('')
  const [selectedPokemon, setSelectedPokemon] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [wildLevel, setWildLevel] = useState(() => String(levelCap ?? 5))

  // Sync wild level when global level cap changes
  useEffect(() => {
    if (levelCap !== null) setWildLevel(String(levelCap))
  }, [levelCap])
  const [turns, setTurns] = useState('1')
  const [hpPercent, setHpPercent] = useState('100')
  const [status, setStatus] = useState('none')
  const [selectedBall, setSelectedBall] = useState('pokeball')

  const generation = activeRun?.generation ?? 3
  const gameId = activeRun?.game ?? ''

  const { data: searchResults } = usePokemonSearch(pokemonQuery)
  const { data: pokemonData } = usePokemonByName(selectedPokemon)
  const { data: speciesData } = usePokemonSpecies(pokemonData?.id ?? 0)

  const level = Math.max(1, Math.min(100, parseInt(wildLevel) || 5))
  const turnCount = Math.max(1, Math.min(99, parseInt(turns) || 1))
  const baseHp = pokemonData?.stats.find((s) => s.stat.name === 'hp')?.base_stat ?? 45
  const maxHp = pokemonData
    ? Math.floor((2 * baseHp * level) / 100) + level + 10
    : 100

  const hpPct = Math.max(1, Math.min(100, parseFloat(hpPercent) || 100))
  const currentHp = Math.max(1, Math.floor((maxHp * hpPct) / 100))
  const catchRate = speciesData?.capture_rate ?? 45
  const statusBonus = STATUS_BONUSES[status] ?? 1

  const availableBalls = useMemo(
    () => getAvailableBalls(gameId, generation),
    [gameId, generation]
  )

  // Ensure selectedBall is valid for this game; fall back to pokeball if not
  const activeBallId = availableBalls.some((b) => b.id === selectedBall)
    ? selectedBall
    : 'pokeball'
  const selectedBallData = availableBalls.find((b) => b.id === activeBallId) ?? availableBalls[0]
  const selectedBallBonus = getBallBonus(activeBallId, level, turnCount, generation)

  const mainResult = useMemo(
    () =>
      calculateCatchProbability({
        maxHp, currentHp, catchRate,
        ballBonus: selectedBallBonus,
        statusBonus,
        generation,
      }),
    [maxHp, currentHp, catchRate, selectedBallBonus, statusBonus, generation]
  )

  const allBallResults = useMemo(
    () =>
      calculateAllBalls(
        { maxHp, currentHp, catchRate, statusBonus, generation, level, turns: turnCount },
        availableBalls
      ).sort((a, b) => b.probability - a.probability),
    [maxHp, currentHp, catchRate, statusBonus, generation, level, turnCount, availableBalls]
  )

  const ballOptions = availableBalls.map((b) => ({
    value: b.id,
    label: b.note ? `${b.name} (${b.note})` : b.name,
  }))

  // Show which balls have turn-dependent bonuses (so user knows turn count matters)
  const hasTurnBalls = availableBalls.some((b) => b.id === 'timerball' || b.id === 'quickball')

  function getProbColor(prob: number): string {
    if (prob >= 0.75) return '#22c55e'
    if (prob >= 0.4)  return '#f59e0b'
    if (prob >= 0.15) return '#f97316'
    return '#ef4444'
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <Calculator className="w-5 h-5 text-text-secondary" />
        <h2 className="text-base font-semibold text-text-primary">Catch Calculator</h2>
        <span className="text-xs text-text-muted">Gen {generation} formula</span>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-4">
          {/* Pokémon search */}
          <div className="relative">
            <Input
              label="Pokémon Species"
              placeholder="Search..."
              value={pokemonQuery}
              onChange={(e) => { setPokemonQuery(e.target.value); setShowDropdown(true); setHighlightedIndex(-1) }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => { setShowDropdown(false); setHighlightedIndex(-1) }, 200)}
              onKeyDown={(e) => {
                const results = searchResults?.results ?? []
                if (!showDropdown || results.length === 0 || pokemonQuery.length < 2) return
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
                    setPokemonQuery(p.name)
                    setShowDropdown(false)
                    setHighlightedIndex(-1)
                  }
                } else if (e.key === 'Escape') {
                  setShowDropdown(false)
                  setHighlightedIndex(-1)
                }
              }}
            />
            {showDropdown && searchResults && searchResults.results.length > 0 && pokemonQuery.length >= 2 && (
              <div className="absolute z-50 w-full mt-1 bg-elevated border border-border rounded shadow-xl max-h-40 overflow-y-auto">
                {searchResults.results.map((p, i) => (
                  <button
                    key={p.name}
                    onMouseDown={() => {
                      setSelectedPokemon(p.name)
                      setPokemonQuery(p.name)
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

          {pokemonData && (
            <div className="flex items-center gap-3 p-2 bg-elevated rounded-lg">
              <PokemonSprite pokemonId={pokemonData.id} pokemonName={pokemonData.name} size={48} />
              <div>
                <p className="font-medium text-text-primary capitalize">{pokemonData.name}</p>
                <div className="flex gap-1">
                  {getPokemonTypes(pokemonData, generation).map((t) => <TypeBadge key={t} type={t} size="sm" />)}
                </div>
              </div>
              <div className="ml-auto text-right">
                <p className="text-sm font-bold text-text-primary">{catchRate}</p>
                <p className="text-xs text-text-muted">Base catch rate</p>
              </div>
            </div>
          )}

          {/* Level + Turns row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label="Wild Pokémon Level"
                type="number"
                min="1"
                max="100"
                value={wildLevel}
                onChange={(e) => setWildLevel(e.target.value)}
                placeholder="1–100"
              />
              <p className="text-[10px] text-text-muted mt-0.5">
                Max HP: <span className="font-medium text-text-secondary">{maxHp}</span>
                {pokemonData && ` (base ${baseHp})`}
              </p>
            </div>
            <div>
              <Input
                label="Turn number"
                type="number"
                min="1"
                max="99"
                value={turns}
                onChange={(e) => setTurns(e.target.value)}
                placeholder="1+"
              />
              {hasTurnBalls && (
                <p className="text-[10px] text-text-muted mt-0.5">
                  Affects {[
                    availableBalls.some(b => b.id === 'timerball') && 'Timer Ball',
                    availableBalls.some(b => b.id === 'quickball') && 'Quick Ball',
                  ].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>

          {/* HP slider + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label={`HP Percentage (${hpPct}%)`}
                type="range"
                min="1"
                max="100"
                value={hpPercent}
                onChange={(e) => setHpPercent(e.target.value)}
                className="h-2 accent-accent-red px-0 py-0 border-0 bg-transparent"
              />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>1%</span>
                <span className="flex flex-col items-center gap-0.5">
                  <span className="text-accent-red font-semibold text-sm leading-none">{hpPct}%</span>
                  <span className="text-[10px]">current</span>
                </span>
                <span>100%</span>
              </div>
            </div>
            <Select
              label="Status Condition"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            />
          </div>

          <Select
            label="Poké Ball"
            options={ballOptions}
            value={activeBallId}
            onChange={(e) => setSelectedBall(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Main result — only shown once a species is selected */}
      {pokemonData && (
        <Card className="border-border-light">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BallIcon id={activeBallId} size={32} />
                <div>
                  <span className="text-sm text-text-secondary">{selectedBallData.name}</span>
                  {selectedBallData.note && (
                    <span className="text-xs text-text-muted ml-1.5">({selectedBallData.note})</span>
                  )}
                  <p className="text-xs text-text-muted">
                    ×{selectedBallBonus.toFixed(selectedBallBonus % 1 === 0 ? 0 : 1)} ball bonus
                  </p>
                </div>
              </div>
              <span className="text-2xl font-bold" style={{ color: getProbColor(mainResult.probability) }}>
                {mainResult.percentDisplay}
              </span>
            </div>
            <ProgressBar
              value={mainResult.probability * 100}
              max={100}
              color={getProbColor(mainResult.probability)}
              showPercent={false}
            />
            <div className="flex gap-4 text-sm">
              <div>
                <p className="text-text-muted text-xs">Expected balls</p>
                <p className="font-medium text-text-primary">
                  {mainResult.probability >= 1 ? '1' : mainResult.expectedBalls.toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs">HP (approx)</p>
                <p className="font-medium text-text-primary">{currentHp} / {maxHp}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Catch rate</p>
                <p className="font-medium text-text-primary">{catchRate}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All ball comparison — only shown once a species is selected */}
      {pokemonData && (
        <Card>
          <CardHeader>
            <CardTitle>All Ball Comparison</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {allBallResults.map((ball) => (
              <div key={ball.id} className="flex items-center gap-3">
                <div className="w-36 shrink-0 flex items-center gap-1.5">
                  <BallIcon id={ball.id} size={20} />
                  <div className="min-w-0">
                    <p className="text-xs text-text-secondary truncate">{ball.name}</p>
                    <p className="text-[10px] text-text-muted">
                      {ball.note
                        ? `${ball.note} · ×${ball.ballBonus.toFixed(ball.ballBonus % 1 === 0 ? 0 : 1)}`
                        : `×${ball.ballBonus.toFixed(ball.ballBonus % 1 === 0 ? 0 : 1)}`
                      }
                    </p>
                  </div>
                </div>
                <div className="flex-1">
                  <ProgressBar
                    value={ball.probability * 100}
                    max={100}
                    color={getProbColor(ball.probability)}
                  />
                </div>
                <span
                  className="text-xs font-medium w-14 text-right"
                  style={{ color: getProbColor(ball.probability) }}
                >
                  {ball.percentDisplay}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
