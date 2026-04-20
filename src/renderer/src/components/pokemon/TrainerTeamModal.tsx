import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { PokemonSprite } from './PokemonSprite'
import { TypeBadge } from './TypeBadge'
import { TrainerImage } from './TrainerImage'
import { usePokemonByNameBatch, getPokemonTypes, extractMovesForGeneration } from '../../api/pokeapi'
import { getTypeMatchups } from '../../data/typeColors'
import type { GymLeader, TrainerPokemon } from '../../data/games'
import type { PokemonData } from '../../api/pokeapi'

// ── Move derivation ────────────────────────────────────────────────────────────

function deriveMoveset(
  pokemonData: PokemonData,
  level: number,
  gameId: string,
  generation: number
): string[] {
  const moves = extractMovesForGeneration(pokemonData, gameId, generation)
  const eligible = moves
    .filter((m) => m.learnMethod === 'level-up' && m.levelLearnedAt > 0 && m.levelLearnedAt <= level)
    .sort((a, b) => b.levelLearnedAt - a.levelLearnedAt)
  const seen = new Set<string>()
  const result: string[] = []
  for (const m of eligible) {
    if (!seen.has(m.name)) {
      seen.add(m.name)
      result.push(m.name)
    }
    if (result.length === 4) break
  }
  return result
}

function formatName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Type coverage helpers ──────────────────────────────────────────────────────

function computeRecommendedTypes(allMemberTypes: string[][], generation: number): string[] {
  if (allMemberTypes.length === 0) return []
  const threshold = Math.ceil(allMemberTypes.length / 2)
  const candidateTypes = new Set<string>()

  for (const memberTypes of allMemberTypes) {
    const matchups = getTypeMatchups(memberTypes, generation)
    for (const [attackType, mult] of Object.entries(matchups)) {
      if (mult >= 2) candidateTypes.add(attackType)
    }
  }

  return [...candidateTypes].filter((attackType) => {
    const hitCount = allMemberTypes.filter((memberTypes) => {
      const matchups = getTypeMatchups(memberTypes, generation)
      return (matchups[attackType] ?? 1) >= 2
    }).length
    return hitCount >= threshold
  })
}

// ── Per-Pokémon card ───────────────────────────────────────────────────────────

