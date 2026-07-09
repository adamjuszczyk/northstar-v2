import { useState, useMemo, useRef, type CSSProperties } from 'react'
import { format, parseISO, isToday, addDays, subDays } from 'date-fns'
import {
  DndContext, DragOverlay, pointerWithin,
  MouseSensor, TouchSensor, useSensors, useSensor,
  type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from '@dnd-kit/core'
import {
  useDayItems, useUpdateDayItem,
  PXH, TOPPAD, decimalToTimeStr, timeToDecimal,
} from '../../hooks/useDayItems'
import type { DayItem } from '../../hooks/useDayItems'
import { useTreeNodes }  from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import DayTimeline      from './DayTimeline'
import FloatingPool     from './FloatingPool'
import DayListMode      from './DayListMode'
import DayItemForm      from './DayItemForm'
import DayItemEditForm  from './DayItemEditForm'
import FocusReminder    from './FocusReminder'
import JournalSection   from './JournalSection'
import styles from './DayView.module.css'

type Mode = 'schedule' | 'list'

function fmtDate(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE d MMMM yyyy')
}

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

// ── Drag preview card (rendered in DragOverlay) ────────────────────────────────

function DragPreview({ item }: { item?: DayItem }) {
  if (!item) return null
  return (
    <div className={styles.dragPreview}>
      <span className={styles.dragPreviewTitle}>{item.displayTitle}</span>
      {item.startTime && <span className={styles.dragPreviewTime}>{item.startTime}</span>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  date:          string
  onDateChange?: (d: string) => void
}

export default function DayView({ date, onDateChange }: Props) {
  const [mode,      setMode]      = useState<Mode>('schedule')
  const [formOpen,  setFormOpen]  = useState(false)
  const [editItem,  setEditItem]  = useState<DayItem | null>(null)
  const [activeId,  setActiveId]  = useState<string | null>(null)
  const [dropTime,  setDropTime]  = useState<string | null>(null)

  // Ref to the DayTimeline scroll container — used for drop time calculation
  const timelineScrollRef = useRef<HTMLDivElement | null>(null)

  const { data: rawItems   = [], isLoading, error } = useDayItems(date)
  const { data: treeNodes  = [] } = useTreeNodes()
  const { data: inboxItems = [] } = useInboxItems()
  const { mutate: updateItem } = useUpdateDayItem()

  // Resolve display titles from cached tree/inbox data
  const items: DayItem[] = useMemo(() => {
    const nodeMap  = new Map(treeNodes.map(n  => [n.id,  n]))
    const inboxMap = new Map(inboxItems.map(i => [i.id, i]))
    return rawItems.map(item => {
      const treeNode  = item.treeNodeId  ? nodeMap.get(item.treeNodeId)   : null
      const inboxItem = item.inboxItemId ? inboxMap.get(item.inboxItemId) : null
      return {
        ...item,
        treeNodeTitle: treeNode?.title    ?? null,
        treeNodeType:  treeNode?.type     ?? null,
        inboxContent:  inboxItem?.content ?? null,
        displayTitle:  item.title ?? treeNode?.title ?? inboxItem?.content ?? 'Untitled',
      }
    })
  }, [rawItems, treeNodes, inboxItems])

  const anchored = items.filter(i => i.startTime !== null)
  const floating = items.filter(i => i.startTime === null)

  const isTodayDate    = isToday(parseISO(date))
  const dateLabel      = isTodayDate ? 'TODAY' : format(parseISO(date), 'EEEE').toUpperCase()
  const completedCount = items.filter(i => i.isComplete).length
  const errorMsg       = error ? ((error as { message?: string }).message ?? 'Unknown error') : null

  // ── DnD sensors ────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id))
    setDropTime(null)
  }

  function handleDragMove({ active, over }: DragMoveEvent) {
    if (over?.id !== 'timeline-area') {
      setDropTime(null)
      return
    }
    const container = timelineScrollRef.current
    if (!container) return
    const translated = active.rect.current.translated
    if (!translated) return

    const containerRect = container.getBoundingClientRect()
    const scrollTop     = container.scrollTop
    const relativeY     = translated.top - containerRect.top + scrollTop
    const decimal       = (relativeY - TOPPAD) / PXH
    const snapped       = Math.round(decimal * 4) / 4            // 15-min snap
    const clamped       = Math.max(0, Math.min(23.75, snapped))
    setDropTime(decimalToTimeStr(clamped))
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const id   = String(active.id)
    const item = items.find(i => i.id === id)
    setActiveId(null)

    if (!item || !over) {
      setDropTime(null)
      return
    }

    if (over.id === 'pool-drop') {
      // Anchored → floating (no-op if already floating)
      if (item.startTime !== null) {
        updateItem({ id, startTime: null, endTime: null })
      }
    } else if (over.id === 'timeline-area' && dropTime !== null) {
      // Floating or anchored → anchor at new time. Preserve the item's
      // original duration so re-anchoring can't produce end < start.
      if (item.startTime !== dropTime) {
        if (item.startTime !== null && item.endTime !== null) {
          const duration = timeToDecimal(item.endTime) - timeToDecimal(item.startTime)
          const newEnd   = Math.min(23.983333, timeToDecimal(dropTime) + duration)
          updateItem({ id, startTime: dropTime, endTime: decimalToTimeStr(newEnd) })
        } else {
          updateItem({ id, startTime: dropTime })
        }
      }
    }

    setDropTime(null)
  }

  function handleDragCancel() {
    setActiveId(null)
    setDropTime(null)
  }

  const activeItem = activeId ? items.find(i => i.id === activeId) : undefined

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={styles.page}>

        {/* Date header */}
        <div className={styles.dateHeader}>
          <div className={styles.dateLeft}>
            {onDateChange && (
              <button
                className={styles.navBtn}
                onClick={() => onDateChange(format(subDays(parseISO(date), 1), 'yyyy-MM-dd'))}
                aria-label="Previous day"
              >‹</button>
            )}
            <div className={styles.dateBlock}>
              <div className={styles.dateSuperLabel}>{dateLabel}</div>
              <div className={styles.dateDisplay}>{fmtDate(date)}</div>
            </div>
            {onDateChange && (
              <button
                className={styles.navBtn}
                onClick={() => onDateChange(format(addDays(parseISO(date), 1), 'yyyy-MM-dd'))}
                aria-label="Next day"
              >›</button>
            )}
            {onDateChange && !isTodayDate && (
              <button className={styles.todayBtn} onClick={() => onDateChange(todayIso())}>
                Today
              </button>
            )}
          </div>

          <div className={styles.dateRight}>
            {items.length > 0 && (
              <span className={styles.progress}>{completedCount}/{items.length} done</span>
            )}
            <button className={styles.addBtn} onClick={() => setFormOpen(true)}>+ Add</button>
            <div className={styles.modeToggle}>
              <span className={styles.modeLabel}>MODE</span>
              <div className={styles.modePill}>
                <button
                  className={`${styles.modeBtn}${mode === 'schedule' ? ' ' + styles.modeBtnActive : ''}`}
                  onClick={() => setMode('schedule')}
                  aria-label="Schedule view"
                >▦<span className={styles.modeBtnLabel}> Schedule</span></button>
                <button
                  className={`${styles.modeBtn}${mode === 'list' ? ' ' + styles.modeBtnActive : ''}`}
                  onClick={() => setMode('list')}
                  aria-label="List view"
                >☰<span className={styles.modeBtnLabel}> List</span></button>
              </div>
            </div>
          </div>
        </div>

        {/* Week / month focus reminder */}
        <FocusReminder date={date} />

        {/* Content */}
        {errorMsg ? (
          <div className={styles.errorState}>
            <p className={styles.errorText}>Failed to load items</p>
            <p className={styles.errorHint}>{errorMsg}</p>
          </div>
        ) : isLoading ? (
          <div className={styles.loading}>
            <span className={styles.loadingStar}>✦</span>
          </div>
        ) : mode === 'schedule' ? (
          <div className={styles.scheduleCanvas}>
            <DayTimeline
              date={date}
              items={anchored}
              scrollRef={timelineScrollRef}
              onEdit={setEditItem}
              dropTime={dropTime}
            />
            <FloatingPool
              items={floating}
              onEdit={setEditItem}
            />
          </div>
        ) : (
          <div className={styles.listCanvas}>
            <DayListMode items={items} />
          </div>
        )}

        {/* Daily journal */}
        {!errorMsg && !isLoading && <JournalSection date={date} />}

      </div>

      {/* DnD overlay — follows cursor */}
      <DragOverlay dropAnimation={null}>
        <DragPreview item={activeItem} />
      </DragOverlay>

      {/* Add form */}
      {formOpen && (
        <DayItemForm date={date} onClose={() => setFormOpen(false)} />
      )}

      {/* Edit form */}
      {editItem && (
        <DayItemEditForm item={editItem} onClose={() => setEditItem(null)} />
      )}
    </DndContext>
  )
}
