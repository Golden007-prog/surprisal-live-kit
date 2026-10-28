/** The browser side of /api/live: calls, the polling hook, and what the browser remembers. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { BRAND } from '../brand'
import type { Answer, Deck, HostState, MeState, PublicState, Results } from '../lib/live'

export type SavedDeck = { id: string; deck: Deck; updated_at: number; updated_by: string }

export type ApiError = { status: number; error: string }

async function call<T>(method: 'GET' | 'POST', qs: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/live?${qs}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw { status: 0, error: 'offline' } satisfies ApiError
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw { status: res.status, error: data.error ?? 'unknown' } satisfies ApiError
  return data
}

const host = (token: string) => ({ 'x-live-host': token })

export const live = {
  // The phone's URL is the same for everyone in the room, so the edge can serve it from cache. The host's has `h=1`
  // so a cached phone answer is never handed to the host.
  state: (code: string) => call<PublicState>('GET', `op=state&code=${code}`),
  hostState: (code: string, token: string) => call<HostState>('GET', `op=state&code=${code}&h=1`, undefined, host(token)),
  me: (code: string, pid: string) => call<MeState>('GET', `op=me&code=${code}&pid=${pid}&t=${Date.now()}`),
  exportAll: (code: string, token: string) => call<Record<string, unknown> & { csv: string }>('GET', `op=export&code=${code}`, undefined, host(token)),
  create: (deck: Deck, adminKey: string) =>
    call<{ code: string; hostToken: string; deck: Deck }>('POST', 'op=create', { deck }, adminKey ? { 'x-live-admin-key': adminKey } : {}),
  join: (code: string, pid: string, name: string) => call<{ ok: true; name: string }>('POST', 'op=join', { code, pid, name }),
  answer: (code: string, pid: string, slide: string, answer: Answer) => call<{ ok: true }>('POST', 'op=answer', { code, pid, slide, answer }),
  ask: (code: string, pid: string, text: string) => call<{ ok: true; id: string; held?: boolean }>('POST', 'op=ask', { code, pid, text }),
  vote: (code: string, pid: string, question: string, on: boolean) => call<{ ok: true }>('POST', 'op=vote', { code, pid, question, on }),
  react: (code: string, pid: string, emoji: string) => call<{ ok: true }>('POST', 'op=react', { code, pid, emoji }),
  control: (code: string, token: string, action: string, extra: Record<string, unknown> = {}) =>
    call<{ ok: true }>('POST', 'op=control', { code, action, ...extra }, host(token)),
  moderate: (code: string, token: string, question: string, patch: { answered?: boolean; hidden?: boolean }) =>
    call<{ ok: true }>('POST', 'op=moderate', { code, question, ...patch }, host(token)),
  /** Let a held answer (the word filter) onto the screen: an entry id, `w:<word>`, or a question (`q:<id>`). */
  approve: (code: string, token: string, id: string) =>
    id.startsWith('q:')
      ? call<{ ok: true }>('POST', 'op=moderate', { code, question: id.slice(2), approve: true }, host(token))
      : call<{ ok: true }>('POST', 'op=moderate', { code, entry: id, approve: true }, host(token)),
  /** Hide a held answer for good. */
  reject: (code: string, token: string, id: string) =>
    id.startsWith('q:')
      ? call<{ ok: true }>('POST', 'op=moderate', { code, question: id.slice(2), hidden: true }, host(token))
      : call<{ ok: true }>('POST', 'op=moderate', { code, entry: id, hidden: true }, host(token)),
  /** Self-paced sessions: one slide's results. */
  slideResults: (code: string, slide: string) => call<{ results: Results }>('GET', `op=results&code=${code}&slide=${encodeURIComponent(slide)}`),
  decks: (key: string) => call<{ decks: SavedDeck[] }>('GET', 'op=decks', undefined, key ? { 'x-live-admin-key': key } : {}),
  deckSave: (key: string, id: string, deck: Deck, by: string) => call<SavedDeck>('POST', 'op=deck-save', { id, deck, by }, key ? { 'x-live-admin-key': key } : {}),
  deckDelete: (key: string, id: string) => call<{ ok: true }>('POST', 'op=deck-delete', { id }, key ? { 'x-live-admin-key': key } : {}),
  /** Hide an open-text answer (its entry id) or a word-cloud word (`w:<word>`) from the screen and the phones. */
  hideEntry: (code: string, token: string, entry: string, hidden = true) => call<{ ok: true }>('POST', 'op=moderate', { code, entry, hidden }, host(token)),
}

/**
 * Polls `load` every `ms` while the tab is visible, and once straight away when it becomes visible again.
 * `offset` is server time minus this device's time, for the quiz clock.
 */
export function usePoll<T extends { serverNow: number }>(load: (() => Promise<T>) | null, ms: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  // A local change (patch) or a write in flight (hold) makes any answer already on its way stale: drop it.
  const epoch = useRef(0)
  const holds = useRef(0)
  // The edge can hand back a cached room older than one already shown (2.9% of polls in the 28 Oct load test). Showing
  // it would put the previous slide back for a poll and drop what someone was typing, so anything older is skipped.
  const newest = useRef(0)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })
  useEffect(() => {
    if (!load) return
    let stop = false
    let timer: number | undefined
    const run = async () => {
      window.clearTimeout(timer)
      if (stop) return
      if (document.visibilityState === 'visible' && loadRef.current) {
        const sent = Date.now()
        const sentEpoch = epoch.current
        try {
          const d = await loadRef.current()
          if (stop) return
          const got = Date.now()
          if (holds.current === 0 && epoch.current === sentEpoch && !(d.serverNow < newest.current)) {
            newest.current = d.serverNow
            setData(d)
            setError(null)
            setOffset(d.serverNow - (sent + got) / 2)
          }
        } catch (e) {
          if (!stop) setError(e as ApiError)
        }
      }
      if (!stop) timer = window.setTimeout(run, ms)
    }
    const onVis = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVis)
    run()
    return () => {
      stop = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
    // `tick` lets a caller force an immediate refresh after a write.
  }, [load === null, ms, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  /** Show a change at once, before the server confirms it. */
  const patch = useCallback((fn: (d: T) => T) => {
    epoch.current++
    setData((d) => (d ? fn(d) : d))
  }, [])
  /** Ignore polls while a write is in flight; the returned release refreshes once the write has landed. */
  const hold = useCallback(() => {
    holds.current++
    epoch.current++
    let done = false
    return () => {
      if (done) return
      done = true
      holds.current--
      epoch.current++
      setTick((t) => t + 1)
    }
  }, [])
  return { data, error, offset, refresh, patch, hold }
}

/** A ticking clock, for the quiz countdown. */
export function useNow(active: boolean, every = 100) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(t)
  }, [active, every])
  return now
}

// ---------------------------------------------------------------- storage (all wrapped: private mode throws)

export function readJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode: the page still works, it just forgets */
  }
}

export function participantId(): string {
  const key = 'live_kit_pid'
  let id = readJson<string>(key, '')
  if (!/^[a-z0-9]{8,32}$/.test(id)) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('')
    writeJson(key, id)
  }
  return id
}

/** What the presenter prints for phones: VITE_JOIN_HOST when set, else this site's own host, plus /live. */
export function joinHost() {
  return `${(BRAND.joinHost || location.host).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')}/live`
}
export function joinUrl(code: string) {
  return `${location.origin}/live?c=${code}`
}
