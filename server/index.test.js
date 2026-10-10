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
