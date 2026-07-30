import { useState, useMemo, useRef, type CSSProperties } from 'react'
import { format, parseISO, isToday, addDays, subDays } from 'date-fns'
import {
  DndContext, DragOverlay, pointerWithin,
  MouseSensor, TouchSensor, useSensors, useSensor,
  type DragStartEvent, type DragMoveEvent, type DragEndEvent,
} from '@dnd-kit/core'
import {
  useDayItems, useUpdateDayItem,
  PXH, TOPPAD, decimalToTimeStr, timeToDecimal,
} from '../../hooks/useDayItems'
import type { DayItem } from '../../hooks/useDayItems'
import { useTreeNodes }  from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import { useHabits }     from '../../hooks/useHabits'
import { useLines }  from '../../hooks/useLines'
import type { Line } from '../../hooks/useLines'
import { useBlocks } from '../../hooks/useBlocks'
import type { Block } from '../../hooks/useBlocks'
import { useTasksByIds, resolveTaskTitle } from '../../hooks/useTasks'
import { useTaskStepCounts } from '../../hooks/useTaskSteps'
import DayTimeline      from './DayTimeline'
import FloatingPool     from './FloatingPool'
import DayListMode      from './DayListMode'
import DayItemForm      from './DayItemForm'
import DayItemEditForm  from './DayItemEditForm'
import LineForm         from './LineForm'
import BlockForm        from './BlockForm'
import ApplyTemplateSheet from './ApplyTemplateSheet'
import SaveDayAsTemplateSheet from './SaveDayAsTemplateSheet'
import { useT, useDateFnsLocale } from '../../i18n'
import type { Locale } from 'date-fns'
import styles from './DayView.module.css'

type Mode = 'schedule' | 'list'

function fmtDate(dateStr: string, locale: Locale): string {
  return format(parseISO(dateStr), 'EEEE d MMMM yyyy', { locale })
}

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

// ── Drag preview card (rendered in DragOverlay) ────────────────────────────────

