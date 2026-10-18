import http from 'node:http'
import { GoogleAuth } from 'google-auth-library'

// Same-origin sidecar. /generate calls Vertex AI with ADC — no API key.
// The body is allow-listed text: tools, safety overrides, and huge completions are dropped.

export function vertexUrl({ project, location, model }) {
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`
  return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`
}

export function docaiUrl({ project, location, processor }) {
  return `https://${location}-documentai.googleapis.com/v1/projects/${project}/locations/${location}/processors/${processor}:process`
}

// Consent-gated cases under sessions/{id}/cases. X-Session-Id is a v4 UUID
// created only after opt-in; documents go to a GCS bucket with a 30-day lifecycle.
const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// Sample ids are slugs (`ramesh-iyer`); live ids are `live-<epoch>`. Dots and
// slashes are rejected so a case id cannot be a Firestore path segment.
const CASE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/

const MAX_PROMPT_CHARS = 400_000
const MAX_OUTPUT_TOKENS = 8192
const MAX_SCHEMA_CHARS = 100_000
const MAX_OCR_CHARS = 14_000_000
const MAX_CASE_PAYLOAD = 400_000
const MAX_CASE_NAME = 200
const OCR_TEXT_CAP = 30_000
// Keep in sync with DOC_TEXT_CAP + its marker in src/engine/ocr.ts: while both
// caps stay 30,000 the client slice strips this marker whole and appends its
// own, so the model sees exactly one truncation note.
export const OCR_TRUNCATION_NOTE =
  '\n\n[NOTE: document truncated at 30,000 characters — the remaining text was not analysed.]'
// Firestore deletes the case once this timestamp is in the past.
const CASE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const OCR_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/tiff',
])
const BODY_LIMIT = {
  generate: 1024 * 1024,
  ocr: 15 * 1024 * 1024,
  cases: 512 * 1024,
  upload: 15 * 1024 * 1024,
}

export function firestoreColUrl({ project }, sid) {
  return `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/sessions/${sid}/cases`
}

function sessionId(req, res) {
  const sid = req.headers['x-session-id']
  if (!sid || !SESSION_RE.test(sid)) {
    json(res, 401, { error: 'no_session', message: 'Missing or malformed X-Session-Id.' })
    return null
  }
  return sid
}

// Never reflect a Google error body. Vertex, Document AI, Firestore and GCS
// include the project id and resource path, and nginx only rewrites 5xx.
function upstreamError(res, status, message) {
  const code = status >= 400 && status <= 599 ? status : 502
  json(res, code, { error: 'upstream_rejected', message })
}

// Browsers cannot spoof Sec-Fetch-Site, and a cross-site form cannot set JSON
// or octet-stream. Missing headers stay allowed for curl, health, and the Vite proxy.
function blocked(req, res, expectedType) {
  const site = String(req.headers['sec-fetch-site'] || '').toLowerCase()
  if (site === 'cross-site' || site === 'same-site') {
    json(res, 403, { error: 'forbidden', message: 'Cross-site request blocked.' })
    return true
  }
  const origin = req.headers.origin
  if (origin) {
    let originHost
    try {
      originHost = new URL(origin).host
    } catch {
      json(res, 403, { error: 'forbidden', message: 'Cross-site request blocked.' })
      return true
    }
    // $http_host keeps a non-default port. Browsers also drop :80 and :443.
    const norm = (h) => h.trim().toLowerCase().replace(/:(80|443)$/, '')
    if (norm(originHost) !== norm(req.headers.host || '')) {
      json(res, 403, { error: 'forbidden', message: 'Cross-site request blocked.' })
      return true
    }
  }
  if (expectedType) {
    const raw = String(req.headers['content-type'] || '')
    const ct = raw.split(';', 1)[0].trim().toLowerCase()
    if (ct && ct !== expectedType) {
      json(res, 415, { error: 'unsupported_media_type', message: 'Unsupported content type.' })
      return true
    }
  }
  return false
}

