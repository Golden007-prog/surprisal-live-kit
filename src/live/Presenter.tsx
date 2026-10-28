/**
 * The presenter: the screen you share in the call. Controls fade after three still seconds; everything the room must
 * not see (notes, held answers, the next slide) lives on the console, opened with C in a second window or on a phone.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ANSWERABLE } from '../lib/live'
import { joinHost, joinUrl, live } from './api'
import { useHostSession } from './hostSession'
import { consoleUrl, download, slug, type Hosting } from './hostStore'
import { armSound, setSound, soundOn, useSound } from './sound'
import { JoinCard, Stage } from './Stage'

/** One reaction rising: where it starts (% across), when (ms after its poll), how long it rises, how far it sways. */
type Float = { id: string; emoji: string; x: number; delay: number; rise: number; sway: number; size: number }

export function Presenter({ hosting, onExit, onReport, themeBtn }: { hosting: Hosting; onExit: () => void; onReport: () => void; themeBtn: ReactNode }) {
  const { code, token } = hosting
  const [join, setJoin] = useState(false)
  const [spotlight, setSpotlight] = useState<string | null>(null)
  const [idle, setIdle] = useState(false)
  const [floats, setFloats] = useState<Float[]>([])
  const seen = useRef(new Set<string>())
  const revealed = useRef(new Set<string>())
  const closed = useRef(new Set<string>())
  const { s, error, control, goto, remaining, fraction, actions } = useHostSession(hosting, { onSpotlight: setSpotlight })
  // Sound: off by default, remembered; only the presenter arms it (B8, round 3).
  const sound = useSound()
  useEffect(() => armSound(), [])

  // Reactions rise as they do in a video call: each pops in, sways up and fades near the top. A poll's batch is spread
  // over up to 1.5 s, so a burst streams up rather than moving in step.
  useEffect(() => {
    if (!s) return
    const fresh = s.reactions.filter((r) => !seen.current.has(r.id))
    if (!fresh.length) return
    fresh.forEach((r) => seen.current.add(r.id))
    const batch = fresh.slice(-12)
    const step = Math.min(260, 1500 / batch.length)
    const add = batch.map((r, i) => ({
      id: r.id,
      emoji: r.emoji,
      x: 4 + Math.random() * 78,
      delay: Math.round(i * step),
      rise: Math.round(3800 + Math.random() * 900),
      sway: Math.round((Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 14)),
      size: Math.round(46 + Math.random() * 16),
    }))
    setFloats((f) => [...f, ...add].slice(-36))
    // Not cleared on the next poll: each batch takes itself off when its last float ends.
    const ids = new Set(add.map((a) => a.id))
    setTimeout(() => setFloats((f) => f.filter((x) => !ids.has(x.id))), 1500 + 4700 + 200)
  }, [s])

  // Clocks. A quiz reveals itself when the clock runs out or everyone has answered; a timed slide closes its voting.
  useEffect(() => {
    if (!s || remaining == null) return
    const slide = s.slide
    if (slide.kind === 'quiz') {
      if (s.showResults || revealed.current.has(slide.id)) return
      const everyone = s.participants > 0 && s.answered >= s.participants
      if (remaining <= -0.5 || (everyone && remaining < slide.seconds)) {
        revealed.current.add(slide.id)
        control('results', { on: true })
      }
    } else if (remaining <= -0.5 && s.accepting && !closed.current.has(`${slide.id}@${s.timerAt}`)) {
      closed.current.add(`${slide.id}@${s.timerAt}`)
      control('accepting', { on: false })
    }
  }, [s, remaining, control])

  // Keyboard.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!s || (e.target as HTMLElement)?.closest('input, textarea, select')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'arrowright' || k === 'pagedown' || k === ' ') goto(s.index + 1)
      else if (k === 'arrowleft' || k === 'pageup') goto(s.index - 1)
      else if (k === 'r') control('results', { on: !s.showResults })
      else if (k === 'v') control('accepting', { on: !s.accepting })
      else if (k === 't' && s.slide.kind !== 'quiz' && s.slide.timer) control('timer')
      else if (k === 's') setSound(!soundOn())
      else if (k === 'j') setJoin((j) => !j)
      else if (k === 'c') window.open(consoleUrl(hosting, false), `console-${code}`, 'width=520,height=900')
      else if (k === 'escape') {
        setJoin(false)
        setSpotlight(null)
      } else if (k === 'f') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})
      else return
      e.preventDefault()
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [s, goto, control, hosting, code])

  // The controls fade after three still seconds, so the shared screen is clean.
  useEffect(() => {
    let t = setTimeout(() => setIdle(true), 3000)
    const wake = () => {
      setIdle(false)
      clearTimeout(t)
      t = setTimeout(() => setIdle(true), 3000)
    }
    addEventListener('mousemove', wake)
    addEventListener('keydown', wake)
    return () => {
      clearTimeout(t)
      removeEventListener('mousemove', wake)
      removeEventListener('keydown', wake)
    }
  }, [])

  const exportAll = async () => {
    try {
      const r = await live.exportAll(code, token)
      const base = `live-${slug(hosting.title)}-${code}`
      download(`${base}.csv`, r.csv, 'text/csv')
      const { csv: _csv, ...rest } = r // eslint-disable-line @typescript-eslint/no-unused-vars
      download(`${base}.json`, JSON.stringify(rest, null, 2), 'application/json')
    } catch {
      alert('Export failed. Try again.')
    }
  }

  if (!s)
    return (
      <div className="lv">
        <div className="lv-library">
          <div className="lv-status is-quiet">
            {error ? (error.status === 403 ? 'This browser’s host key does not match the session.' : `Cannot reach the session (${error.error}). Retrying…`) : 'Connecting…'}
          </div>
          <button className="lv-btn" onClick={onExit} style={{ justifySelf: 'start' }}>
            Back to the library
          </button>
        </div>
      </div>
    )

  const slide = s.slide
  const answerable = ANSWERABLE.has(slide.kind)
  const paced = !!s.settings.paced
  const revealLabel = slide.kind === 'quiz' ? 'Reveal' : slide.kind === 'number' ? (s.showResults ? 'Hide guesses' : 'Reveal the truth') : s.showResults ? 'Hide results' : 'Reveal results'
  const url = joinUrl(code)
  const host = joinHost()
  return (
    <div className="lv">
      <Stage
        title={s.title}
        code={code}
        host={host}
        url={url}
        slide={slide}
        index={s.index}
        count={s.count}
        results={s.results}
        showResults={s.showResults || slide.kind === 'qa' || slide.kind === 'leaderboard'}
        answered={s.answered}
        participants={s.participants}
        remaining={slide.kind === 'quiz' && s.showResults ? null : remaining}
        timerFraction={fraction}
        actions={actions}
        joined={s.joined}
        idle={idle}
        paced={paced}
        topControls={
          <button className="lv-sound" aria-pressed={sound} onClick={() => setSound(!sound)} title="Sound for the quiz and the podium (S)">
            {sound ? 'Sound on' : 'Sound off'}
          </button>
        }
        bottom={
          <div className="lv-controls">
            {s.phase === 'ended' && <span style={{ marginRight: 8 }}>Ended</span>}
            {error && <span style={{ marginRight: 8 }}>Reconnecting…</span>}
            {s.held.length > 0 && (
              <button className="lv-btn is-small is-on" onClick={() => window.open(consoleUrl(hosting, false), `console-${code}`, 'width=520,height=900')}>
                {s.held.length} held · console
              </button>
            )}
            <button className="lv-btn is-small" onClick={() => goto(s.index - 1)} disabled={s.index === 0} aria-label="Previous slide">
              ←
            </button>
            <button className="lv-btn is-small is-ink" onClick={() => goto(s.index + 1)} disabled={s.index >= s.count - 1} aria-label="Next slide">
              →
            </button>
            {answerable && (
              <>
                <button
                  className={`lv-btn is-small${s.showResults ? ' is-on' : slide.kind !== 'quiz' ? ' is-ink' : ''}`}
                  onClick={() => control('results', { on: !s.showResults })}
                  title="Show or hide the results on the screen and the phones (R)"
                >
                  {revealLabel}
                </button>
                {slide.kind !== 'quiz' && (
                  <button className={`lv-btn is-small${s.accepting ? ' is-on' : ''}`} onClick={() => control('accepting', { on: !s.accepting })}>
                    {s.accepting ? 'Voting open' : 'Voting closed'}
                  </button>
                )}
                {slide.kind !== 'quiz' && slide.timer && !paced && (
                  <button className="lv-btn is-small" onClick={() => control('timer')}>
                    Restart timer
                  </button>
                )}
              </>
            )}
            <button className={`lv-btn is-small${join ? ' is-on' : ''}`} onClick={() => setJoin(!join)}>
              Join code
            </button>
            <button className="lv-btn is-small" onClick={() => window.open(consoleUrl(hosting, false), `console-${code}`, 'width=520,height=900')} title="Notes, next slide and controls, in a window the room doesn’t see (C)">
              Console
            </button>
            <a className="lv-btn is-small is-quiet" href={`/live?c=${code}`} target="_blank" rel="noreferrer">
              Phone view
            </a>
            <button className="lv-btn is-small is-quiet" onClick={exportAll}>
              Export
            </button>
            {themeBtn}
            {s.phase === 'live' ? (
              <button className="lv-btn is-small is-quiet" onClick={() => confirm('End the session? Phones will stop accepting answers.') && control('end')}>
                End
              </button>
            ) : (
              <>
                <button className="lv-btn is-small is-ink" onClick={onReport}>
                  Report
                </button>
                <button className="lv-btn is-small is-quiet" onClick={() => control('reopen')}>
                  Reopen
                </button>
              </>
            )}
            <button className="lv-btn is-small is-quiet" onClick={onExit}>
              Exit
            </button>
          </div>
        }
      />
      {spotlight && (
        <div className="lv-overlay" onClick={() => setSpotlight(null)} role="dialog" aria-label="Spotlit answer">
          <p className="lv-spotlight">{spotlight}</p>
        </div>
      )}
      {join && (
        <div className="lv-overlay" onClick={() => setJoin(false)}>
          <JoinCard code={code} url={url} host={host} />
        </div>
      )}
      <div className="lv-reactions" aria-hidden>
        {floats.map((f) => (
          <span
            key={f.id}
            className="lv-reaction"
            style={{ left: `${f.x}%`, fontSize: f.size, '--d': `${f.delay}ms`, '--rise': `${f.rise}ms`, '--sway': `${f.sway}px` } as CSSProperties}
          >
            <span>{f.emoji}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
