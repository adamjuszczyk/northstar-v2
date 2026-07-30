import { useState, type CSSProperties } from 'react'
import { format, parseISO, addDays, endOfMonth, getDay, isToday } from 'date-fns'
import {
  useMonthFocus, useCreateMonthFocus, useCreateMonthFocusMany, useAddMonthTasksLinked,
  useToggleMonthFocus, useDeleteMonthFocus,
} from '../../hooks/useMonthFocus'
import type { MonthFocusItem, MonthTaskLinkItem } from '../../hooks/useMonthFocus'
import { usePullMonthFocusToDay } from '../../hooks/useDayItems'
import { useRangeDayItems, groupByDate, maxPriority } from '../../hooks/useDayItemsSummary'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import { useHabits } from '../../hooks/useHabits'
import { useTasksByIds, resolveTaskTitle, type Task, type TaskSource } from '../../hooks/useTasks'
import { useTaskStepCounts, type StepCount } from '../../hooks/useTaskSteps'
import { useSettings } from '../../hooks/useSettings'
import { monthStart as computeMonthStart, todayISO } from '../../lib/dates'
import { useT, useDateFnsLocale, type Key } from '../../i18n'
import FocusItemForm from '../planner/FocusItemForm'
import TaskSourceForm from '../planner/TaskSourceForm'
import ListBadge from '../day/ListBadge'
import styles from './MonthView.module.css'

const DAY_NAMES_MON_FIRST: { labelKey: Key }[] = [
  { labelKey: 'common.weekdayMon' },
  { labelKey: 'common.weekdayTue' },
  { labelKey: 'common.weekdayWed' },
  { labelKey: 'common.weekdayThu' },
  { labelKey: 'common.weekdayFri' },
  { labelKey: 'common.weekdaySat' },
  { labelKey: 'common.weekdaySun' },
]
const DAY_NAMES_SUN_FIRST: { labelKey: Key }[] = [
  { labelKey: 'common.weekdaySun' },
  { labelKey: 'common.weekdayMon' },
  { labelKey: 'common.weekdayTue' },
  { labelKey: 'common.weekdayWed' },
  { labelKey: 'common.weekdayThu' },
  { labelKey: 'common.weekdayFri' },
  { labelKey: 'common.weekdaySat' },
]

// ── Priority accent helpers ────────────────────────────────────────────────────

function priorityRgbVar(p: 'high' | 'medium' | 'low' | null): string {
  if (p === 'high')   return '--ns-gold-rgb'
  if (p === 'medium') return '--ns-project-accent-rgb'
  if (p === 'low')    return '--ns-task-accent-rgb'
  return ''
}

// Build the grid: rows respect weekStartsOn, pad with null for out-of-month days
function buildCalendarGrid(monthStartISO: string, weekStartsOn: 0 | 1): (Date | null)[] {
  const first = parseISO(monthStartISO)
  const last  = endOfMonth(first)
  // getDay: 0=Sun…6=Sat. Mon-first: shift so Mon=0. Sun-first: already 0-based.
  const startPad = weekStartsOn === 1 ? (getDay(first) + 6) % 7 : getDay(first)

  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)

  let cur = first
  while (cur <= last) {
    cells.push(cur)
    cur = addDays(cur, 1)
  }
  const endPad = (7 - (cells.length % 7)) % 7
  for (let i = 0; i < endPad; i++) cells.push(null)
  return cells
}

// ── Day cell ───────────────────────────────────────────────────────────────────

interface DayCellProps {
  date:     Date
  items:    ReturnType<typeof groupByDate> extends Map<string, infer V> ? V : never
  onSelect: () => void
}