function tooLarge(message) {
  return Object.assign(new Error(message), { status: 413 })
}

// Raw bytes. JSON routes decode UTF-8 themselves; binary uploads must stay a Buffer
// or a PDF's non-UTF-8 bytes would be destroyed.
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let settled = false
    const fail = (err) => {
      if (settled) return
      settled = true
      reject(err)
    }
    req.on('data', (c) => {
      if (settled) return
      total += c.length
      if (total > limit) {
        fail(tooLarge('Request is too large.'))
        if (typeof req.destroy === 'function') req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    })
    req.on('error', fail)
  })
}

function textParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > 4) return null
  const out = []
  for (const part of parts) {
    if (!part || typeof part !== 'object') return null
    if (Object.keys(part).length !== 1 || typeof part.text !== 'string') return null
    out.push({ text: part.text })
  }
  return out
}

// The route is public, so rebuild an allow-listed body. Tools, safety overrides,
// and oversized completions are dropped.
export function buildGenerateBody(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: 'bad_request' }
  if (!Array.isArray(payload.contents) || payload.contents.length === 0 || payload.contents.length > 12) {
    return { error: 'bad_request' }
  }
  let chars = 0
  const contents = []
  for (const turn of payload.contents) {
    if (!turn || typeof turn !== 'object') return { error: 'bad_request' }
    const parts = textParts(turn.parts)
    if (!parts) return { error: 'bad_request' }
    if (turn.role !== undefined && turn.role !== 'user' && turn.role !== 'model') return { error: 'bad_request' }
    for (const part of parts) chars += part.text.length
    contents.push(turn.role ? { role: turn.role, parts } : { parts })
  }
  let systemInstruction
  if (payload.systemInstruction !== undefined) {
    if (!payload.systemInstruction || typeof payload.systemInstruction !== 'object') return { error: 'bad_request' }
    const parts = textParts(payload.systemInstruction.parts)
    if (!parts) return { error: 'bad_request' }
    for (const part of parts) chars += part.text.length
    systemInstruction = { parts }
  }
  if (chars > MAX_PROMPT_CHARS) return { error: 'too_large' }

  const incoming = payload.generationConfig
  const generationConfig = {}
  if (incoming !== undefined) {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return { error: 'bad_request' }
    if (incoming.temperature !== undefined) {
      const temperature = Number(incoming.temperature)
      if (!Number.isFinite(temperature)) return { error: 'bad_request' }
      generationConfig.temperature = Math.min(1, Math.max(0, temperature))
    }
    const requested = incoming.maxOutputTokens === undefined ? MAX_OUTPUT_TOKENS : Number(incoming.maxOutputTokens)
    if (!Number.isFinite(requested) || requested < 1) return { error: 'bad_request' }
    generationConfig.maxOutputTokens = Math.min(MAX_OUTPUT_TOKENS, Math.floor(requested))
    if (incoming.responseMimeType !== undefined) {
      if (incoming.responseMimeType !== 'application/json') return { error: 'bad_request' }
      generationConfig.responseMimeType = 'application/json'
    }
    if (incoming.responseSchema !== undefined) {
      let encoded
      try {
        encoded = JSON.stringify(incoming.responseSchema)
      } catch {
        return { error: 'bad_request' }
      }
      if (!encoded || encoded.length > MAX_SCHEMA_CHARS) return { error: 'bad_request' }
      generationConfig.responseSchema = incoming.responseSchema
    }
  } else {
    generationConfig.maxOutputTokens = MAX_OUTPUT_TOKENS
  }

  const body = { contents, generationConfig }
  if (systemInstruction) body.systemInstruction = systemInstruction
  return { body }
}

function ocrMime(value) {
  const mime = String(value || 'application/pdf').toLowerCase().split(';', 1)[0].trim()
  return mime === 'image/jpg' ? 'image/jpeg' : mime
}

