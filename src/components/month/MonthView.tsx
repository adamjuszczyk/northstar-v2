import { useState, type CSSProperties } from 'react'
import { format, parseISO, addDays, endOfMonth, getDay, isToday } from 'date-fns'
import { useMonthFocus, useCreateMonthFocus, useCreateMonthFocusMany, useToggleMonthFocus, useDeleteMonthFocus } from '../../hooks/useMonthFocus'
import type { MonthFocusItem } from '../../hooks/useMonthFocus'
import { usePullMonthFocusToDay } from '../../hooks/useDayItems'
import { useRangeDayItems, groupByDate, maxPriority } from '../../hooks/useDayItemsSummary'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import { useHabits } from '../../hooks/useHabits'
import { useSettings } from '../../hooks/useSettings'
import { monthStart as computeMonthStart, todayISO } from '../../lib/dates'
import FocusItemForm from '../planner/FocusItemForm'
import styles from './MonthView.module.css'

const DAY_NAMES_MON_FIRST = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const DAY_NAMES_SUN_FIRST = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// ── Priority accent helpers ────────────────────────────────────────────────────

function priorityRgbVar(p: 'high' | 'medium' | 'low' | null): string {
  if (p === 'high')   return '--ns-gold-rgb'
  if (p === 'medium') return '--ns-project-accent-rgb'
  if (p === 'low')    return '--ns-task-accent-rgb'
  return ''
}

// Build the grid: rows respect weekStartsOn, pad with null for out-of-month days
function buildCalendarGrid(monthStartISO: string, weekStartsOn: 0 | 1): (Date | null)[] {
  const first = parseISO(monthStartISO)
  const last  = endOfMonth(first)
  // getDay: 0=Sun…6=Sat. Mon-first: shift so Mon=0. Sun-first: already 0-based.
  const startPad = weekStartsOn === 1 ? (getDay(first) + 6) % 7 : getDay(first)

  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)

  let cur = first
  while (cur <= last) {
    cells.push(cur)
    cur = addDays(cur, 1)
  }
  const endPad = (7 - (cells.length % 7)) % 7
  for (let i = 0; i < endPad; i++) cells.push(null)
  return cells
}

// ── Day cell ───────────────────────────────────────────────────────────────────

interface DayCellProps {
  date:     Date
  items:    ReturnType<typeof groupByDate> extends Map<string, infer V> ? V : never
  onSelect: () => void
}

function DayCell({ date, items, onSelect }: DayCellProps) {
  const prio    = maxPriority(items)
  const isNow   = isToday(date)
  const dayNum  = format(date, 'd')

  const anchored = items.filter(i => i.startTime !== null)
  const floating = items.filter(i => i.startTime === null)

  const accentStyle = prio
    ? { '--day-accent-rgb': `var(${priorityRgbVar(prio)})` } as CSSProperties
    : undefined

  return (
    <button
      className={`${styles.dayCell}${isNow ? ' ' + styles.dayCellToday : ''}${items.length ? ' ' + styles.dayCellActive : ''}`}
      style={accentStyle}
      onClick={onSelect}
      aria-label={`Open ${format(date, 'd MMMM')}`}
    >
      <span className={`${styles.dayNum}${isNow ? ' ' + styles.dayNumToday : ''}`}>
        {dayNum}
      </span>

      {prio && (
        <span className={styles.prioBar} style={accentStyle} />
      )}

      {anchored.length > 0 && (
        <span className={styles.itemCount}>{anchored.length} anchored</span>
      )}
      {floating.length > 0 && (
        <span className={styles.floatCount}>{floating.length} task{floating.length > 1 ? 's' : ''}</span>
      )}
    </button>
  )
}

// ── Focus item row ─────────────────────────────────────────────────────────────

interface FocusRowProps {
  item:         MonthFocusItem
  displayTitle: string
  onToggle:     () => void
  onDelete:     () => void
  isPending:    boolean
  /** When provided, renders the Feature 3/5 pulled-day indicator + pull action
   *  (used only by the standalone "Tasks this month" section). */
  pulledDates?: string[]
  onPull?:      () => void
  canPull?:     boolean
}

