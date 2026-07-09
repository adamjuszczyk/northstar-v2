import { useState, useEffect } from 'react'
import { useUpdateDayItem, useDeleteDayItem } from '../../hooks/useDayItems'
import type { DayItem, DayItemPriority } from '../../hooks/useDayItems'
import { TimeSection, PriorityPicker, ColourPicker, validateTimeRange } from './DayItemForm'
import styles from './DayItemForm.module.css'

interface Props {
  item:    DayItem
  onClose: () => void
}

export default function DayItemEditForm({ item, onClose }: Props) {
  const [title,     setTitle]     = useState(item.title ?? '')
  const [hasTime,   setHasTime]   = useState(item.startTime !== null)
  const [startTime, setStartTime] = useState(item.startTime ?? '')
  const [endTime,   setEndTime]   = useState(item.endTime   ?? '')
  const [priority,  setPriority]  = useState<DayItemPriority>(item.priority)
  const [colour,    setColour]    = useState<string | null>(item.colour)
  const [error,     setError]     = useState<string | null>(null)

  const { mutate: update, isPending: updating } = useUpdateDayItem()
  const { mutate: remove, isPending: removing  } = useDeleteDayItem()
  const isPending = updating || removing

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSave() {
    if (isPending) return
    const timeError = validateTimeRange(hasTime, startTime, endTime)
    if (timeError) { setError(timeError); return }
    setError(null)
    update({
      id:        item.id,
      title:     item.source === 'standalone' ? (title.trim() || null) : undefined,
      startTime: hasTime && startTime ? startTime : null,
      endTime:   hasTime && endTime   ? endTime   : null,
      priority,
      colour,
    }, {
      onSuccess: onClose,
      onError:   e => setError((e as Error).message),
    })
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${item.displayTitle}"?`)) return
    remove(item.id, { onSuccess: onClose })
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  const sourceLabel =
    item.source === 'tree'  ? '✦ GOAL TREE'   :
    item.source === 'inbox' ? '⌵ FROM INBOX'  :
                              '• STANDALONE'

  const linkedTitle = item.treeNodeTitle ?? item.inboxContent

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">

        <div className={styles.header}>
          <span className={styles.modeLabel}>✦ EDIT ITEM</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>

          {/* Source badge */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>SOURCE</span>
            <span className={styles.sourceBadge}>{sourceLabel}</span>
          </div>

          {/* Linked title (tree / inbox) */}
          {linkedTitle && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                {item.source === 'tree' ? 'LINKED NODE' : 'INBOX ITEM'}
              </span>
              <div className={styles.linkedTitle}>{linkedTitle}</div>
            </div>
          )}

          {/* Editable title — standalone only */}
          {item.source === 'standalone' && (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="edit-title">TITLE</label>
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

          {/* Time anchor */}
          <TimeSection
            hasTime={hasTime}   setHasTime={setHasTime}
            startTime={startTime} setStartTime={setStartTime}
            endTime={endTime}   setEndTime={setEndTime}
          />

          {/* Priority */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>PRIORITY</span>
            <PriorityPicker priority={priority} onChange={setPriority} />
          </div>

          {/* Colour */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>COLOUR <span className={styles.optionalLabel}>(optional)</span></span>
            <ColourPicker colour={colour} onChange={setColour} />
          </div>

        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.deleteItemBtn} onClick={handleDelete} disabled={isPending}>
            Delete
          </button>
          <span className={styles.actionsSpacer} />
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={isPending || !!validateTimeRange(hasTime, startTime, endTime)}
          >
            {updating ? '…' : 'Save'}
          </button>
        </div>

      </div>
    </div>
  )
}
