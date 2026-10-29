/**
 * Surprisal Live Kit, the server half. api/live.ts is a thin wrapper
 * around `handleLive`; vite.config.ts runs the same handler under `npm run dev` with the in-memory store, so the
 * dev server and production answer identically.
 *
 * Storage is behind `LiveStore`. `supabaseStore` speaks PostgREST with the service key, with RLS on and
 * no policies (supabase/migrations/0001_live.sql), so only this code reads and writes. `memoryStore` is for the dev server and
 * the tests; on Vercel it would not be shared between instances, so production refuses to run without Supabase.
 *
 * Realtime is polling. GET ?op=state without the host header is the same answer for every phone in a session, so
 * it is cached at the edge for a second: two hundred phones cost about one database read a second.
 */
import {
  ANSWERABLE,
  REACTIONS,
  aggregate,
  cleanAnswer,
  cleanCode,
  cleanDeck,
  cleanName,
  heldEntries,
  isFlagged,
  makeCode,
  publicSlide,
  scores,
  toCsv,
  withPrevious,
  LIMITS,
  type Answer,
  type Deck,
  type HostState,
  type MeState,
  type Phase,
  type PublicState,
  type QuestionRow,
  type ResponseRow,
  type Results,
  type Slide,
} from '../../src/lib/deck.js' // .js: the Node runtime resolves ESM imports literally
import { clientIp, json, rateLimited } from './http.js'

export type SessionRow = {
  code: string
  title: string
  deck: Deck
  idx: number
  phase: Phase
  accepting: boolean
  show_results: boolean
  /** slide id → epoch ms its clock starts: a quiz 3 s after the host lands on it, a timed slide at once. */
  timers: Record<string, number>
  /**
   * The host's moderation: open-text entry ids (entryId) and word-cloud words (`w:<word>`) taken off the screen, and
   * flagged ones approved for it (`ok:<id>`).
   */
  hidden: string[]
  host_hash: string
  created_at: number
}

export type ReactionRow = { id: string; emoji: string; at: number }
export type Person = { id: string; name: string }
export type SavedDeck = { id: string; deck: Deck; updated_at: number; updated_by: string }
/** A held question: the word filter caught it and the host has not approved or hidden it. */
export type HeldQuestion = { id: string; text: string }

export interface LiveStore {
  readonly kind: 'memory' | 'supabase'
  create(row: SessionRow): Promise<boolean>
  get(code: string): Promise<SessionRow | null>
  patch(code: string, patch: Partial<Omit<SessionRow, 'code'>>): Promise<void>
  join(code: string, pid: string, name: string, at: number): Promise<void>
  isParticipant(code: string, pid: string): Promise<boolean>
  participantCount(code: string): Promise<number>
  names(code: string): Promise<Map<string, string>>
  people(code: string): Promise<Person[]>
  /** false when `once` is set and the person already answered this slide. */
  answer(code: string, slideId: string, pid: string, value: Answer, at: number, once: boolean): Promise<boolean>
  responses(code: string, slideId?: string): Promise<ResponseRow[]>
  ask(code: string, slideId: string, id: string, pid: string, text: string, at: number, held: boolean): Promise<void>
  /** Visible questions only: not hidden, not held. */
  questions(code: string, slideId: string): Promise<QuestionRow[]>
  heldQuestions(code: string): Promise<HeldQuestion[]>
  questionExists(code: string, id: string): Promise<boolean>
  vote(code: string, questionId: string, pid: string, on: boolean): Promise<void>
  moderate(code: string, questionId: string, patch: { answered?: boolean; hidden?: boolean; held?: boolean }): Promise<void>
  react(code: string, id: string, pid: string, emoji: string, at: number): Promise<void>
  reactions(code: string, since: number): Promise<ReactionRow[]>
  reactionTally(code: string): Promise<Record<string, number>>
  // The shared deck library (everyone with the admin key).
  decks(): Promise<SavedDeck[]>
  saveDeck(d: SavedDeck): Promise<void>
  deleteDeck(id: string): Promise<void>
}

// ---------------------------------------------------------------- memory