function DayCell({ date, items, onSelect }: DayCellProps) {
  const t = useT()
  const dateLocale = useDateFnsLocale()
  const prio    = maxPriority(items)
  const isNow   = isToday(date)
  const dayNum  = format(date, 'd')

  const anchored = items.filter(i => i.startTime !== null)
  const floating = items.filter(i => i.startTime === null)

  const accentStyle = prio
    ? { '--day-accent-rgb': `var(${priorityRgbVar(prio)})` } as CSSProperties
    : undefined

  return (
    <button
      className={`${styles.dayCell}${isNow ? ' ' + styles.dayCellToday : ''}${items.length ? ' ' + styles.dayCellActive : ''}`}
      style={accentStyle}
      onClick={onSelect}
      aria-label={t('month.openDayAriaLabel', { date: format(date, 'd MMMM', { locale: dateLocale }) })}
    >
      <span className={`${styles.dayNum}${isNow ? ' ' + styles.dayNumToday : ''}`}>
        {dayNum}
      </span>

      {prio && (
        <span className={styles.prioBar} style={accentStyle} />
      )}

      {anchored.length > 0 && (
        <span className={styles.itemCount}>{t('month.anchoredCount', { n: anchored.length })}</span>
      )}
      {floating.length > 0 && (
        <span className={styles.floatCount}>{t('common.taskCount', { n: floating.length, count: floating.length })}</span>
      )}
    </button>
  )
}

// ── Focus item row ─────────────────────────────────────────────────────────────

interface FocusRowProps {
  item:         MonthFocusItem
  displayTitle: string
  onToggle:     () => void
  onDelete:     () => void
  isPending:    boolean
  /** When provided, renders the Feature 3/5 pulled-day indicator + pull action
   *  (used only by the standalone "Tasks this month" section). */
  pulledDates?: string[]
  onPull?:      () => void
  canPull?:     boolean
  /** The linked task's real source, when item.taskId is set — see
   *  WeekView's FocusRowProps.sourceOverride for the full reasoning. */
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
    effectiveSource === 'tree'  ? t('day.sourceBadgeTree')     :
    effectiveSource === 'inbox' ? t('day.sourceBadgeInboxFrom') :
    effectiveSource === 'habit' ? t('day.focusTagHabit')        :
                                   t('day.sourceBadgeStandalone')

  const showPullControls = pulledDates !== undefined
  const isPulled = (pulledDates?.length ?? 0) > 0
  const dayLabels = (pulledDates ?? [])
    .map(d => format(parseISO(d), 'EEE d', { locale: dateLocale }).toUpperCase())
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
          <span className={styles.pulledTag}>→ {dayLabels}</span>
        ) : (
          <button
            className={styles.pullBtn}
            onClick={onPull}
            disabled={isPending || !canPull}
            title={canPull ? undefined : t('month.todayNotInMonth')}
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
  monthStart:  string
  onDaySelect: (date: string) => void
}

