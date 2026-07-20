import { useState, useEffect } from 'react'
import {
  useCreateDayItem, useCreateDayItems, useAddInboxToDay, useAddInboxItemsToDay,
  useDayItems, timeToDecimal,
} from '../../hooks/useDayItems'
import type { DayItemPriority } from '../../hooks/useDayItems'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import { useHabits } from '../../hooks/useHabits'
import { BLOCK_COLOURS } from '../../lib/blockColours'
import TreeNodePicker from '../pickers/TreeNodePicker'
import styles from './DayItemForm.module.css'

type Source = 'standalone' | 'tree' | 'inbox' | 'habit'

/**
 * Shared time-anchor validation for DayItemForm and DayItemEditForm.
 * Enforces: an end time can only be set alongside a start time, and end
 * must come strictly after start. Returns an error message, or null if valid.
 */
export function validateTimeRange(
  hasTime:   boolean,
  startTime: string,
  endTime:   string,
): string | null {
  if (!hasTime) return null
  if (endTime && !startTime) return 'Add a start time before setting an end time.'
  if (startTime && endTime && timeToDecimal(endTime) <= timeToDecimal(startTime)) {
    return 'End time must be after start time.'
  }
  return null
}

interface Props {
  date:    string
  onClose: () => void
}

export default function DayItemForm({ date, onClose }: Props) {
  const [source,      setSource]      = useState<Source>('standalone')
  const [title,       setTitle]       = useState('')
  const [hasTime,     setHasTime]     = useState(false)
  const [startTime,   setStartTime]   = useState('')
  const [endTime,     setEndTime]     = useState('')
  const [treeNodeIds, setTreeNodeIds] = useState<Set<string>>(new Set())
  const [inboxIds,    setInboxIds]    = useState<Set<string>>(new Set())
  const [habitIds,    setHabitIds]    = useState<Set<string>>(new Set())
  const [priority,    setPriority]    = useState<DayItemPriority>('medium')
  const [colour,      setColour]      = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)

  const { mutate: createItem,    isPending: creating    } = useCreateDayItem()
  const { mutate: createItems,   isPending: creatingMany } = useCreateDayItems()
  const { mutate: addFromInbox,  isPending: addingInbox  } = useAddInboxToDay()
  const { mutate: addManyInbox,  isPending: addingInboxMany } = useAddInboxItemsToDay()
  const { data: treeNodes    = [] } = useTreeNodes()
  const { data: inboxItems   = [] } = useInboxItems()
  const { data: habits       = [] } = useHabits()
  const { data: existingDayItems = [] } = useDayItems(date)

  const isPending = creating || creatingMany || addingInbox || addingInboxMany
  const unassignedInbox = inboxItems.filter(i => i.state === 'unassigned')

  // treeNodeIds already scheduled today — drives the picker's "already
  // in today" indicator on parent nodes.
  const focusedNodeIds = new Set(
    existingDayItems.filter(i => i.treeNodeId).map(i => i.treeNodeId as string)
  )

  function toggleTreeNode(id: string) {
    setTreeNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleInboxItem(id: string) {
    setInboxIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleHabit(id: string) {
    setHabitIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  useEffect(() => {
    setTreeNodeIds(new Set())
    setInboxIds(new Set())
    setHabitIds(new Set())
    setTitle('')
    setHasTime(false)
    setStartTime('')
    setEndTime('')
    setError(null)
    setPriority('medium')
    setColour(null)
  }, [source])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function isValid(): boolean {
    if (validateTimeRange(hasTime, startTime, endTime)) return false
    if (source === 'standalone') return title.trim().length > 0
    if (source === 'tree')       return treeNodeIds.size > 0
    if (source === 'inbox')      return inboxIds.size > 0
    if (source === 'habit')      return habitIds.size > 0
    return false
  }

  function handleSubmit() {
    if (isPending) return
    const timeError = validateTimeRange(hasTime, startTime, endTime)
    if (timeError) { setError(timeError); return }
    if (!isValid()) return
    setError(null)
    const onError = (e: unknown) => setError((e as Error).message)
    const sharedStartTime = hasTime && startTime ? startTime : null
    const sharedEndTime   = hasTime && endTime   ? endTime   : null

    if (source === 'standalone') {
      createItem({
        date, source: 'standalone',
        title:     title.trim(),
        startTime: sharedStartTime,
        endTime:   sharedEndTime,
        priority,
        colour,
      }, { onSuccess: onClose, onError })

    } else if (source === 'tree') {
      createItems(
        Array.from(treeNodeIds).map(id => ({
          date, source: 'tree' as const,
          treeNodeId: id,
          startTime: sharedStartTime,
          endTime:   sharedEndTime,
          priority, colour,
        })),
        { onSuccess: onClose, onError },
      )

    } else if (source === 'inbox') {
      addManyInbox(
        { inboxItemIds: Array.from(inboxIds), date, priority, colour },
        { onSuccess: onClose, onError },
      )

    } else if (source === 'habit') {
      createItems(
        Array.from(habitIds).map(id => ({
          date, source: 'habit' as const,
          habitId: id,
          startTime: sharedStartTime,
          endTime:   sharedEndTime,
          priority, colour,
        })),
        { onSuccess: onClose, onError },
      )
    }
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  const selectedCount =
    source === 'tree'  ? treeNodeIds.size :
    source === 'inbox' ? inboxIds.size    :
    source === 'habit' ? habitIds.size    : 0
  const addLabel = isPending
    ? '…'
    : selectedCount > 0 ? `Add ${selectedCount} item${selectedCount > 1 ? 's' : ''}` : 'Add to day'

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">

        <div className={styles.header}>
          <span className={styles.modeLabel}>✦ ADD TO DAY</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.sourceTabs}>
          {(['standalone', 'tree', 'inbox', 'habit'] as Source[]).map(s => (
            <button
              key={s}
              className={`${styles.sourceTab}${source === s ? ' ' + styles.sourceTabActive : ''}`}
              onClick={() => setSource(s)}
            >
              {s === 'standalone' ? '+ New item'
                : s === 'tree'    ? '✦ From tree'
                : s === 'inbox'   ? '⌵ From inbox'
                :                   '◆ From habits'}
            </button>
          ))}
        </div>

        {source === 'standalone' && (
          <div className={styles.body}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="di-title">TITLE</label>
              <input
                id="di-title"
                className={styles.input}
                placeholder="What needs doing?"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                autoFocus
              />
            </div>
            <TimeSection hasTime={hasTime} setHasTime={setHasTime}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime} />
            <div className={styles.field}>
              <span className={styles.fieldLabel}>PRIORITY</span>
              <PriorityPicker priority={priority} onChange={setPriority} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>COLOUR <span className={styles.optionalLabel}>(optional)</span></span>
              <ColourPicker colour={colour} onChange={setColour} />
            </div>
          </div>
        )}

        {source === 'tree' && (
          <div className={styles.body}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>GOAL TREE NODES</span>
              <TreeNodePicker
                nodes={treeNodes}
                selectedIds={treeNodeIds}
                onToggleSelect={toggleTreeNode}
                focusedNodeIds={focusedNodeIds}
                focusLabel="today"
              />
            </div>
            <TimeSection hasTime={hasTime} setHasTime={setHasTime}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime} />
            <div className={styles.field}>
              <span className={styles.fieldLabel}>PRIORITY</span>
              <PriorityPicker priority={priority} onChange={setPriority} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>COLOUR <span className={styles.optionalLabel}>(optional)</span></span>
              <ColourPicker colour={colour} onChange={setColour} />
            </div>
          </div>
        )}

        {source === 'inbox' && (
          <div className={styles.body}>
            <div className={styles.pickerHeaderRow}>
              <p className={styles.fieldLabel}>UNASSIGNED INBOX ITEMS</p>
              {inboxIds.size > 0 && <span className={styles.selectedCount}>{inboxIds.size} selected</span>}
            </div>
            <div className={styles.nodeList}>
              {unassignedInbox.length === 0 && <p className={styles.emptyHint}>No unassigned inbox items.</p>}
              {unassignedInbox.map(item => {
                const selected = inboxIds.has(item.id)
                return (
                  <button
                    key={item.id}
                    className={`${styles.inboxRow}${selected ? ' ' + styles.inboxRowSelected : ''}`}
                    onClick={() => toggleInboxItem(item.id)}
                  >
                    <span className={`${styles.checkbox}${selected ? ' ' + styles.checkboxChecked : ''}`}>
                      {selected ? '✓' : ''}
                    </span>
                    <span className={styles.inboxContent}>{item.content}</span>
                  </button>
                )
              })}
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>PRIORITY</span>
              <PriorityPicker priority={priority} onChange={setPriority} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>COLOUR <span className={styles.optionalLabel}>(optional)</span></span>
              <ColourPicker colour={colour} onChange={setColour} />
            </div>
          </div>
        )}

        {source === 'habit' && (
          <div className={styles.body}>
            <div className={styles.pickerHeaderRow}>
              <p className={styles.fieldLabel}>HABITS</p>
              {habitIds.size > 0 && <span className={styles.selectedCount}>{habitIds.size} selected</span>}
            </div>
            <div className={styles.nodeList}>
              {habits.length === 0 && <p className={styles.emptyHint}>No habits yet — add one from the Habits tab.</p>}
              {habits.map(h => {
                const selected = habitIds.has(h.id)
                return (
                  <button
                    key={h.id}
                    className={`${styles.nodeRow}${selected ? ' ' + styles.nodeRowSelected : ''}`}
                    onClick={() => toggleHabit(h.id)}
                  >
                    <span className={`${styles.checkbox}${selected ? ' ' + styles.checkboxChecked : ''}`}>
                      {selected ? '✓' : ''}
                    </span>
                    <span className={styles.nodeTypeDot} style={{ background: h.mode === 'build' ? 'var(--ns-ok)' : 'var(--ns-project-accent)' }} />
                    <span className={styles.nodeTitle}>{h.name}</span>
                    <span className={styles.nodeType}>{h.mode}</span>
                  </button>
                )
              })}
            </div>
            <TimeSection hasTime={hasTime} setHasTime={setHasTime}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime} />
            <div className={styles.field}>
              <span className={styles.fieldLabel}>PRIORITY</span>
              <PriorityPicker priority={priority} onChange={setPriority} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>COLOUR <span className={styles.optionalLabel}>(optional)</span></span>
              <ColourPicker colour={colour} onChange={setColour} />
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className={styles.saveBtn}
            onClick={handleSubmit}
            disabled={!isValid() || isPending}
          >
            {addLabel}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Shared sub-components (exported for DayItemEditForm) ───────────────────────

export interface TimeSectionProps {
  hasTime:      boolean
  setHasTime:   (v: boolean) => void
  startTime:    string
  setStartTime: (v: string) => void
  endTime:      string
  setEndTime:   (v: string) => void
}

export function TimeSection({ hasTime, setHasTime, startTime, setStartTime, endTime, setEndTime }: TimeSectionProps) {
  return (
    <div className={styles.field}>
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          className={styles.toggleCheck}
          checked={hasTime}
          onChange={e => setHasTime(e.target.checked)}
        />
        <span className={styles.toggleLabel}>Anchor to time slot</span>
      </label>
      {hasTime && (
        <div className={styles.timeRow}>
          <div className={styles.timeField}>
            <label className={styles.fieldLabelSm}>START</label>
            <input
              type="time"
              className={styles.timeInput}
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles.timeField}>
            <label className={styles.fieldLabelSm}>END (optional)</label>
            <input
              type="time"
              className={styles.timeInput}
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export interface ColourPickerProps {
  colour:   string | null
  onChange: (c: string | null) => void
}

export function ColourPicker({ colour, onChange }: ColourPickerProps) {
  return (
    <div className={styles.colourRow}>
      <button
        type="button"
        className={`${styles.colourSwatch} ${styles.colourSwatchNone}${colour === null ? ' ' + styles.colourSwatchActive : ''}`}
        onClick={() => onChange(null)}
        title="None"
        aria-label="No colour"
      />
      {BLOCK_COLOURS.map(c => (
        <button
          key={c.hex}
          type="button"
          className={`${styles.colourSwatch}${colour === c.hex ? ' ' + styles.colourSwatchActive : ''}`}
          style={{ background: c.hex }}
          onClick={() => onChange(c.hex)}
          title={c.name}
          aria-label={`${c.name} colour${colour === c.hex ? ' (active)' : ''}`}
        />
      ))}
    </div>
  )
}

export interface PriorityPickerProps {
  priority: DayItemPriority
  onChange: (p: DayItemPriority) => void
}

export function PriorityPicker({ priority, onChange }: PriorityPickerProps) {
  const opts: { value: DayItemPriority; label: string }[] = [
    { value: 'high',   label: '★ HIGH' },
    { value: 'medium', label: '● MED'  },
    { value: 'low',    label: '○ LOW'  },
  ]
  return (
    <div className={styles.priorityRow}>
      {opts.map(o => {
        const activeClass = priority === o.value
          ? o.value === 'high'   ? styles.priorityBtnActiveHigh
          : o.value === 'low'    ? styles.priorityBtnActiveLow
          :                        styles.priorityBtnActiveMed
          : ''
        return (
          <button
            key={o.value}
            type="button"
            className={`${styles.priorityBtn} ${activeClass}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
