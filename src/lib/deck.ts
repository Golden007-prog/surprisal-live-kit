/**
 * Surprisal Live Kit — the shared model for /live (participant) and /live/host (editor + presenter), and for
 * api/live.ts. Pure: no fetch, no DOM, no Node.
 *
 * A deck is a list of slides. A session is a deck going live under a 4-letter code. Every answer is one row per
 * participant per slide (the server upserts), so the aggregation below always sees at most one value per person.
 */

export type SlideKind =
  | 'content'
  | 'poll'
  | 'wordcloud'
  | 'open'
  | 'scale'
  | 'rank'
  | 'points'
  | 'number'
  | 'grid'
  | 'quiz'
  | 'qa'
  | 'leaderboard'

export type PollChart = 'bars' | 'columns' | 'donut'

/**
 * Every slide: `notes` are the host's run-sheet line (never sent to phones); `image` is an https URL shown on the
 * screen; `timer` (answerable slides other than the quiz, which has `seconds`) closes answers after that many seconds.
 */
type Base = { id: string; title: string; notes?: string; image?: string; timer?: number }
export type ContentSlide = Base & { kind: 'content'; eyebrow?: string; body?: string }
/** `multi` > 1 makes it multi-select, up to that many picks. `compare` is an earlier poll with the same options. */
export type PollSlide = Base & { kind: 'poll'; options: string[]; multi?: number; chart?: PollChart; compare?: string }
export type WordcloudSlide = Base & { kind: 'wordcloud'; entries: number }
export type OpenSlide = Base & { kind: 'open' }
/** `agree` mode is the five-point Likert scale with fixed labels, shown as a diverging bar. */
export type ScaleSlide = Base & { kind: 'scale'; max: 5 | 10; minLabel: string; maxLabel: string; mode?: 'rating' | 'agree'; compare?: string }
export type RankSlide = Base & { kind: 'rank'; options: string[] }
export type PointsSlide = Base & { kind: 'points'; options: string[] }
/** A prediction: everyone guesses a number; `answer` is the truth, hidden from phones until the reveal. */
export type NumberSlide = Base & { kind: 'number'; min: number; max: number; unit?: string; answer?: number }
/** Everyone places one dot on a 2×2. Values are 0–100 on each axis. */
export type GridSlide = Base & { kind: 'grid'; xLow: string; xHigh: string; yLow: string; yHigh: string; quadrants?: [string, string, string, string] }
/** With `typed`, people type the answer instead of picking one; any of `typed` counts (case, accents and one typo forgiven). */
export type QuizSlide = Base & { kind: 'quiz'; options: string[]; correct: number; seconds: number; typed?: string[] }
export type QaSlide = Base & { kind: 'qa' }
export type LeaderboardSlide = Base & { kind: 'leaderboard'; final?: boolean }
export type Slide =
  | ContentSlide
  | PollSlide
  | WordcloudSlide
  | OpenSlide
  | ScaleSlide
  | RankSlide
  | PointsSlide
  | NumberSlide
  | GridSlide
  | QuizSlide
  | QaSlide
  | LeaderboardSlide

/**
 * Deck settings. `paced`: each phone moves through
 * the slides itself, for surveys before or after a session (no quizzes). `hold`: answers that trip the word filter wait
 * for the host before they reach the screen.
 */
export type DeckSettings = { paced?: boolean; hold?: boolean }
export type Deck = { title: string; slides: Slide[]; settings?: DeckSettings }

/** Answer payloads, one shape per answerable kind. */
export type Answer =
  | { choice: number }
  | { choices: number[] }
  | { value: number }
  | { words: string[] }
  | { text: string }
  | { order: number[] }
  | { points: number[] }
  | { number: number }
  | { x: number; y: number }

export const LIMITS = {
  title: 160,
  body: 600,
  option: 80,
  options: [2, 6] as const,
  listOptions: [2, 8] as const,
  quizOptions: [2, 4] as const,
  slides: 60,
  name: 32,
  word: 24,
  text: 200,
  question: 240,
  label: 40,
  notes: 400,
  seconds: [5, 120] as const,
} as const

export const POINTS_BUDGET = 100
export const AGREE_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'] as const

export const REACTIONS = ['👏', '🤯', '😂', '❤️', '🤔'] as const
export type Reaction = (typeof REACTIONS)[number]

export const KIND_LABEL: Record<SlideKind, string> = {
  content: 'Content',
  poll: 'Poll',
  wordcloud: 'Word cloud',
  open: 'Open text',
  scale: 'Scale',
  rank: 'Ranking',
  points: '100 points',
  number: 'Prediction',
  grid: '2×2',
  quiz: 'Quiz',
  qa: 'Q&A',
  leaderboard: 'Leaderboard',
}

/** One line per kind, for the editor's "add slide" menu. */
export const KIND_HINT: Record<SlideKind, string> = {
  content: 'A title and a line: the Announcement, the Reading, a break',
  poll: 'Pick one, or several',
  wordcloud: 'A word or two each; the room’s words, sized by count',
  open: 'One line each, as a wall of notes',
  scale: 'Rate 1–5 or 1–10, or agree / disagree',
  rank: 'Put options in order; the room’s order',
  points: 'Spend 100 points across options',
  number: 'Guess a number, then reveal the truth',
  grid: 'Place yourself on two axes',
  quiz: 'Timed, one right answer, points for speed',
  qa: 'Questions from the room, voted up',
  leaderboard: 'Quiz scores so far, or the podium',
}