export function memoryStore(): LiveStore {
  const sessions = new Map<string, SessionRow>()
  const people = new Map<string, Map<string, { name: string; at: number }>>()
  const answers = new Map<string, Map<string, ResponseRow>>() // code → `${slide}|${pid}` → row
  type Q = { id: string; slide: string; text: string; answered: boolean; hidden: boolean; held: boolean; at: number; votes: Set<string> }
  const qs = new Map<string, Q[]>()
  const rx = new Map<string, ReactionRow[]>()
  const tally = new Map<string, Record<string, number>>()
  const library = new Map<string, SavedDeck>()
  const bucket = <T>(m: Map<string, T>, code: string, make: () => T) => {
    let b = m.get(code)
    if (!b) m.set(code, (b = make()))
    return b
  }
  const ordered = (code: string) => [...(people.get(code) ?? new Map<string, { name: string; at: number }>()).entries()].sort((a, b) => a[1].at - b[1].at)
  return {
    kind: 'memory',
    async create(row) {
      if (sessions.has(row.code)) return false
      sessions.set(row.code, structuredClone(row))
      return true
    },
    async get(code) {
      const s = sessions.get(code)
      return s ? structuredClone(s) : null
    },
    async patch(code, patch) {
      const s = sessions.get(code)
      if (s) Object.assign(s, structuredClone(patch))
    },
    async join(code, pid, name, at) {
      const b = bucket(people, code, () => new Map())
      const was = b.get(pid)
      b.set(pid, { name, at: was?.at ?? at })
    },
    async isParticipant(code, pid) {
      return people.get(code)?.has(pid) ?? false
    },
    async participantCount(code) {
      return people.get(code)?.size ?? 0
    },
    async names(code) {
      return new Map(ordered(code).map(([id, p]) => [id, p.name]))
    },
    async people(code) {
      return ordered(code).map(([id, p]) => ({ id, name: p.name }))
    },
    async answer(code, slideId, pid, value, at, once) {
      const b = bucket(answers, code, () => new Map())
      const key = `${slideId}|${pid}`
      if (once && b.has(key)) return false
      b.set(key, { slide_id: slideId, participant_id: pid, value, at })
      return true
    },
    async responses(code, slideId) {
      return [...(answers.get(code)?.values() ?? [])].filter((r) => !slideId || r.slide_id === slideId).map((r) => structuredClone(r))
    },
    async ask(code, slideId, id, _pid, text, at, held) {
      bucket(qs, code, () => []).push({ id, slide: slideId, text, answered: false, hidden: false, held, at, votes: new Set() })
    },
    async questions(code, slideId) {
      return (qs.get(code) ?? [])
        .filter((q) => q.slide === slideId && !q.hidden && !q.held)
        .map((q) => ({ id: q.id, text: q.text, votes: q.votes.size, answered: q.answered, at: q.at }))
    },
    async heldQuestions(code) {
      return (qs.get(code) ?? []).filter((q) => q.held && !q.hidden).map((q) => ({ id: q.id, text: q.text }))
    },
    async questionExists(code, id) {
      return (qs.get(code) ?? []).some((q) => q.id === id && !q.hidden && !q.held)
    },
    async vote(code, questionId, pid, on) {
      const q = (qs.get(code) ?? []).find((x) => x.id === questionId)
      if (q) {
        if (on) q.votes.add(pid)
        else q.votes.delete(pid)
      }
    },
    async moderate(code, questionId, patch) {
      const q = (qs.get(code) ?? []).find((x) => x.id === questionId)
      if (q) Object.assign(q, patch)
    },
    async react(code, id, _pid, emoji, at) {
      const b = bucket(rx, code, () => [])
      b.push({ id, emoji, at })
      if (b.length > 500) b.splice(0, b.length - 500)
      const t = bucket(tally, code, (): Record<string, number> => ({}))
      t[emoji] = (t[emoji] ?? 0) + 1
    },
    async reactions(code, since) {
      return (rx.get(code) ?? []).filter((r) => r.at > since)
    },
    async reactionTally(code) {
      return { ...(tally.get(code) ?? {}) }
    },
    async decks() {
      return [...library.values()].map((d) => structuredClone(d)).sort((a, b) => b.updated_at - a.updated_at)
    },
    async saveDeck(d) {
      library.set(d.id, structuredClone(d))
    },
    async deleteDeck(id) {
      library.delete(id)
    },
  }
}

// ---------------------------------------------------------------- supabase

