import { useState } from 'react'
import { Landing } from './sections/Landing'
import { Workbench } from './sections/Workbench'
import { loadGeminiKey, saveGeminiKey } from './engine/gemini'

function SettingsSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState(loadGeminiKey())
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={onClose}>
      <div className="panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-2xl font-semibold">Settings</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-3">
          To read your own policy and hospital PDFs, the desk calls Gemini directly from your
          browser with a key you provide (Google AI Studio → “Get API key”). The key never
          leaves this browser. Without it, the desk runs fully on the bundled sample cases.
        </p>
        <label className="mt-4 block font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          Gemini API key
        </label>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          type="password"
          placeholder="AIza…"
          className="mt-1.5 w-full border border-line bg-paper-2 px-3 py-2.5 font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-brick"
        />
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
          <button
            onClick={() => {
              setDraft('')
              saveGeminiKey('')
              onSaved()
              onClose()
            }}
            className="rounded-full border border-ink/40 px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em]"
          >
            Clear
          </button>
        </div>
        <p className="mt-4 font-mono text-[10px] leading-relaxed text-ink-3">
          Production path: this call moves server-side to Vertex AI on Google Cloud, with the
          key held in Secret Manager — see README.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<'landing' | 'desk'>('landing')
  const [initialCase, setInitialCase] = useState<string | undefined>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hasKey, setHasKey] = useState(!!loadGeminiKey())

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
                style={{ background: hasKey ? 'color-mix(in srgb, var(--mint) 70%, var(--ink))' : 'var(--crimson)' }}
              />
              {hasKey ? 'Key set' : 'API key'}
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

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => setHasKey(!!loadGeminiKey())} />
    </div>
  )
}
