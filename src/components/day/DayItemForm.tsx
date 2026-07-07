import { useState, useEffect } from 'react'
import { useCreateDayItem, useAddInboxToDay, timeToDecimal } from '../../hooks/useDayItems'
import type { DayItemPriority } from '../../hooks/useDayItems'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useInboxItems } from '../../hooks/useInboxItems'
import type { TreeNode, NodeType } from '../../types'
import styles from './DayItemForm.module.css'

type Source = 'standalone' | 'tree' | 'inbox'

const NODE_TYPE_ORDER: NodeType[] = ['vision', 'goal', 'project', 'task']

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
  const [source,     setSource]     = useState<Source>('standalone')
  const [title,      setTitle]      = useState('')
  const [hasTime,    setHasTime]    = useState(false)
  const [startTime,  setStartTime]  = useState('')
  const [endTime,    setEndTime]    = useState('')
  const [treeNodeId, setTreeNodeId] = useState<string | null>(null)
  const [inboxId,    setInboxId]    = useState<string | null>(null)
  const [treeSearch, setTreeSearch] = useState('')
  const [priority,   setPriority]   = useState<DayItemPriority>('medium')
  const [error,      setError]      = useState<string | null>(null)

  const { mutate: createItem,   isPending: creating   } = useCreateDayItem()
  const { mutate: addFromInbox, isPending: addingInbox } = useAddInboxToDay()
  const { data: treeNodes  = [] } = useTreeNodes()
  const { data: inboxItems = [] } = useInboxItems()

  const isPending = creating || addingInbox
  const unassignedInbox = inboxItems.filter(i => i.state === 'unassigned')

  const filteredNodes = treeNodes
    .filter(n => !treeSearch || n.title.toLowerCase().includes(treeSearch.toLowerCase()))
    .sort((a, b) => {
      const ai = NODE_TYPE_ORDER.indexOf(a.type)
      const bi = NODE_TYPE_ORDER.indexOf(b.type)
      return ai !== bi ? ai - bi : a.title.localeCompare(b.title)
    })

  useEffect(() => {
    setTreeNodeId(null)
    setInboxId(null)
    setTitle('')
    setHasTime(false)
    setStartTime('')
    setEndTime('')
    setError(null)
    setPriority('medium')
  }, [source])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function isValid(): boolean {
    if (validateTimeRange(hasTime, startTime, endTime)) return false
    if (source === 'standalone') return title.trim().length > 0
    if (source === 'tree')       return treeNodeId !== null
    if (source === 'inbox')      return inboxId !== null
    return false
  }

  function handleSubmit() {
    if (isPending) return
    const timeError = validateTimeRange(hasTime, startTime, endTime)
    if (timeError) { setError(timeError); return }
    if (!isValid()) return
    setError(null)

    if (source === 'standalone') {
      createItem({
        date, source: 'standalone',
        title:     title.trim(),
        startTime: hasTime && startTime ? startTime : null,
        endTime:   hasTime && endTime   ? endTime   : null,
        priority,
      }, { onSuccess: onClose, onError: e => setError((e as Error).message) })

    } else if (source === 'tree') {
      createItem({
        date, source: 'tree',
        treeNodeId,
        startTime: hasTime && startTime ? startTime : null,
        endTime:   hasTime && endTime   ? endTime   : null,
        priority,
      }, { onSuccess: onClose, onError: e => setError((e as Error).message) })

    } else if (source === 'inbox') {
      addFromInbox(
        { inboxItemId: inboxId!, date, priority },
        { onSuccess: onClose, onError: e => setError((e as Error).message) }
      )
    }
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">

        <div className={styles.header}>
          <span className={styles.modeLabel}>✦ ADD TO DAY</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.sourceTabs}>
          {(['standalone', 'tree', 'inbox'] as Source[]).map(s => (
            <button
              key={s}
              className={`${styles.sourceTab}${source === s ? ' ' + styles.sourceTabActive : ''}`}
              onClick={() => setSource(s)}
            >
              {s === 'standalone' ? '+ New item' : s === 'tree' ? '✦ From tree' : '⌵ From inbox'}
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
          </div>
        )}

        {source === 'tree' && (
          <div className={styles.body}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="di-tree-search">GOAL TREE NODE</label>
              <input
                id="di-tree-search"
                className={styles.input}
                placeholder="Search nodes…"
                value={treeSearch}
                onChange={e => setTreeSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.nodeList}>
              {filteredNodes.length === 0 && <p className={styles.emptyHint}>No nodes found.</p>}
              {filteredNodes.map(n => (
                <NodeRow key={n.id} node={n} selected={treeNodeId === n.id} onSelect={() => setTreeNodeId(n.id)} />
              ))}
            </div>
            <TimeSection hasTime={hasTime} setHasTime={setHasTime}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime} />
            <div className={styles.field}>
              <span className={styles.fieldLabel}>PRIORITY</span>
              <PriorityPicker priority={priority} onChange={setPriority} />
            </div>
          </div>
        )}

        {source === 'inbox' && (
          <div className={styles.body}>
            <p className={styles.fieldLabel}>UNASSIGNED INBOX ITEMS</p>
            <div className={styles.nodeList}>
              {unassignedInbox.length === 0 && <p className={styles.emptyHint}>No unassigned inbox items.</p>}
              {unassignedInbox.map(item => (
                <button
                  key={item.id}
                  className={`${styles.inboxRow}${inboxId === item.id ? ' ' + styles.inboxRowSelected : ''}`}
                  onClick={() => setInboxId(item.id)}
                >
                  <span className={styles.inboxDot} />
                  <span className={styles.inboxContent}>{item.content}</span>
                </button>
              ))}
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>PRIORITY</span>
              <PriorityPicker priority={priority} onChange={setPriority} />
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
            {isPending ? '…' : 'Add to day'}
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

// ── NodeRow ────────────────────────────────────────────────────────────────────

interface NodeRowProps { node: TreeNode; selected: boolean; onSelect: () => void }

function NodeRow({ node, selected, onSelect }: NodeRowProps) {
  return (
    <button
      className={`${styles.nodeRow}${selected ? ' ' + styles.nodeRowSelected : ''}`}
      onClick={onSelect}
    >
      <span className={styles.nodeTypeDot} style={{ background: `var(--ns-${node.type}-accent)` }} />
      <span className={styles.nodeTitle}>{node.title}</span>
      <span className={styles.nodeType}>{node.type}</span>
    </button>
  )
}