export const ANSWERABLE: ReadonlySet<SlideKind> = new Set(['poll', 'wordcloud', 'open', 'scale', 'rank', 'points', 'number', 'grid', 'quiz'])

// No I, L, O, U, 0, 1: the code is read aloud on a call and typed on a phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 4
export function makeCode(rand: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]
  return s
}
export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const c = raw.toUpperCase().replace(/[^A-Z]/g, '')
  if (c.length !== CODE_LENGTH) return null
  return [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : null
}

export const uid = (rand: () => number = Math.random) =>
  Array.from({ length: 12 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(rand() * 36)]).join('')

/** A short, stable, one-way id for a person's answer, so the screen can hide or spotlight it without exposing who. */
export function entryId(slideId: string, pid: string): string {
  let h = 0x811c9dc5
  for (const ch of `${slideId}|${pid}`) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const multiline = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : ''
const int = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === 'number' ? Math.round(v) : Number.NaN
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const ref = (v: unknown) => (typeof v === 'string' && /^[a-z0-9_-]{1,24}$/i.test(v) ? v : undefined)

/** An image must be an https URL; anything else is dropped. */
export function cleanImage(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > 600) return undefined
  try {
    const u = new URL(v.trim())
    return u.protocol === 'https:' ? u.toString() : undefined
  } catch {
    return undefined
  }
}

/** Validates and normalises one slide from untrusted JSON. Null when it cannot be a slide. */
export function cleanSlide(raw: unknown): Slide | null {
  const s = cleanSlideBody(raw)
  if (!s) return null
  const r = raw as Record<string, unknown>
  const notes = multiline(r.notes, LIMITS.notes)
  if (notes) s.notes = notes
  const image = cleanImage(r.image)
  if (image && (s.kind === 'content' || s.kind === 'poll' || s.kind === 'quiz' || s.kind === 'number')) s.image = image
  if (ANSWERABLE.has(s.kind) && s.kind !== 'quiz' && typeof r.timer === 'number' && r.timer > 0) s.timer = int(r.timer, ...LIMITS.seconds, 60)
  return s
}

function cleanSlideBody(raw: unknown): Slide | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = str(r.id, 24).replace(/[^a-z0-9_-]/gi, '') || uid()
  const title = str(r.title, LIMITS.title)
  // Callers check the lower bound; this only trims, drops empties and caps.
  const options = (hi: number) =>
    (Array.isArray(r.options) ? r.options : [])
      .map((o) => str(o, LIMITS.option))
      .filter(Boolean)
      .slice(0, hi)
  const label = (k: string) => str(r[k], LIMITS.label)
  switch (r.kind) {
    case 'content':
      return { id, kind: 'content', title, eyebrow: str(r.eyebrow, 60) || undefined, body: multiline(r.body, LIMITS.body) || undefined }
    case 'poll': {
      const o = options(LIMITS.options[1])
      if (o.length < LIMITS.options[0] || !title) return null
      const multi = int(r.multi, 1, o.length, 1)
      const chart: PollChart | undefined = r.chart === 'columns' || (r.chart === 'donut' && multi === 1) ? r.chart : undefined
      return { id, kind: 'poll', title, options: o, ...(multi > 1 ? { multi } : {}), ...(chart ? { chart } : {}), ...(ref(r.compare) ? { compare: ref(r.compare) } : {}) }
    }
    case 'quiz': {
      const seconds = int(r.seconds, ...LIMITS.seconds, 20)
      if (Array.isArray(r.typed)) {
        const typed = r.typed.map((t) => str(t, LIMITS.option)).filter(Boolean).slice(0, 8)
        return typed.length && title ? { id, kind: 'quiz', title, options: [], correct: -1, seconds, typed } : null
      }
      const o = options(LIMITS.quizOptions[1])
      if (o.length < LIMITS.quizOptions[0] || !title) return null
      return { id, kind: 'quiz', title, options: o, correct: int(r.correct, 0, o.length - 1, 0), seconds }
    }
    case 'rank':
    case 'points': {
      const o = options(LIMITS.listOptions[1])
      if (o.length < LIMITS.listOptions[0] || !title) return null
      return { id, kind: r.kind, title, options: o }
    }
    case 'wordcloud':
      return title ? { id, kind: 'wordcloud', title, entries: int(r.entries, 1, 3, 3) } : null
    case 'open':
      return title ? { id, kind: 'open', title } : null
    case 'scale': {
      if (!title) return null
      const agree = r.mode === 'agree'
      return {
        id,
        kind: 'scale',
        title,
        max: agree ? 5 : r.max === 10 ? 10 : 5,
        minLabel: agree ? AGREE_LABELS[0] : label('minLabel'),
        maxLabel: agree ? AGREE_LABELS[4] : label('maxLabel'),
        ...(agree ? { mode: 'agree' as const } : {}),
        ...(ref(r.compare) ? { compare: ref(r.compare) } : {}),
      }
    }
    case 'number': {
      if (!title) return null
      let min = num(r.min) ?? 0
      let max = num(r.max) ?? 100
      if (min > max) [min, max] = [max, min]
      if (min === max) max = min + 1
      const answer = num(r.answer)
      return { id, kind: 'number', title, min, max, unit: str(r.unit, 12) || undefined, ...(answer != null ? { answer } : {}) }
    }
    case 'grid': {
      if (!title) return null
      const q = Array.isArray(r.quadrants) ? r.quadrants.map((x) => str(x, LIMITS.label)) : []
      return {
        id,
        kind: 'grid',
        title,
        xLow: label('xLow'),
        xHigh: label('xHigh'),
        yLow: label('yLow'),
        yHigh: label('yHigh'),
        ...(q.length === 4 && q.some(Boolean) ? { quadrants: q as [string, string, string, string] } : {}),
      }
    }
    case 'qa':
      return { id, kind: 'qa', title: title || 'Ask us anything' }
    case 'leaderboard':
      return { id, kind: 'leaderboard', title: title || 'Leaderboard', final: r.final === true || undefined }
    default:
      return null
  }
}

