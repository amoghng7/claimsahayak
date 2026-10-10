import { useEffect, useState } from 'react'
import { Landing } from './sections/Landing'
import { Workbench } from './sections/Workbench'
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
  const removeKey = () => {
    saveGeminiKey('')
    onSaved()
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={onClose}>
      <div className="panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-2xl font-semibold">Settings</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-3">
          The desk uses a secure managed backend key to extract data from your uploaded PDFs.
          If you prefer to use your own key (or if the backend is rate-limited), you can
          override it here. The key never leaves your browser.
        </p>
        <label className="mt-4 block font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          Gemini API key
        </label>
        <input
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [keyState, refreshKeyState] = useKeyState()
  const keyLabel =
    keyState === 'personal' ? 'Your key' : keyState === 'managed' ? 'Managed key' : 'No key'

  const openDesk = (caseId?: string) => {
    setInitialCase(caseId)
    setView('desk')
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-shell items-center justify-between px-6 py-3.5">
          <button onClick={() => setView('landing')} className="flex items-baseline gap-2.5">
            <span className="font-display text-[22px] font-semibold leading-none">ClaimSahayak</span>
            <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3 sm:inline">
              / claim readiness desk
            </span>
          </button>
          <nav className="flex items-center gap-2.5">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 rounded-full border border-ink/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 hover:bg-paper-2"
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
                className="rounded-full bg-chart px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink transition-transform duration-150 hover:-translate-y-0.5"
              >
                Open the desk →
              </button>
            ) : (
              <button
                onClick={() => setView('landing')}
                className="rounded-full border border-ink/40 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 hover:bg-paper-2"
              >
                ← Overview
              </button>
            )}
          </nav>
        </div>
      </header>

      {view === 'landing' ? (
        <Landing onOpen={() => openDesk()} onSample={(id) => openDesk(id)} />
      ) : (
        <Workbench key={initialCase ?? 'default'} initialCaseId={initialCase} />
      )}

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-shell flex-col gap-2 px-6 py-6 font-mono text-[10.5px] leading-relaxed text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <span>CLAIMSAHAYAK · GOOGLE CLOUD AI BUILDER CUP 2026 · JAPAC</span>
          <span>Sample cases are fictional. Assistive analysis — not insurance or legal advice.</span>
        </div>
      </footer>

      {settingsOpen && (
        <SettingsSheet onClose={() => setSettingsOpen(false)} onSaved={refreshKeyState} />
      )}
    </div>
  )
}
