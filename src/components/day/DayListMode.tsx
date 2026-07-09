import { useToggleDayItem, useDeleteDayItem } from '../../hooks/useDayItems'
import type { DayItem } from '../../hooks/useDayItems'
import styles from './DayListMode.module.css'

const SOURCE_TAG: Record<DayItem['source'], string> = {
  standalone: '• STANDALONE',
  tree:       '✦ GOAL TREE',
  inbox:      '⌵ INBOX',
}

interface Props {
  items: DayItem[]   // all items, anchored first then floating
}

export default function DayListMode({ items }: Props) {
  const { mutate: toggle, isPending: toggling } = useToggleDayItem()
  const { mutate: remove, isPending: removing  } = useDeleteDayItem()
  const isPending = toggling || removing

  const anchored = items.filter(i => i.startTime !== null)
  const floating = items.filter(i => i.startTime === null)

  function handleToggle(item: DayItem) {
    toggle({ id: item.id, isComplete: !item.isComplete, treeNodeId: item.treeNodeId })
  }

  function handleDelete(item: DayItem) {
    if (!window.confirm(`Delete "${item.displayTitle}"?`)) return
    remove(item.id)
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Nothing planned yet</p>
        <p className={styles.emptyHint}>Add items using the button above.</p>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {anchored.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>ANCHORED</span>
          {anchored.map(item => (
            <ListRow key={item.id} item={item} isPending={isPending}
              onToggle={() => handleToggle(item)}
              onDelete={() => handleDelete(item)}
            />
          ))}
        </section>
      )}
      {floating.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>FLOATING</span>
          {floating.map(item => (
            <ListRow key={item.id} item={item} isPending={isPending}
              onToggle={() => handleToggle(item)}
              onDelete={() => handleDelete(item)}
            />
          ))}
        </section>
      )}
    </div>
  )
}

interface RowProps {
  item:      DayItem
  isPending: boolean
  onToggle:  () => void
  onDelete:  () => void
}

function ListRow({ item, isPending, onToggle, onDelete }: RowProps) {
  return (
    <div
      className={`${styles.row}${item.isComplete ? ' ' + styles.rowDone : ''}`}
      style={item.colour ? { borderLeft: `3px solid ${item.colour}` } : undefined}
    >
      <button
        className={`${styles.check}${item.isComplete ? ' ' + styles.checkDone : ''}`}
        onClick={onToggle}
        disabled={isPending}
        aria-label={item.isComplete ? 'Mark incomplete' : 'Mark complete'}
      >
        {item.isComplete ? '✓' : ''}
      </button>
      <div className={styles.rowContent}>
        <span className={`${styles.rowTitle}${item.isComplete ? ' ' + styles.rowTitleDone : ''}`}>
          {item.displayTitle}
        </span>
        <div className={styles.rowMeta}>
          {item.startTime && (
            <span className={styles.rowTime}>{item.startTime}{item.endTime ? ` – ${item.endTime}` : ''}</span>
          )}
          <span className={`${styles.rowTag} ${styles['rowTag_' + item.source]}`}>
            {SOURCE_TAG[item.source]}
          </span>
          {item.treeNodeTitle && (
            <span className={styles.rowOrigin}>↳ {item.treeNodeTitle}</span>
          )}
        </div>
      </div>
      <button
        className={styles.deleteBtn}
        onClick={onDelete}
        disabled={isPending}
        aria-label="Delete"
      >✕</button>
    </div>
  )
}
