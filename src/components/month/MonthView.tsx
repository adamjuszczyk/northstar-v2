import { useState, type CSSProperties } from 'react'
import { format, parseISO, addDays, startOfMonth, endOfMonth, getDay, isToday } from 'date-fns'
import { useMonthFocus, useCreateMonthFocus, useToggleMonthFocus, useDeleteMonthFocus } from '../../hooks/useMonthFocus'
import type { MonthFocusItem } from '../../hooks/useMonthFocus'
import { useRangeDayItems, groupByDate, maxPriority } from '../../hooks/useDayItemsSummary'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import FocusItemForm from '../planner/FocusItemForm'
import styles from './MonthView.module.css'

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

// ── Priority accent helpers ────────────────────────────────────────────────────

function priorityRgbVar(p: 'high' | 'medium' | 'low' | null): string {
  if (p === 'high')   return '--ns-gold-rgb'
  if (p === 'medium') return '--ns-project-accent-rgb'
  if (p === 'low')    return '--ns-task-accent-rgb'
  return ''
}

// Build the grid: always Mon–Sun rows, pad with null for out-of-month days
function buildCalendarGrid(monthStartISO: string): (Date | null)[] {
  const first  = parseISO(monthStartISO)
  const last   = endOfMonth(first)
  // getDay: 0=Sun…6=Sat → convert to Mon-based: Mon=0
  const startPad = (getDay(first) + 6) % 7
  const endPad   = (7 - ((getDay(last) + 6) % 7 + 1)) % 7

  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)

  let cur = first
  while (cur <= last) {
    cells.push(cur)
    cur = addDays(cur, 1)
  }
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
}

function FocusRow({ item, displayTitle, onToggle, onDelete, isPending }: FocusRowProps) {
  const sourceLabel =
    item.source === 'tree'  ? '✦ GOAL TREE'  :
    item.source === 'inbox' ? '⌵ FROM INBOX' :
                               '• STANDALONE'

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
      <button
        className={styles.deleteBtn}
        onClick={onDelete}
        disabled={isPending}
        aria-label="Remove"
      >✕</button>
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

  const monthEnd = format(endOfMonth(parseISO(monthStart)), 'yyyy-MM-dd')

  const { data: rawItems   = [], isLoading: loadingItems } = useRangeDayItems(monthStart, monthEnd)
  const { data: focusItems = [], isLoading: loadingFocus } = useMonthFocus(monthStart)
  const { data: treeNodes  = [] } = useTreeNodes()

  const { mutate: createFocus, isPending: creating } = useCreateMonthFocus()
  const { mutate: toggleFocus, isPending: toggling  } = useToggleMonthFocus()
  const { mutate: deleteFocus, isPending: deleting  } = useDeleteMonthFocus()
  const isPending = creating || toggling || deleting

  const nodeMap = new Map(treeNodes.map(n => [n.id, n]))
  const byDate  = groupByDate(rawItems)
  const cells   = buildCalendarGrid(monthStart)

  const isLoading = loadingItems || loadingFocus

  function displayTitle(item: MonthFocusItem): string {
    if (item.title) return item.title
    if (item.treeNodeId) return nodeMap.get(item.treeNodeId)?.title ?? '(untitled)'
    return '(untitled)'
  }

  function handleSave(input: { source: 'standalone' | 'tree'; title?: string; treeNodeId?: string }) {
    createFocus(
      { monthStart, source: input.source, title: input.title, treeNodeId: input.treeNodeId },
      { onSuccess: () => setFormOpen(false) }
    )
  }

  return (
    <div className={styles.page}>

      {/* Calendar grid */}
      <div className={styles.calWrap}>
        {/* Day-of-week header */}
        <div className={styles.dayHeader}>
          {DAY_NAMES.map(d => (
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

      {/* Monthly focus list */}
      <div className={styles.focusSection}>
        <div className={styles.focusHeader}>
          <span className={styles.focusDot} />
          <span className={styles.focusSectionTitle}>MONTHLY FOCUS</span>
          <span className={styles.focusCount}>· {focusItems.length}</span>
          <button className={styles.addBtn} onClick={() => setFormOpen(true)}>+ Add</button>
        </div>

        {focusItems.length === 0 && !isLoading && (
          <p className={styles.emptyHint}>
            Nothing flagged for this month — pull from your tree or add a task.
          </p>
        )}

        <div className={styles.focusList}>
          {focusItems.map(item => (
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
                deleteFocus({ id: item.id, monthStart })
              }}
            />
          ))}
        </div>
      </div>

      {formOpen && (
        <FocusItemForm
          label="ADD MONTHLY FOCUS"
          onClose={() => setFormOpen(false)}
          onSave={handleSave}
          isSaving={creating}
        />
      )}
    </div>
  )
}
