import http from 'node:http'
import { GoogleAuth } from 'google-auth-library'

// ClaimSahayak sidecar: same-origin backend inside the nginx container.
// /generate re-implements the old nginx proxy against Vertex AI with
// Application Default Credentials — no API key material anywhere; IAM and
// Cloud Logging govern access. The request/response contract is byte-identical
// to the Gemini Developer API generateContent call the SPA already makes.

export function vertexUrl({ project, location, model }) {
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`
  return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`
}

export function docaiUrl({ project, location, processor }) {
  return `https://${location}-documentai.googleapis.com/v1/projects/${project}/locations/${location}/processors/${processor}:process`
}

// Phase 06 step 6.4 — consent-gated persistence. Cases live under
// sessions/{sessionId}/cases/{caseId}; the session id is a client-generated
// UUID sent as X-Session-Id — anonymous, no accounts, created only after the
// user opts in. Documents go to a GCS bucket with a 30-day lifecycle rule.
const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

async function callUpstream(res, fetchImpl, url, opts) {
  const upstream = await fetchImpl(url, opts)
  res.statusCode = upstream.status
  res.setHeader('Content-Type', 'application/json')
  res.end(await upstream.text())
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
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
      if (!config.project) return json(res, 503, { error: 'not_configured', message: 'VERTEX_PROJECT is not set' })
      try {
        const body = await readBody(req)
        const token = await getToken()
        const upstream = await fetchImpl(vertexUrl(config), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body,
        })
        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/json')
        res.end(await upstream.text())
      } catch {
        json(res, 502, { error: 'upstream_unavailable', message: 'The analysis service is unavailable right now.' })
      }
      return
    }

    if (path === '/ocr') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
      if (!config.docai?.processor) return json(res, 503, { error: 'not_configured', message: 'DOCAI_PROCESSOR is not set' })
      let payload
      try {
        payload = JSON.parse(await readBody(req))
      } catch {
        return json(res, 400, { error: 'bad_request', message: 'Body must be JSON: { content: base64, mimeType }' })
      }
      if (!payload?.content) return json(res, 400, { error: 'bad_request', message: 'Missing base64 content' })
      try {
        const token = await getToken()
        const upstream = await fetchImpl(docaiUrl(config.docai), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rawDocument: { content: payload.content, mimeType: payload.mimeType || 'application/pdf' } }),
        })
        if (upstream.status !== 200) {
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(await upstream.text())
          return
        }
        const data = JSON.parse(await upstream.text())
        json(res, 200, { text: data?.document?.text ?? '' })
      } catch {
        json(res, 502, { error: 'upstream_unavailable', message: 'The OCR service is unavailable right now.' })
      }
      return
    }

    const casesMatch = path.match(/^\/api\/cases(?:\/([^/]+))?$/)
    if (casesMatch) {
      const sid = sessionId(req, res)
      if (!sid) return
      if (!config.store?.project) return json(res, 503, { error: 'not_configured', message: 'FIRESTORE_PROJECT is not set' })
      const caseId = casesMatch[1] ? decodeURIComponent(casesMatch[1]) : null
      const colUrl = firestoreColUrl(config.store, sid)
      try {
        const token = await getToken()
        const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        if (req.method === 'PUT' && caseId) {
          const body = JSON.parse(await readBody(req))
          await callUpstream(res, fetchImpl, `${colUrl}/${encodeURIComponent(caseId)}`, {
            method: 'PATCH',
            headers: authHeaders,
            body: JSON.stringify({
              fields: {
                name: { stringValue: String(body.name ?? caseId) },
                savedAt: { timestampValue: new Date().toISOString() },
                payload: { stringValue: String(body.payload ?? '{}') },
              },
            }),
          })
        } else if (req.method === 'GET' && !caseId) {
          const upstream = await fetchImpl(colUrl, { headers: authHeaders })
          const data = JSON.parse(await upstream.text())
          const cases = (data.documents ?? []).map((d) => ({
            id: d.name.split('/').pop(),
            name: d.fields?.name?.stringValue ?? '',
            savedAt: d.fields?.savedAt?.timestampValue ?? '',
          }))
          json(res, 200, { cases })
        } else if (req.method === 'GET' && caseId) {
          const upstream = await fetchImpl(`${colUrl}/${encodeURIComponent(caseId)}`, { headers: authHeaders })
          if (upstream.status !== 200) {
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'application/json')
            res.end(await upstream.text())
            return
          }
          const data = JSON.parse(await upstream.text())
          json(res, 200, {
            name: data.fields?.name?.stringValue ?? '',
            savedAt: data.fields?.savedAt?.timestampValue ?? '',
            payload: data.fields?.payload?.stringValue ?? '{}',
          })
        } else if (req.method === 'DELETE' && caseId) {
          await callUpstream(res, fetchImpl, `${colUrl}/${encodeURIComponent(caseId)}`, { method: 'DELETE', headers: authHeaders })
        } else {
          json(res, 405, { error: 'method_not_allowed' })
        }
      } catch {
        json(res, 502, { error: 'upstream_unavailable', message: 'The case store is unavailable right now.' })
      }
      return
    }

    if (path === '/api/uploads') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
      const sid = sessionId(req, res)
      if (!sid) return
      if (!config.bucket) return json(res, 503, { error: 'not_configured', message: 'GCS_BUCKET is not set' })
      try {
        const body = await readBody(req)
        const name = new URL(req.url, 'http://x').searchParams.get('name') || 'document'
        const safe = name.replace(/[^\w.-]+/g, '_').slice(-80)
        const object = `uploads/${sid}/${Date.now()}-${safe}`
        const token = await getToken()
        const upstream = await fetchImpl(
          `https://storage.googleapis.com/upload/storage/v1/b/${config.bucket}/o?uploadType=media&name=${encodeURIComponent(object)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` }, body },
        )
        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/json')
        res.end(await upstream.text())
      } catch {
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
