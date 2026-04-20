import { usePokemonByNameBatch } from '../../api/pokeapi'
import { PokemonSprite } from './PokemonSprite'
import type { TrainerPokemon } from '../../data/games'

interface TrainerTeamPreviewProps {
  team: TrainerPokemon[]
  modifier: number
  onViewDetails: () => void
}

export function TrainerTeamPreview({ team, modifier, onViewDetails }: TrainerTeamPreviewProps) {
  // Show core Pokémon + first starter variant (mirrors the modal default)
  const coreTeam = team.filter((m) => !m.starter)
  const firstVariantKey = team.find((m) => m.starter)?.starter
  const firstVariant = firstVariantKey ? team.filter((m) => m.starter === firstVariantKey) : []
  const displayTeam = coreTeam.length > 0 || firstVariant.length > 0
    ? [...coreTeam, ...firstVariant]
    : team

  const uniqueSpecies = [...new Set(displayTeam.map((m) => m.species.toLowerCase()))]
  const pokemonMap = usePokemonByNameBatch(uniqueSpecies)

  if (team.length === 0) return null

  return (
    <div className="flex items-center gap-2 my-2">
      <div className="flex gap-1.5 flex-wrap">
        {displayTeam.map((member, i) => {
          const data = pokemonMap.get(member.species.toLowerCase())
          const adjustedLevel = Math.round(member.level * modifier / 100)
          return (
            <div key={i} className="flex flex-col items-center gap-0.5">
              {data ? (
                <PokemonSprite pokemonId={data.id} pokemonName={member.species} size={40} />
              ) : (
                <div className="w-10 h-10 rounded bg-elevated animate-pulse" />
              )}
              <span className="text-[9px] text-text-muted leading-none">Lv.{adjustedLevel}</span>
            </div>
          )
        })}
      </div>
      <button
        onClick={onViewDetails}
        className="ml-auto text-[10px] text-accent-teal hover:underline shrink-0"
      >
        View Team →
      </button>
    </div>
  )
}
