// Members-only group chat (GET/POST /api/hangouts/:id/messages). The Worker also pushes frames over
// /api/hangouts/:id/live; the mock has no socket, so the list refreshes after each post.
import { Suspense, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { listMessages, postMessage } from '../data/api'
import { MESSAGE_MAX, type Member, type Message } from '../data/types'
import { refresh, useResource } from '../lib/resource'
import { formatTime } from '../lib/time'
import { Icon } from './Icon'
import type { ReportSubject } from './ReportDialog'
import { Avatar } from './ui'
import './chat.css'

interface ChatProps {
  hangoutId: string
  me: Member
  timeZone: string
  onReport: (subject: ReportSubject) => void
}

export function Chat(props: ChatProps) {
  return (
    <section className="block chat" aria-labelledby="chat-title" data-testid="chat">
      <div className="chat__head">
        <p className="t-label" id="chat-title">
          Group chat
        </p>
        <span className="t-label chat__private">
          <Icon name="shield" size={12} /> Members only
        </span>
      </div>
      <Suspense fallback={<div className="chat__list skeleton" aria-busy="true" />}>
        <Thread {...props} />
      </Suspense>
    </section>
  )
}

function Thread({ hangoutId, me, timeZone, onReport }: ChatProps) {
  const key = `messages:${hangoutId}`
  const { messages } = useResource(key, () => listMessages(hangoutId))
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const list = useRef<HTMLOListElement>(null)

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [messages.length])

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setFailed(false)
    try {
      await postMessage(hangoutId, { body })
      setDraft('')
      await refresh((k) => k === key)
    } catch {
      setFailed(true)
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <>
      <ol className="chat__list" ref={list} aria-live="polite" aria-label="Messages">
        {messages.length === 0 && <li className="chat__empty t-muted">Say hi and tell the group how to find you.</li>}
        {messages.map((m) => (
          <ChatLine
            key={m.id}
            message={m}
            mine={m.memberId === me.id}
            timeZone={timeZone}
            onReport={() =>
              onReport({
                type: 'message',
                id: m.id,
                hangoutId,
                label: `a message from ${m.authorNickname}`,
                member: { id: m.memberId, nickname: m.authorNickname },
              })
            }
          />
        ))}
      </ol>
      <form className="chat__composer" onSubmit={send}>
        <label className="sr-only" htmlFor="chat-input">
          Message the group
        </label>
        <textarea
          id="chat-input"
          className="chat__input"
          rows={1}
          value={draft}
          maxLength={MESSAGE_MAX}
          placeholder="Message the group"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          enterKeyHint="send"
          data-testid="chat-input"
        />
        <button
          type="submit"
          className="btn btn--primary btn--icon chat__send"
          disabled={!draft.trim() || sending}
          aria-label="Send"
          data-testid="chat-send"
        >
          <Icon name="send" size={16} />
        </button>
      </form>
      <p className="t-label chat__note" role={failed ? 'alert' : undefined}>
        {failed ? 'Not sent. Check your connection and try again.' : 'Meet inside the venue. Never share your address or phone number.'}
      </p>
    </>
  )
}

function ChatLine({
  message,
  mine,
  timeZone,
  onReport,
}: {
  message: Message
  mine: boolean
  timeZone: string
  onReport: () => void
}) {
  const time = formatTime(message.createdAt, timeZone)
  if (message.kind === 'arrived') {
    return (
      <li className="chat__arrived">
        <span className="chat__arrived-dot" aria-hidden="true">
          <Icon name="check" size={10} strokeWidth={2.4} />
        </span>
        <span>
          {mine ? 'You are' : `${message.authorNickname} is`} here · {time}
        </span>
      </li>
    )
  }
  return (
    <li className={`chat__line ${mine ? 'is-mine' : ''}`}>
      <Avatar nickname={message.authorNickname} size={28} you={mine} />
      <div className="chat__bubble">
        <p className="chat__meta">
          <span className="chat__author">{mine ? 'You' : message.authorNickname}</span>
          <span className="t-label">{time}</span>
        </p>
        <p className="chat__body">{message.body}</p>
      </div>
      {!mine && (
        <button
          className="chat__report"
          onClick={onReport}
          aria-label={`Report message from ${message.authorNickname}`}
          data-testid="report-message"
        >
          <Icon name="flag" size={14} />
        </button>
      )}
    </li>
  )
}