/** The earlier slides a slide can be compared with: same kind, same options (or same scale), before it. */
export function comparable(deck: Deck, slide: Slide): Slide[] {
  const i = deck.slides.findIndex((s) => s.id === slide.id)
  return deck.slides.slice(0, Math.max(0, i)).filter((s) => {
    if (slide.kind === 'poll' && s.kind === 'poll') return s.options.length === slide.options.length && !!s.multi === !!slide.multi
    if (slide.kind === 'scale' && s.kind === 'scale') return s.max === slide.max && (s.mode ?? 'rating') === (slide.mode ?? 'rating')
    return false
  })
}

export function cleanDeck(raw: unknown): Deck | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const slides = (Array.isArray(r.slides) ? r.slides : []).slice(0, LIMITS.slides).map(cleanSlide).filter((s): s is Slide => !!s)
  if (!slides.length) return null
  // Ids must be unique: answers are keyed by them.
  const seen = new Set<string>()
  for (const s of slides) {
    while (seen.has(s.id)) s.id = uid()
    seen.add(s.id)
  }
  const set = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>
  const settings: DeckSettings = {
    ...(set.paced === true ? { paced: true } : {}),
    ...(set.hold === true ? { hold: true } : {}),
  }
  const deck: Deck = { title: str(r.title, LIMITS.title) || 'Untitled session', slides, ...(Object.keys(settings).length ? { settings } : {}) }
  // A comparison must point at a valid earlier slide, or it is dropped.
  for (const s of slides)
    if ((s.kind === 'poll' || s.kind === 'scale') && s.compare && !comparable(deck, s).some((x) => x.id === s.compare)) delete s.compare
  return deck
}

export function cleanName(raw: unknown): string {
  return str(raw, LIMITS.name)
}

const isIndex = (v: unknown, n: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n

/** Normalises an answer for a slide. Null when the answer does not fit the slide. */
export function cleanAnswer(slide: Slide, raw: unknown): Answer | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  switch (slide.kind) {
    case 'poll':
      if (slide.multi && slide.multi > 1) {
        const picks = [...new Set(Array.isArray(r.choices) ? r.choices : [])].filter((c) => isIndex(c, slide.options.length)) as number[]
        return picks.length && picks.length <= slide.multi ? { choices: picks.sort((a, b) => a - b) } : null
      }
      return isIndex(r.choice, slide.options.length) ? { choice: r.choice } : null
    case 'quiz':
      if (slide.typed) {
        const text = str(r.text, LIMITS.option)
        return text ? { text } : null
      }
      return isIndex(r.choice, slide.options.length) ? { choice: r.choice } : null
    case 'scale': {
      const v = r.value
      return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= slide.max ? { value: v } : null
    }
    case 'rank': {
      const order = Array.isArray(r.order) ? r.order : []
      const n = slide.options.length
      // A full permutation: every option once.
      return order.length === n && new Set(order).size === n && order.every((o) => isIndex(o, n)) ? { order: order as number[] } : null
    }
    case 'points': {
      const p = Array.isArray(r.points) ? r.points : []
      if (p.length !== slide.options.length || !p.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= 0)) return null
      const sum = (p as number[]).reduce((a, b) => a + b, 0)
      return sum > 0 && sum <= POINTS_BUDGET ? { points: p as number[] } : null
    }
    case 'number': {
      const n = num(r.number)
      return n != null && n >= slide.min && n <= slide.max ? { number: Math.round(n * 1000) / 1000 } : null
    }
    case 'grid': {
      const x = num(r.x)
      const y = num(r.y)
      return x != null && y != null && x >= 0 && x <= 100 && y >= 0 && y <= 100 ? { x: Math.round(x), y: Math.round(y) } : null
    }
    case 'wordcloud': {
      const words = (Array.isArray(r.words) ? r.words : [])
        .map((w) => str(w, LIMITS.word))
        .filter(Boolean)
        .slice(0, slide.entries)
      return words.length ? { words } : null
    }
    case 'open': {
      const text = str(r.text, LIMITS.text)
      return text ? { text } : null
    }
    default:
      return null
  }
}

/** What a phone may see of a slide: never a quiz's right answer or a prediction's truth before the host reveals it. */
export function publicSlide(slide: Slide, reveal: boolean): Slide {
  if (slide.notes) {
    const { notes: _notes, ...rest } = slide // eslint-disable-line @typescript-eslint/no-unused-vars
    slide = rest as Slide
  }
  if (reveal) return slide
  if (slide.kind === 'quiz') {
    const { typed: _typed, ...rest } = slide // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...rest, correct: -1, ...(slide.typed ? { typed: [] } : {}) }
  }
  if (slide.kind === 'number' && slide.answer != null) {
    const { answer: _hidden, ...rest } = slide // eslint-disable-line @typescript-eslint/no-unused-vars
    return rest
  }
  return slide
}

