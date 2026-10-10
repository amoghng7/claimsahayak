import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHandler, docaiUrl, vertexUrl } from './index.js'

const FAKE_BODY = JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    end(b) { this.body = b ?? '' },
  }
}

function req(method, url, body = '') {
  const listeners = {}
  return {
    method,
    url,
    headers: {},
    on(ev, cb) {
      listeners[ev] = cb
      if (ev === 'data' && body) cb(Buffer.from(body))
      if (ev === 'end') cb()
    },
  }
}

describe('vertexUrl', () => {
  it('builds the publisher generateContent URL from env config', () => {
    const url = vertexUrl({ project: 'p', location: 'asia-south1', model: 'gemini-2.5-flash' })
    assert.equal(
      url,
      'https://asia-south1-aiplatform.googleapis.com/v1/projects/p/locations/asia-south1/publishers/google/models/gemini-2.5-flash:generateContent',
    )
  })
})

describe('POST /generate', () => {
  const config = { project: 'p', location: 'asia-south1', model: 'gemini-2.5-flash' }

  it('forwards the body to Vertex with a bearer token and passes status+body back', async () => {
    const calls = []
    const handler = createHandler({
      config,
      getToken: async () => 'token-123',
      fetchImpl: async (url, opts) => {
        calls.push({ url, opts })
        return { status: 200, text: async () => '{"candidates":[]}' }
      },
    })
    const res = mockRes()
    await handler(req('POST', '/generate', FAKE_BODY), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body, '{"candidates":[]}')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, vertexUrl(config))
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer token-123')
    assert.equal(calls[0].opts.body, FAKE_BODY)
  })

  it('passes through an upstream error status and body unchanged', async () => {
    const handler = createHandler({
      config,
      getToken: async () => 'token-123',
      fetchImpl: async () => ({ status: 429, text: async () => '{"error":"quota"}' }),
    })
    const res = mockRes()
    await handler(req('POST', '/generate', FAKE_BODY), res)
    assert.equal(res.statusCode, 429)
    assert.equal(res.body, '{"error":"quota"}')
  })

  it('answers 502 JSON when the upstream call throws', async () => {
    const handler = createHandler({
      config,
      getToken: async () => 'token-123',
      fetchImpl: async () => { throw new Error('network down') },
    })
    const res = mockRes()
    await handler(req('POST', '/generate', FAKE_BODY), res)
    assert.equal(res.statusCode, 502)
    assert.match(res.body, /upstream_unavailable/)
  })

  it('answers 503 JSON when no project is configured', async () => {
    const handler = createHandler({
      config: { project: '', location: 'asia-south1', model: 'm' },
      getToken: async () => 't',
      fetchImpl: async () => ({ status: 200, text: async () => '{}' }),
    })
    const res = mockRes()
    await handler(req('POST', '/generate', FAKE_BODY), res)
    assert.equal(res.statusCode, 503)
    assert.match(res.body, /not_configured/)
  })
})

describe('routing', () => {
  const handler = createHandler({
    config: { project: 'p', location: 'l', model: 'm' },
    getToken: async () => 't',
    fetchImpl: async () => ({ status: 200, text: async () => '{}' }),
  })

  it('GET /generate is 405 JSON', async () => {
    const res = mockRes()
    await handler(req('GET', '/generate'), res)
    assert.equal(res.statusCode, 405)
  })

  it('GET /healthz is 200', async () => {
    const res = mockRes()
    await handler(req('GET', '/healthz'), res)
    assert.equal(res.statusCode, 200)
  })

  it('unknown path is 404 JSON', async () => {
    const res = mockRes()
    await handler(req('POST', '/nope'), res)
    assert.equal(res.statusCode, 404)
  })
})

/* ---------- POST /ocr (Phase 06 step 6.2 — Document AI) ---------- */

describe('docaiUrl', () => {
  it('builds the processor :process URL from config', () => {
    const url = docaiUrl({ project: 'p', location: 'us', processor: 'abc123' })
    assert.equal(url, 'https://us-documentai.googleapis.com/v1/projects/p/locations/us/processors/abc123:process')
  })
})

