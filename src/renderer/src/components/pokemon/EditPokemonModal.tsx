import { useState, useEffect, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { PokemonAutocomplete } from './PokemonAutocomplete'
import { useApi } from '../../lib/useApi'
import { useAppStore } from '../../store/appStore'
import { usePokemonByName } from '../../api/pokeapi'
import type { Catch } from '../../types'

export function EditPokemonModal({
  open, onClose, catch_, onSaved
}: {
  open: boolean
  onClose: () => void
  catch_: Catch | null
  onSaved: () => void
}) {
  const [pokemonName, setPokemonName] = useState('')
  const [pokemonId, setPokemonId] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const prevId = useRef<string | undefined>()
  const api = useApi()
  const { optimisticUpdateCatch } = useAppStore()
  const { data: resolved } = usePokemonByName(pokemonName)

  // Reset state when a different catch is opened
  useEffect(() => {
    if (catch_?.id !== prevId.current) {
      prevId.current = catch_?.id
      setPokemonName(catch_?.pokemon_name ?? '')
      setPokemonId(catch_?.pokemon_id ?? undefined)
    }
  })

  async function handleSave() {
    if (!catch_ || !pokemonName) return
    setLoading(true)
    try {
      const resolvedId = resolved?.id ?? pokemonId
      optimisticUpdateCatch(catch_.id, { pokemon_id: resolvedId ?? null, pokemon_name: pokemonName })
      onClose()
      await api.catches.update(catch_.id, {
        pokemon_id: resolvedId ?? null,
        pokemon_name: pokemonName,
      } as Partial<Catch>)
      onSaved()
    } finally {
      setLoading(false)
    }
  }

  if (!catch_) return null

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Edit Pokémon Species">
      <div className="space-y-3">
        <p className="text-xs text-text-muted">
          Change the Pokémon species (e.g. after a friendship/trade/item evolution).
        </p>
        <PokemonAutocomplete
          key={catch_.id}
          value={pokemonName}
          onChange={(name, id) => { setPokemonName(name); if (id) setPokemonId(id) }}
        />
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} loading={loading} disabled={!pokemonName} className="flex-1">
            Save
          </Button>
        </div>
      </div>
    </Modal>
  )
}
