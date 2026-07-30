import { useState, type CSSProperties } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useToggleDayItem, useDeleteDayItem, useIncrementDayItemCounter } from '../../hooks/useDayItems'
import type { DayItem } from '../../hooks/useDayItems'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useT } from '../../i18n'
import type { Key } from '../../i18n'
import ListBadge from './ListBadge'
import styles from './FloatingPool.module.css'

// ── Source config ──────────────────────────────────────────────────────────────

const SOURCE_CFG = {
  tree:       { accentVar: '--ns-gold',           accentRgbVar: '--ns-gold-rgb',           tagKey: 'day.sourceBadgeTree'        as Key, dashed: false },
  standalone: { accentVar: '--ns-task-accent',    accentRgbVar: '--ns-task-accent-rgb',    tagKey: 'day.sourceBadgeStandalone'  as Key, dashed: false },
  inbox:      { accentVar: '--ns-project-accent', accentRgbVar: '--ns-project-accent-rgb', tagKey: 'day.sourceBadgeInboxFrom'   as Key, dashed: true  },
  habit:      { accentVar: '--ns-ok',             accentRgbVar: '--ns-ok-rgb',             tagKey: 'day.focusTagHabit'          as Key, dashed: false },
} as const

function sourceKey(item: DayItem): keyof typeof SOURCE_CFG {
  if (item.source === 'tree')  return 'tree'
  if (item.source === 'inbox') return 'inbox'
  if (item.source === 'habit') return 'habit'
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
  item:        DayItem
  isPending:   boolean
  onEdit:      (item: DayItem) => void
  onToggle:    () => void
  onIncrement: () => void
  onDelete:    () => void
}

function FloatingCard({ item, isPending, onEdit, onToggle, onIncrement, onDelete }: CardProps) {
  const t = useT()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id })
  const cfg = SOURCE_CFG[sourceKey(item)]
  const { accentVar, accentRgbVar } = accentVars(item)
  const isCounter = item.counterTarget !== null
  // Completion gate (SPEC §5.3): a list (2+ steps) can't be checked off
  // directly — it derives from steps instead. Doesn't apply to counter
  // items independently completing via taps (SPEC §4.4's "two layers
  // coexist"), but a task-linked counter that's also a list still shouldn't
  // let the direct checkbox force-complete past its own steps.
  const isListTask = item.stepsTotal >= 2

  const cardStyle: CSSProperties = {
    '--fp-accent':     `var(${accentVar})`,
    '--fp-accent-rgb': `var(${accentRgbVar})`,
    '--fp-border':     cfg.dashed ? 'dashed' : 'solid',
    opacity:           isDragging ? 0 : undefined,
  } as CSSProperties

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
      onClick={() => onEdit(item)}
      {...attributes}
      {...listeners}
    >
      <button
        className={`${styles.check}${item.isComplete ? ' ' + styles.checkDone : ''}`}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation()
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

      <div className={styles.content}>
        <div className={styles.topRow}>
          {item.colour && <span className={styles.colourDot} style={{ background: item.colour }} />}
          <span className={`${styles.title}${item.isComplete ? ' ' + styles.titleDone : ''}`}>
            {item.displayTitle}
          </span>
          {isListTask && <ListBadge done={item.stepsDone} total={item.stepsTotal} />}
          {isCounter && (
            <span className={styles.counterBadge}>{t('day.counterBadgeProgress', { current: item.counterCurrent, target: item.counterTarget ?? 0 })}</span>
          )}
          {item.source === 'tree' && item.treeNodeId && !item.isComplete && (
            <span className={styles.inProgressBadge}>
              <span className={styles.inProgressDot} />
              {t('day.inProgressBadge')}
            </span>
          )}
          {item.priority === 'high' && <span className={styles.priBadgeHigh}>{t('day.priorityHigh')}</span>}
          {item.priority === 'low'  && <span className={styles.priBadgeLow}>{t('day.priorityLow')}</span>}
          {/* Compact mobile-only priority indicator — replaces the text badges above */}
          <span className={styles.priorityDot} />
        </div>
        <div className={styles.metaRow}>
          <span className={styles.tag}>{t(cfg.tagKey)}</span>
          {(item.treeNodeTitle || item.inboxContent || item.habitName) && (
            <span className={styles.origin}>{t('day.originLabel', { origin: item.treeNodeTitle ?? item.inboxContent ?? item.habitName ?? '' })}</span>
          )}
        </div>
      </div>

      <button
        className={styles.deleteBtn}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onDelete() }}
        disabled={isPending}
        aria-label={t('day.removeFromDayLabel')}
      >✕</button>
    </div>
  )
}

