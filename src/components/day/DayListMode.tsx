import { useToggleDayItem, useDeleteDayItem, useIncrementDayItemCounter } from '../../hooks/useDayItems'
import type { DayItem } from '../../hooks/useDayItems'
import styles from './DayListMode.module.css'

const SOURCE_TAG: Record<DayItem['source'], string> = {
  standalone: '• STANDALONE',
  tree:       '✦ GOAL TREE',
  inbox:      '⌵ INBOX',
  habit:      '◆ HABIT',
}

interface Props {
  items: DayItem[]   // all items, anchored first then floating
}

export default function DayListMode({ items }: Props) {
  const { mutate: toggle,    isPending: toggling    } = useToggleDayItem()
  const { mutate: remove,    isPending: removing    } = useDeleteDayItem()
  const { mutate: increment, isPending: incrementing } = useIncrementDayItemCounter()
  const isPending = toggling || removing || incrementing

  const anchored = items.filter(i => i.startTime !== null)
  const floating = items.filter(i => i.startTime === null)

  function handleToggle(item: DayItem) {
    toggle({ id: item.id, isComplete: !item.isComplete, treeNodeId: item.treeNodeId, habitId: item.habitId })
  }

  function handleIncrement(item: DayItem) {
    if (!item.habitId || item.counterTarget === null) return
    increment({ id: item.id, habitId: item.habitId, current: item.counterCurrent, target: item.counterTarget })
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
              onIncrement={() => handleIncrement(item)}
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
              onIncrement={() => handleIncrement(item)}
              onDelete={() => handleDelete(item)}
            />
          ))}
        </section>
      )}
    </div>
  )
}

interface RowProps {
  item:        DayItem
  isPending:   boolean
  onToggle:    () => void
  onIncrement: () => void
  onDelete:    () => void
}

function ListRow({ item, isPending, onToggle, onIncrement, onDelete }: RowProps) {
  const isCounter = item.counterTarget !== null

  return (
    <div
      className={`${styles.row}${item.isComplete ? ' ' + styles.rowDone : ''}`}
      style={item.colour ? { borderLeft: `3px solid ${item.colour}` } : undefined}
    >
      <button
        className={`${styles.check}${item.isComplete ? ' ' + styles.checkDone : ''}`}
        onClick={() => (isCounter && !item.isComplete ? onIncrement() : onToggle())}
        disabled={isPending}
        aria-label={item.isComplete ? 'Mark incomplete' : isCounter ? 'Log one' : 'Mark complete'}
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
          {isCounter && (
            <span className={styles.counterBadge}>{item.counterCurrent} / {item.counterTarget}</span>
          )}
          {(item.treeNodeTitle ?? item.habitName) && (
            <span className={styles.rowOrigin}>↳ {item.treeNodeTitle ?? item.habitName}</span>
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
