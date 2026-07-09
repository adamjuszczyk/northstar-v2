import { useState, type CSSProperties } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useToggleDayItem, useDeleteDayItem } from '../../hooks/useDayItems'
import type { DayItem } from '../../hooks/useDayItems'
import { useIsMobile } from '../../hooks/useIsMobile'
import styles from './FloatingPool.module.css'

const MOBILE_COLLAPSE_THRESHOLD = 5

// ── Source config ──────────────────────────────────────────────────────────────

const SOURCE_CFG = {
  tree:       { accentVar: '--ns-gold',           accentRgbVar: '--ns-gold-rgb',           tag: '✦ GOAL TREE',  dashed: false },
  standalone: { accentVar: '--ns-task-accent',    accentRgbVar: '--ns-task-accent-rgb',    tag: '• STANDALONE', dashed: false },
  inbox:      { accentVar: '--ns-project-accent', accentRgbVar: '--ns-project-accent-rgb', tag: '⌵ FROM INBOX', dashed: true  },
} as const

function sourceKey(item: DayItem): keyof typeof SOURCE_CFG {
  if (item.source === 'tree')  return 'tree'
  if (item.source === 'inbox') return 'inbox'
  return 'standalone'
}

// Priority overrides accent colour; source still controls border style + tag
function accentVars(item: DayItem): { accentVar: string; accentRgbVar: string } {
  if (item.priority === 'high') return { accentVar: '--ns-gold',        accentRgbVar: '--ns-gold-rgb' }
  if (item.priority === 'low')  return { accentVar: '--ns-task-accent', accentRgbVar: '--ns-task-accent-rgb' }
  return SOURCE_CFG[sourceKey(item)]
}

// ── Draggable floating card ────────────────────────────────────────────────────

interface CardProps {
  item:      DayItem
  isPending: boolean
  onEdit:    (item: DayItem) => void
  onToggle:  () => void
  onDelete:  () => void
}

function FloatingCard({ item, isPending, onEdit, onToggle, onDelete }: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id })
  const cfg = SOURCE_CFG[sourceKey(item)]
  const { accentVar, accentRgbVar } = accentVars(item)
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  // Desktop always shows full detail; mobile hides tag/origin/badges/delete until tapped.
  const showDetails = !isMobile || open

  const cardStyle: CSSProperties = {
    '--fp-accent':     `var(${accentVar})`,
    '--fp-accent-rgb': `var(${accentRgbVar})`,
    '--fp-border':     cfg.dashed ? 'dashed' : 'solid',
    opacity:           isDragging ? 0 : undefined,
  } as CSSProperties

  function handleCardClick() {
    if (isMobile) setOpen(o => !o)
    else onEdit(item)
  }

  return (
    <div
      ref={setNodeRef}
      className={[
        styles.card,
        item.isComplete         ? styles.cardDone     : '',
        item.priority === 'low' ? styles.cardLow      : '',
        isDragging              ? styles.cardDragging  : '',
      ].filter(Boolean).join(' ')}
      style={cardStyle}
      onClick={handleCardClick}
      {...attributes}
      {...listeners}
    >
      <button
        className={`${styles.check}${item.isComplete ? ' ' + styles.checkDone : ''}`}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onToggle() }}
        disabled={isPending}
        aria-label={item.isComplete ? 'Mark incomplete' : 'Mark complete'}
      >
        {item.isComplete ? '✓' : ''}
      </button>

      <div className={styles.content}>
        <div className={styles.topRow}>
          {item.colour && <span className={styles.colourDot} style={{ background: item.colour }} />}
          <span className={`${styles.title}${item.isComplete ? ' ' + styles.titleDone : ''}`}>
            {item.displayTitle}
          </span>
          {showDetails && item.source === 'tree' && item.treeNodeId && !item.isComplete && (
            <span className={styles.inProgressBadge}>
              <span className={styles.inProgressDot} />
              IN PROGRESS
            </span>
          )}
          {showDetails && item.priority === 'high' && <span className={styles.priBadgeHigh}>★ HIGH</span>}
          {showDetails && item.priority === 'low'  && <span className={styles.priBadgeLow}>○ LOW</span>}
        </div>
        {showDetails && (
          <div className={styles.metaRow}>
            <span className={styles.tag}>{cfg.tag}</span>
            {(item.treeNodeTitle || item.inboxContent) && (
              <span className={styles.origin}>↳ {item.treeNodeTitle ?? item.inboxContent}</span>
            )}
          </div>
        )}
        {isMobile && open && (
          <button
            className={styles.mobileEditBtn}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onEdit(item) }}
          >
            Edit details
          </button>
        )}
      </div>

      {showDetails && (
        <button
          className={styles.deleteBtn}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete() }}
          disabled={isPending}
          aria-label="Remove from day"
        >✕</button>
      )}
    </div>
  )
}