export function supabaseStore(url: string, key: string): LiveStore {
  const call = async (path: string, init: RequestInit & { prefer?: string } = {}) => {
    const { prefer, headers, ...rest } = init
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...rest,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
        ...((headers as Record<string, string>) ?? {}),
      },
    })
    if (!res.ok && res.status !== 409) throw new Error(`supabase ${res.status} ${path.split('?')[0]}`)
    return res
  }
  const rows = async <T>(path: string): Promise<T[]> => (await (await call(path)).json()) as T[]
  const c = (code: string) => `session_code=eq.${code}`
  const enc = encodeURIComponent
  type Db = Omit<SessionRow, 'created_at'> & { created_at: number | string }
  return {
    kind: 'supabase',
    async create(row) {
      const res = await call('live_sessions', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(row) })
      return res.status !== 409
    },
    async get(code) {
      const [r] = await rows<Db>(`live_sessions?code=eq.${code}&select=*`)
      return r ? { ...r, hidden: r.hidden ?? [], created_at: Number(r.created_at) } : null
    },
    async patch(code, patch) {
      await call(`live_sessions?code=eq.${code}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(patch) })
    },
    async join(code, pid, name) {
      await call('live_participants?on_conflict=session_code,participant_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        // joined_at is left to its column default, so a rejoin (a new name) does not move the person's first join.
        body: JSON.stringify({ session_code: code, participant_id: pid, name }),
      })
    },
    async isParticipant(code, pid) {
      return (await rows(`live_participants?${c(code)}&participant_id=eq.${pid}&select=participant_id`)).length > 0
    },
    async participantCount(code) {
      const res = await call(`live_participants?${c(code)}&select=participant_id`, { method: 'HEAD', prefer: 'count=exact', headers: { Range: '0-0' } })
      return Number(res.headers.get('content-range')?.split('/')[1] ?? 0) || 0
    },
    async names(code) {
      const r = await rows<{ participant_id: string; name: string }>(`live_participants?${c(code)}&select=participant_id,name&order=joined_at.asc&limit=2000`)
      return new Map(r.map((p) => [p.participant_id, p.name]))
    },
    async people(code) {
      const r = await rows<{ participant_id: string; name: string }>(`live_participants?${c(code)}&select=participant_id,name&order=joined_at.asc&limit=2000`)
      return r.map((p) => ({ id: p.participant_id, name: p.name }))
    },
    async answer(code, slideId, pid, value, at, once) {
      const res = await call('live_responses?on_conflict=session_code,slide_id,participant_id', {
        method: 'POST',
        prefer: `resolution=${once ? 'ignore' : 'merge'}-duplicates,return=representation`,
        body: JSON.stringify({ session_code: code, slide_id: slideId, participant_id: pid, value, at }),
      })
      if (!once) return true
      const out = (await res.json()) as unknown[]
      return out.length > 0
    },
    async responses(code, slideId) {
      const r = await rows<ResponseRow & { at: number | string }>(
        `live_responses?${c(code)}${slideId ? `&slide_id=eq.${enc(slideId)}` : ''}&select=slide_id,participant_id,value,at&limit=20000`,
      )
      return r.map((x) => ({ ...x, at: Number(x.at) }))
    },
    async ask(code, slideId, id, pid, text, at, held) {
      await call('live_questions', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ id, session_code: code, slide_id: slideId, participant_id: pid, text, at, held }) })
    },
    async questions(code, slideId) {
      const r = await rows<{ id: string; text: string; answered: boolean; at: number | string; live_votes: { count: number }[] }>(
        `live_questions?${c(code)}&slide_id=eq.${enc(slideId)}&hidden=is.false&held=is.false&select=id,text,answered,at,live_votes(count)&limit=500`,
      )
      return r.map((q) => ({ id: q.id, text: q.text, answered: q.answered, at: Number(q.at), votes: q.live_votes?.[0]?.count ?? 0 }))
    },
    async heldQuestions(code) {
      return rows<HeldQuestion>(`live_questions?${c(code)}&held=is.true&hidden=is.false&select=id,text&limit=100`)
    },
    async questionExists(code, id) {
      return (await rows(`live_questions?${c(code)}&id=eq.${enc(id)}&hidden=is.false&held=is.false&select=id`)).length > 0
    },
    async vote(code, questionId, pid, on) {
      if (on)
        await call('live_votes?on_conflict=question_id,participant_id', {
          method: 'POST',
          prefer: 'resolution=ignore-duplicates,return=minimal',
          body: JSON.stringify({ question_id: questionId, participant_id: pid, session_code: code }),
        })
      else await call(`live_votes?question_id=eq.${enc(questionId)}&participant_id=eq.${pid}`, { method: 'DELETE', prefer: 'return=minimal' })
    },
    async moderate(code, questionId, patch) {
      await call(`live_questions?${c(code)}&id=eq.${enc(questionId)}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(patch) })
    },
    async react(code, id, pid, emoji, at) {
      await call('live_reactions', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ id, session_code: code, participant_id: pid, emoji, at }) })
    },
    async reactions(code, since) {
      const r = await rows<ReactionRow & { at: number | string }>(`live_reactions?${c(code)}&at=gt.${Math.floor(since)}&select=id,emoji,at&order=at.asc&limit=200`)
      return r.map((x) => ({ ...x, at: Number(x.at) }))
    },
    async reactionTally(code) {
      const r = await rows<{ emoji: string }>(`live_reactions?${c(code)}&select=emoji&limit=50000`)
      const out: Record<string, number> = {}
      for (const x of r) out[x.emoji] = (out[x.emoji] ?? 0) + 1
      return out
    },
    async decks() {
      const r = await rows<SavedDeck & { updated_at: number | string }>('live_decks?select=id,deck,updated_at,updated_by&order=updated_at.desc&limit=200')
      return r.map((d) => ({ ...d, updated_at: Number(d.updated_at) }))
    },
    async saveDeck(d) {
      await call('live_decks?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: JSON.stringify({ ...d, title: d.deck.title }) })
    },
    async deleteDeck(id) {
      await call(`live_decks?id=eq.${enc(id)}`, { method: 'DELETE', prefer: 'return=minimal' })
    },
  }
}

