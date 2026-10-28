/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { handleLive, memoryStore } from './api/_lib/live'

/** The same addresses as vercel.json: / goes to the phone page, /live is the phone, /live/host is the host. */
const routes = (): Plugin => ({
  name: 'live-routes',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query] = (req.url ?? '/').split('?')
      const q = query ? `?${query}` : ''
      const p = path.replace(/\/$/, '') || '/'
      if (p === '/live/host') req.url = `/live-host.html${q}`
      else if (p === '/live' || p === '/') req.url = `/live.html${q}`
      next()
    })
  },
})

/**
 * DEV ONLY. /api/live is a Vercel function in production. This runs the SAME handler (api/_lib/live.ts) with the
 * in-memory store, so the whole app works under `npm run dev` with no accounts. Anyone may create a session here.
 * A restart of the dev server forgets every session.
 */
const devLive = (): Plugin => ({
  name: 'dev-live',
  apply: 'serve',
  configureServer(server) {
    const store = memoryStore()
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/live')) return next()
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const out = await handleLive(
        new Request(`http://localhost${req.url}`, { method: req.method, headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }),
        store,
        { open: true },
      )
      res.statusCode = out.status
      out.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await out.arrayBuffer()))
    })
  },
})

export default defineConfig({
  plugins: [react(), routes(), devLive()],
  build: {
    rollupOptions: {
      input: {
        live: resolve(__dirname, 'live.html'),
        liveHost: resolve(__dirname, 'live-host.html'),
      },
    },
  },
  test: {
    include: ['api/**/*.test.ts'],
  },
})
