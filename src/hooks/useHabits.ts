import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { weekStart } from '../lib/dates'

// ── Types ─────────────────────────────────────────────────────────────────────

export type HabitMode          = 'reduce' | 'build'
export type HabitFrequencyType = 'daily' | 'weekly' | 'x_per_week'
export type HabitAutoAddTo     = 'day' | 'week' | 'month'
export type HabitEntrySource   = 'manual' | 'day_view'

export interface Habit {
  id:             string
  userId:         string
  name:           string
  mode:           HabitMode
  treeNodeId:     string | null
  frequencyType:  HabitFrequencyType
  frequencyValue: number | null
  autoAdd:        boolean
  autoAddTo:      HabitAutoAddTo | null
  createdAt:      string
}

export interface HabitEntry {
  id:       string
  userId:   string
  habitId:  string
  loggedAt: string
  note:     string | null
  source:   HabitEntrySource
}

export type HabitStatus = 'early' | 'good' | 'struggling'

function habitFromRow(r: Record<string, unknown>): Habit {
  return {
    id:             r.id              as string,
    userId:         r.user_id         as string,
    name:           r.name            as string,
    mode:           r.mode            as HabitMode,
    treeNodeId:     r.tree_node_id    as string | null,
    frequencyType:  r.frequency_type  as HabitFrequencyType,
    frequencyValue: r.frequency_value as number | null,
    autoAdd:        r.auto_add        as boolean,
    autoAddTo:      r.auto_add_to     as HabitAutoAddTo | null,
    createdAt:      r.created_at      as string,
  }
}

function entryFromRow(r: Record<string, unknown>): HabitEntry {
  return {
    id:       r.id        as string,
    userId:   r.user_id   as string,
    habitId:  r.habit_id  as string,
    loggedAt: r.logged_at as string,
    note:     r.note      as string | null,
    source:   r.source    as HabitEntrySource,
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────
//
// Habits are a small, infrequently-changing list — unlike tree/day-items/inbox
// there's no offline Dexie cache here; a missing table (migration not yet run)
// or an offline read both resolve to an empty list rather than an error.

export function useHabits() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? ['ns_habits', user.id] : ['ns_habits', 'none'],
    queryFn: async (): Promise<Habit[]> => {
      if (!user || !navigator.onLine) return []
      const { data, error } = await supabase
        .from('ns_habits')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (error) {
        const code = (error as { code?: string }).code ?? ''
        if (code === '42P01' || code === 'PGRST205') return []
        throw error
      }
      return (data ?? []).map(r => habitFromRow(r as Record<string, unknown>))
    },
    networkMode: 'always',
    enabled:     !!user,
  })
}

/** All habit entries for the user — small enough to fetch in one shot and
 *  group client-side per habit for metrics/charts. */
export function useHabitEntries() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? ['ns_habit_entries', user.id] : ['ns_habit_entries', 'none'],
    queryFn: async (): Promise<HabitEntry[]> => {
      if (!user || !navigator.onLine) return []
      const { data, error } = await supabase
        .from('ns_habit_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: true })
      if (error) {
        const code = (error as { code?: string }).code ?? ''
        if (code === '42P01' || code === 'PGRST205') return []
        throw error
      }
      return (data ?? []).map(r => entryFromRow(r as Record<string, unknown>))
    },
    networkMode: 'always',
    enabled:     !!user,
  })
}

// ── Mutations ────────────────────────────────────────────────────────────────

export interface CreateHabitInput {
  name:           string
  mode:           HabitMode
  treeNodeId:     string | null
  frequencyType:  HabitFrequencyType
  frequencyValue: number | null
  autoAdd:        boolean
  autoAddTo:      HabitAutoAddTo | null
}

export function useCreateHabit() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateHabitInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('ns_habits').insert({
        user_id:         user.id,
        name:            input.name,
        mode:            input.mode,
        tree_node_id:    input.treeNodeId,
        frequency_type:  input.frequencyType,
        frequency_value: input.frequencyValue,
        auto_add:        input.autoAdd,
        auto_add_to:     input.autoAddTo,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_habits'] }),
  })
}

