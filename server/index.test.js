import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHandler, vertexUrl } from './index.js'

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
