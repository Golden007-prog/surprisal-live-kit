// npm run demo — a room with every slide type, played through by 32 made-up people, then parked on slide 1.
// Step through it with the arrow keys to see each slide type with real-looking results.
//
// Start `npm run dev` first, then in a second terminal: npm run demo
// Against a deployed app: LIVE_URL=https://your-app.vercel.app LIVE_ADMIN_KEY=… npm run demo
//
// It prints the presenter link. That link holds the room's host key, so do not post it anywhere.
// scripts/screenshots.mjs uses the same room to make the README images.
import { pathToFileURL } from 'node:url'

// A seeded stream, so a rerun makes the same room.
let seed = 20261028
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
const weighted = (w) => {
  let r = rnd() * w.reduce((a, b) => a + b, 0)
  for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i
  return w.length - 1
}
const shuffle = (a) => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const gauss = () => {
  let u = 0
  for (let i = 0; i < 6; i++) u += rnd()
  return u - 3
}

const AGREE = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree']
const READY = ['Not at all', 'A little', 'Fairly', 'Very']

export const DEMO_DECK = {
  title: 'Demo: every slide type',
  slides: [
    { id: 'doors', kind: 'content', eyebrow: 'Demo deck', title: 'Every slide type, with made-up answers.', body: 'Join on your phone with the code in the corner.',
      notes: 'Content slide, used for doors open. The names of everyone who joins fall onto the pile.' },
    { id: 'coffee', kind: 'poll', title: 'What’s your coffee order?', options: ['Black', 'Flat white', 'Oat latte', 'Tea, actually', 'No caffeine'],
      notes: 'Poll as bars, the leader in the accent colour.' },
    { id: 'ready1', kind: 'poll', title: 'How ready do you feel for the launch?', options: READY, notes: 'Slide 18 asks it again and compares.' },
    { id: 'day', kind: 'poll', chart: 'columns', title: 'Which day is best for a team meeting?', options: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], notes: 'Poll as columns.' },
    { id: 'where', kind: 'poll', chart: 'donut', title: 'Where do you work most days?', options: ['At home', 'In the office', 'A bit of both'], notes: 'Poll as a donut.' },
    { id: 'tools', kind: 'poll', multi: 5, title: 'Which tools do you open every day?', options: ['Slack', 'Notion', 'Figma', 'GitHub', 'None of these'],
      notes: 'Multi-select: bars are a share of people, not of votes.' },
    { id: 'claim1', kind: 'scale', mode: 'agree', max: 5, minLabel: AGREE[0], maxLabel: AGREE[4], title: 'Meetings should be 25 minutes, not 30.',
      notes: 'Agree / disagree: one diverging bar. Slide 19 asks it again.' },
    { id: 'week', kind: 'scale', max: 5, minLabel: 'Rough', maxLabel: 'Great', title: 'How was your week?', notes: 'Rating 1 to 5.' },
    { id: 'useful', kind: 'scale', max: 10, minLabel: 'Not at all', maxLabel: 'Very', title: 'How useful was today?', notes: 'Rating 1 to 10.' },
    { id: 'fix', kind: 'rank', title: 'Rank what we should fix first', options: ['Onboarding', 'Search', 'The mobile app', 'The docs'],
      notes: 'Ranking: the room’s order, the average place and how many put it first.' },
    { id: 'points', kind: 'points', title: 'Spend 100 points on next quarter', options: ['Speed', 'New features', 'Design polish', 'Tests', 'Docs'],
      notes: '100 points: totals and shares, best first.' },
    { id: 'guess', kind: 'number', min: 0, max: 40, unit: 'h', answer: 11, title: 'How many hours of meetings did the average person here have last week?',
      notes: 'Prediction: guesses stay hidden until you reveal the truth (11 h) and the median.' },
    { id: 'grid', kind: 'grid', title: 'Where is your team right now?', xLow: 'Slow', xHigh: 'Fast', yLow: 'Unclear', yHigh: 'Clear',
      quadrants: ['Clear, but slow', 'Clear and fast', 'Slow and unclear', 'Fast, but unclear'], notes: '2×2: every answer a dot, the average a diamond.' },
    { id: 'cloud', kind: 'wordcloud', entries: 3, title: 'In one to three words: what should we keep doing?', notes: 'Word cloud: size by count.' },
    { id: 'better', kind: 'open', title: 'What would make next month better?', notes: 'Open text: a wall of notes. Spotlight one, or hide one.' },
    { id: 'qa', kind: 'qa', title: 'Your questions', notes: 'Q&A: ranked by votes. One is marked answered.' },
    { id: 'quiz1', kind: 'quiz', seconds: 20, correct: 0, title: 'Which planet has the most known moons?', options: ['Saturn', 'Jupiter', 'Uranus', 'Neptune'],
      notes: 'Quiz: faster right answers score more (up to 1000).' },
    { id: 'ready2', kind: 'poll', compare: 'ready1', title: 'After the demo: how ready do you feel?', options: READY, notes: 'Compared with slide 3.' },
    { id: 'claim2', kind: 'scale', mode: 'agree', max: 5, minLabel: AGREE[0], maxLabel: AGREE[4], compare: 'claim1', title: 'After the talk: meetings should be 25 minutes.',
      notes: 'Agree / disagree, compared with slide 7.' },
    { id: 'quiz2', kind: 'quiz', seconds: 15, correct: 0, title: 'What does the S in HTTPS stand for?', options: ['Secure', 'Simple', 'Server', 'Socket'], notes: 'Quiz, 15 s.' },
    { id: 'board', kind: 'leaderboard', title: 'Leaderboard', notes: 'Leaderboard after two quizzes.' },
    { id: 'typed', kind: 'quiz', seconds: 20, typed: ['Vincent van Gogh', 'Van Gogh'], title: 'Who painted The Starry Night?',
      notes: 'Typed quiz: case, accents and one typo are forgiven, so "Van Gough" counts.' },
    { id: 'podium', kind: 'leaderboard', final: true, title: 'Final scores', notes: 'The last leaderboard shows the podium.' },
    { id: 'last', kind: 'content', eyebrow: 'Thank you', title: 'That’s all for today.' },
  ],
}

