import { cn } from '../../utils/cn'
import { EvolvedCatchSprite } from './EvolvedCatchSprite'
import { StatusBadge } from './StatusBadge'
import { TypeBadge } from './TypeBadge'
import { usePokemonById } from '../../api/pokeapi'
import { useAppStore } from '../../store/appStore'
import type { Catch } from '../../types'

interface PokemonCardProps {
  catch_: Catch
  playerColor?: string
  compact?: boolean
  onClick?: () => void
  className?: string
}

function PokemonTypeDisplay({ pokemonId }: { pokemonId: number }) {
  const { data } = usePokemonById(pokemonId)
  if (!data) return null
  return (
    <div className="flex gap-1 flex-wrap">
      {data.types.map((t) => (
        <TypeBadge key={t.type.name} type={t.type.name} size="sm" />
      ))}
    </div>
  )
}

export function PokemonCard({ catch_, playerColor, compact, onClick, className }: PokemonCardProps) {
  const { levelCap } = useAppStore()
  const isDead = catch_.status === 'dead'
  const isBoxed = catch_.status === 'boxed'

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-lg border border-border bg-card p-3 flex items-center gap-3',
        onClick && 'cursor-pointer hover:bg-elevated transition-colors',
        isDead && 'opacity-60',
        compact && 'p-2',
        className
      )}
      style={playerColor ? { borderLeftColor: playerColor, borderLeftWidth: 3 } : undefined}
    >
      <EvolvedCatchSprite
        pokemonId={catch_.pokemon_id}
        pokemonName={catch_.pokemon_name}
        levelCap={levelCap}
        size={compact ? 40 : 52}
        grayscale={isDead || isBoxed}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">
            {catch_.nickname ?? catch_.pokemon_name ?? 'Unknown'}
          </span>
          <StatusBadge status={catch_.status} />
        </div>
        {catch_.nickname && catch_.pokemon_name && (
          <p className="text-xs text-text-muted capitalize">{catch_.pokemon_name}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-text-secondary">Lv. {levelCap ?? 5}</span>
          {catch_.nature && <span className="text-xs text-text-muted">{catch_.nature}</span>}
        </div>
        {catch_.pokemon_id && !compact && <PokemonTypeDisplay pokemonId={catch_.pokemon_id} />}
      </div>
    </div>
  )
}
