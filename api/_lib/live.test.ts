// npm test — Surprisal Live Kit (api/_lib/live.ts, src/lib/deck.ts). The in-memory store; no network.
import { describe, expect, test } from 'vitest'
import { handleLive, memoryStore, HOST_HEADER, QUIZ_LEAD_MS, type LiveStore } from './live'
import { binValues, cleanDeck, entryId, isFlagged, quizPoints, roomSurprisal, TEMPLATES, type Deck, type HostState, type MeState, type PublicState } from '../../src/lib/deck'

const deck: Deck = {
  title: 'Test',
  slides: [
    { id: 'p', kind: 'poll', title: 'Pick', options: ['A', 'B', 'C'] },
    { id: 'w', kind: 'wordcloud', title: 'Words', entries: 3 },
    { id: 'q', kind: 'quiz', title: 'Quiz', options: ['x', 'y'], correct: 1, seconds: 10 },
    { id: 'a', kind: 'qa', title: 'Ask' },
    { id: 'l', kind: 'leaderboard', title: 'Board', final: true },
  ],
}

function rig(opts: { adminKey?: string; open?: boolean } = { open: true }) {
  const store: LiveStore = memoryStore()
  let clock = 1_000_000
  // The rate limiter is per IP and module-wide, so every rig is its own address.
  const ip = `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  const joined = new Set<string>()
  const call = async (method: 'GET' | 'POST', qs: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> => {
    // Writes need a join (as on a real phone); the tests join a pid the first time it writes, unless it is testing exactly that.
    const b = body as { code?: string; pid?: string } | undefined
    if (method === 'POST' && /op=(answer|ask|vote|react)/.test(qs) && b?.code && b.pid && !joined.has(`${b.code}|${b.pid}`) && !headers['x-no-auto-join']) {
      joined.add(`${b.code}|${b.pid}`)
      await call('POST', 'op=join', { code: b.code, pid: b.pid, name: b.pid.slice(0, 6) })
    }
    if (/op=join/.test(qs) && b?.code && b.pid) joined.add(`${b.code}|${b.pid}`)
    const res = await handleLive(
      new Request(`http://localhost/api/live?${qs}`, { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...headers }, body: body ? JSON.stringify(body) : undefined }),
      store,
      { ...opts, now: () => clock },
    )
    return { status: res.status, body: (await res.json()) as Record<string, unknown>, headers: res.headers }
  }
  return { store, call, tick: (ms: number) => (clock += ms) }
}

async function live(r: ReturnType<typeof rig>) {
  const c = await r.call('POST', 'op=create', { deck })
  expect(c.status).toBe(201)
  const code = c.body.code as string
  const host = { [HOST_HEADER]: c.body.hostToken as string }
  const go = (index: number) => r.call('POST', 'op=control', { code, action: 'goto', index }, host)
  // Every question lands with its results hidden; the host reveals them.
  const reveal = () => r.call('POST', 'op=control', { code, action: 'results', on: true }, host)
  return { code, host, go, reveal }
}

describe('create', () => {
  test('needs the admin key unless open', async () => {
    const r = rig({ adminKey: 'k' })
    expect((await r.call('POST', 'op=create', { deck })).status).toBe(403)
    expect((await r.call('POST', 'op=create', { deck }, { 'x-live-admin-key': 'nope' })).status).toBe(403)
    expect((await r.call('POST', 'op=create', { deck }, { 'x-live-admin-key': 'k' })).status).toBe(201)
  })
  test('refuses a deck with no valid slide', async () => {
    expect((await rig().call('POST', 'op=create', { deck: { slides: [{ kind: 'poll', title: 'one option', options: ['A'] }] } })).status).toBe(400)
  })
  test('every template is a valid deck', () => {
    for (const t of TEMPLATES) expect(cleanDeck(t.deck())?.slides.length).toBe(t.deck().slides.length)
  })
})

