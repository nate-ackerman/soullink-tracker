import { useState, useEffect } from 'react'
import { getSpriteUrl, getShinyUrl } from '../../api/pokeapi'
import { cn } from '../../utils/cn'

// ── Module-level sprite state ─────────────────────────────────────────────────
// Shared across every PokemonSprite instance and across component remounts.
// This means a sprite that loaded anywhere renders instantly everywhere else,
// and failed sprites are retried with backoff rather than permanently skipped.

const _loaded   = new Set<string>()             // URLs confirmed loaded
const _errors   = new Map<string, number>()     // URL → failed attempt count
const _versions = new Map<string, number>()     // URL → retry counter (forces new img key)
const _subs     = new Set<() => void>()         // rerender callbacks for all mounted instances

const MAX_RETRIES = 8
// Backoff: 2s → 4s → 8s → 16s → 30s (capped)
const retryDelay = (attempt: number) => Math.min(2000 * Math.pow(2, attempt - 1), 30000)

function scheduleRetry(src: string): void {
  const attempt = _errors.get(src) ?? 1
  if (attempt > MAX_RETRIES) return
  setTimeout(() => {
    _versions.set(src, (_versions.get(src) ?? 0) + 1)
    _subs.forEach(fn => fn())
  }, retryDelay(attempt))
}

// ─────────────────────────────────────────────────────────────────────────────

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
  className,
}: PokemonSpriteProps) {
  const [, rerender] = useState(0)

  // Register this instance so it re-renders when a retry fires anywhere
  useEffect(() => {
    const fn = () => rerender(n => n + 1)
    _subs.add(fn)
    return () => { _subs.delete(fn) }
  }, [])

  const box = { width: size, height: size }

  if (!pokemonId) {
    return (
      <div className={cn('flex items-center justify-center bg-elevated rounded', className)} style={box}>
        <span className="text-text-muted text-xs text-center px-1">?</span>
      </div>
    )
  }

  const src = shiny ? getShinyUrl(pokemonId) : getSpriteUrl(pokemonId)
  const loaded  = _loaded.has(src)
  const gaveUp  = (_errors.get(src) ?? 0) > MAX_RETRIES

  // After MAX_RETRIES failures show the name abbreviation as a last resort
  if (gaveUp) {
    return (
      <div className={cn('flex items-center justify-center bg-elevated rounded', className)} style={box}>
        <span className="text-text-muted text-xs text-center px-1">
          {pokemonName ? pokemonName.slice(0, 3).toUpperCase() : '?'}
        </span>
      </div>
    )
  }

  const version = _versions.get(src) ?? 0

  return (
    <div className={cn('relative', className)} style={box}>
      {!loaded && <div className="absolute inset-0 bg-elevated rounded animate-pulse" />}
      <img
        key={`${src}:${version}`}
        src={src}
        alt={pokemonName ?? `Pokemon ${pokemonId}`}
        width={size}
        height={size}
        className={cn('object-contain', grayscale && 'grayscale')}
        style={{
          imageRendering: 'pixelated',
          opacity: loaded ? (grayscale ? 0.6 : 1) : 0,
        }}
        onLoad={() => {
          _loaded.add(src)
          _errors.delete(src)
          rerender(n => n + 1)
        }}
        onError={() => {
          _errors.set(src, (_errors.get(src) ?? 0) + 1)
          scheduleRetry(src)
          rerender(n => n + 1)
        }}
      />
    </div>
  )
}
