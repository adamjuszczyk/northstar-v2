import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { FocusSource } from './useWeekFocus'

export interface MonthFocusItem {
  id:          string
  monthStart:  string
  source:      FocusSource
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  isComplete:  boolean
  position:    number
}

function fromRow(r: Record<string, unknown>): MonthFocusItem {
  return {
    id:          r.id            as string,
    monthStart:  r.month_start   as string,
    source:      r.source        as FocusSource,
    title:       r.title         as string | null,
    treeNodeId:  r.tree_node_id  as string | null,
    inboxItemId: r.inbox_item_id as string | null,
    isComplete:  r.is_complete   as boolean,
    position:    r.position      as number,
  }
}

export function useMonthFocus(monthStart: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['ns_month_focus', monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ns_month_focus')
        .select('*')
        .eq('user_id', user!.id)
        .eq('month_start', monthStart)
        .order('position')
        .order('created_at')
      if (error) {
        const code = (error as { code?: string }).code ?? ''
        if (code === '42P01' || code === 'PGRST116' || code === 'PGRST205') return []
        throw error
      }
      return (data ?? []).map(r => fromRow(r as Record<string, unknown>))
    },
    enabled: !!user && !!monthStart,
  })
}

export interface CreateMonthFocusInput {
  monthStart:  string
  source:      FocusSource
  title?:      string
  treeNodeId?: string
}

export function useCreateMonthFocus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateMonthFocusInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('ns_month_focus').insert({
        user_id:      user.id,
        month_start:  input.monthStart,
        source:       input.source,
        title:        input.title      ?? null,
        tree_node_id: input.treeNodeId ?? null,
        is_complete:  false,
        position:     0,
      })
      if (error) throw error
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['ns_month_focus', input.monthStart] })
    },
  })
}

export function useToggleMonthFocus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id:         string
      monthStart: string
      isComplete: boolean
      source:     FocusSource
      treeNodeId: string | null
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_month_focus')
        .update({ is_complete: params.isComplete, updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .eq('user_id', user.id)
      if (error) throw error
      // Two-table rule
      if (params.source === 'tree' && params.treeNodeId && params.isComplete) {
        const { error: te } = await supabase
          .from('ns_tree_nodes')
          .update({ status: 'complete', updated_at: new Date().toISOString() })
          .eq('id', params.treeNodeId)
          .eq('user_id', user.id)
        if (te) throw te
      }
      return params.monthStart
    },
    onSuccess: (monthStart) => {
      qc.invalidateQueries({ queryKey: ['ns_month_focus', monthStart] })
      qc.invalidateQueries({ queryKey: ['ns_tree_nodes'] })
    },
  })
}

export function useDeleteMonthFocus() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, monthStart }: { id: string; monthStart: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_month_focus')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      if (error) throw error
      return monthStart
    },
    onSuccess: (monthStart) => {
      qc.invalidateQueries({ queryKey: ['ns_month_focus', monthStart] })
    },
  })
}
