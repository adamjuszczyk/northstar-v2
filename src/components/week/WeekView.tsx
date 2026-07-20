import { useState, type CSSProperties } from 'react'
import { format, parseISO, addDays, isToday } from 'date-fns'
import { useWeekFocus, useCreateWeekFocus, useCreateWeekFocusMany, useToggleWeekFocus, useDeleteWeekFocus } from '../../hooks/useWeekFocus'
import type { WeekFocusItem } from '../../hooks/useWeekFocus'
import { usePullWeekFocusToDay } from '../../hooks/useDayItems'
import { useRangeDayItems, groupByDate, maxPriority } from '../../hooks/useDayItemsSummary'
import type { DayItemSummaryRow } from '../../hooks/useDayItemsSummary'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import { useHabits } from '../../hooks/useHabits'
import { useSettings } from '../../hooks/useSettings'
import { weekDisplayStart, weekStart as computeWeekStart, todayISO } from '../../lib/dates'
import FocusItemForm from '../planner/FocusItemForm'
import styles from './WeekView.module.css'

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const MAX_SHOWN  = 3   // max anchored items before "+N more"

// ── Priority accent helpers ────────────────────────────────────────────────────

function priorityBorderVar(p: 'high' | 'medium' | 'low' | null): string {
  if (p === 'high')   return '--ns-gold-rgb'
  if (p === 'low')    return '--ns-task-accent-rgb'
  if (p === 'medium') return '--ns-project-accent-rgb'
  return '--ns-border-faint'
}

// ── Title resolution ─────────────────────────────────────────────────────────

/** Never falls back to a bare source glyph — resolves the real title. */
function resolveEventTitle(
  item:     DayItemSummaryRow,
  nodeMap:  Map<string, { title: string }>,
  inboxMap: Map<string, { content: string }>,
  habitMap: Map<string, { name: string }>,
): string {
  if (item.title) return item.title
  if (item.treeNodeId)  return nodeMap.get(item.treeNodeId)?.title ?? 'Untitled'
  if (item.inboxItemId) return inboxMap.get(item.inboxItemId)?.content ?? 'Untitled'
  if (item.habitId)     return habitMap.get(item.habitId)?.name ?? 'Untitled'
  return 'Untitled'
}

// ── Day column ─────────────────────────────────────────────────────────────────

interface DayColProps {
  date:     Date
  items:    DayItemSummaryRow[]
  nodeMap:  Map<string, { title: string }>
  inboxMap: Map<string, { content: string }>
  habitMap: Map<string, { name: string }>
  onSelect: () => void
}

function DayCol({ date, items, nodeMap, inboxMap, habitMap, onSelect }: DayColProps) {
  const dateStr  = format(date, 'yyyy-MM-dd')
  const dayNum   = format(date, 'd')
  const isNow    = isToday(date)
  const anchored = items.filter(i => i.startTime !== null)
  const floating = items.filter(i => i.startTime === null)
  const prio     = maxPriority(items)
  const accentRgb = priorityBorderVar(prio)

  const shown = anchored.slice(0, MAX_SHOWN)
  const extra = anchored.length - shown.length

  return (
    <button
      className={`${styles.dayCol}${isNow ? ' ' + styles.dayColToday : ''}`}
      style={{ '--day-accent-rgb': `var(${accentRgb})` } as CSSProperties}
      onClick={onSelect}
      aria-label={`Open ${format(date, 'd MMMM')}`}
    >
      <div className={styles.dayHead}>
        <span className={styles.dayName}>{DAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1]}</span>
        <span className={`${styles.dayNum}${isNow ? ' ' + styles.dayNumToday : ''}`}>{dayNum}</span>
      </div>

      <div className={styles.dayBody}>
        {shown.map(item => (
          <div key={item.id} className={styles.dayEvent}>
            <span className={styles.dayEventTime}>{item.startTime!.slice(0, 5)}</span>
            <span className={styles.dayEventTitle}>
              {resolveEventTitle(item, nodeMap, inboxMap, habitMap)}
            </span>
          </div>
        ))}
        {extra > 0 && (
          <span className={styles.dayMore}>+{extra} more</span>
        )}
        {floating.length > 0 && (
          <span className={styles.dayFloating}>
            {floating.length} task{floating.length > 1 ? 's' : ''}
          </span>
        )}
        {items.length === 0 && (
          <span className={styles.dayEmpty}>—</span>
        )}
      </div>

      {dateStr === format(new Date(), 'yyyy-MM-dd') && (
        <div className={styles.todayPip} />
      )}
    </button>
  )
}

// ── Focus item row ─────────────────────────────────────────────────────────────

interface FocusRowProps {
  item:        WeekFocusItem
  displayTitle: string
  onToggle:    () => void
  onDelete:    () => void
  isPending:   boolean
  /** When provided, renders the Feature 3/4 pulled-day indicator + pull action
   *  (used only by the standalone "Tasks this week" section). */
  pulledDates?: string[]
  onPull?:      () => void
  canPull?:     boolean
}

