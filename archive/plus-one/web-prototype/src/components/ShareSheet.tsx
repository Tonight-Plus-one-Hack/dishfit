import { useEffect, useRef, useState } from 'react'
import { trackEvent } from '../data/api'
import type { ShareChannel } from '../data/types'
import { MOTION } from '../lib/motion'
import { sharedUrl } from '../lib/share'
import { Icon, WhatsAppGlyph } from './Icon'
import './share.css'

export interface ShareTarget {
  title: string
  text: string
  url: string
  image?: string
  meta?: string
  /** For share_click analytics. */
  city?: string
  hangout?: string
}

function track(target: ShareTarget, channel: ShareChannel) {
  trackEvent('share_click', { city: target.city ?? null, hangout: target.hangout ?? null, channel })
}

/** Native share, WhatsApp and copy link. Used in the sheet and inline after starting a hangout. */
export function ShareActions({
  target,
  onShared,
  variant = 'grid',
}: {
  target: ShareTarget
  onShared?: () => void
  variant?: 'grid' | 'stack'
}) {
  const [copied, setCopied] = useState(false)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    const url = sharedUrl(target.url, 'copy')
    track(target, 'copy')
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const input = document.createElement('input')
      input.value = url
      document.body.append(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), MOTION.copiedMs)
  }
  const nativeShare = async () => {
    track(target, 'native')
    try {
      await navigator.share({ title: target.title, text: target.text, url: sharedUrl(target.url, 'native') })
      onShared?.()
    } catch {
      // Dismissed by the user: stay where we are.
    }
  }
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${target.text} ${sharedUrl(target.url, 'whatsapp')}`)}`

  if (variant === 'stack') {
    return (
      <div className="share-stack">
        <a
          className="btn btn--primary btn--wide"
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          onClick={() => track(target, 'whatsapp')}
          data-testid="share-whatsapp"
        >
          <WhatsAppGlyph size={16} /> Send on WhatsApp
        </a>
        <button className="btn btn--secondary btn--wide" onClick={copy} aria-live="polite" data-testid="share-copy">
          <Icon name={copied ? 'check' : 'link'} size={14} /> {copied ? 'Link copied' : 'Copy link'}
        </button>
        {canNativeShare && (
          <button className="btn btn--secondary btn--wide" onClick={nativeShare} data-testid="share-native">
            <Icon name="share" size={14} /> More ways to share
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="share__actions">
      {canNativeShare && (
        <button className="share__action" onClick={nativeShare} data-testid="share-native">
          <span className="icon-badge">
            <Icon name="share" size={18} />
          </span>
          <span>Share via…</span>
        </button>
      )}
      <a
        className="share__action"
        href={whatsapp}
        target="_blank"
        rel="noreferrer"
        onClick={() => track(target, 'whatsapp')}
        data-testid="share-whatsapp"
      >
        <span className="icon-badge">
          <WhatsAppGlyph size={18} />
        </span>
        <span>WhatsApp</span>
      </a>
      <button className="share__action" onClick={copy} aria-live="polite" data-testid="share-copy">
        <span className="icon-badge">
          <Icon name={copied ? 'check' : 'link'} size={18} />
        </span>
        <span>{copied ? 'Link copied' : 'Copy link'}</span>
      </button>
    </div>
  )
}

export function ShareSheet({ target, onClose }: { target: ShareTarget | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (target && !dialog.open) dialog.showModal()
    if (!target && dialog.open) dialog.close()
  }, [target])

  if (!target) return <dialog ref={ref} className="share" onClose={onClose} />

  return (
    <dialog
      ref={ref}
      className="share"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      aria-labelledby="share-title"
    >
      <div className="share__panel" tabIndex={-1} autoFocus>
        <div className="share__grabber" aria-hidden="true" />
        <div className="share__head">
          <p className="t-label" id="share-title">
            Share
          </p>
          <button className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="share__preview">
          {target.image && <img src={target.image} alt="" className="share__thumb" />}
          <div className="share__preview-text">
            <p className="share__title">{target.title}</p>
            {target.meta && <p className="t-label">{target.meta}</p>}
            <p className="share__url">{target.url.replace(/^https?:\/\//, '')}</p>
          </div>
        </div>
        <ShareActions key={target.url} target={target} onShared={onClose} />
      </div>
    </dialog>
  )
}