// ---------------------------------------------------------------- results

export type ResponseRow = { slide_id: string; participant_id: string; value: Answer; at: number }
export type QuestionRow = { id: string; text: string; votes: number; answered: boolean; at: number }

type ChoiceResults = { kind: 'choice'; counts: number[]; total: number }
type ScaleResults = { kind: 'scale'; counts: number[]; total: number; average: number | null }

export type Results =
  /** `total` is the number of people; with multi-select the counts add up to more. */
  | (ChoiceResults & { previous?: ChoiceResults })
  | (ScaleResults & { previous?: ScaleResults })
  | { kind: 'words'; words: { text: string; count: number }[]; total: number }
  | { kind: 'open'; entries: { id: string; text: string; at: number }[]; total: number }
  /** `scores[i]`: Borda points (first place = n−1); `avg[i]`: mean position, 1 = top, null with no answers. */
  | { kind: 'rank'; scores: number[]; avg: (number | null)[]; firsts: number[]; total: number }
  | { kind: 'points'; totals: number[]; total: number }
  /** `values` sorted ascending, capped at 2000 for the wire. */
  | { kind: 'number'; values: number[]; total: number; median: number | null; mean: number | null }
  | { kind: 'grid'; points: { x: number; y: number }[]; total: number; mean: { x: number; y: number } | null }
  /** A typed quiz: how many got it, and the most common things typed (`ok` marks the accepted ones). */
  | { kind: 'typed'; correct: number; answers: { text: string; count: number; ok: boolean }[]; total: number }
  | { kind: 'qa'; questions: QuestionRow[]; total: number }
  | { kind: 'board'; board: { name: string; score: number }[]; total: number }
  | { kind: 'none'; total: 0 }

const round1 = (n: number) => Math.round(n * 10) / 10

function median(sorted: number[]): number | null {
  if (!sorted.length) return null
  const m = sorted.length >> 1
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2
}

/**
 * Aggregates the answers to one slide. `rows` may hold other slides' rows too; only this slide's count.
 * `hidden` holds what the host has taken off the screen: entry ids (entryId) for open text, `w:<word>` for word clouds.
 */
export function aggregate(slide: Slide, rows: ResponseRow[], hidden: ReadonlySet<string> = new Set(), hold = false): Results {
  const mine = rows.filter((r) => r.slide_id === slide.id)
  // With `hold` on, an entry that trips the word filter stays off the screen until the host approves it (`ok:<id>`).
  const held = (id: string, text: string) => hold && !hidden.has(`ok:${id}`) && isFlagged(text)
  if (slide.kind === 'quiz' && slide.typed) {
    const tally = new Map<string, { text: string; count: number; ok: boolean }>()
    let correct = 0
    for (const r of mine) {
      if (!('text' in r.value)) continue
      const ok = typedCorrect(slide, r.value.text)
      if (ok) correct++
      const key = normalise(r.value.text)
      const t = tally.get(key) ?? { text: r.value.text, count: 0, ok }
      t.count++
      tally.set(key, t)
    }
    const answers = [...tally.values()].filter((a) => a.ok || !isFlagged(a.text)).sort((a, b) => b.count - a.count).slice(0, 12)
    return { kind: 'typed', correct, answers, total: mine.length }
  }
  switch (slide.kind) {
    case 'poll':
    case 'quiz': {
      const counts = slide.options.map(() => 0)
      for (const r of mine) {
        const v = r.value
        if ('choice' in v && counts[v.choice] !== undefined) counts[v.choice]++
        else if ('choices' in v) for (const c of v.choices) if (counts[c] !== undefined) counts[c]++
      }
      return { kind: 'choice', counts, total: mine.length }
    }
    case 'scale': {
      const counts = Array.from({ length: slide.max }, () => 0)
      let sum = 0
      for (const r of mine)
        if ('value' in r.value && r.value.value >= 1 && r.value.value <= slide.max) {
          counts[r.value.value - 1]++
          sum += r.value.value
        }
      const total = counts.reduce((a, b) => a + b, 0)
      return { kind: 'scale', counts, total, average: total ? round1(sum / total) : null }
    }
    case 'rank': {
      const n = slide.options.length
      const scores = Array.from({ length: n }, () => 0)
      const posSum = Array.from({ length: n }, () => 0)
      const firsts = Array.from({ length: n }, () => 0)
      let total = 0
      for (const r of mine) {
        if (!('order' in r.value) || r.value.order.length !== n) continue
        total++
        r.value.order.forEach((opt, pos) => {
          scores[opt] += n - 1 - pos
          posSum[opt] += pos + 1
          if (pos === 0) firsts[opt]++
        })
      }
      return { kind: 'rank', scores, avg: posSum.map((s) => (total ? round1(s / total) : null)), firsts, total }
    }
    case 'points': {
      const totals = slide.options.map(() => 0)
      let total = 0
      for (const r of mine) {
        if (!('points' in r.value)) continue
        total++
        r.value.points.forEach((p, i) => {
          if (totals[i] !== undefined) totals[i] += p
        })
      }
      return { kind: 'points', totals, total }
    }
    case 'number': {
      const values = mine
        .map((r) => ('number' in r.value ? r.value.number : Number.NaN))
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
      const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
      return { kind: 'number', values: values.length > 2000 ? values.filter((_, i) => i % Math.ceil(values.length / 2000) === 0) : values, total: values.length, median: median(values), mean: mean == null ? null : round1(mean) }
    }
    case 'grid': {
      const points = mine.filter((r) => 'x' in r.value).map((r) => r.value as { x: number; y: number })
      const mean = points.length
        ? { x: round1(points.reduce((a, p) => a + p.x, 0) / points.length), y: round1(points.reduce((a, p) => a + p.y, 0) / points.length) }
        : null
      return { kind: 'grid', points: points.slice(0, 1000), total: points.length, mean }
    }
    case 'wordcloud': {
      // Counted case-insensitively; the most common spelling is the one shown.
      const tally = new Map<string, { count: number; spellings: Map<string, number> }>()
      for (const r of mine) {
        if (!('words' in r.value) || hidden.has(entryId(slide.id, r.participant_id))) continue
        // One person saying the same word twice counts once.
        const said = new Set<string>()
        for (const raw of r.value.words) {
          const w = raw.trim().replace(/[.,!?;:"“”'’]+$/g, '')
          const key = w.toLowerCase()
          if (!key || said.has(key) || hidden.has(`w:${key}`) || held(`w:${key}`, w)) continue
          said.add(key)
          const t = tally.get(key) ?? { count: 0, spellings: new Map() }
          t.count++
          t.spellings.set(w, (t.spellings.get(w) ?? 0) + 1)
          tally.set(key, t)
        }
      }
      const words = [...tally.values()]
        .map((t) => ({ text: [...t.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0], count: t.count }))
        .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
        .slice(0, 60)
      return { kind: 'words', words, total: mine.length }
    }
    case 'open': {
      const entries = mine
        .filter((r) => 'text' in r.value)
        .map((r) => ({ id: entryId(slide.id, r.participant_id), text: (r.value as { text: string }).text, at: r.at }))
        .filter((e) => !hidden.has(e.id) && !held(e.id, e.text))
        .sort((a, b) => b.at - a.at)
        .slice(0, 120)
      return { kind: 'open', entries, total: mine.length }
    }
    default:
      return { kind: 'none', total: 0 }
  }
}

/** Adds the earlier slide's results to a poll or scale that compares with it. */
export function withPrevious(results: Results, previous: Results | null): Results {
  if (!previous) return results
  if (results.kind === 'choice' && previous.kind === 'choice' && previous.counts.length === results.counts.length)
    return { ...results, previous: { kind: 'choice', counts: previous.counts, total: previous.total } }
  if (results.kind === 'scale' && previous.kind === 'scale' && previous.counts.length === results.counts.length)
    return { ...results, previous: { kind: 'scale', counts: previous.counts, total: previous.total, average: previous.average } }
  return results
}

// ---------------------------------------------------------------- predictions: bins and surprise

export type Bin = { from: number; to: number; count: number }

/** "Nice" round numbers for axis ticks: 1, 2, 2.5, 5 × 10^k. */
export function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target)
  const mag = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag
  return 10 * mag
}

