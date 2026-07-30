import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// -- Types ----------------------------------------------------------------------

/** A named, reusable layout of Lines + Blocks at fixed times (SPEC 5.4).
 *  Applying a template is a one-time stamp -- no template_id is ever written
 *  onto the ns_lines/ns_blocks rows it creates, so editing a template later
 *  never touches a day that already applied it. */
export interface DayTemplate {
  id:        string
  userId:    string
  name:      string
  position:  number
  createdAt: string
  updatedAt: string
}

export type TemplateItemKind = 'line' | 'block'

export interface DayTemplateItem {
  id:         string
  userId:     string
  templateId: string
  kind:       TemplateItemKind
  label:      string
  startTime:  string        // 'HH:MM' -- line: the marker time; block: range start
  endTime:    string | null // block only
  colour:     string | null
  position:   number
  createdAt:  string
  updatedAt:  string
}

function normTime(t: unknown): string {
  return typeof t === 'string' ? t.slice(0, 5) : ''
}

function templateFromRow(r: Record<string, unknown>): DayTemplate {
  return {
    id:        r.id         as string,
    userId:    r.user_id    as string,
    name:      r.name       as string,
    position:  r.position   as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

function itemFromRow(r: Record<string, unknown>): DayTemplateItem {
  return {
    id:         r.id          as string,
    userId:     r.user_id     as string,
    templateId: r.template_id as string,
    kind:       r.kind        as TemplateItemKind,
    label:      r.label       as string,
    startTime:  normTime(r.start_time),
    endTime:    r.end_time ? normTime(r.end_time) : null,
    colour:     (r.colour as string | null) ?? null,
    position:   r.position    as number,
    createdAt:  r.created_at  as string,
    updatedAt:  r.updated_at  as string,
  }
}

function tableMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? ''
  return code === '42P01' || code === 'PGRST205'
}

// -- Queries ----------------------------------------------------------------------
//
// Day templates are online-only, managed deliberately from Settings while
// online (TASKS.md section 3.9) -- no Dexie caching at all, unlike Lines/Blocks.

export function useDayTemplates() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['ns_day_templates', user?.id ?? 'none'],
    queryFn: async (): Promise<DayTemplate[]> => {
      if (!user) return []
      const { data, error } = await supabase
        .from('ns_day_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) {
        if (tableMissing(error)) return []
        throw error
      }
      return (data ?? []).map(r => templateFromRow(r as Record<string, unknown>))
    },
    enabled: !!user,
  })
}

export function useDayTemplateItems(templateId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['ns_day_template_items', templateId],
    queryFn: async (): Promise<DayTemplateItem[]> => {
      if (!user || !templateId) return []
      const { data, error } = await supabase
        .from('ns_day_template_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('template_id', templateId)
        .order('position', { ascending: true })
      if (error) {
        if (tableMissing(error)) return []
        throw error
      }
      return (data ?? []).map(r => itemFromRow(r as Record<string, unknown>))
    },
    enabled: !!user && !!templateId,
  })
}

// -- Template mutations --------------------------------------------------------

async function nextTemplatePosition(userId: string): Promise<number> {
  const { count } = await supabase
    .from('ns_day_templates')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  return count ?? 0
}

export function useCreateDayTemplate() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string): Promise<string> => {
      if (!user) throw new Error('Not authenticated')
      const position = await nextTemplatePosition(user.id)
      const { data, error } = await supabase
        .from('ns_day_templates')
        .insert({ user_id: user.id, name, position })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_day_templates'] }),
  })
}

export function useRenameDayTemplate() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_day_templates')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_day_templates'] }),
  })
}

export function useDeleteDayTemplate() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_day_templates')
        .delete()
        .eq('id', id).eq('user_id', user.id)
      if (error) throw error
    },
    // Deleting a template cascades to its items server-side -- invalidate both.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_day_templates'] })
      qc.invalidateQueries({ queryKey: ['ns_day_template_items'] })
    },
  })
}

// -- Item mutations ---------------------------------------------------------------

