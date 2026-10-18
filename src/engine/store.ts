/** Server persistence is off until the user opts in. The session id is created
 * only after consent, so an opted-out user never contacts the backend. */

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

  // Turning consent off also wipes the server-side session: purge first
  // (best-effort — local state is cleared regardless), then forget the id.
  async function optOut(): Promise<void> {
    if (loadConsent()) {
      try {
        await call('/api/cases', { method: 'DELETE' })
      } catch {
        /* offline or server down — local opt-out still happens */
      }
    }
    setConsent(false)
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
    if (!sid) throw new Error('Consent is off. Turn on server save in Settings first.')
    const res = await fetchImpl(url, {
      ...init,
      headers: { ...(init.body && !(init.headers as Record<string, string>)?.['Content-Type'] ? { 'Content-Type': 'application/json' } : {}), ...init.headers, 'X-Session-Id': sid },
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
      throw new Error(data.message ?? data.error ?? `Request failed (HTTP ${res.status})`)
    }
    // The dev SPA fallback answers unknown /api/* GETs with index.html and a
    // 200; a non-JSON reply means the store is down, not that the list is data.
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
      throw new Error('The case store is unavailable right now.')
    }
    return res
  }

  return {
    loadConsent,
    setConsent,
    optOut,
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
