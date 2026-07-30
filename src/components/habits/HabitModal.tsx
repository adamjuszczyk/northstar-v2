import { useState } from 'react'
import {
  useCreateHabit, useUpdateHabit, useDeleteHabit,
  type Habit, type HabitMode, type HabitFrequencyType, type HabitAutoAddTo,
} from '../../hooks/useHabits'
import { useTreeNodes } from '../../hooks/useTreeNodes'
import { useT } from '../../i18n'
import type { NodeType } from '../../types'
import styles from './HabitModal.module.css'

const NODE_TYPE_ORDER: NodeType[] = ['vision', 'goal', 'project', 'task']

export type HabitModalState =
  | { mode: 'create' }
  | { mode: 'edit'; habit: Habit }

interface Props {
  state:   HabitModalState
  onClose: () => void
}

export default function HabitModal({ state, onClose }: Props) {
  const t = useT()
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

  const FREQUENCIES: { value: HabitFrequencyType; label: string }[] = [
    { value: 'daily',      label: t('habits.frequencyDaily') },
    { value: 'weekly',     label: t('habits.frequencyWeekly') },
    { value: 'x_per_week', label: t('habits.frequencyXPerWeek') },
    { value: 'x_per_day',  label: t('habits.frequencyXPerDay') },
  ]
  const AUTO_ADD_TARGETS: { value: HabitAutoAddTo; label: string }[] = [
    { value: 'day',   label: t('nav.day') },
    { value: 'week',  label: t('nav.week') },
    { value: 'month', label: t('nav.month') },
  ]

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
    if (!window.confirm(t('habits.deleteConfirm', { title: existing.name }))) return
    deleteHabit(existing.id, { onSuccess: onClose })
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.modeLabel}>{isCreate ? t('habits.newHabitHeader') : t('habits.editHabitHeader')}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="habit-name">{t('common.nameLabel')}</label>
          <input
            id="habit-name"
            className={styles.input}
            placeholder={t('habits.namePlaceholder')}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('day.modeLabel')}</span>
          <div className={styles.pillRow}>
            <button
              className={`${styles.pillBtn}${mode === 'build' ? ' ' + styles.pillBtnBuild : ''}`}
              onClick={() => setMode('build')}
            >{t('habits.modeBuild')}</button>
            <button
              className={`${styles.pillBtn}${mode === 'reduce' ? ' ' + styles.pillBtnReduce : ''}`}
              onClick={() => setMode('reduce')}
            >{t('habits.modeReduce')}</button>
          </div>
        </div>

        {!isReduce && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('habits.frequencyLabel')}</span>
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
                  <span className={styles.optional}>{t('habits.xPerDayHint')}</span>
                )}
              </>
            )}
          </div>
        )}

        {!isReduce && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('habits.linkToTreeNodeLabel')} <span className={styles.optional}>{t('common.optional')}</span></span>
            {!treePickerOpen ? (
              <button className={styles.linkBtn} onClick={() => setTreePickerOpen(true)}>
                {linkedNode ? t('habits.treeNodeLink', { title: linkedNode.title }) : t('habits.linkNodeButton')}
              </button>
            ) : (
              <div className={styles.treePicker}>
                <input
                  className={styles.input}
                  placeholder={t('habits.searchNodesPlaceholder')}
                  value={treeSearch}
                  onChange={e => setTreeSearch(e.target.value)}
                  autoFocus
                />
                <div className={styles.treeList}>
                  <button
                    className={styles.treeRow}
                    onClick={() => { setTreeNodeId(null); setTreePickerOpen(false) }}
                  >{t('habits.noLinkedNodeOption')}</button>
                  {filteredNodes.map(n => (
                    <button
                      key={n.id}
                      className={`${styles.treeRow}${treeNodeId === n.id ? ' ' + styles.treeRowSelected : ''}`}
                      onClick={() => { setTreeNodeId(n.id); setTreePickerOpen(false) }}
                    >
                      <span className={styles.nodeTypeDot} style={{ background: `var(--ns-${n.type}-accent)` }} />
                      <span className={styles.nodeTitle}>{n.title}</span>
                      <span className={styles.nodeType}>{
                        n.type === 'vision' ? t('tree.typeVision')
                          : n.type === 'goal' ? t('tree.typeGoal')
                          : n.type === 'project' ? t('tree.typeProject')
                          : t('tree.typeTask')
                      }</span>
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
              <span className={styles.toggleLabel}>{t('habits.autoAddToggleLabel')}</span>
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
            <button className={styles.deleteBtn} onClick={handleDelete} disabled={isPending}>{t('common.delete')}</button>
          )}
          <span style={{ flex: 1 }} />
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>{t('common.cancel')}</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={!isValid() || isPending}>
            {isPending ? '…' : isCreate ? t('habits.addHabitSubmit') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
