import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuth } from './useAuth'

// ── Types ─────────────────────────────────────────────────────────────────────

/** A named marker at a fixed time on the day timeline — purely visual, no
 *  content, no completion state, not a container (SPEC §5.1). */
export interface Line {
  id:        string
  userId:    string
  date:      string        // 'YYYY-MM-DD'
  label:     string
  time:      string        // 'HH:MM'
  colour:    string | null
  position:  number
  createdAt: string
  updatedAt: string
}

function normTime(t: unknown): string {
  return typeof t === 'string' ? t.slice(0, 5) : ''
}

function lineFromRow(r: Record<string, unknown>): Line {
  return {
    id:        r.id         as string,
    userId:    r.user_id    as string,
    date:      r.date       as string,
    label:     r.label      as string,
    time:      normTime(r.time),
    colour:    (r.colour as string | null) ?? null,
    position:  r.position   as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────
//
// Lines are online-only writes (TASKS.md §3.9) — only the read side is
// Dexie-backed, so the offline Today/Day view isn't a structureless timeline.

const QK = (uid: string, date: string) => ['ns_lines', uid, date] as const

export function useLines(date: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? QK(user.id, date) : ['ns_lines', 'none', date],
    queryFn: async (): Promise<Line[]> => {
      if (!user) return []
      if (!navigator.onLine) {
        const cached = await db.lines
          .where('[userId+date]').equals([user.id, date])
          .toArray()
          .catch(() => db.lines.where('userId').equals(user.id).filter(r => r.date === date).toArray())
        return cached
          .map(r => ({
            id: r.id, userId: r.userId, date: r.date, label: r.label,
            time: r.time, colour: r.colour ?? null, position: r.position,
            createdAt: r.createdAt, updatedAt: r.updatedAt,
          }))
          .sort((a, b) => a.time.localeCompare(b.time) || a.position - b.position)
      }
      const { data, error } = await supabase
        .from('ns_lines')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', date)
        .order('time', { ascending: true })
        .order('position', { ascending: true })
      if (error) {
        const code = (error as { code?: string }).code ?? ''
        if (code === '42P01' || code === 'PGRST205') return []
        throw error
      }
      return (data ?? []).map(r => lineFromRow(r as Record<string, unknown>))
    },
    networkMode: 'always',
    enabled:     !!user && !!date,
    staleTime:   5 * 60 * 1000,
    gcTime:      60 * 60 * 1000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export interface CreateLineInput {
  date:   string
  label:  string
  time:   string
  colour?: string | null
}

export function useCreateLine() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateLineInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('ns_lines').insert({
        user_id: user.id,
        date:    input.date,
        label:   input.label,
        time:    input.time,
        colour:  input.colour ?? null,
        position: 0,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_lines'] }),
  })
}

export interface UpdateLineInput {
  id:      string
  label:   string
  time:    string
  colour?: string | null
}

export function useUpdateLine() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateLineInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_lines')
        .update({
          label:      input.label,
          time:       input.time,
          colour:     input.colour ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_lines'] }),
  })
}

export function useDeleteLine() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_lines')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_lines'] }),
  })
}