/**
 * Bins guesses for the histogram. The range is the slide's own min–max (so the axis does not jump as guesses
 * arrive), split into round-numbered bins.
 */
export function binValues(values: number[], min: number, max: number, target = 16): Bin[] {
  const step = niceStep(max - min, target)
  const start = Math.floor(min / step) * step
  const bins: Bin[] = []
  for (let from = start; from < max || bins.length === 0; from += step) bins.push({ from, to: from + step, count: 0 })
  for (const v of values) {
    const i = Math.min(bins.length - 1, Math.max(0, Math.floor((v - start) / step)))
    bins[i].count++
  }
  return bins
}

/**
 * The room's surprisal at the truth, in bits: −log₂ of the share of the room's guesses that landed in the truth's bin,
 * with half a guess of smoothing in every bin so a truth nobody guessed is finite. Surprisal, literally.
 */
export function roomSurprisal(bins: Bin[], truth: number): number | null {
  const n = bins.reduce((a, b) => a + b.count, 0)
  if (!n || !bins.length) return null
  const i = bins.findIndex((b) => truth >= b.from && truth < b.to)
  const hit = i >= 0 ? bins[i].count : truth === bins[bins.length - 1].to ? bins[bins.length - 1].count : 0
  const p = (hit + 0.5) / (n + 0.5 * bins.length)
  return Math.round(-Math.log2(p) * 10) / 10
}

/** Share of guesses within `tolerance` (a fraction of the slide's range) of the truth. */
export function withinShare(values: number[], truth: number, span: number, tolerance = 0.1): number {
  if (!values.length) return 0
  return values.filter((v) => Math.abs(v - truth) <= span * tolerance).length / values.length
}

export function formatNumber(n: number, unit?: string): string {
  const s = Math.abs(n) >= 1000 ? n.toLocaleString('en', { maximumFractionDigits: 1 }) : String(Math.round(n * 100) / 100)
  return unit ? `${s} ${unit}` : s
}

// ---------------------------------------------------------------- quiz scoring

/**
 * Kahoot's rule: a right answer is worth up to 1000 points, falling linearly to 500 at the buzzer. A wrong or
 * missing answer is 0. `elapsed` is milliseconds since the host started the timer.
 */
export function quizPoints(correct: boolean, elapsedMs: number, seconds: number): number {
  if (!correct) return 0
  const frac = Math.min(1, Math.max(0, elapsedMs / (seconds * 1000)))
  return Math.round(1000 * (1 - frac / 2))
}

