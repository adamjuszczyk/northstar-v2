import { useState, type CSSProperties } from 'react'
import { format, parseISO, addDays, isToday } from 'date-fns'
import { useWeekFocus, useCreateWeekFocus, useToggleWeekFocus, useDeleteWeekFocus } from '../../hooks/useWeekFocus'
import type { WeekFocusItem } from '../../hooks/useWeekFocus'
import { useRangeDayItems, groupByDate, maxPriority } from '../../hooks/useDayItemsSummary'
import type { DayItemSummaryRow } from '../../hooks/useDayItemsSummary'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import { useSettings } from '../../hooks/useSettings'
import { weekDisplayStart } from '../../lib/dates'
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
): string {
  if (item.title) return item.title
  if (item.treeNodeId)  return nodeMap.get(item.treeNodeId)?.title ?? 'Untitled'
  if (item.inboxItemId) return inboxMap.get(item.inboxItemId)?.content ?? 'Untitled'
  return 'Untitled'
}

// ── Day column ─────────────────────────────────────────────────────────────────

interface DayColProps {
  date:     Date
  items:    DayItemSummaryRow[]
  nodeMap:  Map<string, { title: string }>
  inboxMap: Map<string, { content: string }>
  onSelect: () => void
}

function DayCol({ date, items, nodeMap, inboxMap, onSelect }: DayColProps) {
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
              {resolveEventTitle(item, nodeMap, inboxMap)}
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
}

function FocusRow({ item, displayTitle, onToggle, onDelete, isPending }: FocusRowProps) {
  const sourceLabel =
    item.source === 'tree'       ? '✦ GOAL TREE'  :
    item.source === 'inbox'      ? '⌵ FROM INBOX' :
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

  const { mutate: createFocus, isPending: creating } = useCreateWeekFocus()
  const { mutate: toggleFocus, isPending: toggling  } = useToggleWeekFocus()
  const { mutate: deleteFocus, isPending: deleting  } = useDeleteWeekFocus()
  const isPending = creating || toggling || deleting

  const nodeMap   = new Map(treeNodes.map(n => [n.id, n]))
  const inboxMap  = new Map(inboxItems.map(i => [i.id, i]))
  const byDate    = groupByDate(rawItems)

  const days = Array.from({ length: 7 }, (_, i) => addDays(parseISO(displayStart), i))

  function displayTitle(item: WeekFocusItem): string {
    if (item.title) return item.title
    if (item.treeNodeId) return nodeMap.get(item.treeNodeId)?.title ?? '(untitled)'
    return '(untitled)'
  }

  function handleSave(input: { source: 'standalone' | 'tree'; title?: string; treeNodeId?: string }) {
    createFocus(
      { weekStart, source: input.source, title: input.title, treeNodeId: input.treeNodeId },
      { onSuccess: () => setFormOpen(false) }
    )
  }

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
                  onSelect={() => onDaySelect(dateStr)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Weekly focus list */}
      <div className={styles.focusSection}>
        <div className={styles.focusHeader}>
          <span className={styles.focusDot} />
          <span className={styles.focusTitle}>WEEKLY FOCUS</span>
          <span className={styles.focusCount}>· {focusItems.length}</span>
          <button className={styles.addBtn} onClick={() => setFormOpen(true)}>+ Add</button>
        </div>

        {focusItems.length === 0 && !isLoading && (
          <p className={styles.emptyHint}>
            Nothing flagged for this week — pull from your tree or add a task.
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
                id: item.id, weekStart, source: item.source,
                treeNodeId: item.treeNodeId, isComplete: !item.isComplete,
              })}
              onDelete={() => {
                if (!window.confirm(`Remove "${displayTitle(item)}" from this week?`)) return
                deleteFocus({ id: item.id, weekStart })
              }}
            />
          ))}
        </div>
      </div>

      {formOpen && (
        <FocusItemForm
          label="ADD WEEKLY FOCUS"
          onClose={() => setFormOpen(false)}
          onSave={handleSave}
          isSaving={creating}
        />
      )}
    </div>
  )
}
