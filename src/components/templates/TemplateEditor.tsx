import { useState, useEffect } from 'react'
import {
  useDayTemplates, useDayTemplateItems,
  useCreateDayTemplate, useRenameDayTemplate, useDeleteDayTemplate,
  useCreateDayTemplateItem, useUpdateDayTemplateItem, useDeleteDayTemplateItem, useReorderDayTemplateItem,
} from '../../hooks/useDayTemplates'
import type { DayTemplateItem, TemplateItemKind } from '../../hooks/useDayTemplates'
import { timeToDecimal } from '../../hooks/useDayItems'
import { BLOCK_COLOURS } from '../../lib/blockColours'
import { useT } from '../../i18n'
import styles from './TemplateEditor.module.css'

interface Props {
  templateId: string | null   // null = create mode
  onClose:    () => void
}

interface ItemFormState {
  mode:           'add' | 'edit'
  editingItemId?: string
  kind:           TemplateItemKind
  label:          string
  startTime:      string
  endTime:        string        // block only, ignored for 'line'
  colour:         string | null
}

function kindGlyph(kind: TemplateItemKind): string {
  return kind === 'block' ? '▤' : '•'
}

function itemTimeLabel(item: DayTemplateItem): string {
  return item.kind === 'block' ? `${item.startTime}–${item.endTime}` : item.startTime
}

/**
 * Full CRUD modal for a single Day Template (SPEC section 5.4). Doubles as
 * the create flow: with templateId null it shows a minimal name-only form;
 * on successful create it transitions in place to the full item editor for
 * the new id, rather than closing. Items hold only Lines + Blocks — no
 * task/step concept here.
 */