export type Score = { participant_id: string; name: string; score: number; correct: number; streak: number }

/** Accents, case, punctuation and spacing do not count when matching a typed answer. */
export function normalise(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function within1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/** A typed answer is right when it matches an accepted one; from five letters up, one typo is forgiven. */
export function typedCorrect(slide: QuizSlide, text: string): boolean {
  const t = normalise(text)
  return !!t && (slide.typed ?? []).some((a) => {
    const n = normalise(a)
    return n === t || (n.length >= 5 && within1(n, t))
  })
}

export function quizCorrect(slide: QuizSlide, v: Answer): boolean {
  if (slide.typed) return 'text' in v && typedCorrect(slide, v.text)
  return 'choice' in v && v.choice === slide.correct
}

/** Kahoot's answer streak: each right answer in a row after the first adds 100 points, up to 500. */
export const STREAK_STEP = 100
export const STREAK_CAP = 500

/** Totals across every quiz slide whose timer has started, in deck order. Sorted best first; ties keep the earlier joiner. */
export function scores(deck: Deck, timers: Record<string, number>, rows: ResponseRow[], names: Map<string, string>): Score[] {
  const quizzes = deck.slides.filter((s): s is QuizSlide => s.kind === 'quiz' && timers[s.id] != null)
  const byKey = new Map(rows.map((r) => [`${r.slide_id}|${r.participant_id}`, r]))
  const totals = new Map<string, Score>()
  for (const [pid, name] of names) totals.set(pid, { participant_id: pid, name, score: 0, correct: 0, streak: 0 })
  for (const r of rows) if (!totals.has(r.participant_id) && quizzes.some((q) => q.id === r.slide_id)) totals.set(r.participant_id, { participant_id: r.participant_id, name: '…', score: 0, correct: 0, streak: 0 })
  for (const q of quizzes)
    for (const t of totals.values()) {
      const r = byKey.get(`${q.id}|${t.participant_id}`)
      const right = !!r && quizCorrect(q, r.value)
      if (!right) {
        t.streak = 0
        continue
      }
      t.score += quizPoints(true, r.at - timers[q.id], q.seconds) + Math.min(STREAK_CAP, STREAK_STEP * t.streak)
      t.streak++
      t.correct++
    }
  return [...totals.values()].sort((a, b) => b.score - a.score)
}

// ---------------------------------------------------------------- moderation

/**
 * A short word filter for the screen, not a censor: English, Swedish and Portuguese swears and slurs, matched as
 * whole words after folding accents and common letter swaps (0→o, 1→i, 3→e, 4→a, 5→s, @→a, $→s).
 */
const FLAGGED = new Set(
  (
    'fuck fucking fucker fucked motherfucker shit shitty bullshit cunt cock dick dickhead prick twat wanker bollocks bastard bitch asshole arsehole ass ' +
    'slut whore piss pissed nigger nigga faggot fag retard retarded spastic tranny kike chink paki dyke rape rapist nazi ' +
    'fan jävla javla jävel helvete skit kuk fitta hora knulla bög neger ' +
    'porra caralho merda foda foder puta cu buceta viado arrombado cacete'
  ).split(/\s+/).map(normalise),
)
export function isFlagged(text: string): boolean {
  // Letter swaps are only read in words with at least two real letters, so "sh1t" is caught but a name like "P155" or
  // a number like "1337" is not.
  const fold = (w: string) => ((w.match(/[a-z]/g) ?? []).length >= 2 ? w.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's') : w)
  return text
    .toLowerCase()
    .split(/[^a-z0-9@$\u00c0-\u024f]+/)
    .map((w) => normalise(fold(w)))
    .some((w) => FLAGGED.has(w))
}