export default function MonthView({ monthStart, onDaySelect }: Props) {
  const [formOpen,     setFormOpen]     = useState(false)
  const [taskFormOpen, setTaskFormOpen] = useState(false)

  const { settings } = useSettings()
  const t = useT()
  const dayNames = settings.weekStartsOn === 0 ? DAY_NAMES_SUN_FIRST : DAY_NAMES_MON_FIRST

  const monthEnd = format(endOfMonth(parseISO(monthStart)), 'yyyy-MM-dd')

  const { data: rawItems   = [], isLoading: loadingItems } = useRangeDayItems(monthStart, monthEnd)
  const { data: focusItems = [], isLoading: loadingFocus } = useMonthFocus(monthStart)
  const { data: treeNodes  = [] } = useTreeNodes()
  const { data: inboxItems = [] } = useInboxItems()
  const { data: habits     = [] } = useHabits()
  const { data: tasks = [] } = useTasksByIds(focusItems.map(i => i.taskId))
  const { data: stepCounts = new Map() } = useTaskStepCounts(focusItems.map(i => i.taskId))

  const { mutate: createFocus,     isPending: creating     } = useCreateMonthFocus()
  const { mutate: createFocusMany, isPending: creatingMany } = useCreateMonthFocusMany()
  const { mutate: addTasksLinked,  isPending: creatingTasks } = useAddMonthTasksLinked()
  const { mutate: toggleFocus, isPending: toggling  } = useToggleMonthFocus()
  const { mutate: deleteFocus, isPending: deleting  } = useDeleteMonthFocus()
  const { mutate: pullToDay,   isPending: pulling    } = usePullMonthFocusToDay()
  const isPending = creating || creatingMany || creatingTasks || toggling || deleting || pulling

  const nodeMap  = new Map(treeNodes.map(n => [n.id, n]))
  const inboxMap = new Map(inboxItems.map(i => [i.id, i]))
  const habitMap = new Map(habits.map(h => [h.id, h]))
  const taskMap  = new Map(tasks.map(t => [t.id, t]))
  const byDate   = groupByDate(rawItems)
  const cells    = buildCalendarGrid(monthStart, settings.weekStartsOn)

  const isLoading = loadingItems || loadingFocus

  // Features 3/5: standalone tasks live in their own "Tasks this month"
  // section, separate from tree/inbox/habit items in "Monthly focus".
  const treeFocusItems = focusItems.filter(i => i.source !== 'standalone')
  const taskItems      = focusItems.filter(i => i.source === 'standalone')

  // focusId → dates it's been pulled to this month (origin_month_focus_id link).
  const pulledMap = new Map<string, string[]>()
  for (const item of rawItems) {
    if (!item.originMonthFocusId) continue
    const list = pulledMap.get(item.originMonthFocusId)
    if (list) list.push(item.date)
    else pulledMap.set(item.originMonthFocusId, [item.date])
  }
  const todayInThisMonth = computeMonthStart(todayISO()) === monthStart

  function displayTitle(item: MonthFocusItem): string {
    const untitled = t('goals.untitled')
    if (item.taskId) {
      const task = taskMap.get(item.taskId)
      if (task) return resolveTaskTitle(task, nodeMap, inboxMap, habitMap, t)
    }
    if (item.title) return item.title
    if (item.treeNodeId) return nodeMap.get(item.treeNodeId)?.title ?? untitled
    if (item.habitId) return habitMap.get(item.habitId)?.name ?? untitled
    if (item.inboxItemId) return inboxMap.get(item.inboxItemId)?.content ?? untitled
    return untitled
  }

  /** The linked task's real source, for FocusRow's badge. */
  function effectiveSource(item: MonthFocusItem): TaskSource | undefined {
    return item.taskId ? taskMap.get(item.taskId)?.source : undefined
  }

  function handleSaveStandalone(title: string) {
    createFocus(
      { monthStart, source: 'standalone', title },
      { onSuccess: () => setFormOpen(false) },
    )
  }

  function handleSaveTree(treeNodeIds: string[]) {
    createFocusMany(
      { monthStart, treeNodeIds },
      { onSuccess: () => setFormOpen(false) },
    )
  }

  function handleAddTask(title: string) {
    createFocus({ monthStart, source: 'standalone', title })
  }

  function handleAddTasksFromTree(treeNodeIds: string[]) {
    const items: MonthTaskLinkItem[] = treeNodeIds.map(treeNodeId => ({ source: 'tree', treeNodeId }))
    addTasksLinked({ monthStart, items }, { onSuccess: () => setTaskFormOpen(false) })
  }

  function handleAddTasksFromInbox(inboxItemIds: string[]) {
    const items: MonthTaskLinkItem[] = inboxItemIds.map(inboxItemId => ({ source: 'inbox', inboxItemId }))
    addTasksLinked({ monthStart, items }, { onSuccess: () => setTaskFormOpen(false) })
  }

  function handlePullTask(item: MonthFocusItem) {
    pullToDay({
      monthFocusId: item.id,
      date:         todayISO(),
      source:       effectiveSource(item) ?? item.source,
      title:        item.title,
      treeNodeId:   item.treeNodeId,
      inboxItemId:  item.inboxItemId,
      habitId:      item.habitId,
      taskId:       item.taskId,
      isComplete:   item.isComplete,
    })
  }

  const focusedNodeIds = new Set(
    focusItems.filter(i => i.treeNodeId).map(i => i.treeNodeId as string)
  )

  return (
    <div className={styles.page}>

      {/* Calendar grid */}
      <div className={styles.calWrap}>
        {/* Day-of-week header */}
        <div className={styles.dayHeader}>
          {dayNames.map(({ labelKey }) => (
            <span key={labelKey} className={styles.dayLabel}>{t(labelKey)}</span>
          ))}
        </div>

        {isLoading ? (
          <div className={styles.loading}><span className={styles.loadingStar}>✦</span></div>
        ) : (
          <div className={styles.grid}>
            {cells.map((date, i) =>
              date === null
                ? <div key={`pad-${i}`} className={styles.emptyCell} />
                : (
                  <DayCell
                    key={format(date, 'yyyy-MM-dd')}
                    date={date}
                    items={byDate.get(format(date, 'yyyy-MM-dd')) ?? []}
                    onSelect={() => onDaySelect(format(date, 'yyyy-MM-dd'))}
                  />
                )
            )}
          </div>
        )}
      </div>

      {/* Monthly goals — tree/inbox/habit items pulled into the month */}
      <div className={styles.focusSection}>
        <div className={styles.focusHeader}>
          <span className={styles.focusDot} />
          <span className={styles.focusSectionTitle}>{t('month.monthlyGoalsTitle')}</span>
          <span className={styles.focusCount}>· {treeFocusItems.length}</span>
          <button className={styles.addBtn} onClick={() => setFormOpen(true)}>{t('common.addButtonShort')}</button>
        </div>

        {treeFocusItems.length === 0 && !isLoading && (
          <p className={styles.emptyHint}>
            {t('month.noGoalsHint')}
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
                id: item.id, monthStart, source: item.source,
                treeNodeId: item.treeNodeId, isComplete: !item.isComplete,
              })}
              onDelete={() => {
                if (!window.confirm(t('common.removeFromMonthConfirm', { title: displayTitle(item) }))) return
                deleteFocus({ id: item.id, monthStart, source: item.source, inboxItemId: item.inboxItemId })
              }}
            />
          ))}
        </div>
      </div>

      {/* Tasks this month — standalone, title-only, no tree link (Feature 5) */}
      <div className={styles.focusSection}>
        <div className={styles.focusHeader}>
          <span className={styles.focusDot} />
          <span className={styles.focusSectionTitle}>{t('month.tasksThisMonthTitle')}</span>
          <span className={styles.focusCount}>· {taskItems.length}</span>
          <button className={styles.addBtn} onClick={() => setTaskFormOpen(true)}>{t('month.addFromTreeInboxButton')}</button>
        </div>

        <TaskQuickAdd
          placeholder={t('month.addTaskPlaceholder')}
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
              canPull={todayInThisMonth}
              onPull={() => handlePullTask(item)}
              sourceOverride={effectiveSource(item)}
              stepCount={item.taskId ? stepCounts.get(item.taskId) : undefined}
              onToggle={() => toggleFocus({
                id: item.id, monthStart, source: item.source,
                treeNodeId: item.treeNodeId, isComplete: !item.isComplete,
                taskId: item.taskId,
              })}
              onDelete={() => {
                if (!window.confirm(t('common.removeFromMonthConfirm', { title: displayTitle(item) }))) return
                deleteFocus({
                  id: item.id, monthStart, source: item.source, inboxItemId: item.inboxItemId,
                  taskId: item.taskId,
                })
              }}
            />
          ))}
        </div>
      </div>

      {formOpen && (
        <FocusItemForm
          label={t('month.addMonthlyGoalLabel')}
          onClose={() => setFormOpen(false)}
          onSaveStandalone={handleSaveStandalone}
          onSaveTree={handleSaveTree}
          isSaving={creating || creatingMany}
          focusedNodeIds={focusedNodeIds}
          focusLabel={t('month.focusLabelThisMonth')}
        />
      )}

      {taskFormOpen && (
        <TaskSourceForm
          label={t('month.addTaskLabel')}
          onClose={() => setTaskFormOpen(false)}
          onAddFromTree={handleAddTasksFromTree}
          onAddFromInbox={handleAddTasksFromInbox}
          isSaving={creatingTasks}
        />
      )}
    </div>
  )
}
