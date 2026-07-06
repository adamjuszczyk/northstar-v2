import { useEffect, useState, useLayoutEffect, useCallback, type CSSProperties } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  useToggleDayItem, useDeleteDayItem,
  PXH, TOPPAD, timeToDecimal, timeToY, timeStrToY, nowDecimal,
} from '../../hooks/useDayItems'
import type { DayItem, DayItemPriority } from '../../hooks/useDayItems'
import styles from './DayTimeline.module.css'

const HOURS_START = 0
const HOURS_END   = 23
const RAIL_X      = 62
const CARD_LEFT   = 86
const CARD_RIGHT  = 16
const INNER_H     = TOPPAD + (HOURS_END - HOURS_START + 1) * PXH + 48

function pad2(n: number) { return String(n).padStart(2, '0') }

function formatTimeLabel(decimal: number): string {
  const h = Math.floor(decimal)
  const m = Math.round((decimal - h) * 60)
  return `${pad2(h)}:${pad2(m)}`
}

function itemDurationH(item: DayItem): number {
  if (!item.startTime || !item.endTime) return 1
  return Math.max(0.25, timeToDecimal(item.endTime) - timeToDecimal(item.startTime))
}

// ── Cluster algorithm ──────────────────────────────────────────────────────────

function buildClusters(items: DayItem[]): DayItem[][] {
  if (items.length === 0) return []
  const sorted = [...items].sort((a, b) =>
    timeToDecimal(a.startTime!) - timeToDecimal(b.startTime!)
  )
  const groups: DayItem[][] = []
  let group       = [sorted[0]]
  let prevDecimal = timeToDecimal(sorted[0].startTime!)
  let clusterEnd  = prevDecimal + itemDurationH(sorted[0])

  for (let i = 1; i < sorted.length; i++) {
    const item    = sorted[i]
    const decimal = timeToDecimal(item.startTime!)
    if (decimal - prevDecimal < 0.5 || decimal < clusterEnd) {
      group.push(item)
      clusterEnd = Math.max(clusterEnd, decimal + itemDurationH(item))
    } else {
      groups.push(group)
      group      = [item]
      clusterEnd = decimal + itemDurationH(item)
    }
    prevDecimal = decimal
  }
  groups.push(group)
  return groups
}

const PRIO_RANK = { high: 3, medium: 2, low: 1 } as const

function dominantPriority(items: DayItem[]): DayItemPriority {
  return items.reduce<DayItemPriority>(
    (best, item) => PRIO_RANK[item.priority] > PRIO_RANK[best] ? item.priority : best,
    'low'
  )
}

// ── Draggable anchored card ────────────────────────────────────────────────────

interface CardProps {
  item:      DayItem
  isPending: boolean
  isUpNext:  boolean
  now:       number
  onEdit:    (item: DayItem) => void
  onToggle:  (item: DayItem) => void
  onDelete:  (item: DayItem) => void
}

function AnchoredCard({ item, isPending, isUpNext, now, onEdit, onToggle, onDelete }: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id })

  const top    = timeStrToY(item.startTime!)
  const minH   = itemDurationH(item) * PXH - 8
  const isPast = timeToDecimal(item.startTime!) + itemDurationH(item) <= now
  const dim    = item.isComplete || isPast

  const priorityClass = item.priority === 'high' ? styles.cardHigh
                      : item.priority === 'low'  ? styles.cardLow
                      : ''

  const cardOpacity = isDragging               ? 0
                    : isPast && !item.isComplete ? 0.62
                    : item.isComplete            ? 0.6
                    : 1

  return (
    <>
      <div
        className={styles.tick}
        style={{ left: RAIL_X + 3, width: CARD_LEFT - RAIL_X - 6, top, opacity: dim ? 0.3 : 0.6 } as CSSProperties}
      />
      <div
        className={`${styles.dot}${item.isComplete ? ' ' + styles.dotDone : dim ? ' ' + styles.dotDim : ''}`}
        style={{ left: RAIL_X - 4, top: top - 5 } as CSSProperties}
      />
      <div
        ref={setNodeRef}
        className={[
          styles.card,
          dim        ? styles.cardDim      : '',
          isDragging ? styles.cardDragging : '',
          priorityClass,
        ].filter(Boolean).join(' ')}
        style={{ left: CARD_LEFT, right: CARD_RIGHT, top, minHeight: minH, opacity: cardOpacity } as CSSProperties}
        onClick={() => onEdit(item)}
        {...attributes}
        {...listeners}
      >
        <div className={styles.cardRow}>
          <span className={styles.cardTime}>{item.startTime}</span>
          {isUpNext && <span className={styles.nextBadge}>UP NEXT</span>}
          {item.priority === 'high' && <span className={styles.priBadgeHigh}>★ HIGH</span>}
          {item.priority === 'low'  && <span className={styles.priBadgeLow}>○ LOW</span>}
          <span className={styles.cardSpacer} />
          {item.isComplete && <span className={styles.doneBadge}>✓ DONE</span>}
          {!item.isComplete && (
            <button
              className={styles.completeBtn}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onToggle(item) }}
              disabled={isPending}
              aria-label="Mark complete"
            >✓</button>
          )}
          {item.isComplete && (
            <button
              className={styles.undoBtn}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onToggle(item) }}
              disabled={isPending}
              aria-label="Undo complete"
            >↩</button>
          )}
          <button
            className={styles.deleteBtn}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDelete(item) }}
            disabled={isPending}
            aria-label="Delete"
          >✕</button>
        </div>

        <div className={`${styles.cardTitle}${item.isComplete ? ' ' + styles.cardTitleDone : ''}`}>
          {item.displayTitle}
        </div>
        {item.treeNodeTitle && item.source === 'tree' && (
          <div className={styles.cardOrigin}>↳ {item.treeNodeTitle}</div>
        )}
      </div>
    </>
  )
}