/** What the host has to approve or hide on this slide: flagged entries not yet approved or hidden. */
export function heldEntries(slide: Slide, rows: ResponseRow[], hidden: ReadonlySet<string>): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = []
  for (const r of rows) {
    if (r.slide_id !== slide.id) continue
    if (slide.kind === 'open' && 'text' in r.value) {
      const id = entryId(slide.id, r.participant_id)
      if (isFlagged(r.value.text) && !hidden.has(id) && !hidden.has(`ok:${id}`)) out.push({ id, text: r.value.text })
    }
    if (slide.kind === 'wordcloud' && 'words' in r.value)
      for (const w of r.value.words) {
        const key = w.trim().replace(/[.,!?;:"“”'’]+$/g, '').toLowerCase()
        const id = `w:${key}`
        if (isFlagged(w) && !hidden.has(id) && !hidden.has(`ok:${id}`) && !out.some((o) => o.id === id)) out.push({ id, text: w })
      }
  }
  return out.slice(0, 50)
}

export function hasQuiz(deck: Deck): boolean {
  return deck.slides.some((s) => s.kind === 'quiz')
}

// ---------------------------------------------------------------- the wire

export type Phase = 'live' | 'ended'

/** GET /api/live?op=state — the same for everyone in the session (cached at the edge for a second). */
export type PublicState = {
  code: string
  title: string
  phase: Phase
  index: number
  count: number
  slide: Slide
  accepting: boolean
  showResults: boolean
  /** Server epoch ms when the current slide's clock started (a quiz after its lead-in, or a slide's own timer), or null. */
  timerAt: number | null
  /** That clock's length in seconds. */
  timerSeconds: number | null
  settings: DeckSettings
  /** Self-paced sessions only: every slide as a phone may see it, so the phone can move on its own. */
  slides?: Slide[]
  serverNow: number
  participants: number
  /** Present when showResults is on, or always on a Q&A or leaderboard slide. */
  results?: Results
  /** The slide id phones post questions to, when the deck has a Q&A slide. */
  qaSlide: string | null
}

export type HostState = PublicState & {
  deck: Deck
  results: Results
  answered: number
  reactions: { id: string; emoji: string; at: number }[]
  /** The latest names to join, newest last: the lobby on the first slide. */
  joined: string[]
  /** Answers waiting for the host (the word filter, with `hold` on). Questions held are `q:<id>`. */
  held: { id: string; text: string }[]
  /** Self-paced: answers per slide, in deck order. */
  progress?: number[]
}

export type MeState = { score: number; rank: number | null; of: number; streak: number; last: { correct: boolean; points: number } | null }

/** Ready-made decks: what a new host can start from. Edit or add to these to change the host page's templates. */
export const TEMPLATES: { id: string; name: string; blurb: string; deck: () => Deck }[] = [
  {
    id: 'community-meet',
    name: 'Community meet',
    blurb: 'The full arc: join, intention, a temperature check, Q&A, what surprised people, a goodbye.',
    deck: () => ({
      title: 'Community meet',
      slides: [
        { id: uid(), kind: 'content', eyebrow: 'Welcome', title: 'Phones face down. Except for this.', body: 'Join on your phone with the code in the corner.' },
        { id: uid(), kind: 'open', title: 'Why are you here today, and what do you want to leave with?' },
        { id: uid(), kind: 'scale', title: 'How much did you build with AI this month?', max: 5, minLabel: 'Not at all', maxLabel: 'Every day' },
        { id: uid(), kind: 'qa', title: 'Questions for the room' },
        { id: uid(), kind: 'wordcloud', title: 'What surprised you?', entries: 3 },
        { id: uid(), kind: 'content', eyebrow: 'Thank you', title: 'That’s all for today.' },
      ],
    }),
  },
  {
    id: 'webinar',
    name: 'Webinar',
    blurb: 'A warm-up poll, a claim before and after the talk, Q&A throughout, what surprised people.',
    deck: () => {
      const before = uid()
      const claim = 'AI will make most of us less curious.'
      return {
        title: 'Webinar',
        slides: [
          { id: uid(), kind: 'content', eyebrow: 'Live', title: 'We start in a minute.', body: 'Join on your phone with the code in the corner.' },
          { id: uid(), kind: 'poll', title: 'Where are you with AI right now?', options: ['Sceptical', 'Curious', 'Using it daily', 'Building with it'] },
          { id: before, kind: 'scale', mode: 'agree', title: claim, max: 5, minLabel: AGREE_LABELS[0], maxLabel: AGREE_LABELS[4] },
          { id: uid(), kind: 'qa', title: 'Your questions' },
          { id: uid(), kind: 'scale', mode: 'agree', title: `After the talk: ${claim}`, max: 5, minLabel: AGREE_LABELS[0], maxLabel: AGREE_LABELS[4], compare: before },
          { id: uid(), kind: 'wordcloud', title: 'What surprised you?', entries: 3 },
          { id: uid(), kind: 'content', eyebrow: 'Thank you', title: 'That’s all for today.' },
        ],
      }
    },
  },
  {
    id: 'workshop',
    name: 'Build session',
    blurb: 'Map the room on a 2×2, a prediction with a reveal, spend 100 points, rank what to build next.',
    deck: () => ({
      title: 'Build session',
      slides: [
        { id: uid(), kind: 'content', eyebrow: 'Build session', title: 'Show before you tell.', body: 'Join on your phone with the code in the corner.' },
        { id: uid(), kind: 'grid', title: 'Where are you?', xLow: 'Never use AI', xHigh: 'Use it daily', yLow: 'Don’t trust it', yHigh: 'Trust it', quadrants: ['Trusting, not using', 'All in', 'Out', 'Using, not trusting'] },
        { id: uid(), kind: 'number', title: 'How many hours a week does my agent save me?', min: 0, max: 40, unit: 'h', answer: 6 },
        { id: uid(), kind: 'poll', title: 'What have you already built?', options: ['A custom GPT or project', 'An automation (Zapier, Make…)', 'A script with an API', 'An agent with tools', 'Nothing yet'], multi: 5 },
        { id: uid(), kind: 'points', title: 'Spend 100 points: what should next month’s session cover?', options: ['Memory', 'Tools and MCP', 'Evals', 'Cost and limits', 'Safety and permissions'] },
        { id: uid(), kind: 'rank', title: 'Rank what you’d build first', options: ['Inbox triage', 'Meeting notes', 'Research digest', 'Personal CRM'] },
        { id: uid(), kind: 'scale', title: 'How useful was today?', max: 10, minLabel: 'Not at all', maxLabel: 'Very' },
        { id: uid(), kind: 'wordcloud', title: 'What surprised you?', entries: 3 },
      ],
    }),
  },
  {
    id: 'book-club',
    name: 'Book club',
    blurb: 'Rate the book, the line that stayed, agree or disagree with its claim, what surprised people.',
    deck: () => ({
      title: 'Book club',
      slides: [
        { id: uid(), kind: 'content', eyebrow: 'The Reading', title: '“Attention is the rarest and purest form of generosity.”', body: 'Simone Weil' },
        { id: uid(), kind: 'scale', title: 'How much did the book move you?', max: 10, minLabel: 'Not at all', maxLabel: 'Changed my mind' },
        { id: uid(), kind: 'open', title: 'One line from the book that stayed with you' },
        { id: uid(), kind: 'scale', mode: 'agree', title: 'Machines will never understand us the way we understand each other.', max: 5, minLabel: AGREE_LABELS[0], maxLabel: AGREE_LABELS[4] },
        { id: uid(), kind: 'qa', title: 'Questions for the room' },
        { id: uid(), kind: 'wordcloud', title: 'What surprised you?', entries: 3 },
      ],
    }),
  },
  {
    id: 'quiz',
    name: 'Quiz round',
    blurb: 'Three timed questions, points for speed, a podium at the end.',
    deck: () => ({
      title: 'Quiz round',
      slides: [
        { id: uid(), kind: 'content', eyebrow: 'Quiz', title: 'Fast and right wins.', body: 'Up to 1000 points a question. Speed counts.' },
        { id: uid(), kind: 'quiz', title: 'How much information is in one fair coin flip?', options: ['Half a bit', 'One bit', 'Two bits', 'It depends on the coin'], correct: 1, seconds: 20 },
        { id: uid(), kind: 'quiz', title: 'An AI agent is a model plus…', options: ['A bigger model', 'Tools and a loop', 'A chat window', 'More data'], correct: 1, seconds: 20 },
        { id: uid(), kind: 'leaderboard', title: 'Halfway' },
        { id: uid(), kind: 'quiz', title: 'Who wrote “My experience is what I agree to attend to”?', options: ['William James', 'Simone Weil', 'Herbert Simon', 'Daniel Kahneman'], correct: 0, seconds: 20 },
        { id: uid(), kind: 'leaderboard', title: 'The podium', final: true },
      ],
    }),
  },
  {
    id: 'blank',
    name: 'Blank',
    blurb: 'One poll to start from.',
    deck: () => ({ title: 'Untitled session', slides: [{ id: uid(), kind: 'poll', title: 'Your question', options: ['Option A', 'Option B'] }] }),
  },
]

/** A fresh slide of a kind, for the editor's "add slide". */
export function blankSlide(kind: SlideKind): Slide {
  const id = uid()
  switch (kind) {
    case 'content':
      return { id, kind, title: 'A title', body: '' }
    case 'poll':
      return { id, kind, title: 'Your question', options: ['Option A', 'Option B', 'Option C'] }
    case 'wordcloud':
      return { id, kind, title: 'In one word…', entries: 3 }
    case 'open':
      return { id, kind, title: 'Tell us in one line' }
    case 'scale':
      return { id, kind, title: 'How much do you agree?', max: 5, minLabel: 'Not at all', maxLabel: 'Completely' }
    case 'rank':
      return { id, kind, title: 'Put these in order', options: ['First thing', 'Second thing', 'Third thing'] }
    case 'points':
      return { id, kind, title: 'Spend 100 points', options: ['Option A', 'Option B', 'Option C'] }
    case 'number':
      return { id, kind, title: 'Guess the number', min: 0, max: 100 }
    case 'grid':
      return { id, kind, title: 'Where are you?', xLow: 'Low', xHigh: 'High', yLow: 'Low', yHigh: 'High' }
    case 'quiz':
      return { id, kind, title: 'Your question', options: ['Right', 'Wrong', 'Also wrong', 'Nope'], correct: 0, seconds: 20 }
    case 'qa':
      return { id, kind, title: 'Ask us anything' }
    case 'leaderboard':
      return { id, kind, title: 'Leaderboard' }
  }
}

/** One answer as plain text, for the CSV. */
export function answerText(s: Slide, v: Answer): string {
  const opts = 'options' in s ? s.options : []
  if ('choice' in v) return opts[v.choice] ?? ''
  if ('choices' in v) return v.choices.map((c) => opts[c] ?? '').join(' / ')
  if ('order' in v) return v.order.map((c, i) => `${i + 1}. ${opts[c] ?? ''}`).join(' / ')
  if ('points' in v) return v.points.map((p, i) => (p ? `${opts[i] ?? ''}: ${p}` : '')).filter(Boolean).join(' / ')
  if ('value' in v) return s.kind === 'scale' && s.mode === 'agree' ? AGREE_LABELS[v.value - 1] : String(v.value)
  if ('number' in v) return String(v.number)
  if ('x' in v) return `x ${v.x}, y ${v.y}`
  if ('words' in v) return v.words.join(' / ')
  if ('text' in v) return v.text
  return ''
}

export function toCsv(deck: Deck, rows: ResponseRow[], names: Map<string, string>): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const byId = new Map(deck.slides.map((s, i) => [s.id, { s, i }]))
  const lines = ['slide,kind,question,participant,answer,at']
  for (const r of [...rows].sort((a, b) => (byId.get(a.slide_id)?.i ?? 0) - (byId.get(b.slide_id)?.i ?? 0) || a.at - b.at)) {
    const hit = byId.get(r.slide_id)
    if (!hit) continue
    const { s, i } = hit
    lines.push([String(i + 1), s.kind, s.title, names.get(r.participant_id) ?? '', answerText(s, r.value), new Date(r.at).toISOString()].map(esc).join(','))
  }
  return lines.join('\n') + '\n'
}