describe('a session', () => {
  test('poll: one answer each, latest wins, results aggregated', async () => {
    const r = rig()
    const { code, reveal } = await live(r)
    await r.call('POST', 'op=join', { code, pid: 'aaaaaaaa1', name: 'Ana' })
    await r.call('POST', 'op=join', { code, pid: 'bbbbbbbb2', name: 'Ben' })
    expect((await r.call('POST', 'op=answer', { code, pid: 'aaaaaaaa1', slide: 'p', answer: { choice: 0 } })).status).toBe(200)
    expect((await r.call('POST', 'op=answer', { code, pid: 'aaaaaaaa1', slide: 'p', answer: { choice: 2 } })).status).toBe(200)
    expect((await r.call('POST', 'op=answer', { code, pid: 'bbbbbbbb2', slide: 'p', answer: { choice: 2 } })).status).toBe(200)
    expect((await r.call('POST', 'op=answer', { code, pid: 'bbbbbbbb2', slide: 'p', answer: { choice: 9 } })).status).toBe(400)
    expect((await r.call('POST', 'op=answer', { code, pid: 'bbbbbbbb2', slide: 'w', answer: { words: ['x'] } })).status).toBe(409)
    // Hidden until the host reveals: the phones get no results, the host's screen counts the answers.
    const before = (await r.call('GET', `op=state&code=${code}`)).body as unknown as PublicState
    expect(before.showResults).toBe(false)
    expect(before.results).toBeUndefined()
    await reveal()
    const s = await r.call('GET', `op=state&code=${code}`)
    const st = s.body as unknown as PublicState
    expect(st.participants).toBe(2)
    expect(st.results).toEqual({ kind: 'choice', counts: [0, 0, 2], total: 2 })
    expect(s.headers.get('cache-control')).toContain('s-maxage=1')
  })

  test('word cloud folds case and counts a person once per word', async () => {
    const r = rig()
    const { code, go, reveal } = await live(r)
    await go(1)
    await r.call('POST', 'op=answer', { code, pid: 'aaaaaaaa1', slide: 'w', answer: { words: ['Attention', 'attention', 'agents'] } })
    await r.call('POST', 'op=answer', { code, pid: 'bbbbbbbb2', slide: 'w', answer: { words: ['attention!'] } })
    await reveal()
    const st = (await r.call('GET', `op=state&code=${code}`)).body as unknown as PublicState
    expect(st.results).toEqual({ kind: 'words', words: [{ text: 'Attention', count: 2 }, { text: 'agents', count: 1 }], total: 2 })
  })

  test('quiz: hidden answer, lead-in, one shot, closes at the buzzer, scores by speed', async () => {
    const r = rig()
    const { code, host, go } = await live(r)
    await r.call('POST', 'op=join', { code, pid: 'aaaaaaaa1', name: 'Ana' })
    await r.call('POST', 'op=join', { code, pid: 'bbbbbbbb2', name: 'Ben' })
    await r.call('POST', 'op=join', { code, pid: 'cccccccc3', name: 'Cy' })
    await go(2)
    const pub = (await r.call('GET', `op=state&code=${code}`)).body as unknown as PublicState
    expect(pub.slide.kind === 'quiz' && pub.slide.correct).toBe(-1)
    expect(pub.results).toBeUndefined()
    const ans = (pid: string, choice: number) => r.call('POST', 'op=answer', { code, pid, slide: 'q', answer: { choice } })
    expect((await ans('aaaaaaaa1', 1)).status).toBe(409) // still the "get ready" beat
    r.tick(QUIZ_LEAD_MS)
    expect((await ans('aaaaaaaa1', 1)).status).toBe(200)
    expect((await ans('aaaaaaaa1', 0)).status).toBe(409) // final
    r.tick(5000)
    expect((await ans('bbbbbbbb2', 1)).status).toBe(200)
    r.tick(7000)
    expect((await ans('cccccccc3', 1)).status).toBe(409) // after 10 s + grace
    await r.call('POST', 'op=control', { code, action: 'results', on: true }, host)
    const revealed = (await r.call('GET', `op=state&code=${code}`)).body as unknown as PublicState
    expect(revealed.slide.kind === 'quiz' && revealed.slide.correct).toBe(1)
    const me = (await r.call('GET', `op=me&code=${code}&pid=bbbbbbbb2`)).body as unknown as MeState
    expect(me).toEqual({ score: 750, rank: 2, of: 3, streak: 1, last: { correct: true, points: 750 } })
    await go(4)
    const board = (await r.call('GET', `op=state&code=${code}`)).body as unknown as PublicState
    expect(board.results).toEqual({ kind: 'board', board: [{ name: 'Ana', score: 1000 }, { name: 'Ben', score: 750 }, { name: 'Cy', score: 0 }], total: 3 })
    // Going back to a quiz shows its answer; it does not rerun.
    await go(2)
    const back = (await r.call('GET', `op=state&code=${code}`, undefined, host)).body as unknown as HostState
    expect(back.accepting).toBe(false)
    expect(back.showResults).toBe(true)
  })

  test('Q&A: ask any time, vote once, host hides', async () => {
    const r = rig()
    const { code, host, go } = await live(r)
    const ask = await r.call('POST', 'op=ask', { code, pid: 'aaaaaaaa1', text: '  Why   agents? ' })
    expect(ask.status).toBe(200)
    const qid = ask.body.id as string
    await r.call('POST', 'op=ask', { code, pid: 'bbbbbbbb2', text: 'Second' })
    await r.call('POST', 'op=vote', { code, pid: 'bbbbbbbb2', question: qid, on: true })
    await r.call('POST', 'op=vote', { code, pid: 'bbbbbbbb2', question: qid, on: true })
    await go(3)
    let st = (await r.call('GET', `op=state&code=${code}`)).body as unknown as PublicState
    expect(st.results?.kind === 'qa' && st.results.questions.map((q) => [q.text, q.votes])).toEqual([['Why agents?', 1], ['Second', 0]])
    await r.call('POST', 'op=moderate', { code, question: qid, hidden: true }, host)
    st = (await r.call('GET', `op=state&code=${code}`)).body as unknown as PublicState
    expect(st.results?.total).toBe(1)
  })

  test('host-only controls and the end', async () => {
    const r = rig()
    const { code, host } = await live(r)
    expect((await r.call('POST', 'op=control', { code, action: 'goto', index: 1 })).status).toBe(403)
    expect((await r.call('GET', `op=export&code=${code}`)).status).toBe(403)
    expect((await r.call('POST', 'op=react', { code, pid: 'aaaaaaaa1', emoji: '👏' })).status).toBe(200)
    expect((await r.call('POST', 'op=react', { code, pid: 'aaaaaaaa1', emoji: '💩' })).status).toBe(400)
    const hs = (await r.call('GET', `op=state&code=${code}`, undefined, host)).body as unknown as HostState
    expect(hs.reactions.map((x) => x.emoji)).toEqual(['👏'])
    expect(hs.deck.slides.length).toBe(5)
    await r.call('POST', 'op=control', { code, action: 'end' }, host)
    expect((await r.call('POST', 'op=answer', { code, pid: 'aaaaaaaa1', slide: 'p', answer: { choice: 0 } })).status).toBe(409)
    const ex = await r.call('GET', `op=export&code=${code}`, undefined, host)
    expect(ex.status).toBe(200)
    expect(String(ex.body.csv).split('\n')[0]).toBe('slide,kind,question,participant,answer,at')
  })
})

