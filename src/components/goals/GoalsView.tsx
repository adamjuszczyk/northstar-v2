import { useMemo } from 'react'
import { useWeekFocus, useToggleWeekFocus } from '../../hooks/useWeekFocus'
import { useMonthFocus, useToggleMonthFocus } from '../../hooks/useMonthFocus'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import { useHabits } from '../../hooks/useHabits'
import { useSettings } from '../../hooks/useSettings'
import { useTodayISO } from '../../hooks/useTodayISO'
import { weekStart, weekDisplayStart, monthStart, formatWeekRange, formatMonthYear } from '../../lib/dates'
import { useT, useDateFnsLocale } from '../../i18n'
import styles from './GoalsView.module.css'

// ── Shared shape both WeekFocusItem and MonthFocusItem satisfy ──────────────────

type GoalSource = 'standalone' | 'tree' | 'inbox' | 'habit'

interface GoalItem {
  id:          string
  source:      GoalSource
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  habitId:     string | null
  isComplete:  boolean
}

function sourceLabel(source: GoalSource, t: ReturnType<typeof useT>): string {
  if (source === 'tree')  return t('day.sourceBadgeTree')
  if (source === 'inbox') return t('day.sourceBadgeInboxFrom')
  if (source === 'habit') return t('day.focusTagHabit')
  return t('day.sourceBadgeStandalone')
}

// ── Section (Week or Month) ─────────────────────────────────────────────────────

interface SectionProps {
  title:        string
  rangeLabel:   string
  items:        GoalItem[]
  isLoading:    boolean
  isPending:    boolean
  displayTitle: (item: GoalItem) => string
  onToggle:     (item: GoalItem) => void
}

function GoalsSection({ title, rangeLabel, items, isLoading, isPending, displayTitle, onToggle }: SectionProps) {
  const t = useT()

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionDot} />
        <span className={styles.sectionTitle}>{title}</span>
        <span className={styles.sectionRange}>{rangeLabel}</span>
        <span className={styles.sectionCount}>· {items.length}</span>
      </div>

      {isLoading ? (
        <div className={styles.loading}><span className={styles.loadingStar}>✦</span></div>
      ) : items.length === 0 ? (
        <p className={styles.emptyHint}>{t('goals.emptyHint')}</p>
      ) : (
        <div className={styles.list}>
          {items.map(item => (
            <div key={item.id} className={`${styles.row}${item.isComplete ? ' ' + styles.rowDone : ''}`}>
              <button
                className={`${styles.check}${item.isComplete ? ' ' + styles.checkDone : ''}`}
                onClick={() => onToggle(item)}
                disabled={isPending}
                aria-label={item.isComplete ? t('common.markIncomplete') : t('common.markComplete')}
              >
                {item.isComplete ? '✓' : ''}
              </button>
              <div className={styles.rowContent}>
                <span className={`${styles.rowTitle}${item.isComplete ? ' ' + styles.rowTitleDone : ''}`}>
                  {displayTitle(item)}
                </span>
                <span className={styles.rowSource}>{sourceLabel(item.source, t)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * Dedicated Goals screen (SPEC §6.5) — a display/overview surface for the
 * current week's and month's non-standalone focus items (the renamed
 * "Focus"/now-"Goals" sections in WeekView/MonthView). Mark-complete only;
 * creating and deleting goals still happens from the Week/Month planner
 * views, per the spec's own flagged assumption.
 */
export default function GoalsView() {
  const today = useTodayISO()
  const wkStart = weekStart(today)
  const moStart = monthStart(today)
  const { settings } = useSettings()
  const t = useT()
  const dateLocale = useDateFnsLocale()

  const { data: weekItems  = [], isLoading: loadingWeek  } = useWeekFocus(wkStart)
  const { data: monthItems = [], isLoading: loadingMonth } = useMonthFocus(moStart)
  const { data: treeNodes  = [] } = useTreeNodes()
  const { data: inboxItems = [] } = useInboxItems()
  const { data: habits     = [] } = useHabits()

  const { mutate: toggleWeek,  isPending: togglingWeek  } = useToggleWeekFocus()
  const { mutate: toggleMonth, isPending: togglingMonth } = useToggleMonthFocus()

  const nodeMap  = useMemo(() => new Map(treeNodes.map(n => [n.id, n])),   [treeNodes])
  const inboxMap = useMemo(() => new Map(inboxItems.map(i => [i.id, i])), [inboxItems])
  const habitMap = useMemo(() => new Map(habits.map(h => [h.id, h])),     [habits])

  function displayTitle(item: GoalItem): string {
    if (item.title) return item.title
    if (item.treeNodeId)  return nodeMap.get(item.treeNodeId)?.title    ?? t('goals.untitled')
    if (item.habitId)     return habitMap.get(item.habitId)?.name       ?? t('goals.untitled')
    if (item.inboxItemId) return inboxMap.get(item.inboxItemId)?.content ?? t('goals.untitled')
    return t('goals.untitled')
  }

  const weekGoals  = weekItems.filter(i => i.source !== 'standalone')
  const monthGoals = monthItems.filter(i => i.source !== 'standalone')

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <p className={styles.pageTitle}>{t('goals.pageTitle')}</p>
      </div>

      <div className={styles.body}>
        <GoalsSection
          title={t('goals.thisWeek')}
          rangeLabel={formatWeekRange(weekDisplayStart(wkStart, settings.weekStartsOn), dateLocale)}
          items={weekGoals}
          isLoading={loadingWeek}
          isPending={togglingWeek}
          displayTitle={displayTitle}
          onToggle={item => toggleWeek({
            id: item.id, weekStart: wkStart, source: item.source,
            treeNodeId: item.treeNodeId, isComplete: !item.isComplete,
          })}
        />
        <GoalsSection
          title={t('goals.thisMonth')}
          rangeLabel={formatMonthYear(moStart, dateLocale)}
          items={monthGoals}
          isLoading={loadingMonth}
          isPending={togglingMonth}
          displayTitle={displayTitle}
          onToggle={item => toggleMonth({
            id: item.id, monthStart: moStart, source: item.source,
            treeNodeId: item.treeNodeId, isComplete: !item.isComplete,
          })}
        />
      </div>
    </div>
  )
}