function DragPreview({ item }: { item?: DayItem }) {
  if (!item) return null
  return (
    <div className={styles.dragPreview}>
      <span className={styles.dragPreviewTitle}>{item.displayTitle}</span>
      {item.startTime && <span className={styles.dragPreviewTime}>{item.startTime}</span>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  date:          string
  onDateChange?: (d: string) => void
}

export default function DayView({ date, onDateChange }: Props) {
  const t = useT()
  const dateLocale = useDateFnsLocale()
  const [mode,      setMode]      = useState<Mode>('schedule')
  const [formOpen,  setFormOpen]  = useState(false)
  const [editItem,  setEditItem]  = useState<DayItem | null>(null)
  const [activeId,  setActiveId]  = useState<string | null>(null)
  const [dropTime,  setDropTime]  = useState<string | null>(null)
  const [lineFormOpen,  setLineFormOpen]  = useState(false)
  const [editLine,      setEditLine]      = useState<Line | null>(null)
  const [blockFormOpen, setBlockFormOpen] = useState(false)
  const [editBlock,     setEditBlock]     = useState<Block | null>(null)
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)

  // Ref to the DayTimeline scroll container — used for drop time calculation
  const timelineScrollRef = useRef<HTMLDivElement | null>(null)

  const { data: rawItems   = [], isLoading, error } = useDayItems(date)
  const { data: treeNodes  = [] } = useTreeNodes()
  const { data: inboxItems = [] } = useInboxItems()
  const { data: habits     = [] } = useHabits()
  const { data: lines      = [] } = useLines(date)
  const { data: blocks     = [] } = useBlocks(date)
  const { data: tasks      = [] } = useTasksByIds(rawItems.map(i => i.taskId))
  const { data: stepCounts = new Map() } = useTaskStepCounts(rawItems.map(i => i.taskId))
  const { mutate: updateItem } = useUpdateDayItem()

  // Resolve display titles from cached tree/inbox/habit data. Task-linked
  // items (taskId set) resolve through the task instead — their own
  // title/treeNodeId/inboxItemId/habitId are null (TASKS.md §3.3 rule 1).
  const items: DayItem[] = useMemo(() => {
    const nodeMap  = new Map(treeNodes.map(n  => [n.id,  n]))
    const inboxMap = new Map(inboxItems.map(i => [i.id, i]))
    const habitMap = new Map(habits.map(h => [h.id, h]))
    const taskMap  = new Map(tasks.map(t => [t.id, t]))
    return rawItems.map(item => {
      const treeNode  = item.treeNodeId  ? nodeMap.get(item.treeNodeId)   : null
      const inboxItem = item.inboxItemId ? inboxMap.get(item.inboxItemId) : null
      const habit     = item.habitId     ? habitMap.get(item.habitId)     : null
      const task      = item.taskId      ? taskMap.get(item.taskId)       : null
      // "1/3" list badge + completion-checkbox gate (SPEC §5.3) — a task
      // with 0 or 1 steps isn't a "list", so stepsTotal < 2 means plain.
      const counts    = item.taskId ? stepCounts.get(item.taskId) : undefined
      const stepsDone  = counts?.done  ?? 0
      const stepsTotal = counts?.total ?? 0

      if (task) {
        // A task can itself be tree/inbox/habit-sourced — resolve one more
        // level through the same maps rather than the item's own (null)
        // reference fields.
        const taskTreeNode  = task.treeNodeId  ? nodeMap.get(task.treeNodeId)   : null
        const taskInboxItem = task.inboxItemId ? inboxMap.get(task.inboxItemId) : null
        const taskHabit     = task.habitId     ? habitMap.get(task.habitId)     : null
        return {
          ...item,
          // habitId backfilled from the task (SPEC §4.4: habit tracking
          // stays independent of Task Lists & Split, which means a
          // materialized habit-sourced item's own counter/increment
          // handling still needs the real habit id — item.habitId itself
          // is null once materialized, per rule 1). treeNodeId/inboxItemId
          // are deliberately left as-is (still null) — nothing currently
          // reads them directly the way the counter path reads habitId.
          habitId:       task.habitId,
          treeNodeTitle: taskTreeNode?.title    ?? null,
          treeNodeType:  taskTreeNode?.type     ?? null,
          inboxContent:  taskInboxItem?.content ?? null,
          habitName:     taskHabit?.name        ?? null,
          displayTitle:  resolveTaskTitle(task, nodeMap, inboxMap, habitMap, t),
          stepsDone, stepsTotal,
        }
      }

      return {
        ...item,
        treeNodeTitle: treeNode?.title    ?? null,
        treeNodeType:  treeNode?.type     ?? null,
        inboxContent:  inboxItem?.content ?? null,
        habitName:     habit?.name        ?? null,
        displayTitle:  item.title ?? treeNode?.title ?? inboxItem?.content ?? habit?.name ?? t('common.untitled'),
        stepsDone, stepsTotal,
      }
    })
  }, [rawItems, treeNodes, inboxItems, habits, tasks, stepCounts, t])

  // Items assigned to a block render inside their BlockCard instead of the
  // plain anchored/floating buckets (SPEC §5.2) — regardless of whether they
  // also carry their own startTime within the block's range.
  const anchored   = items.filter(i => i.startTime !== null && i.blockId === null)
  const floating   = items.filter(i => i.startTime === null && i.blockId === null)
  const blockItems = items.filter(i => i.blockId !== null)

  const isTodayDate    = isToday(parseISO(date))
  const dateLabel      = isTodayDate ? t('day.todaySuperLabel') : format(parseISO(date), 'EEEE', { locale: dateLocale }).toUpperCase()
  const completedCount = items.filter(i => i.isComplete).length
  const errorMsg       = error ? ((error as { message?: string }).message ?? t('common.unknownError')) : null

  // ── DnD sensors ────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id))
    setDropTime(null)
  }

  function handleDragMove({ active, over }: DragMoveEvent) {
    if (over?.id !== 'timeline-area') {
      setDropTime(null)
      return
    }
    const container = timelineScrollRef.current
    if (!container) return
    const translated = active.rect.current.translated
    if (!translated) return

    const containerRect = container.getBoundingClientRect()
    const scrollTop     = container.scrollTop
    const relativeY     = translated.top - containerRect.top + scrollTop
    const decimal       = (relativeY - TOPPAD) / PXH
    const snapped       = Math.round(decimal * 4) / 4            // 15-min snap
    const clamped       = Math.max(0, Math.min(23.75, snapped))
    setDropTime(decimalToTimeStr(clamped))
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const id   = String(active.id)
    const item = items.find(i => i.id === id)
    setActiveId(null)

    if (!item || !over) {
      setDropTime(null)
      return
    }

    if (over.id === 'pool-drop') {
      // Anchored/blocked → floating (no-op if already unassigned + floating)
      if (item.startTime !== null || item.blockId !== null) {
        updateItem({ id, startTime: null, endTime: null, blockId: null })
      }
    } else if (typeof over.id === 'string' && over.id.startsWith('block-')) {
      // Dropped onto a Block — assigned inside it, no fixed slot of its own
      // (SPEC §5.2: "null means somewhere inside this block").
      const blockId = over.id.slice('block-'.length)
      if (item.blockId !== blockId) {
        updateItem({ id, blockId, startTime: null, endTime: null })
      }
    } else if (over.id === 'timeline-area' && dropTime !== null) {
      // Floating/blocked/anchored → anchor at new time on the open timeline.
      // Preserve the item's original duration so re-anchoring can't produce
      // end < start.
      if (item.startTime !== dropTime || item.blockId !== null) {
        if (item.startTime !== null && item.endTime !== null) {
          const duration = timeToDecimal(item.endTime) - timeToDecimal(item.startTime)
          const newEnd   = Math.min(23.983333, timeToDecimal(dropTime) + duration)
          updateItem({ id, startTime: dropTime, endTime: decimalToTimeStr(newEnd), blockId: null })
        } else {
          updateItem({ id, startTime: dropTime, blockId: null })
        }
      }
    }

    setDropTime(null)
  }

  function handleDragCancel() {
    setActiveId(null)
    setDropTime(null)
  }

  const activeItem = activeId ? items.find(i => i.id === activeId) : undefined

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={styles.page}>

        {/* Date header */}
        <div className={styles.dateHeader}>
          <div className={styles.dateLeft}>
            {onDateChange && (
              <button
                className={styles.navBtn}
                onClick={() => onDateChange(format(subDays(parseISO(date), 1), 'yyyy-MM-dd'))}
                aria-label={t('day.previousDayLabel')}
              >‹</button>
            )}
            <div className={styles.dateBlock}>
              <div className={styles.dateSuperLabel}>{dateLabel}</div>
              <div className={styles.dateDisplay}>{fmtDate(date, dateLocale)}</div>
            </div>
            {onDateChange && (
              <button
                className={styles.navBtn}
                onClick={() => onDateChange(format(addDays(parseISO(date), 1), 'yyyy-MM-dd'))}
                aria-label={t('day.nextDayLabel')}
              >›</button>
            )}
            {onDateChange && !isTodayDate && (
              <button className={styles.todayBtn} onClick={() => onDateChange(todayIso())}>
                {t('nav.today')}
              </button>
            )}
          </div>

          <div className={styles.dateRight}>
            {items.length > 0 && (
              <span className={styles.progress}>{t('day.progressDone', { done: completedCount, total: items.length })}</span>
            )}
            <button className={styles.addBtn} onClick={() => setFormOpen(true)}>{t('common.addButtonShort')}</button>
            <button className={styles.addBtn} onClick={() => setLineFormOpen(true)}>{t('day.addLineShortcut')}</button>
            <button className={styles.addBtn} onClick={() => setBlockFormOpen(true)}>{t('day.addBlockShortcut')}</button>
            <button className={styles.addBtn} onClick={() => setTemplateSheetOpen(true)}>{t('day.addTemplateButton')}</button>
            <button className={styles.addBtn} onClick={() => setSaveTemplateOpen(true)}>{t('day.saveAsTemplateButton')}</button>
            <div className={styles.modeToggle}>
              <span className={styles.modeLabel}>{t('day.modeLabel')}</span>
              <div className={styles.modePill}>
                <button
                  className={`${styles.modeBtn}${mode === 'schedule' ? ' ' + styles.modeBtnActive : ''}`}
                  onClick={() => setMode('schedule')}
                  aria-label={t('day.scheduleViewLabel')}
                >▦<span className={styles.modeBtnLabel}> {t('day.scheduleModeLabel')}</span></button>
                <button
                  className={`${styles.modeBtn}${mode === 'list' ? ' ' + styles.modeBtnActive : ''}`}
                  onClick={() => setMode('list')}
                  aria-label={t('day.listViewLabel')}
                >☰<span className={styles.modeBtnLabel}> {t('day.listModeLabel')}</span></button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {errorMsg ? (
          <div className={styles.errorState}>
            <p className={styles.errorText}>{t('day.loadItemsError')}</p>
            <p className={styles.errorHint}>{errorMsg}</p>
          </div>
        ) : isLoading ? (
          <div className={styles.loading}>
            <span className={styles.loadingStar}>✦</span>
          </div>
        ) : mode === 'schedule' ? (
          <div className={styles.scheduleCanvas}>
            <DayTimeline
              date={date}
              items={anchored}
              lines={lines}
              blocks={blocks}
              blockItems={blockItems}
              scrollRef={timelineScrollRef}
              onEdit={setEditItem}
              onEditLine={setEditLine}
              onEditBlock={setEditBlock}
              dropTime={dropTime}
              isTodayDate={isTodayDate}
            />
            <FloatingPool
              items={floating}
              onEdit={setEditItem}
            />
          </div>
        ) : (
          <div className={styles.listCanvas}>
            <DayListMode items={items} />
          </div>
        )}

      </div>

      {/* DnD overlay — follows cursor */}
      <DragOverlay dropAnimation={null}>
        <DragPreview item={activeItem} />
      </DragOverlay>

      {/* Add form */}
      {formOpen && (
        <DayItemForm date={date} onClose={() => setFormOpen(false)} />
      )}

      {/* Edit form */}
      {editItem && (
        <DayItemEditForm item={editItem} onClose={() => setEditItem(null)} />
      )}

      {/* Line add / edit */}
      {lineFormOpen && (
        <LineForm date={date} onClose={() => setLineFormOpen(false)} />
      )}
      {editLine && (
        <LineForm date={date} line={editLine} onClose={() => setEditLine(null)} />
      )}

      {/* Block add / edit */}
      {blockFormOpen && (
        <BlockForm date={date} onClose={() => setBlockFormOpen(false)} />
      )}
      {editBlock && (
        <BlockForm date={date} block={editBlock} onClose={() => setEditBlock(null)} />
      )}

      {/* Apply day template */}
      {templateSheetOpen && (
        <ApplyTemplateSheet date={date} onClose={() => setTemplateSheetOpen(false)} />
      )}

      {/* Save day as template */}
      {saveTemplateOpen && (
        <SaveDayAsTemplateSheet date={date} onClose={() => setSaveTemplateOpen(false)} />
      )}
    </DndContext>
  )
}
