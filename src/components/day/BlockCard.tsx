import type { CSSProperties } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useToggleDayItem, useDeleteDayItem, PXH, timeToDecimal, timeStrToY } from '../../hooks/useDayItems'
import type { DayItem } from '../../hooks/useDayItems'
import type { Block } from '../../hooks/useBlocks'
import { hexToRgbTriple } from '../../lib/blockColours'
import ListBadge from './ListBadge'
import { useT } from '../../i18n'
import styles from './DayTimeline.module.css'

const RAIL_X      = 62
const CARD_LEFT   = 86
const CARD_RIGHT  = 16
const MIN_HEIGHT  = 112

const DEFAULT_ACCENT    = 'var(--ns-task-accent)'
const DEFAULT_ACCENT_RGB = 'var(--ns-task-accent-rgb)'

interface RowProps {
  item:   DayItem
  onEdit: (item: DayItem) => void
}

function BlockItemRow({ item, onEdit }: RowProps) {
  const t = useT()
  const { mutate: toggle, isPending: toggling } = useToggleDayItem()
  const { mutate: remove, isPending: removing } = useDeleteDayItem()
  const isPending = toggling || removing
  const isListTask = item.stepsTotal >= 2

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    toggle({
      id: item.id, isComplete: !item.isComplete, treeNodeId: item.treeNodeId, habitId: item.habitId,
      taskId: item.taskId,
    })
  }
  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm(t('common.deleteConfirm', { title: item.displayTitle }))) return
    remove(
      { id: item.id, source: item.source, inboxItemId: item.inboxItemId, taskId: item.taskId },
      { onError: err => window.alert(t('common.deleteError', { title: item.displayTitle, error: (err as Error).message })) },
    )
  }

  return (
    <div className={styles.blockItemRow} onClick={() => onEdit(item)}>
      <span className={styles.blockItemTime}>{item.startTime ?? '—'}</span>
      <span className={`${styles.blockItemTitle}${item.isComplete ? ' ' + styles.blockItemTitleDone : ''}`}>
        {item.displayTitle}
      </span>
      {isListTask && <ListBadge done={item.stepsDone} total={item.stepsTotal} />}
      <button
        className={styles.blockItemCompleteBtn}
        onClick={handleToggle}
        disabled={isPending || isListTask}
        aria-label={
          isListTask
            ? (item.isComplete ? t('common.completeDerivedFromSteps') : t('common.completeEveryStepHint'))
            : item.isComplete ? t('common.markIncomplete') : t('common.markComplete')
        }
        title={isListTask ? (item.isComplete ? t('common.completeDerivedFromSteps') : t('common.completeEveryStepHint')) : undefined}
      >{item.isComplete ? '↩' : '✓'}</button>
      <button
        className={styles.blockItemDeleteBtn}
        onClick={handleDelete}
        disabled={isPending}
        aria-label={t('common.delete')}
      >✕</button>
    </div>
  )
}

interface Props {
  block:      Block
  items:      DayItem[]
  onEditBlock: (block: Block) => void
  onEditItem:  (item: DayItem) => void
}

/** A freely-named, scheduled time-range container (SPEC §5.2). Renders on
 *  the timeline like an anchored item, and shows whatever's assigned inside
 *  it — a block itself has no completion state. */
export default function BlockCard({ block, items, onEditBlock, onEditItem }: Props) {
  const t = useT()
  const { setNodeRef, isOver } = useDroppable({ id: `block-${block.id}` })

  const top      = timeStrToY(block.startTime)
  const duration = Math.max(0.25, timeToDecimal(block.endTime) - timeToDecimal(block.startTime))
  const height   = Math.max(duration * PXH, MIN_HEIGHT)

  const { accent, accentRgb } = block.colour
    ? { accent: block.colour, accentRgb: hexToRgbTriple(block.colour) }
    : { accent: DEFAULT_ACCENT, accentRgb: DEFAULT_ACCENT_RGB }

  const cardStyle = {
    left: CARD_LEFT, right: CARD_RIGHT, top, height,
    '--ns-block-accent':     accent,
    '--ns-block-accent-rgb': accentRgb,
  } as CSSProperties

  return (
    <>
      <div
        className={styles.tick}
        style={{ left: RAIL_X + 3, width: CARD_LEFT - RAIL_X - 6, top, opacity: 0.6 } as CSSProperties}
      />
      <div className={styles.dot} style={{ left: RAIL_X - 4, top: top - 5 } as CSSProperties} />
      <div
        ref={setNodeRef}
        className={`${styles.blockCard}${isOver ? ' ' + styles.blockCardOver : ''}`}
        style={cardStyle}
      >
        <div className={styles.blockHeader} onClick={() => onEditBlock(block)}>
          <span className={styles.blockTitle}>{block.name}</span>
          <span className={styles.blockTime}>{block.startTime}–{block.endTime}</span>
          <button
            className={styles.blockEditBtn}
            onClick={e => { e.stopPropagation(); onEditBlock(block) }}
            aria-label={t('day.ariaEditBlock')}
          >✎</button>
        </div>

        {block.notes && (
          <div className={styles.blockNotes}>{block.notes}</div>
        )}

        {items.length === 0 ? (
          <p className={styles.blockEmpty}>{isOver ? t('day.blockDropToAssign') : t('day.blockEmptyHint')}</p>
        ) : (
          <div className={styles.blockItemList}>
            {items.map(item => (
              <BlockItemRow key={item.id} item={item} onEdit={onEditItem} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
