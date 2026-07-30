import { useState, useEffect, useMemo } from 'react'
import {
  useCreateDayItem, useCreateDayItems, useAddInboxToDay, useAddInboxItemsToDay,
  useDayItems, useSplitDayItemToNewSlot, usePullWeekFocusToDay, usePullMonthFocusToDay,
  timeToDecimal,
} from '../../hooks/useDayItems'
import type { DayItemPriority, RawDayItem } from '../../hooks/useDayItems'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import { useHabits } from '../../hooks/useHabits'
import { useBlocks } from '../../hooks/useBlocks'
import type { Block } from '../../hooks/useBlocks'
import { useTasksByIds, resolveTaskTitle } from '../../hooks/useTasks'
import { useWeekFocus } from '../../hooks/useWeekFocus'
import type { WeekFocusItem, FocusSource } from '../../hooks/useWeekFocus'
import { useMonthFocus } from '../../hooks/useMonthFocus'
import type { MonthFocusItem } from '../../hooks/useMonthFocus'
import { weekStart, monthStart } from '../../lib/dates'
import { BLOCK_COLOURS } from '../../lib/blockColours'
import TreeNodePicker from '../pickers/TreeNodePicker'
import SplitPrompt from './SplitPrompt'
import { useT } from '../../i18n'
import styles from './DayItemForm.module.css'

type Source = 'standalone' | 'tree' | 'inbox' | 'habit' | 'weekmonth'

/**
 * Shared time-anchor validation for DayItemForm and DayItemEditForm.
 * Enforces: an end time can only be set alongside a start time, and end
 * must come strictly after start. Returns an error message, or null if valid.
 * `t` is the caller's own `useT()` translator — this isn't a component/hook
 * itself, so it can't call useT() directly; callers pass theirs through.
 */
export function validateTimeRange(
  t:         ReturnType<typeof useT>,
  hasTime:   boolean,
  startTime: string,
  endTime:   string,
): string | null {
  if (!hasTime) return null
  if (endTime && !startTime) return t('day.startTimeRequiredError')
  if (startTime && endTime && timeToDecimal(endTime) <= timeToDecimal(startTime)) {
    return t('day.endTimeAfterStartError')
  }
  return null
}

interface Props {
  date:    string
  onClose: () => void
}

/** A form field snapshot taken at submit time — reused unchanged if a
 *  SplitPrompt confirmation is needed in between, so the eventual create/
 *  split calls always match what the user saw when they hit Add. */
interface FieldSnapshot {
  startTime: string | null
  endTime:   string | null
  priority:  DayItemPriority
  colour:    string | null
  blockId:   string | null
}

interface PendingSplit {
  tab:       'tree' | 'habit'
  newIds:    string[]
  conflicts: { id: string; item: RawDayItem; label: string }[]
  snapshot:  FieldSnapshot
}

