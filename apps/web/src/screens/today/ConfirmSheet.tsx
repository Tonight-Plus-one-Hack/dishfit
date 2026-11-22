// Bottom sheet that asks before a destructive action. Opens as a modal <dialog>, like the share sheet.
import { useTranslation } from '../../i18n'
import { useEffect, useRef, type ReactNode } from 'react'

export function ConfirmSheet({
  open,
  title,
  body,
  confirm,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirm: string
  onConfirm: () => void
  onClose: () => void
}) {
  const t = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      panelRef.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {open && (
        <div className="confirm__panel" ref={panelRef} tabIndex={-1}>
          <span className="confirm__grabber" aria-hidden="true" />
          <h2 className="t-feature" id="confirm-title">
            {title}
          </h2>
          <div className="t-muted confirm__body" id="confirm-body">
            {body}
          </div>
          <div className="confirm__actions">
            <button className="btn btn--wide confirm__danger" onClick={onConfirm}>
              {confirm}
            </button>
            <button className="btn btn--secondary btn--wide" onClick={onClose}>{t('cancel')}</button>
          </div>
        </div>
      )}
    </dialog>
  )
}