function isBase64(value) {
  return typeof value === 'string' && value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
}

function caseIdFrom(raw) {
  let caseId
  try {
    caseId = decodeURIComponent(raw)
  } catch {
    return null
  }
  return CASE_ID_RE.test(caseId) ? caseId : null
}

async function storeResult(res, upstream, okBody, message) {
  // Drain so the socket can be reused, but do not show the provider body.
  await upstream.text().catch(() => '')
  if (upstream.status >= 200 && upstream.status < 300) return json(res, 200, okBody)
  return upstreamError(res, upstream.status, message)
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function createHandler({ config, getToken, fetchImpl = fetch }) {
  return async function handler(req, res) {
    const path = req.url.split('?')[0]

    if (path === '/healthz') return json(res, 200, { ok: true })

    if (path === '/generate') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
      if (blocked(req, res, 'application/json')) return
      if (!config.project) return json(res, 503, { error: 'not_configured', message: 'VERTEX_PROJECT is not set' })
      try {
        const raw = await readBody(req, BODY_LIMIT.generate)
        let payload
        try {
          payload = JSON.parse(raw.toString('utf8'))
        } catch {
          return json(res, 400, { error: 'bad_request', message: 'Body must be JSON.' })
        }
        const built = buildGenerateBody(payload)
        if (built.error === 'too_large') return json(res, 413, { error: 'too_large', message: 'The document text is too large.' })
        if (!built.body) return json(res, 400, { error: 'bad_request', message: 'The request is not a text generation call.' })
        const token = await getToken()
        const upstream = await fetchImpl(vertexUrl(config), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(built.body),
          signal: AbortSignal.timeout(55_000),
        })
        if (upstream.status < 200 || upstream.status >= 300) {
          await upstream.text().catch(() => '')
          return upstreamError(res, upstream.status, 'The analysis service rejected the request.')
        }
        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/json')
        res.end(await upstream.text())
      } catch (err) {
        if (err?.status === 413) return json(res, 413, { error: 'too_large', message: err.message })
        json(res, 502, { error: 'upstream_unavailable', message: 'The analysis service is unavailable right now.' })
      }
      return
    }

    if (path === '/ocr') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
      if (blocked(req, res, 'application/json')) return
      if (!config.docai?.processor) return json(res, 503, { error: 'not_configured', message: 'DOCAI_PROCESSOR is not set' })
      let payload
      try {
        payload = JSON.parse((await readBody(req, BODY_LIMIT.ocr)).toString('utf8'))
      } catch (err) {
        if (err?.status === 413) return json(res, 413, { error: 'too_large', message: 'Request is too large.' })
        return json(res, 400, { error: 'bad_request', message: 'Body must be JSON: { content: base64, mimeType }' })
      }
      const mime = ocrMime(payload?.mimeType)
      if (!OCR_MIMES.has(mime)) return json(res, 415, { error: 'unsupported_media_type', message: 'Only PDF and photo scans can be read.' })
      if (typeof payload?.content === 'string' && payload.content.length > MAX_OCR_CHARS) {
        return json(res, 413, { error: 'too_large', message: 'The scan is too large.' })
      }
      if (!isBase64(payload?.content)) {
        return json(res, 400, { error: 'bad_request', message: 'Missing base64 content' })
      }
      try {
        const token = await getToken()
        const upstream = await fetchImpl(docaiUrl(config.docai), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rawDocument: { content: payload.content, mimeType: mime } }),
          signal: AbortSignal.timeout(110_000),
        })
        if (upstream.status !== 200) {
          await upstream.text().catch(() => '')
          return upstreamError(res, upstream.status, 'The OCR service rejected the document.')
        }
        const data = JSON.parse(await upstream.text())
        const ocrText = String(data?.document?.text ?? '')
        const capped = ocrText.length > OCR_TEXT_CAP ? ocrText.slice(0, OCR_TEXT_CAP) + OCR_TRUNCATION_NOTE : ocrText
        json(res, 200, { text: capped })
      } catch {
        json(res, 502, { error: 'upstream_unavailable', message: 'The OCR service is unavailable right now.' })
      }
      return
    }

    const casesMatch = path.match(/^\/api\/cases(?:\/([^/]+))?$/)
    if (casesMatch) {
      if (blocked(req, res, req.method === 'PUT' ? 'application/json' : '')) return
      const sid = sessionId(req, res)
      if (!sid) return
      if (!config.store?.project) return json(res, 503, { error: 'not_configured', message: 'FIRESTORE_PROJECT is not set' })
      const caseId = casesMatch[1] ? caseIdFrom(casesMatch[1]) : null
      if (casesMatch[1] && !caseId) return json(res, 400, { error: 'bad_request', message: 'Malformed case id.' })
      const colUrl = firestoreColUrl(config.store, sid)
      try {
        const token = await getToken()
        const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        if (req.method === 'PUT' && caseId) {
          let body
          try {
            body = JSON.parse((await readBody(req, BODY_LIMIT.cases)).toString('utf8'))
          } catch (err) {
            if (err?.status === 413) return json(res, 413, { error: 'too_large', message: 'Request is too large.' })
            return json(res, 400, { error: 'bad_request', message: 'Body must be JSON.' })
          }
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return json(res, 400, { error: 'bad_request', message: 'Body must be a JSON object.' })
          }
          if (body.name !== undefined && typeof body.name !== 'string') {
            return json(res, 400, { error: 'bad_request', message: 'Case name must be text.' })
          }
          if (body.payload !== undefined && typeof body.payload !== 'string') {
            return json(res, 400, { error: 'bad_request', message: 'Case payload must be text.' })
          }
          const payload = body.payload ?? '{}'
          if (payload.length > MAX_CASE_PAYLOAD) return json(res, 413, { error: 'too_large', message: 'Case is too large to store.' })
          const now = Date.now()
          const upstream = await fetchImpl(`${colUrl}/${encodeURIComponent(caseId)}`, {
            method: 'PATCH',
            headers: authHeaders,
            body: JSON.stringify({
              fields: {
                name: { stringValue: String(body.name ?? caseId).slice(0, MAX_CASE_NAME) },
                savedAt: { timestampValue: new Date(now).toISOString() },
                expireAt: { timestampValue: new Date(now + CASE_TTL_MS).toISOString() },
                payload: { stringValue: payload },
              },
            }),
            signal: AbortSignal.timeout(25_000),
          })
          await storeResult(res, upstream, { ok: true }, 'The case store rejected the request.')
        } else if (req.method === 'GET' && !caseId) {
          const upstream = await fetchImpl(colUrl, { headers: authHeaders, signal: AbortSignal.timeout(25_000) })
          if (upstream.status !== 200) {
            await upstream.text().catch(() => '')
            return upstreamError(res, upstream.status, 'The case store rejected the request.')
          }
          const data = JSON.parse(await upstream.text())
          const cases = (data.documents ?? []).map((d) => ({
            id: d.name.split('/').pop(),
            name: d.fields?.name?.stringValue ?? '',
            savedAt: d.fields?.savedAt?.timestampValue ?? '',
          }))
          json(res, 200, { cases })
        } else if (req.method === 'GET' && caseId) {
          const upstream = await fetchImpl(`${colUrl}/${encodeURIComponent(caseId)}`, { headers: authHeaders, signal: AbortSignal.timeout(25_000) })
          if (upstream.status !== 200) {
            await upstream.text().catch(() => '')
            return upstreamError(res, upstream.status, upstream.status === 404 ? 'Case not found.' : 'The case store rejected the request.')
          }
          const data = JSON.parse(await upstream.text())
          json(res, 200, {
            name: data.fields?.name?.stringValue ?? '',
            savedAt: data.fields?.savedAt?.timestampValue ?? '',
            payload: data.fields?.payload?.stringValue ?? '{}',
          })
        } else if (req.method === 'DELETE' && caseId) {
          const upstream = await fetchImpl(`${colUrl}/${encodeURIComponent(caseId)}`, {
            method: 'DELETE',
            headers: authHeaders,
            signal: AbortSignal.timeout(25_000),
          })
          await storeResult(res, upstream, { ok: true }, 'The case store rejected the request.')
        } else if (req.method === 'DELETE' && !caseId) {
          // Opt-out purge: wipe the whole session's cases so turning the
          // consent toggle off leaves nothing server-side.
          const list = await fetchImpl(colUrl, { headers: authHeaders, signal: AbortSignal.timeout(25_000) })
          if (list.status !== 200) {
            await list.text().catch(() => '')
            return upstreamError(res, list.status, 'The case store rejected the request.')
          }
          const data = JSON.parse(await list.text())
          for (const d of data.documents ?? []) {
            const id = d.name.split('/').pop()
            await fetchImpl(`${colUrl}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders, signal: AbortSignal.timeout(25_000) })
          }
          json(res, 200, { purged: (data.documents ?? []).length })
        } else {
          json(res, 405, { error: 'method_not_allowed' })
        }
      } catch (err) {
        if (err?.status === 413) return json(res, 413, { error: 'too_large', message: err.message })
        json(res, 502, { error: 'upstream_unavailable', message: 'The case store is unavailable right now.' })
      }
      return
    }

    if (path === '/api/uploads') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
      if (blocked(req, res, 'application/octet-stream')) return
      const sid = sessionId(req, res)
      if (!sid) return
      if (!config.bucket) return json(res, 503, { error: 'not_configured', message: 'GCS_BUCKET is not set' })
      try {
        const body = await readBody(req, BODY_LIMIT.upload)
        const name = new URL(req.url, 'http://x').searchParams.get('name') || 'document'
        const safe = name.replace(/[^\w.-]+/g, '_').slice(-80) || 'document'
        const object = `uploads/${sid}/${Date.now()}-${safe}`
        const token = await getToken()
        const upstream = await fetchImpl(
          `https://storage.googleapis.com/upload/storage/v1/b/${config.bucket}/o?uploadType=media&name=${encodeURIComponent(object)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` },
            body,
            signal: AbortSignal.timeout(110_000),
          },
        )
        // The GCS JSON names the bucket and the object. The desk only needs success.
        await storeResult(res, upstream, { ok: true }, 'The document store rejected the upload.')
      } catch (err) {
        if (err?.status === 413) return json(res, 413, { error: 'too_large', message: 'Request is too large.' })
        json(res, 502, { error: 'upstream_unavailable', message: 'The document store is unavailable right now.' })
      }
      return
    }

    json(res, 404, { error: 'not_found' })
  }
}

/* c8 ignore start — process entry, exercised via the container smoke test */
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  const config = {
    project: process.env.VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '',
    location: process.env.VERTEX_LOCATION || 'global',
    model: process.env.VERTEX_MODEL || 'gemini-3.8-flash',
    docai: {
      project: process.env.DOCAI_PROJECT || process.env.VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '',
      location: process.env.DOCAI_LOCATION || 'us',
      processor: process.env.DOCAI_PROCESSOR || '',
    },
    store: process.env.FIRESTORE_PROJECT ? { project: process.env.FIRESTORE_PROJECT } : null,
    bucket: process.env.GCS_BUCKET || '',
  }
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
  const getToken = async () => {
    const client = await auth.getClient()
    const { token } = await client.getAccessToken()
    return token
  }
  const port = Number(process.env.SIDECAR_PORT || 8081)
  http.createServer(createHandler({ config, getToken })).listen(port, '127.0.0.1', () => {
    console.log(`sidecar listening on 127.0.0.1:${port} (model ${config.model}, location ${config.location})`)
  })
}
