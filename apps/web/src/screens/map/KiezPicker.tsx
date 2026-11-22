// Kiez choice for the map: a modal bottom sheet with "In deiner Nähe" plus every Kiez.
import { useTranslation } from '../../i18n'
import { useEffect, useRef } from 'react'
import { Icon } from '../../components/Icon'
import { KIEZE, type Kiez } from '../../data/contract'

export function KiezPicker({ open, value, onChange, onClose }: { open: boolean; value: Kiez | null; onChange: (kiez: Kiez | null) => void; onClose: () => void }) {
  const t = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const options: Array<{ value: Kiez | null; label: string }> = [{ value: null, label: t('nearYou') }, ...KIEZE.map((k) => ({ value: k, label: k }))]

  return (
    <dialog
      ref={ref}
      className="kiez-picker"
      aria-labelledby="kiez-picker-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="kiez-picker__panel">
        <div className="kiez-picker__head">
          <h2 id="kiez-picker-title">{t('chooseANeighbourhood')}</h2>
          <button type="button" className="kiez-picker__close" onClick={onClose} aria-label={t('close')}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div role="radiogroup" aria-labelledby="kiez-picker-title" className="kiez-picker__list">
          {options.map((o) => {
            const checked = o.value === value
            return (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={checked}
                className="kiez-picker__option"
                onClick={() => {
                  onChange(o.value)
                  onClose()
                }}
              >
                <Icon name={o.value ? 'city' : 'locate'} size={18} />
                <span>{o.label}</span>
                {checked && <Icon name="check" size={18} strokeWidth={2} className="kiez-picker__check" />}
              </button>
            )
          })}
        </div>
      </div>
    </dialog>
  )
}