// ── Draggable row inside an expanded cluster ───────────────────────────────────

interface ClusterItemRowProps {
  item:      DayItem
  isPending: boolean
  onEdit:    (item: DayItem) => void
  onToggle:  (item: DayItem) => void
  onDelete:  (item: DayItem) => void
}

function ClusterItemRow({ item, isPending, onEdit, onToggle, onDelete }: ClusterItemRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id })

  return (
    <div
      ref={setNodeRef}
      className={styles.clusterExpandedRow}
      style={{ opacity: isDragging ? 0 : item.isComplete ? 0.6 : undefined }}
      onClick={e => { e.stopPropagation(); onEdit(item) }}
      {...attributes}
      {...listeners}
    >
      <span className={styles.clusterExpandedTime}>{item.startTime}</span>
      <span className={[styles.clusterExpandedTitle, item.isComplete ? styles.clusterExpandedTitleDone : ''].filter(Boolean).join(' ')}>
        {item.displayTitle}
      </span>
      {item.priority === 'high' && <span className={styles.priBadgeHigh}>★ HIGH</span>}
      {item.priority === 'low'  && <span className={styles.priBadgeLow}>○ LOW</span>}
      {item.isComplete && <span className={styles.doneBadge}>✓</span>}
      {!item.isComplete && (
        <button
          className={styles.clusterCompleteBtn}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onToggle(item) }}
          disabled={isPending}
          aria-label="Mark complete"
        >✓</button>
      )}
      {item.isComplete && (
        <button
          className={styles.clusterUndoBtn}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onToggle(item) }}
          disabled={isPending}
          aria-label="Undo complete"
        >↩</button>
      )}
      <button
        className={styles.clusterDeleteBtn}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onDelete(item) }}
        disabled={isPending}
        aria-label="Delete"
      >✕</button>
    </div>
  )
}

// ── Cluster block ──────────────────────────────────────────────────────────────

interface ClusterProps {
  items:      DayItem[]
  now:        number
  isPending:  boolean
  onEdit:     (item: DayItem) => void
  onToggle:   (item: DayItem) => void
  onDelete:   (item: DayItem) => void
}

