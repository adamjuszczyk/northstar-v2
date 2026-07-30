import { useState, useEffect } from 'react'
import { useCreateLine, useUpdateLine, useDeleteLine } from '../../hooks/useLines'
import type { Line } from '../../hooks/useLines'
import { BLOCK_COLOURS } from '../../lib/blockColours'
import { useT } from '../../i18n'
import styles from './LineForm.module.css'

interface Props {
  date:    string
  line?:   Line | null   // present = edit mode, absent/null = create mode
  onClose: () => void
}

export default function LineForm({ date, line, onClose }: Props) {
  const t = useT()
  const isEdit = !!line
  const [label,  setLabel]  = useState(line?.label ?? '')
  const [time,   setTime]   = useState(line?.time  ?? '')
  const [colour, setColour] = useState<string | null>(line?.colour ?? null)
  const [error,  setError]  = useState<string | null>(null)

  const { mutate: create, isPending: creating } = useCreateLine()
  const { mutate: update, isPending: updating } = useUpdateLine()
  const { mutate: remove, isPending: removing } = useDeleteLine()
  const isPending = creating || updating || removing

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function isValid(): boolean {
    return label.trim().length > 0 && time.trim().length > 0
  }

  function handleSave() {
    if (isPending || !isValid()) return
    setError(null)
    const onError = (e: unknown) => setError((e as Error).message)
    if (isEdit) {
      update({ id: line!.id, label: label.trim(), time, colour }, { onSuccess: onClose, onError })
    } else {
      create({ date, label: label.trim(), time, colour }, { onSuccess: onClose, onError })
    }
  }

  function handleDelete() {
    if (!line) return
    if (!window.confirm(t('common.deleteConfirm', { title: line.label }))) return
    remove(line.id, { onSuccess: onClose, onError: e => setError((e as Error).message) })
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">

        <div className={styles.header}>
          <span className={styles.modeLabel}>{isEdit ? t('day.modeLabelEditLine') : t('day.modeLabelAddLine')}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="line-label">{t('day.fieldLabelLabel')}</label>
            <input
              id="line-label"
              className={styles.input}
              placeholder={t('day.lineLabelPlaceholder')}
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="line-time">{t('day.fieldLabelTime')}</label>
            <input
              id="line-time"
              type="time"
              className={styles.timeInput}
              value={time}
              onChange={e => setTime(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('day.colourLabel')} <span className={styles.optionalLabel}>{t('common.optional')}</span></span>
            <div className={styles.colourRow}>
              <button
                type="button"
                className={`${styles.colourSwatch} ${styles.colourSwatchNone}${colour === null ? ' ' + styles.colourSwatchActive : ''}`}
                onClick={() => setColour(null)}
                title={t('day.colourNone')}
                aria-label={t('common.noColourLabel')}
              />
              {BLOCK_COLOURS.map(c => (
                <button
                  key={c.hex}
                  type="button"
                  className={`${styles.colourSwatch}${colour === c.hex ? ' ' + styles.colourSwatchActive : ''}`}
                  style={{ background: c.hex }}
                  onClick={() => setColour(c.hex)}
                  title={c.name}
                  aria-label={colour === c.hex ? t('day.colourSwatchActiveAriaLabel', { name: c.name }) : t('day.colourSwatchAriaLabel', { name: c.name })}
                />
              ))}
            </div>
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          {isEdit && (
            <button className={styles.deleteItemBtn} onClick={handleDelete} disabled={isPending}>
              {t('common.delete')}
            </button>
          )}
          <span className={styles.actionsSpacer} />
          <button className={styles.cancelBtn} onClick={onClose} disabled={isPending}>{t('common.cancel')}</button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!isValid() || isPending}
          >
            {isPending ? t('common.pendingEllipsis') : isEdit ? t('common.save') : t('day.addLineSubmit')}
          </button>
        </div>

      </div>
    </div>
  )
}
