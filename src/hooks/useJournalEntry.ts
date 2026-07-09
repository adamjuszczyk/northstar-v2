import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuth } from './useAuth'

export interface JournalEntry {
  id:        string
  userId:    string
  date:      string
  content:   string
  createdAt: string
  updatedAt: string
}

const QK = (uid: string, date: string) => ['ns_journal', uid, date] as const

function row2entry(r: Record<string, unknown>): JournalEntry {
  return {
    id:        r.id         as string,
    userId:    r.user_id    as string,
    date:      r.date       as string,
    content:   r.content    as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

/** One entry per (user, date) — null when nothing has been written yet. */
export function useJournalEntry(date: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? QK(user.id, date) : ['ns_journal', 'none', date],
    queryFn: async (): Promise<JournalEntry | null> => {
      if (!user) return null
      if (!navigator.onLine) {
        const cached = await db.journalEntries
          .where('[userId+date]').equals([user.id, date])
          .first()
          .catch(() =>
            db.journalEntries.where('userId').equals(user.id).filter(r => r.date === date).first()
          )
        return cached
          ? { id: cached.id, userId: cached.userId, date: cached.date, content: cached.content, createdAt: cached.createdAt, updatedAt: cached.updatedAt }
          : null
      }
      const { data, error } = await supabase
        .from('ns_journal_entries')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', date)
        .maybeSingle()
      if (error) {
        const code = (error as { code?: string }).code ?? ''
        if (code === '42P01' || code === 'PGRST205') return null
        throw error
      }
      return data ? row2entry(data as Record<string, unknown>) : null
    },
    networkMode: 'always',
    enabled:     !!user && !!date,
    staleTime:   5 * 60 * 1000,
    gcTime:      60 * 60 * 1000,
  })
}

export function useSaveJournalEntry() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ date, content }: { date: string; content: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_journal_entries')
        .upsert(
          { user_id: user.id, date, content, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,date' }
        )
      if (error) throw error
    },
    onSuccess: (_d, { date }) => {
      qc.invalidateQueries({ queryKey: user ? QK(user.id, date) : ['ns_journal'] })
    },
  })
}
