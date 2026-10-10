/**
 * Consent-gated server persistence (Phase 06 step 6.4). Default is OFF and
 * nothing leaves the browser — the session id itself is only created after
 * the user opts in, so an opted-out user is invisible to the backend.
 * Session is an anonymous UUID in localStorage; no accounts, no sign-in.
 */

export interface KVStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const CONSENT_KEY = 'claimsahayak.serverSave'
const SESSION_KEY = 'claimsahayak.sessionId'

export interface StoredCaseMeta {
  id: string
  name: string
  savedAt: string
}

export interface StoredCase extends Omit<StoredCaseMeta, 'id'> {
  payload: string
}

export interface CaseStoreDeps {
  storage: KVStorage
  fetchImpl: typeof fetch
  uuid: () => string
}

export function createCaseStore({ storage, fetchImpl, uuid }: CaseStoreDeps) {
  function loadConsent(): boolean {
    return storage.getItem(CONSENT_KEY) === '1'
  }

  function setConsent(on: boolean): void {
    if (on) {
      storage.setItem(CONSENT_KEY, '1')
    } else {
      storage.removeItem(CONSENT_KEY)
      storage.removeItem(SESSION_KEY)
    }
  }

  function sessionId(): string | null {
    if (!loadConsent()) return null
    let sid = storage.getItem(SESSION_KEY)
    if (!sid) {
      sid = uuid()
      storage.setItem(SESSION_KEY, sid)
    }
    return sid
  }

  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const sid = sessionId()
    if (!sid) throw new Error('Consent is off — enable server save in Settings first.')
    const res = await fetchImpl(url, {
      ...init,
      headers: { ...(init.body && !(init.headers as Record<string, string>)?.['Content-Type'] ? { 'Content-Type': 'application/json' } : {}), ...init.headers, 'X-Session-Id': sid },
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
      throw new Error(data.message ?? data.error ?? `Request failed (HTTP ${res.status})`)
    }
    return res
  }

  return {
    loadConsent,
    setConsent,
    sessionId,

    async saveCase(id: string, name: string, payload: string): Promise<void> {
      await call(`/api/cases/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ name, payload }) })
    },

    async listCases(): Promise<StoredCaseMeta[]> {
      const res = await call('/api/cases')
      const data = (await res.json()) as { cases?: StoredCaseMeta[] }
      return data.cases ?? []
    },

    async loadCase(id: string): Promise<StoredCase> {
      const res = await call(`/api/cases/${encodeURIComponent(id)}`)
      return (await res.json()) as StoredCase
    },

    async deleteCase(id: string): Promise<void> {
      await call(`/api/cases/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async uploadDocument(file: File): Promise<void> {
      await call(`/api/uploads?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: await file.arrayBuffer(),
      })
    },
  }
}

function browserStorage(): KVStorage {
  // In non-browser contexts (tests, SSR) fall back to a private in-memory map.
  if (typeof localStorage !== 'undefined') return localStorage
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

export const caseStore = createCaseStore({
  storage: browserStorage(),
  fetchImpl: fetch,
  uuid: () => crypto.randomUUID(),
})