export interface UpdateHabitInput {
  id:             string
  name:           string
  mode:           HabitMode
  treeNodeId:     string | null
  frequencyType:  HabitFrequencyType
  frequencyValue: number | null
  autoAdd:        boolean
  autoAddTo:      HabitAutoAddTo | null
}

export function useUpdateHabit() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateHabitInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_habits')
        .update({
          name:            input.name,
          mode:            input.mode,
          tree_node_id:    input.treeNodeId,
          frequency_type:  input.frequencyType,
          frequency_value: input.frequencyValue,
          auto_add:        input.autoAdd,
          auto_add_to:     input.autoAddTo,
        })
        .eq('id', input.id)
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_habits'] }),
  })
}

export function useDeleteHabit() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_habits')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_habits'] })
      qc.invalidateQueries({ queryKey: ['ns_habit_entries'] })
    },
  })
}

/** The "+ Log" button — logs an entry right now, independent of the day view. */
export function useLogHabitEntry() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ habitId, note }: { habitId: string; note?: string | null }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('ns_habit_entries').insert({
        user_id:  user.id,
        habit_id: habitId,
        note:     note ?? null,
        source:   'manual',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_habit_entries'] }),
  })
}

// ── Status / metric computation ─────────────────────────────────────────────
//
// The spec doesn't pin down exact thresholds for early/good/struggling, so
// these are a deliberately simple, explainable heuristic: brand-new habits
// (< 3 days old) read as "early" rather than immediately failing; after that,
// build habits compare actual entries against the target rate for their
// frequency, and reduce habits compare the gap since the last occurrence
// against the target minimum gap.

function daysSince(iso: string): number {
  return differenceInCalendarDays(new Date(), parseISO(iso))
}

function entriesForHabit(habitId: string, entries: HabitEntry[]): HabitEntry[] {
  return entries.filter(e => e.habitId === habitId)
}

function countSince(entries: HabitEntry[], days: number): number {
  return entries.filter(e => daysSince(e.loggedAt) < days).length
}

/** Target gap (in days) implied by a frequency — used by reduce mode. */
function targetGapDays(freqType: HabitFrequencyType, freqValue: number | null): number {
  if (freqType === 'daily')  return 1
  if (freqType === 'weekly') return 7
  return Math.max(1, Math.round(7 / Math.max(1, freqValue ?? 1)))
}

export function computeHabitStatus(habit: Habit, allEntries: HabitEntry[]): HabitStatus {
  const entries = entriesForHabit(habit.id, allEntries)
  const age = daysSince(habit.createdAt)

  if (habit.mode === 'build') {
    if (entries.length === 0) return age < 3 ? 'early' : 'struggling'
    const windowDays = habit.frequencyType === 'daily' ? 7 : 7
    const target = habit.frequencyType === 'daily' ? 6
                 : habit.frequencyType === 'weekly' ? 1
                 : (habit.frequencyValue ?? 1)
    const rate = countSince(entries, windowDays) / target
    if (rate >= 0.7) return 'good'
    if (age < 7) return 'early'
    return 'struggling'
  }

  // Reduce mode: longer gap since the last entry is better.
  if (entries.length === 0) return age < 3 ? 'early' : 'good'
  const gap = daysSince(entries[entries.length - 1].loggedAt)
  const target = targetGapDays(habit.frequencyType, habit.frequencyValue)
  if (gap >= target) return 'good'
  if (age < 3) return 'early'
  return 'struggling'
}

/** "X this week" (build) or "X days since last" (reduce). */
export function computeCurrentMetric(habit: Habit, allEntries: HabitEntry[]): string {
  const entries = entriesForHabit(habit.id, allEntries)

  if (habit.mode === 'build') {
    const wStart = weekStart(new Date())
    const count = entries.filter(e => weekStart(e.loggedAt) === wStart).length
    return `${count} this week`
  }

  if (entries.length === 0) return 'Never logged'
  const gap = daysSince(entries[entries.length - 1].loggedAt)
  return gap === 0 ? 'Today' : `${gap} day${gap === 1 ? '' : 's'} since last`
}
