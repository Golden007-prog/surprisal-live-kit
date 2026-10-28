/** The presenter's slide: what the room sees on the shared screen. Also the editor's preview, at a smaller scale. */
import './lobby.css'
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { ANSWERABLE, KIND_LABEL, type Results, type Slide } from '../lib/live'
import { BrandMark } from '../brand'
import { Qr } from './Qr'
import { SlideResults, type HostActions } from './Results'
import { cue } from './sound'

export function JoinCard({ code, url, host }: { code: string; url: string; host: string }) {
  return (
    <div className="lv-joincard">
      <Qr value={url} label={`QR code: join at ${host} with code ${code}`} playful />
      <div>
        <div className="lv-eyebrow">Join on your phone</div>
        <div className="lv-joincard-url">{host}</div>
        <div className="lv-joincard-code">{code}</div>
      </div>
    </div>
  )
}

/** How many cards the pile shows: what fits between the bars at any size (the cards scale with the pile). */
const PILE = 12

/** FNV-1a: a name's stable seed, for its tilt, its sideways jitter and its glyph. */
function seed(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** A mirrored 5x5 of squares, one per name: the QR code's own vocabulary, in ink. */
function Glyph({ h }: { h: number }) {
  let d = ''
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 3; c++)
      if ((h >>> (r * 3 + c)) & 1) {
        d += `M${c} ${r}h1v1h-1z`
        if (c < 2) d += `M${4 - c} ${r}h1v1h-1z`
      }
  return (
    <svg className="lv-pile-glyph" viewBox="-1 -1 7 7" shapeRendering="crispEdges" aria-hidden="true">
      <path d={d || 'M2 2h1v1h-1z'} fill="currentColor" />
    </svg>
  )
}

/**
 * The lobby: each name that joins falls onto a pile on the right. Keys are name + nth occurrence, so the poll's
 * re-render every 900 ms keeps the cards already down and only a new name falls. On first load the names there
 * drop in one after another.
 */
