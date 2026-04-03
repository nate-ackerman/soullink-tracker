import { useState } from 'react'
import { Link2, X, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { TypeBadge } from '../components/pokemon/TypeBadge'
import { PokemonSprite } from '../components/pokemon/PokemonSprite'
import { useAppStore } from '../store/appStore'
import { usePokemonById, getPokemonTypes } from '../api/pokeapi'
import { getTypeMatchups, getTypesForGeneration } from '../data/typeColors'
import type { Catch, SoulLink, Player } from '../types'

// ── Type data fetcher ─────────────────────────────────────────────────────────

function usePokemonTypes(pokemonId: number | null, generation: number): string[] {
  const { data } = usePokemonById(pokemonId ?? 0)
  if (!data || !pokemonId) return []
  return getPokemonTypes(data, generation)
}

function PokemonCardInBuilder({
  catch_,
  player,
  generation
}: {
  catch_: Catch
  player?: Player
  generation: number
}) {
  const types = usePokemonTypes(catch_.pokemon_id, generation)
  return (
    <div
      className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border bg-elevated"
      style={player ? { borderLeftColor: player.color, borderLeftWidth: 2 } : undefined}
    >
      <PokemonSprite pokemonId={catch_.pokemon_id} pokemonName={catch_.pokemon_name} size={40} />
      <p className="text-[11px] font-medium text-text-primary text-center capitalize truncate max-w-[64px]">
        {catch_.nickname ?? catch_.pokemon_name ?? '?'}
      </p>
      <p className="text-[10px] text-text-muted">Lv. {catch_.level}</p>
      <div className="flex flex-wrap gap-0.5 justify-center">
        {types.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
      </div>
      {player && (
        <span className="text-[10px]" style={{ color: player.color }}>{player.name}</span>
      )}
    </div>
  )
}

// ── Type coverage matrix ──────────────────────────────────────────────────────

function TypeCoverageMatrix({
  selectedLinks,
  catches,
  players,
  generation
}: {
  selectedLinks: SoulLink[]
  catches: Catch[]
  players: Player[]
  generation: number
}) {
  const allTypes = getTypesForGeneration(generation)

  // Build per-player planned teams from selected soul links
  const teamByPlayer = new Map<string, Catch[]>()
  for (const player of players) {
    teamByPlayer.set(player.id, [])
  }
  for (const link of selectedLinks) {
    for (const cid of link.catch_ids) {
      const c = catches.find((x) => x.id === cid)
      if (c) teamByPlayer.get(c.player_id)?.push(c)
    }
  }

  function getTypes(playerCatches: Catch[]): string[] {
    // We don't have live type data here — rely on pokemon_name as fallback label
    // Types are loaded per-pokemon in child components; for the matrix we approximate
    return playerCatches.map((c) => c.pokemon_name ?? '').filter(Boolean)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Type Coverage
          <span className="text-xs text-text-muted font-normal">{players.length === 1 ? '(based on selected Pokémon)' : '(based on selected soul links)'}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {selectedLinks.length === 0 ? (
          <p className="text-xs text-text-muted">{players.length === 1 ? 'Select Pokémon above to see type coverage' : 'Select soul links above to see type coverage'}</p>
        ) : (
          <TypeCoverageTable players={players} teamByPlayer={teamByPlayer} allTypes={allTypes} catches={catches} generation={generation} />
        )}
      </CardContent>
    </Card>
  )
}

function TypeCoverageTable({
  players,
  teamByPlayer,
  allTypes,
  catches,
  generation
}: {
  players: Player[]
  teamByPlayer: Map<string, Catch[]>
  allTypes: string[]
  catches: Catch[]
  generation: number
}) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full">
        <thead>
          <tr>
            <th className="text-left text-text-muted pb-2 w-28 font-normal">Type</th>
            {players.map((p) => (
              <th key={p.id} className="text-center pb-2 px-2 font-medium" style={{ color: p.color }}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allTypes.map((type) => (
            <tr key={type} className="border-t border-border/30">
              <td className="py-0.5">
                <TypeBadge type={type} size="sm" />
              </td>
              {players.map((p) => {
                const team = teamByPlayer.get(p.id) ?? []
                return (
                  <TeamTypeCell key={p.id} type={type} team={team} generation={generation} />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TeamTypeCell({ type, team, generation }: { type: string; team: Catch[]; generation: number }) {
  // Compute coverage/weakness by fetching types for each pokemon
  // We use a simplified display based on what's loaded
  const results = team.map((c) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data } = usePokemonById(c.pokemon_id ?? 0)
    return data ? getPokemonTypes(data, generation) : []
  })

  let isCovered = false
  let isWeak = false
  for (const types of results) {
    if (types.length === 0) continue
    const matchup = getTypeMatchups(types, generation)
    if ((matchup[type] ?? 1) >= 2) isWeak = true
    // Check if any of this pokemon's types hits the query type super effectively
    for (const ownType of types) {
      const atkMatchup = getTypeMatchups([ownType], generation)
      if ((atkMatchup[type] ?? 1) >= 2) isCovered = true
    }
  }

  return (
    <td className="text-center py-0.5">
      {isCovered && isWeak ? (
        <span className="text-yellow-400" title="Super effective + weak to">⚡</span>
      ) : isCovered ? (
        <span className="text-green-400" title="Can hit super effectively">✓</span>
      ) : isWeak ? (
        <span className="text-red-400" title="Weak to this type">✗</span>
      ) : (
        <span className="text-text-muted">·</span>
      )}
    </td>
  )
}

// ── Soul link row (selectable) ────────────────────────────────────────────────

function SoulLinkRow({
  link,
  catches,
  players,
  selected,
  onToggle
}: {
  link: SoulLink
  catches: Catch[]
  players: Player[]
  selected: boolean
  onToggle: () => void
}) {
  const linkedCatches = link.catch_ids
    .map((cid) => catches.find((c) => c.id === cid))
    .filter(Boolean) as Catch[]

  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
        selected
          ? 'border-accent-teal bg-accent-teal/10'
          : 'border-border bg-card hover:border-border-light'
      }`}
    >
      <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
        selected ? 'bg-accent-teal border-accent-teal' : 'border-border'
      }`}>
        {selected && <span className="text-[10px] text-white font-bold">✓</span>}
      </div>
      <Link2 className={`w-3.5 h-3.5 shrink-0 ${selected ? 'text-accent-teal' : 'text-text-muted'}`} />
      <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
        {linkedCatches.map((c, idx) => {
          const player = players.find((p) => p.id === c.player_id)
          return (
            <div key={c.id} className="flex items-center gap-1.5">
              {idx > 0 && <span className="text-text-muted text-xs">↔</span>}
              <PokemonSprite pokemonId={c.pokemon_id} pokemonName={c.pokemon_name} size={28} />
              <div>
                <p className="text-xs font-medium text-text-primary capitalize">
                  {c.nickname ?? c.pokemon_name ?? '?'}
                </p>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-text-muted">Lv. {c.level}</span>
                  {player && (
                    <span className="text-[10px]" style={{ color: player.color }}>{player.name}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────="────────────

export function PartyBuilder() {
  const { activeRun, players, catches, soulLinks } = useAppStore()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  if (!activeRun) return <div className="p-6 text-text-muted">No active run</div>

  const activeLinks = soulLinks.filter((sl) => sl.status === 'active')

  function toggle(linkId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(linkId)) {
        next.delete(linkId)
      } else if (next.size < 6) {
        next.add(linkId)
      }
      return next
    })
  }

  const selectedLinks = activeLinks.filter((sl) => selectedIds.has(sl.id))

  return (
    <div className="p-4 space-y-4">
      {/* Instructions */}
      <div className="flex items-start gap-2 bg-card border border-border rounded-lg p-3">
        <Info className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
        <p className="text-xs text-text-muted">
          {players.length === 1
            ? 'Select up to 6 caught Pokémon to plan your party.'
            : "Select up to 6 active soul links to plan your party. Only Pokémon you've caught that are part of an active soul link are shown. Type coverage is calculated across all players."}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Available soul links */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {players.length === 1 ? 'Available Pokémon' : 'Available Soul Links'}
            <span className="ml-2 text-text-muted font-normal normal-case">
              {selectedIds.size}/6 selected
            </span>
          </h3>
          {activeLinks.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <Link2 className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-40" />
              <p className="text-sm text-text-secondary">{players.length === 1 ? 'No Pokémon caught yet' : 'No active soul links'}</p>
              <p className="text-xs text-text-muted mt-1">{players.length === 1 ? 'Catch Pokémon on routes to get started' : 'Catch Pokémon on routes to form soul links'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeLinks.map((link) => (
                <SoulLinkRow
                  key={link.id}
                  link={link}
                  catches={catches}
                  players={players}
                  selected={selectedIds.has(link.id)}
                  onToggle={() => toggle(link.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Selected party preview */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Planned Party
          </h3>
          {selectedLinks.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <p className="text-sm text-text-secondary">None selected</p>
              <p className="text-xs text-text-muted mt-1">{players.length === 1 ? 'Select Pokémon from the left panel' : 'Select soul links from the left panel'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedLinks.map((link) => {
                const linkedCatches = link.catch_ids
                  .map((cid) => catches.find((c) => c.id === cid))
                  .filter(Boolean) as Catch[]
                return (
                  <div key={link.id} className="flex items-center gap-2">
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      {linkedCatches.map((c, idx) => {
                        const player = players.find((p) => p.id === c.player_id)
                        return (
                          <div key={c.id} className="flex items-center gap-1.5">
                            {idx > 0 && <Link2 className="w-3 h-3 text-accent-teal" />}
                            <PokemonCardInBuilder catch_={c} player={player} generation={activeRun.generation} />
                          </div>
                        )
                      })}
                    </div>
                    <button
                      onClick={() => toggle(link.id)}
                      className="p-1 text-text-muted hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Type coverage matrix */}
      <TypeCoverageMatrix
        selectedLinks={selectedLinks}
        generation={activeRun.generation}
        catches={catches}
        players={players}
      />
    </div>
  )
}