test('Kahoot points', () => {
  expect(quizPoints(true, 0, 20)).toBe(1000)
  expect(quizPoints(true, 20_000, 20)).toBe(500)
  expect(quizPoints(true, 99_000, 20)).toBe(500)
  expect(quizPoints(false, 0, 20)).toBe(0)
})

const deck2: Deck = {
  title: 'Shapes',
  slides: [
    { id: 'm0', kind: 'poll', title: 'Before', options: ['A', 'B', 'C'], multi: 2 },
    { id: 'm1', kind: 'poll', title: 'After', options: ['A', 'B', 'C'], multi: 2, compare: 'm0' },
    { id: 'r', kind: 'rank', title: 'Rank', options: ['x', 'y', 'z'] },
    { id: 'pt', kind: 'points', title: 'Points', options: ['x', 'y'] },
    { id: 'n', kind: 'number', title: 'Guess', min: 0, max: 100, unit: 'h', answer: 42 },
    { id: 'g', kind: 'grid', title: 'Where', xLow: 'l', xHigh: 'h', yLow: 'l', yHigh: 'h' },
    { id: 'o', kind: 'open', title: 'Say' },
    { id: 'w', kind: 'wordcloud', title: 'Words', entries: 2 },
    { id: 'a0', kind: 'scale', mode: 'agree', title: 'Claim', max: 5, minLabel: '', maxLabel: '' },
  ],
}

