import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Home } from './pages/Home'
import { RunDashboard } from './pages/RunDashboard'
import { RouteTracker } from './pages/RouteTracker'
import { SoulLinkView } from './pages/SoulLinkView'
import { PartyTracker } from './pages/PartyTracker'
import { LearnsetSearch } from './pages/LearnsetSearch'
import { Notes } from './pages/Notes'
import { Settings } from './pages/Settings'
import { Graveyard } from './pages/Graveyard'
import { Info } from './pages/Info'
import { ErrorBoundary } from './ErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000
    }
  }
})

// ── Persistent query cache ────────────────────────────────────────────────────
// Persist move/machine/search data to localStorage so subsequent app launches
// load instantly without re-fetching from PokeAPI.
// Each query gets its own key so a QuotaExceededError on one large entry
// doesn't prevent smaller, more valuable entries from being saved.
const CACHE_PREFIX = 'soullink_q:'
const CACHE_TTL = 14 * 24 * 60 * 60 * 1000   // 2 weeks
const PERSIST_ROOTS = new Set(['move', 'machine', 'pokemon-search-list', 'pokemon', 'pokemon-species', 'pokemon-species-name', 'ability'])

// Restore persisted entries into the query cache on startup
;(function restoreCache() {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const lsKey = localStorage.key(i)
      if (!lsKey?.startsWith(CACHE_PREFIX)) continue
      try {
        const { ts, queryKey, data } = JSON.parse(localStorage.getItem(lsKey)!)
        if (Date.now() - ts > CACHE_TTL) { toRemove.push(lsKey); continue }
        queryClient.setQueryData(queryKey, data)
      } catch { toRemove.push(lsKey!) }
    }
    toRemove.forEach(k => localStorage.removeItem(k))
  } catch {}
})()

// Save each successful query individually (debounced per query)
const _saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
queryClient.getQueryCache().subscribe((event) => {
  if (event?.type !== 'updated') return
  const q = event.query
  if (q.state.status !== 'success') return
  if (!PERSIST_ROOTS.has(q.queryKey[0] as string)) return
  const lsKey = CACHE_PREFIX + JSON.stringify(q.queryKey)
  clearTimeout(_saveTimers.get(lsKey))
  _saveTimers.set(lsKey, setTimeout(() => {
    try {
      localStorage.setItem(lsKey, JSON.stringify({ ts: Date.now(), queryKey: q.queryKey, data: q.state.data }))
    } catch {}  // QuotaExceededError: silently skip this entry
    _saveTimers.delete(lsKey)
  }, 500))
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<ErrorBoundary><RunDashboard /></ErrorBoundary>} />
              <Route path="/routes" element={<ErrorBoundary><RouteTracker /></ErrorBoundary>} />
              <Route path="/soul-links" element={<ErrorBoundary><SoulLinkView /></ErrorBoundary>} />
              <Route path="/party" element={<ErrorBoundary><PartyTracker /></ErrorBoundary>} />
              <Route path="/learnset" element={<ErrorBoundary><LearnsetSearch /></ErrorBoundary>} />
              <Route path="/graveyard" element={<ErrorBoundary><Graveyard /></ErrorBoundary>} />
              <Route path="/notes" element={<ErrorBoundary><Notes /></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
              <Route path="/info" element={<ErrorBoundary><Info /></ErrorBoundary>} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </HashRouter>
    </QueryClientProvider>
  )
}
