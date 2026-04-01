import { useState } from 'react'
import { Input } from '../ui/Input'
import { usePokemonSearch } from '../../api/pokeapi'

export function PokemonAutocomplete({
  value,
  onChange,
}: {
  value: string
  onChange: (name: string, id?: number) => void
}) {
  const [query, setQuery] = useState(value)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const { data } = usePokemonSearch(query)

  function selectResult(p: { name: string; url: string }) {
    const id = parseInt(p.url.split('/').filter(Boolean).pop() ?? '0', 10)
    setQuery(p.name)
    setShowDropdown(false)
    setHighlightedIndex(-1)
    onChange(p.name, id || undefined)
  }

  return (
    <div className="relative">
      <Input
        label="Pokémon"
        placeholder="e.g. pikachu"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setShowDropdown(true)
          setHighlightedIndex(-1)
          onChange(e.target.value)
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => { setShowDropdown(false); setHighlightedIndex(-1) }, 200)}
        onKeyDown={(e) => {
          const results = data?.results ?? []
          if (!showDropdown || results.length === 0 || query.length < 2) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlightedIndex((i) => Math.min(i + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlightedIndex((i) => Math.max(i - 1, -1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (highlightedIndex >= 0) selectResult(results[highlightedIndex])
          } else if (e.key === 'Escape') {
            setShowDropdown(false)
            setHighlightedIndex(-1)
          }
        }}
      />
      {showDropdown && data && data.results.length > 0 && query.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-elevated border border-border rounded shadow-xl max-h-48 overflow-y-auto">
          {data.results.map((p, i) => (
            <button
              key={p.name}
              onMouseDown={() => selectResult(p)}
              className={`w-full text-left px-3 py-2 text-sm text-text-primary capitalize ${i === highlightedIndex ? 'bg-card' : 'hover:bg-card'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