async function nextItemPosition(userId: string, templateId: string): Promise<number> {
  const { count } = await supabase
    .from('ns_day_template_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('template_id', templateId)
  return count ?? 0
}

export interface CreateTemplateItemInput {
  templateId: string
  kind:       TemplateItemKind
  label:      string
  startTime:  string
  endTime?:   string | null   // required for 'block', ignored for 'line'
  colour?:    string | null
}

export function useCreateDayTemplateItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateTemplateItemInput) => {
      if (!user) throw new Error('Not authenticated')
      const position = await nextItemPosition(user.id, input.templateId)
      const { error } = await supabase.from('ns_day_template_items').insert({
        user_id:     user.id,
        template_id: input.templateId,
        kind:        input.kind,
        label:       input.label,
        start_time:  input.startTime,
        end_time:    input.kind === 'block' ? (input.endTime ?? null) : null,
        colour:      input.colour ?? null,
        position,
      })
      if (error) throw error
    },
    onSuccess: (_d, { templateId }) => {
      qc.invalidateQueries({ queryKey: ['ns_day_template_items', templateId] })
    },
  })
}

export interface UpdateTemplateItemInput {
  id:         string
  templateId: string
  kind:       TemplateItemKind
  label:      string
  startTime:  string
  endTime?:   string | null
  colour?:    string | null
}

export function useUpdateDayTemplateItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateTemplateItemInput) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_day_template_items')
        .update({
          label:      input.label,
          start_time: input.startTime,
          end_time:   input.kind === 'block' ? (input.endTime ?? null) : null,
          colour:     input.colour ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id).eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: (_d, { templateId }) => {
      qc.invalidateQueries({ queryKey: ['ns_day_template_items', templateId] })
    },
  })
}

export function useDeleteDayTemplateItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; templateId: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('ns_day_template_items')
        .delete()
        .eq('id', id).eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: (_d, { templateId }) => {
      qc.invalidateQueries({ queryKey: ['ns_day_template_items', templateId] })
    },
  })
}

/** Swaps an items position with its immediate up/down neighbour -- same
 *  re-read-fresh-then-swap pattern as useReorderTaskStep (useTaskSteps.ts),
 *  so a reorder issued right after another change can't swap a stale index. */
export function useReorderDayTemplateItem() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ templateId, itemId, direction }: {
      templateId: string; itemId: string; direction: 'up' | 'down'
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('ns_day_template_items')
        .select('id, position')
        .eq('user_id', user.id)
        .eq('template_id', templateId)
        .order('position', { ascending: true })
      if (error) throw error
      const items = data ?? []
      const idx = items.findIndex(i => i.id === itemId)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (idx === -1 || swapIdx < 0 || swapIdx >= items.length) return
      const a = items[idx]
      const b = items[swapIdx]
      const [e1, e2] = await Promise.all([
        supabase.from('ns_day_template_items').update({ position: b.position }).eq('id', a.id).eq('user_id', user.id),
        supabase.from('ns_day_template_items').update({ position: a.position }).eq('id', b.id).eq('user_id', user.id),
      ])
      if (e1.error) throw e1.error
      if (e2.error) throw e2.error
    },
    onSuccess: (_d, { templateId }) => {
      qc.invalidateQueries({ queryKey: ['ns_day_template_items', templateId] })
    },
  })
}

// -- Apply --------------------------------------------------------------------
//
// Applying stamps the templates items onto a specific dates ns_lines /
// ns_blocks -- a one-time copy, never a live link (SPEC 5.4): no
// template_id is written onto the created rows, so editing the template
// afterward never touches days already stamped.
//
// Merge, always -- the least destructive default: applying to a day that
// already has lines/blocks ADDS the templates items alongside what is
// there. Nothing is ever deleted by apply. (TASKS.md A6 floated an
// additional opt-in "replace existing" mode; deliberately not built here --
// flagged in the session summary as a scoped-down assumption, not silently
// dropped.)

