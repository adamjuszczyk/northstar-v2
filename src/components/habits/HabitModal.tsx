import { useState } from 'react'
import {
  useCreateHabit, useUpdateHabit, useDeleteHabit,
  type Habit, type HabitMode, type HabitFrequencyType, type HabitAutoAddTo,
} from '../../hooks/useHabits'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import type { NodeType } from '../../types'
import styles from './HabitModal.module.css'

const NODE_TYPE_ORDER: NodeType[] = ['vision', 'goal', 'project', 'task']
const FREQUENCIES: { value: HabitFrequencyType; label: string }[] = [
  { value: 'daily',      label: 'Daily' },
  { value: 'weekly',     label: 'Weekly' },
  { value: 'x_per_week', label: 'X / week' },
  { value: 'x_per_day',  label: 'X / day' },
]
const AUTO_ADD_TARGETS: { value: HabitAutoAddTo; label: string }[] = [
  { value: 'day',   label: 'Day' },
  { value: 'week',  label: 'Week' },
  { value: 'month', label: 'Month' },
]

export type HabitModalState =
  | { mode: 'create' }
  | { mode: 'edit'; habit: Habit }

interface Props {
  state:   HabitModalState
  onClose: () => void
}

export default function HabitModal({ state, onClose }: Props) {
  const isCreate = state.mode === 'create'
  const existing = state.mode === 'edit' ? state.habit : null

  const [name,           setName]           = useState(existing?.name ?? '')
  const [mode,            setMode]           = useState<HabitMode>(existing?.mode ?? 'build')
  const [frequencyType,   setFrequencyType]  = useState<HabitFrequencyType>(existing?.frequencyType ?? 'daily')
  const [frequencyValue,  setFrequencyValue] = useState<string>(existing?.frequencyValue ? String(existing.frequencyValue) : '3')
  const [treeNodeId,      setTreeNodeId]     = useState<string | null>(existing?.treeNodeId ?? null)
  const [treeSearch,      setTreeSearch]     = useState('')
  const [treePickerOpen,  setTreePickerOpen] = useState(false)
  const [autoAdd,         setAutoAdd]        = useState(existing?.autoAdd ?? false)
  const [autoAddTo,       setAutoAddTo]      = useState<HabitAutoAddTo>(existing?.autoAddTo ?? 'day')

  const { data: treeNodes = [] } = useTreeNodes()
  const { mutate: createHabit, isPending: creating } = useCreateHabit()
  const { mutate: updateHabit, isPending: updating } = useUpdateHabit()
  const { mutate: deleteHabit, isPending: deleting } = useDeleteHabit()
  const isPending = creating || updating || deleting

  const linkedNode = treeNodeId ? treeNodes.find(n => n.id === treeNodeId) : null
  const filteredNodes = treeNodes
    .filter(n => !treeSearch || n.title.toLowerCase().includes(treeSearch.toLowerCase()))
    .sort((a, b) => {
      const ai = NODE_TYPE_ORDER.indexOf(a.type)
      const bi = NODE_TYPE_ORDER.indexOf(b.type)
      return ai !== bi ? ai - bi : a.title.localeCompare(b.title)
    })

  const isReduce = mode === 'reduce'
  const usesFrequencyValue = !isReduce && (frequencyType === 'x_per_week' || frequencyType === 'x_per_day')

  function isValid(): boolean {
    if (!name.trim()) return false
    if (usesFrequencyValue) {
      const n = Number(frequencyValue)
      if (!Number.isFinite(n) || n < 1) return false
    }
    return true
  }

  function handleSave() {
    if (!isValid() || isPending) return
    // Reduce mode has no frequency/auto-add config — frequencyType still
    // needs some value to satisfy the NOT NULL column, but nothing in the
    // reduce UI ever reads it back.
    const input = isReduce
      ? {
          name:           name.trim(),
          mode,
          treeNodeId,
          frequencyType:  'daily' as HabitFrequencyType,
          frequencyValue: null,
          autoAdd:        false,
          autoAddTo:      null,
        }
      : {
          name:           name.trim(),
          mode,
          treeNodeId,
          frequencyType,
          frequencyValue: usesFrequencyValue ? Number(frequencyValue) : null,
          autoAdd,
          autoAddTo:      autoAdd ? autoAddTo : null,
        }
    if (isCreate) {
      createHabit(input, { onSuccess: onClose })
    } else if (existing) {
      updateHabit({ id: existing.id, ...input }, { onSuccess: onClose })
    }
  }

  function handleDelete() {
    if (!existing) return
    if (!window.confirm(`Delete "${existing.name}"? Its logged history will be removed too.`)) return
    deleteHabit(existing.id, { onSuccess: onClose })
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.modeLabel}>{isCreate ? '◆ NEW HABIT' : '◆ EDIT HABIT'}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="habit-name">NAME</label>
          <input
            id="habit-name"
            className={styles.input}
            placeholder="What are you tracking?"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>MODE</span>
          <div className={styles.pillRow}>
            <button
              className={`${styles.pillBtn}${mode === 'build' ? ' ' + styles.pillBtnBuild : ''}`}
              onClick={() => setMode('build')}
            >BUILD</button>
            <button
              className={`${styles.pillBtn}${mode === 'reduce' ? ' ' + styles.pillBtnReduce : ''}`}
              onClick={() => setMode('reduce')}
            >REDUCE</button>
          </div>
        </div>

        {!isReduce && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>FREQUENCY</span>
            <div className={styles.pillRow}>
              {FREQUENCIES.map(f => (
                <button
                  key={f.value}
                  className={`${styles.pillBtn}${frequencyType === f.value ? ' ' + styles.pillBtnActive : ''}`}
                  onClick={() => setFrequencyType(f.value)}
                >{f.label}</button>
              ))}
            </div>
            {usesFrequencyValue && (
              <>
                <input
                  type="number"
                  min={1}
                  max={14}
                  className={styles.numberInput}
                  value={frequencyValue}
                  onChange={e => setFrequencyValue(e.target.value)}
                />
                {frequencyType === 'x_per_day' && (
                  <span className={styles.optional}>e.g. 2 = twice daily</span>
                )}
              </>
            )}
          </div>
        )}

        {!isReduce && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>LINK TO TREE NODE <span className={styles.optional}>(optional)</span></span>
            {!treePickerOpen ? (
              <button className={styles.linkBtn} onClick={() => setTreePickerOpen(true)}>
                {linkedNode ? `✦ ${linkedNode.title}` : '+ Link a node…'}
              </button>
            ) : (
              <div className={styles.treePicker}>
                <input
                  className={styles.input}
                  placeholder="Search nodes…"
                  value={treeSearch}
                  onChange={e => setTreeSearch(e.target.value)}
                  autoFocus
                />
                <div className={styles.treeList}>
                  <button
                    className={styles.treeRow}
                    onClick={() => { setTreeNodeId(null); setTreePickerOpen(false) }}
                  >— No linked node —</button>
                  {filteredNodes.map(n => (
                    <button
                      key={n.id}
                      className={`${styles.treeRow}${treeNodeId === n.id ? ' ' + styles.treeRowSelected : ''}`}
                      onClick={() => { setTreeNodeId(n.id); setTreePickerOpen(false) }}
                    >
                      <span className={styles.nodeTypeDot} style={{ background: `var(--ns-${n.type}-accent)` }} />
                      <span className={styles.nodeTitle}>{n.title}</span>
                      <span className={styles.nodeType}>{n.type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!isReduce && (
          <div className={styles.field}>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                className={styles.toggleCheck}
                checked={autoAdd}
                onChange={e => setAutoAdd(e.target.checked)}
              />
              <span className={styles.toggleLabel}>Auto-add on app open</span>
            </label>
            {autoAdd && (
              <div className={styles.pillRow}>
                {AUTO_ADD_TARGETS.map(t => (
                  <button
                    key={t.value}
                    className={`${styles.pillBtn}${autoAddTo === t.value ? ' ' + styles.pillBtnActive : ''}`}
                    onClick={() => setAutoAddTo(t.value)}
                  >{t.label}</button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={styles.actions}>
          {!isCreate && (
            <button className={styles.deleteBtn} onClick={handleDelete} disabled={isPending}>Delete</button>
          )}
          <span style={{ flex: 1 }} />
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={!isValid() || isPending}>
            {isPending ? '…' : isCreate ? 'Add habit' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
