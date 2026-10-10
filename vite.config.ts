import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
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

const GEMINI_MODEL = 'gemini-2.5-flash'

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// Dev parity for the nginx proxy in nginx.conf.template: same path, same
// upstream, key injected server-side. Without a key we answer 428 so the app
// can show a friendly message instead of parsing the SPA fallback HTML.
function geminiDevProxy(apiKey: string | undefined): Plugin {
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
        if (!apiKey) {
          res.statusCode = 428
          res.end(JSON.stringify({ error: 'no_dev_key' }))
          return
        }
        try {
          const body = await readBody(req)
          const upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: '/',
    plugins: [...inspectPlugin, react(), geminiDevProxy(env.GEMINI_API_KEY)],
    server: {
      port: 3000,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
});
