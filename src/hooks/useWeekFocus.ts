import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export type FocusSource = 'standalone' | 'tree' | 'inbox'

export interface WeekFocusItem {
  id:          string
  weekStart:   string
  source:      FocusSource
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  isComplete:  boolean
  position:    number
}

function fromRow(r: Record<string, unknown>): WeekFocusItem {
  return {
    id:          r.id           as string,
    weekStart:   r.week_start   as string,
    source:      r.source       as FocusSource,
    title:       r.title        as string | null,
    treeNodeId:  r.tree_node_id  as string | null,
    inboxItemId: r.inbox_item_id as string | null,
    isComplete:  r.is_complete   as boolean,
    position:    r.position      as number,
  }
}

export function useWeekFocus(weekStart: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['ns_week_focus', weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ns_week_focus')
        .select('*')
        .eq('user_id', user!.id)
        .eq('week_start', weekStart)
        .order('position')
        .order('created_at')
      if (error) {
        const code = (error as { code?: string }).code ?? ''
        if (code === '42P01' || code === 'PGRST116' || code === 'PGRST205') return []
        throw error
      }
      return (data ?? []).map(r => fromRow(r as Record<string, unknown>))
    },
    enabled: !!user && !!weekStart,
  })
}

export interface CreateWeekFocusInput {
  weekStart:   string
  source:      FocusSource
  title?:      string
  treeNodeId?: string
}

export function useCreateWeekFocus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateWeekFocusInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('ns_week_focus').insert({
        user_id:      user.id,
        week_start:   input.weekStart,
        source:       input.source,
        title:        input.title      ?? null,
        tree_node_id: input.treeNodeId ?? null,
        is_complete:  false,
        position:     0,
      })
      if (error) throw error
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['ns_week_focus', input.weekStart] })
    },
  })
}

export function useToggleWeekFocus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id:         string
      weekStart:  string
      isComplete: boolean
      source:     FocusSource
      treeNodeId: string | null
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_week_focus')
        .update({ is_complete: params.isComplete, updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .eq('user_id', user.id)
      if (error) throw error
      // Two-table rule: completing a tree-linked item marks the node complete too
      if (params.source === 'tree' && params.treeNodeId && params.isComplete) {
        const { error: te } = await supabase
          .from('ns_tree_nodes')
          .update({ status: 'complete', updated_at: new Date().toISOString() })
          .eq('id', params.treeNodeId)
          .eq('user_id', user.id)
        if (te) throw te
      }
      return params.weekStart
    },
    onSuccess: (weekStart) => {
      qc.invalidateQueries({ queryKey: ['ns_week_focus', weekStart] })
      qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] })
    },
  })
}

export function useDeleteWeekFocus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, weekStart }: { id: string; weekStart: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_week_focus')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      if (error) throw error
      return weekStart
    },
    onSuccess: (weekStart) => {
      qc.invalidateQueries({ queryKey: ['ns_week_focus', weekStart] })
    },
  })
}