export function useApplyDayTemplate() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ templateId, date }: { templateId: string; date: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('ns_day_template_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('template_id', templateId)
        .order('position', { ascending: true })
      if (error) throw error
      const items = (data ?? []).map(r => itemFromRow(r as Record<string, unknown>))

      const lineRows = items
        .filter(i => i.kind === 'line')
        .map(i => ({
          user_id: user.id, date, label: i.label, time: i.startTime,
          colour: i.colour, position: i.position,
        }))
      const blockRows = items
        .filter(i => i.kind === 'block')
        .map(i => ({
          user_id: user.id, date, name: i.label,
          start_time: i.startTime, end_time: i.endTime,
          colour: i.colour, notes: null, position: i.position,
        }))

      if (lineRows.length > 0) {
        const { error: lineErr } = await supabase.from('ns_lines').insert(lineRows)
        if (lineErr) throw lineErr
      }
      if (blockRows.length > 0) {
        const { error: blockErr } = await supabase.from('ns_blocks').insert(blockRows)
        if (blockErr) throw blockErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ns_lines'] })
      qc.invalidateQueries({ queryKey: ['ns_blocks'] })
    },
  })
}

// -- Save day as template ------------------------------------------------------

export interface SaveDayAsTemplateInput {
  date: string
  name: string
}

/** Reverse of applying a template: reads a day's actual current Lines +
 *  Blocks and copies them into a brand-new template -- a one-time copy,
 *  not a live link (same direction of "stamp, not a rule" as applying
 *  one). Editing the day afterward never changes the template it was
 *  saved from, since nothing links back to the source day at all -- there
 *  is no such column on ns_day_templates/ns_day_template_items. */
export function useSaveDayAsTemplate() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ date, name }: SaveDayAsTemplateInput): Promise<string> => {
      if (!user) throw new Error('Not authenticated')

      const [linesRes, blocksRes] = await Promise.all([
        supabase.from('ns_lines').select('*').eq('user_id', user.id).eq('date', date),
        supabase.from('ns_blocks').select('*').eq('user_id', user.id).eq('date', date),
      ])
      if (linesRes.error) throw linesRes.error
      if (blocksRes.error) throw blocksRes.error

      type Draft = {
        kind: TemplateItemKind
        label: string
        startTime: string
        endTime: string | null
        colour: string | null
      }

      const lineDrafts: Draft[] = (linesRes.data ?? []).map(r => ({
        kind: 'line',
        label: r.label as string,
        startTime: normTime(r.time),
        endTime: null,
        colour: (r.colour as string | null) ?? null,
      }))
      const blockDrafts: Draft[] = (blocksRes.data ?? []).map(r => ({
        kind: 'block',
        label: r.name as string,
        startTime: normTime(r.start_time),
        endTime: normTime(r.end_time),
        colour: (r.colour as string | null) ?? null,
      }))

      // Chronological order, same as the day itself reads top to bottom --
      // not creation order, which would be arbitrary here.
      const drafts = [...lineDrafts, ...blockDrafts].sort((a, b) => a.startTime.localeCompare(b.startTime))

      const position = await nextTemplatePosition(user.id)
      const { data: tmpl, error: tmplErr } = await supabase
        .from('ns_day_templates')
        .insert({ user_id: user.id, name, position })
        .select('id')
        .single()
      if (tmplErr) throw tmplErr
      const templateId = tmpl.id as string

      if (drafts.length > 0) {
        const rows = drafts.map((d, i) => ({
          user_id:     user.id,
          template_id: templateId,
          kind:        d.kind,
          label:       d.label,
          start_time:  d.startTime,
          end_time:    d.kind === 'block' ? d.endTime : null,
          colour:      d.colour,
          position:    i,
        }))
        const { error: itemsErr } = await supabase.from('ns_day_template_items').insert(rows)
        if (itemsErr) {
          // Roll back the just-created template row rather than leaving a
          // silent orphaned empty template behind -- best-effort: if the
          // compensating delete itself fails, surface the original insert
          // error either way, we don't want to mask it with the cleanup one.
          await supabase.from('ns_day_templates').delete().eq('id', templateId).eq('user_id', user.id)
          throw itemsErr
        }
      }

      return templateId
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ns_day_templates'] }),
  })
}
