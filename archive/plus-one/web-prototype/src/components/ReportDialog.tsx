// Report a hangout, a chat message or a member (POST /api/report), and block a member (POST /api/block).
// Opens as the same bottom sheet as sharing; the reported person never learns who reported them.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { blockMember, submitReport } from '../data/api'
import {
  HANGOUT_HIDE_REPORT_THRESHOLD,
  MESSAGE_HIDE_REPORT_THRESHOLD,
  REPORT_DETAILS_MAX,
  type ReportReason,
  type ReportTarget,
} from '../data/types'
import { refresh } from '../lib/resource'
import { Icon } from './Icon'
import './report.css'

export interface ReportSubject {
  type: ReportTarget
  /** Id of the hangout, message or member. */
  id: string
  hangoutId: string
  /** How the sheet names it: "this hangout", "a message from Mara", "Mara". */
  label: string
  /** Set for members (and message authors), so they can be blocked too. */
  member?: { id: string; nickname: string }
}

const REASONS: Array<{ id: ReportReason; label: string }> = [
  { id: 'harassment', label: 'Harassment or threats' },
  { id: 'unsafe', label: 'Feels unsafe' },
  { id: 'spam', label: 'Spam or a scam' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'other', label: 'Something else' },
]

type Phase = 'form' | 'sending' | 'sent' | 'blocked' | 'failed'

export function ReportDialog({ subject, onClose }: { subject: ReportSubject | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (subject && !dialog.open) dialog.showModal()
    if (!subject && dialog.open) dialog.close()
  }, [subject])

  return (
    <dialog
      ref={ref}
      className="share report"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      aria-labelledby="report-title"
      data-testid="report-dialog"
    >
      {subject && <ReportPanel key={`${subject.type}:${subject.id}`} subject={subject} onClose={onClose} />}
    </dialog>
  )
}

function ReportPanel({ subject, onClose }: { subject: ReportSubject; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(false)
  const [phase, setPhase] = useState<Phase>('form')
  const member = subject.member

  const block = async () => {
    if (!member) return
    setPhase('sending')
    try {
      await blockMember({ memberId: member.id })
      await refresh((key) => key.startsWith('messages:'))
      setPhase('blocked')
    } catch {
      setPhase('failed')
    }
  }

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!reason) return
    setPhase('sending')
    try {
      await submitReport({
        targetType: subject.type,
        targetId: subject.id,
        hangoutId: subject.hangoutId,
        reason,
        details: details.trim() || undefined,
      })
      if (alsoBlock && member) {
        await blockMember({ memberId: member.id })
        await refresh((key) => key.startsWith('messages:'))
      }
      setPhase('sent')
    } catch {
      setPhase('failed')
    }
  }

  if (phase === 'sent' || phase === 'blocked' || phase === 'failed') {
    const title = phase === 'failed' ? 'That didn’t go through' : phase === 'blocked' ? `${member?.nickname} is blocked` : 'Thanks, we got it'
    const body =
      phase === 'failed'
        ? 'Check your connection and try again. If you feel unsafe right now, leave and call 112.'
        : phase === 'blocked'
          ? 'You won’t see their messages in any hangout. They are not told.'
          : `${alsoBlock && member ? `${member.nickname} is blocked too. ` : ''}A message is hidden after ${MESSAGE_HIDE_REPORT_THRESHOLD} reports and a hangout after ${HANGOUT_HIDE_REPORT_THRESHOLD}. Nobody sees who reported.`
    return (
      <div className="share__panel report__panel" tabIndex={-1} autoFocus>
        <div className="share__grabber" aria-hidden="true" />
        <div className="report__done">
          <span className={`report__badge ${phase === 'failed' ? 'is-error' : ''}`} aria-hidden="true">
            <Icon name={phase === 'failed' ? 'alert' : 'check'} size={22} strokeWidth={2} />
          </span>
          <p className="report__title" id="report-title">
            {title}
          </p>
          <p className="t-muted report__body">{body}</p>
          <button className="btn btn--primary btn--wide" onClick={phase === 'failed' ? () => setPhase('form') : onClose}>
            {phase === 'failed' ? 'Try again' : 'Done'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="share__panel report__panel" onSubmit={send} tabIndex={-1} autoFocus>
      <div className="share__grabber" aria-hidden="true" />
      <div className="share__head">
        <p className="report__title" id="report-title">
          Report {subject.label}
        </p>
        <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
      </div>
      <p className="t-muted report__intro">Tell us what happened. Nobody sees who reported.</p>
      <fieldset className="report__reasons">
        <legend className="sr-only">Reason</legend>
        {REASONS.map((r) => (
          <label key={r.id} className={`report__reason ${reason === r.id ? 'is-checked' : ''}`}>
            <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
            <span>{r.label}</span>
            <span className="report__radio" aria-hidden="true" />
          </label>
        ))}
      </fieldset>
      <label className="t-label report__label" htmlFor="report-details">
        Details (optional)
      </label>
      <textarea
        id="report-details"
        className="report__details"
        value={details}
        maxLength={REPORT_DETAILS_MAX}
        rows={3}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="What should the team know?"
      />
      {member && (
        <label className="report__block">
          <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
          <span>Also block {member.nickname}</span>
        </label>
      )}
      <div className="report__actions">
        <button
          type="submit"
          className="btn btn--primary btn--wide"
          disabled={!reason || phase === 'sending'}
          data-testid="report-submit"
        >
          Send report
        </button>
        {member && (
          <button
            type="button"
            className="btn btn--ghost btn--wide"
            onClick={block}
            disabled={phase === 'sending'}
            data-testid="block-member"
          >
            Just block {member.nickname}
          </button>
        )}
      </div>
    </form>
  )
}
