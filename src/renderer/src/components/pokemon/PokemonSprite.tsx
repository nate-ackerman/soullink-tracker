import { useState } from 'react'
import { getSpriteUrl, getShinyUrl } from '../../api/pokeapi'
import { cn } from '../../utils/cn'

interface PokemonSpriteProps {
  pokemonId: number | null
  pokemonName?: string | null
  size?: number
  shiny?: boolean
  grayscale?: boolean
  className?: string
}

export function PokemonSprite({
  pokemonId,
  pokemonName,
  size = 64,
  shiny = false,
  grayscale = false,
  className
}: PokemonSpriteProps) {
  const [error, setError] = useState(false)

  if (!pokemonId || error) {
    return (
      <div
        className={cn('flex items-center justify-center bg-elevated rounded', className)}
        style={{ width: size, height: size }}
      >
        <span className="text-text-muted text-xs text-center px-1">
          {pokemonName ? pokemonName.slice(0, 3).toUpperCase() : '?'}
        </span>
      </div>
    )
  }

  const src = shiny ? getShinyUrl(pokemonId) : getSpriteUrl(pokemonId)

  return (
    <img
      src={src}
      alt={pokemonName ?? `Pokemon ${pokemonId}`}
      width={size}
      height={size}
      className={cn(
        'object-contain',
        grayscale && 'grayscale opacity-60',
        className
      )}
      style={{ imageRendering: 'pixelated' }}
      onError={() => setError(true)}
    />
  )
}