// ---------------------------------------------------------------- handler

export const HOST_HEADER = 'x-live-host'
export const ADMIN_HEADER = 'x-live-admin-key'
/** The quiz's "get ready" beat between the host landing on a question and the clock starting. */
export const QUIZ_LEAD_MS = 3000
/** Grace for network lag on the last second of any clock. */
export const QUIZ_GRACE_MS = 1500
const REACTION_WINDOW_MS = 8000

export type LiveOptions = {
  /** LIVE_ADMIN_KEY. Creating a session and the deck library need it unless `open` is set. */
  adminKey?: string
  /** Dev server only: anyone may create a session or use the deck library. */
  open?: boolean
  now?: () => number
}

const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
export async function hashToken(token: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
}
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(24)))
const randomId = () => hex(crypto.getRandomValues(new Uint8Array(8)))
const PID = /^[a-z0-9]{8,32}$/
const DECK_ID = /^[a-z0-9]{6,32}$/

const PUBLIC_CACHE = { 'Cache-Control': 'public, max-age=0, s-maxage=1, stale-while-revalidate=1', 'CDN-Cache-Control': 'public, s-maxage=1, stale-while-revalidate=1' }

/** Results kinds a phone may see live even with "show results" off: the list itself is the slide. */
function alwaysVisible(slide: Slide) {
  return slide.kind === 'qa' || slide.kind === 'leaderboard'
}

/** The slide's clock in seconds: a quiz's `seconds`, or a slide's own `timer`. */
export function clockOf(slide: Slide): number | null {
  if (slide.kind === 'quiz') return slide.seconds
  return slide.timer ?? null
}

/** The defaults when the host lands on a slide. */
export function landOn(s: SessionRow, idx: number, now: number): Partial<SessionRow> {
  const slide = s.deck.slides[idx]
  // Self-paced: phones move on their own; the host's slide only picks what the screen shows.
  if (s.deck.settings?.paced) return { idx, show_results: true }
  if (slide.kind === 'quiz') {
    const started = s.timers[slide.id]
    // A quiz runs once. Coming back to one shows its answer, it does not restart the clock.
    if (started != null) return { idx, accepting: false, show_results: true }
    return { idx, accepting: true, show_results: false, timers: { ...s.timers, [slide.id]: now + QUIZ_LEAD_MS } }
  }
  const timers = slide.timer && s.timers[slide.id] == null ? { timers: { ...s.timers, [slide.id]: now } } : {}
  const expired = slide.timer != null && s.timers[slide.id] != null && now > s.timers[slide.id] + slide.timer * 1000
  // Every question lands with its results hidden, so nobody anchors on the room; the host reveals them.
  // The screen still counts the answers as they come in.
  const answerable = ANSWERABLE.has(slide.kind)
  return { idx, accepting: answerable && !expired, show_results: !answerable, ...timers }
}

