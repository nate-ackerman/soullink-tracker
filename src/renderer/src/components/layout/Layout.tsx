import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useAppStore } from '../../store/appStore'
import { getSpriteUrl, getShinyUrl, prefetchPokemonById } from '../../api/pokeapi'

// Preloads sprites and PokeAPI data for every caught Pokémon in the run while
// the browser is idle, so navigating to any page feels instant.
function usePrefetchRunPokemon() {
  const catches = useAppStore(s => s.catches)
  const queryClient = useQueryClient()

  useEffect(() => {
    const ids = [...new Set(
      catches.map(c => c.pokemon_id).filter((id): id is number => id != null && id > 0)
    )]
    if (ids.length === 0) return

    function prefetchAll() {
      for (const id of ids) {
        prefetchPokemonById(queryClient, id)
        // Prime the browser image cache for both regular and shiny sprites
        new Image().src = getSpriteUrl(id)
        new Image().src = getShinyUrl(id)
      }
    }

    if ('requestIdleCallback' in window) {
      const handle = requestIdleCallback(prefetchAll, { timeout: 4000 })
      return () => cancelIdleCallback(handle)
    }
    const t = setTimeout(prefetchAll, 600)
    return () => clearTimeout(t)
  }, [catches, queryClient])
}

export function Layout() {
  usePrefetchRunPokemon()
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-secondary">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
          <div className="h-5 shrink-0" />
        </main>
      </div>
    </div>
  )
}
