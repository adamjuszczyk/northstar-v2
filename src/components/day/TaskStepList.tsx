import { useState } from 'react'
import {
  useTaskSteps, useAddTaskStep, useAddFirstStepToDayItem, useAddFirstStepToRef,
  useToggleTaskStep, useDeleteTaskStep, useRenameTaskStep, useReorderTaskStep,
  type TaskStep,
} from '../../hooks/useTaskSteps'
import type { MaterializableItem, TaskRef } from '../../hooks/useTasks'
import { useT } from '../../i18n'
import styles from './TaskStepList.module.css'

interface Props {
  taskId: string | null
  /** Provide exactly one of these when taskId is null — how to materialize
   *  a task on first step add. `item` = an existing day-item occurrence
   *  (existing behavior). `taskRef` = an existing tree node / inbox item
   *  with no day item involved at all (Tree/Inbox creating a list
   *  directly, SPEC §5.3 "creatable everywhere"). Both ignored once taskId
   *  is set. Named `taskRef`, not `ref` — a bare `ref` prop on a function
   *  component is intercepted by React itself, not passed through. */
  item?:    MaterializableItem & { id: string }
  taskRef?: TaskRef
}

/**
 * Checklist for a task's ordered step list (SPEC §5.3, revised). Every step
 * stays visible always — done and not-done alike; checking one off marks it
 * (strikethrough) but never removes it from view. The first not-done step
 * gets a highlight ("automatic resume" emphasis) — that's the only thing
 * "next open step" governs, not what's rendered.
 *
 * Materializes a task on first step add via one of two routes: `item` (an
 * existing day-item occurrence — TASKS.md §3.3 rule 1) or `ref` (a tree
 * node / inbox item directly, no day occurrence involved — SPEC §5.3
 * "creatable everywhere"). Once taskId is set, ignores both.
 */
export default function TaskStepList({ taskId, item, taskRef }: Props) {
  const t = useT()
  const [newStep,   setNewStep]   = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const { data: steps = [] } = useTaskSteps(taskId)
  const { mutate: addStep,        isPending: adding     } = useAddTaskStep()
  const { mutate: addFirstStep,   isPending: addingFirst } = useAddFirstStepToDayItem()
  const { mutate: addFirstStepToRef, isPending: addingFirstRef } = useAddFirstStepToRef()
  const { mutate: toggleStep,     isPending: toggling   } = useToggleTaskStep()
  const { mutate: deleteStep,     isPending: deleting   } = useDeleteTaskStep()
  const { mutate: renameStep,     isPending: renaming   } = useRenameTaskStep()
  const { mutate: reorderStep,    isPending: reordering } = useReorderTaskStep()
  const isPending = adding || addingFirst || addingFirstRef || toggling || deleting || renaming || reordering

  const doneCount = steps.filter(s => s.isDone).length
  const nextOpenId = steps.find(s => !s.isDone)?.id ?? null

  function handleAddStep() {
    const content = newStep.trim()
    if (!content || isPending) return
    setError(null)
    const onError = (e: unknown) => setError((e as Error).message)
    const onSuccess = () => setNewStep('')
    if (taskId) {
      addStep({ taskId, content }, { onSuccess, onError })
    } else if (item) {
      addFirstStep({ item, content }, { onSuccess, onError })
    } else if (taskRef) {
      addFirstStepToRef({ ref: taskRef, content }, { onSuccess, onError })
    }
  }

  function startEdit(step: TaskStep) {
    setEditingId(step.id)
    setEditValue(step.content)
  }

  function commitEdit() {
    if (!editingId || !taskId) { setEditingId(null); return }
    const trimmed = editValue.trim()
    const original = steps.find(s => s.id === editingId)
    if (!trimmed || trimmed === original?.content) { setEditingId(null); return }
    renameStep(
      { stepId: editingId, taskId, content: trimmed },
      { onError: e => setError((e as Error).message) },
    )
    setEditingId(null)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.label}>{t("day.stepsLabel")}</span>
        {steps.length > 0 && (
          <span className={styles.count}>
            {t("day.progressDone", { done: doneCount, total: steps.length })}{doneCount === steps.length ? ' · ✓' : ''}
          </span>
        )}
      </div>

      {steps.length > 0 && (
        <div className={styles.list}>
          {steps.map((step, i) => (
            <div
              key={step.id}
              className={`${styles.row}${step.isDone ? ' ' + styles.rowDone : ''}${step.id === nextOpenId ? ' ' + styles.rowNext : ''}`}
            >
              <button
                className={styles.reorderBtn}
                onClick={() => taskId && reorderStep({ taskId, stepId: step.id, direction: 'up' })}
                disabled={isPending || !taskId || i === 0}
                aria-label={t("day.moveStepUpAriaLabel")}
              >▲</button>
              <button
                className={styles.reorderBtn}
                onClick={() => taskId && reorderStep({ taskId, stepId: step.id, direction: 'down' })}
                disabled={isPending || !taskId || i === steps.length - 1}
                aria-label={t("day.moveStepDownAriaLabel")}
              >▼</button>
              <button
                className={`${styles.check}${step.isDone ? ' ' + styles.checkDone : ''}`}
                onClick={() => taskId && toggleStep({ stepId: step.id, taskId, isDone: !step.isDone })}
                disabled={isPending || !taskId}
                aria-label={step.isDone ? t("day.markStepNotDoneAriaLabel") : t("day.markStepDoneAriaLabel")}
              >{step.isDone ? '✓' : ''}</button>
              {editingId === step.id ? (
                <input
                  className={styles.editInput}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={commitEdit}
                  autoFocus
                />
              ) : (
                <span
                  className={`${styles.content}${step.isDone ? ' ' + styles.contentDone : ''}`}
                  onClick={() => taskId && startEdit(step)}
                  title={taskId ? t("day.clickToRenameTitle") : undefined}
                >
                  {step.content}
                </span>
              )}
              <button
                className={styles.deleteBtn}
                onClick={() => taskId && deleteStep({ stepId: step.id, taskId })}
                disabled={isPending || !taskId}
                aria-label={t("day.deleteStepAriaLabel")}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.addRow}>
        <input
          className={styles.addInput}
          placeholder={steps.length === 0 ? t("day.turnIntoStepListPlaceholder") : t("day.addAnotherStepPlaceholder")}
          value={newStep}
          onChange={e => setNewStep(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAddStep() }}
          disabled={isPending}
        />
        <button
          className={styles.addBtn}
          onClick={handleAddStep}
          disabled={isPending || !newStep.trim()}
        >{t("common.addButtonShort")}</button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