async function resultsFor(store: LiveStore, s: SessionRow, slide: Slide): Promise<Results> {
  if (slide.kind === 'qa') {
    const questions = (await store.questions(s.code, slide.id)).sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes || a.at - b.at)
    return { kind: 'qa', questions, total: questions.length }
  }
  if (slide.kind === 'leaderboard') {
    const [rows, names] = await Promise.all([store.responses(s.code), store.names(s.code)])
    const board = scores(s.deck, s.timers, rows, names)
      .slice(0, 10)
      .map((x) => ({ name: x.name, score: x.score }))
    return { kind: 'board', board, total: names.size }
  }
  if (!ANSWERABLE.has(slide.kind)) return { kind: 'none', total: 0 }
  const hidden = new Set(s.hidden ?? [])
  const hold = !!s.deck.settings?.hold
  const results = aggregate(slide, await store.responses(s.code, slide.id), hidden, hold)
  // Before / after: the earlier slide's answers ride along, so the chart can show the shift.
  const compare = (slide.kind === 'poll' || slide.kind === 'scale') && slide.compare ? s.deck.slides.find((x) => x.id === slide.compare) : undefined
  if (!compare) return results
  return withPrevious(results, aggregate(compare, await store.responses(s.code, compare.id), hidden, hold))
}

function qaSlideOf(deck: Deck): string | null {
  return deck.slides.find((x) => x.kind === 'qa')?.id ?? null
}

async function isHost(req: Request, s: SessionRow): Promise<boolean> {
  const t = req.headers.get(HOST_HEADER)
  return !!t && (await hashToken(t)) === s.host_hash
}

function isAdmin(req: Request, opts: LiveOptions): boolean {
  return !!opts.open || (!!opts.adminKey && req.headers.get(ADMIN_HEADER) === opts.adminKey)
}

/**
 * Every phone asks for its score at the same moment, the reveal. One read of the answers and names per session per
 * second serves them all (per instance).
 */
const BOARD_TTL_MS = 1000
const boardCache = new Map<string, { at: number; data: Promise<[ResponseRow[], Map<string, string>]> }>()
function boardInputs(store: LiveStore, code: string, now: number) {
  const hit = boardCache.get(code)
  if (hit && now - hit.at < BOARD_TTL_MS) return hit.data
  const data = Promise.all([store.responses(code), store.names(code)])
  boardCache.set(code, { at: now, data })
  if (boardCache.size > 500) for (const [k, v] of boardCache) if (now - v.at > BOARD_TTL_MS) boardCache.delete(k)
  return data
}

/** The board as it stood after one quiz and before it: the difference is that quiz's points, streak included. */
function lastQuizPoints(s: SessionRow, rows: ResponseRow[], names: Map<string, string>, quizId: string, pid: string) {
  const i = s.deck.slides.findIndex((x) => x.id === quizId)
  const upTo = (n: number) => scores({ ...s.deck, slides: s.deck.slides.slice(0, n) }, s.timers, rows, names).find((x) => x.participant_id === pid)
  const after = upTo(i + 1)
  const before = upTo(i)
  return { points: (after?.score ?? 0) - (before?.score ?? 0), correct: (after?.correct ?? 0) > (before?.correct ?? 0) }
}

