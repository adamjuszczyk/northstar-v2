import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && key)

if (!supabaseConfigured) {
  console.error(
    '[Northstar] Missing Supabase credentials — VITE_SUPABASE_URL and/or ' +
    'VITE_SUPABASE_ANON_KEY are not set. Copy .env.example to .env and fill ' +
    'in your project credentials. Every data operation will fail until this ' +
    'is fixed; see AuthPage for the user-facing notice.'
  )
}

// Use placeholder values when env vars are absent so the module loads and the
// app can render. API calls will fail gracefully until real credentials are added.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-anon-key',
)
