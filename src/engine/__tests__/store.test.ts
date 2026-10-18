import { describe, expect, it } from 'vitest'
import { createCaseStore, type KVStorage } from '../store'

function fakeStorage(): KVStorage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

let uuidCounter = 0
const fakeUuid = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeStore(fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = []
  const store = createCaseStore({
    storage: fakeStorage(),
    uuid: fakeUuid,
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return fetchImpl ? fetchImpl(String(url), init) : okJson({})
    }) as typeof fetch,
  })
  return { store, calls }
}

describe('consent + session', () => {
  it('consent defaults to off and no session id exists', () => {
    const { store } = makeStore()
    expect(store.loadConsent()).toBe(false)
    expect(store.sessionId()).toBeNull()
  })

  it('enabling consent creates a stable session id; disabling removes it', () => {
    const { store } = makeStore()
    store.setConsent(true)
    const sid = store.sessionId()
    expect(sid).toMatch(/^[0-9a-f-]{36}$/)
    expect(store.sessionId()).toBe(sid)
    store.setConsent(false)
    expect(store.sessionId()).toBeNull()
    store.setConsent(true)
    expect(store.sessionId()).not.toBe(sid)
  })

  it('API calls without consent throw instead of sending data', async () => {
    const { store, calls } = makeStore()
    await expect(store.listCases()).rejects.toThrow(/consent/i)
    expect(calls).toHaveLength(0)
  })
})

describe('cases API', () => {
  it('saveCase PUTs the payload under the session header', async () => {
    const { store, calls } = makeStore()
    store.setConsent(true)
    await store.saveCase('case-1', 'Ramesh Iyer', '{"a":1}')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/cases/case-1')
    expect(calls[0].init?.method).toBe('PUT')
    expect((calls[0].init?.headers as Record<string, string>)['X-Session-Id']).toBe(store.sessionId())
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ name: 'Ramesh Iyer', payload: '{"a":1}' })
  })

  it('listCases returns the parsed list', async () => {
    const { store } = makeStore(async () => okJson({ cases: [{ id: 'c1', name: 'R', savedAt: 't' }] }))
    store.setConsent(true)
    expect(await store.listCases()).toEqual([{ id: 'c1', name: 'R', savedAt: 't' }])
  })

  it('loadCase returns name + payload', async () => {
    const { store } = makeStore(async () => okJson({ name: 'R', savedAt: 't', payload: '{"a":1}' }))
    store.setConsent(true)
    const c = await store.loadCase('c1')
    expect(c).toEqual({ name: 'R', savedAt: 't', payload: '{"a":1}' })
  })

  it('deleteCase issues DELETE', async () => {
    const { store, calls } = makeStore()
    store.setConsent(true)
    await store.deleteCase('c1')
    expect(calls[0].init?.method).toBe('DELETE')
    expect(calls[0].url).toBe('/api/cases/c1')
  })

  it('uploadDocument streams raw bytes with the file name', async () => {
    const { store, calls } = makeStore()
    store.setConsent(true)
    await store.uploadDocument(new File(['pdf-bytes'], 'final bill.pdf', { type: 'application/pdf' }))
    expect(calls[0].url).toBe('/api/uploads?name=final%20bill.pdf')
    expect(calls[0].init?.method).toBe('POST')
    expect((calls[0].init?.headers as Record<string, string>)['Content-Type']).toBe('application/octet-stream')
  })

  it('surfaces server errors as readable messages', async () => {
    const { store } = makeStore(async () => ({ ok: false, status: 503, json: async () => ({ message: 'FIRESTORE_PROJECT is not set' }) }) as Response)
    store.setConsent(true)
    await expect(store.listCases()).rejects.toThrow(/FIRESTORE_PROJECT/)
  })

  it('a non-JSON 200 (the dev SPA fallback answering /api/*) is not shown as a raw parse error', async () => {
    const { store } = makeStore(
      async () =>
        new Response('<!doctype html><title>ClaimSahayak</title>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    )
    store.setConsent(true)
    await expect(store.listCases()).rejects.toThrow(/unavailable/i)
    await expect(store.listCases()).rejects.not.toThrow(/Unexpected token/)
  })
})

describe('optOut', () => {
  it('purges server-side cases with the session, then clears local consent + session', async () => {
    const { store, calls } = makeStore()
    store.setConsent(true)
    const sid = store.sessionId()
    await store.optOut()
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/cases')
    expect(calls[0].init?.method).toBe('DELETE')
    expect((calls[0].init?.headers as Record<string, string>)['X-Session-Id']).toBe(sid)
    expect(store.loadConsent()).toBe(false)
    expect(store.sessionId()).toBeNull()
  })

  it('clears local state even when the purge request fails', async () => {
    const { store } = makeStore(async () => { throw new Error('offline') })
    store.setConsent(true)
    await store.optOut()
    expect(store.loadConsent()).toBe(false)
    expect(store.sessionId()).toBeNull()
  })

  it('is a local-only no-op when consent was never on', async () => {
    const { store, calls } = makeStore()
    await store.optOut()
    expect(calls).toHaveLength(0)
  })
})
