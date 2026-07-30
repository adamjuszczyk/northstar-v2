import { useState } from 'react'
import { useDayTemplates, useDeleteDayTemplate } from '../../hooks/useDayTemplates'
import { useT } from '../../i18n'
import TemplateEditor from './TemplateEditor'
import styles from './TemplateList.module.css'

/**
 * Library view rendered inside Settings (SPEC section 5.4 / TASKS.md Phase
 * 5) -- a compact list of existing Day Templates plus full CRUD entry
 * points. Not a one-shot creation flow: rename, delete, and item-level
 * editing all live behind TemplateEditor, opened per-row or via "+ New
 * template" (create mode, templateId = null).
 */
export default function TemplateList() {
  const t = useT()
  const { data: templates = [], isLoading } = useDayTemplates()
  const { mutate: deleteTemplate } = useDeleteDayTemplate()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)

  function openCreate() {
    setEditingId(null)
    setEditorOpen(true)
  }

  function openEdit(id: string) {
    setEditingId(id)
    setEditorOpen(true)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditingId(null)
  }

  function handleDelete(id: string, name: string) {
    if (!window.confirm(
      t('templates.deleteTemplateConfirm', { title: name })
    )) return
    deleteTemplate(id)
  }

  return (
    <div className={styles.wrap}>
      {isLoading ? (
        <p className={styles.hint}>{t('common.loading')}</p>
      ) : templates.length === 0 ? (
        <p className={styles.hint}>{t('templates.noTemplatesEmptyState')}</p>
      ) : (
        <div className={styles.list}>
          {templates.map(tmpl => (
            <div key={tmpl.id} className={styles.row}>
              <span className={styles.name}>{tmpl.name}</span>
              <div className={styles.rowActions}>
                <button className={styles.editBtn} onClick={() => openEdit(tmpl.id)}>{t('common.edit')}</button>
                <button className={styles.deleteBtn} onClick={() => handleDelete(tmpl.id, tmpl.name)}>{t('common.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className={styles.newBtn} onClick={openCreate}>{t('templates.newTemplateButton')}</button>

      {editorOpen && (
        <TemplateEditor templateId={editingId} onClose={closeEditor} />
      )}
    </div>
  )
}