describe('the other slide types', () => {
  async function room() {
    const r = rig()
    const c = await r.call('POST', 'op=create', { deck: deck2 })
    const code = c.body.code as string
    const host = { [HOST_HEADER]: c.body.hostToken as string }
    const go = (index: number) => r.call('POST', 'op=control', { code, action: 'goto', index }, host)
    const ans = (pid: string, slide: string, answer: unknown) => r.call('POST', 'op=answer', { code, pid, slide, answer })
    const state = async (h = false) => (await r.call('GET', `op=state&code=${code}`, undefined, h ? host : {})).body as unknown as HostState
    const reveal = () => r.call('POST', 'op=control', { code, action: 'results', on: true }, host)
    return { r, code, host, go, ans, state, reveal }
  }

  test('multi-select counts people, caps picks, and compares with the earlier poll', async () => {
    const { go, ans, state, reveal } = await room()
    expect((await ans('aaaaaaaa1', 'm0', { choices: [0, 1, 2] })).status).toBe(400)
    await ans('aaaaaaaa1', 'm0', { choices: [0, 1] })
    await ans('bbbbbbbb2', 'm0', { choices: [0] })
    await go(1)
    await ans('aaaaaaaa1', 'm1', { choices: [2, 2, 1] })
    await ans('bbbbbbbb2', 'm1', { choices: [2] })
    await reveal()
    const st = await state()
    expect(st.results).toEqual({ kind: 'choice', counts: [0, 1, 2], total: 2, previous: { kind: 'choice', counts: [2, 1, 0], total: 2 } })
  })

  test('rank: a full order each, Borda scores and average places', async () => {
    const { go, ans, state, reveal } = await room()
    await go(2)
    expect((await ans('aaaaaaaa1', 'r', { order: [0, 0, 1] })).status).toBe(400)
    await ans('aaaaaaaa1', 'r', { order: [2, 0, 1] })
    await ans('bbbbbbbb2', 'r', { order: [2, 1, 0] })
    await reveal()
    expect((await state()).results).toEqual({ kind: 'rank', scores: [1, 1, 4], avg: [2.5, 2.5, 1], firsts: [0, 0, 2], total: 2 })
  })

  test('points: within the budget, totals', async () => {
    const { go, ans, state, reveal } = await room()
    await go(3)
    expect((await ans('aaaaaaaa1', 'pt', { points: [80, 30] })).status).toBe(400)
    expect((await ans('aaaaaaaa1', 'pt', { points: [0, 0] })).status).toBe(400)
    await ans('aaaaaaaa1', 'pt', { points: [70, 30] })
    await ans('bbbbbbbb2', 'pt', { points: [10, 40] })
    await reveal()
    expect((await state()).results).toEqual({ kind: 'points', totals: [80, 70], total: 2 })
  })

  test('prediction: lands hidden, the truth stays off phones until the reveal', async () => {
    const { r, code, host, go, ans, state } = await room()
    await go(4)
    let st = await state()
    expect(st.showResults).toBe(false)
    expect(st.results).toBeUndefined()
    expect('answer' in st.slide).toBe(false)
    expect((await ans('aaaaaaaa1', 'n', { number: 101 })).status).toBe(400)
    await ans('aaaaaaaa1', 'n', { number: 40 })
    await ans('bbbbbbbb2', 'n', { number: 10 })
    await ans('cccccccc3', 'n', { number: 50 })
    await r.call('POST', 'op=control', { code, action: 'results', on: true }, host)
    st = await state()
    expect(st.slide.kind === 'number' && st.slide.answer).toBe(42)
    expect(st.results).toEqual({ kind: 'number', values: [10, 40, 50], total: 3, median: 40, mean: 33.3 })
  })

  test('2×2: points and the room average', async () => {
    const { go, ans, state, reveal } = await room()
    await go(5)
    expect((await ans('aaaaaaaa1', 'g', { x: 120, y: 3 })).status).toBe(400)
    await ans('aaaaaaaa1', 'g', { x: 20, y: 80 })
    await ans('bbbbbbbb2', 'g', { x: 60.4, y: 40 })
    // The host's screen has the results before the reveal; the phones do not.
    expect((await state()).results).toBeUndefined()
    expect((await state(true)).results?.total).toBe(2)
    await reveal()
    expect((await state()).results).toEqual({ kind: 'grid', points: [{ x: 20, y: 80 }, { x: 60, y: 40 }], total: 2, mean: { x: 40, y: 60 } })
  })

  test('the host hides an open answer and a word', async () => {
    const { r, code, host, go, ans, state, reveal } = await room()
    await go(6)
    await ans('aaaaaaaa1', 'o', { text: 'keep' })
    await ans('bbbbbbbb2', 'o', { text: 'rude' })
    expect((await r.call('POST', 'op=moderate', { code, entry: entryId('o', 'bbbbbbbb2') })).status).toBe(403)
    await r.call('POST', 'op=moderate', { code, entry: entryId('o', 'bbbbbbbb2') }, host)
    await reveal()
    let st = await state()
    expect(st.results?.kind === 'open' && st.results.entries.map((e) => e.text)).toEqual(['keep'])
    await go(7)
    await ans('aaaaaaaa1', 'w', { words: ['Nice', 'rude'] })
    await r.call('POST', 'op=moderate', { code, entry: 'w:rude' }, host)
    await reveal()
    st = await state()
    expect(st.results?.kind === 'words' && st.results.words.map((w) => w.text)).toEqual(['Nice'])
  })

  test('the lobby lists names on a content slide only', async () => {
    const r = rig()
    const { code, host } = await live(r)
    await r.call('POST', 'op=join', { code, pid: 'aaaaaaaa1', name: 'Ana' })
    const st = (await r.call('GET', `op=state&code=${code}`, undefined, host)).body as unknown as HostState
    expect(st.joined).toEqual([]) // deck's first slide is a poll
    const c = await r.call('POST', 'op=create', { deck: { title: 't', slides: [{ kind: 'content', title: 'Hi' }] } })
    await r.call('POST', 'op=join', { code: c.body.code, pid: 'aaaaaaaa1', name: 'Ana' })
    const st2 = (await r.call('GET', `op=state&code=${c.body.code}`, undefined, { [HOST_HEADER]: c.body.hostToken as string })).body as unknown as HostState
    expect(st2.joined).toEqual(['Ana'])
  })
})

