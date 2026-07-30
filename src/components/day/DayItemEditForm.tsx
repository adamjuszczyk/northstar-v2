import { useState, useEffect } from 'react'
import { useUpdateDayItem, useDeleteDayItem, useSplitDayItemToNewSlot } from '../../hooks/useDayItems'
import type { DayItem, DayItemPriority } from '../../hooks/useDayItems'
import { useBlocks } from '../../hooks/useBlocks'
import { TimeSection, PriorityPicker, ColourPicker, BlockPicker, validateTimeRange } from './DayItemForm'
import TaskStepList from './TaskStepList'
import { useT } from '../../i18n'
import styles from './DayItemForm.module.css'

interface Props {
  item:    DayItem
  onClose: () => void
}

export default function DayItemEditForm({ item, onClose }: Props) {
  const t = useT()
  const [title,     setTitle]     = useState(item.title ?? '')
  const [hasTime,   setHasTime]   = useState(item.startTime !== null)
  const [startTime, setStartTime] = useState(item.startTime ?? '')
  const [endTime,   setEndTime]   = useState(item.endTime   ?? '')
  const [priority,  setPriority]  = useState<DayItemPriority>(item.priority)
  const [colour,    setColour]    = useState<string | null>(item.colour)
  const [blockId,   setBlockId]   = useState<string | null>(item.blockId)
  const [error,     setError]     = useState<string | null>(null)

  const { mutate: update, isPending: updating } = useUpdateDayItem()
  const { mutate: remove, isPending: removing  } = useDeleteDayItem()
  const { mutate: split,  isPending: splitting } = useSplitDayItemToNewSlot()
  const { data: blocksForDay = [] } = useBlocks(item.date)
  const isPending = updating || removing || splitting

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSave() {
    if (isPending) return
    const timeError = validateTimeRange(t, hasTime, startTime, endTime)
    if (timeError) { setError(timeError); return }
    setError(null)
    update({
      id:        item.id,
      title:     showEditableTitle ? (title.trim() || null) : undefined,
      startTime: hasTime && startTime ? startTime : null,
      endTime:   hasTime && endTime   ? endTime   : null,
      priority,
      colour,
      blockId,
    }, {
      onSuccess: onClose,
      onError:   e => setError((e as Error).message),
    })
  }

  // Split (SPEC §5.3, simplified) — immediately adds another occurrence of
  // this same task to today's floating pool: no time picker, no modal, no
  // extra step. Same shared task_id as every other occurrence; drag it onto
  // the timeline afterward for a specific time, same as any floating item.
  function handleSplit() {
    if (isPending) return
    setError(null)
    split(
      {
        date: item.date,
        existingItem: {
          id: item.id, taskId: item.taskId,
          source: item.source, title: item.title,
          treeNodeId: item.treeNodeId, inboxItemId: item.inboxItemId, habitId: item.habitId,
          isComplete: item.isComplete,
        },
      },
      { onSuccess: onClose, onError: e => setError((e as Error).message) },
    )
  }

  function handleDelete() {
    if (!window.confirm(t('common.deleteConfirm', { title: item.displayTitle }))) return
    setError(null)
    remove(
      { id: item.id, source: item.source, inboxItemId: item.inboxItemId, taskId: item.taskId },
      { onSuccess: onClose, onError: e => setError((e as Error).message) },
    )
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  const sourceLabel =
    item.source === 'tree'  ? t('day.sourceBadgeTree')      :
    item.source === 'inbox' ? t('day.sourceBadgeInboxFrom') :
    item.source === 'habit' ? t('day.focusTagHabit')        :
                              t('day.sourceBadgeStandalone')

  // A task-linked standalone item's own title is null (identity resolves
  // through the task) — show the resolved title read-only, same as a
  // tree/inbox/habit link, rather than an editable-but-inert input.
  const linkedTitle = item.treeNodeTitle ?? item.inboxContent ?? item.habitName
    ?? (item.taskId ? item.displayTitle : null)
  const showEditableTitle = item.source === 'standalone' && !item.taskId

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">

        <div className={styles.header}>
          <span className={styles.modeLabel}>{t('day.modeLabelEditItem')}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className={styles.body}>

          {/* Source badge */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('day.fieldLabelSource')}</span>
            <span className={styles.sourceBadge}>{sourceLabel}</span>
          </div>

          {/* Linked title (tree / inbox) */}
          {linkedTitle && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                {item.source === 'tree' ? t('day.fieldLabelLinkedNode') : item.source === 'habit' ? t('day.fieldLabelHabit') : t('day.fieldLabelInboxItem')}
              </span>
              <div className={styles.linkedTitle}>{linkedTitle}</div>
            </div>
          )}

          {/* Editable title — standalone, not-yet-task-linked items only */}
          {showEditableTitle && (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="edit-title">{t('day.fieldLabelTitle')}</label>
              <input
                id="edit-title"
                className={styles.input}
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                autoFocus
              />
            </div>
          )}

          {/* Task Lists & Split (SPEC §5.3) — turn this item into a step
              list, or manage an already-materialized one. */}
          <div className={styles.field}>
            <TaskStepList
              taskId={item.taskId}
              item={{
                id: item.id,
                source: item.source, title: item.title,
                treeNodeId: item.treeNodeId, inboxItemId: item.inboxItemId, habitId: item.habitId,
                isComplete: item.isComplete,
              }}
            />
          </div>

          {/* Time anchor */}
          <TimeSection
            hasTime={hasTime}   setHasTime={setHasTime}
            startTime={startTime} setStartTime={setStartTime}
            endTime={endTime}   setEndTime={setEndTime}
          />

          {/* Priority */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('day.fieldLabelPriority')}</span>
            <PriorityPicker priority={priority} onChange={setPriority} />
          </div>

          {/* Colour */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('day.colourLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
            <ColourPicker colour={colour} onChange={setColour} />
          </div>

          {/* Block assignment */}
          {blocksForDay.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('day.blockLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
              <BlockPicker blocks={blocksForDay} blockId={blockId} onChange={setBlockId} />
            </div>
          )}

          {/* Split (SPEC §5.3, simplified) — explicit, findable action, not
              only the implicit re-add-detects-a-conflict prompt. Immediate:
              no time picker, no modal. Pulled back for habits specifically
              (SPEC §4.4, revised again) — Task Lists/steps stay available
              for habits above, only Split is gated off here. */}
          {item.source !== 'habit' && (
            <div className={styles.field}>
              <button
                type="button"
                className={styles.splitBtn}
                onClick={handleSplit}
                disabled={isPending}
              >
                {splitting ? t('common.pendingEllipsis') : t('day.explicitSplitButton')}
              </button>
              <p className={styles.splitHint}>
                {t('day.splitHint')}
              </p>
            </div>
          )}

        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.deleteItemBtn} onClick={handleDelete} disabled={isPending}>
            {t('common.delete')}
          </button>
          <span className={styles.actionsSpacer} />
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>{t('common.cancel')}</button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={isPending || !!validateTimeRange(t, hasTime, startTime, endTime)}
          >
            {updating ? t('common.pendingEllipsis') : t('common.save')}
          </button>
        </div>

      </div>
    </div>
  )
}
