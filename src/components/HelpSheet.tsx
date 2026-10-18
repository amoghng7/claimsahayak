import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Kicker } from './kit'
import {
  askHelp,
  HELP_DISCLAIMER,
  HELP_QUESTION_MAX,
  HELP_STARTERS,
  type HelpTurn,
} from '../engine/help'
import { loadGeminiKey, type KeyState } from '../engine/gemini'

/**
 * Help is a clerk over the current screen, not a third page, so a scan in
 * progress stays mounted underneath. The transcript lives only while this
 * sheet is open.
 */
export function HelpSheet({
  keyState,
  onClose,
}: {
  keyState: KeyState
  onClose: () => void
}) {
  const titleId = useId()
  const noteId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const sending = useRef(false)
  const [draft, setDraft] = useState('')
  const [turns, setTurns] = useState<HelpTurn[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
  }, [])

  useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    thread.scrollTop = thread.scrollHeight
  }, [turns, pending, error])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled'))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const send = async (question: string) => {
    const asked = question.trim()
    if (!asked || sending.current) return
    sending.current = true
    setError(null)
    setDraft('')
    setTurns((current) => [...current, { role: 'user', text: asked }])
    setPending(true)
    try {
      // `turns` is the completed exchange. The new question is appended by askHelp,
      // and a previous question that never got a reply is dropped there too.
      const reply = await askHelp(loadGeminiKey(), turns, asked)
      setTurns((current) => [...current, { role: 'model', text: reply }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The help clerk could not answer.')
    } finally {
      sending.current = false
      setPending(false)
    }
  }

  const onAskKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(draft)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/40"
      onClick={onClose}
      onKeyDown={onKeyDown}
      data-print-hidden
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={noteId}
        className="flex h-dvh max-h-dvh w-full max-w-lg flex-col border-l border-line bg-paper outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <Kicker ok>Help</Kicker>
            <h2 id={titleId} className="mt-2 font-display text-2xl font-semibold leading-none sm:text-3xl">
              Desk clerk
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center rounded-full border border-ink/40 px-4 font-mono text-[11px] uppercase tracking-[0.12em] hover:bg-paper-2"
          >
            Close
          </button>
        </div>

        <p id={noteId} role="note" className="flag warn mx-4 mt-4 px-3 py-2.5 text-sm leading-relaxed text-ink sm:mx-5">
          {HELP_DISCLAIMER} Not insurance or legal advice.
        </p>

        <div ref={threadRef} className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:px-5" aria-live="polite">
          {turns.length === 0 && !pending && (
            <div>
              <p className="max-w-md text-sm leading-relaxed text-ink-3">
                Ask how the desk works — the room-rent trap, the score, a rejection, or what
                stays in this browser. The clerk explains the product. It does not price your claim.
              </p>
              <div className="mt-4 flex flex-col items-start gap-2">
                {HELP_STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void send(starter)}
                    className="rounded-full border border-line bg-paper-2 px-3 py-2 text-left text-sm leading-snug hover:border-ink/30"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, index) =>
            turn.role === 'user' ? (
              <p
                key={`${turn.role}-${index}`}
                className="ml-auto max-w-[85%] bg-ink px-3.5 py-2.5 text-sm leading-relaxed text-paper"
              >
                {turn.text}
              </p>
            ) : (
              <div key={`${turn.role}-${index}`} className="max-w-[92%] border border-line bg-paper-2 px-3.5 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">Desk clerk</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{turn.text}</p>
                <p className="mt-3 border-t border-line pt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                  AI response — cross-verify
                </p>
              </div>
            ),
          )}

          {pending && (
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Reading the question…</p>
          )}
          {error && (
            <p role="alert" className="flag px-3 py-2 text-sm leading-relaxed">
              {error}
            </p>
          )}
        </div>

        <form
          className="border-t border-line px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-5"
          onSubmit={(e) => {
            e.preventDefault()
            void send(draft)
          }}
        >
          {keyState === 'none' && (
            <p className="mb-3 text-xs leading-relaxed text-ink-3">
              No key is configured. Close Help, add one in Settings, and reopen. Sample cases still run without it.
            </p>
          )}
          <label htmlFor="help-question" className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
            Your question
          </label>
          <textarea
            id="help-question"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onAskKey}
            rows={3}
            maxLength={HELP_QUESTION_MAX}
            disabled={pending}
            placeholder="Ask about the desk"
            className="mt-1.5 w-full resize-none border border-line bg-paper-2 px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brick disabled:opacity-60"
          />
          <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[10px] leading-relaxed text-ink-3">
              Cleared when you close Help. Not saved.
            </p>
            <div className="flex shrink-0 gap-2">
              {turns.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setTurns([])
                    setError(null)
                  }}
                  disabled={pending}
                  className="inline-flex min-h-11 items-center rounded-full border border-ink/40 px-4 font-mono text-[11px] uppercase tracking-[0.12em] hover:bg-paper-2 disabled:opacity-50"
                >
                  Clear
                </button>
              )}
              <button
                type="submit"
                disabled={pending || !draft.trim()}
                className="inline-flex min-h-11 items-center rounded-full bg-chart px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink disabled:opacity-50"
              >
                Ask
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