describe('POST /ocr', () => {
  const docai = { project: 'p', location: 'us', processor: 'abc123' }
  const genConfig = { project: 'p', location: 'global', model: 'm' }

  it('sends the raw document to Document AI and returns the extracted text', async () => {
    const calls = []
    const handler = createHandler({
      config: { ...genConfig, docai },
      getToken: async () => 'token-ocr',
      fetchImpl: async (url, opts) => {
        calls.push({ url, opts })
        return { status: 200, text: async () => JSON.stringify({ document: { text: 'HOSPITAL BILL\nTotal 435000' } }) }
      },
    })
    const res = mockRes()
    await handler(req('POST', '/ocr', JSON.stringify({ content: 'YmFzZTY0', mimeType: 'application/pdf' })), res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(JSON.parse(res.body), { text: 'HOSPITAL BILL\nTotal 435000' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, docaiUrl(docai))
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer token-ocr')
    const sent = JSON.parse(calls[0].opts.body)
    assert.deepEqual(sent, { rawDocument: { content: 'YmFzZTY0', mimeType: 'application/pdf' } })
  })

  it('answers 400 JSON when content is missing', async () => {
    const handler = createHandler({
      config: { ...genConfig, docai },
      getToken: async () => 't',
      fetchImpl: async () => ({ status: 200, text: async () => '{}' }),
    })
    const res = mockRes()
    await handler(req('POST', '/ocr', JSON.stringify({ mimeType: 'application/pdf' })), res)
    assert.equal(res.statusCode, 400)
    assert.match(res.body, /bad_request/)
  })

  it('answers 503 JSON when the processor is not configured', async () => {
    const handler = createHandler({
      config: genConfig,
      getToken: async () => 't',
      fetchImpl: async () => ({ status: 200, text: async () => '{}' }),
    })
    const res = mockRes()
    await handler(req('POST', '/ocr', JSON.stringify({ content: 'eA==', mimeType: 'application/pdf' })), res)
    assert.equal(res.statusCode, 503)
    assert.match(res.body, /not_configured/)
  })

  it('passes through an upstream error status and body', async () => {
    const handler = createHandler({
      config: { ...genConfig, docai },
      getToken: async () => 't',
      fetchImpl: async () => ({ status: 400, text: async () => '{"error":{"message":"bad document"}}' }),
    })
    const res = mockRes()
    await handler(req('POST', '/ocr', JSON.stringify({ content: 'eA==', mimeType: 'application/pdf' })), res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.body, '{"error":{"message":"bad document"}}')
  })

  it('answers 502 JSON when the upstream call throws', async () => {
    const handler = createHandler({
      config: { ...genConfig, docai },
      getToken: async () => 't',
      fetchImpl: async () => { throw new Error('down') },
    })
    const res = mockRes()
    await handler(req('POST', '/ocr', JSON.stringify({ content: 'eA==', mimeType: 'application/pdf' })), res)
    assert.equal(res.statusCode, 502)
    assert.match(res.body, /upstream_unavailable/)
  })

  it('GET /ocr is 405 JSON', async () => {
    const handler = createHandler({
      config: { ...genConfig, docai },
      getToken: async () => 't',
      fetchImpl: async () => ({ status: 200, text: async () => '{}' }),
    })
    const res = mockRes()
    await handler(req('GET', '/ocr'), res)
    assert.equal(res.statusCode, 405)
  })
})

/* ---------- /api/cases + /api/uploads (Phase 06 step 6.4 — consent-gated persistence) ---------- */

describe('POST /api/cases/:caseId', () => {
  const store = { project: 'p' }
  const genConfig = { project: 'p', location: 'global', model: 'm' }
  const SID = '11111111-2222-4333-8444-555555555555'

  function storeReq(method, url, body, sessionId = SID) {
    const r = req(method, url, body)
    r.headers['x-session-id'] = sessionId
    return r
  }

  it('writes the case document to Firestore under the session', async () => {
    const calls = []
    const handler = createHandler({
      config: { ...genConfig, store, bucket: 'b' },
      getToken: async () => 'tok',
      fetchImpl: async (url, opts) => {
        calls.push({ url, opts })
        return { status: 200, text: async () => '{"name":"doc"}' }
      },
    })
    const res = mockRes()
    await handler(storeReq('PUT', '/api/cases/case-1', JSON.stringify({ name: 'Ramesh', payload: '{"a":1}' })), res)
    assert.equal(res.statusCode, 200)
    assert.equal(calls.length, 1)
    assert.match(calls[0].url, /firestore\.googleapis\.com\/v1\/projects\/p\/databases\/\(default\)\/documents\/sessions\/11111111-2222-4333-8444-555555555555\/cases\/case-1/)
    assert.equal(calls[0].opts.method, 'PATCH')
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok')
    const sent = JSON.parse(calls[0].opts.body)
    assert.equal(sent.fields.name.stringValue, 'Ramesh')
    assert.equal(sent.fields.payload.stringValue, '{"a":1}')
    assert.ok(sent.fields.savedAt.timestampValue)
  })

  it('answers 401 when the session id is missing or malformed', async () => {
    const handler = createHandler({
      config: { ...genConfig, store, bucket: 'b' },
      getToken: async () => 'tok',
      fetchImpl: async () => ({ status: 200, text: async () => '{}' }),
    })
    const res = mockRes()
    await handler(storeReq('PUT', '/api/cases/case-1', '{}', 'not-a-uuid'), res)
    assert.equal(res.statusCode, 401)
    const res2 = mockRes()
    await handler(req('PUT', '/api/cases/case-1', '{}'), res2)
    assert.equal(res2.statusCode, 401)
  })

  it('answers 503 when Firestore is not configured', async () => {
    const handler = createHandler({
      config: genConfig,
      getToken: async () => 'tok',
      fetchImpl: async () => ({ status: 200, text: async () => '{}' }),
    })
    const res = mockRes()
    await handler(storeReq('PUT', '/api/cases/case-1', '{}'), res)
    assert.equal(res.statusCode, 503)
  })

  it('GET /api/cases lists the session cases (id, name, savedAt)', async () => {
    const handler = createHandler({
      config: { ...genConfig, store, bucket: 'b' },
      getToken: async () => 'tok',
      fetchImpl: async () => ({
        status: 200,
        text: async () => JSON.stringify({
          documents: [{
            name: 'projects/p/databases/(default)/documents/sessions/' + SID + '/cases/case-1',
            fields: {
              name: { stringValue: 'Ramesh' },
              savedAt: { timestampValue: '2026-10-11T00:00:00Z' },
              payload: { stringValue: '{"a":1}' },
            },
          }],
        }),
      }),
    })
    const res = mockRes()
    await handler(storeReq('GET', '/api/cases'), res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(JSON.parse(res.body), {
      cases: [{ id: 'case-1', name: 'Ramesh', savedAt: '2026-10-11T00:00:00Z' }],
    })
  })

  it('GET /api/cases/:id returns the stored payload', async () => {
    const handler = createHandler({
      config: { ...genConfig, store, bucket: 'b' },
      getToken: async () => 'tok',
      fetchImpl: async () => ({
        status: 200,
        text: async () => JSON.stringify({
          fields: { name: { stringValue: 'R' }, savedAt: { timestampValue: 't' }, payload: { stringValue: '{"a":1}' } },
        }),
      }),
    })
    const res = mockRes()
    await handler(storeReq('GET', '/api/cases/case-1'), res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(JSON.parse(res.body), { name: 'R', savedAt: 't', payload: '{"a":1}' })
  })

  it('DELETE /api/cases/:id deletes the document', async () => {
    const calls = []
    const handler = createHandler({
      config: { ...genConfig, store, bucket: 'b' },
      getToken: async () => 'tok',
      fetchImpl: async (url, opts) => {
        calls.push({ url, opts })
        return { status: 200, text: async () => '{}' }
      },
    })
    const res = mockRes()
    await handler(storeReq('DELETE', '/api/cases/case-1'), res)
    assert.equal(res.statusCode, 200)
    assert.equal(calls[0].opts.method, 'DELETE')
    assert.match(calls[0].url, /\/cases\/case-1$/)
  })

  it('POST /api/uploads streams the body to GCS under the session prefix', async () => {
    const calls = []
    const handler = createHandler({
      config: { ...genConfig, store, bucket: 'claimsahayak-docs' },
      getToken: async () => 'tok',
      fetchImpl: async (url, opts) => {
        calls.push({ url, opts })
        return { status: 200, text: async () => '{"name":"obj"}' }
      },
    })
    const res = mockRes()
    await handler(storeReq('POST', '/api/uploads?name=bill.pdf', 'PDFBYTES'), res)
    assert.equal(res.statusCode, 200)
    assert.match(calls[0].url, /upload\/storage\/v1\/b\/claimsahayak-docs\/o\?uploadType=media&name=/)
    assert.match(calls[0].url, /uploads%2F11111111-2222-4333-8444-555555555555%2F/)
    assert.equal(calls[0].opts.body, 'PDFBYTES')
  })

  it('POST /api/uploads is 503 when no bucket is configured', async () => {
    const handler = createHandler({
      config: { ...genConfig, store },
      getToken: async () => 'tok',
      fetchImpl: async () => ({ status: 200, text: async () => '{}' }),
    })
    const res = mockRes()
    await handler(storeReq('POST', '/api/uploads?name=bill.pdf', 'x'), res)
    assert.equal(res.statusCode, 503)
  })
})