export default function DayItemForm({ date, onClose }: Props) {
  const t = useT()
  const [source,      setSource]      = useState<Source>('standalone')
  const [title,       setTitle]       = useState('')
  const [hasTime,     setHasTime]     = useState(false)
  const [startTime,   setStartTime]   = useState('')
  const [endTime,     setEndTime]     = useState('')
  const [treeNodeIds, setTreeNodeIds] = useState<Set<string>>(new Set())
  const [inboxIds,    setInboxIds]    = useState<Set<string>>(new Set())
  const [habitIds,    setHabitIds]    = useState<Set<string>>(new Set())
  const [wmScope,     setWmScope]     = useState<'week' | 'month'>('week')
  const [weekIds,     setWeekIds]     = useState<Set<string>>(new Set())
  const [monthIds,    setMonthIds]    = useState<Set<string>>(new Set())
  const [priority,    setPriority]    = useState<DayItemPriority>('medium')
  const [colour,      setColour]      = useState<string | null>(null)
  const [blockId,     setBlockId]     = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [pendingSplit, setPendingSplit] = useState<PendingSplit | null>(null)

  const { mutate: createItem,    isPending: creating    } = useCreateDayItem()
  const { mutate: createItems, mutateAsync: createItemsAsync, isPending: creatingMany } = useCreateDayItems()
  const { mutate: addFromInbox,  isPending: addingInbox  } = useAddInboxToDay()
  const { mutate: addManyInbox,  isPending: addingInboxMany } = useAddInboxItemsToDay()
  const { mutateAsync: splitItemAsync, isPending: splitting } = useSplitDayItemToNewSlot()
  const { mutateAsync: pullWeekAsync,  isPending: pullingWeek  } = usePullWeekFocusToDay()
  const { mutateAsync: pullMonthAsync, isPending: pullingMonth } = usePullMonthFocusToDay()
  const { data: treeNodes    = [] } = useTreeNodes()
  const { data: inboxItems   = [] } = useInboxItems()
  const { data: habits       = [] } = useHabits()
  const { data: blocksForDay = [] } = useBlocks(date)
  const { data: existingDayItems = [] } = useDayItems(date)

  const wkStart = weekStart(date)
  const moStart = monthStart(date)
  const { data: weekFocusItems  = [] } = useWeekFocus(wkStart)
  const { data: monthFocusItems = [] } = useMonthFocus(moStart)

  // Materialized items on today's list still need their linked task's tree
  // node resolved — their own treeNodeId is null (identity resolves through
  // the task) — so split-conflict detection below can spot "already on this
  // day" for a tree node that's only reachable through a task. Week/month
  // focus items that are themselves task-linked (the Tasks-section
  // find-or-create pattern) need the same resolution for display titles on
  // the Week/Month tab — fetched together, one query, one shared map.
  const materializedTaskIds = Array.from(new Set(
    existingDayItems.filter(i => i.taskId).map(i => i.taskId as string)
  ))
  const focusTaskIds = Array.from(new Set(
    [...weekFocusItems, ...monthFocusItems].filter(i => i.taskId).map(i => i.taskId as string)
  ))
  const taskIdsToFetch = Array.from(new Set([...materializedTaskIds, ...focusTaskIds]))
  const { data: materializedTasks = [] } = useTasksByIds(taskIdsToFetch)
  const taskById = new Map(materializedTasks.map(task => [task.id, task]))

  const nodeMap  = useMemo(() => new Map(treeNodes.map(n => [n.id, n])),  [treeNodes])
  const inboxMap = useMemo(() => new Map(inboxItems.map(i => [i.id, i])), [inboxItems])
  const habitMap = useMemo(() => new Map(habits.map(h => [h.id, h])),     [habits])

  function focusSourceTag(source: FocusSource): string {
    switch (source) {
      case 'standalone': return t('day.focusTagTask')
      case 'tree':        return t('day.focusTagGoal')
      case 'inbox':        return t('day.focusTagInbox')
      case 'habit':         return t('day.focusTagHabit')
    }
  }

  function focusDisplayTitle(item: WeekFocusItem | MonthFocusItem): string {
    const untitled = t('common.untitled')
    if (item.taskId) {
      const task = taskById.get(item.taskId)
      return task ? resolveTaskTitle(task, nodeMap, inboxMap, habitMap, t) : (item.title ?? untitled)
    }
    if (item.title) return item.title
    if (item.treeNodeId)  return nodeMap.get(item.treeNodeId)?.title    ?? untitled
    if (item.habitId)     return habitMap.get(item.habitId)?.name      ?? untitled
    if (item.inboxItemId) return inboxMap.get(item.inboxItemId)?.content ?? untitled
    return untitled
  }

  // Focus item ids already pulled onto this exact date, via the origin FKs
  // migration_10 added — the "already added" gate for the Week/Month tab,
  // same grain as the tree/habit tabs' own "already on today" checks below.
  const pulledWeekFocusIds  = new Set(existingDayItems.filter(i => i.originWeekFocusId).map(i => i.originWeekFocusId as string))
  const pulledMonthFocusIds = new Set(existingDayItems.filter(i => i.originMonthFocusId).map(i => i.originMonthFocusId as string))

  const isPending = creating || creatingMany || addingInbox || addingInboxMany || splitting || pullingWeek || pullingMonth
  // Only Tasks are schedulable — Notes never appear in any scheduling picker.
  const unassignedInbox = inboxItems.filter(i => i.state === 'unassigned' && i.kind === 'task')

  // refId → the existing occurrence today that already represents it — used
  // for the picker's "already in today" indicator on both tabs, and for
  // split-conflict detection on submit (SPEC §5.3: "adding it again offers
  // Split") for tree specifically. Habits no longer reach that conflict
  // branch (SPEC §4.4, revised again — Split pulled back for habits): an
  // already-focused habit row is unselectable (below), so habitRefMap now
  // only feeds that "already added" state, not an actual Split offer.
  // Inbox items already move to state='scheduled' once added, so they
  // can't conflict through their tab either way.
  const treeRefMap  = new Map<string, RawDayItem>()
  const habitRefMap = new Map<string, RawDayItem>()
  for (const it of existingDayItems) {
    if (it.treeNodeId) treeRefMap.set(it.treeNodeId, it)
    if (it.habitId)    habitRefMap.set(it.habitId, it)
    if (it.taskId) {
      const task = taskById.get(it.taskId)
      if (task?.treeNodeId) treeRefMap.set(task.treeNodeId, it)
      if (task?.habitId)    habitRefMap.set(task.habitId, it)
    }
  }
  const focusedNodeIds  = new Set(treeRefMap.keys())
  const focusedHabitIds = new Set(habitRefMap.keys())

  function toggleTreeNode(id: string) {
    setTreeNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleInboxItem(id: string) {
    setInboxIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleHabit(id: string) {
    setHabitIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSet(next)
  }

  useEffect(() => {
    setTreeNodeIds(new Set())
    setInboxIds(new Set())
    setHabitIds(new Set())
    setWeekIds(new Set())
    setMonthIds(new Set())
    setWmScope('week')
    setTitle('')
    setHasTime(false)
    setStartTime('')
    setEndTime('')
    setError(null)
    setPriority('medium')
    setColour(null)
    setBlockId(null)
  }, [source])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function isValid(): boolean {
    if (validateTimeRange(t, hasTime, startTime, endTime)) return false
    if (source === 'standalone') return title.trim().length > 0
    if (source === 'tree')       return treeNodeIds.size > 0
    if (source === 'inbox')      return inboxIds.size > 0
    if (source === 'habit')      return habitIds.size > 0
    if (source === 'weekmonth')  return weekIds.size + monthIds.size > 0
    return false
  }

  /** Splits selected ids into ones that aren't on today's list yet vs ones
   *  that already have an occurrence today (SPEC §5.3: adding an
   *  already-scheduled task again offers Split instead of a duplicate). */
  function partitionSelection(ids: string[], refMap: Map<string, RawDayItem>) {
    const newIds: string[] = []
    const conflicts: { id: string; item: RawDayItem }[] = []
    for (const id of ids) {
      const existing = refMap.get(id)
      if (existing) conflicts.push({ id, item: existing })
      else newIds.push(id)
    }
    return { newIds, conflicts }
  }

  async function handleSubmit() {
    if (isPending) return
    const timeError = validateTimeRange(t, hasTime, startTime, endTime)
    if (timeError) { setError(timeError); return }
    if (!isValid()) return
    setError(null)
    const onError = (e: unknown) => setError((e as Error).message)
    const snapshot: FieldSnapshot = {
      startTime: hasTime && startTime ? startTime : null,
      endTime:   hasTime && endTime   ? endTime   : null,
      priority, colour, blockId,
    }

    if (source === 'weekmonth') {
      try {
        for (const id of weekIds) {
          const item = weekFocusItems.find(i => i.id === id)
          if (!item) continue
          await pullWeekAsync({
            weekFocusId: item.id, date, source: item.source,
            title: item.title, treeNodeId: item.treeNodeId,
            inboxItemId: item.inboxItemId, habitId: item.habitId,
            taskId: item.taskId, isComplete: item.isComplete,
            ...snapshot,
          })
        }
        for (const id of monthIds) {
          const item = monthFocusItems.find(i => i.id === id)
          if (!item) continue
          await pullMonthAsync({
            monthFocusId: item.id, date, source: item.source,
            title: item.title, treeNodeId: item.treeNodeId,
            inboxItemId: item.inboxItemId, habitId: item.habitId,
            taskId: item.taskId, isComplete: item.isComplete,
            ...snapshot,
          })
        }
        onClose()
      } catch (e) {
        onError(e)
      }
      return
    }

    if (source === 'standalone') {
      createItem({
        date, source: 'standalone',
        title: title.trim(),
        ...snapshot,
      }, { onSuccess: onClose, onError })
      return
    }

    if (source === 'inbox') {
      addManyInbox(
        { inboxItemIds: Array.from(inboxIds), date, priority, colour, blockId },
        { onSuccess: onClose, onError },
      )
      return
    }

    // tree / habit — both have a re-selectable list. Tree still has full
    // split support (SPEC §5.3). Habits no longer do (SPEC §4.4, revised
    // again — Split pulled back for habits specifically, Task Lists
    // stayed): an already-focused habit row is disabled above, so `ids`
    // for the habit tab can't actually contain a conflict in practice.
    // This generic conflict-handling path is left otherwise untouched
    // rather than narrowed to tree-only — a safety net, not dead code, in
    // case that UI-level guard is ever bypassed. Inbox items already move
    // to state='scheduled' once added, so unassignedInbox above already
    // excludes anything that could conflict there — inbox never reaches
    // this branch either.
    const tab    = source as 'tree' | 'habit'
    const ids    = tab === 'tree' ? Array.from(treeNodeIds) : Array.from(habitIds)
    const refMap = tab === 'tree' ? treeRefMap : habitRefMap
    const { newIds, conflicts } = partitionSelection(ids, refMap)

    if (conflicts.length === 0) {
      createItems(
        ids.map(id => ({
          date, source: tab,
          treeNodeId: tab === 'tree'  ? id : undefined,
          habitId:    tab === 'habit' ? id : undefined,
          ...snapshot,
        })),
        { onSuccess: onClose, onError },
      )
      return
    }

    setPendingSplit({
      tab, newIds, snapshot,
      conflicts: conflicts.map(c => ({
        ...c,
        label: tab === 'tree'
          ? (treeNodes.find(n => n.id === c.id)?.title ?? t('common.untitled'))
          : (habits.find(h => h.id === c.id)?.name ?? t('common.untitled')),
      })),
    })
  }

  async function handleConfirmSplit() {
    if (!pendingSplit) return
    setError(null)
    try {
      if (pendingSplit.newIds.length > 0) {
        await createItemsAsync(
          pendingSplit.newIds.map(id => ({
            date, source: pendingSplit.tab,
            treeNodeId: pendingSplit.tab === 'tree'  ? id : undefined,
            habitId:    pendingSplit.tab === 'habit' ? id : undefined,
            ...pendingSplit.snapshot,
          })),
        )
      }
      for (const c of pendingSplit.conflicts) {
        await splitItemAsync({ date, existingItem: c.item, ...pendingSplit.snapshot })
      }
      setPendingSplit(null)
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setPendingSplit(null)
    }
  }

  function handleCancelSplit() {
    setPendingSplit(null)
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  const selectedCount =
    source === 'tree'      ? treeNodeIds.size :
    source === 'inbox'     ? inboxIds.size    :
    source === 'habit'     ? habitIds.size    :
    source === 'weekmonth' ? weekIds.size + monthIds.size : 0
  const addLabel = isPending
    ? t('common.pendingEllipsis')
    : selectedCount > 0 ? t('common.addItemsCount', { n: selectedCount, count: selectedCount }) : t('day.addToDay')

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">

        <div className={styles.header}>
          <span className={styles.modeLabel}>{t('day.header')}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className={styles.sourceTabs}>
          {(['standalone', 'tree', 'inbox', 'habit', 'weekmonth'] as Source[]).map(s => (
            <button
              key={s}
              className={`${styles.sourceTab}${source === s ? ' ' + styles.sourceTabActive : ''}`}
              onClick={() => setSource(s)}
            >
              {s === 'standalone' ? t('day.tabNewItem')
                : s === 'tree'    ? t('day.tabFromTree')
                : s === 'inbox'   ? t('day.tabFromInbox')
                : s === 'habit'   ? t('day.tabFromHabits')
                :                   t('day.tabWeekMonth')}
            </button>
          ))}
        </div>

        {source === 'standalone' && (
          <div className={styles.body}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="di-title">{t('day.fieldLabelTitle')}</label>
              <input
                id="di-title"
                className={styles.input}
                placeholder={t('day.titlePlaceholder')}
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                autoFocus
              />
            </div>
            <TimeSection hasTime={hasTime} setHasTime={setHasTime}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime} />
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('day.fieldLabelPriority')}</span>
              <PriorityPicker priority={priority} onChange={setPriority} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('day.colourLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
              <ColourPicker colour={colour} onChange={setColour} />
            </div>
            {blocksForDay.length > 0 && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{t('day.blockLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
                <BlockPicker blocks={blocksForDay} blockId={blockId} onChange={setBlockId} />
              </div>
            )}
          </div>
        )}

        {source === 'tree' && (
          <div className={styles.body}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('day.goalTreeNodesLabel')}</span>
              <TreeNodePicker
                nodes={treeNodes}
                selectedIds={treeNodeIds}
                onToggleSelect={toggleTreeNode}
                focusedNodeIds={focusedNodeIds}
                focusLabel={t('day.treeFocusLabelToday')}
              />
            </div>
            <TimeSection hasTime={hasTime} setHasTime={setHasTime}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime} />
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('day.fieldLabelPriority')}</span>
              <PriorityPicker priority={priority} onChange={setPriority} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('day.colourLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
              <ColourPicker colour={colour} onChange={setColour} />
            </div>
            {blocksForDay.length > 0 && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{t('day.blockLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
                <BlockPicker blocks={blocksForDay} blockId={blockId} onChange={setBlockId} />
              </div>
            )}
          </div>
        )}

        {source === 'inbox' && (
          <div className={styles.body}>
            <div className={styles.pickerHeaderRow}>
              <p className={styles.fieldLabel}>{t('day.unassignedInboxLabel')}</p>
              {inboxIds.size > 0 && <span className={styles.selectedCount}>{t('day.selectedCount', { n: inboxIds.size })}</span>}
            </div>
            <div className={styles.nodeList}>
              {unassignedInbox.length === 0 && <p className={styles.emptyHint}>{t('day.emptyUnassignedInbox')}</p>}
              {unassignedInbox.map(item => {
                const selected = inboxIds.has(item.id)
                return (
                  <button
                    key={item.id}
                    className={`${styles.inboxRow}${selected ? ' ' + styles.inboxRowSelected : ''}`}
                    onClick={() => toggleInboxItem(item.id)}
                  >
                    <span className={`${styles.checkbox}${selected ? ' ' + styles.checkboxChecked : ''}`}>
                      {selected ? '✓' : ''}
                    </span>
                    <span className={styles.inboxContent}>{item.content}</span>
                  </button>
                )
              })}
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('day.fieldLabelPriority')}</span>
              <PriorityPicker priority={priority} onChange={setPriority} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('day.colourLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
              <ColourPicker colour={colour} onChange={setColour} />
            </div>
            {blocksForDay.length > 0 && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{t('day.blockLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
                <BlockPicker blocks={blocksForDay} blockId={blockId} onChange={setBlockId} />
              </div>
            )}
          </div>
        )}

        {source === 'habit' && (
          <div className={styles.body}>
            <div className={styles.pickerHeaderRow}>
              <p className={styles.fieldLabel}>{t('day.habitsLabel')}</p>
              {habitIds.size > 0 && <span className={styles.selectedCount}>{t('day.selectedCount', { n: habitIds.size })}</span>}
            </div>
            <div className={styles.nodeList}>
              {habits.length === 0 && <p className={styles.emptyHint}>{t('day.emptyHabits')}</p>}
              {habits.map(h => {
                const selected     = habitIds.has(h.id)
                // Split is pulled back for habits (SPEC §4.4, revised again)
                // — an already-scheduled habit can no longer be re-added to
                // offer Split, so it's just unselectable, same information
                // the "· today" hint already surfaced. Tree keeps the full
                // re-add → Split flow below, untouched.
                const alreadyToday = focusedHabitIds.has(h.id)
                return (
                  <button
                    key={h.id}
                    className={`${styles.nodeRow}${selected ? ' ' + styles.nodeRowSelected : ''}`}
                    onClick={() => toggleHabit(h.id)}
                    disabled={alreadyToday}
                    title={alreadyToday ? t('day.habitAlreadyTodayTitle') : undefined}
                  >
                    <span className={`${styles.checkbox}${selected ? ' ' + styles.checkboxChecked : ''}`}>
                      {selected ? '✓' : ''}
                    </span>
                    <span className={styles.nodeTypeDot} style={{ background: h.mode === 'build' ? 'var(--ns-ok)' : 'var(--ns-project-accent)' }} />
                    <span className={styles.nodeTitle}>{h.name}</span>
                    <span className={styles.nodeType}>
                      {h.mode}{alreadyToday ? t('day.alreadyAdded') : ''}
                    </span>
                  </button>
                )
              })}
            </div>
            <TimeSection hasTime={hasTime} setHasTime={setHasTime}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime} />
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('day.fieldLabelPriority')}</span>
              <PriorityPicker priority={priority} onChange={setPriority} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('day.colourLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
              <ColourPicker colour={colour} onChange={setColour} />
            </div>
            {blocksForDay.length > 0 && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{t('day.blockLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
                <BlockPicker blocks={blocksForDay} blockId={blockId} onChange={setBlockId} />
              </div>
            )}
          </div>
        )}

        {source === 'weekmonth' && (
          <div className={styles.body}>
            <div className={styles.wmScopeRow}>
              <button
                className={`${styles.sourceTab}${wmScope === 'week' ? ' ' + styles.sourceTabActive : ''}`}
                onClick={() => setWmScope('week')}
              >{weekIds.size > 0 ? t('day.tabThisWeekCount', { n: weekIds.size }) : t('day.tabThisWeek')}</button>
              <button
                className={`${styles.sourceTab}${wmScope === 'month' ? ' ' + styles.sourceTabActive : ''}`}
                onClick={() => setWmScope('month')}
              >{monthIds.size > 0 ? t('day.tabThisMonthCount', { n: monthIds.size }) : t('day.tabThisMonth')}</button>
            </div>

            {wmScope === 'week' && (
              <div className={styles.nodeList}>
                {weekFocusItems.length === 0 && <p className={styles.emptyHint}>{t('day.emptyWeekFocus')}</p>}
                {weekFocusItems.map(item => {
                  const selected     = weekIds.has(item.id)
                  const alreadyAdded = pulledWeekFocusIds.has(item.id)
                  return (
                    <button
                      key={item.id}
                      className={`${styles.inboxRow}${selected ? ' ' + styles.inboxRowSelected : ''}`}
                      onClick={() => toggle(weekIds, setWeekIds, item.id)}
                      disabled={alreadyAdded}
                      title={alreadyAdded ? t('day.alreadyAddedToDayTitle') : undefined}
                    >
                      <span className={`${styles.checkbox}${selected ? ' ' + styles.checkboxChecked : ''}`}>
                        {selected ? '✓' : ''}
                      </span>
                      <span className={styles.nodeType}>{focusSourceTag(item.source)}</span>
                      <span className={styles.inboxContent}>{focusDisplayTitle(item)}</span>
                      {alreadyAdded && <span className={styles.nodeType}>{t('day.alreadyAdded')}</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {wmScope === 'month' && (
              <div className={styles.nodeList}>
                {monthFocusItems.length === 0 && <p className={styles.emptyHint}>{t('day.emptyMonthFocus')}</p>}
                {monthFocusItems.map(item => {
                  const selected     = monthIds.has(item.id)
                  const alreadyAdded = pulledMonthFocusIds.has(item.id)
                  return (
                    <button
                      key={item.id}
                      className={`${styles.inboxRow}${selected ? ' ' + styles.inboxRowSelected : ''}`}
                      onClick={() => toggle(monthIds, setMonthIds, item.id)}
                      disabled={alreadyAdded}
                      title={alreadyAdded ? t('day.alreadyAddedToDayTitle') : undefined}
                    >
                      <span className={`${styles.checkbox}${selected ? ' ' + styles.checkboxChecked : ''}`}>
                        {selected ? '✓' : ''}
                      </span>
                      <span className={styles.nodeType}>{focusSourceTag(item.source)}</span>
                      <span className={styles.inboxContent}>{focusDisplayTitle(item)}</span>
                      {alreadyAdded && <span className={styles.nodeType}>{t('day.alreadyAdded')}</span>}
                    </button>
                  )
                })}
              </div>
            )}

            <TimeSection hasTime={hasTime} setHasTime={setHasTime}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime} />
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('day.fieldLabelPriority')}</span>
              <PriorityPicker priority={priority} onChange={setPriority} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('day.colourLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
              <ColourPicker colour={colour} onChange={setColour} />
            </div>
            {blocksForDay.length > 0 && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{t('day.blockLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
                <BlockPicker blocks={blocksForDay} blockId={blockId} onChange={setBlockId} />
              </div>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>{t('common.cancel')}</button>
          <button
            className={styles.saveBtn}
            onClick={handleSubmit}
            disabled={!isValid() || isPending}
          >
            {addLabel}
          </button>
        </div>

      </div>

      {pendingSplit && (
        <SplitPrompt
          items={pendingSplit.conflicts.map(c => ({ id: c.id, label: c.label }))}
          onConfirm={handleConfirmSplit}
          onCancel={handleCancelSplit}
          isPending={isPending}
        />
      )}
    </div>
  )
}

// ── Shared sub-components (exported for DayItemEditForm) ───────────────────────

export interface TimeSectionProps {
  hasTime:      boolean
  setHasTime:   (v: boolean) => void
  startTime:    string
  setStartTime: (v: string) => void
  endTime:      string
  setEndTime:   (v: string) => void
}

export function TimeSection({ hasTime, setHasTime, startTime, setStartTime, endTime, setEndTime }: TimeSectionProps) {
  const t = useT()
  return (
    <div className={styles.field}>
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          className={styles.toggleCheck}
          checked={hasTime}
          onChange={e => setHasTime(e.target.checked)}
        />
        <span className={styles.toggleLabel}>{t('day.anchorToTimeSlot')}</span>
      </label>
      {hasTime && (
        <div className={styles.timeRow}>
          <div className={styles.timeField}>
            <label className={styles.fieldLabelSm}>{t('day.startFieldLabel')}</label>
            <input
              type="time"
              className={styles.timeInput}
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles.timeField}>
            <label className={styles.fieldLabelSm}>{t('day.endOptionalLabel')}</label>
            <input
              type="time"
              className={styles.timeInput}
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export interface ColourPickerProps {
  colour:   string | null
  onChange: (c: string | null) => void
}

export function ColourPicker({ colour, onChange }: ColourPickerProps) {
  const t = useT()
  return (
    <div className={styles.colourRow}>
      <button
        type="button"
        className={`${styles.colourSwatch} ${styles.colourSwatchNone}${colour === null ? ' ' + styles.colourSwatchActive : ''}`}
        onClick={() => onChange(null)}
        title={t('day.colourNone')}
        aria-label={t('common.noColourLabel')}
      />
      {BLOCK_COLOURS.map(c => (
        <button
          key={c.hex}
          type="button"
          className={`${styles.colourSwatch}${colour === c.hex ? ' ' + styles.colourSwatchActive : ''}`}
          style={{ background: c.hex }}
          onClick={() => onChange(c.hex)}
          title={c.name}
          aria-label={colour === c.hex ? t('day.colourSwatchActiveAriaLabel', { name: c.name }) : t('day.colourSwatchAriaLabel', { name: c.name })}
        />
      ))}
    </div>
  )
}

export interface PriorityPickerProps {
  priority: DayItemPriority
  onChange: (p: DayItemPriority) => void
}

export function PriorityPicker({ priority, onChange }: PriorityPickerProps) {
  const t = useT()
  const opts: { value: DayItemPriority; label: string }[] = [
    { value: 'high',   label: t('day.priorityHigh') },
    { value: 'medium', label: t('day.priorityMedium') },
    { value: 'low',    label: t('day.priorityLow') },
  ]
  return (
    <div className={styles.priorityRow}>
      {opts.map(o => {
        const activeClass = priority === o.value
          ? o.value === 'high'   ? styles.priorityBtnActiveHigh
          : o.value === 'low'    ? styles.priorityBtnActiveLow
          :                        styles.priorityBtnActiveMed
          : ''
        return (
          <button
            key={o.value}
            type="button"
            className={`${styles.priorityBtn} ${activeClass}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export interface BlockPickerProps {
  blocks:  Block[]
  blockId: string | null
  onChange: (id: string | null) => void
}

export function BlockPicker({ blocks, blockId, onChange }: BlockPickerProps) {
  const t = useT()
  return (
    <div className={styles.blockRow}>
      <button
        type="button"
        className={`${styles.blockBtn}${blockId === null ? ' ' + styles.blockBtnActive : ''}`}
        onClick={() => onChange(null)}
      >
        {t('day.colourNone')}
      </button>
      {blocks.map(b => (
        <button
          key={b.id}
          type="button"
          className={`${styles.blockBtn}${blockId === b.id ? ' ' + styles.blockBtnActive : ''}`}
          onClick={() => onChange(b.id)}
        >
          {b.startTime}–{b.endTime} · {b.name}
        </button>
      ))}
    </div>
  )
}