function FocusRow({
  item, displayTitle, onToggle, onDelete, isPending, pulledDates, onPull, canPull,
}: FocusRowProps) {
  const sourceLabel =
    item.source === 'tree'       ? '✦ GOAL TREE'  :
    item.source === 'inbox'      ? '⌵ FROM INBOX' :
    item.source === 'habit'      ? '◆ HABIT'      :
                                    '• STANDALONE'

  const showPullControls = pulledDates !== undefined
  const isPulled = (pulledDates?.length ?? 0) > 0
  const dayLabels = (pulledDates ?? [])
    .map(d => format(parseISO(d), 'EEE').toUpperCase())
    .join(', ')

  return (
    <div className={`${styles.focusRow}${item.isComplete ? ' ' + styles.focusRowDone : ''}`}>
      <button
        className={`${styles.check}${item.isComplete ? ' ' + styles.checkDone : ''}`}
        onClick={onToggle}
        disabled={isPending}
        aria-label={item.isComplete ? 'Mark incomplete' : 'Mark complete'}
      >
        {item.isComplete ? '✓' : ''}
      </button>
      <div className={styles.focusContent}>
        <span className={`${styles.focusTitle}${item.isComplete ? ' ' + styles.focusTitleDone : ''}`}>
          {displayTitle}
        </span>
        <span className={styles.focusSource}>{sourceLabel}</span>
      </div>
      {showPullControls && (
        isPulled ? (
          <span className={styles.pulledTag}>→ {dayLabels}</span>
        ) : (
          <button
            className={styles.pullBtn}
            onClick={onPull}
            disabled={isPending || !canPull}
            title={canPull ? undefined : "Today isn't in this week"}
          >
            + Pull to today
          </button>
        )
      )}
      <button
        className={styles.deleteBtn}
        onClick={onDelete}
        disabled={isPending}
        aria-label="Remove"
      >✕</button>
    </div>
  )
}

// ── Standalone task quick-add ───────────────────────────────────────────────────

interface QuickAddProps {
  placeholder: string
  onAdd:       (title: string) => void
  isPending:   boolean
}

