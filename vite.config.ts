import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Optional platform plugin (present in the original build sandbox, not on npm).
// Loaded dynamically so the repo builds anywhere.
let inspectPlugin: import('vite').PluginOption[] = []
try {
  const mod = await import('kimi-plugin-inspect-react')
  inspectPlugin = [mod.inspectAttr()]
} catch {
  /* not installed outside the sandbox — fine */
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [...inspectPlugin, react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
