import { useAppStore } from '../store/appStore'
import { supabaseApi } from './supabase'

/**
 * Returns the correct API backend for the active run.
 * Collaborative runs use Supabase; local runs use window.api (IPC).
 */
export function useApi(): typeof window.api {
  const collaborative = useAppStore((s) => s.activeRun?.collaborative ?? false)
  return (collaborative ? supabaseApi : window.api) as typeof window.api
}
