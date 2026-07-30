import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuth } from './useAuth'

// ── Types ─────────────────────────────────────────────────────────────────────

/** A freely-named, scheduled time-range container (SPEC §5.2). Not itself
 *  completable — completion lives on whatever's assigned inside it. Every
 *  block uniformly supports optional assigned tasks and optional freeform
 *  notes, regardless of name — there's no fixed type gating either. */
export interface Block {
  id:        string
  userId:    string
  date:      string
  name:      string
  startTime: string        // 'HH:MM'
  endTime:   string        // 'HH:MM'
  colour:    string | null
  notes:     string | null
  position:  number
  createdAt: string
  updatedAt: string
}

function normTime(t: unknown): string {
  return typeof t === 'string' ? t.slice(0, 5) : ''
}

function blockFromRow(r: Record<string, unknown>): Block {
  return {
    id:        r.id         as string,
    userId:    r.user_id    as string,
    date:      r.date       as string,
    name:      r.name       as string,
    startTime: normTime(r.start_time),
    endTime:   normTime(r.end_time),
    colour:    (r.colour as string | null) ?? null,
    notes:     (r.notes as string | null) ?? null,
    position:  r.position   as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────
//
// Blocks are online-only writes (TASKS.md §3.9) — only the read side is
// Dexie-backed, so the offline Today/Day view isn't a structureless timeline.

const QK = (uid: string, date: string) => ['ns_blocks', uid, date] as const

export function useBlocks(date: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? QK(user.id, date) : ['ns_blocks', 'none', date],
    queryFn: async (): Promise<Block[]> => {
      if (!user) return []
      if (!navigator.onLine) {
        const cached = await db.blocks
          .where('[userId+date]').equals([user.id, date])
          .toArray()
          .catch(() => db.blocks.where('userId').equals(user.id).filter(r => r.date === date).toArray())
        return cached
          .map(r => ({
            id: r.id, userId: r.userId, date: r.date, name: r.name,
            startTime: r.startTime, endTime: r.endTime,
            colour: r.colour ?? null, notes: r.notes ?? null, position: r.position,
            createdAt: r.createdAt, updatedAt: r.updatedAt,
          }))
          .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.position - b.position)
      }
      const { data, error } = await supabase
        .from('ns_blocks')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', date)
        .order('start_time', { ascending: true })
        .order('position', { ascending: true })
      if (error) {
        const code = (error as { code?: string }).code ?? ''
        if (code === '42P01' || code === 'PGRST205') return []
        throw error
      }
      return (data ?? []).map(r => blockFromRow(r as Record<string, unknown>))
    },
    networkMode: 'always',
    enabled:     !!user && !!date,
    staleTime:   5 * 60 * 1000,
    gcTime:      60 * 60 * 1000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export interface CreateBlockInput {
  date:      string
  name:      string
  startTime: string
  endTime:   string
  colour?:   string | null
  notes?:    string | null
}

export function useCreateBlock() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateBlockInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('ns_blocks').insert({
        user_id:    user.id,
        date:       input.date,
        name:       input.name,
        start_time: input.startTime,
        end_time:   input.endTime,
        colour:     input.colour ?? null,
        notes:      input.notes ?? null,
        position:   0,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_blocks'] }),
  })
}

export interface UpdateBlockInput {
  id:        string
  name:      string
  startTime: string
  endTime:   string
  colour?:   string | null
  notes?:    string | null
}

export function useUpdateBlock() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateBlockInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_blocks')
        .update({
          name:       input.name,
          start_time: input.startTime,
          end_time:   input.endTime,
          colour:     input.colour ?? null,
          notes:      input.notes ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_blocks'] }),
  })
}

export function useDeleteBlock() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_blocks')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      if (error) throw error
    },
    // Deleting a block sets block_id = null on its assigned day items
    // server-side (on delete set null, A8) — the day items query must be
    // invalidated too, or the client cache keeps showing them as assigned.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_blocks'] })
      qc.invalidateQueries({ queryKey: ['ns_day_items'] })
    },
  })
}