const NAMES = ['Ana', 'Björn', 'Chloé', 'Dev', 'Elif', 'Farah', 'Gustav', 'Hana', 'Ivo', 'Jonas', 'Kenji', 'Lea', 'Malin', 'Nils', 'Olu', 'Priya',
  'Rasmus', 'Sara', 'Tomás', 'Uma', 'Viktor', 'Wen', 'Yara', 'Zoe', 'Amir', 'Bea', 'Carlos', 'Dina', 'Emil', 'Frida', 'Gabe', 'Ines']
const WORDS = [['demos', 9], ['pairing', 6], ['offsites', 5], ['async updates', 5], ['retros', 4], ['team lunch', 4], ['shipping small', 3],
  ['code review', 3], ['hack days', 3], ['coffee chats', 3], ['writing docs', 2], ['standups', 2], ['kindness', 2], ['saying no', 2], ['walks', 1], ['tea', 1]]
const BETTER = ['Fewer meetings on Mondays', 'A demo day at the end of the month', 'Clear owners for each project', 'More time to write things down',
  'One no-meeting day a week', 'Lunch together on Fridays', 'Shorter standups', 'A proper launch checklist', 'Pairing with the design team',
  'Less Slack, more docs', 'Celebrate the small wins', 'A quiet room in the office']
const QUESTIONS = ['When is the launch date?', 'Will the slides be shared afterwards?', 'How do we pick what to fix first?', 'Can we do this every month?',
  'Who owns the mobile app now?', 'What happened to the hack day?', 'Is there budget for the offsite?']

export const PEOPLE = NAMES.map((name, i) => ({ name, pid: `demo${String(i + 1).padStart(2, '0')}x${(20261028 + i * 7919).toString(36)}`.slice(0, 20), skill: rnd() }))