export default function TemplateEditor({ templateId, onClose }: Props) {
  const t = useT()
  const [id, setId] = useState<string | null>(templateId)
  const [error, setError] = useState<string | null>(null)

  // ── Create-mode-only state ────────────────────────────────────────────────
  const [createName, setCreateName] = useState('')

  // ── Full-editor-only state ────────────────────────────────────────────────
  const [nameInput, setNameInput] = useState('')
  const [nameInitialized, setNameInitialized] = useState(false)
  const [itemForm, setItemForm] = useState<ItemFormState | null>(null)
  const [itemFormError, setItemFormError] = useState<string | null>(null)

  const { data: templates = [] } = useDayTemplates()
  const { data: items = [] } = useDayTemplateItems(id)
  const template = templates.find(t => t.id === id)

  const { mutate: createTemplate, isPending: creatingTemplate } = useCreateDayTemplate()
  const { mutate: renameTemplate } = useRenameDayTemplate()
  const { mutate: deleteTemplate, isPending: deletingTemplate } = useDeleteDayTemplate()
  const { mutate: createItem,  isPending: creatingItem  } = useCreateDayTemplateItem()
  const { mutate: updateItem,  isPending: updatingItem  } = useUpdateDayTemplateItem()
  const { mutate: deleteItem } = useDeleteDayTemplateItem()
  const { mutate: reorderItem } = useReorderDayTemplateItem()

  const isMutating = creatingTemplate || deletingTemplate || creatingItem || updatingItem

  useEffect(() => {
    if (template && !nameInitialized) {
      setNameInput(template.name)
      setNameInitialized(true)
    }
  }, [template, nameInitialized])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  // ── Create mode ────────────────────────────────────────────────────────────

  function handleCreateSubmit() {
    const trimmed = createName.trim()
    if (!trimmed || creatingTemplate) return
    setError(null)
    createTemplate(trimmed, {
      onSuccess: (newId) => {
        // Transition in place to the full editor — do not close.
        setNameInput(trimmed)
        setNameInitialized(true)
        setId(newId)
      },
      onError: e => setError((e as Error).message),
    })
  }

  // ── Full editor: name rename ──────────────────────────────────────────────

  function commitName() {
    if (!template) return
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === template.name) {
      setNameInput(template.name)
      return
    }
    renameTemplate({ id: template.id, name: trimmed }, { onError: e => setError((e as Error).message) })
  }

  // ── Full editor: delete template ──────────────────────────────────────────

  function handleDeleteTemplate() {
    if (!id || !template) return
    if (!window.confirm(
      t('templates.deleteTemplateConfirm', { title: template.name })
    )) return
    deleteTemplate(id, { onSuccess: onClose, onError: e => setError((e as Error).message) })
  }

  // ── Full editor: inline item form ─────────────────────────────────────────

  function openAddForm(kind: TemplateItemKind) {
    setItemFormError(null)
    setItemForm({ mode: 'add', kind, label: '', startTime: '', endTime: '', colour: null })
  }

  function openEditForm(item: DayTemplateItem) {
    setItemFormError(null)
    setItemForm({
      mode: 'edit',
      editingItemId: item.id,
      kind: item.kind,
      label: item.label,
      startTime: item.startTime,
      endTime: item.endTime ?? '',
      colour: item.colour,
    })
  }

  function closeItemForm() {
    setItemForm(null)
    setItemFormError(null)
  }

  function itemTimeError(): string | null {
    if (!itemForm) return null
    if (!itemForm.startTime) return t('templates.setTimeError')
    if (itemForm.kind === 'block') {
      if (!itemForm.endTime) return t('day.blockTimeRangeRequiredError')
      if (timeToDecimal(itemForm.endTime) <= timeToDecimal(itemForm.startTime)) return t('day.endTimeAfterStartError')
    }
    return null
  }

  function itemIsValid(): boolean {
    return !!itemForm && itemForm.label.trim().length > 0 && !itemTimeError()
  }

  function handleSaveItem() {
    if (!itemForm || !id || !itemIsValid()) return
    const tErr = itemTimeError()
    if (tErr) { setItemFormError(tErr); return }
    setItemFormError(null)
    const onError = (e: unknown) => setItemFormError((e as Error).message)
    const onSuccess = () => setItemForm(null)
    const input = {
      templateId: id,
      kind:       itemForm.kind,
      label:      itemForm.label.trim(),
      startTime:  itemForm.startTime,
      endTime:    itemForm.kind === 'block' ? itemForm.endTime : null,
      colour:     itemForm.colour,
    }
    if (itemForm.mode === 'edit' && itemForm.editingItemId) {
      updateItem({ id: itemForm.editingItemId, ...input }, { onSuccess, onError })
    } else {
      createItem(input, { onSuccess, onError })
    }
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">

        <div className={styles.header}>
          {id ? (
            <input
              className={styles.nameInput}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitName() }}
              onBlur={commitName}
              aria-label={t('templates.templateNameAriaLabel')}
            />
          ) : (
            <span className={styles.modeLabel}>{t('templates.newTemplateLabel')}</span>
          )}
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className={styles.body}>
          {!id ? (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="tmpl-name">{t('common.nameLabel')}</label>
              <input
                id="tmpl-name"
                className={styles.input}
                placeholder={t('templates.namePlaceholder')}
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateSubmit() }}
                autoFocus
              />
            </div>
          ) : (
            <>
              {items.length > 0 && (
                <div className={styles.list}>
                  {items.map((item, i) => (
                    <div key={item.id} className={styles.row}>
                      <div className={styles.reorderCol}>
                        <button
                          className={styles.reorderBtn}
                          onClick={() => reorderItem({ templateId: id, itemId: item.id, direction: 'up' })}
                          disabled={i === 0}
                          aria-label={t('templates.moveUpAriaLabel')}
                        >▲</button>
                        <button
                          className={styles.reorderBtn}
                          onClick={() => reorderItem({ templateId: id, itemId: item.id, direction: 'down' })}
                          disabled={i === items.length - 1}
                          aria-label={t('templates.moveDownAriaLabel')}
                        >▼</button>
                      </div>
                      <span className={styles.kindGlyph} aria-hidden="true">{kindGlyph(item.kind)}</span>
                      {item.colour && <span className={styles.colourDot} style={{ background: item.colour }} />}
                      <span className={styles.itemLabel}>{item.label}</span>
                      <span className={styles.itemTime}>{itemTimeLabel(item)}</span>
                      <div className={styles.rowActions}>
                        <button className={styles.rowActionBtn} onClick={() => openEditForm(item)}>{t('common.edit')}</button>
                        <button
                          className={styles.rowActionBtn}
                          onClick={() => deleteItem({ id: item.id, templateId: id })}
                        >{t('common.delete')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!itemForm && (
                <div className={styles.addRow}>
                  <button className={styles.addKindBtn} onClick={() => openAddForm('line')}>{t('templates.addLineButton')}</button>
                  <button className={styles.addKindBtn} onClick={() => openAddForm('block')}>{t('templates.addBlockButton')}</button>
                </div>
              )}

              {itemForm && (
                <div className={styles.itemForm}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="tmpl-item-label">{t('day.fieldLabelLabel')}</label>
                    <input
                      id="tmpl-item-label"
                      className={styles.input}
                      placeholder={itemForm.kind === 'block' ? t('templates.blockLabelPlaceholder') : t('day.lineLabelPlaceholder')}
                      value={itemForm.label}
                      onChange={e => setItemForm({ ...itemForm, label: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveItem() }}
                      autoFocus
                    />
                  </div>

                  {itemForm.kind === 'line' ? (
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor="tmpl-item-time">{t('day.fieldLabelTime')}</label>
                      <input
                        id="tmpl-item-time"
                        type="time"
                        className={styles.timeInput}
                        value={itemForm.startTime}
                        onChange={e => setItemForm({ ...itemForm, startTime: e.target.value })}
                      />
                    </div>
                  ) : (
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>{t('day.timeRangeLabel')}</span>
                      <div className={styles.timeRow}>
                        <div className={styles.timeField}>
                          <label className={styles.fieldLabelSm}>{t('day.startFieldLabel')}</label>
                          <input
                            type="time"
                            className={styles.timeInput}
                            value={itemForm.startTime}
                            onChange={e => setItemForm({ ...itemForm, startTime: e.target.value })}
                          />
                        </div>
                        <div className={styles.timeField}>
                          <label className={styles.fieldLabelSm}>{t('day.endTimeLabel')}</label>
                          <input
                            type="time"
                            className={styles.timeInput}
                            value={itemForm.endTime}
                            onChange={e => setItemForm({ ...itemForm, endTime: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>{t('day.colourLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
                    <div className={styles.colourRow}>
                      <button
                        type="button"
                        className={`${styles.colourSwatch} ${styles.colourSwatchNone}${itemForm.colour === null ? ' ' + styles.colourSwatchActive : ''}`}
                        onClick={() => setItemForm({ ...itemForm, colour: null })}
                        title={t('day.colourNone')}
                        aria-label={t('common.noColourLabel')}
                      />
                      {BLOCK_COLOURS.map(c => (
                        <button
                          key={c.hex}
                          type="button"
                          className={`${styles.colourSwatch}${itemForm.colour === c.hex ? ' ' + styles.colourSwatchActive : ''}`}
                          style={{ background: c.hex }}
                          onClick={() => setItemForm({ ...itemForm, colour: c.hex })}
                          title={c.name}
                          aria-label={`${t('day.colourSwatchAriaLabel', { name: c.name })}${itemForm.colour === c.hex ? t('templates.colourSwatchActiveSuffix') : ''}`}
                        />
                      ))}
                    </div>
                  </div>

                  {itemFormError && <p className={styles.error}>{itemFormError}</p>}

                  <div className={styles.itemFormActions}>
                    <button className={styles.cancelBtn} onClick={closeItemForm} disabled={isMutating}>{t('common.cancel')}</button>
                    <button
                      className={styles.saveBtn}
                      onClick={handleSaveItem}
                      disabled={!itemIsValid() || isMutating}
                    >
                      {isMutating ? t('common.pendingEllipsis') : itemForm.mode === 'edit' ? t('common.save') : itemForm.kind === 'line' ? t('day.addLineSubmit') : t('day.addBlockSubmit')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          {!id ? (
            <>
              <span className={styles.actionsSpacer} />
              <button className={styles.cancelBtn} onClick={onClose} disabled={creatingTemplate}>{t('common.cancel')}</button>
              <button
                className={styles.saveBtn}
                onClick={handleCreateSubmit}
                disabled={!createName.trim() || creatingTemplate}
              >
                {creatingTemplate ? t('common.pendingEllipsis') : t('templates.createButton')}
              </button>
            </>
          ) : (
            <>
              <button className={styles.deleteItemBtn} onClick={handleDeleteTemplate} disabled={deletingTemplate}>
                {t('templates.deleteTemplateButton')}
              </button>
              <span className={styles.actionsSpacer} />
              <button className={styles.cancelBtn} onClick={onClose}>{t('common.close')}</button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