describe('deck rules', () => {
  test('a comparison must point at an earlier slide of the same shape', () => {
    const d = cleanDeck({
      slides: [
        { id: 'a', kind: 'poll', title: 'q', options: ['1', '2'] },
        { id: 'b', kind: 'poll', title: 'q', options: ['1', '2', '3'], compare: 'a' },
        { id: 'c', kind: 'poll', title: 'q', options: ['1', '2'], compare: 'a' },
        { id: 'd', kind: 'poll', title: 'q', options: ['1', '2'], compare: 'e' },
        { id: 'e', kind: 'poll', title: 'q', options: ['1', '2'] },
      ],
    })!
    expect(d.slides.map((s) => (s.kind === 'poll' ? s.compare ?? null : null))).toEqual([null, null, 'a', null, null])
  })
  test('a donut is single-choice only; agree scales are five steps', () => {
    const d = cleanDeck({
      slides: [
        { kind: 'poll', title: 'q', options: ['1', '2'], multi: 2, chart: 'donut' },
        { kind: 'scale', mode: 'agree', title: 's', max: 10 },
      ],
    })!
    expect(d.slides[0].kind === 'poll' && d.slides[0].chart).toBeUndefined()
    expect(d.slides[1].kind === 'scale' && [d.slides[1].max, d.slides[1].minLabel]).toEqual([5, 'Strongly disagree'])
  })
})

