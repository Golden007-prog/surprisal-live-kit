/**
 * The result charts, shared by the presenter, the editor preview and the phones.
 *
 * Built to the dataviz method (palette validated with its validate_palette.js, 23 Oct): one series per chart in the
 * de-emphasis mark colour with the one thing that matters in gold (the leader, the right answer, the truth, the
 * room's average); the agree/disagree scale is the only multi-colour chart, a diverging lake–gold ramp with a neutral
 * middle. Zero radius (A1) overrides the method's rounded data-ends. Labels wear text tokens, never the mark colour.
 * Every chart is a <figure> with a one-line summary and a visually hidden table twin.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import {
  AGREE_LABELS,
  binValues,
  formatNumber,
  roomSurprisal,
  withinShare,
  type GridSlide,
  type NumberSlide,
  type PollChart,
  type QuestionRow,
  type Results,
  type Slide,
} from '../lib/deck'
import { layoutCloud } from '../motion/cloudLayout'
import { makeBody, runCloud, type Body } from '../motion/cloudPhysics'
import { CountUp } from './CountUp'
import { confetti, flashEnd, hop, shatter, sparkAt, useLandings } from '../motion/fx'
import { cue } from '../motion/sound'
import { RACE_MS, useBeat, useDrop, useRace } from '../motion/race'
import { LETTERS } from '../lib/letters'
import { useFontsReady, useSize, useSpaceBelow } from '../lib/useSize'

const pct = (n: number) => `${Math.round(n * 100)}%`
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const share = (n: number, total: number) => (total ? n / total : 0)

// ---------------------------------------------------------------- shared pieces

function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  // A table ignores width: 1px, so the clipping lives on a wrapper; otherwise a long caption widens the phone page.
  return (
    <div className="lv-sr">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {c}
                  </th>
                ) : (
                  <td key={j}>{c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Figure({ label, children, table, className = '' }: { label: string; children: ReactNode; table?: ReactNode; className?: string }) {
  return (
    <figure className={`lv-fig ${className}`} aria-label={label}>
      <div aria-hidden>{children}</div>
      {table}
    </figure>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="lv-empty">{children}</div>
}

/** One labelled row with a bar: the shape of polls, quizzes, rankings and points. */
type Row = {
  mark: string
  /** The quiz's verdict on the mark: shown when the right answer lands (✓) or once every bar has stopped (✗). */
  markAfter?: string
  label: string
  value: number
  figure: string
  cls?: string
  prev?: number
  delta?: string
  title: string
  /** The figure part way up the race, at k = 0 to 1 of the bar's value. Without it the figure waits for the landing. */
  count?: (k: number) => string
}

/** Gold and the right answer show on landing; wrong answers dim once every bar has stopped. */
function raceClass(cls: string | undefined, landed: boolean, done: boolean): string {
  if (!cls) return ''
  return cls
    .split(' ')
    .filter((c) => (c === 'is-lead' || c === 'is-correct' ? landed : c === 'is-wrong' ? done : true))
    .join(' ')
}
const isLead = (cls?: string) => !!cls && /\bis-(lead|correct)\b/.test(cls)

/** Sparks off a horizontal bar's end: thrown up and out to the right. */
const BAR_SPARKS = { edge: 'right', dir: -0.7, spread: 2.1, count: 11 } as const
/** Sparks off a column's top: thrown up. */
const COLUMN_SPARKS = { edge: 'top', dir: -Math.PI / 2, spread: 2.3, count: 11 } as const

/**
 * Bars on the race. The leader (or the right answer) lands last, runs on past its end and throws sparks; every other
 * bar flashes its end cap as it lands. `onReveal` fires once the leader has landed (or, with no leader, at the end).
 */
