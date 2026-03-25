import { useState } from 'react'
import { Skull, MapPin, Calendar, Link2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '../components/ui/Card'
import { EvolvedCatchSprite } from '../components/pokemon/EvolvedCatchSprite'
import { useAppStore } from '../store/appStore'
import type { Catch, Player } from '../types'

function DeadPokemonCard({ catch_, player, linkedPartners, levelCap }: {
  catch_: Catch
  player?: Player
  linkedPartners: Catch[]
  levelCap: number | null
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <Card className="border-red-900/40 bg-red-950/5">
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            <div className="relative">
              <EvolvedCatchSprite
                pokemonId={catch_.pokemon_id}
                pokemonName={catch_.pokemon_name}
                levelCap={levelCap}
                size={56}
                grayscale
              />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-900 rounded-full flex items-center justify-center border border-red-800">
                <Skull className="w-3 h-3 text-red-400" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-secondary">
                  {catch_.nickname ?? catch_.pokemon_name ?? 'Unknown'}
                </span>
                {catch_.nickname && catch_.pokemon_name && (
                  <span className="text-xs text-text-muted capitalize">({catch_.pokemon_name})</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-1 text-xs text-text-muted">
                <span className="flex items-center gap-1">
                  <span>Lv. {levelCap ?? 5}</span>
                </span>
                {catch_.died_route && (
                  <span className="flex items-center gap-1 text-red-400">
                    <MapPin className="w-3 h-3" />
                    {catch_.died_route.replace(/-/g, ' ')}
                  </span>
                )}
                {catch_.died_at && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(catch_.died_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              {player && (
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: player.color }} />
                  <span className="text-xs text-text-muted">{player.name}</span>
                </div>
              )}
            </div>
          </div>

          {linkedPartners.length > 0 && (
            <div className="mt-2 pt-2 border-t border-red-900/30">
              <div className="flex items-center gap-1 mb-1">
                <Link2 className="w-3 h-3 text-red-400" />
                <span className="text-[10px] text-red-400">Soul linked partners also died:</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {linkedPartners.map((partner) => (
                  <div key={partner.id} className="flex items-center gap-1">
                    <EvolvedCatchSprite pokemonId={partner.pokemon_id} pokemonName={partner.pokemon_name} levelCap={levelCap} size={24} grayscale />
                    <span className="text-xs text-text-muted">{partner.nickname ?? partner.pokemon_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

export function Graveyard() {
  const { activeRun, catches, players, soulLinks, levelCap } = useAppStore()
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | 'all'>('all')
  const [sortBy, setSortBy] = useState<'date' | 'level' | 'route'>('date')

  if (!activeRun) return <div className="p-6 text-text-muted">No active run</div>

  const deadCatches = catches.filter((c) => c.status === 'dead')

  function getLinkedPartners(catch_: Catch): Catch[] {
    const link = soulLinks.find((sl) => sl.catch_ids.includes(catch_.id))
    if (!link) return []
    return link.catch_ids
      .filter((cid) => cid !== catch_.id)
      .map((cid) => catches.find((c) => c.id === cid))
      .filter((c): c is Catch => !!c && c.status === 'dead' && c.player_id !== catch_.player_id)
  }

  function getFilteredAndSorted(): Catch[] {
    let filtered = deadCatches
    if (selectedPlayerId !== 'all') {
      filtered = filtered.filter((c) => c.player_id === selectedPlayerId)
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === 'date') return new Date(b.died_at ?? b.caught_at).getTime() - new Date(a.died_at ?? a.caught_at).getTime()
      if (sortBy === 'level') return b.level - a.level
      if (sortBy === 'route') return (a.died_route ?? '').localeCompare(b.died_route ?? '')
      return 0
    })
  }

  const displayed = getFilteredAndSorted()

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
            <Skull className="w-5 h-5 text-red-400" />
            Graveyard
          </h2>
          <p className="text-xs text-text-muted mt-0.5">{deadCatches.length} Pokémon lost</p>
        </div>

        <div className="flex gap-2">
          {/* Player filter */}
          <div className="flex gap-1">
            <button
              onClick={() => setSelectedPlayerId('all')}
              className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                selectedPlayerId === 'all'
                  ? 'bg-elevated border-border-light text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              All
            </button>
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlayerId(p.id)}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                  selectedPlayerId === p.id
                    ? 'bg-elevated border-border-light text-text-primary'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
                style={selectedPlayerId === p.id ? { borderColor: p.color, color: p.color } : undefined}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'level' | 'route')}
            className="bg-input border border-border rounded px-2 py-1.5 text-xs text-text-secondary focus:outline-none"
          >
            <option value="date">Sort: Date</option>
            <option value="level">Sort: Level</option>
            <option value="route">Sort: Route</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {displayed.length === 0 ? (
        <div className="text-center py-16">
          <Skull className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-20" />
          <p className="text-text-secondary">No deaths yet</p>
          <p className="text-text-muted text-sm mt-1">May your Pokémon live long and prosper</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayed.map((c) => (
            <DeadPokemonCard
              key={c.id}
              catch_={c}
              player={players.find((p) => p.id === c.player_id)}
              linkedPartners={getLinkedPartners(c)}
              levelCap={levelCap}
            />
          ))}
        </div>
      )}
    </div>
  )
}
