import { useState } from 'react'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { TypeBadge } from '../components/pokemon/TypeBadge'
import { PokemonSprite } from '../components/pokemon/PokemonSprite'
import { useAppStore } from '../store/appStore'
import { getGameById } from '../data/games'
import { usePokemonById } from '../api/pokeapi'
import type { Catch } from '../types'
import type { GymLeader as GymLeaderType } from '../data/games'

function LevelStatus({ level, cap }: { level: number; cap: number }) {
  if (level > cap) return <span className="text-xs font-medium text-red-400">Over cap ({level}/{cap})</span>
  if (level === cap) return <span className="text-xs font-medium text-yellow-400">At cap ({level}/{cap})</span>
  return <span className="text-xs font-medium text-green-400">Under cap ({level}/{cap})</span>
}

function PartyMemberRow({ catch_, cap, displayLevel }: { catch_: Catch; cap: number; displayLevel: number }) {
  const { data } = usePokemonById(catch_.pokemon_id ?? 0)

  return (
    <div className="flex items-center gap-2 py-1">
      <PokemonSprite pokemonId={catch_.pokemon_id} pokemonName={catch_.pokemon_name} size={32} />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-text-primary">{catch_.nickname ?? catch_.pokemon_name ?? '?'}</span>
        {data && (
          <div className="flex gap-1 mt-0.5">
            {data.types.map((t) => <TypeBadge key={t.type.name} type={t.type.name} size="sm" />)}
          </div>
        )}
      </div>
      <LevelStatus level={displayLevel} cap={cap} />
    </div>
  )
}

export function BattlePrep() {
  const { activeRun, catches, players, partySlots, levelCap } = useAppStore()
  const displayLevel = levelCap ?? 5
  const [selectedGym, setSelectedGym] = useState<GymLeaderType | null>(null)

  if (!activeRun) return <div className="p-6 text-text-muted">No active run</div>

  const gameInfo = getGameById(activeRun.game)
  const gyms = [...(gameInfo?.gymLeaders ?? [])].sort((a, b) => a.levelCap - b.levelCap)
  const modifier = activeRun.ruleset.trainerLevelModifier ?? 100
  const adjustedCap = (levelCap: number) => Math.round(levelCap * modifier / 100)

  function getPartyForPlayer(playerId: string): Catch[] {
    const slots = partySlots.filter((ps) => ps.player_id === playerId)
    return slots
      .sort((a, b) => a.slot - b.slot)
      .map((ps) => catches.find((c) => c.id === ps.catch_id))
      .filter((c): c is Catch => c !== undefined)
  }

  return (
    <div className="flex h-full">
      {/* Gym list */}
      <div className="w-64 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-secondary">Battles</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {gyms.map((gym, idx) => (
            <button
              key={`${gym.name}-${idx}`}
              onClick={() => setSelectedGym(gym)}
              className={`w-full flex flex-col px-3 py-3 text-left transition-colors border-l-2 ${
                selectedGym?.name === gym.name
                  ? 'bg-elevated border-accent-teal'
                  : 'border-transparent hover:bg-elevated/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${
                  gym.kind === 'champion' ? 'text-accent-gold' :
                  gym.kind === 'elite4' ? 'text-purple-400' :
                  gym.kind === 'rival' ? 'text-blue-400' :
                  gym.kind === 'boss' ? 'text-red-400' :
                  'text-text-primary'
                }`}>{gym.name}</span>
                <span className="text-xs font-bold text-accent-gold">Lv.{adjustedCap(gym.levelCap)}</span>
              </div>
              <span className="text-xs text-text-muted">{gym.city}</span>
              <div className="flex gap-1 mt-1">
                {gym.types.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Gym detail */}
      <div className="flex-1 overflow-auto p-4">
        {!selectedGym ? (
          <div className="flex items-center justify-center h-full text-text-muted">
            <p>Select a gym to see battle prep</p>
          </div>
        ) : (
          <motion.div key={selectedGym.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <Card className="border-accent-gold/30 bg-accent-gold/5">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">{selectedGym.name}</h2>
                    <p className="text-sm text-text-muted">
                      {selectedGym.kind === 'rival' ? `Rival — ${selectedGym.city}`
                        : selectedGym.kind === 'boss' ? selectedGym.city
                        : selectedGym.kind === 'elite4' ? `Elite Four — ${selectedGym.city}`
                        : selectedGym.kind === 'champion' ? `Champion — ${selectedGym.city}`
                        : selectedGym.kind === 'other' ? selectedGym.city
                        : `${selectedGym.city} Gym`}
                    </p>
                    <p className="text-sm text-accent-gold">{selectedGym.badge}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-accent-gold">Lv. {adjustedCap(selectedGym.levelCap)}</p>
                    {modifier !== 100 && (
                      <p className="text-[10px] text-text-muted line-through">Lv. {selectedGym.levelCap}</p>
                    )}
                    <p className="text-xs text-text-muted">Ace Level</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <span className="text-xs text-text-muted">Type:</span>
                  {selectedGym.types.map((t) => <TypeBadge key={t} type={t} />)}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-2 py-2">
              <AlertTriangle className="w-4 h-4 text-accent-gold" />
              <span className="text-xs text-text-secondary">Level cap: {adjustedCap(selectedGym.levelCap)}</span>
              <span className="text-xs text-text-muted">— Pokémon over this level gain no EXP in strict Nuzlockes</span>
              {modifier !== 100 && (
                <span className="text-xs text-orange-400 font-medium">+{modifier - 100}% modifier active</span>
              )}
            </div>

            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(players.length, 2)}, 1fr)` }}>
              {players.map((player) => {
                const party = getPartyForPlayer(player.id)
                const cap = adjustedCap(selectedGym.levelCap)
                const overCap = party.filter((c) => c.level > cap).length
                const atCap = party.filter((c) => c.level === cap).length

                return (
                  <Card key={player.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: player.color }} />
                          {player.name}
                        </div>
                        <div className="flex gap-2 text-xs">
                          {overCap > 0 && <span className="text-red-400">{overCap} over</span>}
                          {atCap > 0 && <span className="text-yellow-400">{atCap} at cap</span>}
                          {overCap === 0 && atCap === 0 && party.length > 0 && (
                            <span className="text-green-400 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Ready
                            </span>
                          )}
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {party.length === 0 ? (
                        <p className="text-xs text-text-muted text-center py-2">No party members</p>
                      ) : (
                        <div className="divide-y divide-border">
                          {party.map((c) => (
                            <PartyMemberRow key={c.id} catch_={c} cap={cap} displayLevel={displayLevel} />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
