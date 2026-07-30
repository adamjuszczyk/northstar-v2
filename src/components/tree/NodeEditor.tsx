import { useState, useEffect, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useCreateNode, useUpdateNode, useDeleteNode, useTreeNodes,
  collectDescendantIds,
  type TreeNodeWithChildren,
} from '../../hooks/useTreeNodes'
import { useSheets } from '../../hooks/useSheets'
import { useTaskForRef } from '../../hooks/useTasks'
import { useAddFirstStepToRef, useAddTaskStep } from '../../hooks/useTaskSteps'
import TaskStepList from '../day/TaskStepList'
import SheetForm, { type SheetFormState } from './SheetForm'
import type { NodeType, NodeStatus } from '../../types'
import { useT } from '../../i18n'
import styles from './NodeEditor.module.css'

const TYPES: NodeType[]   = ['vision', 'goal', 'project', 'task']
const STATUSES: NodeStatus[] = ['not_started', 'in_progress', 'complete']

function suggestChildType(parentType: NodeType | null): NodeType {
  if (!parentType) return 'vision'
  if (parentType === 'vision')   return 'goal'
  if (parentType === 'goal')     return 'project'
  return 'task'
}

export type EditorState =
  | {
      mode: 'create'; parentId: string | null; parentType?: NodeType; prefillTitle?: string
      /** null = main tree. Resolved by the caller (TreeView), which alone
       *  knows the active canvas and the anchor-node special case — see
       *  handleAddChild/handleAddRoot there. */
      sheetId: string | null
    }
  | { mode: 'edit';   node: TreeNodeWithChildren }

interface Props {
  state:      EditorState
  onClose:    () => void
  onCreated?: (nodeId: string) => void
  /** Edit mode only — switches to the Move-to picker for this node. */
  onMoveTo?:  (node: TreeNodeWithChildren) => void
}

