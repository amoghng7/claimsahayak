import { useCallback, useEffect, useState } from 'react'
import type { CaseFile } from '../engine/types'
import { caseStore, type StoredCaseMeta } from '../engine/store'
import { formatDate } from '../engine/format'
import { deskPanel } from './deskNav'

function newestFirst(list: StoredCaseMeta[]): StoredCaseMeta[] {
  return [...list].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
}

/** Consent-gated history. Opening a scan recomputes the score.
 * Saved documents expire after 30 days. */
export function PreviousScans({ onOpen }: { onOpen: (c: CaseFile) => void }) {
  const consent = caseStore.loadConsent()
  const [cases, setCases] = useState<StoredCaseMeta[] | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const refresh = useCallback((isCurrent: () => boolean = () => true) => {
    caseStore.listCases().then(
      (list) => {
        if (isCurrent()) setCases(newestFirst(list))
      },
      (e: Error) => {
        if (isCurrent()) setNote(e.message)
      },
    )
  }, [])

  useEffect(() => {
    if (!consent) return
    let cancelled = false
    refresh(() => !cancelled)
    return () => {
      cancelled = true
    }
  }, [consent, refresh])

  const open = async (id: string) => {
    setNote(null)
    try {
      const stored = await caseStore.loadCase(id)
      onOpen(JSON.parse(stored.payload) as CaseFile)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not open that scan.')
    }
  }

  const remove = async (id: string) => {
    setNote(null)
    try {
      await caseStore.deleteCase(id)
      refresh()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not delete that scan.')
    }
  }

  return (
    <section id={deskPanel('previous')} aria-label="Previous scans" data-print-hidden className="border border-line">
      <div className="bg-paper-2 px-4 py-5 sm:px-5 md:px-7">
        <h2 className="font-display text-2xl font-semibold leading-tight md:text-3xl">Previous scans</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-3">
          Kept for 30 days, and only if server save is on in Settings.
        </p>
      </div>
      <div className="px-4 py-6 sm:px-5 md:px-7">
        {!consent && (
          <p className="max-w-xl text-sm leading-relaxed text-ink-3">
            Server save is off. Turn it on in Settings and the next scan will show up here.
          </p>
        )}
        {consent && cases === null && !note && <p className="text-sm text-ink-3">Reading your scans…</p>}
        {consent && cases && cases.length === 0 && (
          <p className="max-w-xl text-sm leading-relaxed text-ink-3">No scans yet. Finish one on Your claim.</p>
        )}
        {cases && cases.length > 0 && (
          <ul className="max-w-xl space-y-1">
            {cases.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 border border-line px-3">
                <button type="button" onClick={() => open(c.id)} className="min-h-11 min-w-0 flex-1 py-2.5 text-left">
                  <span className="block truncate text-sm font-medium">{c.name || 'Untitled scan'}</span>
                  <span className="block font-mono text-[10px] text-ink-3">{c.savedAt ? formatDate(c.savedAt) : ''}</span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  aria-label={`Delete saved scan ${c.name || c.id}`}
                  className="flex min-h-11 min-w-11 items-center justify-center font-mono text-[11px] text-crimson-deep hover:bg-paper-2"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {note && <p className="mt-3 text-sm leading-relaxed text-ink-3">{note}</p>}
      </div>
    </section>
  )
}
