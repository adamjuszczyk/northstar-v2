import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { clearAllCaches } from '../lib/db'

/** Signs out, then clears the query cache and all local Dexie stores. */
export function useSignOut() {
  const qc = useQueryClient()
  return async function signOut() {
    await supabase.auth.signOut()
    qc.clear()
    await clearAllCaches()
  }
}