describe('prediction maths', () => {
  test('bins are round and cover the slide range', () => {
    const b = binValues([0, 5, 5, 99, 100], 0, 100, 10)
    expect(b.length).toBe(10)
    expect([b[0].from, b[0].to, b[9].to]).toEqual([0, 10, 100])
    expect(b[0].count).toBe(3)
    expect(b[9].count).toBe(2)
  })
  test('surprisal is low when the room guessed the truth, high when nobody did', () => {
    const bins = binValues([41, 42, 43, 44, 10], 0, 100, 10)
    const near = roomSurprisal(bins, 45)!
    const far = roomSurprisal(bins, 95)!
    expect(near).toBe(1.2) // 4 of 5 guesses in its bin: −log₂((4 + ½) / (5 + 10 × ½))
    expect(far).toBe(4.3) // none: −log₂(½ / 10)
  })
})

describe('round three', () => {
  const H = (tok: string) => ({ [HOST_HEADER]: tok })

  test('the deck library is admin only, saves, lists and deletes', async () => {
    const r = rig({ adminKey: 'k' })
    expect((await r.call('GET', 'op=decks')).status).toBe(403)
    const key = { 'x-live-admin-key': 'k' }
    const saved = await r.call('POST', 'op=deck-save', { deck, by: 'Ana' }, key)
    expect(saved.status).toBe(200)
    const id = saved.body.id as string
    await r.call('POST', 'op=deck-save', { id, deck: { ...deck, title: 'Renamed' } }, key)
    let list = (await r.call('GET', 'op=decks', undefined, key)).body.decks as { id: string; deck: Deck }[]
    expect(list.map((d) => [d.id, d.deck.title])).toEqual([[id, 'Renamed']])
    await r.call('POST', 'op=deck-delete', { id }, key)
    list = (await r.call('GET', 'op=decks', undefined, key)).body.decks as { id: string; deck: Deck }[]
    expect(list).toEqual([])
  })

  test('a members-only setting from an older deck is dropped: anyone with the code joins', async () => {
    const r = rig()
    const c = await r.call('POST', 'op=create', { deck: { ...deck, settings: { membersOnly: true, hold: true } } })
    const code = c.body.code as string
    expect((c.body.deck as Deck).settings).toEqual({ hold: true })
    expect((await r.call('POST', 'op=join', { code, pid: 'aaaaaaaa1', name: 'Ana' })).status).toBe(200)
    expect((await r.call('POST', 'op=answer', { code, pid: 'aaaaaaaa1', slide: 'p', answer: { choice: 0 } })).status).toBe(200)
    expect((await r.store.people(code))[0]).toEqual({ id: 'aaaaaaaa1', name: 'Ana' })
  })

  test('a timed slide closes at its clock, and the host can restart it', async () => {
    const r = rig()
    const c = await r.call('POST', 'op=create', { deck: { title: 't', slides: [{ id: 'w', kind: 'wordcloud', title: 'Go', entries: 1, timer: 10 }] } })
    const code = c.body.code as string
    const st = (await r.call('GET', `op=state&code=${code}`)).body as unknown as PublicState
    expect([st.timerSeconds, st.timerAt != null]).toEqual([10, true])
    r.tick(5000)
    expect((await r.call('POST', 'op=answer', { code, pid: 'aaaaaaaa1', slide: 'w', answer: { words: ['a'] } })).status).toBe(200)
    r.tick(7000)
    expect((await r.call('POST', 'op=answer', { code, pid: 'bbbbbbbb2', slide: 'w', answer: { words: ['b'] } })).status).toBe(409)
    await r.call('POST', 'op=control', { code, action: 'timer' }, H(c.body.hostToken as string))
    expect((await r.call('POST', 'op=answer', { code, pid: 'bbbbbbbb2', slide: 'w', answer: { words: ['b'] } })).status).toBe(200)
  })

  test('typed quiz: forgiving matching, results, and the streak bonus', async () => {
    const r = rig()
    const c = await r.call('POST', 'op=create', {
      deck: {
        title: 'q',
        slides: [
          { id: 'q1', kind: 'quiz', title: 'One', options: ['a', 'b'], correct: 0, seconds: 10 },
          { id: 'q2', kind: 'quiz', title: 'Capital of Sweden?', typed: ['Stockholm'], seconds: 10 },
        ],
      },
    })
    const code = c.body.code as string
    const host = H(c.body.hostToken as string)
    for (const pid of ['aaaaaaaa1', 'bbbbbbbb2']) await r.call('POST', 'op=join', { code, pid, name: pid.slice(0, 3) })
    r.tick(QUIZ_LEAD_MS)
    await r.call('POST', 'op=answer', { code, pid: 'aaaaaaaa1', slide: 'q1', answer: { choice: 0 } })
    await r.call('POST', 'op=answer', { code, pid: 'bbbbbbbb2', slide: 'q1', answer: { choice: 1 } })
    await r.call('POST', 'op=control', { code, action: 'goto', index: 1 }, host)
    const pub = (await r.call('GET', `op=state&code=${code}`)).body as unknown as PublicState
    expect(pub.slide.kind === 'quiz' && pub.slide.typed).toEqual([]) // the answer never reaches phones early
    r.tick(QUIZ_LEAD_MS)
    await r.call('POST', 'op=answer', { code, pid: 'aaaaaaaa1', slide: 'q2', answer: { text: ' stockholm! ' } })
    await r.call('POST', 'op=answer', { code, pid: 'bbbbbbbb2', slide: 'q2', answer: { text: 'Stokholm' } })
    await r.call('POST', 'op=control', { code, action: 'results', on: true }, host)
    const st = (await r.call('GET', `op=state&code=${code}`)).body as unknown as PublicState
    expect(st.results?.kind === 'typed' && [st.results.correct, st.results.total]).toEqual([2, 2])
    const a = (await r.call('GET', `op=me&code=${code}&pid=aaaaaaaa1`)).body as unknown as MeState
    // Two right answers at 0 s: 1000 + (1000 + 100 streak).
    expect([a.score, a.streak, a.last]).toEqual([2100, 2, { points: 1100, correct: true }])
  })

  test('self-paced: phones answer any slide, see every slide, no quizzes allowed', async () => {
    const r = rig()
    expect((await r.call('POST', 'op=create', { deck: { ...deck, settings: { paced: true } } })).body.error).toBe('paced_quiz')
    const c = await r.call('POST', 'op=create', {
      deck: { title: 'Survey', settings: { paced: true }, slides: [{ id: 'a', kind: 'poll', title: 'A', options: ['x', 'y'], notes: 'secret' }, { id: 'b', kind: 'open', title: 'B' }] },
    })
    const code = c.body.code as string
    const st = (await r.call('GET', `op=state&code=${code}`)).body as unknown as PublicState
    expect(st.slides?.map((x) => x.id)).toEqual(['a', 'b'])
    expect(st.slides?.[0].notes).toBeUndefined()
    expect((await r.call('POST', 'op=answer', { code, pid: 'aaaaaaaa1', slide: 'b', answer: { text: 'hi' } })).status).toBe(200)
    expect((await r.call('POST', 'op=answer', { code, pid: 'aaaaaaaa1', slide: 'a', answer: { choice: 1 } })).status).toBe(200)
    const res = await r.call('GET', `op=results&code=${code}&slide=b`)
    expect((res.body.results as { total: number }).total).toBe(1)
    const hs = (await r.call('GET', `op=state&code=${code}`, undefined, H(c.body.hostToken as string))).body as unknown as HostState
    expect(hs.progress).toEqual([1, 1])
    expect(hs.slide.notes).toBe('secret')
  })

  test('hold: flagged answers wait for the host, then reach the screen when approved', async () => {
    const r = rig()
    const c = await r.call('POST', 'op=create', {
      deck: { title: 't', settings: { hold: true }, slides: [{ id: 'o', kind: 'open', title: 'Say' }, { id: 'q', kind: 'qa', title: 'Ask' }] },
    })
    const code = c.body.code as string
    const host = H(c.body.hostToken as string)
    await r.call('POST', 'op=answer', { code, pid: 'aaaaaaaa1', slide: 'o', answer: { text: 'what the FUCK' } })
    await r.call('POST', 'op=answer', { code, pid: 'bbbbbbbb2', slide: 'o', answer: { text: 'lovely' } })
    const ask = await r.call('POST', 'op=ask', { code, pid: 'aaaaaaaa1', text: 'shit question' })
    expect(ask.body).toMatchObject({ ok: true, held: true })
    let hs = (await r.call('GET', `op=state&code=${code}`, undefined, host)).body as unknown as HostState
    expect(hs.results.kind === 'open' && hs.results.entries.map((e) => e.text)).toEqual(['lovely'])
    expect(hs.held.map((h) => h.text).sort()).toEqual(['shit question', 'what the FUCK'])
    await r.call('POST', 'op=moderate', { code, entry: hs.held.find((h) => h.text === 'what the FUCK')!.id, approve: true }, host)
    await r.call('POST', 'op=moderate', { code, question: (ask.body.id as string), approve: true }, host)
    hs = (await r.call('GET', `op=state&code=${code}`, undefined, host)).body as unknown as HostState
    expect(hs.results.kind === 'open' && hs.results.entries.length).toBe(2)
    expect(hs.held).toEqual([])
  })
})

