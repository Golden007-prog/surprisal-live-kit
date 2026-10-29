/** The deck editor: the slide list, the slide's form (or the deck's settings), and a live preview at stage size. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  AGREE_LABELS,
  ANSWERABLE,
  KIND_HINT,
  KIND_LABEL,
  POINTS_BUDGET,
  comparable,
  LIMITS,
  blankSlide,
  cleanDeck,
  uid,
  type Deck,
  type DeckSettings,
  type PollChart,
  type Results,
  type Slide,
  type SlideKind,
} from '../lib/deck'
import { joinHost, joinUrl, live, writeJson, type ApiError } from '../lib/api'
import { ADMIN, adminKey, download, slug, type Hosting, type Saved } from '../lib/hostStore'
import { LETTERS } from '../lib/letters'
import { Stage } from '../components/Stage'

const ADDABLE: SlideKind[] = ['poll', 'wordcloud', 'open', 'scale', 'rank', 'points', 'number', 'grid', 'quiz', 'qa', 'content', 'leaderboard']

export function Editor({
  saved,
  onSave,
  onBack,
  onLive,
  themeBtn,
  shared,
}: {
  saved: Saved
  onSave: (d: Deck) => void
  onBack: () => void
  onLive: (h: Hosting) => void
  themeBtn: ReactNode
  /** The deck is in the shared library (saved on the server), not only this browser. */
  shared: boolean
}) {
  const [deck, setDeck] = useState<Deck>(saved.deck)
  // -1 is the deck's settings; 0… are slides.
  const [sel, setSel] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [key, setKey] = useState(adminKey)
  const [needKey, setNeedKey] = useState(false)

  // Save as you type, a beat after the last change.
  useEffect(() => {
    const t = setTimeout(() => onSave(deck), 300)
    return () => clearTimeout(t)
  }, [deck]) // eslint-disable-line react-hooks/exhaustive-deps

  const slide = deck.slides[Math.min(Math.max(0, sel), deck.slides.length - 1)]
  const setSlide = (s: Slide) => setDeck({ ...deck, slides: deck.slides.map((x) => (x.id === s.id ? s : x)) })
  const move = (d: -1 | 1) => {
    const j = sel + d
    if (j < 0 || j >= deck.slides.length) return
    const slides = [...deck.slides]
    ;[slides[sel], slides[j]] = [slides[j], slides[sel]]
    setDeck({ ...deck, slides })
    setSel(j)
  }
  const remove = () => {
    if (deck.slides.length === 1) return
    setDeck({ ...deck, slides: deck.slides.filter((_, i) => i !== sel) })
    setSel(Math.max(0, sel - 1))
  }
  const duplicate = () => {
    const slides = [...deck.slides]
    slides.splice(sel + 1, 0, { ...structuredClone(slide), id: uid() })
    setDeck({ ...deck, slides })
    setSel(sel + 1)
  }
  const add = (k: SlideKind) => {
    const slides = [...deck.slides]
    slides.splice(sel + 1, 0, blankSlide(k))
    setDeck({ ...deck, slides })
    setSel(sel + 1)
  }

  const goLive = async () => {
    const clean = cleanDeck(deck)
    if (!clean) return setErr('Every poll and quiz needs a question and at least two options.')
    if (clean.slides.length !== deck.slides.length) return setErr('A slide is missing its question or options. Check each one in the list.')
    if (clean.settings?.paced && clean.slides.some((x) => x.kind === 'quiz' || x.kind === 'leaderboard'))
      return setErr('A self-paced deck cannot have quizzes or leaderboards: they need the host’s clock. Remove them or switch self-paced off in Settings.')
    setBusy(true)
    setErr('')
    try {
      const r = await live.create(clean, key)
      if (key) writeJson(ADMIN, key)
      onLive({ code: r.code, token: r.hostToken, title: clean.title, at: Date.now() })
    } catch (x) {
      const e = x as ApiError
      if (e.status === 403) {
        setNeedKey(true)
        setErr('Going live needs the admin key (LIVE_ADMIN_KEY).')
      } else if (e.status === 503) setErr('Live sessions are not switched on: run supabase/migrations/0001_live.sql in Supabase and set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
      else setErr('Could not go live. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lv lv-host">
      <header className="lv-hostbar">
        <div className="lv-row" style={{ flex: '1 1 320px' }}>
          <button className="lv-btn is-quiet is-small" onClick={onBack} aria-label="Back to the library">
            ←
          </button>
          <input
            className="lv-input"
            style={{ maxWidth: 420, fontFamily: 'var(--sds-font-display)', fontSize: 20, background: 'transparent', borderColor: 'transparent' }}
            value={deck.title}
            maxLength={LIMITS.title}
            aria-label="Deck title"
            onChange={(e) => setDeck({ ...deck, title: e.target.value })}
          />
        </div>
        <div className="lv-hostbar-actions">
          {needKey && (
            <input
              className="lv-input"
              style={{ width: 200, minHeight: 34, fontSize: 14, padding: '6px 10px' }}
              type="password"
              placeholder="Admin key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              aria-label="Admin key"
            />
          )}
          <button className="lv-btn is-small" onClick={() => download(`${slug(deck.title)}.live.json`, JSON.stringify({ deck }, null, 2), 'application/json')}>
            Export JSON
          </button>
          <span className="lv-mono lv-muted" style={{ fontSize: 11 }} title={shared ? 'Saved to the shared library on the server' : 'Saved in this browser only'}>
            {shared ? 'Saved · shared' : 'Saved · this browser'}
          </span>
          {themeBtn}
          <button className="lv-btn is-primary is-small" onClick={goLive} disabled={busy}>
            {busy ? 'Starting…' : 'Go live'}
          </button>
        </div>
        {err && (
          <div className="lv-error" role="alert" style={{ flexBasis: '100%' }}>
            {err}
          </div>
        )}
      </header>
      <div className="lv-editor">
        <nav className="lv-rail" aria-label="Slides">
          <button className={`lv-railitem is-settings${sel === -1 ? ' is-on' : ''}`} onClick={() => setSel(-1)} aria-current={sel === -1}>
            <span className="lv-mono">⚙</span>
            <span>
              <small>Session</small>
              Settings
              {deck.settings && (
                <span className="lv-chips">
                  {deck.settings.paced && <span>Self-paced</span>}
                  {deck.settings.hold && <span>Filter</span>}
                </span>
              )}
            </span>
          </button>
          {deck.slides.map((s, i) => (
            <button key={s.id} className={`lv-railitem${i === sel ? ' is-on' : ''}`} onClick={() => setSel(i)} aria-current={i === sel}>
              <span className="lv-mono">{String(i + 1).padStart(2, '0')}</span>
              <span>
                <small>
                  {KIND_LABEL[s.kind]}
                  {s.kind === 'quiz' && s.typed ? ' · typed' : ''}
                  {s.timer ? ` · ${s.timer}s` : ''}
                  {s.notes ? ' · notes' : ''}
                </small>
                {s.title || <em className="lv-muted">No title</em>}
              </span>
            </button>
          ))}
          <div className="lv-addgrid">
            {ADDABLE.map((k) => (
              <button key={k} className="lv-btn is-small" title={KIND_HINT[k]} onClick={() => add(k)}>
                + {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </nav>
        <section className="lv-form" aria-label={sel === -1 ? 'Session settings' : 'Edit slide'}>
          {sel === -1 ? (
            <SettingsForm settings={deck.settings ?? {}} shared={shared} onChange={(settings) => setDeck({ ...deck, settings })} />
          ) : (
            <>
              <div className="lv-row" style={{ justifyContent: 'space-between' }}>
                <div className="lv-eyebrow">
                  {KIND_LABEL[slide.kind]} · {sel + 1} / {deck.slides.length}
                </div>
                <div className="lv-row">
                  <button className="lv-btn is-small is-quiet" onClick={() => move(-1)} disabled={sel === 0} aria-label="Move up">
                    ↑
                  </button>
                  <button className="lv-btn is-small is-quiet" onClick={() => move(1)} disabled={sel === deck.slides.length - 1} aria-label="Move down">
                    ↓
                  </button>
                  <button className="lv-btn is-small is-quiet" onClick={duplicate}>
                    Duplicate
                  </button>
                  <button className="lv-btn is-small is-quiet" onClick={remove} disabled={deck.slides.length === 1}>
                    Delete
                  </button>
                </div>
              </div>
              <SlideForm key={slide.id} deck={deck} slide={slide} onChange={setSlide} />
              <CommonFields key={`c-${slide.id}`} slide={slide} onChange={setSlide} />
            </>
          )}
        </section>
        <Preview deck={deck} slide={slide} index={sel} />
      </div>
    </div>
  )
}

function OptionsField({
  options,
  lo,
  hi,
  onChange,
  correct,
  onCorrect,
}: {
  options: string[]
  lo: number
  hi: number
  onChange: (o: string[], removed?: number) => void
  correct?: number
  onCorrect?: (i: number) => void
}) {
  return (
    <div className="lv-field">
      <span>Options{onCorrect ? ' · tick the right one' : ''}</span>
      {options.map((o, i) => (
        <div key={i} className="lv-optrow">
          {onCorrect ? (
            <button
              className={`lv-check${correct === i ? ' is-on' : ''}`}
              aria-pressed={correct === i}
              aria-label={`Mark ${LETTERS[i]} as the right answer`}
              onClick={() => onCorrect(i)}
            >
              {LETTERS[i]}
            </button>
          ) : (
            <span className="lv-check" style={{ display: 'grid', placeItems: 'center' }} aria-hidden>
              {LETTERS[i]}
            </span>
          )}
          <input
            className="lv-input"
            value={o}
            maxLength={LIMITS.option}
            aria-label={`Option ${LETTERS[i]}`}
            onChange={(e) => onChange(options.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button
            className="lv-btn is-small is-quiet"
            disabled={options.length <= lo}
            aria-label={`Remove option ${LETTERS[i]}`}
            onClick={() =>
              onChange(
                options.filter((_, j) => j !== i),
                i,
              )
            }
          >
            ×
          </button>
        </div>
      ))}
      {options.length < hi && (
        <button className="lv-btn is-small" style={{ justifySelf: 'start' }} onClick={() => onChange([...options, `Option ${LETTERS[options.length]}`])}>
          + Option
        </button>
      )}
    </div>
  )
}

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="lv-field">
      <span>{label}</span>
      <div className="lv-segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={String(v)} role="radio" aria-checked={v === value} className={`lv-btn is-small${v === value ? ' is-on' : ''}`} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

function CompareField({ deck, slide, onChange }: { deck: Deck; slide: Slide & { compare?: string }; onChange: (id: string | undefined) => void }) {
  const earlier = comparable(deck, slide)
  return (
    <label className="lv-field">
      <span>Before and after</span>
      <select className="lv-input" value={slide.compare ?? ''} onChange={(e) => onChange(e.target.value || undefined)} disabled={!earlier.length}>
        <option value="">{earlier.length ? 'No comparison' : 'Ask the same question earlier in the deck to compare'}</option>
        {earlier.map((x) => (
          <option key={x.id} value={x.id}>
            Compare with slide {deck.slides.indexOf(x) + 1}: {x.title.slice(0, 60)}
          </option>
        ))}
      </select>
    </label>
  )
}

const numberOr = (v: string, d: number) => {
  const n = Number(v.replace(',', '.'))
  return v.trim() !== '' && Number.isFinite(n) ? n : d
}

function SlideForm({ deck, slide, onChange }: { deck: Deck; slide: Slide; onChange: (s: Slide) => void }) {
  const title = (
    <label className="lv-field">
      <span>{slide.kind === 'content' ? 'Title' : slide.kind === 'scale' && slide.mode === 'agree' ? 'The statement' : 'Question'}</span>
      <textarea className="lv-input" style={{ minHeight: 70 }} value={slide.title} maxLength={LIMITS.title} onChange={(e) => onChange({ ...slide, title: e.target.value })} />
    </label>
  )
  const text = (label: string, value: string, set: (v: string) => void, max: number = LIMITS.label) => (
    <label className="lv-field">
      <span>{label}</span>
      <input className="lv-input" value={value} maxLength={max} onChange={(e) => set(e.target.value)} />
    </label>
  )
  switch (slide.kind) {
    case 'content':
      return (
        <>
          {text('Eyebrow (optional)', slide.eyebrow ?? '', (v) => onChange({ ...slide, eyebrow: v }), 60)}
          {title}
          <label className="lv-field">
            <span>Body (optional)</span>
            <textarea className="lv-input" value={slide.body ?? ''} maxLength={LIMITS.body} onChange={(e) => onChange({ ...slide, body: e.target.value })} />
          </label>
          <p className="lv-muted" style={{ margin: 0, fontSize: 13 }}>
            When this is the first slide, the join code, the QR code and the names of everyone joining show on it.
          </p>
        </>
      )
    case 'poll': {
      const multi = slide.multi ?? 1
      return (
        <>
          {title}
          <OptionsField
            options={slide.options}
            lo={LIMITS.options[0]}
            hi={LIMITS.options[1]}
            onChange={(options) => onChange({ ...slide, options, ...(slide.multi ? { multi: Math.min(slide.multi, options.length) } : {}) })}
          />
          <Segmented
            label="People can pick"
            value={multi > 1 ? 'many' : 'one'}
            options={[
              ['one', 'One'],
              ['many', 'Several'],
            ]}
            onChange={(v) => {
              const { multi: _m, ...rest } = slide // eslint-disable-line @typescript-eslint/no-unused-vars
              onChange(v === 'many' ? { ...rest, multi: slide.options.length, chart: slide.chart === 'donut' ? undefined : slide.chart } : rest)
            }}
          />
          {multi > 1 && (
            <label className="lv-field">
              <span>Up to</span>
              <select className="lv-input" value={multi} onChange={(e) => onChange({ ...slide, multi: Number(e.target.value) })}>
                {slide.options.slice(1).map((_, i) => (
                  <option key={i} value={i + 2}>
                    {i + 2} picks
                  </option>
                ))}
              </select>
            </label>
          )}
          <Segmented
            label="Chart"
            value={slide.chart ?? 'bars'}
            options={
              multi > 1
                ? [
                    ['bars', 'Bars'],
                    ['columns', 'Columns'],
                  ]
                : [
                    ['bars', 'Bars'],
                    ['columns', 'Columns'],
                    ['donut', 'Donut'],
                  ]
            }
            onChange={(v) => onChange({ ...slide, chart: v === 'bars' ? undefined : (v as PollChart) })}
          />
          <CompareField deck={deck} slide={slide} onChange={(compare) => onChange({ ...slide, compare })} />
          {slide.compare && slide.chart && (
            <p className="lv-muted" style={{ margin: 0, fontSize: 13 }}>
              A comparison always shows as bars, with a tick where each bar was before.
            </p>
          )}
        </>
      )
    }
    case 'quiz':
      return (
        <>
          {title}
          <Segmented
            label="People answer by"
            value={slide.typed ? 'type' : 'pick'}
            options={[
              ['pick', 'Picking an option'],
              ['type', 'Typing it'],
            ]}
            onChange={(v) => {
              const { typed: _t, ...rest } = slide // eslint-disable-line @typescript-eslint/no-unused-vars
              onChange(
                v === 'type'
                  ? { ...rest, options: [], correct: -1, typed: [slide.options[Math.max(0, slide.correct)] || 'Your answer'] }
                  : { ...rest, options: ['Right', 'Wrong'], correct: 0 },
              )
            }}
          />
          {slide.typed ? (
            <div className="lv-field">
              <span>Accepted answers · case, accents and one typo are forgiven</span>
              {slide.typed.map((t, i) => (
                <div key={i} className="lv-optrow">
                  <span className="lv-check is-on" style={{ display: 'grid', placeItems: 'center' }} aria-hidden>
                    ✓
                  </span>
                  <input
                    className="lv-input"
                    value={t}
                    maxLength={LIMITS.option}
                    aria-label={`Accepted answer ${i + 1}`}
                    onChange={(e) => onChange({ ...slide, typed: slide.typed!.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                  <button
                    className="lv-btn is-small is-quiet"
                    disabled={slide.typed!.length <= 1}
                    aria-label={`Remove accepted answer ${i + 1}`}
                    onClick={() => onChange({ ...slide, typed: slide.typed!.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </div>
              ))}
              {slide.typed.length < 8 && (
                <button className="lv-btn is-small" style={{ justifySelf: 'start' }} onClick={() => onChange({ ...slide, typed: [...slide.typed!, ''] })}>
                  + Another spelling
                </button>
              )}
            </div>
          ) : (
            <OptionsField
              options={slide.options}
              lo={LIMITS.quizOptions[0]}
              hi={LIMITS.quizOptions[1]}
              correct={slide.correct}
              onCorrect={(i) => onChange({ ...slide, correct: i })}
              onChange={(options, removed) => {
                const c = removed == null ? slide.correct : slide.correct === removed ? 0 : slide.correct > removed ? slide.correct - 1 : slide.correct
                onChange({ ...slide, options, correct: Math.min(c, options.length - 1) })
              }}
            />
          )}
          <label className="lv-field">
            <span>Seconds to answer</span>
            <select className="lv-input" value={slide.seconds} onChange={(e) => onChange({ ...slide, seconds: Number(e.target.value) })}>
              {[10, 15, 20, 30, 45, 60, 90].map((n) => (
                <option key={n} value={n}>
                  {n} s
                </option>
              ))}
            </select>
          </label>
        </>
      )
    case 'rank':
    case 'points':
      return (
        <>
          {title}
          <OptionsField options={slide.options} lo={LIMITS.listOptions[0]} hi={LIMITS.listOptions[1]} onChange={(options) => onChange({ ...slide, options })} />
          <p className="lv-muted" style={{ margin: 0, fontSize: 13 }}>
            {slide.kind === 'rank'
              ? 'Everyone puts these in order. The screen shows the room’s order: first place is worth the most.'
              : `Everyone spends up to ${POINTS_BUDGET} points across these. The screen shows the totals.`}
          </p>
        </>
      )
    case 'wordcloud':
      return (
        <>
          {title}
          <Segmented
            label="Words each person can send"
            value={slide.entries}
            options={[
              [1, '1'],
              [2, '2'],
              [3, '3'],
            ]}
            onChange={(entries) => onChange({ ...slide, entries })}
          />
        </>
      )
    case 'scale': {
      const agree = slide.mode === 'agree'
      return (
        <>
          <Segmented
            label="Kind"
            value={agree ? 'agree' : 'rating'}
            options={[
              ['rating', 'Rating'],
              ['agree', 'Agree / disagree'],
            ]}
            onChange={(v) =>
              onChange(
                v === 'agree'
                  ? { ...slide, mode: 'agree', max: 5, minLabel: AGREE_LABELS[0], maxLabel: AGREE_LABELS[4], compare: undefined }
                  : { ...slide, mode: undefined, minLabel: 'Not at all', maxLabel: 'Completely', compare: undefined },
              )
            }
          />
          {title}
          {!agree && (
            <>
              <Segmented
                label="Scale"
                value={slide.max}
                options={[
                  [5, '1 to 5'],
                  [10, '1 to 10'],
                ]}
                onChange={(max) => onChange({ ...slide, max: max === 10 ? 10 : 5, compare: undefined })}
              />
              <div className="lv-split">
                {text('Low end', slide.minLabel, (v) => onChange({ ...slide, minLabel: v }))}
                {text('High end', slide.maxLabel, (v) => onChange({ ...slide, maxLabel: v }))}
              </div>
            </>
          )}
          {agree && (
            <p className="lv-muted" style={{ margin: 0, fontSize: 13 }}>
              Five steps from strongly disagree to strongly agree, shown as one bar centred on neutral.
            </p>
          )}
          <CompareField deck={deck} slide={slide} onChange={(compare) => onChange({ ...slide, compare })} />
        </>
      )
    }
    case 'number':
      return (
        <>
          {title}
          <div className="lv-split">
            <label className="lv-field">
              <span>Lowest guess</span>
              <input className="lv-input" inputMode="decimal" defaultValue={slide.min} onBlur={(e) => onChange({ ...slide, min: numberOr(e.target.value, slide.min) })} />
            </label>
            <label className="lv-field">
              <span>Highest guess</span>
              <input className="lv-input" inputMode="decimal" defaultValue={slide.max} onBlur={(e) => onChange({ ...slide, max: numberOr(e.target.value, slide.max) })} />
            </label>
          </div>
          <div className="lv-split">
            {text('Unit (optional)', slide.unit ?? '', (v) => onChange({ ...slide, unit: v || undefined }), 12)}
            <label className="lv-field">
              <span>The truth (optional)</span>
              <input
                className="lv-input"
                inputMode="decimal"
                defaultValue={slide.answer ?? ''}
                placeholder="Shown at the reveal"
                onBlur={(e) => {
                  const { answer: _a, ...rest } = slide // eslint-disable-line @typescript-eslint/no-unused-vars
                  onChange(e.target.value.trim() === '' ? rest : { ...slide, answer: numberOr(e.target.value, slide.answer ?? 0) })
                }}
              />
            </label>
          </div>
          <p className="lv-muted" style={{ margin: 0, fontSize: 13 }}>
            Guesses stay hidden until you reveal them, so nobody anchors on the room. The reveal shows the spread, the median, the truth, and the room’s surprisal in bits.
          </p>
        </>
      )
    case 'grid':
      return (
        <>
          {title}
          <div className="lv-split">
            {text('Left (low x)', slide.xLow, (v) => onChange({ ...slide, xLow: v }))}
            {text('Right (high x)', slide.xHigh, (v) => onChange({ ...slide, xHigh: v }))}
          </div>
          <div className="lv-split">
            {text('Bottom (low y)', slide.yLow, (v) => onChange({ ...slide, yLow: v }))}
            {text('Top (high y)', slide.yHigh, (v) => onChange({ ...slide, yHigh: v }))}
          </div>
          <div className="lv-field">
            <span>Quadrant names (optional)</span>
            <div className="lv-split">
              {(['Top left', 'Top right', 'Bottom left', 'Bottom right'] as const).map((l, i) => (
                <input
                  key={l}
                  className="lv-input"
                  placeholder={l}
                  aria-label={`${l} quadrant`}
                  value={slide.quadrants?.[i] ?? ''}
                  maxLength={LIMITS.label}
                  onChange={(e) => {
                    const q = [...(slide.quadrants ?? ['', '', '', ''])] as [string, string, string, string]
                    q[i] = e.target.value
                    onChange({ ...slide, quadrants: q })
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )
    case 'open':
      return title
    case 'qa':
      return (
        <>
          {title}
          <p className="lv-muted" style={{ margin: 0, fontSize: 13 }}>
            People can ask from their phone at any point in the session; this slide shows the questions, most votes first.
          </p>
        </>
      )
    case 'leaderboard':
      return (
        <>
          {title}
          <label className="lv-row" style={{ gap: 10 }}>
            <input type="checkbox" checked={!!slide.final} onChange={(e) => onChange({ ...slide, final: e.target.checked || undefined })} />
            <span>Show as a podium (the final leaderboard)</span>
          </label>
        </>
      )
  }
}

/** A seeded pseudo-random stream, so the preview's sample answers hold still between renders. */
function seeded(seed: number) {
  let t = seed
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Made-up answers, so the preview shows what the room will see. */
function sampleResults(slide: Slide): Results | undefined {
  const rand = seeded(slide.title.length * 31 + 7)
  if (slide.kind === 'quiz' && slide.typed)
    return {
      kind: 'typed',
      correct: 17,
      total: 24,
      answers: [
        { text: slide.typed[0] || 'Stockholm', count: 15, ok: true },
        { text: 'Gothenburg', count: 4, ok: false },
        { text: `${(slide.typed[0] || 'Stockholm').slice(0, -1)}`, count: 2, ok: true },
        { text: 'Oslo', count: 3, ok: false },
      ],
    }
  switch (slide.kind) {
    case 'quiz':
    case 'poll': {
      const counts = slide.options.map((_, i) => [7, 12, 4, 9, 3, 5][i] ?? 2)
      const total = slide.kind === 'poll' && slide.multi ? 16 : counts.reduce((a, b) => a + b, 0)
      return {
        kind: 'choice',
        counts,
        total,
        ...(slide.kind === 'poll' && slide.compare ? { previous: { kind: 'choice' as const, counts: counts.map((c, i) => Math.max(0, c + [3, -4, 2, -1, 1, 0][i])), total } } : {}),
      }
    }
    case 'scale': {
      if (slide.mode === 'agree') {
        const counts = [3, 6, 4, 9, 5]
        return {
          kind: 'scale',
          counts,
          total: 27,
          average: 3.2,
          ...(slide.compare ? { previous: { kind: 'scale' as const, counts: [6, 8, 5, 6, 2], total: 27, average: 2.6 } } : {}),
        }
      }
      const counts = slide.max === 5 ? [1, 3, 8, 6, 2] : [0, 1, 1, 2, 4, 5, 6, 3, 2, 1]
      return {
        kind: 'scale',
        counts,
        total: counts.reduce((a, b) => a + b, 0),
        average: slide.max === 5 ? 3.3 : 5.9,
        ...(slide.compare ? { previous: { kind: 'scale' as const, counts, total: 20, average: slide.max === 5 ? 2.8 : 5.1 } } : {}),
      }
    }
    case 'rank': {
      const n = slide.options.length
      const scores = slide.options.map((_, i) => Math.round((n - i) * 9 + rand() * 10))
      return { kind: 'rank', scores, avg: scores.map((sc) => Math.round((n - sc / 12) * 10) / 10), firsts: slide.options.map((_, i) => Math.max(0, 6 - i * 2)), total: 18 }
    }
    case 'points':
      return { kind: 'points', totals: slide.options.map((_, i) => [520, 340, 610, 180, 250, 90, 60, 40][i] ?? 30), total: 20 }
    case 'number': {
      const span = slide.max - slide.min
      const centre = slide.answer != null ? slide.answer + span * 0.12 : slide.min + span * 0.4
      const values = Array.from({ length: 28 }, () => {
        const g = (rand() + rand() + rand() - 1.5) * span * 0.35
        return Math.min(slide.max, Math.max(slide.min, Math.round((centre + g) * 10) / 10))
      }).sort((a, b) => a - b)
      return { kind: 'number', values, total: values.length, median: (values[13] + values[14]) / 2, mean: null }
    }
    case 'grid': {
      const points = Array.from({ length: 26 }, () => ({ x: Math.round(20 + rand() * 75), y: Math.round(10 + rand() * 80) }))
      return {
        kind: 'grid',
        points,
        total: points.length,
        mean: { x: points.reduce((a, p) => a + p.x, 0) / points.length, y: points.reduce((a, p) => a + p.y, 0) / points.length },
      }
    }
    case 'wordcloud':
      return {
        kind: 'words',
        total: 18,
        words: [
          { text: 'attention', count: 9 },
          { text: 'agents', count: 6 },
          { text: 'loops', count: 4 },
          { text: 'trust', count: 4 },
          { text: 'boredom', count: 3 },
          { text: 'guardrails', count: 2 },
          { text: 'memory', count: 2 },
          { text: 'Simone Weil', count: 1 },
          { text: 'calendars', count: 1 },
          { text: 'friction', count: 1 },
          { text: 'taste', count: 1 },
        ],
      }
    case 'open':
      return {
        kind: 'open',
        total: 3,
        entries: [
          { id: 'a', text: 'To see how other people actually use this stuff day to day.', at: 3 },
          { id: 'b', text: 'One working agent by the end of the month.', at: 2 },
          { id: 'c', text: 'Mostly the company, honestly.', at: 1 },
        ],
      }
    case 'qa':
      return {
        kind: 'qa',
        total: 2,
        questions: [
          { id: 'a', text: 'How do you stop an agent from emailing the wrong person?', votes: 7, answered: false, at: 1 },
          { id: 'b', text: 'Which model do you use for what?', votes: 3, answered: false, at: 2 },
        ],
      }
    case 'leaderboard':
      return {
        kind: 'board',
        total: 5,
        board: [
          { name: 'Ana', score: 2740 },
          { name: 'Ben', score: 2310 },
          { name: 'Chiara', score: 1980 },
          { name: 'Dev', score: 1200 },
          { name: 'Eli', score: 640 },
        ],
      }
    default:
      return undefined
  }
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="lv-toggle">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <b>{label}</b>
        <small>{hint}</small>
      </span>
    </label>
  )
}

function SettingsForm({ settings, shared, onChange }: { settings: DeckSettings; shared: boolean; onChange: (s: DeckSettings) => void }) {
  const set = (k: keyof DeckSettings, v: boolean) => {
    const next = { ...settings }
    if (v) next[k] = true
    else delete next[k]
    onChange(next)
  }
  return (
    <>
      <div className="lv-eyebrow">Session settings</div>
      <Toggle
        label="Self-paced"
        hint="Each phone moves through the slides on its own: a survey before a session, feedback after. No quizzes or leaderboards. The screen shows each slide’s results and how far people have got."
        on={!!settings.paced}
        onChange={(v) => set('paced', v)}
      />
      <Toggle
        label="Word filter"
        hint="Open answers, word-cloud words and questions that trip the swear and slur filter wait in the console until you approve them. Nothing rude reaches the shared screen by surprise."
        on={!!settings.hold}
        onChange={(v) => set('hold', v)}
      />
      <p className="lv-muted" style={{ margin: 0, fontSize: 13 }}>
        {shared
          ? 'This deck is in the shared library: everyone with the admin key sees it.'
          : 'This deck is saved in this browser only. Add the admin key on the library page to share it.'}
      </p>
    </>
  )
}

const TIMERS = [0, 15, 30, 45, 60, 90, 120]

/** Fields every slide has: the image, a timer (answerable slides), and the host's notes. */
function CommonFields({ slide, onChange }: { slide: Slide; onChange: (s: Slide) => void }) {
  const canImage = slide.kind === 'content' || slide.kind === 'poll' || slide.kind === 'quiz' || slide.kind === 'number'
  const canTimer = ANSWERABLE.has(slide.kind) && slide.kind !== 'quiz'
  const drop = (k: 'image' | 'timer' | 'notes') => {
    const next = { ...slide }
    delete next[k]
    return next
  }
  return (
    <div className="lv-common">
      {canTimer && (
        <label className="lv-field">
          <span>Timer · answers close when it runs out</span>
          <select className="lv-input" value={slide.timer ?? 0} onChange={(e) => onChange(Number(e.target.value) ? { ...slide, timer: Number(e.target.value) } : drop('timer'))}>
            {TIMERS.map((n) => (
              <option key={n} value={n}>
                {n ? `${n} seconds` : 'No timer'}
              </option>
            ))}
          </select>
        </label>
      )}
      {canImage && (
        <label className="lv-field">
          <span>Image (optional) · an https link</span>
          <input
            className="lv-input"
            inputMode="url"
            placeholder="https://…"
            defaultValue={slide.image ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim()
              onChange(v && /^https:\/\//.test(v) ? { ...slide, image: v } : drop('image'))
            }}
          />
        </label>
      )}
      <label className="lv-field">
        <span>Notes for you · on the console, never on the shared screen or phones</span>
        <textarea
          className="lv-input"
          style={{ minHeight: 70 }}
          maxLength={LIMITS.notes}
          value={slide.notes ?? ''}
          placeholder="The run-sheet line: what to say, who reads, when to move on"
          onChange={(e) => onChange(e.target.value ? { ...slide, notes: e.target.value } : drop('notes'))}
        />
      </label>
    </div>
  )
}

function Preview({ deck, slide, index }: { deck: Deck; slide: Slide; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1600))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <aside className="lv-preview" aria-label="Preview">
      <div className="lv-eyebrow is-plain">Preview · sample answers</div>
      <div ref={ref} className="lv-preview-frame" style={{ ['--lv-scale' as string]: scale }} aria-hidden>
        <Stage
          title={deck.title}
          code="ABCD"
          host={joinHost()}
          url={joinUrl('ABCD')}
          slide={slide}
          index={index}
          count={deck.slides.length}
          results={sampleResults(slide)}
          showResults
          answered={20}
          participants={24}
          remaining={null}
          timerFraction={null}
        />
      </div>
      <p className="lv-muted" style={{ fontSize: 13, margin: 0 }}>
        Present with ← → (or space). R shows results, V opens or closes voting, J shows the join code, F goes full screen.
      </p>
    </aside>
  )
}