export async function handleLive(req: Request, store: LiveStore, opts: LiveOptions = {}): Promise<Response> {
  const now = opts.now ?? Date.now
  const url = new URL(req.url, 'http://localhost')
  const op = url.searchParams.get('op') ?? ''
  const ip = clientIp(req)

  // ------------------------------------------------ the shared deck library
  if (op === 'decks' || op === 'deck-save' || op === 'deck-delete') {
    if (!isAdmin(req, opts)) return json({ error: 'forbidden' }, 403)
    if (op === 'decks') {
      if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
      return json({ decks: await store.decks() }, 200)
    }
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const id = typeof body?.id === 'string' && DECK_ID.test(body.id) ? body.id : null
    if (op === 'deck-delete') {
      if (!id) return json({ error: 'bad_id' }, 400)
      await store.deleteDeck(id)
      return json({ ok: true }, 200)
    }
    const deck = cleanDeck(body?.deck)
    if (!deck) return json({ error: 'bad_deck' }, 400)
    const saved: SavedDeck = { id: id ?? randomId(), deck, updated_at: now(), updated_by: typeof body?.by === 'string' ? body.by.slice(0, 40) : '' }
    await store.saveDeck(saved)
    return json(saved, 200)
  }

  if (req.method === 'GET') {
    const code = cleanCode(url.searchParams.get('code'))
    if (!code) return json({ error: 'bad_code' }, 400)
    const s = await store.get(code)
    // Only 234,256 codes exist: misses are rate-limited per address, so nobody can walk them to find live rooms.
    if (!s) return rateLimited(`live-miss:${ip}`, 40) ? json({ error: 'rate_limited' }, 429) : json({ error: 'not_found' }, 404)
    const slide = s.deck.slides[s.idx]
    const paced = !!s.deck.settings?.paced

    if (op === 'state') {
      const host = await isHost(req, s)
      // The host's URL (h=1) is never answered from, or into, the public cache: a stranger polling it must not be able to
      // park the phones' view where the host's poll will find it.
      if (!host && url.searchParams.has('h')) return json({ error: 'forbidden' }, 403)
      const t = now()
      const showResults = s.show_results || alwaysVisible(slide)
      const clock = clockOf(slide)
      const base: PublicState = {
        code,
        title: s.title,
        phase: s.phase,
        index: s.idx,
        count: s.deck.slides.length,
        // Self-paced rooms never reveal: a prediction's truth or a typed quiz's answer would reach every phone at once.
        slide: host ? slide : publicSlide(slide, s.show_results && !paced),
        accepting: s.accepting && s.phase === 'live',
        showResults: s.show_results,
        timerAt: clock != null && !paced ? (s.timers[slide.id] ?? null) : null,
        timerSeconds: clock != null && !paced ? clock : null,
        serverNow: t,
        participants: await store.participantCount(code),
        qaSlide: qaSlideOf(s.deck),
        settings: s.deck.settings ?? {},
        ...(paced ? { slides: s.deck.slides.map((x) => publicSlide(x, false)) } : {}),
      }
      if (!host) {
        if (showResults) base.results = await resultsFor(store, s, slide)
        return json(base, 200, { ...PUBLIC_CACHE, Vary: HOST_HEADER })
      }
      const since = Number(url.searchParams.get('since')) || t - REACTION_WINDOW_MS
      const hold = !!s.deck.settings?.hold
      const hidden = new Set(s.hidden ?? [])
      // The lobby: names only while a content slide is up (the doors-open screen), so other slides cost no extra read.
      const [results, reactions, names, all, heldQs] = await Promise.all([
        resultsFor(store, s, slide),
        store.reactions(code, Math.max(since, t - REACTION_WINDOW_MS)),
        slide.kind === 'content' ? store.names(code) : Promise.resolve(new Map<string, string>()),
        paced || (hold && (slide.kind === 'open' || slide.kind === 'wordcloud')) ? store.responses(code) : Promise.resolve([] as ResponseRow[]),
        hold && qaSlideOf(s.deck) ? store.heldQuestions(code) : Promise.resolve([] as { id: string; text: string }[]),
      ])
      const answered = ANSWERABLE.has(slide.kind) ? results.total : 0
      const held = [...(hold ? heldEntries(slide, all, hidden) : []), ...heldQs.map((q) => ({ id: `q:${q.id}`, text: q.text }))]
      const progress = paced ? s.deck.slides.map((x) => all.filter((r) => r.slide_id === x.id).length) : undefined
      const out: HostState = { ...base, deck: s.deck, results, answered, reactions, joined: [...names.values()].slice(-40), held, ...(progress ? { progress } : {}) }
      return json(out, 200)
    }

    // Self-paced phones ask for one slide's results (the same for everyone, so cached like state).
    if (op === 'results') {
      const target = s.deck.slides.find((x) => x.id === url.searchParams.get('slide'))
      if (!target || !paced) return json({ error: 'bad_slide' }, 400)
      return json({ results: await resultsFor(store, s, target) }, 200, PUBLIC_CACHE)
    }

    if (op === 'me') {
      const pid = url.searchParams.get('pid') ?? ''
      if (!PID.test(pid)) return json({ error: 'bad_participant' }, 400)
      if (rateLimited(`live-me:${ip}`, 1200)) return json({ error: 'rate_limited' }, 429)
      const [rows, names] = await boardInputs(store, code, now())
      // A quiz still on the clock does not count yet: otherwise a score that moved would tell a throwaway pid which
      // option is right before the reveal.
      const counted = slide.kind === 'quiz' && !s.show_results ? Object.fromEntries(Object.entries(s.timers).filter(([id]) => id !== slide.id)) : s.timers
      const board = scores(s.deck, counted, rows, names)
      const i = board.findIndex((x) => x.participant_id === pid)
      // The last quiz the host has run, so the phone can say "right, +870".
      const lastQuiz = [...s.deck.slides.slice(0, s.idx + 1)].reverse().find((x) => x.kind === 'quiz' && s.timers[x.id] != null)
      const last: MeState['last'] = lastQuiz && (lastQuiz.id !== slide.id || s.show_results) ? lastQuizPoints(s, rows, names, lastQuiz.id, pid) : null
      const me: MeState = { score: i >= 0 ? board[i].score : 0, rank: i >= 0 ? i + 1 : null, of: board.length, streak: i >= 0 ? board[i].streak : 0, last }
      return json(me, 200)
    }

    if (op === 'export') {
      if (!(await isHost(req, s))) return json({ error: 'forbidden' }, 403)
      const [rows, names, people, tally] = await Promise.all([store.responses(code), store.names(code), store.people(code), store.reactionTally(code)])
      const hidden = new Set(s.hidden ?? [])
      const results = await Promise.all(s.deck.slides.map(async (x) => ({ slide: x, results: ANSWERABLE.has(x.kind) || x.kind === 'qa' ? await resultsFor(store, s, x) : null })))
      return json(
        {
          code,
          title: s.title,
          created_at: new Date(s.created_at).toISOString(),
          exported_at: new Date(now()).toISOString(),
          phase: s.phase,
          deck: s.deck,
          results,
          answers: s.deck.slides.map((x) => rows.filter((r) => r.slide_id === x.id).length),
          participants: { total: people.length, names: people.map((p) => p.name) },
          reactions: tally,
          hidden: hidden.size,
          leaderboard: scores(s.deck, s.timers, rows, names).map((x) => ({ name: x.name, score: x.score, correct: x.correct })),
          csv: toCsv(s.deck, rows, names),
        },
        200,
      )
    }
    return json({ error: 'unknown_op' }, 400)
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
    if (!body || typeof body !== 'object') throw new Error()
  } catch {
    return json({ error: 'bad_json' }, 400)
  }

  if (op === 'create') {
    if (!isAdmin(req, opts)) return json({ error: 'forbidden' }, 403)
    if (rateLimited(`live-create:${ip}`, 20)) return json({ error: 'rate_limited' }, 429)
    const deck = cleanDeck(body.deck)
    if (!deck) return json({ error: 'bad_deck' }, 400)
    // A self-paced session has no host clock, so no quizzes or leaderboards.
    if (deck.settings?.paced && deck.slides.some((x) => x.kind === 'quiz' || x.kind === 'leaderboard')) return json({ error: 'paced_quiz' }, 400)
    const hostToken = randomToken()
    const t = now()
    for (let tries = 0; tries < 8; tries++) {
      const code = makeCode()
      const row: SessionRow = { code, title: deck.title, deck, idx: 0, phase: 'live', accepting: !!deck.settings?.paced, show_results: true, timers: {}, hidden: [], host_hash: await hashToken(hostToken), created_at: t }
      Object.assign(row, landOn(row, 0, t))
      if (await store.create(row)) return json({ code, hostToken, deck }, 201)
    }
    return json({ error: 'no_code' }, 503)
  }

  const code = cleanCode(body.code)
  if (!code) return json({ error: 'bad_code' }, 400)
  const s = await store.get(code)
  if (!s) return json({ error: 'not_found' }, 404)
  const t = now()
  const paced = !!s.deck.settings?.paced

  if (op === 'control' || op === 'moderate') {
    if (!(await isHost(req, s))) return json({ error: 'forbidden' }, 403)
    if (op === 'moderate') {
      // An open-text note or a word-cloud word: hide it, bring it back, or approve a held one for the screen.
      if (typeof body.entry === 'string') {
        const id = body.entry.slice(0, 40)
        const set = new Set(s.hidden ?? [])
        if (body.approve === true) set.add(`ok:${id}`)
        else if (body.hidden === false) set.delete(id)
        else set.add(id)
        await store.patch(code, { hidden: [...set].slice(-2000) })
        return json({ ok: true }, 200)
      }
      const q = typeof body.question === 'string' ? body.question : ''
      if (!q) return json({ error: 'bad_question' }, 400)
      const patch: { answered?: boolean; hidden?: boolean; held?: boolean } = {}
      if (typeof body.answered === 'boolean') patch.answered = body.answered
      if (typeof body.hidden === 'boolean') patch.hidden = body.hidden
      if (body.approve === true) patch.held = false
      await store.moderate(code, q, patch)
      return json({ ok: true }, 200)
    }
    const action = body.action
    const current = s.deck.slides[s.idx]
    let patch: Partial<SessionRow>
    if (action === 'goto') {
      const idx = typeof body.index === 'number' ? Math.round(body.index) : Number.NaN
      if (!(idx >= 0 && idx < s.deck.slides.length)) return json({ error: 'bad_index' }, 400)
      patch = landOn(s, idx, t)
    } else if (action === 'accepting') patch = { accepting: body.on === true }
    else if (action === 'results') patch = { show_results: body.on === true, ...(body.on === true && current.kind === 'quiz' ? { accepting: false } : {}) }
    else if (action === 'timer') {
      // (Re)start the current slide's own clock, for a timed slide; a quiz's clock is never restarted.
      if (current.kind === 'quiz' || !current.timer) return json({ error: 'no_timer' }, 400)
      patch = { timers: { ...s.timers, [current.id]: t }, accepting: true }
    } else if (action === 'end') patch = { phase: 'ended', accepting: false }
    else if (action === 'reopen') patch = { phase: 'live', ...(paced ? { accepting: true } : {}) }
    else return json({ error: 'bad_action' }, 400)
    await store.patch(code, patch)
    return json({ ok: true }, 200)
  }

  if (s.phase !== 'live') return json({ error: 'ended' }, 409)
  const pid = typeof body.pid === 'string' ? body.pid : ''
  if (!PID.test(pid)) return json({ error: 'bad_participant' }, 400)

  if (op === 'join') {
    // A whole room can share one venue address, so the per-address ceiling is high; the per-phone one is tight.
    if (rateLimited(`live-join:${ip}`, 2000) || rateLimited(`live-join-p:${code}:${pid}`, 12)) return json({ error: 'rate_limited' }, 429)
    const name = cleanName(body.name)
    if (!name) return json({ error: 'bad_name' }, 400)
    // Names go on the shared screen (the lobby, the podium), so the word filter applies to them in every room.
    if (isFlagged(name)) return json({ error: 'name_flagged' }, 400)
    await store.join(code, pid, name, t)
    return json({ ok: true, name }, 200)
  }

  // Reactions have their own buckets, so a room mashing 👏 can never crowd out its own answers.
  if (op === 'react') {
    if (rateLimited(`live-rx-ip:${ip}`, 12000)) return json({ error: 'rate_limited' }, 429)
  } else if (rateLimited(`live-ip:${ip}`, 12000) || rateLimited(`live-p:${pid}`, 90)) return json({ error: 'rate_limited' }, 429)
  // Every write comes from someone who joined: a made-up pid cannot stuff a poll.
  if (!(await store.isParticipant(code, pid))) return json({ error: 'join_first' }, 401)

  if (op === 'answer') {
    // Self-paced: any answerable slide, in any order. Host-paced: only the slide on the screen.
    const slide = paced ? s.deck.slides.find((x) => x.id === body.slide) : s.deck.slides[s.idx]
    if (!slide || body.slide !== slide.id) return json({ error: 'not_current' }, 409)
    if (!s.accepting) return json({ error: 'closed' }, 409)
    const answer = cleanAnswer(slide, body.answer)
    if (!answer) return json({ error: 'bad_answer' }, 400)
    const clock = paced ? null : clockOf(slide)
    if (clock != null) {
      const start = s.timers[slide.id]
      if (slide.kind === 'quiz' && (start == null || t < start)) return json({ error: 'not_started' }, 409)
      if (start != null && t > start + clock * 1000 + QUIZ_GRACE_MS) return json({ error: 'closed' }, 409)
    }
    const ok = await store.answer(code, slide.id, pid, answer, t, slide.kind === 'quiz')
    return ok ? json({ ok: true }, 200) : json({ error: 'already_answered' }, 409)
  }

  if (op === 'ask') {
    const qa = qaSlideOf(s.deck)
    if (!qa) return json({ error: 'no_qa' }, 409)
    if (rateLimited(`live-ask:${pid}`, 6)) return json({ error: 'rate_limited' }, 429)
    const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, LIMITS.question) : ''
    if (!text) return json({ error: 'bad_text' }, 400)
    const id = randomId()
    const held = !!s.deck.settings?.hold && isFlagged(text)
    await store.ask(code, qa, id, pid, text, t, held)
    return json({ ok: true, id, held }, 200)
  }

  if (op === 'vote') {
    const q = typeof body.question === 'string' ? body.question : ''
    if (!q || !(await store.questionExists(code, q))) return json({ error: 'bad_question' }, 400)
    await store.vote(code, q, pid, body.on !== false)
    return json({ ok: true }, 200)
  }

  if (op === 'react') {
    if (!(REACTIONS as readonly string[]).includes(String(body.emoji))) return json({ error: 'bad_emoji' }, 400)
    if (rateLimited(`live-rx:${pid}`, 40, 10_000)) return json({ error: 'rate_limited' }, 429)
    await store.react(code, randomId(), pid, String(body.emoji), t)
    return json({ ok: true }, 200)
  }

  return json({ error: 'unknown_op' }, 400)
}