function RowBars({ rows, onReveal }: { rows: Row[]; onReveal?: () => void }) {
  const lead = rows.map((r) => isLead(r.cls))
  const race = useRace(
    rows.map((r) => r.value),
    lead,
  )
  const fills = useRef<(HTMLSpanElement | null)[]>([])
  useLandings(race.landed, lead, race.done, (i, isLeader) => {
    if (isLeader) {
      sparkAt(fills.current[i]!, BAR_SPARKS)
      onReveal?.()
    } else flashEnd(fills.current[i], 'right')
  })
  const anyLead = lead.some(Boolean)
  useEffect(() => {
    if (race.done && (!anyLead || reducedMotion())) onReveal?.()
  }, [race.done]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`lv-bars${race.done ? ' is-done' : ''}`}>
      {rows.map((r, i) => (
        <div key={i} className={`lv-bar ${raceClass(r.cls, race.landed[i], race.done)}`} title={r.title}>
          <span className="lv-bar-mark">{r.markAfter && (isLead(r.cls) ? race.landed[i] : race.done) ? r.markAfter : r.mark}</span>
          <span className="lv-bar-label">{r.label}</span>
          <span className="lv-bar-figure">
            {r.count ? r.count(race.shown[i] ?? 1) : race.landed[i] || r.value <= 0 ? r.figure : ' '}
            {r.delta && race.done && <span className="lv-delta"> {r.delta}</span>}
          </span>
          <span className="lv-bar-track">
            <span
              ref={(el) => {
                fills.current[i] = el
              }}
              className="lv-bar-fill"
              style={{ width: `${(race.len[i] ?? 0) * 100}%` }}
            />
            {r.prev != null && <span className="lv-bar-prev" style={{ left: `${r.prev * 100}%` }} />}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- choice: bars, columns, donut

function ChoiceColumns({ options, counts, shares, top, cls, unit }: { options: string[]; counts: number[]; shares: number[]; top: number; cls: (i: number) => string; unit: string }) {
  const lead = options.map((_, i) => isLead(cls(i)))
  const race = useRace(
    shares.map((x) => (top ? x / top : 0)),
    lead,
  )
  const fills = useRef<(HTMLSpanElement | null)[]>([])
  useLandings(race.landed, lead, race.done, (i, isLeader) => (isLeader ? sparkAt(fills.current[i]!, COLUMN_SPARKS) : flashEnd(fills.current[i], 'top')))
  return (
    <div className="lv-columns" style={{ ['--n' as string]: options.length }}>
      {options.map((o, i) => (
        <div key={i} className={`lv-column ${raceClass(cls(i), race.landed[i], race.done)}`} title={`${o}: ${counts[i]} (${pct(shares[i])} ${unit})`}>
          <div className="lv-column-plot">
            <span
              ref={(el) => {
                fills.current[i] = el
              }}
              className="lv-column-fill"
              style={{ height: `${(race.len[i] ?? 0) * 100}%` }}
            >
              <span className="lv-column-cap">{pct(shares[i] * (race.shown[i] ?? 1))}</span>
            </span>
          </div>
          <span className="lv-bar-mark">{LETTERS[i]}</span>
          <span className="lv-column-label">{o}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * The quiz's headline: "And the answer is…" through the beat, then how many got it right, counting up once the
 * right answer has landed. It keeps its height throughout, so nothing below it jumps.
 */
function QuizHead({ beat, revealed, correct, total, answer }: { beat: boolean; revealed: boolean; correct: number; total: number; answer?: string }) {
  return (
    <div className={`lv-quiz-head${beat ? ' is-beat' : ''}${revealed ? ' is-revealed' : ''}`}>
      {beat ? (
        <span className="lv-quiz-beat">And the answer is…</span>
      ) : (
        <>
          <span className="lv-hero-figure">
            <CountUp value={revealed ? correct : 0} ms={900} />
          </span>
          <span className="lv-hero-unit">
            of {total} got it right
            {answer && (
              <>
                <br />
                the answer: <b>{answer}</b>
              </>
            )}
          </span>
        </>
      )}
    </div>
  )
}

export function ChoiceChart({
  options,
  counts,
  total,
  correct = -1,
  previous,
  chart = 'bars',
  multi,
  quiz,
}: {
  options: string[]
  counts: number[]
  total: number
  correct?: number
  previous?: { counts: number[]; total: number }
  chart?: PollChart
  multi?: boolean
  /** A quiz reveal: a beat, then the race, the ✓ and ✗, and a headline. Polls stay calm. */
  quiz?: boolean
}) {
  const reveal = !!quiz && correct >= 0 && total > 0
  const beat = useBeat(reveal)
  const [revealed, setRevealed] = useState(false)
  const shares = counts.map((c) => share(c, total))
  const prevShares = previous?.counts.map((c) => share(c, previous.total))
  const top = Math.max(0, ...shares, ...(prevShares ?? []))
  const lead = Math.max(0, ...counts)
  const cls = (i: number) => (correct >= 0 ? (i === correct ? 'is-correct' : 'is-wrong') : lead > 0 && counts[i] === lead ? 'is-lead' : '')
  const unit = multi ? 'of people' : 'of votes'
  const summary = `${total} ${total === 1 ? 'answer' : 'answers'}. ` + options.map((o, i) => `${o}: ${counts[i]} (${pct(shares[i])})`).join('; ')
  const table = (
    <SrTable
      caption={summary}
      head={previous ? ['Option', 'Votes', 'Share', 'Before'] : ['Option', 'Votes', 'Share']}
      rows={options.map((o, i) => [o, counts[i], pct(shares[i]), ...(prevShares ? [pct(prevShares[i])] : [])])}
    />
  )
  if (chart === 'donut' && !multi && !previous && !quiz) return <Donut options={options} counts={counts} total={total} cls={cls} summary={summary} table={table} />
  if (chart === 'columns' && !previous && !quiz)
    return (
      <Figure label={summary} table={table}>
        <ChoiceColumns options={options} counts={counts} shares={shares} top={top} cls={cls} unit={unit} />
      </Figure>
    )
  return (
    <Figure label={summary} table={table} className={quiz ? 'lv-quiz' : ''}>
      {reveal && <QuizHead beat={beat} revealed={revealed} correct={counts[correct] ?? 0} total={total} />}
      {previous && (
        <div className="lv-legend">
          <span>
            <i className="lv-key is-bar" /> Now
          </span>
          <span>
            <i className="lv-key is-tick" /> Before
          </span>
        </div>
      )}
      <RowBars
        onReveal={reveal ? () => setRevealed(true) : undefined}
        rows={options.map((o, i) => {
          const d = prevShares ? Math.round((shares[i] - prevShares[i]) * 100) : 0
          return {
            mark: LETTERS[i],
            markAfter: reveal ? (i === correct ? '✓' : '✗') : undefined,
            label: o,
            value: beat || !top ? 0 : shares[i] / top,
            figure: `${counts[i]} · ${pct(shares[i])}`,
            count: (k: number) => `${Math.round(counts[i] * k)} · ${pct(shares[i] * k)}`,
            cls: cls(i),
            prev: prevShares ? (top ? prevShares[i] / top : 0) : undefined,
            delta: prevShares && previous?.total ? (d === 0 ? '±0 pts' : `${d > 0 ? '+' : '−'}${Math.abs(d)} pts`) : undefined,
            title: `${o}: ${counts[i]} (${pct(shares[i])} ${unit})${prevShares ? `, before ${pct(prevShares[i])}` : ''}`,
          }
        })}
      />
      {multi && <div className="lv-footnote">People could pick more than one; shares are of people.</div>}
    </Figure>
  )
}

/**
 * The donut sweeps in clockwise from 12 o'clock on the race's level; each slice shows as the sweep passes it, the
 * total and the legend count with it, and the leader turns gold when the ring closes, pops and throws sparks.
 */
function Donut({
  options,
  counts,
  total,
  cls,
  summary,
  table,
}: {
  options: string[]
  counts: number[]
  total: number
  cls: (i: number) => string
  summary: string
  table: ReactNode
}) {
  const [ref, size] = useSize<HTMLDivElement>()
  const svg = useRef<SVGSVGElement>(null)
  const d = Math.max(120, Math.min(size.width * 0.42, size.font * 13))
  const r = d / 2
  const thick = r * 0.3
  const sum = counts.reduce((a, b) => a + b, 0)
  const race = useRace([sum ? 1 : 0], [true])
  const sweep = Math.min(1, race.level)
  const closed = race.landed[0] ?? false
  const end = -Math.PI / 2 + sweep * Math.PI * 2
  const gap = 2 / (r - thick / 2) // 2px of surface between slices
  const arcs = counts.reduce<{ i: number; s: number; a: number }[]>((acc, c, i) => {
    const s = acc.length ? acc[acc.length - 1].s + acc[acc.length - 1].a : -Math.PI / 2
    acc.push({ i, s, a: sum ? (c / sum) * Math.PI * 2 : 0 })
    return acc
  }, [])
  const seen = (s: number, a: number) => (a <= 0 ? 0 : Math.min(1, Math.max(0, (end - s) / a)))
  const lit = (i: number) => (closed ? cls(i) : cls(i).replace('is-lead', ''))
  const arc = (s: number, e: number) => {
    const ri = r - thick
    const pad = Math.min(gap / 2, (e - s) / 4)
    const s2 = s + pad
    const e2 = e - pad
    const large = e2 - s2 > Math.PI ? 1 : 0
    const p = (rad: number, ang: number) => `${r + rad * Math.cos(ang)} ${r + rad * Math.sin(ang)}`
    return `M${p(r, s2)} A${r} ${r} 0 ${large} 1 ${p(r, e2)} L${p(ri, e2)} A${ri} ${ri} 0 ${large} 0 ${p(ri, s2)} Z`
  }
  useLandings(race.landed, [true], race.done, () => {
    const box = svg.current?.getBoundingClientRect()
    if (!box) return
    for (const { i, s, a } of arcs) {
      if (!cls(i).includes('is-lead') || a <= 0) continue
      svg.current?.querySelector(`[data-slice="${i}"]`)?.animate([{ strokeWidth: '0px' }, { strokeWidth: `${Math.round(thick * 0.28)}px` }, { strokeWidth: '0px' }], { duration: 420, easing: 'ease-out' })
      const mid = s + a / 2
      sparkAt({ x: box.left + r + r * Math.cos(mid), y: box.top + r + r * Math.sin(mid) }, { dir: mid, spread: 1.8, count: 12 })
    }
  })
  return (
    <Figure label={summary} table={table}>
      <div ref={ref} className="lv-donut">
        <svg ref={svg} width={d} height={d} viewBox={`0 0 ${d} ${d}`} data-sweep={Math.round(sweep * 3600) / 10}>
          <circle cx={r} cy={r} r={r - thick / 2} className="lv-donut-track" strokeWidth={thick} fill="none" />
          {arcs.map(({ i, s, a }) => {
            const k = seen(s, a)
            if (k <= 0) return null
            if (a >= Math.PI * 2 - 1e-6 && k >= 1)
              return (
                <circle key={i} data-slice={i} cx={r} cy={r} r={r - thick / 2} className={`lv-donut-arc ${lit(i)}`} strokeWidth={thick} fill="none">
                  <title>{`${options[i]}: ${counts[i]}`}</title>
                </circle>
              )
            return (
              <path key={i} data-slice={i} d={arc(s, s + Math.min(a * k, Math.PI * 2 - 1e-3))} className={`lv-donut-slice ${lit(i)}`}>
                <title>{`${options[i]}: ${counts[i]} (${pct(share(counts[i], sum))})`}</title>
              </path>
            )
          })}
          {arcs.map(({ i, s, a }) =>
            a > 0.38 && seen(s, a) >= 0.5 ? (
              <text
                key={`t${i}`}
                x={r + (r - thick / 2) * Math.cos(s + a / 2)}
                y={r + (r - thick / 2) * Math.sin(s + a / 2)}
                className={`lv-donut-letter ${lit(i)}`}
                dominantBaseline="central"
                textAnchor="middle"
              >
                {LETTERS[i]}
              </text>
            ) : null,
          )}
          <text x={r} y={r + size.font * 0.15} textAnchor="middle" className="lv-donut-total">
            {Math.round(total * sweep)}
          </text>
          <text x={r} y={r + size.font * 1.15} textAnchor="middle" className="lv-donut-unit">
            {total === 1 ? 'vote' : 'votes'}
          </text>
        </svg>
        <ul className="lv-donut-legend">
          {options.map((o, i) => (
            <li key={i} className={lit(i)}>
              <span className="lv-bar-mark">{LETTERS[i]}</span>
              <span className="lv-bar-label">{o}</span>
              <span className="lv-bar-figure">{pct(share(counts[i], sum) * seen(arcs[i].s, arcs[i].a))}</span>
            </li>
          ))}
        </ul>
      </div>
    </Figure>
  )
}

// ---------------------------------------------------------------- scales: rating and agree / disagree

/**
 * The rating's average, as a flag on a pole (round 3, 24 Oct): a gold flag at the top of the plot, a 2px pole down
 * to the axis and a square foot on the axis line, so the figure reads against the scale. It rides the race's level
 * across the plot on a transform, then runs on a little past its value, springs back and sparks. At rest the pole is
 * snapped to the device pixel grid. The "before" mark is the lesser one: a 1px dashed ink pole, an outlined flag in a
 * lower lane and a hollow foot. The flags fly away from each other and away from the plot's edges, so no label ever
 * sits on another label or on a column's count.
 */
type Side = 'left' | 'right'
const AVG_RUN_ON = 0.018 // of the plot's width
const AVG_SPRING_MS = 520

function avgSpring(el: HTMLElement | null, px: number) {
  if (!el || reducedMotion() || !px) return
  const frames: Keyframe[] = []
  const steps = 24
  for (let s = 0; s <= steps; s++) {
    const t = (s / steps) * AVG_SPRING_MS
    const x = px * Math.exp(-t / 120) * Math.sin((t / 95) * (Math.PI / 2))
    frames.push({ transform: `translateX(${x.toFixed(2)}px)` })
  }
  el.animate(frames, { duration: AVG_SPRING_MS, easing: 'linear' })
}

export function RatingChart({
  counts,
  average,
  max,
  minLabel,
  maxLabel,
  previous,
}: {
  counts: number[]
  average: number | null
  max: number
  minLabel: string
  maxLabel: string
  previous?: { average: number | null; total: number }
}) {
  const total = counts.reduce((a, b) => a + b, 0)
  const top = Math.max(0, ...counts)
  const lead = counts.map((n) => top > 0 && n === top)
  const race = useRace(
    counts.map((n) => (top ? n / top : 0)),
    lead,
  )
  const fills = useRef<(HTMLDivElement | null)[]>([])
  const [wrap, size] = useSize<HTMLDivElement>()
  const body = useRef<HTMLDivElement>(null)
  const flag = useRef<HTMLSpanElement>(null)
  const prevFlag = useRef<HTMLSpanElement>(null)
  // Where the plot starts on the page, so a resting pole can land on whole device pixels.
  const [origin, setOrigin] = useState(0)
  const [sides, setSides] = useState<[Side, Side]>(['right', 'left'])
  const fmt = (n: number) => n.toFixed(1)
  const before = previous?.average ?? null
  // The average sits between column centres: 1 is the first centre, max the last.
  const xOf = (v: number) => ((v - 0.5) / max) * size.width
  const snap = (x: number) => {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    return Math.round((origin + x) * dpr) / dpr - origin
  }
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    setOrigin(el.getBoundingClientRect().left)
    // Each flag flies right unless that runs off the plot; the before flag flies away from the average's pole.
    const fits = (x: number, w: number, s: Side) => (s === 'right' ? x + w <= size.width : x - w >= 0)
    const pick = (x: number, w: number, want: Side): Side => (fits(x, w, want) ? want : want === 'right' ? 'left' : 'right')
    const a = average == null ? 'right' : pick(xOf(average), flag.current?.offsetWidth ?? 0, 'right')
    const b = before == null ? 'left' : pick(xOf(before), prevFlag.current?.offsetWidth ?? 0, average != null && before > average ? 'right' : 'left')
    setSides((s) => (s[0] === a && s[1] === b ? s : [a, b]))
  }, [average, before, size.width, max]) // eslint-disable-line react-hooks/exhaustive-deps
  // Columns flash as they land. The average is the one gold thing: it arrives with the tallest column, runs on, sparks.
  useLandings(race.landed, lead, race.done, (i, isLeader) => {
    flashEnd(fills.current[i], 'top')
    if (isLeader && body.current && !body.current.dataset.landed) {
      body.current.dataset.landed = '1'
      avgSpring(body.current, AVG_RUN_ON * size.width)
      hop(flag.current, 10, 240)
      sparkAt(flag.current!, { edge: 'top', dir: -Math.PI / 2, spread: 2.4, count: 10 })
    }
  })
  const summary = `Average ${average ?? 'none yet'} out of ${max}, ${total} ${total === 1 ? 'answer' : 'answers'}${before != null ? `, before ${before}` : ''}.`
  // Travel on the race's level from the first column's centre; rest snapped to the pixel grid.
  const avgX = average == null ? null : race.done || race.level >= 1 ? snap(xOf(average)) : xOf(0.5 + (average - 0.5) * race.level)
  return (
    <Figure label={summary} className="lv-rating" table={<SrTable caption={summary} head={['Rating', 'Answers']} rows={counts.map((c, i) => [i + 1, c])} />}>
      <div className="lv-rating-hero">
        {/* The hero counts with the race, in step with the marker. Its box is the widest figure the scale can show,
            whatever it reads now, so the plot beside it never moves (B1, round 3). */}
        <span className="lv-hero-figure lv-hero-fixed">
          <span className="lv-hero-ghost">{max >= 10 ? '10.0' : '0.0'}</span>
          <span>{average == null ? '–' : fmt(Math.round(average * Math.min(1, race.level) * 10) / 10)}</span>
        </span>
        <span className="lv-hero-unit">
          average of {max}
          {before != null && (
            <>
              <br />
              before {fmt(before)}
            </>
          )}
        </span>
      </div>
      <div className="lv-rating-plot">
        <div ref={wrap} className={`lv-cols-wrap${before != null ? ' has-prev' : ''}`}>
          <div className="lv-cols">
            {counts.map((n, i) => (
              <div key={i} className={`lv-col${lead[i] && race.landed[i] ? ' is-lead' : ''}${race.landed[i] || (n === 0 && race.done) ? ' is-landed' : ''}`} title={`${i + 1}: ${n} ${n === 1 ? 'answer' : 'answers'}`}>
                <div
                  ref={(el) => {
                    fills.current[i] = el
                  }}
                  className="lv-col-fill"
                  style={{ height: `${(race.len[i] ?? 0) * 100}%` }}
                >
                  <span className="lv-col-cap">{n}</span>
                </div>
              </div>
            ))}
          </div>
          {before != null && size.width > 0 && (
            <div className={`lv-avg is-prev is-${sides[1]}`} style={{ transform: `translateX(${snap(xOf(before))}px)` }} title={`Before: ${before}`}>
              <span ref={prevFlag} className="lv-avg-flag">
                Before {fmt(before)}
              </span>
              <i className="lv-avg-pole" />
              <i className="lv-avg-foot" />
            </div>
          )}
          {avgX != null && (
            <div className={`lv-avg is-${sides[0]}${race.done ? ' is-landed' : ''}`} style={{ transform: `translateX(${avgX}px)` }} title={`Average: ${average}`}>
              <div ref={body} className="lv-avg-body">
                <span ref={flag} className="lv-avg-flag">
                  Average {fmt(average!)}
                </span>
                <i className="lv-avg-pole" />
                <i className="lv-avg-foot" />
              </div>
            </div>
          )}
        </div>
        <div className="lv-axis">
          {counts.map((_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <div className="lv-scale-ends">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      </div>
    </Figure>
  )
}

type Spread = {
  s: number[]
  /** Each segment's right edge, 0 to 1, left to right (Strongly disagree first). */
  ends: number[]
  dis: number
  agr: number
  neu: number
  /** Where the room sits on −2 … +2. */
  lean: number
}
function spread(c: number[], t: number): Spread {
  const s = c.map((x) => share(x, t))
  const ends = s.reduce<number[]>((acc, p, i) => [...acc, (i ? acc[i - 1] : 0) + p], [])
  return { s, ends: ends.map((e) => (t ? Math.min(1, e) : 0)), dis: s[0] + s[1], agr: s[3] + s[4], neu: s[2], lean: s.reduce((a, p, i) => a + p * (i - 2), 0) }
}
const leanText = (v: number) => (Math.abs(v) < 0.2 ? 'Evenly split' : v > 0 ? 'Leans agree' : 'Leans disagree')
const signed = (v: number) => (Math.abs(v) < 0.05 ? '±0.0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** The full-width stacked bar: every segment at its final place, revealed left to right by `sweep` (a clip). */
function StackBar({ v, sweep, thin, segRef, fit }: { v: Spread; sweep: number; thin?: boolean; segRef?: (i: number, el: HTMLSpanElement | null) => void; fit?: boolean[] }) {
  return (
    <div className={`lv-stack-bar${thin ? ' is-thin' : ''}`} style={sweep < 1 ? { clipPath: `inset(0 ${(1 - sweep) * 100}% 0 0)` } : undefined}>
      {v.s.map((p, i) =>
        p > 0 ? (
          <span
            key={i}
            ref={(el) => segRef?.(i, el)}
            className={`lv-div-seg is-${i + 1}${!thin && sweep >= v.ends[i] - 1e-6 ? ' is-landed' : ''}`}
            style={{ left: `${(v.ends[i] - p) * 100}%`, width: `${p * 100}%` }}
            title={`${AGREE_LABELS[i]}: ${pct(p)}`}
          >
            {!thin && <b className={fit?.[i] === false ? 'is-hidden' : ''}>{pct(p)}</b>}
          </span>
        ) : null,
      )}
    </div>
  )
}

/**
 * The five-point agree scale (round 3, 24 Oct): one full-width 100% stacked bar, Strongly disagree to Strongly agree,
 * so the whole width always means something, whichever way the room goes. It sweeps in left to right on the race,
 * each segment flashing as the sweep passes its end; percentages sit inside, names under. Then the room's lean on
 * −2 … +2 drops in as a gold flag on its own axis. Compared: the before bar runs thin under it, and the lean axis
 * shows where the room was and the move to now.
 */
export function AgreeChart({ counts, previous }: { counts: number[]; previous?: { counts: number[]; total: number } }) {
  const total = counts.reduce((a, b) => a + b, 0)
  const now = spread(counts, total)
  const before = previous && previous.total > 0 ? spread(previous.counts, previous.total) : null
  const race = useRace(now.ends, [false, false, false, false, false], { bounce: false })
  const sweep = race.len[4] ?? 0
  const segs = useRef<(HTMLSpanElement | null)[]>([])
  useLandings(race.landed, [false, false, false, false, false], race.done, (i) => flashEnd(segs.current[i], 'right'))
  const k = (from: number, to: number) => (to > from ? clamp01((sweep - from) / (to - from)) : 1)
  const has = total > 0
  // The lean flag drops in after the bar is whole, bounces and sparks.
  const drop = useDrop(race.done && has, 56, 520)
  const needle = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!race.done || !has) return
    const t = setTimeout(() => sparkAt(needle.current!, { edge: 'top', dir: -Math.PI / 2, spread: 2.4, count: 10 }), 520)
    return () => clearTimeout(t)
  }, [race.done, has])
  // Names under the segments and percentages inside them show only where they fit; the legend covers the rest.
  const [plot, size] = useSize<HTMLDivElement>()
  const names = useRef<(HTMLSpanElement | null)[]>([])
  const [fit, setFit] = useState<{ pct: boolean[]; name: boolean[] }>({ pct: [], name: [] })
  useLayoutEffect(() => {
    const w = size.width
    if (!w) return
    const room = (i: number) => now.s[i] * w - 8
    const p = now.s.map((_, i) => {
      const b = segs.current[i]?.querySelector('b') as HTMLElement | null
      return !!b && b.scrollWidth <= room(i)
    })
    const n = now.s.map((_, i) => !!names.current[i] && names.current[i]!.scrollWidth <= room(i))
    setFit((f) => (f.pct.join() === p.join() && f.name.join() === n.join() ? f : { pct: p, name: n }))
  }, [size.width, size.font, now.s.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const lx = (v: number) => `${((v + 2) / 4) * 100}%`
  const side = now.lean > 0 ? 'is-left' : 'is-right'
  const summary =
    `${total} ${total === 1 ? 'answer' : 'answers'}: ${pct(now.agr)} agree, ${pct(now.neu)} neutral, ${pct(now.dis)} disagree; ${leanText(now.lean).toLowerCase()}, ${signed(now.lean)} on −2 to +2` +
    (before ? `; before: ${pct(before.agr)} agree, ${pct(before.dis)} disagree, ${signed(before.lean)}` : '') +
    '.'
  return (
    <Figure
      label={summary}
      className="lv-agree"
      table={
        <SrTable
          caption={summary}
          head={before ? ['Answer', 'Now', 'Before'] : ['Answer', 'Share']}
          rows={AGREE_LABELS.map((l, i) => [l, pct(now.s[i]), ...(before ? [pct(before.s[i])] : [])])}
        />
      }
    >
      <div className="lv-div-hero">
        <span className="is-dis">
          <b>{pct(now.dis * k(0, now.ends[1]))}</b>
          <em>disagree</em>
        </span>
        <span className="is-agr">
          <b>{pct(now.agr * k(now.ends[2], now.ends[4]))}</b>
          <em>agree</em>
        </span>
      </div>
      <div className="lv-div-row">
        {before && <span className="lv-div-label">Now</span>}
        <div ref={plot} className="lv-stack-plot">
          <StackBar
            v={now}
            sweep={has ? sweep : 0}
            segRef={(i, el) => {
              segs.current[i] = el
            }}
            fit={fit.pct}
          />
          <div className="lv-stack-names">
            {now.s.map((p, i) =>
              p > 0 ? (
                <span
                  key={i}
                  ref={(el) => {
                    names.current[i] = el
                  }}
                  className={`${fit.name[i] === false ? 'is-hidden' : ''}${sweep >= now.ends[i] - 1e-6 && has ? ' is-landed' : ''}`}
                  style={{ left: `${(now.ends[i] - p / 2) * 100}%` }}
                >
                  {AGREE_LABELS[i]}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
      {before && (
        <div className="lv-div-row is-before">
          <span className="lv-div-label">Before</span>
          <div className="lv-stack-plot">
            <StackBar v={before} sweep={1} thin />
            <span className="lv-div-was">
              <span>was {pct(before.dis)}</span>
              <span>was {pct(before.agr)}</span>
            </span>
          </div>
        </div>
      )}
      <div className="lv-div-row is-lean">
        <span className="lv-div-label">Lean</span>
        <div className="lv-lean">
          <i className="lv-lean-axis" />
          {[-2, -1, 0, 1, 2].map((t) => (
            <span key={t} className="lv-lean-tick" style={{ left: lx(t) }}>
              {t > 0 ? `+${t}` : t < 0 ? `−${-t}` : '0'}
            </span>
          ))}
          {before && <i className="lv-lean-was" style={{ left: lx(before.lean) }} title={`Before: ${signed(before.lean)}`} />}
          {before && has && (
            <i
              className={`lv-lean-move${drop === 0 && race.done ? ' is-on' : ''}`}
              style={{ left: lx(Math.min(before.lean, now.lean)), width: `${(Math.abs(now.lean - before.lean) / 4) * 100}%` }}
            />
          )}
          {has && (
            <span className={`lv-lean-needle ${side}${race.done ? ' is-on' : ''}`} style={{ left: lx(now.lean), transform: `translateY(${drop}px)` }}>
              <span ref={needle} className="lv-lean-flag">
                {leanText(now.lean)} <b>{signed(now.lean)}</b>
                {before && <em> · was {signed(before.lean)}</em>}
              </span>
              <i className="lv-lean-pin" />
            </span>
          )}
        </div>
      </div>
      {fit.name.some((f) => f === false) && (
        <div className="lv-legend is-quiet">
          {AGREE_LABELS.map((l, i) => (
            <span key={l}>
              <i className={`lv-key is-div-${i + 1}`} /> {l}
            </span>
          ))}
        </div>
      )}
    </Figure>
  )
}

// ---------------------------------------------------------------- quiz tiles (the presenter)

type Tile = { mark: string; text: string; count: number; right: boolean }
/** The wrong tiles shatter this far apart, then the right one wins. */
const SHATTER_GAP = 250

/** How many of `at` (ms after `active` turned true) have passed. Reduced motion: all of them at once. */
function useSteps(active: boolean, at: number[]): number {
  const [was, setWas] = useState(false)
  const [n, setN] = useState(0)
  if (active !== was) {
    setWas(active)
    setN(active && reducedMotion() ? at.length : 0)
  }
  const key = at.join()
  useEffect(() => {
    if (!active || reducedMotion()) return
    const ts = key.split(',').map((ms, k) => setTimeout(() => setN(k + 1), +ms))
    return () => ts.forEach(clearTimeout)
  }, [active, key])
  return active ? n : 0
}

/**
 * A quiz on the presenter (round 3, 24 Oct): the options as big answer tiles, there while the question runs. After
 * the buzzer: "And the answer is…", then the wrong tiles shatter one by one (least picked first), each leaving a dimmed,
 * smaller tile with ✗ and its count; then the right tile grows, takes a big gold ✓, a gold edge and sparks; then the
 * headline counts up. Sound, when the presenter has it on: a swell over the beat, a thud per tile, a chime for the win.
 */
function QuizTiles({ tiles, total, correct, reveal, label, table }: { tiles: Tile[]; total: number; correct: number; reveal: boolean; label: string; table: ReactNode }) {
  const beat = useBeat(reveal)
  const order = useMemo(
    () =>
      tiles
        .map((_, i) => i)
        .filter((i) => !tiles[i].right)
        .sort((a, b) => tiles[a].count - tiles[b].count || a - b),
    [tiles],
  )
  const w = order.length
  const at = [...order.map((_, k) => k * SHATTER_GAP), w * SHATTER_GAP + 150, w * SHATTER_GAP + 650]
  const n = useSteps(reveal && !beat, at)
  const gone = Math.min(n, w)
  const won = n > w
  const head = n > w + 1
  const els = useRef<(HTMLDivElement | null)[]>([])
  const shown = useRef({ gone: 0, won: false })
  useEffect(() => {
    if (beat) cue('swell')
  }, [beat])
  useLayoutEffect(() => {
    const s = shown.current
    if (gone < s.gone || (!won && s.won)) {
      shown.current = { gone, won }
      return
    }
    for (let k = s.gone; k < gone; k++) {
      shatter(els.current[order[k]])
      if (!reducedMotion()) cue('thud')
    }
    if (won && !s.won) {
      const i = tiles.findIndex((t) => t.right)
      sparkAt(els.current[i]!, { edge: 'top', dir: -Math.PI / 2, spread: 2.8, count: 16, speed: 420 })
      cue('chime')
    }
    shown.current = { gone, won }
  }, [gone, won]) // eslint-disable-line react-hooks/exhaustive-deps
  const cols = tiles.length <= 3 ? tiles.length : tiles.length === 4 ? 2 : 3
  return (
    <Figure label={label} table={table} className="lv-quiz lv-quiz-tiles">
      {/* The headline's slot is there from the first frame, so the reveal transforms the tiles in place. */}
      {reveal ? <QuizHead beat={beat} revealed={head} correct={correct} total={total} /> : <div className="lv-quiz-head is-waiting" aria-hidden />}
      <div className="lv-answers" style={{ ['--cols' as string]: Math.max(1, cols) }}>
        {tiles.map((t, i) => {
          const out = !t.right && order.indexOf(i) < gone
          const win = t.right && won
          return (
            <div
              key={i}
              ref={(el) => {
                els.current[i] = el
              }}
              className={`lv-answer${out ? ' is-out' : ''}${win ? ' is-right' : ''}`}
            >
              {t.mark && <span className="lv-answer-mark">{t.mark}</span>}
              <span className="lv-answer-text">{t.text}</span>
              <span className="lv-answer-verdict">{win ? '✓' : out ? '✗' : ''}</span>
              <span className="lv-answer-count">
                {out || win ? (
                  <>
                    <b>{t.count}</b> {t.count === 1 ? 'answer' : 'answers'}
                  </>
                ) : (
                  ' '
                )}
              </span>
            </div>
          )
        })}
      </div>
    </Figure>
  )
}

// ---------------------------------------------------------------- typed quiz

/** A typed quiz after the buzzer: the beat, the headline, and what the room typed (accepted answers gold with ✓). */
export function TypedChart({ correct, total, answers, accepted }: { correct: number; total: number; answers: { text: string; count: number; ok: boolean }[]; accepted?: string[] }) {
  const top = Math.max(1, ...answers.map((a) => a.count))
  const beat = useBeat(total > 0)
  const [revealed, setRevealed] = useState(false)
  const summary = `${correct} of ${total} got it${accepted?.length ? `: ${accepted[0]}` : ''}. Most typed: ${answers
    .slice(0, 5)
    .map((a) => `${a.text} (${a.count})`)
    .join(', ')}`
  return (
    <Figure label={summary} className="lv-quiz" table={<SrTable caption={summary} head={['Typed', 'People', 'Accepted']} rows={answers.map((a) => [a.text, a.count, a.ok ? 'yes' : 'no'])} />}>
      {total > 0 ? <QuizHead beat={beat} revealed={revealed} correct={correct} total={total} answer={accepted?.[0]} /> : <span className="lv-hero-figure">–</span>}
      <RowBars
        onReveal={() => setRevealed(true)}
        rows={answers.map((a) => ({
          mark: '·',
          markAfter: a.ok ? '✓' : '✗',
          label: a.text,
          value: beat ? 0 : a.count / top,
          figure: String(a.count),
          cls: a.ok ? 'is-correct' : 'is-wrong',
          title: `${a.text}: ${a.count}${a.ok ? ', accepted' : ''}`,
        }))}
      />
    </Figure>
  )
}

/** A typed quiz on the presenter: the accepted answer is the right tile; the most common wrong answers shatter. */
function TypedTiles({ correct, total, answers, accepted }: { correct: number; total: number; answers: { text: string; count: number; ok: boolean }[]; accepted?: string[] }) {
  const tiles = useMemo(() => {
    const right: Tile = { mark: '', text: accepted?.[0] ?? answers.find((a) => a.ok)?.text ?? '–', count: correct, right: true }
    const wrong = answers
      .filter((a) => !a.ok)
      .slice(0, 3)
      .map((a) => ({ mark: '', text: a.text, count: a.count, right: false }))
    return [right, ...wrong].sort((a, b) => b.count - a.count)
  }, [answers, accepted, correct])
  const summary = `${correct} of ${total} got it${accepted?.length ? `: ${accepted[0]}` : ''}. Most typed: ${answers
    .slice(0, 5)
    .map((a) => `${a.text} (${a.count})`)
    .join(', ')}`
  return <QuizTiles tiles={tiles} total={total} correct={correct} reveal={total > 0} label={summary} table={<SrTable caption={summary} head={['Typed', 'People', 'Accepted']} rows={answers.map((a) => [a.text, a.count, a.ok ? 'yes' : 'no'])} />} />
}

// ---------------------------------------------------------------- rank and points

export function RankChart({ options, scores, avg, firsts, total }: { options: string[]; scores: number[]; avg: (number | null)[]; firsts: number[]; total: number }) {
  const order = options.map((_, i) => i).sort((a, b) => scores[b] - scores[a] || a - b)
  const top = Math.max(0, ...scores)
  const summary = `The room's order, from ${total} ${total === 1 ? 'ranking' : 'rankings'}: ` + order.map((i, k) => `${k + 1}. ${options[i]}`).join(', ')
  return (
    <Figure
      label={summary}
      table={<SrTable caption={summary} head={['Option', 'Average place', 'Ranked first']} rows={order.map((i) => [options[i], avg[i] ?? '–', firsts[i]])} />}
    >
      <RowBars
        rows={order.map((i, k) => ({
          mark: String(k + 1).padStart(2, '0'),
          label: options[i],
          value: top ? scores[i] / top : 0,
          figure: avg[i] != null ? `avg #${avg[i]}` : '–',
          delta: firsts[i] ? `· ${firsts[i]}× first` : undefined,
          cls: total && k === 0 ? 'is-lead' : '',
          title: `${options[i]}: average place ${avg[i] ?? '–'}, ranked first by ${firsts[i]}`,
        }))}
      />
    </Figure>
  )
}

export function PointsChart({ options, totals, total }: { options: string[]; totals: number[]; total: number }) {
  const sum = totals.reduce((a, b) => a + b, 0)
  const order = options.map((_, i) => i).sort((a, b) => totals[b] - totals[a] || a - b)
  const top = Math.max(0, ...totals)
  const summary = `${total} ${total === 1 ? 'person' : 'people'} spent ${sum} points: ` + order.map((i) => `${options[i]} ${totals[i]}`).join(', ')
  return (
    <Figure label={summary} table={<SrTable caption={summary} head={['Option', 'Points', 'Share']} rows={order.map((i) => [options[i], totals[i], pct(share(totals[i], sum))])} />}>
      <RowBars
        rows={order.map((i, k) => ({
          mark: LETTERS[i],
          label: options[i],
          value: top ? totals[i] / top : 0,
          figure: `${totals[i].toLocaleString('en')} pts · ${pct(share(totals[i], sum))}`,
          cls: sum && k === 0 ? 'is-lead' : '',
          title: `${options[i]}: ${totals[i]} points`,
        }))}
      />
    </Figure>
  )
}

// ---------------------------------------------------------------- prediction: histogram + truth

/** One scoreboard figure on the prediction slide: it counts up from zero once its turn comes. */
function Stat({ label, value, gold, hint, on, format }: { label: string; value: number | null; gold?: boolean; hint?: string; on: boolean; format: (n: number) => string }) {
  return (
    <div className={`lv-stat${gold ? ' is-gold' : ''}${on ? ' is-on' : ''}`} title={hint}>
      <span>{label}</span>
      <b>{value == null ? '–' : <CountUp value={on ? value : 0} ms={520} format={format} />}</b>
    </div>
  )
}

/** Round an in-between count to the final figure's own decimals, so "6.5 h" counts 0, 0.1 … and never shows 6.4999. */
const countFormat = (final: number, unit?: string) => {
  const dp = Math.min(2, (String(final).split('.')[1] ?? '').length)
  return (n: number) => formatNumber(Math.round(n * 10 ** dp) / 10 ** dp, unit)
}

const PIN_MS = 420
const TRUTH_DELAY_MS = 520
const DROP_MS = 560
const STAT_STEP_MS = 230

/**
 * The prediction reveal (round 2), in order: the guesses race up; the room's median arrives as an ink pin with a chip
 * on the bottom axis; the truth drops from the top as a gold flag line with a gold chip, bounces on the axis and
 * sparks; a bracket between the two says how far off the room was; then the scoreboard counts up, one figure at a
 * time. Rows of labels are fixed (truth chip, then the bracket's label, then the tallest column's count; the median
 * chip below the axis), so no two labels can meet.
 */
export function HistogramChart({ slide, values, median, reveal }: { slide: NumberSlide; values: number[]; median: number | null; reveal: boolean }) {
  const [ref, size] = useSize<HTMLDivElement>()
  const svg = useRef<SVGSVGElement>(null)
  const narrow = size.width < 480
  const bins = useMemo(() => binValues(values, slide.min, slide.max, narrow ? 10 : 16), [values, slide.min, slide.max, narrow])
  const truth = reveal ? slide.answer : undefined
  const W = size.width
  const f = size.font
  const H = Math.max(f * 12, Math.min(W * 0.42, f * 16))
  // Label rows: truth chip (0–1.5f), the bracket's label and line (1.8–3.3f), the tallest column's count (3.6–4.3f);
  // below the axis, the median chip (0.4–1.8f under it), then the ticks.
  const m = { top: f * 4.6, bottom: f * 3.6, left: 4, right: 4 }
  const pw = Math.max(0, W - m.left - m.right)
  const ph = Math.max(0, H - m.top - m.bottom)
  const base = m.top + ph
  const lo = bins[0]?.from ?? slide.min
  const hi = bins[bins.length - 1]?.to ?? slide.max
  const x = (v: number) => m.left + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * pw
  const top = Math.max(1, ...bins.map((b) => b.count))
  const bw = pw / Math.max(1, bins.length)
  const tickEvery = Math.max(1, Math.ceil(bins.length / (narrow ? 4 : 8)))
  const unit = slide.unit
  // The room's surprisal uses fixed bins (10 across the slide's range), never the chart's, so the phone and the
  // shared screen print the same number.
  const surprise = useMemo(() => (truth != null ? roomSurprisal(binValues(values, slide.min, slide.max, 10), truth) : null), [values, slide.min, slide.max, truth])
  const within = truth != null ? withinShare(values, truth, slide.max - slide.min) : null
  const tallest = bins.reduce((best, b, i) => (b.count > bins[best].count ? i : best), 0)
  const race = useRace(
    bins.map((b) => b.count / top),
    bins.map((b, i) => i === tallest && b.count > 0),
  )
  // The reveal's clock: 0 racing · 1 median pinned · 2 truth falling · 3 truth landed, then the stats count.
  const still = reducedMotion()
  const [stepped, setStep] = useState(0)
  const [counted, setStats] = useState(0)
  const hasTruth = truth != null
  // Reduced motion: the outcome at once, without the travel.
  const step = still ? (race.done ? 3 : 0) : stepped
  const stats = still ? 5 : counted
  useEffect(() => {
    if (!race.done || still) return
    const ts = [setTimeout(() => setStep(1), 0)]
    if (hasTruth) {
      ts.push(setTimeout(() => setStep(2), PIN_MS + TRUTH_DELAY_MS - 400))
      ts.push(setTimeout(() => setStep(3), PIN_MS + TRUTH_DELAY_MS - 400 + DROP_MS))
    } else ts.push(setTimeout(() => setStep(3), PIN_MS))
    return () => ts.forEach(clearTimeout)
  }, [race.done, hasTruth, still])
  useEffect(() => {
    if (step < 3 || still) return
    const ts = [0, 1, 2, 3, 4].map((k) => setTimeout(() => setStats(k + 1), k * STAT_STEP_MS))
    return () => ts.forEach(clearTimeout)
  }, [step, still])
  const drop = useDrop(step >= 2 && hasTruth, Math.max(f * 4, m.top + ph * 0.5), DROP_MS)
  // Sparks where the truth's foot meets the axis, on its landing.
  useEffect(() => {
    if (step !== 3 || !hasTruth || !svg.current) return
    const b = svg.current.getBoundingClientRect()
    sparkAt({ x: b.left + x(truth!), y: b.top + base }, { dir: -Math.PI / 2, spread: 2.6, count: 12 })
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps
  const summary =
    `${values.length} ${values.length === 1 ? 'guess' : 'guesses'}` +
    (median != null ? `, median ${formatNumber(median, unit)}` : '') +
    (truth != null ? `, the truth is ${formatNumber(truth, unit)}` : '') +
    (surprise != null ? `, room surprise ${surprise} bits` : '') +
    '.'
  // Chips are measured as mono text (0.6 of the font size per character at the chip's 0.56em) and kept inside the plot.
  const chipW = (text: string) => text.length * f * 0.56 * 0.62 + f * 0.9
  const chipX = (v: number, text: string) => {
    const w = chipW(text)
    return Math.min(Math.max(x(v) - w / 2, m.left), W - m.right - w)
  }
  const medianText = median != null ? `Room median ${formatNumber(median, unit)}` : ''
  const truthText = truth != null ? `The truth: ${formatNumber(truth, unit)}` : ''
  const off = truth != null && median != null ? Math.abs(median - truth) : 0
  const offText = `off by ${formatNumber(Math.round(off * 100) / 100, unit)}`
  const showMedian = median != null && values.length > 0 && step >= 1
  const bracket = showMedian && truth != null && step >= 3 && off > 0 && Math.abs(x(median!) - x(truth)) >= 6
  return (
    <Figure
      label={summary}
      className="lv-hist"
      table={<SrTable caption={summary} head={['From', 'To', 'Guesses']} rows={bins.map((b) => [formatNumber(b.from), formatNumber(b.to), b.count])} />}
    >
      <div className="lv-stats is-board">
        <Stat label="Guesses" value={values.length} on={stats >= 1 || !hasTruth} format={(n) => String(Math.round(n))} />
        <Stat label="Room median" value={median} on={stats >= 2 || !hasTruth} format={countFormat(median ?? 0, unit)} />
        {truth != null && <Stat label="The truth" value={truth} gold on={stats >= 3} format={countFormat(truth, unit)} />}
        {within != null && <Stat label={`Within ±${formatNumber((slide.max - slide.min) * 0.1, unit)}`} value={Math.round(within * 100)} on={stats >= 4} format={(n) => `${Math.round(n)}%`} />}
        {surprise != null && (
          <Stat label="Surprise" value={surprise} on={stats >= 5} format={(n) => `${countFormat(surprise)(n)} bits`} hint="How unexpected the truth was to this room: −log₂ of the share of guesses near it." />
        )}
      </div>
      <div ref={ref} className="lv-hist-plot">
        {W > 0 && (
          <svg ref={svg} width={W} height={H} className={race.done ? 'is-done' : undefined}>
            {bins.map((b, i) => {
              const h = (race.len[i] ?? 0) * ph
              return (
                <g key={i}>
                  <rect className={`lv-hist-col${i === tallest && b.count && race.landed[i] ? ' is-tall' : ''}`} x={x(b.from) + 1} y={base - h} width={Math.max(1, bw - 2)} height={h}>
                    <title>{`${formatNumber(b.from)}–${formatNumber(b.to)}${unit ? ` ${unit}` : ''}: ${b.count} ${b.count === 1 ? 'guess' : 'guesses'}`}</title>
                  </rect>
                  {i === tallest && b.count > 0 && race.landed[i] && (
                    <text className="lv-hist-cap" x={x(b.from) + bw / 2} y={base - h - f * 0.3} textAnchor="middle">
                      {b.count}
                    </text>
                  )}
                </g>
              )
            })}
            <line className="lv-hist-base" x1={m.left} x2={W - m.right} y1={base + 0.5} y2={base + 0.5} />
            {bins.map((b, i) =>
              i % tickEvery === 0 ? (
                <text key={i} className="lv-hist-tick" x={x(b.from)} y={H - f * 0.4} textAnchor={i === 0 ? 'start' : 'middle'}>
                  {formatNumber(b.from)}
                </text>
              ) : null,
            )}
            <text className="lv-hist-tick" x={W - m.right} y={H - f * 0.4} textAnchor="end">
              {formatNumber(hi, unit)}
            </text>
            {showMedian && (
              <g className="lv-hist-pin">
                {/* A surface ring keeps the pin visible where it crosses a column. */}
                <line className="lv-hist-ring" x1={x(median!)} x2={x(median!)} y1={m.top - f * 0.2} y2={base} />
                <line className="lv-hist-median" x1={x(median!)} x2={x(median!)} y1={m.top - f * 0.2} y2={base} />
                <circle className="lv-hist-pinhead" cx={x(median!)} cy={m.top - f * 0.2} r={Math.max(4, f * 0.22)} />
                <g className="lv-hist-chip is-median" transform={`translate(${chipX(median!, medianText)} ${base + f * 0.4})`}>
                  <rect width={chipW(medianText)} height={f * 1.3} />
                  <text x={f * 0.45} y={f * 0.88}>
                    {medianText}
                  </text>
                </g>
              </g>
            )}
            {bracket && (
              <g className="lv-hist-bracket">
                <path d={`M${x(median!)} ${f * 3.3} V${f * 2.9} H${x(truth!)} V${f * 3.3}`} />
                <text x={(x(median!) + x(truth!)) / 2} y={f * 2.6} textAnchor="middle">
                  {offText}
                </text>
              </g>
            )}
            {truth != null && step >= 2 && (
              <g className={`lv-hist-truthmark${step >= 3 ? ' is-landed' : ''}`} transform={`translate(0 ${drop})`}>
                <line className="lv-hist-ring is-truth" x1={x(truth)} x2={x(truth)} y1={f * 1.5} y2={base} />
                <line className="lv-hist-truth" x1={x(truth)} x2={x(truth)} y1={f * 1.5} y2={base} />
                <g className="lv-hist-chip is-truth" transform={`translate(${chipX(truth, truthText)} ${f * 0.15})`}>
                  <rect width={chipW(truthText)} height={f * 1.35} />
                  <text x={f * 0.45} y={f * 0.92}>
                    {truthText}
                  </text>
                </g>
              </g>
            )}
          </svg>
        )}
      </div>
    </Figure>
  )
}

// ---------------------------------------------------------------- 2×2: scatter

function quadrantRows(slide: GridSlide, points: { x: number; y: number }[]): (string | number)[][] {
  const names = slide.quadrants ?? [`${slide.xLow}, ${slide.yHigh}`, `${slide.xHigh}, ${slide.yHigh}`, `${slide.xLow}, ${slide.yLow}`, `${slide.xHigh}, ${slide.yLow}`]
  const n = [0, 0, 0, 0]
  for (const p of points) n[(p.y >= 50 ? 0 : 2) + (p.x >= 50 ? 1 : 0)]++
  return names.map((name, i) => [name || `Quadrant ${i + 1}`, n[i]])
}

const GRID_SPAN_MS = 1600
const GRID_FALL_MS = 460
const MEAN_FALL_MS = 520

/** Keyframes for a fall of `d` px under gravity (one motion value, sampled: offset = -d(1 - u²)), then `hops`. */
function fallFrames(d: number, hops = 0, ms = 1): { frames: Keyframe[]; total: number } {
  const h1 = hops ? ms * 0.42 : 0
  const h2 = hops > 1 ? ms * 0.21 : 0
  const total = ms + h1 + h2
  const frames: Keyframe[] = []
  const n = 20
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * total
    let y: number
    if (t <= ms) y = -d * (1 - (t / ms) ** 2)
    else if (t <= ms + h1) {
      const u = (t - ms) / h1
      y = -d * 0.12 * 4 * u * (1 - u)
    } else {
      const u = (t - ms - h1) / h2
      y = -d * 0.03 * 4 * u * (1 - u)
    }
    frames.push({ transform: `translateY(${y.toFixed(2)}px)`, offset: t / total })
  }
  return { frames, total }
}

/**
 * The 2×2 (round 2). The quadrants are tiles with their name and a big count in the corner. On the shared screen the
 * dots drop in from above under gravity, in a fixed shuffled order over 1.6 s, each landing with a tiny squash; the
 * quadrant with the most people then takes a gold wash, and the room's average (the gold diamond) drops in last,
 * bounces and sparks. Answers stay anonymous: no names on dots.
 */
export function GridChart({
  slide,
  points,
  mean,
  onPick,
  mine,
  fit,
}: {
  slide: GridSlide
  points: { x: number; y: number }[]
  mean: { x: number; y: number } | null
  /** Phones: tap to place your dot. */
  onPick?: (p: { x: number; y: number }) => void
  mine?: { x: number; y: number } | null
  /** The shared screen: keep the square inside the window's height, with the quadrant counts in the tiles. */
  fit?: boolean
}) {
  const [ref, size] = useSize<HTMLDivElement>()
  const svg = useRef<SVGSVGElement>(null)
  const clip = 'lv-grid-clip-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const f = size.font
  const m = { left: f * 1.7, top: 4, bottom: f * 1.7 }
  const side = Math.max(0, Math.min(size.width - m.left - 4, f * 22, fit ? window.innerHeight * 0.5 : Infinity))
  const tally = quadrantRows(slide, points)
  const W = side + m.left + 4
  const H = side + m.top + m.bottom
  const X = (v: number) => m.left + (v / 100) * side
  const Y = (v: number) => m.top + (1 - v / 100) * side
  const r = Math.max(4, side * 0.012)
  const counts = tally.map((t) => t[1] as number)
  const most = Math.max(0, ...counts)
  const animate = !!fit && !reducedMotion()
  const [dropped, setDropped] = useState(false)
  const landed = !animate || dropped
  const has = points.length > 0 && side > 0
  // The drop plays once, imperatively (no React render per dot or per frame).
  useLayoutEffect(() => {
    if (!animate || !has || !svg.current) return
    const anims: Animation[] = []
    const dots = [...svg.current.querySelectorAll<SVGCircleElement>('.lv-grid-dot')]
    const n = dots.length
    // A fixed shuffle, so a rerun drops the dots in the same order.
    const order = dots.map((_, i) => i).sort((a, b) => ((a * 7919) % 97) - ((b * 7919) % 97) || a - b)
    const rank: number[] = []
    order.forEach((d, k) => (rank[d] = k))
    dots.forEach((el, i) => {
      const delay = n > 1 ? (rank[i] / (n - 1)) * (GRID_SPAN_MS - GRID_FALL_MS) : 0
      const d = Number(el.getAttribute('cy')) - m.top + r * 3
      anims.push(el.animate(fallFrames(d, 0, GRID_FALL_MS).frames, { duration: GRID_FALL_MS, delay, easing: 'linear', fill: 'backwards' }))
      anims.push(el.animate([{ transform: 'scale(1.45, 0.62)' }, { transform: 'scale(1, 1)' }], { duration: 180, delay: delay + GRID_FALL_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }))
    })
    const meanEl = svg.current.querySelector('.lv-grid-meanmark')
    const ts: ReturnType<typeof setTimeout>[] = [setTimeout(() => setDropped(true), GRID_SPAN_MS)]
    if (meanEl && mean) {
      const fall = fallFrames(Y(mean.y) - m.top + r * 6, 2, MEAN_FALL_MS)
      anims.push(meanEl.animate(fall.frames, { duration: fall.total, delay: GRID_SPAN_MS + 140, easing: 'linear', fill: 'backwards' }))
      ts.push(
        setTimeout(() => {
          const b = svg.current?.getBoundingClientRect()
          if (b) sparkAt({ x: b.left + X(mean.x), y: b.top + Y(mean.y) }, { dir: -Math.PI / 2, spread: 2.8, count: 12 })
        }, GRID_SPAN_MS + 140 + MEAN_FALL_MS),
      )
    }
    return () => {
      // Cut short (unmount, or React's development double run): stop cleanly so the next run replays from the top.
      anims.forEach((a) => a.cancel())
      ts.forEach(clearTimeout)
    }
  }, [animate, has]) // eslint-disable-line react-hooks/exhaustive-deps
  const summary =
    `${points.length} ${points.length === 1 ? 'person' : 'people'} placed themselves` +
    (mean ? `; the room's average is ${Math.round(mean.x)} towards “${slide.xHigh}” and ${Math.round(mean.y)} towards “${slide.yHigh}”, out of 100` : '') +
    '.'
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!onPick) return
    const b = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - b.left - m.left) / side) * 100
    const py = (1 - (e.clientY - b.top - m.top) / side) * 100
    if (px < -2 || px > 102 || py < -2 || py > 102) return
    onPick({
      x: Math.round(Math.min(100, Math.max(0, px))),
      y: Math.round(Math.min(100, Math.max(0, py))),
    })
  }
  // Tiles in reading order: top left, top right, bottom left, bottom right (quadrantRows' order).
  const half = side / 2
  const tiles = [
    { x: X(0), y: Y(100), a: 'start' as const, top: true },
    { x: X(50), y: Y(100), a: 'end' as const, top: true },
    { x: X(0), y: Y(50), a: 'start' as const, top: false },
    { x: X(50), y: Y(50), a: 'end' as const, top: false },
  ]
  const named = !!slide.quadrants
  const showCounts = !!fit && points.length > 0
  return (
    <Figure label={summary} className="lv-gridfig" table={<SrTable caption={summary} head={['Quadrant', 'People']} rows={tally} />}>
      <div className={`lv-grid-wrap${fit ? ' is-fit' : ''}`}>
        <div ref={ref} className="lv-grid-plot">
          {side > 0 && (
            <svg ref={svg} width={W} height={H} onPointerDown={onPick ? pick : undefined} className={onPick ? 'is-pickable' : ''}>
              <defs>
                <clipPath id={clip}>
                  <rect x={m.left} y={m.top} width={side} height={side} />
                </clipPath>
              </defs>
              <rect className="lv-grid-frame" x={m.left + 0.5} y={m.top + 0.5} width={side - 1} height={side - 1} />
              {tiles.map((t, i) => (
                <rect key={i} className={`lv-grid-tile${showCounts && landed && counts[i] === most && most > 0 ? ' is-lead' : ''}`} x={t.x + 2} y={t.y + 2} width={half - 4} height={half - 4} />
              ))}
              <line className="lv-grid-axis" x1={X(50)} x2={X(50)} y1={m.top} y2={m.top + side} />
              <line className="lv-grid-axis" x1={m.left} x2={m.left + side} y1={Y(50)} y2={Y(50)} />
              {tiles.map((t, i) => {
                const tx = t.a === 'start' ? t.x + f * 0.6 : t.x + half - f * 0.6
                const name = named ? (slide.quadrants![i] ?? '') : showCounts ? String(tally[i][0]) : ''
                return (
                  <g key={i} className="lv-grid-tilelabel">
                    {showCounts && (
                      <text className="lv-grid-count" x={tx} y={t.top ? t.y + f * 1.65 : t.y + half - f * 1.2} textAnchor={t.a}>
                        <CountUp value={landed ? counts[i] : 0} ms={600} />
                      </text>
                    )}
                    {(name || showCounts) && (
                      <text className="lv-grid-quad" x={tx} y={showCounts ? (t.top ? t.y + f * 2.45 : t.y + half - f * 0.55) : t.top ? t.y + f * 1.2 : t.y + half - f * 0.6} textAnchor={t.a}>
                        {name}
                        {showCounts && `${name ? ' · ' : ''}${Math.round((counts[i] / points.length) * 100)}%`}
                      </text>
                    )}
                  </g>
                )
              })}
              <g clipPath={`url(#${clip})`}>
                {points.map((p, i) => (
                  <circle key={i} className="lv-grid-dot" cx={X(p.x)} cy={Y(p.y)} r={r} />
                ))}
              </g>
              {mine && <circle className="lv-grid-mine" cx={X(mine.x)} cy={Y(mine.y)} r={r * 1.6} />}
              {mean && points.length > 0 && (
                <g className="lv-grid-meanmark">
                  <rect className="lv-grid-mean" x={X(mean.x) - r * 1.5} y={Y(mean.y) - r * 1.5} width={r * 3} height={r * 3} transform={`rotate(45 ${X(mean.x)} ${Y(mean.y)})`}>
                    <title>{`The room's average: ${Math.round(mean.x)}, ${Math.round(mean.y)}`}</title>
                  </rect>
                  <text className="lv-grid-meanlabel" x={X(mean.x) + (mean.x > 70 ? -r * 3 : r * 3)} y={Y(mean.y) + f * 0.3} textAnchor={mean.x > 70 ? 'end' : 'start'}>
                    Room
                  </text>
                </g>
              )}
              <text className="lv-grid-label" x={m.left} y={H - f * 0.4} textAnchor="start">
                ← {slide.xLow}
              </text>
              <text className="lv-grid-label" x={m.left + side} y={H - f * 0.4} textAnchor="end">
                {slide.xHigh} →
              </text>
              <text className="lv-grid-label" transform={`translate(${f * 1.15} ${m.top + side}) rotate(-90)`} textAnchor="start">
                ← {slide.yLow}
              </text>
              <text className="lv-grid-label" transform={`translate(${f * 1.15} ${m.top}) rotate(-90)`} textAnchor="end">
                {slide.yHigh} →
              </text>
            </svg>
          )}
        </div>
      </div>
    </Figure>
  )
}

// ---------------------------------------------------------------- words

let canvas: HTMLCanvasElement | null = null
function measurer(family: string) {
  canvas ??= document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  return (text: string, px: number) => {
    if (!ctx) return text.length * px * 0.55
    ctx.font = `500 ${px}px ${family}`
    return ctx.measureText(text).width * 0.98
  }
}

/**
 * The word cloud: the display face on a clear size ramp, in ink tones by rank (ink, ink-2, ink-3) with the
 * most said word in gold. Words arrive smallest first, each rising a little and settling; the top word lands last
 * and throws sparks. The presenter cannot hide a word by clicking it;
 * the console moderates the word filter's held and flagged entries.
 */
const CLOUD_IN_MS = 1500
export function Cloud({
  words,
  height,
}: {
  words: { text: string; count: number }[]
  /** CSS height of the cloud's box. */
  height: string
}) {
  const [ref, size] = useSize<HTMLDivElement>()
  const fonts = useFontsReady()
  const placed = useMemo(() => {
    if (!size.width || !size.height) return []
    const family = getComputedStyle(document.documentElement).getPropertyValue('--sds-font-display').trim() || 'sans-serif'
    return layoutCloud(words, size.width, size.height, measurer(family), {
      minFont: Math.max(11, size.font * 0.6),
      fill: 0.44,
    })
    // `fonts` re-measures once the display face has loaded.
  }, [words, size.width, size.height, size.font, fonts]) // eslint-disable-line react-hooks/exhaustive-deps
  const max = words[0]?.count ?? 0
  const n = placed.length
  // The cursor's physics (B5, round 3): homes come from the layout; each word keeps its spring across re-layouts.
  const bodies = useRef<Body[]>([])
  const inner = useRef(new Map<string, HTMLElement>())
  useLayoutEffect(() => {
    const old = new Map(bodies.current.map((b) => [b.text, b]))
    const maxSize = Math.max(1, ...placed.map((p) => p.size))
    bodies.current = placed.map((p, i) => {
      const b = old.get(p.text) ?? makeBody(p, maxSize, i)
      return { ...b, x: p.x, y: p.y, w: p.w, h: p.h, mass: Math.min(1, p.size / maxSize) }
    })
  }, [placed])
  useEffect(() => {
    if (!ref.current) return
    return runCloud(
      ref.current,
      () => bodies.current,
      (t) => inner.current.get(t),
    )
  }, [ref])
  // Arrival order: smallest first, so the stagger runs from the last placed word back to the first (the biggest).
  const step = n > 1 ? Math.min(70, CLOUD_IN_MS / (n - 1)) : 0
  const tone = (rank: number) => (rank < Math.max(2, Math.ceil(n * 0.2)) ? 'is-ink' : rank < Math.ceil(n * 0.55) ? 'is-ink-2' : 'is-ink-3')
  const summary = words.length
    ? `${words.length} words. Most said: ` +
      words
        .slice(0, 5)
        .map((w) => `${w.text} (${w.count})`)
        .join(', ')
    : 'No words yet.'
  return (
    <Figure label={summary} className="lv-cloudfig" table={<SrTable caption={summary} head={['Word', 'Said by']} rows={words.map((w) => [w.text, w.count])} />}>
      <div ref={ref} className="lv-cloud" style={{ height }}>
        {!words.length && <Empty>Words appear here as they come in</Empty>}
        {placed.map((p, rank) => {
          const top = p.count === max && rank === 0
          return (
            <span
              key={p.text}
              className={`lv-word ${top ? 'is-top' : tone(rank)}`}
              style={{
                fontSize: p.size,
                transform: `translate(${p.x}px, ${p.y}px)`,
                // The top word waits one more beat, so it lands after every other word.
                animationDelay: `${Math.round((n - 1 - rank) * step + (top ? 240 : 0))}ms`,
              }}
              title={`${p.text}: ${p.count}`}
              onAnimationEnd={top ? (e) => sparkAt(e.currentTarget, { edge: 'top', dir: -Math.PI / 2, spread: 2.6, count: 12 }) : undefined}
            >
              <span
                className="lv-word-in"
                ref={(el) => {
                  if (el) inner.current.set(p.text, el)
                  else inner.current.delete(p.text)
                }}
              >
                {p.text}
              </span>
            </span>
          )
        })}
      </div>
    </Figure>
  )
}

/** Open answers as notes, newest first. `limit` keeps a shared screen readable; the rest are in the export. */
export function Wall({
  entries,
  actions,
  limit,
  total,
}: {
  entries: { id: string; text: string; at: number }[]
  actions?: (e: { id: string; text: string }) => ReactNode
  limit?: number
  total?: number
}) {
  if (!entries.length) return <Empty>Answers appear here as they come in</Empty>
  const shown = limit ? entries.slice(0, limit) : entries
  const more = (total ?? entries.length) - shown.length
  return (
    <div className="lv-wall">
      {more > 0 && (
        <div className="lv-wall-more">
          Newest {shown.length} of {total ?? entries.length}
        </div>
      )}
      {shown.map((e) => (
        <div key={e.id} className="lv-note">
          <p>{e.text}</p>
          {actions && <div className="lv-note-actions">{actions(e)}</div>}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Q&A and the board

export function QaList({ questions, actions }: { questions: QuestionRow[]; actions?: (q: QuestionRow) => ReactNode }) {
  if (!questions.length) return <Empty>No questions yet. Ask from your phone</Empty>
  return <QaRows questions={questions} actions={actions} />
}

/** Mounted only once there are questions, so its measuring hook sees the list. */
function QaRows({ questions, actions }: { questions: QuestionRow[]; actions?: (q: QuestionRow) => ReactNode }) {
  // On the stage, show the questions that fit (they are ranked by votes) and count the rest, instead of running under
  // the footer. Phones and the report scroll, so they show every question.
  const [listRef, space] = useSpaceBelow<HTMLOListElement>()
  const [fit, setFit] = useState<number | null>(null)
  useLayoutEffect(() => {
    const ol = listRef.current
    if (!ol || !space) return setFit(null)
    const items = [...ol.children] as HTMLElement[]
    const room = space.px - space.font * 2 // keep a line for "and N more", with a little air
    // On-screen positions over the stage's scale (the editor's preview is scaled), relative to the list's top.
    const box = ol.getBoundingClientRect()
    const scale = box.height / (ol.offsetHeight || 1) || 1
    let k = 0
    for (const li of items) {
      if ((li.getBoundingClientRect().bottom - box.top) / scale > room) break
      k++
    }
    setFit(k >= questions.length ? null : Math.max(1, k))
  }, [space, questions, listRef])
  const shown = fit == null ? questions : questions.slice(0, fit)
  return (
    <>
    <ol ref={listRef} className="lv-qa">
      {shown.map((q) => (
        <li key={q.id} className={q.answered ? 'is-answered' : ''}>
          <span className="lv-qa-votes">
            <b>{q.votes}</b>
            {q.votes === 1 ? 'vote' : 'votes'}
          </span>
          <span className="lv-qa-text">{q.text}</span>
          {actions ? <span className="lv-qa-actions">{actions(q)}</span> : <span />}
        </li>
      ))}
    </ol>
    {fit != null && <div className="lv-footnote">and {questions.length - fit} more {questions.length - fit === 1 ? 'question' : 'questions'} in the console</div>}
    </>
  )
}

/**
 * The final podium (round 2): nothing moves down. The floor is fixed, and the blocks rise from it one at a time for
 * drama: third, then second, then a 500 ms beat, then first, which rises highest and stops dead (no bounce: a bounce
 * would pull it back down). Each name and score arrives with its block. When first lands: sparks off its top and a
 * full-stage confetti burst from it.
 */
const PODIUM_DELAYS = (() => {
  // Rise times on the race's pace: a bar of value v lands raceAt(v) * RACE_MS after its own start.
  const land = (v: number) => ((-0.3 + Math.sqrt(0.09 + 2.8 * v)) / 1.4) * RACE_MS
  const third = 0
  const second = third + land(10 / 24) * 0.55
  const first = second + land(16 / 24) + 500
  return { first, second, third }
})()

function Podium({ board }: { board: { name: string; score: number }[] }) {
  const [first, second, third] = board
  const lead = [false, true, false]
  const race = useRace([second ? 16 / 24 : 0, first ? 1 : 0, third ? 10 / 24 : 0], lead, {
    delays: [PODIUM_DELAYS.second, PODIUM_DELAYS.first, PODIUM_DELAYS.third],
    bounce: false,
  })
  const blocks = useRef<(HTMLDivElement | null)[]>([])
  const floor = useRef<HTMLDivElement>(null)
  useLandings(race.landed, lead, race.done, (i, isLeader) => {
    const block = blocks.current[i]
    if (!block) return
    // Sound (presenter only, when on): a thump per block, lower for third; a drumroll over the beat before first.
    cue('land', i === 1 ? 1 : i === 0 ? 2 : 3)
    if (!isLeader) {
      flashEnd(block, 'top', 220)
      if (i === 0) cue('drumroll')
      return
    }
    sparkAt(block, { edge: 'top', dir: -Math.PI / 2, spread: 2.6, count: 14, speed: 420 })
    const box = block.getBoundingClientRect()
    // The confetti falls behind the floor: nothing draws below its top edge.
    confetti(block.closest('.lv-stage') as HTMLElement | null, { x: box.left + box.width / 2, y: box.top }, 2500, 150, floor.current?.getBoundingClientRect().top)
    cue('fanfare')
  })
  const step = (p: { name: string; score: number } | undefined, place: 1 | 2 | 3, at: number) =>
    p ? (
      <div className={`lv-step is-${place}${race.landed[at] ? ' is-landed' : ''}`}>
        <div className="lv-step-name">{p.name}</div>
        <div className="lv-step-score">
          <CountUp value={race.landed[at] ? p.score : 0} ms={place === 1 ? 1100 : 700} format={(n) => Math.round(n).toLocaleString('en')} /> pts
        </div>
        <div
          ref={(el) => {
            blocks.current[at] = el
          }}
          className={`lv-step-block${(race.len[at] ?? 0) <= 0 ? ' is-flat' : ''}`}
          style={{ height: `calc(var(--lv-podium-h) * ${race.len[at] ?? 0})` }}
        >
          <span>{place}</span>
        </div>
      </div>
    ) : (
      <div />
    )
  return (
    <div className="lv-podium">
      {step(second, 2, 0)}
      {step(first, 1, 1)}
      {step(third, 3, 2)}
      {/* The floor (B7, round 3): there from the first frame; the blocks stand on its top edge. */}
      <div ref={floor} className="lv-podium-floor" />
    </div>
  )
}

const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13
  return (
    <>
      {n}
      <small>{teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}</small>
    </>
  )
}

/** Rows rise in from below, the lowest first; then the score bars race, and the leader lands last in gold. */
const BOARD_RISE_MS = 520
const BOARD_STAGGER_MS = 70
/** The leaderboard's race runs longer than a poll's, so more rows overtake (about 3 s). */
const BOARD_RACE_MS = 3000

/**
 * The leaderboard: a big rank number (first in gold), the name, a score bar on the race and the score counting with
 * it. The top three sit a tier above the rest. No movement arrows: the data has no previous ranks.
 */
export function Board({ board, podium }: { board: { name: string; score: number }[]; podium?: boolean }) {
  if (!board.length) return <Empty>No scores yet</Empty>
  if (podium && board.length >= 2) return <Podium board={board} />
  return <ScoreBoard board={board} />
}

/**
 * The leaderboard (round 3, B9): rows rise in, in a neutral order (by name), then re-sort as the score bars race. Every
 * frame each row takes the slot its bar's current length earns, so a row whose bar stops is overtaken by the ones still
 * rising, and the final order is the real ranking. Rows glide between slots on `translate` (a FLIP on the race's
 * level). The top three slots are the medal tier: bigger, with a medal on the rank, the leader's in gold. No previous
 * ranks and no per-round points: the movement is only the race.
 */
function ScoreBoard({ board }: { board: { name: string; score: number }[] }) {
  const top = Math.max(1, ...board.map((b) => b.score))
  const lead = board.map((b, i) => i === 0 && b.score > 0)
  const wait = BOARD_RISE_MS + BOARD_STAGGER_MS * (board.length - 1)
  const race = useRace(
    board.map((b) => b.score / top),
    lead,
    { delays: board.map(() => wait), ms: BOARD_RACE_MS },
  )
  const fills = useRef<(HTMLSpanElement | null)[]>([])
  useLandings(race.landed, lead, race.done, (i, isLeader) => (isLeader ? sparkAt(fills.current[i]!, BAR_SPARKS) : flashEnd(fills.current[i], 'right')))
  // The neutral order: by name. Then each frame, by the bar's length now (ties keep the neutral order).
  const neutral = useMemo(() => {
    const o = board.map((_, i) => i).sort((a, b) => board[a].name.localeCompare(board[b].name) || a - b)
    const at: number[] = []
    o.forEach((i, k) => (at[i] = k))
    return at
  }, [board])
  const slots = useMemo(() => {
    // A bar that has stopped counts at its final value, so its landing thud cannot let a neighbour pass and fall back:
    // every overtake happens once. Two bars still rising together keep the neutral order; two stopped level keep the
    // board's own order.
    const now = board.map((b, i) => (race.landed[i] ? b.score / top : (race.len[i] ?? 0)))
    const o = board
      .map((_, i) => i)
      .sort((a, b) => now[b] - now[a] || (race.landed[a] && race.landed[b] ? a - b : neutral[a] - neutral[b]))
    const at: number[] = []
    o.forEach((i, k) => (at[i] = k))
    return at
  }, [board, race.len, race.landed, neutral, top])
  const n = board.length
  // On the stage the rows take the room it leaves, up to their full height, so ten rows never run under the footer.
  const [wrapRef, space] = useSpaceBelow<HTMLDivElement>()
  const rowPx = space ? Math.max(space.font * 1.3, Math.min(space.font * 2.35, (space.px - (n > 3 ? space.font * 0.9 : 0)) / Math.max(1, n))) : null
  // The ranks stay put in their own column; only the rows travel, all one height, so an overtake is one glide.
  return (
    <div ref={wrapRef} className="lv-board-wrap" style={{ ['--rows' as string]: n, ...(rowPx ? { ['--h' as string]: `${rowPx}px` } : {}) }}>
      <ol className="lv-board-ranks" aria-hidden="true">
        {board.map((_, k) => (
          <li key={k} className={k < 3 ? `is-m${k + 1}` : undefined} style={{ ['--k' as string]: k }}>
            <span className="lv-board-rank-n">{ordinal(k + 1)}</span>
          </li>
        ))}
      </ol>
    <ol className={`lv-board is-slots${n > 3 ? ' has-tail' : ''}`}>
      {board.map((b, i) => {
        const k = slots[i]
        return (
          <li
            key={`${i}-${b.name}`}
            className={lead[i] && race.landed[i] ? 'is-lead' : undefined}
            style={{ ['--slot' as string]: k, animationDelay: `${(n - 1 - neutral[i]) * BOARD_STAGGER_MS}ms` }}
          >
            <span className="lv-sr">{ordinal(i + 1)} </span>
            <span className="lv-board-name">{b.name}</span>
            <span className="lv-board-score">{Math.round(b.score * (race.shown[i] ?? 1)).toLocaleString('en')}</span>
            <span className="lv-board-track">
              <span
                ref={(el) => {
                  fills.current[i] = el
                }}
                className="lv-board-fill"
                style={{ width: `${(race.len[i] ?? 0) * 100}%` }}
              />
            </span>
          </li>
        )
      })}
    </ol>
    </div>
  )
}

// ---------------------------------------------------------------- the dispatcher

export type HostActions = {
  qa?: (q: QuestionRow) => ReactNode
  note?: (e: { id: string; text: string }) => ReactNode
}

/**
 * Answers held back until the host reveals them: they arrive as face-down cards, so the room sees them come in without
 * reading them. Keyed by position, so only a new card plays its entrance.
 */
function Facedown({ answered }: { answered: number }) {
  if (answered === 0) return <Empty>Answers appear here at the reveal</Empty>
  const shown = Math.min(answered, 48)
  return (
    <div className="lv-facedown" aria-label={`${answered} ${answered === 1 ? 'answer' : 'answers'} in, hidden until the reveal`}>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className={`lv-facedown-card${i === shown - 1 ? ' is-new' : ''}`} style={{ rotate: `${((i * 37) % 7) - 3}deg` }} aria-hidden />
      ))}
      {answered > shown && <span className="lv-facedown-more">+{answered - shown}</span>}
    </div>
  )
}

/**
 * The results block for a slide. `hidden` keeps the slide's shape but shows no numbers (results off, or a quiz still
 * running). `compact` is the phone. `answered` is the count the host's screen shows while open text is hidden.
 */
export function SlideResults({
  slide,
  results,
  hidden,
  host,
  compact,
  answered = 0,
}: {
  slide: Slide
  results: Results | undefined
  hidden?: boolean
  host?: HostActions
  compact?: boolean
  answered?: number
}) {
  const r = hidden ? undefined : results
  if (slide.kind === 'quiz' && slide.typed) {
    if (hidden || r?.kind !== 'typed') return <Empty>{hidden ? 'Answers stay hidden until the buzzer' : 'Answers appear here'}</Empty>
    if (!compact) return <TypedTiles correct={r.correct} total={r.total} answers={r.answers} accepted={slide.typed} />
    return <TypedChart correct={r.correct} total={r.total} answers={r.answers} accepted={slide.typed} />
  }
  if (slide.kind === 'quiz' && !compact) {
    const c = r?.kind === 'choice' ? r : { counts: slide.options.map(() => 0), total: 0 }
    const correct = hidden ? -1 : slide.correct
    const got = correct >= 0 ? (c.counts[correct] ?? 0) : 0
    const summary = hidden ? `${slide.options.length} options: ${slide.options.join(', ')}` : `${got} of ${c.total} got it right. ` + slide.options.map((o, i) => `${o}: ${c.counts[i]}${i === correct ? ' (right)' : ''}`).join('; ')
    return (
      <QuizTiles
        tiles={slide.options.map((o, i) => ({ mark: LETTERS[i], text: o, count: c.counts[i] ?? 0, right: i === correct }))}
        total={c.total}
        correct={got}
        reveal={correct >= 0}
        label={summary}
        table={<SrTable caption={summary} head={['Option', 'Answers']} rows={slide.options.map((o, i) => [o, hidden ? '–' : (c.counts[i] ?? 0)])} />}
      />
    )
  }
  switch (slide.kind) {
    case 'quiz':
    case 'poll': {
      const c =
        r?.kind === 'choice'
          ? r
          : {
              counts: slide.options.map(() => 0),
              total: 0,
              previous: undefined,
            }
      return (
        <ChoiceChart
          options={slide.options}
          counts={c.counts}
          total={c.total}
          correct={slide.kind === 'quiz' && !hidden ? slide.correct : -1}
          quiz={slide.kind === 'quiz'}
          previous={c.previous}
          chart={slide.kind === 'poll' && !compact ? slide.chart : 'bars'}
          multi={slide.kind === 'poll' && !!slide.multi}
        />
      )
    }
    case 'scale': {
      const c =
        r?.kind === 'scale'
          ? r
          : {
              counts: Array.from({ length: slide.max }, () => 0),
              average: null,
              previous: undefined,
            }
      return slide.mode === 'agree' ? (
        <AgreeChart counts={c.counts} previous={c.previous} />
      ) : (
        <RatingChart counts={c.counts} average={c.average} max={slide.max} minLabel={slide.minLabel} maxLabel={slide.maxLabel} previous={c.previous} />
      )
    }
    case 'rank': {
      const n = slide.options.length
      const c =
        r?.kind === 'rank'
          ? r
          : {
              scores: Array<number>(n).fill(0),
              avg: Array<number | null>(n).fill(null),
              firsts: Array<number>(n).fill(0),
              total: 0,
            }
      return <RankChart options={slide.options} scores={c.scores} avg={c.avg} firsts={c.firsts} total={c.total} />
    }
    case 'points': {
      const c = r?.kind === 'points' ? r : { totals: slide.options.map(() => 0), total: 0 }
      return <PointsChart options={slide.options} totals={c.totals} total={c.total} />
    }
    case 'number':
      if (hidden) return <Empty>Guesses stay hidden until the reveal</Empty>
      return <HistogramChart slide={slide} values={r?.kind === 'number' ? r.values : []} median={r?.kind === 'number' ? r.median : null} reveal />
    case 'grid':
      return <GridChart slide={slide} points={r?.kind === 'grid' ? r.points : []} mean={r?.kind === 'grid' ? r.mean : null} fit={!compact} />
    case 'wordcloud':
      return hidden ? <Facedown answered={answered} /> : <Cloud words={r?.kind === 'words' ? r.words : []} height={compact ? '240px' : 'max(260px, 44vh)'} />
    case 'open':
      return hidden ? (
        <Facedown answered={answered} />
      ) : (
        <Wall entries={r?.kind === 'open' ? r.entries : []} actions={host?.note} limit={compact ? 6 : 9} total={r?.kind === 'open' ? r.entries.length : 0} />
      )
    case 'qa':
      return <QaList questions={r?.kind === 'qa' ? r.questions : []} actions={host?.qa} />
    case 'leaderboard':
      return <Board board={r?.kind === 'board' ? r.board : []} podium={slide.final} />
    default:
      return null
  }
}