// ── Pool panel ─────────────────────────────────────────────────────────────────

interface Props {
  items:  DayItem[]
  onEdit: (item: DayItem) => void
}

export default function FloatingPool({ items, onEdit }: Props) {
  const t = useT()
  const { setNodeRef: setPoolRef, isOver: poolOver } = useDroppable({ id: 'pool-drop' })
  const isMobile = useIsMobile()
  // Mobile-only collapsible drawer — collapsed by default. Meaningless on
  // desktop, where the list always renders regardless of this state.
  const [expanded, setExpanded] = useState(false)
  const showList = !isMobile || expanded

  const { mutate: toggle,    isPending: toggling    } = useToggleDayItem()
  const { mutate: remove,    isPending: removing    } = useDeleteDayItem()
  const { mutate: increment, isPending: incrementing } = useIncrementDayItemCounter()
  const isPending = toggling || removing || incrementing

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
    if (!window.confirm(t('common.removeFromTodayConfirm', { title: item.displayTitle }))) return
    remove(
      { id: item.id, source: item.source, inboxItemId: item.inboxItemId, taskId: item.taskId },
      { onError: e => window.alert(t('common.removeError', { title: item.displayTitle, error: (e as Error).message })) },
    )
  }

  const completedCount = items.filter(i => i.isComplete).length

  return (
    <div
      ref={setPoolRef}
      className={`${styles.panel}${poolOver ? ' ' + styles.panelDropOver : ''}`}
    >
      <div className={styles.panelHeader}>
        <button
          className={styles.headerTop}
          onClick={() => isMobile && setExpanded(e => !e)}
          aria-expanded={showList}
          aria-label={isMobile ? (expanded ? t('day.collapsePoolLabel') : t('day.expandPoolLabel')) : undefined}
        >
          <span className={styles.headerDot} />
          <span className={styles.headerTitle}>{t('day.floatingPoolTitle')}</span>
          <span className={styles.headerCount}>
            <span className={styles.headerCountDesktop}>{t('day.poolCountBadge', { n: items.length })}</span>
            <span className={styles.headerCountMobile}>{t('day.progressDone', { done: completedCount, total: items.length })}</span>
          </span>
          <span className={styles.headerSpacer} />
          {isMobile && (
            <span className={`${styles.headerChevron}${expanded ? ' ' + styles.headerChevronOpen : ''}`}>⌄</span>
          )}
        </button>
        <p className={styles.headerHint}>{t('day.floatingPoolHint')}</p>

        <div className={styles.legend}>
          {[
            { labelKey: 'day.legendGoalTree'   as Key, accentVar: '--ns-gold',           dashed: false },
            { labelKey: 'day.legendStandalone' as Key, accentVar: '--ns-task-accent',    dashed: false },
            { labelKey: 'day.legendFromInbox'  as Key, accentVar: '--ns-project-accent', dashed: true  },
            { labelKey: 'day.fieldLabelHabit'  as Key, accentVar: '--ns-ok',             dashed: false },
          ].map(({ labelKey, accentVar, dashed }) => (
            <span key={labelKey} className={styles.legendChip}>
              <span
                className={styles.legendDot}
                style={{
                  background:  dashed ? 'transparent' : `var(${accentVar})`,
                  borderStyle: dashed ? 'dashed' : 'none',
                  borderWidth: dashed ? '1.5px' : 0,
                  borderColor: dashed ? `var(${accentVar})` : 'transparent',
                } as CSSProperties}
              />
              {t(labelKey)}
            </span>
          ))}
        </div>
      </div>

      {showList && (
        <div className={styles.list}>
          {items.length === 0 && (
            <p className={styles.empty}>
              {poolOver
                ? t('day.poolDropHint')
                : t('day.poolEmptyState')}
            </p>
          )}
          {items.map(item => (
            <FloatingCard
              key={item.id}
              item={item}
              isPending={isPending}
              onEdit={onEdit}
              onToggle={() => handleToggle(item)}
              onIncrement={() => handleIncrement(item)}
              onDelete={() => handleDelete(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