function TaskQuickAdd({ placeholder, onAdd, isPending }: QuickAddProps) {
  const [value, setValue] = useState('')

  function submit() {
    const trimmed = value.trim()
    if (!trimmed || isPending) return
    onAdd(trimmed)
    setValue('')
  }

  return (
    <div className={styles.quickAddRow}>
      <input
        className={styles.quickAddInput}
        placeholder={placeholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        disabled={isPending}
      />
      <button
        className={styles.quickAddBtn}
        onClick={submit}
        disabled={isPending || !value.trim()}
      >+ Add</button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  weekStart:   string
  onDaySelect: (date: string) => void
}

export default function WeekView({ weekStart, onDaySelect }: Props) {
  const [formOpen, setFormOpen] = useState(false)

  const { settings } = useSettings()
  // weekStart is the canonical Monday key (used for focus queries/mutations).
  // displayStart shifts it back a day for Sunday-first display only — the
  // grid still represents the same underlying week.
  const displayStart = weekDisplayStart(weekStart, settings.weekStartsOn)
  const weekEnd = format(addDays(parseISO(displayStart), 6), 'yyyy-MM-dd')

  const { data: rawItems   = [], isLoading: loadingItems } = useRangeDayItems(displayStart, weekEnd)
  const { data: focusItems = [], isLoading: loadingFocus } = useWeekFocus(weekStart)
  const { data: treeNodes  = [] } = useTreeNodes()
  const { data: inboxItems = [] } = useInboxItems()
  const { data: habits     = [] } = useHabits()

  const { mutate: createFocus,     isPending: creating     } = useCreateWeekFocus()
  const { mutate: createFocusMany, isPending: creatingMany } = useCreateWeekFocusMany()
  const { mutate: toggleFocus, isPending: toggling  } = useToggleWeekFocus()
  const { mutate: deleteFocus, isPending: deleting  } = useDeleteWeekFocus()
  const { mutate: pullToDay,   isPending: pulling    } = usePullWeekFocusToDay()
  const isPending = creating || creatingMany || toggling || deleting || pulling

  const nodeMap   = new Map(treeNodes.map(n => [n.id, n]))
  const inboxMap  = new Map(inboxItems.map(i => [i.id, i]))
  const habitMap  = new Map(habits.map(h => [h.id, h]))
  const byDate    = groupByDate(rawItems)

  const days = Array.from({ length: 7 }, (_, i) => addDays(parseISO(displayStart), i))

  // Features 3/4: standalone tasks live in their own "Tasks this week"
  // section, separate from tree/inbox/habit items in "Weekly focus".
  const treeFocusItems = focusItems.filter(i => i.source !== 'standalone')
  const taskItems      = focusItems.filter(i => i.source === 'standalone')

  // focusId → dates it's been pulled to this week (origin_week_focus_id link).
  const pulledMap = new Map<string, string[]>()
  for (const item of rawItems) {
    if (!item.originWeekFocusId) continue
    const list = pulledMap.get(item.originWeekFocusId)
    if (list) list.push(item.date)
    else pulledMap.set(item.originWeekFocusId, [item.date])
  }
  const todayInThisWeek = computeWeekStart(todayISO()) === weekStart

  function displayTitle(item: WeekFocusItem): string {
    if (item.title) return item.title
    if (item.treeNodeId) return nodeMap.get(item.treeNodeId)?.title ?? '(untitled)'
    if (item.habitId) return habitMap.get(item.habitId)?.name ?? '(untitled)'
    if (item.inboxItemId) return inboxMap.get(item.inboxItemId)?.content ?? '(untitled)'
    return '(untitled)'
  }

  function handleSaveStandalone(title: string) {
    createFocus(
      { weekStart, source: 'standalone', title },
      { onSuccess: () => setFormOpen(false) },
    )
  }

  function handleSaveTree(treeNodeIds: string[]) {
    createFocusMany(
      { weekStart, treeNodeIds },
      { onSuccess: () => setFormOpen(false) },
    )
  }

  function handleAddTask(title: string) {
    createFocus({ weekStart, source: 'standalone', title })
  }

  function handlePullTask(item: WeekFocusItem) {
    pullToDay({
      weekFocusId: item.id,
      date:        todayISO(),
      source:      item.source,
      title:       item.title,
      treeNodeId:  item.treeNodeId,
      inboxItemId: item.inboxItemId,
      habitId:     item.habitId,
    })
  }

  const focusedNodeIds = new Set(
    focusItems.filter(i => i.treeNodeId).map(i => i.treeNodeId as string)
  )

  const isLoading = loadingItems || loadingFocus

  return (
    <div className={styles.page}>

      {/* 7-day grid */}
      <div className={styles.gridWrap}>
        {isLoading ? (
          <div className={styles.loading}><span className={styles.loadingStar}>✦</span></div>
        ) : (
          <div className={styles.grid}>
            {days.map(date => {
              const dateStr = format(date, 'yyyy-MM-dd')
              return (
                <DayCol
                  key={dateStr}
                  date={date}
                  items={byDate.get(dateStr) ?? []}
                  nodeMap={nodeMap}
                  inboxMap={inboxMap}
                  habitMap={habitMap}
                  onSelect={() => onDaySelect(dateStr)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Weekly focus list — tree/inbox/habit items pulled into the week */}
      <div className={styles.focusSection}>
        <div className={styles.focusHeader}>
          <span className={styles.focusDot} />
          <span className={styles.focusTitle}>WEEKLY FOCUS</span>
          <span className={styles.focusCount}>· {treeFocusItems.length}</span>
          <button className={styles.addBtn} onClick={() => setFormOpen(true)}>+ Add</button>
        </div>

        {treeFocusItems.length === 0 && !isLoading && (
          <p className={styles.emptyHint}>
            Nothing flagged for this week — pull from your tree.
          </p>
        )}

        <div className={styles.focusList}>
          {treeFocusItems.map(item => (
            <FocusRow
              key={item.id}
              item={item}
              displayTitle={displayTitle(item)}
              isPending={isPending}
              onToggle={() => toggleFocus({
                id: item.id, weekStart, source: item.source,
                treeNodeId: item.treeNodeId, isComplete: !item.isComplete,
              })}
              onDelete={() => {
                if (!window.confirm(`Remove "${displayTitle(item)}" from this week?`)) return
                deleteFocus({ id: item.id, weekStart, source: item.source, inboxItemId: item.inboxItemId })
              }}
            />
          ))}
        </div>
      </div>

      {/* Tasks this week — standalone, title-only, no tree link (Feature 4) */}
      <div className={styles.focusSection}>
        <div className={styles.focusHeader}>
          <span className={styles.focusDot} />
          <span className={styles.focusTitle}>TASKS THIS WEEK</span>
          <span className={styles.focusCount}>· {taskItems.length}</span>
        </div>

        <TaskQuickAdd
          placeholder="Add a task for this week…"
          onAdd={handleAddTask}
          isPending={creating}
        />

        {taskItems.length === 0 && !isLoading && (
          <p className={styles.emptyHint}>No standalone tasks yet.</p>
        )}

        <div className={styles.focusList}>
          {taskItems.map(item => (
            <FocusRow
              key={item.id}
              item={item}
              displayTitle={displayTitle(item)}
              isPending={isPending}
              pulledDates={pulledMap.get(item.id) ?? []}
              canPull={todayInThisWeek}
              onPull={() => handlePullTask(item)}
              onToggle={() => toggleFocus({
                id: item.id, weekStart, source: item.source,
                treeNodeId: item.treeNodeId, isComplete: !item.isComplete,
              })}
              onDelete={() => {
                if (!window.confirm(`Remove "${displayTitle(item)}" from this week?`)) return
                deleteFocus({ id: item.id, weekStart, source: item.source, inboxItemId: item.inboxItemId })
              }}
            />
          ))}
        </div>
      </div>

      {formOpen && (
        <FocusItemForm
          label="ADD WEEKLY FOCUS"
          onClose={() => setFormOpen(false)}
          onSaveStandalone={handleSaveStandalone}
          onSaveTree={handleSaveTree}
          isSaving={creating || creatingMany}
          focusedNodeIds={focusedNodeIds}
          focusLabel="this week"
        />
      )}
    </div>
  )
}
