import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { DESK_PANES, type DeskPane } from './components/deskNav'
import { HelpSheet } from './components/HelpSheet'
import { Landing } from './sections/Landing'
import { Workbench } from './sections/Workbench'
import { caseStore } from './engine/store'
import {
  isDevKeyMissing,
  maskKey,
  onKeyStateChange,
  resolveKeyState,
  saveGeminiKey,
  storedPersonalKey,
} from './engine/gemini'

function useKeyState() {
  const [state, setState] = useState(() => resolveKeyState(storedPersonalKey(), isDevKeyMissing()))
  useEffect(
    () => onKeyStateChange(() => setState(resolveKeyState(storedPersonalKey(), isDevKeyMissing()))),
    [],
  )
  return [state, () => setState(resolveKeyState(storedPersonalKey(), isDevKeyMissing()))] as const
}

function SettingsSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  // Mounted only while open — initial state is always the current stored key.
  const [stored] = useState<string | null>(() => storedPersonalKey())
  const [draft, setDraft] = useState('')
  const [serverSave, setServerSave] = useState(() => caseStore.loadConsent())
  const panelRef = useRef<HTMLDivElement>(null)

  // Modal focus management: focus the field on open, restore focus to the
  // opener (header key button) on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.querySelector<HTMLElement>('input')?.focus()
    return () => opener?.focus()
  }, [])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    )
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

  const removeKey = () => {
    saveGeminiKey('')
    onSaved()
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={onClose} onKeyDown={onKeyDown} data-print-hidden>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Settings" className="panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-2xl font-semibold">Settings</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-3">
          The desk uses a secure managed backend key to extract data from your uploaded PDFs.
          If you prefer to use your own key (or if the backend is rate-limited), you can
          override it here. The key never leaves your browser.
        </p>
        <label htmlFor="gemini-key" className="mt-4 block font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          Gemini API key
        </label>
        <input
          id="gemini-key"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          type="password"
          placeholder="Leave blank to use the managed key"
          className="mt-1.5 w-full border border-line bg-paper-2 px-3 py-2.5 font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-brick"
        />
        {stored && (
          <p className="mt-2 font-mono text-[11px] text-ink-3">
            Your key is in use: {maskKey(stored)}
          </p>
        )}
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => {
              saveGeminiKey(draft.trim())
              onSaved()
              onClose()
            }}
            className="rounded-full bg-ink px-6 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-paper"
          >
            Save key
          </button>
          {stored && (
            <button
              onClick={removeKey}
              className="rounded-full border border-ink/40 px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              Remove my key
            </button>
          )}
        </div>
        <div className="mt-6 border-t border-line pt-5">
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={serverSave}
              onChange={(e) => {
                if (e.target.checked) {
                  caseStore.setConsent(true)
                  setServerSave(true)
                } else {
                  // purge server-side session, then clear locally
                  void caseStore.optOut().finally(() => setServerSave(false))
                }
              }}
              className="mt-1 h-4 w-4 accent-[var(--chart)]"
            />
            <span>
              <span className="text-sm font-medium">Save my cases on the server</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-3">
                Off by default — documents and analysis stay in this browser. Turn on to
                keep a case history under an anonymous session id (no account). Cases and
                uploaded documents are deleted automatically after 30 days; turning this
                off deletes your saved cases immediately.
              </span>
            </span>
          </label>
        </div>
        <p className="mt-4 font-mono text-[10px] leading-relaxed text-ink-3">
          With your own key, requests go straight from your browser to Google.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<'landing' | 'desk'>('landing')
  const [initialCase, setInitialCase] = useState<string | undefined>()
  const [deskPane, setDeskPane] = useState<DeskPane>('claim')
  const deskPaneActionsRef = useRef<(next: DeskPane) => void>(() => {})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [keyState, refreshKeyState] = useKeyState()
  const keyLabel =
    keyState === 'personal' ? 'Your key' : keyState === 'managed' ? 'Managed key' : 'No key'

  const openDesk = (caseId?: string) => {
    setInitialCase(caseId)
    setDeskPane(caseId ? 'sample' : 'claim')
    setView('desk')
    window.scrollTo({ top: 0 })
  }

  const onDeskKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = Math.max(0, DESK_PANES.findIndex((pane) => pane.id === deskPane))
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (i + 1) % DESK_PANES.length
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (i + DESK_PANES.length - 1) % DESK_PANES.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? DESK_PANES.length - 1
              : -1
    if (next < 0) return
    e.preventDefault()
    const id = DESK_PANES[next].id
    deskPaneActionsRef.current(id)
    document.getElementById(`desk-pane-${id}`)?.focus()
  }

  return (
    <div className="min-h-screen">
      {/* inert while a dialog is open — background is unreachable
          to pointer, keyboard and screen-reader browse, not just aria-modal */}
      <div inert={settingsOpen || helpOpen}>
        <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-sm" data-print-hidden>
          <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3.5">
            <button onClick={() => setView('landing')} className="flex items-baseline gap-2.5">
              <span className="font-display text-[22px] font-semibold leading-none">ClaimSahayak</span>
              <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3 sm:inline">
                / claim readiness desk
              </span>
            </button>
            <nav aria-label="Primary" className="flex items-center gap-2.5">
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex min-h-11 items-center gap-2 rounded-full border border-ink/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 hover:bg-paper-2"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: keyState === 'none' ? 'var(--crimson)' : 'color-mix(in srgb, var(--mint) 70%, var(--ink))' }}
                />
                {keyLabel}
              </button>
              {view === 'landing' ? (
                <button
                  onClick={() => openDesk()}
                  className="inline-flex min-h-11 items-center rounded-full bg-chart px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink transition-transform duration-150 hover:-translate-y-0.5"
                >
                  Open the desk →
                </button>
              ) : (
                <button
                  onClick={() => setView('landing')}
                  className="inline-flex min-h-11 items-center rounded-full border border-ink/40 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 hover:bg-paper-2"
                >
                  ← Overview
                </button>
              )}
            </nav>
          </div>
          {view === 'desk' && (
            <div className="border-t border-line">
              <div role="tablist" aria-label="Desk" className="mx-auto flex max-w-shell overflow-x-auto px-6" onKeyDown={onDeskKey}>
                {DESK_PANES.map((pane) => {
                  const selected = deskPane === pane.id
                  return (
                    <button
                      key={pane.id}
                      id={`desk-pane-${pane.id}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={pane.panel}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => deskPaneActionsRef.current(pane.id)}
                      className={`relative min-h-11 shrink-0 whitespace-nowrap px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        selected ? 'text-ink' : 'text-ink-3 hover:text-ink'
                      }`}
                    >
                      {pane.label}
                      <span
                        className={`absolute inset-x-4 bottom-0 h-0.5 origin-left bg-chart transition-transform duration-200 motion-reduce:transition-none ${
                          selected ? 'scale-x-100' : 'scale-x-0'
                        }`}
                        aria-hidden
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </header>

        {view === 'landing' ? (
          <Landing onOpen={() => openDesk()} onSample={(id) => openDesk(id)} />
        ) : (
          <Workbench
            key={initialCase ?? 'default'}
            initialCaseId={initialCase}
            pane={deskPane}
            onPane={setDeskPane}
            paneActionsRef={deskPaneActionsRef}
          />
        )}

        <footer className="border-t border-line pb-20" data-print-hidden>
          <div className="mx-auto flex max-w-shell flex-col gap-2 px-6 py-6 font-mono text-[10.5px] leading-relaxed text-ink-3 sm:flex-row sm:items-center sm:justify-between">
            <span>CLAIMSAHAYAK · GOOGLE CLOUD AI BUILDER CUP 2026 · JAPAC</span>
            <span>Sample cases are fictional. Assistive analysis — not insurance or legal advice.</span>
          </div>
        </footer>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={helpOpen}
          data-print-hidden
          className="fixed bottom-5 right-5 z-40 inline-flex min-h-11 items-center rounded-full bg-chart px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink shadow-[0_1px_0_var(--ink)] transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transition-none"
        >
          Help
        </button>
      </div>

      {helpOpen && <HelpSheet keyState={keyState} onClose={() => setHelpOpen(false)} />}
      {settingsOpen && (
        <SettingsSheet onClose={() => setSettingsOpen(false)} onSaved={refreshKeyState} />
      )}
    </div>
  )
}
