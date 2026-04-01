import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Home } from './pages/Home'
import { RunDashboard } from './pages/RunDashboard'
import { RouteTracker } from './pages/RouteTracker'
import { SoulLinkView } from './pages/SoulLinkView'
import { PartyTracker } from './pages/PartyTracker'
import { LearnsetSearch } from './pages/LearnsetSearch'
import { CatchCalc } from './pages/CatchCalc'
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
              <Route path="/catch-calc" element={<ErrorBoundary><CatchCalc /></ErrorBoundary>} />
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