function PokemonCard({
  member,
  pokemonData,
  adjustedLevel,
  modifier,
  gameId,
  generation,
}: {
  member: TrainerPokemon
  pokemonData: PokemonData | undefined
  adjustedLevel: number
  modifier: number
  gameId: string
  generation: number
}) {
  const types = pokemonData ? getPokemonTypes(pokemonData, generation) : []

  const movesToShow: { name: string; estimated: boolean }[] = (() => {
    if (!pokemonData) return []
    if (member.moves && member.moves.length > 0) {
      return member.moves.map((m) => ({ name: m, estimated: false }))
    }
    const derived = deriveMoveset(pokemonData, member.level, gameId, generation)
    return derived.map((m) => ({ name: m, estimated: true }))
  })()

  return (
    <div className="bg-elevated rounded-lg p-3 flex flex-col gap-2">
      {/* Header: sprite + name/level/types */}
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          {pokemonData ? (
            <PokemonSprite pokemonId={pokemonData.id} pokemonName={member.species} size={56} />
          ) : (
            <div className="w-14 h-14 rounded bg-card animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary leading-tight">
            {formatName(member.species)}
          </p>
          <p className="text-xs text-accent-gold font-medium">
            Lv. {adjustedLevel}
            {modifier !== 100 && (
              <span className="text-text-muted font-normal ml-1">(base: {member.level})</span>
            )}
          </p>
          {types.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {types.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
            </div>
          )}
          {!pokemonData && (
            <div className="h-4 bg-card rounded animate-pulse mt-1 w-24" />
          )}
        </div>
      </div>

      {/* Moves */}
      <div className="border-t border-border/40 pt-2">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Moves</p>
        {!pokemonData ? (
          <div className="space-y-1">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-3 bg-card rounded animate-pulse w-3/4" />)}
          </div>
        ) : movesToShow.length === 0 ? (
          <p className="text-xs text-text-muted">—</p>
        ) : (
          <ul className="space-y-0.5">
            {movesToShow.map((mv, i) => (
              <li key={i} className="text-xs text-text-primary">
                {formatName(mv.name)}
                {mv.estimated && <span className="text-text-muted ml-1">(est.)</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ability — Gen 3+ only */}
      {generation >= 3 && (
        <div className="border-t border-border/40 pt-2">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Ability</p>
          {!pokemonData ? (
            <div className="h-3 bg-card rounded animate-pulse w-1/2" />
          ) : member.ability ? (
            <p className="text-xs text-text-primary">{formatName(member.ability)}</p>
          ) : pokemonData.abilities.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {pokemonData.abilities
                .filter((a) => !a.is_hidden)
                .map((a) => (
                  <span key={a.ability.name} className="text-[10px] bg-card border border-border rounded px-1.5 py-0.5 text-text-secondary">
                    {formatName(a.ability.name)}
                  </span>
                ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">—</p>
          )}
        </div>
      )}

      {/* Held item — only if defined */}
      {member.heldItem && (
        <div className="border-t border-border/40 pt-2">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Item</p>
          <p className="text-xs text-text-primary">{member.heldItem}</p>
        </div>
      )}
    </div>
  )
}

// ── Main modal ─────────────────────────────────────────────────────────────────

interface TrainerTeamModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leader: GymLeader
  modifier: number
  gameId: string
  generation: number
}

export function TrainerTeamModal({ open, onOpenChange, leader, modifier, gameId, generation }: TrainerTeamModalProps) {
  const team = leader.team ?? []

  // ── Starter variant partitioning ──────────────────────────────────────────
  const coreTeam = team.filter((m) => !m.starter)
  const variantMap = new Map<string, TrainerPokemon[]>()
  for (const m of team) {
    if (m.starter) {
      if (!variantMap.has(m.starter)) variantMap.set(m.starter, [])
      variantMap.get(m.starter)!.push(m)
    }
  }
  const starterKeys = [...variantMap.keys()]
  const hasVariants = starterKeys.length > 0

  const [selectedStarter, setSelectedStarter] = useState<string | null>(
    hasVariants ? starterKeys[0] : null
  )
  // Reset selected starter if it's no longer valid (e.g. modal reopened for different leader)
  const activeStarter = selectedStarter && variantMap.has(selectedStarter)
    ? selectedStarter
    : (starterKeys[0] ?? null)

  const displayTeam = hasVariants
    ? [...coreTeam, ...(variantMap.get(activeStarter!) ?? [])]
    : team

  const uniqueSpecies = [...new Set(team.map((m) => m.species.toLowerCase()))]
  const pokemonMap = usePokemonByNameBatch(uniqueSpecies)

  const allMemberTypes = displayTeam.map((member) => {
    const data = pokemonMap.get(member.species.toLowerCase())
    return data ? getPokemonTypes(data, generation) : []
  })

  const opponentTypes = [...new Set(allMemberTypes.flat())]
  const recommendedTypes = computeRecommendedTypes(allMemberTypes, generation)

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`${leader.name}'s Team`} size="xl">
      <div className="overflow-y-auto flex-1 min-h-0 space-y-4">

        {/* Trainer header */}
        {leader.imageUrl && (
          <div className="flex items-center gap-3 pb-2 border-b border-border/40">
            <TrainerImage imageUrl={leader.imageUrl} name={leader.name} size={64} />
            <div>
              <p className="text-base font-bold text-text-primary">{leader.name}</p>
              {leader.types.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {leader.types.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Starter variant tabs */}
        {hasVariants && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mr-1">
              If you chose
            </span>
            {starterKeys.map((key) => (
              <button
                key={key}
                onClick={() => setSelectedStarter(key)}
                className={`rounded transition-all ${
                  activeStarter === key
                    ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-transparent'
                    : 'opacity-50 hover:opacity-80'
                }`}
              >
                <TypeBadge type={key} size="sm" />
              </button>
            ))}
          </div>
        )}

        {/* Type coverage summary */}
        {(opponentTypes.length > 0 || recommendedTypes.length > 0) && (
          <div className="bg-elevated rounded-lg p-3 space-y-3">
            {opponentTypes.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                  Opponent Types
                </p>
                <div className="flex flex-wrap gap-1">
                  {opponentTypes.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
                </div>
              </div>
            )}
            {recommendedTypes.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                  Recommended to Bring
                </p>
                <div className="flex flex-wrap gap-1">
                  {recommendedTypes.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Team grid */}
        <div className="grid grid-cols-2 gap-3">
          {displayTeam.map((member, i) => {
            const pokemonData = pokemonMap.get(member.species.toLowerCase())
            const adjustedLevel = Math.round(member.level * modifier / 100)
            return (
              <PokemonCard
                key={i}
                member={member}
                pokemonData={pokemonData}
                adjustedLevel={adjustedLevel}
                modifier={modifier}
                gameId={gameId}
                generation={generation}
              />
            )
          })}
        </div>

      </div>
    </Modal>
  )
}