describe('the security review (23 Oct)', () => {
  test('a score never moves before the reveal, so a throwaway pid learns nothing', async () => {
    const r = rig()
    const c = await r.call('POST', 'op=create', { deck: { title: 'q', slides: [{ id: 'q', kind: 'quiz', title: 'Q', options: ['a', 'b'], correct: 1, seconds: 10 }] } })
    const code = c.body.code as string
    r.tick(QUIZ_LEAD_MS)
    await r.call('POST', 'op=answer', { code, pid: 'probe0001', slide: 'q', answer: { choice: 1 } })
    const me = (await r.call('GET', `op=me&code=${code}&pid=probe0001`)).body as unknown as MeState
    expect(me.score).toBe(0)
    await r.call('POST', 'op=control', { code, action: 'results', on: true }, { [HOST_HEADER]: c.body.hostToken as string })
    expect(((await r.call('GET', `op=me&code=${code}&pid=probe0001`)).body as unknown as MeState).score).toBe(1000)
  })

  test('the host URL is never served the public view, and the public view varies on the host header', async () => {
    const r = rig()
    const { code } = await live(r)
    const stranger = await r.call('GET', `op=state&code=${code}&h=1`)
    expect(stranger.status).toBe(403)
    expect(stranger.headers.get('cache-control')).toContain('no-store')
    expect((await r.call('GET', `op=state&code=${code}`)).headers.get('vary')).toBe(HOST_HEADER)
  })

  test('a self-paced room never sends a prediction’s truth to phones', async () => {
    const r = rig()
    const c = await r.call('POST', 'op=create', { deck: { title: 's', settings: { paced: true }, slides: [{ id: 'n', kind: 'number', title: 'Guess', min: 0, max: 10, answer: 6 }] } })
    const st = (await r.call('GET', `op=state&code=${c.body.code}`)).body as unknown as PublicState
    expect('answer' in st.slide).toBe(false)
    expect(st.slides?.some((x) => 'answer' in x)).toBe(false)
  })

  test('walking the codes is rate-limited', async () => {
    const r = rig()
    let last = 0
    for (let i = 0; i < 45; i++) last = (await r.call('GET', `op=state&code=ZZZZ`)).status
    expect(last).toBe(429)
  })

  test('names go through the word filter; writes need a join', async () => {
    const r = rig()
    const { code } = await live(r)
    expect((await r.call('POST', 'op=join', { code, pid: 'rude00001', name: 'Fuck Face' })).body.error).toBe('name_flagged')
    const forged = await r.call('POST', 'op=answer', { code, pid: 'forged001', slide: 'p', answer: { choice: 0 } }, { 'x-no-auto-join': '1' })
    expect(forged.body.error).toBe('join_first')
  })
})

test('the word filter: whole words, letter swaps only inside real words', () => {
  expect(['shit', 'Sh1t!', 'what the FUCK', 'jävla', 'porra'].map(isFlagged)).toEqual([true, true, true, true, true])
  expect(['P155', '1337', 'Scunthorpe', 'class assignment', 'Dick Fosbury'.slice(5)].map(isFlagged)).toEqual([false, false, false, false, false])
})