function LobbyPile({ joined, participants }: { joined: string[]; participants: number }) {
  const first = useRef(true)
  const delays = useRef(new Map<string, number>())
  useEffect(() => {
    first.current = false
  }, [])
  const total = Math.max(participants, joined.length)
  const seen = new Map<string, number>()
  const cards = joined.map((name, i) => {
    const nth = (seen.get(name) ?? 0) + 1
    seen.set(name, nth)
    return { name, key: `${name}#${nth}`, no: total - joined.length + i + 1 }
  })
  const shown = cards.slice(-PILE)
  shown.forEach((c, i) => {
    if (!delays.current.has(c.key)) delays.current.set(c.key, first.current ? i * 110 : 0)
  })
  // A full pile drops its oldest card at the bottom as a name arrives: the rest settle down a step instead of jumping.
  const stack = useRef<HTMLDivElement>(null)
  const bottom = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    const was = bottom.current
    bottom.current = shown[0]?.key
    const el = stack.current
    const card = el?.firstElementChild as HTMLElement | null | undefined
    if (!el || !card || !was || was === bottom.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const step = card.offsetHeight * 0.58
    el.animate([{ transform: `translateY(${-step}px)` }, { transform: 'translateY(0)' }], { duration: 420, easing: 'cubic-bezier(0.55, 0, 1, 0.45)' })
  })
  return (
    <div className="lv-pile" aria-label={`${total} joined`}>
      <div className="lv-pile-head">
        <span>Arrivals</span>
        <span>
          <b>{total}</b> here
        </span>
      </div>
      <div className="lv-pile-stack" ref={stack}>
        {shown.map((c, i) => {
          const h = seed(c.name)
          const style = {
            '--r': `${(((h >>> 15) % 9) - 4) * 0.7}deg`,
            '--x': `${(((h >>> 20) % 9) - 4) * 1.1}%`,
            '--delay': `${delays.current.get(c.key) ?? 0}ms`,
            // The drop starts at the top of the pile's column, so the whole fall is in view: lower cards fall further.
            '--drop': `${Math.max(16, 93 - 6.7 * i).toFixed(1)}cqh`,
          } as CSSProperties
          return (
            <div key={c.key} className={`lv-pile-card${i === shown.length - 1 ? ' is-new' : ''}`} style={style}>
              <Glyph h={h} />
              <div className="lv-pile-text">
                <span className="lv-pile-no">No. {String(c.no).padStart(2, '0')}</span>
                <span className="lv-pile-name">{c.name}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Stage({
  title,
  code,
  host,
  url,
  slide,
  index,
  count,
  results,
  showResults,
  answered,
  participants,
  remaining,
  timerFraction,
  showJoin,
  actions,
  joined,
  bottom,
  children,
  idle,
  paced,
  topControls,
}: {
  title: string
  code: string
  host: string
  url: string
  slide: Slide
  index: number
  count: number
  results?: Results
  showResults: boolean
  answered: number
  participants: number
  /** Quiz seconds left, or null when no clock runs. Negative = the "get ready" beat. */
  remaining: number | null
  timerFraction: number | null
  showJoin?: boolean
  actions?: HostActions
  /** The lobby: names that have joined, shown on the doors-open slide. */
  joined?: string[]
  bottom?: ReactNode
  children?: ReactNode
  idle?: boolean
  /** Self-paced: phones move on their own; the screen shows this slide's results. */
  paced?: boolean
  /** Extra controls at the end of the top bar (the presenter's sound switch). */
  topControls?: ReactNode
}) {
  // The quiz's three-second lead-in counts down 3, 2, 1 before the question's own clock.
  const quizLead = slide.kind === 'quiz' && remaining != null && remaining > slide.seconds
  const lead = quizLead && slide.kind === 'quiz' ? Math.ceil(remaining! - slide.seconds) : 0
  const clock = remaining != null && !(slide.kind === 'quiz' && showResults)
  // The first slide, when it is a content slide, doubles as the doors-open screen.
  const joinHere = showJoin || (index === 0 && slide.kind === 'content')
  // The quiz's last five seconds tick (heard only on the presenter, with its sound on).
  const tickAt = slide.kind === 'quiz' && clock && remaining! > 0 && remaining! <= 5 ? Math.ceil(remaining!) : 0
  useEffect(() => {
    if (tickAt) cue('tick', tickAt)
  }, [tickAt])
  return (
    <div className={`lv-stage${idle ? ' is-idle' : ''}`}>
      {timerFraction != null && <div className="lv-timer" style={{ width: `${timerFraction * 100}%` }} />}
      <header className="lv-stage-top">
        <div className="lv-brand">
          <BrandMark />
          <span>{title}</span>
        </div>
        <div className="lv-joinline">
          <span>{host}</span>
          <b>{code}</b>
          <Qr value={url} size={52} label={`QR code for ${host}, code ${code}`} />
          {topControls}
        </div>
      </header>

      {/* Keyed by slide, so every slide change replays the entrance. */}
      <main key={slide.id} className={`lv-stage-main lv-enter${slide.kind === 'content' ? '' : ' is-question'}${showResults ? '' : ' is-held'}`}>
        <div className="lv-eyebrow">
          {slide.kind === 'content' ? slide.eyebrow || `${index + 1} / ${count}` : `${paced ? 'Self-paced · ' : ''}${KIND_LABEL[slide.kind]} · ${index + 1} / ${count}`}
        </div>
        {slide.kind === 'content' ? (
          <>
            <div className={slide.image ? 'lv-content-grid' : 'lv-content-solo'}>
              <div style={{ display: 'grid', gap: 'clamp(16px, 3vh, 36px)' }}>
                <h1 className="lv-title is-content">{slide.title}</h1>
                {slide.body && <p className="lv-body">{slide.body}</p>}
              </div>
              {slide.image && <img className="lv-slide-img is-big" src={slide.image} alt="" />}
            </div>
            {joinHere && <JoinCard code={code} url={url} host={host} />}
            {joinHere && joined && joined.length > 0 && <LobbyPile joined={joined} participants={participants} />}
          </>
        ) : (
          <>
            <div className="lv-titlerow">
              <h1 className="lv-title">{slide.title}</h1>
              {slide.image && !quizLead && <img className="lv-slide-img" src={slide.image} alt="" />}
              {/* Results held back: the room still sees the answers arrive. */}
              {!showResults && ANSWERABLE.has(slide.kind) && slide.kind !== 'quiz' && (
                <div className="lv-tally">
                  <b key={answered}>{answered}</b>
                  <span>{answered === 1 ? 'answer in' : 'answers in'}</span>
                </div>
              )}
              {clock && !quizLead && (
                <div className={`lv-count${remaining! <= 5 ? ' is-low' : ''}`} aria-live="off">
                  {remaining! > 0 ? Math.ceil(remaining!) : slide.kind === 'quiz' ? 0 : <span className="lv-timesup">Time’s up</span>}
                </div>
              )}
            </div>
            {quizLead ? (
              <div className="lv-lead" aria-live="assertive">
                <span key={lead} className="lv-lead-n">
                  {lead}
                </span>
                <span className="lv-eyebrow is-plain">Get ready</span>
              </div>
            ) : (
              <SlideResults slide={slide} results={results} hidden={!showResults} host={actions} answered={answered} />
            )}
          </>
        )}
        {children}
      </main>

      <footer className="lv-stage-bottom">
        <div className="lv-stage-stats">
          <span>
            <b>{participants}</b> joined
          </span>
          {ANSWERABLE.has(slide.kind) && (
            <span>
              <b>{answered}</b> {answered === 1 ? 'answer' : 'answers'}
            </span>
          )}
        </div>
        {bottom}
      </footer>
    </div>
  )
}
