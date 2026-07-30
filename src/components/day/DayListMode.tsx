import { useToggleDayItem, useDeleteDayItem, useIncrementDayItemCounter } from '../../hooks/useDayItems'
import type { DayItem } from '../../hooks/useDayItems'
import ListBadge from './ListBadge'
import { useT } from '../../i18n'
import styles from './DayListMode.module.css'

interface Props {
  items: DayItem[]   // all items, anchored first then floating
}

export default function DayListMode({ items }: Props) {
  const t = useT()
  const { mutate: toggle,    isPending: toggling    } = useToggleDayItem()
  const { mutate: remove,    isPending: removing    } = useDeleteDayItem()
  const { mutate: increment, isPending: incrementing } = useIncrementDayItemCounter()
  const isPending = toggling || removing || incrementing

  const anchored = items.filter(i => i.startTime !== null)
  const floating = items.filter(i => i.startTime === null)

  function handleToggle(item: DayItem) {
    toggle({
      id: item.id, isComplete: !item.isComplete, treeNodeId: item.treeNodeId, habitId: item.habitId,
      taskId: item.taskId,
    })
  }

  function handleIncrement(item: DayItem) {
    if (!item.habitId || item.counterTarget === null) return
    increment({
      id: item.id, habitId: item.habitId, current: item.counterCurrent, target: item.counterTarget,
      taskId: item.taskId,
    })
  }

  function handleDelete(item: DayItem) {
    if (!window.confirm(t('common.deleteConfirm', { title: item.displayTitle }))) return
    remove(
      { id: item.id, source: item.source, inboxItemId: item.inboxItemId, taskId: item.taskId },
      { onError: e => window.alert(t('common.deleteError', { title: item.displayTitle, error: (e as Error).message })) },
    )
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>{t('day.emptyTitle')}</p>
        <p className={styles.emptyHint}>{t('day.emptyHint')}</p>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {anchored.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>{t('day.anchoredLabel')}</span>
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
          <span className={styles.sectionLabel}>{t('day.sectionLabelFloating')}</span>
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
  const t = useT()
  const isCounter  = item.counterTarget !== null
  const isListTask = item.stepsTotal >= 2

  const SOURCE_TAG: Record<DayItem['source'], string> = {
    standalone: t('day.sourceBadgeStandalone'),
    tree:       t('day.sourceBadgeTree'),
    inbox:      t('day.focusTagInbox'),
    habit:      t('day.focusTagHabit'),
  }

  return (
    <div
      className={`${styles.row}${item.isComplete ? ' ' + styles.rowDone : ''}`}
      style={item.colour ? { borderLeft: `3px solid ${item.colour}` } : undefined}
    >
      <button
        className={`${styles.check}${item.isComplete ? ' ' + styles.checkDone : ''}`}
        onClick={() => {
          if (isListTask) return
          isCounter && !item.isComplete ? onIncrement() : onToggle()
        }}
        disabled={isPending || isListTask}
        aria-label={
          isListTask
            ? (item.isComplete ? t('common.completeDerivedFromSteps') : t('common.completeEveryStepHint'))
            : item.isComplete ? t('common.markIncomplete') : isCounter ? t('day.ariaLogOne') : t('common.markComplete')
        }
        title={isListTask ? (item.isComplete ? t('common.completeDerivedFromSteps') : t('common.completeEveryStepHint')) : undefined}
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
          {isListTask && <ListBadge done={item.stepsDone} total={item.stepsTotal} />}
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
        aria-label={t('common.delete')}
      >✕</button>
    </div>
  )
}