export default function NodeEditor({ state, onClose, onCreated, onMoveTo }: Props) {
  const t = useT()
  const isCreate = state.mode === 'create'

  const STATUS_LABELS: Record<NodeStatus, string> = {
    not_started: t('tree.legendStateNotStarted'),
    in_progress: t('tree.legendStateInProgress'),
    complete:    t('tree.legendStateComplete'),
  }

  function typeLabel(nt: NodeType): string {
    switch (nt) {
      case 'vision':  return t('tree.typeVision')
      case 'goal':    return t('tree.typeGoal')
      case 'project': return t('tree.typeProject')
      case 'task':    return t('tree.typeTask')
    }
  }

  const [type,   setType]   = useState<NodeType>(
    isCreate ? suggestChildType(state.parentType ?? null) : state.node.type
  )
  const [title,  setTitle]  = useState(
    isCreate ? (state.prefillTitle ?? '') : state.node.title
  )
  const [notes,  setNotes]  = useState(isCreate ? '' : (state.node.notes ?? ''))
  const [status, setStatus] = useState<NodeStatus>(isCreate ? 'not_started' : state.node.status)

  // Task Lists & Split (SPEC §5.3) — "creatable everywhere a task can be
  // created," not only retroactively from Day view. A tree node's task has
  // no day occurrence at all here — findOrCreateTaskForRef/useTaskForRef
  // work directly against tree_node_id. Only meaningful for the 'task'
  // type — Vision/Goal/Project aren't the completable-action leaves SPEC
  // §5.3 describes.
  const [pendingSteps, setPendingSteps] = useState<string[]>([])
  const [pendingStepInput, setPendingStepInput] = useState('')
  const editNodeId = state.mode === 'edit' ? state.node.id : null
  const { data: existingTask } = useTaskForRef(
    editNodeId && type === 'task' ? { source: 'tree', treeNodeId: editNodeId } : null
  )

  const navigate = useNavigate()
  const { data: allNodes } = useTreeNodes()
  const { data: sheets = [] } = useSheets()
  const { mutate: createNode, isPending: creating } = useCreateNode()
  const { mutate: updateNode, isPending: updating } = useUpdateNode()
  const { mutate: deleteNode, isPending: deleting } = useDeleteNode()
  const { mutateAsync: addFirstStepToRefAsync } = useAddFirstStepToRef()
  const { mutateAsync: addTaskStepAsync } = useAddTaskStep()

  const [sheetFormState, setSheetFormState] = useState<SheetFormState | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const isPending = creating || updating || deleting

  function addPendingStep() {
    const trimmed = pendingStepInput.trim()
    if (!trimmed) return
    setPendingSteps(prev => [...prev, trimmed])
    setPendingStepInput('')
  }
  function removePendingStep(i: number) {
    setPendingSteps(prev => prev.filter((_, idx) => idx !== i))
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    const trimmed = title.trim()
    if (!trimmed) return
    setSaveError(null)

    if (isCreate) {
      const parentId = state.parentId ?? null
      const siblings = (allNodes ?? []).filter(n => n.parentId === parentId)
      createNode({
        parentId, type, title: trimmed,
        notes: notes.trim() || null,
        position: siblings.length,
        sheetId: state.sheetId,
      }, {
        onError: e => setSaveError((e as Error).message),
        onSuccess: async (node) => {
          if (type === 'task' && pendingSteps.length > 0) {
            try {
              const ref = { source: 'tree' as const, treeNodeId: node.id }
              const taskId = await addFirstStepToRefAsync({ ref, content: pendingSteps[0] })
              for (const content of pendingSteps.slice(1)) {
                await addTaskStepAsync({ taskId, content })
              }
            } catch (e) {
              // The node itself already saved — closing and re-submitting
              // would create a duplicate node, so there's nothing left to
              // retry from this modal. Surface it and let the user re-add
              // steps from the node's own edit view instead.
              window.alert(t('tree.stepsSaveError', { title: trimmed, error: (e as Error).message }))
            }
          }
          onCreated?.(node.id)
          onClose()
        },
      })
    } else {
      updateNode({
        id:     state.node.id,
        type, title: trimmed,
        notes:  notes.trim() || null,
        status,
      }, { onSuccess: onClose, onError: e => setSaveError((e as Error).message) })
    }
  }

  function handleDelete() {
    if (state.mode !== 'edit') return
    // Unfiltered — parent_id cascades through real descendants regardless
    // of sheet_id, so deleting this node really would delete this many
    // rows even if some currently live inside an attached Sheet.
    const childCount = collectDescendantIds(state.node.id, allNodes ?? []).length
    const msg = childCount > 0
      ? t('tree.deleteNodeWithDescendantsConfirm', { title: state.node.title, n: childCount, count: childCount })
      : t('common.deleteConfirm', { title: state.node.title })
    if (!window.confirm(msg)) return
    deleteNode(state.node.id, { onSuccess: onClose })
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  const chipVar = (t: NodeType): CSSProperties => ({
    '--chip-accent':     `var(--ns-${t}-accent)`,
    '--chip-accent-rgb': `var(--ns-${t}-accent-rgb)`,
  } as CSSProperties)

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.modeLabel}>
            {isCreate ? t('tree.newNodeModeLabel') : t('tree.editNodeModeLabel')}
          </span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        {/* Type */}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('tree.legendHeadingType')}</span>
          <div className={styles.typeRow}>
            {TYPES.map(nt => (
              <button
                key={nt}
                style={chipVar(nt)}
                className={`${styles.typeChip}${type === nt ? ' ' + styles.typeChipActive : ''}`}
                onClick={() => setType(nt)}
              >
                {typeLabel(nt)}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ns-editor-title">{t('day.fieldLabelTitle')}</label>
          <input
            id="ns-editor-title"
            className={styles.titleInput}
            placeholder={t('tree.titlePlaceholder')}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            autoFocus
          />
        </div>

        {/* Notes */}
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ns-editor-notes">
            {t('day.notesLabel')} <span className={styles.optional}>{t('common.optional')}</span>
          </label>
          <textarea
            id="ns-editor-notes"
            className={styles.notesInput}
            placeholder={t('tree.notesPlaceholder')}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {/* Task Lists & Split (SPEC §5.3) — task nodes only; a Vision/Goal/
            Project isn't the completable-action leaf this feature is about. */}
        {type === 'task' && (
          <div className={styles.field}>
            {isCreate ? (
              <>
                <span className={styles.fieldLabel}>
                  {t('day.stepsLabel')} <span className={styles.optional}>{t('tree.optionalStepsHint')}</span>
                </span>
                {pendingSteps.length > 0 && (
                  <div className={styles.pendingStepList}>
                    {pendingSteps.map((s, i) => (
                      <div key={i} className={styles.pendingStepRow}>
                        <span className={styles.pendingStepText}>{s}</span>
                        <button
                          className={styles.pendingStepRemove}
                          onClick={() => removePendingStep(i)}
                          aria-label={t('tree.removeStepAriaLabel')}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.pendingStepAddRow}>
                  <input
                    className={styles.titleInput}
                    placeholder={pendingSteps.length === 0 ? t('day.turnIntoStepListPlaceholder') : t('day.addAnotherStepPlaceholder')}
                    value={pendingStepInput}
                    onChange={e => setPendingStepInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); addPendingStep() }
                    }}
                  />
                  <button
                    className={styles.saveBtn}
                    onClick={addPendingStep}
                    disabled={!pendingStepInput.trim()}
                  >{t('common.addButtonShort')}</button>
                </div>
              </>
            ) : (
              <TaskStepList
                taskId={existingTask?.id ?? null}
                taskRef={{ source: 'tree', treeNodeId: editNodeId as string }}
              />
            )}
          </div>
        )}

        {/* Status — edit mode only */}
        {!isCreate && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('tree.statusFieldLabel')}</span>
            <div className={styles.statusRow}>
              {STATUSES.map(s => (
                <button
                  key={s}
                  className={`${styles.statusBtn}${status === s ? ' ' + styles.statusBtnActive : ''}`}
                  onClick={() => setStatus(s)}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {saveError && <p className={styles.error}>{saveError}</p>}

        {/* Actions */}
        <div className={styles.actions}>
          {!isCreate && onMoveTo && (
            <button
              className={styles.moveBtn}
              onClick={() => { if (state.mode === 'edit') onMoveTo(state.node) }}
              disabled={isPending}
            >
              {t('tree.moveToButton')}
            </button>
          )}
          {!isCreate && (
            <button
              className={styles.sheetBtn}
              onClick={() => {
                if (state.mode === 'edit') {
                  setSheetFormState({ mode: 'createFromNode', nodeId: state.node.id, nodeTitle: state.node.title })
                }
              }}
              disabled={isPending}
            >
              {t('tree.createSheetButton')}
            </button>
          )}
          {!isCreate && (
            <button
              className={styles.deleteBtn}
              onClick={handleDelete}
              disabled={isPending}
            >
              {t('common.delete')}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>
            {t('common.cancel')}
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!title.trim() || isPending}
          >
            {isCreate ? t('tree.addNodeButton') : t('common.save')}
          </button>
        </div>
      </div>

      {/* Create-sheet-from-node modal (SPEC §5.5 path 2) */}
      {sheetFormState && (
        <SheetForm
          state={sheetFormState}
          allNodes={allNodes ?? []}
          sheets={sheets}
          onClose={() => setSheetFormState(null)}
          onCreated={sheetId => {
            setSheetFormState(null)
            onClose()
            navigate(`/tree?sheet=${sheetId}`)
          }}
        />
      )}
    </div>
  )
}
