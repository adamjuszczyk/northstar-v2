import { useState, useEffect } from 'react'
import {
  useCreateSheet, useCreateSheetFromNode,
  useRenameSheet, useAttachSheet, useDetachSheet, useDissolveSheet,
} from '../../hooks/useSheets'
import TreeNodePicker from '../pickers/TreeNodePicker'
import type { Sheet, TreeNode } from '../../types'
import { useT } from '../../i18n'
import styles from './SheetForm.module.css'

export type SheetFormState =
  | { mode: 'create' }
  | { mode: 'createFromNode'; nodeId: string; nodeTitle: string }
  | { mode: 'manage'; sheet: Sheet }

interface Props {
  state:    SheetFormState
  /** Full, unfiltered node list — needed both for the attach picker's
   *  candidates and (createFromNode) to compute the moved descendant set. */
  allNodes: TreeNode[]
  sheets:   Sheet[]
  onClose:  () => void
  /** Fired after either create path succeeds — caller switches to the new tab. */
  onCreated?:   (sheetId: string) => void
  /** Fired after a dissolve succeeds, with the id that's now gone — caller
   *  falls back to Main Tree if that was the sheet being viewed. */
  onDissolved?: (sheetId: string) => void
}

export default function SheetForm({ state, allNodes, sheets, onClose, onCreated, onDissolved }: Props) {
  const t = useT()
  const isManage = state.mode === 'manage'

  const [name, setName] = useState(state.mode === 'manage' ? state.sheet.name : '')
  const [attaching, setAttaching] = useState(false)
  const [attachNodeId, setAttachNodeId] = useState<string | null>(null)
  const [confirmingDissolve, setConfirmingDissolve] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { mutate: createSheet,     isPending: creating }         = useCreateSheet()
  const { mutate: createFromNode,  isPending: creatingFromNode } = useCreateSheetFromNode()
  const { mutate: renameSheet,     isPending: renaming }         = useRenameSheet()
  const { mutate: attachSheet,     isPending: attachingPending } = useAttachSheet()
  const { mutate: detachSheet,     isPending: detaching }        = useDetachSheet()
  const { mutate: dissolveSheet,   isPending: dissolving }       = useDissolveSheet()

  const isPending = creating || creatingFromNode || renaming || attachingPending || detaching || dissolving

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || isPending) return
    setError(null)
    if (state.mode === 'create') {
      createSheet({ name: trimmed }, {
        onSuccess: sheet => onCreated?.(sheet.id),
        onError:   e => setError((e as Error).message),
      })
    } else if (state.mode === 'createFromNode') {
      createFromNode({ name: trimmed, nodeId: state.nodeId, allNodes }, {
        onSuccess: sheet => onCreated?.(sheet.id),
        onError:   e => setError((e as Error).message),
      })
    }
  }

  function handleRename() {
    if (state.mode !== 'manage' || isPending) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === state.sheet.name) return
    setError(null)
    renameSheet({ id: state.sheet.id, name: trimmed }, { onError: e => setError((e as Error).message) })
  }

  function handleAttach() {
    if (state.mode !== 'manage' || !attachNodeId || isPending) return
    setError(null)
    attachSheet({ id: state.sheet.id, nodeId: attachNodeId }, {
      onSuccess: () => { setAttaching(false); setAttachNodeId(null) },
      onError:   e => setError((e as Error).message),
    })
  }

  function handleDetach() {
    if (state.mode !== 'manage' || isPending) return
    setError(null)
    detachSheet(state.sheet.id, { onError: e => setError((e as Error).message) })
  }

  function handleDissolve() {
    if (state.mode !== 'manage' || isPending) return
    setError(null)
    dissolveSheet(state.sheet.id, {
      onSuccess: () => onDissolved?.(state.sheet.id),
      onError:   e => setError((e as Error).message),
    })
  }

  const anchorNode = state.mode === 'manage' && state.sheet.anchorNodeId
    ? allNodes.find(n => n.id === state.sheet.anchorNodeId) ?? null
    : null

  const alreadyAnchoredIds = new Set(
    sheets.filter(s => s.anchorNodeId).map(s => s.anchorNodeId as string),
  )
  // Only main-tree nodes not already anchoring some other sheet are valid
  // anchor choices — but that restriction must only affect what's
  // SELECTABLE, never what TreeNodePicker is given to render/count. Handing
  // it a pre-filtered node list would silently undercount any ancestor
  // whose descendant lives in a different sheet (TASKS.md §3.5's audit
  // rule) — so the full unfiltered list goes in, and disabledIds carries
  // the restriction instead.
  const invalidAnchorIds = new Set(
    allNodes.filter(n => n.sheetId !== null).map(n => n.id).concat(Array.from(alreadyAnchoredIds)),
  )

  const headerLabel =
    state.mode === 'create'         ? t('tree.sheetHeaderNew')
    : state.mode === 'createFromNode' ? t('tree.sheetHeaderCreateFromNode')
    : t('tree.sheetHeaderManage', { name: state.sheet.name.toUpperCase() })

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.modeLabel}>{headerLabel}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        {state.mode === 'createFromNode' && (
          <p className={styles.hint}>
            {t('tree.moveSubtreeHint', { title: state.nodeTitle })}
          </p>
        )}

        {(state.mode === 'create' || state.mode === 'createFromNode') && (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="sheet-name">{t('common.nameLabel')}</label>
            <input
              id="sheet-name"
              className={styles.titleInput}
              placeholder={t('tree.sheetNamePlaceholder')}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              autoFocus
            />
          </div>
        )}

        {isManage && (
          <>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="sheet-rename">{t('common.nameLabel')}</label>
              <div className={styles.inlineRow}>
                <input
                  id="sheet-rename"
                  className={styles.titleInput}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename() }}
                />
                <button
                  className={styles.saveBtn}
                  onClick={handleRename}
                  disabled={!name.trim() || name.trim() === state.sheet.name || isPending}
                >
                  {t('common.save')}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('tree.anchorLabel')}</span>
              {anchorNode ? (
                <div className={styles.anchorRow}>
                  <span className={styles.anchorTitle}>{anchorNode.title}</span>
                  <button className={styles.detachBtn} onClick={handleDetach} disabled={isPending}>
                    {t('tree.detachButton')}
                  </button>
                </div>
              ) : attaching ? (
                <>
                  <TreeNodePicker
                    nodes={allNodes}
                    selectedIds={attachNodeId ? new Set([attachNodeId]) : new Set()}
                    onToggleSelect={id => setAttachNodeId(prev => prev === id ? null : id)}
                    disabledIds={invalidAnchorIds}
                    emptyHint={t('pickers.noNodesYet')}
                  />
                  <div className={styles.inlineRow}>
                    <button
                      className={styles.cancelBtn}
                      onClick={() => { setAttaching(false); setAttachNodeId(null) }}
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      className={styles.saveBtn}
                      onClick={handleAttach}
                      disabled={!attachNodeId || isPending}
                    >
                      {t('tree.attachButton')}
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.anchorRow}>
                  <span className={styles.detachedHint}>{t('tree.detachedHint')}</span>
                  <button className={styles.attachBtn} onClick={() => setAttaching(true)} disabled={isPending}>
                    {t('tree.attachToNodeButton')}
                  </button>
                </div>
              )}
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('tree.dissolveLabel')}</span>
              {confirmingDissolve ? (
                <div className={styles.dissolveConfirm}>
                  <p className={styles.hint}>
                    {t('tree.dissolveHint')}
                  </p>
                  <div className={styles.inlineRow}>
                    <button
                      className={styles.cancelBtn}
                      onClick={() => setConfirmingDissolve(false)}
                      disabled={isPending}
                    >
                      {t('common.cancel')}
                    </button>
                    <button className={styles.deleteBtn} onClick={handleDissolve} disabled={isPending}>
                      {dissolving ? t('common.pendingEllipsis') : t('tree.dissolveSheetButton')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className={styles.deleteBtn}
                  onClick={() => setConfirmingDissolve(true)}
                  disabled={isPending}
                >
                  {t('tree.dissolveSheetTrigger')}
                </button>
              )}
            </div>
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {(state.mode === 'create' || state.mode === 'createFromNode') && (
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>
              {t('common.cancel')}
            </button>
            <button className={styles.saveBtn} onClick={handleCreate} disabled={!name.trim() || isPending}>
              {isPending ? t('common.pendingEllipsis') : t('tree.createSheetButton')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