function ClusterBlock({ items, now, isPending, onEdit, onToggle, onDelete }: ClusterProps) {
  const [expanded, setExpanded] = useState(false)

  const sorted = [...items].sort((a, b) =>
    timeToDecimal(a.startTime!) - timeToDecimal(b.startTime!)
  )

  const first      = sorted[0]
  const last       = sorted[sorted.length - 1]
  const top        = timeStrToY(first.startTime!)
  const endDecimal = timeToDecimal(last.startTime!) + itemDurationH(last)
  const height     = Math.max(timeToY(endDecimal) - top, 72)
  const isPast     = endDecimal <= now
  const prio       = dominantPriority(sorted)

  const priorityClass = prio === 'high' ? styles.cardHigh
                      : prio === 'low'  ? styles.cardLow
                      : ''

  const startLabel = first.startTime!
  const endLabel   = formatTimeLabel(endDecimal)

  return (
    <>
      <div
        className={styles.tick}
        style={{ left: RAIL_X + 3, width: CARD_LEFT - RAIL_X - 6, top, opacity: isPast ? 0.3 : 0.6 } as CSSProperties}
      />
      <div
        className={`${styles.dot}${isPast ? ' ' + styles.dotDim : ''}`}
        style={{ left: RAIL_X - 4, top: top - 5 } as CSSProperties}
      />
      <div
        className={[
          styles.clusterBlock,
          isPast ? styles.cardDim : '',
          priorityClass,
        ].filter(Boolean).join(' ')}
        style={{ left: CARD_LEFT, right: CARD_RIGHT, top, height } as CSSProperties}
        onClick={() => setExpanded(e => !e)}
      >
        <div className={styles.clusterHeader}>
          <span className={styles.clusterTime}>{startLabel} – {endLabel}</span>
          <span className={styles.clusterCount}>{sorted.length} TASKS</span>
          <span className={styles.clusterChevron}>{expanded ? '▴' : '▾'}</span>
        </div>

        {!expanded && (
          <div className={styles.clusterCollapsed}>
            <span className={styles.clusterTasksLabel}>TASKS:</span>
            <div className={styles.clusterTaskList}>
              {sorted.map(item => (
                <div key={item.id} className={styles.clusterTaskItem}>
                  <span className={styles.clusterTaskTime}>{item.startTime}</span>
                  <span className={styles.clusterTaskTitle}>{item.displayTitle}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {expanded && (
          <div className={styles.clusterExpanded}>
            {sorted.map(item => (
              <ClusterItemRow
                key={item.id}
                item={item}
                isPending={isPending}
                onEdit={onEdit}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────────

interface Props {
  date:      string
  items:     DayItem[]
  scrollRef: React.MutableRefObject<HTMLDivElement | null>
  onEdit:    (item: DayItem) => void
  dropTime:  string | null
}

export default function DayTimeline({ date: _date, items, scrollRef, onEdit, dropTime }: Props) {
  const [now, setNow] = useState(nowDecimal)

  useEffect(() => {
    const id = setInterval(() => setNow(nowDecimal()), 60_000)
    return () => clearInterval(id)
  }, [])

  useLayoutEffect(() => {
    if (!scrollRef.current) return
    const nowY = timeToY(now)
    scrollRef.current.scrollTop = Math.max(0, nowY - 220)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const nowY     = timeToY(now)
  const nowLabel = formatTimeLabel(now)
  const upNext   = items.find(i => !i.isComplete && timeToDecimal(i.startTime!) > now)

  const { mutate: toggle, isPending: toggling } = useToggleDayItem()
  const { mutate: remove, isPending: removing  } = useDeleteDayItem()
  const isPending = toggling || removing

  function handleToggle(item: DayItem) {
    toggle({ id: item.id, isComplete: !item.isComplete, treeNodeId: item.treeNodeId })
  }
  function handleDelete(item: DayItem) {
    if (!window.confirm(`Delete "${item.displayTitle}"?`)) return
    remove(item.id)
  }

  const { setNodeRef: setDropRef } = useDroppable({ id: 'timeline-area' })
  const setScrollAreaRef = useCallback((el: HTMLDivElement | null) => {
    setDropRef(el)
    scrollRef.current = el
  }, [setDropRef, scrollRef])

  const clusters = buildClusters(items)

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.headerDot} />
        <span className={styles.headerTitle}>TIMELINE</span>
        <span className={styles.headerSub}>· ANCHORED · FIXED TIME</span>
        <span className={styles.headerCount}>{items.length}</span>
      </div>

      <div ref={setScrollAreaRef} className={styles.scrollArea}>
        <div className={styles.inner} style={{ height: INNER_H }}>

          {/* Hour grid */}
          {Array.from({ length: HOURS_END - HOURS_START + 1 }, (_, i) => {
            const h   = HOURS_START + i
            const top = timeToY(h)
            return (
              <div key={h}>
                <div className={styles.hourLine}
                  style={{ top, left: RAIL_X + 4, right: CARD_RIGHT } as CSSProperties} />
                <div className={styles.hourLabel}
                  style={{ top: top - 7, width: RAIL_X - 14, opacity: h % 2 === 0 ? 0.95 : 0.5 } as CSSProperties}>
                  {pad2(h)}
                </div>
              </div>
            )
          })}

          {/* Rail */}
          <div className={styles.rail}
            style={{ left: RAIL_X, top: TOPPAD - 8, height: (HOURS_END - HOURS_START + 1) * PXH + 16 } as CSSProperties} />

          {/* Past overlay */}
          <div className={styles.pastOverlay}
            style={{ left: RAIL_X + 4, right: CARD_RIGHT, top: TOPPAD - 8, height: Math.max(0, nowY - (TOPPAD - 8)) } as CSSProperties} />

          {/* Drop time indicator */}
          {dropTime && (
            <div
              className={styles.dropIndicator}
              style={{ top: timeStrToY(dropTime), left: CARD_LEFT, right: CARD_RIGHT } as CSSProperties}
            >
              <span className={styles.dropIndicatorLabel}>{dropTime}</span>
            </div>
          )}

          {/* Anchored items — solo or clustered */}
          {clusters.map((group, gi) =>
            group.length === 1 ? (
              <AnchoredCard
                key={group[0].id}
                item={group[0]}
                isPending={isPending}
                isUpNext={group[0] === upNext}
                now={now}
                onEdit={onEdit}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ) : (
              <ClusterBlock
                key={`cluster-${gi}-${group[0].id}`}
                items={group}
                now={now}
                isPending={isPending}
                onEdit={onEdit}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            )
          )}

          {/* NOW line */}
          <div className={styles.nowLine}
            style={{ left: RAIL_X - 6, right: CARD_RIGHT, top: nowY } as CSSProperties} />
          <div className={styles.nowDot}
            style={{ left: RAIL_X - 5, top: nowY - 6 } as CSSProperties} />
          <div className={styles.nowLabel}
            style={{ left: RAIL_X + 10, top: nowY - 26 } as CSSProperties}>
            NOW · {nowLabel}
          </div>

        </div>
      </div>
    </div>
  )
}
