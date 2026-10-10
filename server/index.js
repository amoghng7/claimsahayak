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
