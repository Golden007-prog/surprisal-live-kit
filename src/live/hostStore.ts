/** What the host's pages keep: the deck library (shared on the server when the admin key is set, else in this
 * browser), the sessions this browser hosts (their host tokens), and small helpers. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Deck } from '../lib/live'
import { live, readJson, writeJson, type ApiError } from './api'

export type Saved = { id: string; deck: Deck; updated: number; by?: string }
export type Hosting = { code: string; token: string; title: string; at: number }
export const DECKS = 'live_kit_decks'
export const HOSTING = 'live_kit_hosting'
export const ADMIN = 'live_kit_admin_key'
export const THEME = 'live_kit_theme'
export const HOST_NAME = 'live_kit_host_name'

export function hostings(): Hosting[] {
  return readJson<Hosting[]>(HOSTING, [])
}
export function rememberHosting(h: Hosting) {
  writeJson(HOSTING, [h, ...hostings().filter((x) => x.code !== h.code)].slice(0, 30))
}
export function adminKey(): string {
  return readJson<string>(ADMIN, '')
}

/** The console's address. With the key, it is the phone hand-over: the key rides in the #hash, which never reaches a server. */
export function consoleUrl(h: Hosting, withKey: boolean) {
  return `${location.origin}/live/host?code=${h.code}&view=console${withKey ? `#k=${h.token}` : ''}`
}

export function download(name: string, body: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([body], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session'

export type LibraryStatus = 'loading' | 'shared' | 'local' | 'locked'

/**
 * The deck library. With the admin key (or on the dev server) it is the shared library on the server, so every host
 * with the key sees the same decks; decks made in this browser before are uploaded once. Without it, decks stay in this
 * browser. Every save also lands in this browser, so a dropped connection loses nothing.
 */
export function useLibrary() {
  const [decks, setDecks] = useState<Saved[]>(() => readJson<Saved[]>(DECKS, []))
  const [status, setStatus] = useState<LibraryStatus>('loading')
  const [key, setKeyState] = useState(adminKey)
  const timers = useRef(new Map<string, number>())
  const local = (next: Saved[]) => {
    setDecks(next)
    writeJson(DECKS, next)
  }
  useEffect(() => {
    let on = true
    live
      .decks(key)
      .then(async (r) => {
        if (!on) return
        const merged = new Map(r.decks.map((d) => [d.id, { id: d.id, deck: d.deck, updated: d.updated_at, by: d.updated_by } as Saved]))
        // Decks only this browser had (made before the key, or offline) go up once; the newer copy wins.
        for (const d of readJson<Saved[]>(DECKS, [])) {
          const there = merged.get(d.id)
          if (there && there.updated >= d.updated) continue
          const up = await live.deckSave(key, d.id, d.deck, readJson<string>(HOST_NAME, '')).catch(() => null)
          if (up) merged.set(up.id, { id: up.id, deck: up.deck, updated: up.updated_at, by: up.updated_by })
        }
        if (!on) return
        const server = [...merged.values()].sort((a, b) => b.updated - a.updated)
        local(server)
        setStatus('shared')
      })
      .catch((e: ApiError) => on && setStatus(e.status === 403 ? 'locked' : 'local'))
    return () => {
      on = false
    }
  }, [key])
  const setKey = (k: string) => {
    writeJson(ADMIN, k)
    setKeyState(k)
    setStatus('loading')
  }
  const push = useCallback(
    (d: Saved) => {
      if (status !== 'shared') return
      window.clearTimeout(timers.current.get(d.id))
      timers.current.set(
        d.id,
        window.setTimeout(() => live.deckSave(key, d.id, d.deck, readJson<string>(HOST_NAME, '')).catch(() => setStatus('local')), 600),
      )
    },
    [status, key],
  )
  return {
    decks,
    status,
    key,
    setKey,
    add(d: Saved) {
      local([d, ...readJson<Saved[]>(DECKS, []).filter((x) => x.id !== d.id)])
      push(d)
    },
    update(id: string, deck: Deck) {
      const all = readJson<Saved[]>(DECKS, [])
      const d = { ...(all.find((x) => x.id === id) ?? { id }), deck, updated: Date.now() }
      local(all.map((x) => (x.id === id ? d : x)))
      push(d)
    },
    remove(id: string) {
      local(readJson<Saved[]>(DECKS, []).filter((x) => x.id !== id))
      if (status === 'shared') live.deckDelete(key, id).catch(() => {})
    },
  }
}