/** One demo room on a running app. `base` is the app's address, for example http://localhost:5173. */
export function demoRoom(base, adminKey = '') {
  const api = `${base.replace(/\/$/, '')}/api/live`
  const problems = []
  let code = ''
  let hostToken = ''
  const call = async (method, qs, body, headers = {}) => {
    const r = await fetch(`${api}?${qs}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined })
    let j = null
    try {
      j = await r.json()
    } catch {
      /* no body */
    }
    return { s: r.status, j }
  }
  const expect = (label, res) => {
    if (res.s !== 200) problems.push(`${label}: ${res.s} ${res.j?.error ?? ''}`)
    return res
  }
  const control = async (body) => expect(`control ${body.action}`, await call('POST', 'op=control', { code, ...body }, { 'x-live-host': hostToken }))
  const answer = async (p, slide, a) => expect(`${slide} ${p.name}`, await call('POST', 'op=answer', { code, pid: p.pid, slide, answer: a }))
  const some = (share) => PEOPLE.filter(() => rnd() < share)

  async function create(deck = DEMO_DECK) {
    const c = await call('POST', 'op=create', { deck }, adminKey ? { 'x-live-admin-key': adminKey } : {})
    if (c.s !== 201) throw new Error(`create failed: ${c.s} ${c.j?.error ?? ''}`)
    code = c.j.code
    hostToken = c.j.hostToken
    return { code, hostToken }
  }

  const join = async (p) => expect(`join ${p.name}`, await call('POST', 'op=join', { code, pid: p.pid, name: p.name }))
  const react = async (p, emoji) => call('POST', 'op=react', { code, pid: p.pid, emoji })

  /** Every answer a slide gets in the demo. A quiz waits for its 3-2-1 lead-in, then answers across the clock. */
  async function fill(slide) {
    const id = slide.id
    const all = (share, pick) => Promise.all(some(share).map((p) => answer(p, id, pick(p))))
    switch (id) {
      case 'coffee': return all(0.94, () => ({ choice: weighted([5, 11, 8, 6, 2]) }))
      case 'ready1': return all(0.9, () => ({ choice: weighted([4, 10, 9, 4]) }))
      case 'ready2': return all(0.88, () => ({ choice: weighted([1, 5, 12, 10]) }))
      case 'day': return all(0.9, () => ({ choice: weighted([2, 9, 7, 8, 3]) }))
      case 'where': return all(0.92, () => ({ choice: weighted([9, 6, 14]) }))
      case 'tools': return all(0.9, () => {
        const picks = [0, 1, 2, 3].filter((k) => rnd() < [0.8, 0.5, 0.35, 0.45][k])
        return { choices: picks.length ? picks : [4] }
      })
      case 'claim1': return all(0.93, () => ({ value: 1 + weighted([3, 6, 7, 10, 5]) }))
      case 'claim2': return all(0.88, () => ({ value: 1 + weighted([2, 3, 5, 12, 8]) }))
      case 'week': return all(0.9, () => ({ value: 1 + weighted([1, 4, 9, 11, 5]) }))
      case 'useful': return all(0.85, () => ({ value: 1 + weighted([0, 0, 1, 1, 2, 3, 6, 9, 6, 3]) }))
      case 'fix': return all(0.86, () => ({ order: [3.2, 2.4, 2.9, 1.2].map((w, k) => ({ k, s: w + gauss() * 1.4 })).sort((a, b) => b.s - a.s).map((x) => x.k) }))
      case 'points': return all(0.82, () => {
        const raw = [3, 4, 2.5, 1.5, 2].map((w) => Math.max(0, w + gauss() * 1.6))
        const sum = raw.reduce((a, b) => a + b, 0) || 1
        const pts = raw.map((v) => Math.floor((v / sum) * 100))
        return { points: pts.every((x) => x === 0) ? [100, 0, 0, 0, 0] : pts }
      })
      case 'guess': return all(0.9, () => ({ number: Math.min(40, Math.max(0, Math.round(Math.exp(2.1 + gauss() * 0.55)))) }))
      case 'grid': return all(0.88, () => {
        const [cx, cy] = [[25, 70], [78, 72], [20, 22], [75, 28]][weighted([6, 9, 2, 5])]
        return { x: Math.min(100, Math.max(0, Math.round(cx + gauss() * 12))), y: Math.min(100, Math.max(0, Math.round(cy + gauss() * 12))) }
      })
      case 'cloud': return all(0.8, () => {
        const n = 1 + weighted([3, 4, 3])
        const words = new Set()
        while (words.size < n) words.add(WORDS[weighted(WORDS.map((w) => w[1]))][0])
        return { words: [...words] }
      })
      case 'better': {
        for (const [i, p] of shuffle(PEOPLE).slice(0, BETTER.length).entries()) {
          await answer(p, id, { text: BETTER[i] })
          await sleep(120)
        }
        return
      }
      case 'qa': {
        const ids = []
        for (const [i, p] of shuffle(PEOPLE).slice(0, QUESTIONS.length).entries()) {
          const r = expect(`ask ${p.name}`, await call('POST', 'op=ask', { code, pid: p.pid, text: QUESTIONS[i] }))
          if (r.j?.id) ids.push(r.j.id)
        }
        const pull = [9, 6, 7, 3, 5, 4, 2]
        await Promise.all(PEOPLE.flatMap((p) => ids.filter((_, i) => rnd() < pull[i] / 16).map(async (q) => expect(`vote ${p.name}`, await call('POST', 'op=vote', { code, pid: p.pid, question: q, on: true })))))
        if (ids[1]) expect('mark answered', await call('POST', 'op=moderate', { code, question: ids[1], answered: true }, { 'x-live-host': hostToken }))
        return
      }
      case 'quiz1': case 'quiz2': case 'typed': {
        await sleep(3400) // the 3-2-1 lead-in
        const t0 = Date.now()
        const window = (slide.seconds - 3) * 1000
        await Promise.all(some(0.92).map(async (p) => {
          const at = Math.min(window, (0.15 + (1 - p.skill) * 0.6 + rnd() * 0.25) * window)
          await sleep(Math.max(0, at - (Date.now() - t0)))
          const right = rnd() < (id === 'quiz2' ? 0.55 : 0.4) + p.skill * 0.45
          if (id === 'typed') {
            const text = right ? ['Vincent van Gogh', 'Van Gogh', 'van gogh', 'Van Gough'][weighted([5, 4, 2, 1])] : ['Claude Monet', 'Edvard Munch', 'Picasso', 'no idea'][weighted([3, 2, 2, 1])]
            return answer(p, id, { text })
          }
          return answer(p, id, { choice: right ? slide.correct : [1, 2, 3][weighted([2, 1, 1])] })
        }))
        await control({ action: 'results', on: true })
        return
      }
      default:
    }
  }

  /** Join everyone, then visit each slide and fill it. Ends on `parkAt`. */
  async function playAll(deck = DEMO_DECK, parkAt = 0) {
    for (const p of PEOPLE) await join(p)
    for (const [i, slide] of deck.slides.entries()) {
      await control({ action: 'goto', index: i })
      await fill(slide)
    }
    await control({ action: 'goto', index: parkAt })
  }

  return {
    create, join, react, fill, playAll, control, answer, call, problems,
    get code() { return code },
    get hostToken() { return hostToken },
    presenterUrl: () => `${base.replace(/\/$/, '')}/live/host?code=${code}#k=${hostToken}`,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.env.LIVE_URL || 'http://localhost:5173'
  const room = demoRoom(base, process.env.LIVE_ADMIN_KEY || '')
  try {
    await room.create()
  } catch (e) {
    console.error(`${e.message}\nIs the app running at ${base}? Start it with npm run dev, or set LIVE_URL.`)
    process.exit(1)
  }
  console.log(`Room ${room.code}: ${DEMO_DECK.slides.length} slides, ${PEOPLE.length} sample people. Filling it (about a minute, the quizzes run their clocks)…`)
  await room.playAll()
  console.log(room.problems.length ? `${room.problems.length} request(s) failed: ${room.problems.slice(0, 5).join(' | ')}` : 'Every answer went in.')
  console.log(`\nOpen the presenter (this link holds the host key, do not post it):\n${room.presenterUrl()}`)
}
