import { useState, useEffect } from 'react'
import { useCreateBlock, useUpdateBlock, useDeleteBlock } from '../../hooks/useBlocks'
import type { Block } from '../../hooks/useBlocks'
import { timeToDecimal } from '../../hooks/useDayItems'
import { BLOCK_COLOURS } from '../../lib/blockColours'
import { useT } from '../../i18n'
import styles from './BlockForm.module.css'

interface Props {
  date:    string
  block?:  Block | null   // present = edit mode, absent/null = create mode
  onClose: () => void
}

export default function BlockForm({ date, block, onClose }: Props) {
  const t = useT()
  const isEdit = !!block
  const [name,      setName]      = useState(block?.name ?? '')
  const [startTime, setStartTime] = useState(block?.startTime ?? '')
  const [endTime,   setEndTime]   = useState(block?.endTime   ?? '')
  const [colour,    setColour]    = useState<string | null>(block?.colour ?? null)
  const [notes,     setNotes]     = useState(block?.notes ?? '')
  const [error,     setError]     = useState<string | null>(null)

  const { mutate: create, isPending: creating } = useCreateBlock()
  const { mutate: update, isPending: updating } = useUpdateBlock()
  const { mutate: remove, isPending: removing } = useDeleteBlock()
  const isPending = creating || updating || removing

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function timeError(): string | null {
    if (!startTime || !endTime) return t("day.blockTimeRangeRequiredError")
    if (timeToDecimal(endTime) <= timeToDecimal(startTime)) return t("day.endTimeAfterStartError")
    return null
  }

  function isValid(): boolean {
    return name.trim().length > 0 && !timeError()
  }

  function handleSave() {
    if (isPending || !isValid()) return
    const tErr = timeError()
    if (tErr) { setError(tErr); return }
    setError(null)
    const onError = (e: unknown) => setError((e as Error).message)
    const input = {
      name: name.trim(),
      startTime,
      endTime,
      colour,
      notes: notes.trim() || null,
    }
    if (isEdit) {
      update({ id: block!.id, ...input }, { onSuccess: onClose, onError })
    } else {
      create({ date, ...input }, { onSuccess: onClose, onError })
    }
  }

  function handleDelete() {
    if (!block) return
    if (!window.confirm(t("day.deleteBlockConfirm", { title: block.name }))) return
    remove(block.id, { onSuccess: onClose, onError: e => setError((e as Error).message) })
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">

        <div className={styles.header}>
          <span className={styles.modeLabel}>{isEdit ? t("day.editBlockHeader") : t("day.addBlockHeader")}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t("common.close")}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="block-name">{t("common.nameLabel")}</label>
            <input
              id="block-name"
              className={styles.input}
              placeholder={t("day.blockNamePlaceholder")}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("day.timeRangeLabel")}</span>
            <div className={styles.timeRow}>
              <div className={styles.timeField}>
                <label className={styles.fieldLabelSm}>{t("day.startFieldLabel")}</label>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                />
              </div>
              <div className={styles.timeField}>
                <label className={styles.fieldLabelSm}>{t("day.endTimeLabel")}</label>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("day.colourLabel")} <span className={styles.optionalLabel}>{t("common.optional")}</span></span>
            <div className={styles.colourRow}>
              <button
                type="button"
                className={`${styles.colourSwatch} ${styles.colourSwatchNone}${colour === null ? ' ' + styles.colourSwatchActive : ''}`}
                onClick={() => setColour(null)}
                title={t("day.colourNone")}
                aria-label={t("common.noColourLabel")}
              />
              {BLOCK_COLOURS.map(c => (
                <button
                  key={c.hex}
                  type="button"
                  className={`${styles.colourSwatch}${colour === c.hex ? ' ' + styles.colourSwatchActive : ''}`}
                  style={{ background: c.hex }}
                  onClick={() => setColour(c.hex)}
                  title={c.name}
                  aria-label={colour === c.hex ? t("day.colourSwatchActiveAriaLabel", { name: c.name }) : t("day.colourSwatchAriaLabel", { name: c.name })}
                />
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="block-notes">{t("day.notesLabel")} <span className={styles.optionalLabel}>{t("day.notesOptionalHint")}</span></label>
            <textarea
              id="block-notes"
              className={styles.textarea}
              placeholder={t("day.blockNotesPlaceholder")}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          {isEdit && (
            <button className={styles.deleteItemBtn} onClick={handleDelete} disabled={isPending}>
              {t("common.delete")}
            </button>
          )}
          <span className={styles.actionsSpacer} />
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>{t("common.cancel")}</button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!isValid() || isPending}
          >
            {isPending ? t("common.pendingEllipsis") : isEdit ? t("common.save") : t("day.addBlockSubmit")}
          </button>
        </div>

      </div>
    </div>
  )
}
