import { useState, type CSSProperties } from 'react'
import { format, parseISO, addDays, isToday } from 'date-fns'
import {
  useWeekFocus, useCreateWeekFocus, useCreateWeekFocusMany, useAddWeekTasksLinked,
  useToggleWeekFocus, useDeleteWeekFocus,
} from '../../hooks/useWeekFocus'
import type { WeekFocusItem, WeekTaskLinkItem } from '../../hooks/useWeekFocus'
import { usePullWeekFocusToDay } from '../../hooks/useDayItems'
import { useRangeDayItems, groupByDate, maxPriority } from '../../hooks/useDayItemsSummary'
import type { DayItemSummaryRow } from '../../hooks/useDayItemsSummary'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import { useHabits } from '../../hooks/useHabits'
import { useTasksByIds, resolveTaskTitle, type Task, type TaskSource } from '../../hooks/useTasks'
import { useTaskStepCounts, type StepCount } from '../../hooks/useTaskSteps'
import { useSettings } from '../../hooks/useSettings'
import { weekDisplayStart, weekStart as computeWeekStart, monthStart as computeMonthStart, todayISO } from '../../lib/dates'
import FocusItemForm from '../planner/FocusItemForm'
import TaskSourceForm from '../planner/TaskSourceForm'
import type { MonthTaskPick } from '../planner/TaskSourceForm'
import ListBadge from '../day/ListBadge'
import { useT, useDateFnsLocale, type Key } from '../../i18n'
import styles from './WeekView.module.css'

const DAY_LABELS: { labelKey: Key }[] = [
  { labelKey: 'common.weekdayMon' },
  { labelKey: 'common.weekdayTue' },
  { labelKey: 'common.weekdayWed' },
  { labelKey: 'common.weekdayThu' },
  { labelKey: 'common.weekdayFri' },
  { labelKey: 'common.weekdaySat' },
  { labelKey: 'common.weekdaySun' },
]
const MAX_SHOWN  = 3   // max anchored items before "+N more"

// ── Priority accent helpers ────────────────────────────────────────────────────

function priorityBorderVar(p: 'high' | 'medium' | 'low' | null): string {
  if (p === 'high')   return '--ns-gold-rgb'
  if (p === 'low')    return '--ns-task-accent-rgb'
  if (p === 'medium') return '--ns-project-accent-rgb'
  return '--ns-border-faint'
}

// ── Title resolution ─────────────────────────────────────────────────────────

/** Never falls back to a bare source glyph — resolves the real title.
 *  Task-linked items (taskId set) resolve through the task instead of their
 *  own now-null title/treeNodeId/inboxItemId/habitId — otherwise every
 *  split task renders "Untitled" here (TASKS.md §3.3's flagged trap). */
function resolveEventTitle(
  item:     DayItemSummaryRow,
  nodeMap:  Map<string, { title: string }>,
  inboxMap: Map<string, { content: string }>,
  habitMap: Map<string, { name: string }>,
  taskMap:  Map<string, Task>,
  t:        ReturnType<typeof useT>,
): string {
  if (item.taskId) {
    const task = taskMap.get(item.taskId)
    if (task) return resolveTaskTitle(task, nodeMap, inboxMap, habitMap, t)
  }
  if (item.title) return item.title
  if (item.treeNodeId)  return nodeMap.get(item.treeNodeId)?.title ?? t('common.untitled')
  if (item.inboxItemId) return inboxMap.get(item.inboxItemId)?.content ?? t('common.untitled')
  if (item.habitId)     return habitMap.get(item.habitId)?.name ?? t('common.untitled')
  return t('common.untitled')
}

// ── Day column ─────────────────────────────────────────────────────────────────

interface DayColProps {
  date:     Date
  items:    DayItemSummaryRow[]
  nodeMap:  Map<string, { title: string }>
  inboxMap: Map<string, { content: string }>
  habitMap: Map<string, { name: string }>
  taskMap:  Map<string, Task>
  onSelect: () => void
}

