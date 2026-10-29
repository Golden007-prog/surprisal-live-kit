/**
 * The console: the host's own window, never shared. Notes for this slide, what comes next, answers the word filter is
 * holding, every control, and a jump list. It fits a phone, so the host can run the session from their hand while
 * the laptop shares the presenter. The phone gets the host key from a QR code that only this window shows.
 */
import { useState, type ReactNode } from 'react'
import { ANSWERABLE, KIND_LABEL } from '../lib/deck'
import { useHostSession } from '../lib/hostSession'
import { consoleUrl, type Hosting } from '../lib/hostStore'
import { Qr } from '../components/Qr'
import { SlideResults } from '../components/Results'

export function Console({ hosting, themeBtn }: { hosting: Hosting; themeBtn: ReactNode }) {
  const { s, error, control, goto, remaining, approve, reject, actions } = useHostSession(hosting)
  const [handover, setHandover] = useState(false)
  if (!s)
    return (
      <div className="lv">
        <div className="lv-phone">
          <div className="lv-status is-quiet" style={{ marginTop: 24 }}>
            {error ? (error.status === 403 ? 'This browser’s host key does not match the session.' : `Cannot reach the session (${error.error}). Retrying…`) : 'Connecting…'}
          </div>
        </div>
      </div>
    )
  const slide = s.slide
  const next = s.deck.slides[s.index + 1]
  const answerable = ANSWERABLE.has(slide.kind)
  const paced = !!s.settings.paced
  return (
    <div className="lv">
      <main className="lv-console">
        <header className="lv-phone-top">
          <span>
            <b>{s.code}</b> · console · {s.participants} joined
          </span>
          <span className="lv-row">
            {remaining != null && (
              <span className={`lv-mono${remaining <= 5 ? ' lv-gold' : ''}`} aria-label="Seconds left">
                {Math.max(0, Math.ceil(remaining))}s
              </span>
            )}
            {themeBtn}
          </span>
        </header>

        <section className="lv-console-now">
          <div className="lv-eyebrow">
            Now · {s.index + 1} / {s.count} · {KIND_LABEL[slide.kind]}
            {answerable ? ` · ${s.answered} ${s.answered === 1 ? 'answer' : 'answers'}` : ''}
          </div>
          <h1 className="lv-title" style={{ fontSize: 24 }}>
            {slide.title}
          </h1>
          {slide.notes ? (
            <p className="lv-console-notes">{slide.notes}</p>
          ) : (
            <p className="lv-muted" style={{ margin: 0, fontSize: 14 }}>
              No notes for this slide.
            </p>
          )}
        </section>

        <div className="lv-console-controls">
          <button className="lv-btn" onClick={() => goto(s.index - 1)} disabled={s.index === 0}>
            ← Back
          </button>
          <button className="lv-btn is-ink" onClick={() => goto(s.index + 1)} disabled={s.index >= s.count - 1}>
            Next →
          </button>
          {answerable && (
            <button className={`lv-btn${s.showResults ? ' is-on' : ''}`} onClick={() => control('results', { on: !s.showResults })}>
              {slide.kind === 'quiz'
                ? 'Reveal'
                : slide.kind === 'number'
                  ? s.showResults
                    ? 'Hide the truth'
                    : 'Reveal the truth'
                  : s.showResults
                    ? 'Hide results'
                    : 'Reveal results'}
            </button>
          )}
          {answerable && slide.kind !== 'quiz' && (
            <button className={`lv-btn${s.accepting ? ' is-on' : ''}`} onClick={() => control('accepting', { on: !s.accepting })}>
              {s.accepting ? 'Close voting' : 'Open voting'}
            </button>
          )}
          {slide.kind !== 'quiz' && slide.timer && !paced && (
            <button className="lv-btn" onClick={() => control('timer')}>
              Restart the {slide.timer}s timer
            </button>
          )}
        </div>

        {s.held.length > 0 && (
          <section className="lv-console-section">
            <div className="lv-eyebrow">Held by the word filter · {s.held.length}</div>
            <ul className="lv-held">
              {s.held.map((h) => (
                <li key={h.id}>
                  <span>
                    <small>{h.id.startsWith('q:') ? 'Question' : h.id.startsWith('w:') ? 'Word' : 'Answer'}</small>
                    {h.text}
                  </span>
                  <button className="lv-btn is-small" onClick={() => approve(h.id)}>
                    Show
                  </button>
                  <button className="lv-btn is-small is-quiet" onClick={() => reject(h.id)}>
                    Hide
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(answerable || slide.kind === 'qa') && (
          <section className="lv-console-section lv-console-results">
            <div className="lv-eyebrow">On screen{!s.showResults && answerable ? ' (results hidden from the room)' : ''}</div>
            <SlideResults slide={slide} results={s.results} compact host={{ qa: actions.qa, note: actions.note }} />
          </section>
        )}

        {paced && s.progress && (
          <section className="lv-console-section">
            <div className="lv-eyebrow">Self-paced · answers per slide</div>
            <ol className="lv-progress">
              {s.deck.slides.map((x, i) => (
                <li key={x.id} className={i === s.index ? 'is-on' : ''}>
                  <button onClick={() => goto(i)}>
                    <span className="lv-mono">{String(i + 1).padStart(2, '0')}</span>
                    <span>{x.title}</span>
                    <span className="lv-mono">{ANSWERABLE.has(x.kind) ? s.progress![i] : '–'}</span>
                    <i style={{ width: `${s.participants ? Math.min(100, ((s.progress![i] ?? 0) / s.participants) * 100) : 0}%` }} />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        {next && (
          <section className="lv-console-section">
            <div className="lv-eyebrow">Up next · {KIND_LABEL[next.kind]}</div>
            <p style={{ margin: 0, fontSize: 17 }}>{next.title}</p>
            {next.notes && <p className="lv-console-notes is-quiet">{next.notes}</p>}
          </section>
        )}

        {!paced && (
          <section className="lv-console-section">
            <div className="lv-eyebrow">Jump to</div>
            <ol className="lv-jump">
              {s.deck.slides.map((x, i) => (
                <li key={x.id}>
                  <button className={i === s.index ? 'is-on' : ''} onClick={() => goto(i)}>
                    <span className="lv-mono">{String(i + 1).padStart(2, '0')}</span>
                    <span>{x.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="lv-console-section">
          <div className="lv-eyebrow">Run it from your phone</div>
          {handover ? (
            <div className="lv-row" style={{ alignItems: 'flex-start', gap: 16 }}>
              <Qr value={consoleUrl(hosting, true)} size={180} label="QR code: this console on your phone, with the host key" />
              <p className="lv-muted" style={{ margin: 0, fontSize: 13, maxWidth: '32ch' }}>
                This code carries the host key. Scan it with your own phone, then hide it. Never show it in the shared window.
              </p>
            </div>
          ) : (
            <button className="lv-btn is-small" style={{ justifySelf: 'start' }} onClick={() => setHandover(true)}>
              Show the phone QR (not while sharing this window)
            </button>
          )}
          {handover && (
            <button className="lv-btn is-small is-quiet" style={{ justifySelf: 'start' }} onClick={() => setHandover(false)}>
              Hide the QR
            </button>
          )}
        </section>
        <div className="lv-row" style={{ justifyContent: 'space-between', padding: '8px 0 32px' }}>
          {s.phase === 'live' ? (
            <button className="lv-btn is-small is-quiet" onClick={() => confirm('End the session? Phones will stop accepting answers.') && control('end')}>
              End the session
            </button>
          ) : (
            <a className="lv-btn is-small is-ink" href={`/live/host?report=${s.code}`}>
              The report
            </a>
          )}
        </div>
      </main>
    </div>
  )
}
