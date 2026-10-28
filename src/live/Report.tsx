/**
 * The report after a session: who came, every slide's result, the questions, the leaderboard, and the open answers
 * written up as Markdown for a follow-up. Prints cleanly.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { KIND_LABEL } from '../lib/live'
import { BRAND, BrandMark } from '../brand'
import { live, type ApiError } from './api'
import { download, slug, type Hosting } from './hostStore'
import { writeupMarkdown, type Export } from './writeup'
import { Board, SlideResults } from './Results'

export function Report({ hosting, onBack, themeBtn }: { hosting: Hosting; onBack: () => void; themeBtn: ReactNode }) {
  const [r, setR] = useState<Export | null>(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    live
      .exportAll(hosting.code, hosting.token)
      .then((x) => setR(x as unknown as Export))
      .catch((e: ApiError) => setErr(e.status === 404 ? 'This session no longer exists.' : 'Could not load the report.'))
  }, [hosting.code, hosting.token])
  const md = useMemo(() => (r ? writeupMarkdown(r) : ''), [r])

  if (!r)
    return (
      <div className="lv lv-host">
        <div className="lv-library">
          <div className="lv-status is-quiet">{err || 'Loading the report…'}</div>
        </div>
      </div>
    )
  const totalAnswers = r.answers.reduce((a, b) => a + b, 0)
  const reactions = Object.entries(r.reactions).sort((a, b) => b[1] - a[1])
  const questions = r.results.flatMap((x) => (x.results?.kind === 'qa' ? x.results.questions : []))
  const base = `live-${slug(r.title)}-${r.code}`
  return (
    <div className="lv lv-host lv-report">
      <header className="lv-hostbar lv-noprint">
        <div className="lv-row">
          <button className="lv-btn is-quiet is-small" onClick={onBack} aria-label="Back to the library">
            ←
          </button>
          <span className="lv-brand">
            <BrandMark />
            <span>Report · {r.code}</span>
          </span>
        </div>
        <div className="lv-hostbar-actions">
          <button className="lv-btn is-small" onClick={() => download(`${base}.csv`, r.csv, 'text/csv')}>
            CSV
          </button>
          <button
            className="lv-btn is-small"
            onClick={() => {
              const { csv: _csv, ...rest } = r // eslint-disable-line @typescript-eslint/no-unused-vars
              download(`${base}.json`, JSON.stringify(rest, null, 2), 'application/json')
            }}
          >
            JSON
          </button>
          <button className="lv-btn is-small" onClick={() => print()}>
            Print or PDF
          </button>
          {themeBtn}
        </div>
      </header>
      <main className="lv-library">
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="lv-eyebrow">
            {BRAND.name} · {new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })} · {r.phase === 'ended' ? 'ended' : 'still live'}
          </div>
          <h1 className="lv-title">{r.title}</h1>
        </div>
        <div className="lv-stats lv-report-stats">
          <Tile label="People" value={String(r.participants.total)} />
          <Tile label="Answers" value={totalAnswers.toLocaleString('en')} />
          <Tile label="Slides" value={String(r.deck.slides.length)} />
          <Tile label="Questions" value={String(questions.length)} />
          <Tile label="Reactions" value={reactions.length ? reactions.map(([e, n]) => `${e} ${n}`).join('  ') : '–'} />
        </div>

        {md.split('\n').length > 4 && (
          <section className="lv-report-news">
            <div className="lv-row" style={{ justifyContent: 'space-between' }}>
              <div className="lv-eyebrow">Write-up · Markdown to paste</div>
              <button
                className="lv-btn is-small lv-noprint"
                onClick={() =>
                  navigator.clipboard?.writeText(md).then(
                    () => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1600)
                    },
                    () => {},
                  )
                }
              >
                {copied ? 'Copied' : 'Copy Markdown'}
              </button>
            </div>
            <pre>{md}</pre>
          </section>
        )}

        {r.results.map(({ slide, results }, i) =>
          slide.kind === 'content' ? null : (
            <section key={slide.id} className="lv-report-slide">
              <div className="lv-eyebrow">
                {String(i + 1).padStart(2, '0')} · {KIND_LABEL[slide.kind]}
                {results && slide.kind !== 'qa' ? ` · ${r.answers[i]} ${r.answers[i] === 1 ? 'answer' : 'answers'}` : ''}
              </div>
              <h2 className="lv-title lv-report-h">{slide.title}</h2>
              {slide.kind === 'leaderboard' ? (
                <Board board={r.leaderboard.slice(0, 10)} />
              ) : results ? (
                <div className="lv-report-chart">
                  <SlideResults slide={slide} results={results} compact />
                </div>
              ) : null}
            </section>
          ),
        )}

        {r.leaderboard.length > 0 && !r.deck.slides.some((x) => x.kind === 'leaderboard') && (
          <section className="lv-report-slide">
            <div className="lv-eyebrow">Quiz leaderboard</div>
            <Board board={r.leaderboard.slice(0, 10)} />
          </section>
        )}

        <section className="lv-report-slide">
          <div className="lv-eyebrow">Who came · {r.participants.total}</div>
          <p className="lv-muted" style={{ margin: 0, lineHeight: 1.7 }}>
            {r.participants.names.join(', ') || 'Nobody joined.'}
          </p>
        </section>
      </main>
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="lv-stat">
      <span>{label}</span>
      <b>{value}</b>
      {hint && <small className="lv-muted">{hint}</small>}
    </div>
  )
}