// ── Pool panel ─────────────────────────────────────────────────────────────────

interface Props {
  items:  DayItem[]
  onEdit: (item: DayItem) => void
}

export default function FloatingPool({ items, onEdit }: Props) {
  const { setNodeRef: setPoolRef, isOver: poolOver } = useDroppable({ id: 'pool-drop' })
  const isMobile = useIsMobile()
  const [showAll, setShowAll] = useState(false)

  const { mutate: toggle, isPending: toggling } = useToggleDayItem()
  const { mutate: remove, isPending: removing  } = useDeleteDayItem()
  const isPending = toggling || removing

  function handleToggle(item: DayItem) {
    toggle({ id: item.id, isComplete: !item.isComplete, treeNodeId: item.treeNodeId })
  }
  function handleDelete(item: DayItem) {
    if (!window.confirm(`Remove "${item.displayTitle}" from today?`)) return
    remove(item.id)
  }

  const isCollapsible = isMobile && items.length > MOBILE_COLLAPSE_THRESHOLD && !showAll
  const visibleItems  = isCollapsible ? items.slice(0, MOBILE_COLLAPSE_THRESHOLD) : items
  const hiddenCount   = items.length - visibleItems.length

  return (
    <div
      ref={setPoolRef}
      className={`${styles.panel}${poolOver ? ' ' + styles.panelDropOver : ''}`}
    >
      <div className={styles.panelHeader}>
        <div className={styles.headerTop}>
          <span className={styles.headerDot} />
          <span className={styles.headerTitle}>FLOATING POOL</span>
          <span className={styles.headerCount}>· {items.length}</span>
        </div>
        <p className={styles.headerHint}>No fixed time — check off as the day goes.</p>

        <div className={styles.legend}>
          {[
            { label: 'GOAL TREE',  accentVar: '--ns-gold',           dashed: false },
            { label: 'STANDALONE', accentVar: '--ns-task-accent',    dashed: false },
            { label: 'FROM INBOX', accentVar: '--ns-project-accent', dashed: true  },
          ].map(({ label, accentVar, dashed }) => (
            <span key={label} className={styles.legendChip}>
              <span
                className={styles.legendDot}
                style={{
                  background:  dashed ? 'transparent' : `var(${accentVar})`,
                  borderStyle: dashed ? 'dashed' : 'none',
                  borderWidth: dashed ? '1.5px' : 0,
                  borderColor: dashed ? `var(${accentVar})` : 'transparent',
                } as CSSProperties}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.list}>
        {items.length === 0 && (
          <p className={styles.empty}>
            {poolOver
              ? 'Drop here to unanchor'
              : 'Nothing floating yet — add tasks or pull from your tree.'}
          </p>
        )}
        {visibleItems.map(item => (
          <FloatingCard
            key={item.id}
            item={item}
            isPending={isPending}
            onEdit={onEdit}
            onToggle={() => handleToggle(item)}
            onDelete={() => handleDelete(item)}
          />
        ))}
        {isCollapsible && (
          <button className={styles.showAllBtn} onClick={() => setShowAll(true)}>
            Show all ({items.length})
          </button>
        )}
      </div>
    </div>
  )
}
