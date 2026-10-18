import path from "path"
import react from "@vitejs/plugin-react"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"
import type { Connect, Plugin } from "vite"

// Optional platform plugin (present in the original build sandbox, not on npm).
// Loaded dynamically so the repo builds anywhere.
let inspectPlugin: import('vite').PluginOption[] = []
try {
  // @ts-expect-error — optional platform plugin, not published to npm; import fails only when absent
  const mod = await import('kimi-plugin-inspect-react')
  inspectPlugin = [mod.inspectAttr()]
} catch {
  /* not installed outside the sandbox — fine */
}

const GEMINI_MODEL = 'gemini-3.8-flash'

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// Dev stand-in for the nginx Gemini proxy. GEMINI_SIDECAR_URL forwards to a local
// sidecar; otherwise GEMINI_API_KEY is injected. Neither set → HTTP 428.
function geminiDevProxy(apiKey: string | undefined, sidecarUrl: string | undefined): Plugin {
  return {
    name: 'gemini-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/gemini/generate', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'method_not_allowed' }))
          return
        }
        if (!apiKey && !sidecarUrl) {
          res.statusCode = 428
          res.end(JSON.stringify({ error: 'no_dev_key' }))
          return
        }
        try {
          const body = await readBody(req)
          const upstream = sidecarUrl
            ? await fetch(`${sidecarUrl}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
            : await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey!)}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
              )
          res.statusCode = upstream.status
          res.end(await upstream.text())
        } catch {
          res.statusCode = 502
          res.end(JSON.stringify({ error: 'upstream_unavailable' }))
        }
      })
    },
  }
}

// Dev stand-in for the nginx Document AI proxy (server/index.js /ocr → Document AI,
// which has no local emulator). GEMINI_SIDECAR_URL forwards to a local sidecar with a
// real processor; otherwise the same GEMINI_API_KEY drives a multimodal transcription
// call. Response shape matches the sidecar: { text }. Neither set → HTTP 428.
const OCR_PROMPT =
  'Transcribe every piece of visible text in this document exactly as it appears — names, dates, policy numbers, line items, amounts, totals. Preserve the line structure. Output plain text only: no commentary, no markdown.'

function ocrDevProxy(apiKey: string | undefined, sidecarUrl: string | undefined): Plugin {
  return {
    name: 'ocr-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ocr', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'method_not_allowed' }))
          return
        }
        if (sidecarUrl) {
          try {
            const body = await readBody(req)
            const upstream = await fetch(`${sidecarUrl}/ocr`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
            res.statusCode = upstream.status
            res.end(await upstream.text())
          } catch {
            res.statusCode = 502
            res.end(JSON.stringify({ error: 'upstream_unavailable' }))
          }
          return
        }
        if (!apiKey) {
          res.statusCode = 428
          res.end(JSON.stringify({ error: 'no_dev_key' }))
          return
        }
        try {
          const payload = JSON.parse(await readBody(req)) as { content?: string; mimeType?: string }
          const upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    role: 'user',
                    parts: [
                      { text: OCR_PROMPT },
                      { inlineData: { mimeType: payload.mimeType ?? 'application/pdf', data: payload.content ?? '' } },
                    ],
                  },
                ],
                generationConfig: { temperature: 0 },
              }),
            },
          )
          if (!upstream.ok) {
            res.statusCode = upstream.status
            res.end(await upstream.text())
            return
          }
          const json = (await upstream.json()) as {
            candidates?: { content?: { parts?: { text?: unknown }[] } }[]
          }
          const parts = json.candidates?.[0]?.content?.parts
          const text = Array.isArray(parts) ? parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : ''
          res.statusCode = 200
          res.end(JSON.stringify({ text }))
        } catch {
          res.statusCode = 502
          res.end(JSON.stringify({ error: 'upstream_unavailable' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: '/',
    plugins: [...inspectPlugin, react(), geminiDevProxy(env.GEMINI_API_KEY, env.GEMINI_SIDECAR_URL), ocrDevProxy(env.GEMINI_API_KEY, env.GEMINI_SIDECAR_URL)],
    server: {
      port: 3000,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      // server/ has its own node --test suite (npm --prefix server test)
      exclude: ['**/node_modules/**', '**/dist/**', 'server/**'],
    },
  }
});