function FocusRow({
  item, displayTitle, onToggle, onDelete, isPending, pulledDates, onPull, canPull,
}: FocusRowProps) {
  const sourceLabel =
    item.source === 'tree'  ? '✦ GOAL TREE'  :
    item.source === 'inbox' ? '⌵ FROM INBOX' :
    item.source === 'habit' ? '◆ HABIT'      :
                               '• STANDALONE'

  const showPullControls = pulledDates !== undefined
  const isPulled = (pulledDates?.length ?? 0) > 0
  const dayLabels = (pulledDates ?? [])
    .map(d => format(parseISO(d), 'EEE d').toUpperCase())
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
            title={canPull ? undefined : "Today isn't in this month"}
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
  monthStart:  string
  onDaySelect: (date: string) => void
}

export default function MonthView({ monthStart, onDaySelect }: Props) {
  const [formOpen, setFormOpen] = useState(false)

  const { settings } = useSettings()
  const dayNames = settings.weekStartsOn === 0 ? DAY_NAMES_SUN_FIRST : DAY_NAMES_MON_FIRST

  const monthEnd = format(endOfMonth(parseISO(monthStart)), 'yyyy-MM-dd')

  const { data: rawItems   = [], isLoading: loadingItems } = useRangeDayItems(monthStart, monthEnd)
  const { data: focusItems = [], isLoading: loadingFocus } = useMonthFocus(monthStart)
  const { data: treeNodes  = [] } = useTreeNodes()
  const { data: inboxItems = [] } = useInboxItems()
  const { data: habits     = [] } = useHabits()

  const { mutate: createFocus,     isPending: creating     } = useCreateMonthFocus()
  const { mutate: createFocusMany, isPending: creatingMany } = useCreateMonthFocusMany()
  const { mutate: toggleFocus, isPending: toggling  } = useToggleMonthFocus()
  const { mutate: deleteFocus, isPending: deleting  } = useDeleteMonthFocus()
  const { mutate: pullToDay,   isPending: pulling    } = usePullMonthFocusToDay()
  const isPending = creating || creatingMany || toggling || deleting || pulling

  const nodeMap  = new Map(treeNodes.map(n => [n.id, n]))
  const inboxMap = new Map(inboxItems.map(i => [i.id, i]))
  const habitMap = new Map(habits.map(h => [h.id, h]))
  const byDate   = groupByDate(rawItems)
  const cells    = buildCalendarGrid(monthStart, settings.weekStartsOn)

  const isLoading = loadingItems || loadingFocus

  // Features 3/5: standalone tasks live in their own "Tasks this month"
  // section, separate from tree/inbox/habit items in "Monthly focus".
  const treeFocusItems = focusItems.filter(i => i.source !== 'standalone')
  const taskItems      = focusItems.filter(i => i.source === 'standalone')

  // focusId → dates it's been pulled to this month (origin_month_focus_id link).
  const pulledMap = new Map<string, string[]>()
  for (const item of rawItems) {
    if (!item.originMonthFocusId) continue
    const list = pulledMap.get(item.originMonthFocusId)
    if (list) list.push(item.date)
    else pulledMap.set(item.originMonthFocusId, [item.date])
  }
  const todayInThisMonth = computeMonthStart(todayISO()) === monthStart

  function displayTitle(item: MonthFocusItem): string {
    if (item.title) return item.title
    if (item.treeNodeId) return nodeMap.get(item.treeNodeId)?.title ?? '(untitled)'
    if (item.habitId) return habitMap.get(item.habitId)?.name ?? '(untitled)'
    if (item.inboxItemId) return inboxMap.get(item.inboxItemId)?.content ?? '(untitled)'
    return '(untitled)'
  }

  function handleSaveStandalone(title: string) {
    createFocus(
      { monthStart, source: 'standalone', title },
      { onSuccess: () => setFormOpen(false) },
    )
  }

  function handleSaveTree(treeNodeIds: string[]) {
    createFocusMany(
      { monthStart, treeNodeIds },
      { onSuccess: () => setFormOpen(false) },
    )
  }

  function handleAddTask(title: string) {
    createFocus({ monthStart, source: 'standalone', title })
  }

  function handlePullTask(item: MonthFocusItem) {
    pullToDay({
      monthFocusId: item.id,
      date:         todayISO(),
      source:       item.source,
      title:        item.title,
      treeNodeId:   item.treeNodeId,
      inboxItemId:  item.inboxItemId,
      habitId:      item.habitId,
    })
  }

  const focusedNodeIds = new Set(
    focusItems.filter(i => i.treeNodeId).map(i => i.treeNodeId as string)
  )

  return (
    <div className={styles.page}>

      {/* Calendar grid */}
      <div className={styles.calWrap}>
        {/* Day-of-week header */}
        <div className={styles.dayHeader}>
          {dayNames.map(d => (
            <span key={d} className={styles.dayLabel}>{d}</span>
          ))}
        </div>

        {isLoading ? (
          <div className={styles.loading}><span className={styles.loadingStar}>✦</span></div>
        ) : (
          <div className={styles.grid}>
            {cells.map((date, i) =>
              date === null
                ? <div key={`pad-${i}`} className={styles.emptyCell} />
                : (
                  <DayCell
                    key={format(date, 'yyyy-MM-dd')}
                    date={date}
                    items={byDate.get(format(date, 'yyyy-MM-dd')) ?? []}
                    onSelect={() => onDaySelect(format(date, 'yyyy-MM-dd'))}
                  />
                )
            )}
          </div>
        )}
      </div>

      {/* Monthly focus list — tree/inbox/habit items pulled into the month */}
      <div className={styles.focusSection}>
        <div className={styles.focusHeader}>
          <span className={styles.focusDot} />
          <span className={styles.focusSectionTitle}>MONTHLY FOCUS</span>
          <span className={styles.focusCount}>· {treeFocusItems.length}</span>
          <button className={styles.addBtn} onClick={() => setFormOpen(true)}>+ Add</button>
        </div>

        {treeFocusItems.length === 0 && !isLoading && (
          <p className={styles.emptyHint}>
            Nothing flagged for this month — pull from your tree.
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
                id: item.id, monthStart, source: item.source,
                treeNodeId: item.treeNodeId, isComplete: !item.isComplete,
              })}
              onDelete={() => {
                if (!window.confirm(`Remove "${displayTitle(item)}" from this month?`)) return
                deleteFocus({ id: item.id, monthStart, source: item.source, inboxItemId: item.inboxItemId })
              }}
            />
          ))}
        </div>
      </div>

      {/* Tasks this month — standalone, title-only, no tree link (Feature 5) */}
      <div className={styles.focusSection}>
        <div className={styles.focusHeader}>
          <span className={styles.focusDot} />
          <span className={styles.focusSectionTitle}>TASKS THIS MONTH</span>
          <span className={styles.focusCount}>· {taskItems.length}</span>
        </div>

        <TaskQuickAdd
          placeholder="Add a task for this month…"
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
              canPull={todayInThisMonth}
              onPull={() => handlePullTask(item)}
              onToggle={() => toggleFocus({
                id: item.id, monthStart, source: item.source,
                treeNodeId: item.treeNodeId, isComplete: !item.isComplete,
              })}
              onDelete={() => {
                if (!window.confirm(`Remove "${displayTitle(item)}" from this month?`)) return
                deleteFocus({ id: item.id, monthStart, source: item.source, inboxItemId: item.inboxItemId })
              }}
            />
          ))}
        </div>
      </div>

      {formOpen && (
        <FocusItemForm
          label="ADD MONTHLY FOCUS"
          onClose={() => setFormOpen(false)}
          onSaveStandalone={handleSaveStandalone}
          onSaveTree={handleSaveTree}
          isSaving={creating || creatingMany}
          focusedNodeIds={focusedNodeIds}
          focusLabel="this month"
        />
      )}
    </div>
  )
}
