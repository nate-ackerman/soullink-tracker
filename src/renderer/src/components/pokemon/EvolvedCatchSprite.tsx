import { useMemo } from 'react'
import { PokemonSprite } from './PokemonSprite'
import { usePokemonSpecies, useEvolutionChain, usePokemonByName } from '../../api/pokeapi'
import { resolveEvolutionAtLevel } from '../../utils/evolutionUtils'

interface EvolvedCatchSpriteProps {
  pokemonId: number | null
  pokemonName?: string | null
  levelCap: number | null
  size?: number
  shiny?: boolean
  grayscale?: boolean
  className?: string
}

/**
 * Drop-in replacement for PokemonSprite that resolves and renders the evolved
 * form of a Pokémon at the current level cap.  Falls back to the base sprite
 * while data is loading or when no evolution applies.
 *
 * Safe to use inside .map() because it is a component, not a hook.
 */
export function EvolvedCatchSprite({
  pokemonId,
  pokemonName,
  levelCap,
  size,
  shiny,
  grayscale,
  className,
}: EvolvedCatchSpriteProps) {
  const { data: speciesData } = usePokemonSpecies(pokemonId ?? 0)
  const chainUrl = speciesData?.evolution_chain?.url ?? ''
  const { data: chainData } = useEvolutionChain(chainUrl)

  const evolvedName = useMemo(() => {
    if (!chainData || levelCap === null || !pokemonName) return ''
    const resolved = resolveEvolutionAtLevel(chainData.chain, pokemonName, levelCap)
    return resolved !== pokemonName ? resolved : ''
  }, [chainData, levelCap, pokemonName])

  const { data: evolvedData } = usePokemonByName(evolvedName)

  const displayId = evolvedData?.id ?? pokemonId
  const displayName = evolvedData?.name ?? pokemonName

  return (
    <PokemonSprite
      pokemonId={displayId}
      pokemonName={displayName}
      size={size}
      shiny={shiny}
      grayscale={grayscale}
      className={className}
    />
  )
}