function DayCol({ date, items, nodeMap, inboxMap, habitMap, taskMap, onSelect }: DayColProps) {
  const t = useT()
  const dateLocale = useDateFnsLocale()
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
      aria-label={t('month.openDayAriaLabel', { date: format(date, 'd MMMM', { locale: dateLocale }) })}
    >
      <div className={styles.dayHead}>
        <span className={styles.dayName}>{t(DAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1].labelKey)}</span>
        <span className={`${styles.dayNum}${isNow ? ' ' + styles.dayNumToday : ''}`}>{dayNum}</span>
      </div>

      <div className={styles.dayBody}>
        {shown.map(item => (
          <div key={item.id} className={styles.dayEvent}>
            <span className={styles.dayEventTime}>{item.startTime!.slice(0, 5)}</span>
            <span className={styles.dayEventTitle}>
              {resolveEventTitle(item, nodeMap, inboxMap, habitMap, taskMap, t)}
            </span>
          </div>
        ))}
        {extra > 0 && (
          <span className={styles.dayMore}>{t('week.moreCount', { n: extra })}</span>
        )}
        {floating.length > 0 && (
          <span className={styles.dayFloating}>
            {t('common.taskCount', { n: floating.length, count: floating.length })}
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
  /** When provided, renders the Feature 3/4 pulled-day indicator + pull action
   *  (used only by the standalone "Tasks this week" section). */
  pulledDates?: string[]
  onPull?:      () => void
  canPull?:     boolean
  /** The linked task's real source (tree/inbox), when item.taskId is set —
   *  overrides the badge, since item.source stays 'standalone' on a
   *  task-linked row deliberately (that's what keeps it in the Tasks
   *  section rather than Goals). Without this a live-linked task would
   *  misleadingly show "STANDALONE". */
  sourceOverride?: TaskSource
  /** Batched step count for item.taskId (SPEC §5.3 list badge + completion
   *  gate) — undefined/total<2 means "not a list", same rule as day items. */
  stepCount?: StepCount
}

function FocusRow({
  item, displayTitle, onToggle, onDelete, isPending, pulledDates, onPull, canPull, sourceOverride, stepCount,
}: FocusRowProps) {
  const t = useT()
  const dateLocale = useDateFnsLocale()
  const effectiveSource = sourceOverride ?? item.source
  const sourceLabel =
    effectiveSource === 'tree'       ? t('day.sourceBadgeTree')       :
    effectiveSource === 'inbox'      ? t('day.sourceBadgeInboxFrom')  :
    effectiveSource === 'habit'      ? t('day.focusTagHabit')         :
                                        t('day.sourceBadgeStandalone')

  const showPullControls = pulledDates !== undefined
  const isPulled = (pulledDates?.length ?? 0) > 0
  const dayLabels = (pulledDates ?? [])
    .map(d => format(parseISO(d), 'EEE', { locale: dateLocale }).toUpperCase())
    .join(', ')
  const isListTask = (stepCount?.total ?? 0) >= 2

  return (
    <div className={`${styles.focusRow}${item.isComplete ? ' ' + styles.focusRowDone : ''}`}>
      <button
        className={`${styles.check}${item.isComplete ? ' ' + styles.checkDone : ''}`}
        onClick={() => { if (!isListTask) onToggle() }}
        disabled={isPending || isListTask}
        aria-label={
          isListTask
            ? (item.isComplete ? t('common.completeDerivedFromSteps') : t('common.completeEveryStepHint'))
            : item.isComplete ? t('common.markIncomplete') : t('common.markComplete')
        }
        title={isListTask ? (item.isComplete ? t('common.completeDerivedFromSteps') : t('common.completeEveryStepHint')) : undefined}
      >
        {item.isComplete ? '✓' : ''}
      </button>
      <div className={styles.focusContent}>
        <span className={`${styles.focusTitle}${item.isComplete ? ' ' + styles.focusTitleDone : ''}`}>
          {displayTitle}
        </span>
        <span className={styles.focusSource}>{sourceLabel}</span>
        {isListTask && <ListBadge done={stepCount!.done} total={stepCount!.total} />}
      </div>
      {showPullControls && (
        isPulled ? (
          <span className={styles.pulledTag}>{t('week.pulledToDaysLabel', { days: dayLabels })}</span>
        ) : (
          <button
            className={styles.pullBtn}
            onClick={onPull}
            disabled={isPending || !canPull}
            title={canPull ? undefined : t('week.todayNotInWeek')}
          >
            {t('month.pullToToday')}
          </button>
        )
      )}
      <button
        className={styles.deleteBtn}
        onClick={onDelete}
        disabled={isPending}
        aria-label={t('common.remove')}
      >✕</button>
    </div>
  )
}

// ── Standalone task quick-add ───────────────────────────────────────────────────

interface QuickAddProps {
  placeholder: string
  onAdd:       (title: string) => void
  isPending:   boolean
}

function TaskQuickAdd({ placeholder, onAdd, isPending }: QuickAddProps) {
  const [value, setValue] = useState('')
  const t = useT()

  function submit() {
    const trimmed = value.trim()
    if (!trimmed || isPending) return
    onAdd(trimmed)
    setValue('')
  }

  return (
    <div className={styles.quickAddRow}>
      <input
        className={styles.quickAddInput}
        placeholder={placeholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        disabled={isPending}
      />
      <button
        className={styles.quickAddBtn}
        onClick={submit}
        disabled={isPending || !value.trim()}
      >{t('common.addButtonShort')}</button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  weekStart:   string
  onDaySelect: (date: string) => void
}

export default function WeekView({ weekStart, onDaySelect }: Props) {
  const [formOpen,     setFormOpen]     = useState(false)
  const [taskFormOpen, setTaskFormOpen] = useState(false)

  const t = useT()
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
  const { data: habits     = [] } = useHabits()
  const taskIds = [...rawItems.map(i => i.taskId), ...focusItems.map(i => i.taskId)]
  const { data: tasks = [] } = useTasksByIds(taskIds)
  const { data: stepCounts = new Map() } = useTaskStepCounts(focusItems.map(i => i.taskId))

  const { mutate: createFocus,     isPending: creating     } = useCreateWeekFocus()
  const { mutate: createFocusMany, isPending: creatingMany } = useCreateWeekFocusMany()
  const { mutate: addTasksLinked,  isPending: creatingTasks } = useAddWeekTasksLinked()
  const { mutate: toggleFocus, isPending: toggling  } = useToggleWeekFocus()
  const { mutate: deleteFocus, isPending: deleting  } = useDeleteWeekFocus()
  const { mutate: pullToDay,   isPending: pulling    } = usePullWeekFocusToDay()
  const isPending = creating || creatingMany || creatingTasks || toggling || deleting || pulling

  const nodeMap   = new Map(treeNodes.map(n => [n.id, n]))
  const inboxMap  = new Map(inboxItems.map(i => [i.id, i]))
  const habitMap  = new Map(habits.map(h => [h.id, h]))
  const taskMap   = new Map(tasks.map(t => [t.id, t]))
  const byDate    = groupByDate(rawItems)

  const days = Array.from({ length: 7 }, (_, i) => addDays(parseISO(displayStart), i))

  // Features 3/4: standalone tasks live in their own "Tasks this week"
  // section, separate from tree/inbox/habit items in "Weekly focus".
  const treeFocusItems = focusItems.filter(i => i.source !== 'standalone')
  const taskItems      = focusItems.filter(i => i.source === 'standalone')

  // focusId → dates it's been pulled to this week (origin_week_focus_id link).
  const pulledMap = new Map<string, string[]>()
  for (const item of rawItems) {
    if (!item.originWeekFocusId) continue
    const list = pulledMap.get(item.originWeekFocusId)
    if (list) list.push(item.date)
    else pulledMap.set(item.originWeekFocusId, [item.date])
  }
  const todayInThisWeek = computeWeekStart(todayISO()) === weekStart

  function displayTitle(item: WeekFocusItem): string {
    if (item.taskId) {
      const task = taskMap.get(item.taskId)
      if (task) return resolveTaskTitle(task, nodeMap, inboxMap, habitMap, t)
    }
    if (item.title) return item.title
    if (item.treeNodeId) return nodeMap.get(item.treeNodeId)?.title ?? t('goals.untitled')
    if (item.habitId) return habitMap.get(item.habitId)?.name ?? t('goals.untitled')
    if (item.inboxItemId) return inboxMap.get(item.inboxItemId)?.content ?? t('goals.untitled')
    return t('goals.untitled')
  }

  /** The linked task's real source, for FocusRow's badge — see
   *  FocusRowProps.sourceOverride. */
  function effectiveSource(item: WeekFocusItem): TaskSource | undefined {
    return item.taskId ? taskMap.get(item.taskId)?.source : undefined
  }

  function handleSaveStandalone(title: string) {
    createFocus(
      { weekStart, source: 'standalone', title },
      { onSuccess: () => setFormOpen(false) },
    )
  }

  function handleSaveTree(treeNodeIds: string[]) {
    createFocusMany(
      { weekStart, treeNodeIds },
      { onSuccess: () => setFormOpen(false) },
    )
  }

  function handleAddTask(title: string) {
    createFocus({ weekStart, source: 'standalone', title })
  }

  function handleAddTasksFromTree(treeNodeIds: string[]) {
    const items: WeekTaskLinkItem[] = treeNodeIds.map(treeNodeId => ({ source: 'tree', treeNodeId }))
    addTasksLinked({ weekStart, items }, { onSuccess: () => setTaskFormOpen(false) })
  }

  function handleAddTasksFromInbox(inboxItemIds: string[]) {
    const items: WeekTaskLinkItem[] = inboxItemIds.map(inboxItemId => ({ source: 'inbox', inboxItemId }))
    addTasksLinked({ weekStart, items }, { onSuccess: () => setTaskFormOpen(false) })
  }

  function handleAddTasksFromMonth(picks: MonthTaskPick[]) {
    const items: WeekTaskLinkItem[] = picks.map(p => ({
      taskId: p.taskId ?? undefined,
      title:  p.taskId ? undefined : (p.title ?? undefined),
    }))
    addTasksLinked({ weekStart, items }, { onSuccess: () => setTaskFormOpen(false) })
  }

  function handlePullTask(item: WeekFocusItem) {
    pullToDay({
      weekFocusId: item.id,
      date:        todayISO(),
      source:      effectiveSource(item) ?? item.source,
      title:       item.title,
      treeNodeId:  item.treeNodeId,
      inboxItemId: item.inboxItemId,
      habitId:     item.habitId,
      taskId:      item.taskId,
      isComplete:  item.isComplete,
    })
  }

  const focusedNodeIds = new Set(
    focusItems.filter(i => i.treeNodeId).map(i => i.treeNodeId as string)
  )

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
                  habitMap={habitMap}
                  taskMap={taskMap}
                  onSelect={() => onDaySelect(dateStr)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Weekly goals — tree/inbox/habit items pulled into the week */}
      <div className={styles.focusSection}>
        <div className={styles.focusHeader}>
          <span className={styles.focusDot} />
          <span className={styles.focusTitle}>{t('week.weeklyGoalsHeading')}</span>
          <span className={styles.focusCount}>· {treeFocusItems.length}</span>
          <button className={styles.addBtn} onClick={() => setFormOpen(true)}>{t('common.addButtonShort')}</button>
        </div>

        {treeFocusItems.length === 0 && !isLoading && (
          <p className={styles.emptyHint}>
            {t('week.emptyGoalsHint')}
          </p>
        )}

        <div className={styles.focusList}>
          {treeFocusItems.map(item => (
            <FocusRow
              key={item.id}
              item={item}
              displayTitle={displayTitle(item)}
              isPending={isPending}
              stepCount={item.taskId ? stepCounts.get(item.taskId) : undefined}
              onToggle={() => toggleFocus({
                id: item.id, weekStart, source: item.source,
                treeNodeId: item.treeNodeId, isComplete: !item.isComplete,
              })}
              onDelete={() => {
                if (!window.confirm(t('common.removeFromWeekConfirm', { title: displayTitle(item) }))) return
                deleteFocus({ id: item.id, weekStart, source: item.source, inboxItemId: item.inboxItemId })
              }}
            />
          ))}
        </div>
      </div>

      {/* Tasks this week — standalone, title-only, no tree link (Feature 4) */}
      <div className={styles.focusSection}>
        <div className={styles.focusHeader}>
          <span className={styles.focusDot} />
          <span className={styles.focusTitle}>{t('week.tasksThisWeekHeading')}</span>
          <span className={styles.focusCount}>· {taskItems.length}</span>
          <button className={styles.addBtn} onClick={() => setTaskFormOpen(true)}>{t('month.addFromTreeInboxButton')}</button>
        </div>

        <TaskQuickAdd
          placeholder={t('week.addTaskPlaceholder')}
          onAdd={handleAddTask}
          isPending={creating}
        />

        {taskItems.length === 0 && !isLoading && (
          <p className={styles.emptyHint}>{t('month.noStandaloneTasksHint')}</p>
        )}

        <div className={styles.focusList}>
          {taskItems.map(item => (
            <FocusRow
              key={item.id}
              item={item}
              displayTitle={displayTitle(item)}
              isPending={isPending}
              pulledDates={pulledMap.get(item.id) ?? []}
              canPull={todayInThisWeek}
              onPull={() => handlePullTask(item)}
              sourceOverride={effectiveSource(item)}
              stepCount={item.taskId ? stepCounts.get(item.taskId) : undefined}
              onToggle={() => toggleFocus({
                id: item.id, weekStart, source: item.source,
                treeNodeId: item.treeNodeId, isComplete: !item.isComplete,
                taskId: item.taskId,
              })}
              onDelete={() => {
                if (!window.confirm(t('common.removeFromWeekConfirm', { title: displayTitle(item) }))) return
                deleteFocus({
                  id: item.id, weekStart, source: item.source, inboxItemId: item.inboxItemId,
                  taskId: item.taskId,
                })
              }}
            />
          ))}
        </div>
      </div>

      {formOpen && (
        <FocusItemForm
          label={t('week.addWeeklyGoalLabel')}
          onClose={() => setFormOpen(false)}
          onSaveStandalone={handleSaveStandalone}
          onSaveTree={handleSaveTree}
          isSaving={creating || creatingMany}
          focusedNodeIds={focusedNodeIds}
          focusLabel={t('week.thisWeekLabel')}
        />
      )}

      {taskFormOpen && (
        <TaskSourceForm
          label={t('week.addTaskWeekLabel')}
          onClose={() => setTaskFormOpen(false)}
          onAddFromTree={handleAddTasksFromTree}
          onAddFromInbox={handleAddTasksFromInbox}
          monthStart={computeMonthStart(weekStart)}
          onAddFromMonth={handleAddTasksFromMonth}
          isSaving={creatingTasks}
        />
      )}
    </div>
  )
}
