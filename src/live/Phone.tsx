/** /live — the participant's phone. Join with a code, then follow the host slide by slide. */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  AGREE_LABELS,
  ANSWERABLE,
  CODE_LENGTH,
  LIMITS,
  POINTS_BUDGET,
  REACTIONS,
  cleanCode,
  formatNumber,
  type Answer,
  type GridSlide,
  type MeState,
  type NumberSlide,
  type PublicState,
  type Results,
  type Slide,
} from '../lib/live'
import { BRAND, BrandMark } from '../brand'
import { live, participantId, readJson, useNow, usePoll, writeJson, type ApiError } from './api'
import { Board, GridChart, QaList, SlideResults } from './Results'
import { LETTERS } from './letters'

type Joined = { code: string; name: string }
const JOINED_KEY = 'live_kit_joined'
const answersKey = (code: string) => `live_kit_answers_${code}`
const votesKey = (code: string) => `live_kit_votes_${code}`

const MESSAGES: Record<string, string> = {
  not_found: 'No session with that code. Check the screen and try again.',
  bad_code: `The code is ${CODE_LENGTH} letters.`,
  ended: 'This session has ended.',
  closed: 'Voting is closed for this one.',
  not_current: 'The host has moved on.',
  already_answered: 'Your answer is locked in.',
  not_started: 'Not yet: wait for the clock.',
  rate_limited: 'Slow down a little and try again.',
  not_configured: 'Live sessions are not switched on yet.',
  unavailable: 'Live sessions are not switched on yet.',
  offline: 'You seem to be offline.',
  join_first: 'Join the session first.',
  name_flagged: 'Pick another name: that one goes on the big screen.',
}
const message = (e: unknown) => MESSAGES[(e as ApiError)?.error] ?? 'Something went wrong. Try again.'

export function Phone() {
  const pid = useMemo(() => participantId(), [])
  const [joined, setJoined] = useState<Joined | null>(() => {
    const j = readJson<Joined | null>(JOINED_KEY, null)
    const fromUrl = cleanCode(new URLSearchParams(location.search).get('c'))
    return j && (!fromUrl || fromUrl === j.code) ? j : null
  })
  const leave = () => {
    writeJson(JOINED_KEY, null)
    setJoined(null)
  }
  return <div className="lv">{joined ? <Room pid={pid} joined={joined} onLeave={leave} /> : <JoinForm pid={pid} onJoined={(j) => (writeJson(JOINED_KEY, j), setJoined(j))} />}</div>
}

function JoinForm({ pid, onJoined }: { pid: string; onJoined: (j: Joined) => void }) {
  const [code, setCode] = useState(() => cleanCode(new URLSearchParams(location.search).get('c')) ?? '')
  const [name, setName] = useState(() => readJson<string>('live_kit_name', ''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const c = cleanCode(code)
    if (!c) return setErr(MESSAGES.bad_code)
    if (!name.trim()) return setErr('Add a name, so the host can say hello.')
    setBusy(true)
    setErr('')
    try {
      const r = await live.join(c, pid, name)
      writeJson('live_kit_name', r.name)
      history.replaceState(null, '', `/live?c=${c}`)
      onJoined({ code: c, name: r.name })
    } catch (x) {
      setErr(message(x))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lv-phone">
      <header className="lv-phone-top">
        <span>{BRAND.name.toUpperCase()}</span>
        <span className="lv-brand">
          <BrandMark />
        </span>
      </header>
      <main className="lv-phone-main">
        <form className="lv-joinform" onSubmit={submit} noValidate>
          <div className="lv-eyebrow">Join the session</div>
          <h1 className="lv-title">Enter the code on the screen.</h1>
          <label className="lv-field">
            <span>Code</span>
            <input
              className="lv-input is-code"
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, '')
                    .slice(0, CODE_LENGTH),
                )
              }
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="····"
              aria-label="Session code"
            />
          </label>
          <label className="lv-field">
            <span>Your name</span>
            <input className="lv-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.name} autoComplete="given-name" placeholder="First name is fine" />
          </label>
          {err && (
            <div className="lv-error" role="alert">
              {err}
            </div>
          )}
          <button className="lv-btn is-primary is-block" disabled={busy}>
            {busy ? 'Joining…' : 'Join'}
          </button>
          <p className="lv-muted" style={{ fontSize: 13, margin: 0 }}>
            Only your name and your answers are kept. Word clouds and open answers show on screen without names.
          </p>
        </form>
      </main>
      <div />
    </div>
  )
}

function Room({ pid, joined, onLeave }: { pid: string; joined: Joined; onLeave: () => void }) {
  const { code } = joined
  const load = useCallback(() => live.state(code), [code])
  const { data: s, error, offset, refresh } = usePoll<PublicState>(load, 1200)
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => readJson(answersKey(code), {}))
  const [asking, setAsking] = useState(false)

  const remember = (slide: string, a: Answer) => {
    const next = { ...answers, [slide]: a }
    setAnswers(next)
    writeJson(answersKey(code), next)
  }

  // A session that no longer exists (or a code from yesterday) sends the phone back to the join form.
  useEffect(() => {
    if (error?.status === 404) onLeave()
  }, [error, onLeave])

  // Rejoin quietly on load, so a server that forgot us (dev restart) or a renamed person is current.
  useEffect(() => {
    live.join(code, pid, joined.name).catch(() => {})
  }, [code, pid, joined.name])

  return (
    <div className="lv-phone">
      <header className="lv-phone-top">
        <span>
          <b>{code}</b> · {joined.name}
        </span>
        <button className="lv-btn is-quiet is-small" onClick={onLeave}>
          Leave
        </button>
      </header>
      <main className="lv-phone-main" aria-live="polite">
        {!s ? (
          error ? (
            <div className="lv-status is-quiet">{message(error)}</div>
          ) : (
            <div className="lv-status is-quiet">Connecting…</div>
          )
        ) : s.phase === 'ended' ? (
          <Ended code={code} pid={pid} />
        ) : s.settings.paced && s.slides ? (
          <Paced s={s} pid={pid} answers={answers} remember={remember} />
        ) : (
          <SlideView key={s.slide.id} s={s} pid={pid} offset={offset} mine={answers[s.slide.id]} onAnswered={(a) => (remember(s.slide.id, a), refresh())} />
        )}
        {error && s && error.status !== 404 && <div className="lv-status is-quiet">{message(error)} Retrying…</div>}
      </main>
      {s && s.phase === 'live' && !s.settings.paced && (
        <footer className="lv-phone-bottom">
          <Reactions code={code} pid={pid} />
          {s.qaSlide && s.slide.kind !== 'qa' && !s.settings.paced && (
            <button className="lv-btn is-small" onClick={() => setAsking(true)}>
              Ask a question
            </button>
          )}
        </footer>
      )}
      {asking && <AskSheet code={code} pid={pid} onClose={() => setAsking(false)} />}
    </div>
  )
}

function SlideView({ s, pid, offset, mine, onAnswered }: { s: PublicState; pid: string; offset: number; mine?: Answer; onAnswered: (a: Answer) => void }) {
  const slide = s.slide
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async (a: Answer) => {
    setBusy(true)
    setErr('')
    try {
      await live.answer(s.code, pid, slide.id, a)
      onAnswered(a)
    } catch (x) {
      // A quiz answer the server already has is still this person's answer.
      if ((x as ApiError).error === 'already_answered') onAnswered(a)
      setErr(message(x))
    } finally {
      setBusy(false)
    }
  }
  const head = (
    <>
      <div className="lv-row" style={{ justifyContent: 'space-between' }}>
        <div className="lv-eyebrow">{slide.kind === 'content' ? slide.eyebrow || 'On screen' : `${s.index + 1} / ${s.count}`}</div>
        {s.timerAt != null && s.timerSeconds != null && slide.kind !== 'quiz' && <Clock at={s.timerAt} seconds={s.timerSeconds} offset={offset} />}
      </div>
      <h1 className="lv-title">{slide.title}</h1>
      {slide.image && <img className="lv-phone-img" src={slide.image} alt="" />}
    </>
  )
  const errBox = err && (
    <div className="lv-error" role="alert">
      {err}
    </div>
  )

  // After answering, the phone shows the room's result too, when the host has results on.
  const room =
    mine && s.showResults && s.results ? (
      <div className="lv-phone-results">
        <div className="lv-eyebrow is-plain">The room</div>
        <SlideResults slide={slide} results={s.results} compact />
      </div>
    ) : null
  const tail = (
    <>
      {errBox}
      <Note s={s} answered={!!mine} />
      {room}
    </>
  )

  switch (slide.kind) {
    case 'content':
      return (
        <>
          {head}
          {slide.body && (
            <p className="lv-serif lv-muted" style={{ margin: 0, whiteSpace: 'pre-line', lineHeight: 1.45 }}>
              {slide.body}
            </p>
          )}
          <div className="lv-status is-quiet">Eyes on the screen.</div>
        </>
      )
    case 'poll':
      return (
        <>
          {head}
          {slide.multi ? (
            <MultiChoices
              key={JSON.stringify(mine ?? null)}
              slide={slide}
              max={slide.multi}
              initial={mine && 'choices' in mine ? mine.choices : []}
              disabled={!s.accepting || busy}
              onSend={(choices) => send({ choices })}
              sent={!!mine}
            />
          ) : (
            <Choices slide={slide} picked={mine && 'choice' in mine ? mine.choice : -1} disabled={!s.accepting || busy} onPick={(i) => send({ choice: i })} />
          )}
          {tail}
        </>
      )
    case 'quiz':
      return <Quiz s={s} slide={slide} pid={pid} offset={offset} mine={mine} busy={busy} send={send} errBox={errBox} />
    case 'scale': {
      const picked = mine && 'value' in mine ? mine.value : -1
      return (
        <>
          {head}
          {slide.mode === 'agree' ? (
            <div className="lv-choices" role="radiogroup" aria-label={slide.title}>
              {AGREE_LABELS.map((l, i) => (
                <button
                  key={l}
                  role="radio"
                  aria-checked={picked === i + 1}
                  className={`lv-choice is-agree${picked === i + 1 ? ' is-picked' : ''}`}
                  disabled={!s.accepting || busy}
                  onClick={() => send({ value: i + 1 })}
                >
                  <i className={`lv-key is-div-${i + 1}`} aria-hidden />
                  <span>{l}</span>
                  <span aria-hidden>{picked === i + 1 ? '✓' : ''}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="lv-scalepick" role="radiogroup" aria-label={slide.title}>
                {Array.from({ length: slide.max }, (_, i) => i + 1).map((v) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={picked === v}
                    className={picked === v ? 'is-picked' : ''}
                    disabled={!s.accepting || busy}
                    onClick={() => send({ value: v })}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="lv-row lv-mono lv-muted" style={{ justifyContent: 'space-between', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <span>{slide.minLabel}</span>
                <span>{slide.maxLabel}</span>
              </div>
            </>
          )}
          {tail}
        </>
      )
    }
    case 'rank':
      return (
        <>
          {head}
          <RankInput
            key={JSON.stringify(mine ?? null)}
            options={slide.options}
            initial={mine && 'order' in mine ? mine.order : null}
            disabled={!s.accepting || busy}
            onSend={(order) => send({ order })}
            sent={!!mine}
          />
          {tail}
        </>
      )
    case 'points':
      return (
        <>
          {head}
          <PointsInput
            key={JSON.stringify(mine ?? null)}
            options={slide.options}
            initial={mine && 'points' in mine ? mine.points : null}
            disabled={!s.accepting || busy}
            onSend={(points) => send({ points })}
            sent={!!mine}
          />
          {tail}
        </>
      )
    case 'number':
      return (
        <>
          {head}
          <NumberInput
            key={JSON.stringify(mine ?? null)}
            slide={slide}
            initial={mine && 'number' in mine ? mine.number : null}
            disabled={!s.accepting || busy}
            onSend={(n) => send({ number: n })}
            sent={!!mine}
          />
          {mine && 'number' in mine && !s.showResults && <div className="lv-status">Your guess: {formatNumber(mine.number, slide.unit)}. The truth comes at the reveal.</div>}
          {mine && 'number' in mine && s.showResults && slide.answer != null && (
            <div className="lv-status">
              You guessed {formatNumber(mine.number, slide.unit)}:{' '}
              {mine.number === slide.answer ? 'spot on.' : `off by ${formatNumber(Math.abs(mine.number - slide.answer), slide.unit)}.`}
            </div>
          )}
          {errBox}
          {s.accepting && mine && !s.showResults ? null : <Note s={s} answered={!!mine} />}
          {room}
        </>
      )
    case 'grid':
      return (
        <>
          {head}
          <GridInput
            key={JSON.stringify(mine ?? null)}
            slide={slide}
            initial={mine && 'x' in mine ? mine : null}
            disabled={!s.accepting || busy}
            onSend={(p) => send(p)}
            sent={!!mine}
          />
          {errBox}
          <Note s={s} answered={!!mine} />
          {mine && s.showResults && s.results?.kind === 'grid' && (
            <div className="lv-phone-results">
              <div className="lv-eyebrow is-plain">The room · you in gold</div>
              <GridChart slide={slide} points={s.results.points} mean={s.results.mean} mine={'x' in mine ? mine : null} />
            </div>
          )}
        </>
      )
    case 'wordcloud':
      return (
        <>
          {head}
          <Words
            key={JSON.stringify(mine ?? null)}
            entries={slide.entries}
            initial={mine && 'words' in mine ? mine.words : []}
            disabled={!s.accepting || busy}
            onSend={(words) => send({ words })}
            sent={!!mine}
          />
          {tail}
        </>
      )
    case 'open':
      return (
        <>
          {head}
          <OpenText
            key={JSON.stringify(mine ?? null)}
            initial={mine && 'text' in mine ? mine.text : ''}
            disabled={!s.accepting || busy}
            onSend={(text) => send({ text })}
            sent={!!mine}
          />
          {tail}
        </>
      )
    case 'qa':
      return (
        <>
          {head}
          <AskInline code={s.code} pid={pid} />
          <QaVotes s={s} pid={pid} />
        </>
      )
    case 'leaderboard':
      return <Leader s={s} pid={pid} />
  }
}

function Note({ s, answered }: { s: PublicState; answered: boolean }) {
  if (!s.accepting) return <div className="lv-status is-quiet">Voting is closed.</div>
  if (answered) return <div className="lv-status">Sent. You can change it until the host moves on.</div>
  return null
}

function Choices({
  slide,
  picked,
  disabled,
  onPick,
  quiz,
  correct = -1,
}: {
  slide: Slide & { options: string[] }
  picked: number
  disabled: boolean
  onPick: (i: number) => void
  quiz?: boolean
  correct?: number
}) {
  return (
    <div className={`lv-choices${quiz ? ' is-quiz' : ''}`} role="radiogroup" aria-label={slide.title}>
      {slide.options.map((o, i) => {
        const dim = (correct >= 0 && i !== correct) || (quiz && picked >= 0 && picked !== i && correct < 0)
        return (
          <button
            key={i}
            role="radio"
            aria-checked={picked === i}
            className={`lv-choice${picked === i || correct === i ? ' is-picked' : ''}${dim ? ' is-dim' : ''}`}
            disabled={disabled}
            onClick={() => onPick(i)}
          >
            <span className="lv-bar-mark" aria-hidden>
              {LETTERS[i]}
            </span>
            <span>{o}</span>
            {!quiz && <span aria-hidden>{picked === i ? '✓' : ''}</span>}
          </button>
        )
      })}
    </div>
  )
}

function Quiz({
  s,
  slide,
  pid,
  offset,
  mine,
  busy,
  send,
  errBox,
}: {
  s: PublicState
  slide: Extract<Slide, { kind: 'quiz' }>
  pid: string
  offset: number
  mine?: Answer
  busy: boolean
  send: (a: Answer) => void
  errBox: ReactNode
}) {
  const now = useNow(!s.showResults && s.timerAt != null) + offset
  const [me, setMe] = useState<MeState | null>(null)
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (!s.showResults) return
    let on = true
    live
      .me(s.code, pid)
      .then((m) => on && setMe(m))
      .catch(() => {})
    return () => {
      on = false
    }
  }, [s.showResults, s.code, pid])
  const picked = mine && 'choice' in mine ? mine.choice : -1
  const wrote = mine && 'text' in mine ? mine.text : null
  const answered = picked >= 0 || wrote != null
  const lead = s.timerAt != null && now < s.timerAt
  const left = s.timerAt != null ? Math.max(0, (s.timerAt + slide.seconds * 1000 - now) / 1000) : 0
  const open = s.accepting && !lead && left > 0 && !answered

  if (s.showResults) {
    const right = !!me?.last?.correct
    return (
      <>
        <div className="lv-eyebrow">{!answered ? 'No answer' : right ? 'Right' : 'Not this time'}</div>
        <div className="lv-big">{right && me?.last ? `+${me.last.points}` : !answered ? '—' : '0'}</div>
        {right && me && me.streak > 1 && <div className="lv-streak">{me.streak} in a row · streak bonus included</div>}
        <h1 className="lv-title" style={{ fontSize: 22 }}>
          {slide.title}
        </h1>
        {slide.typed ? (
          <div className="lv-status">
            The answer: <b>{slide.typed[0]}</b>
            {wrote != null && !right ? ` · you typed “${wrote}”` : ''}
          </div>
        ) : (
          <Choices slide={slide} picked={picked} correct={slide.correct} disabled onPick={() => {}} quiz />
        )}
        {me && me.rank != null && (
          <div className="lv-status">
            {me.score.toLocaleString('en')} points · #{me.rank} of {me.of}
          </div>
        )}
      </>
    )
  }
  return (
    <>
      <div className="lv-row" style={{ justifyContent: 'space-between' }}>
        <div className="lv-eyebrow">
          Quiz · {s.index + 1} / {s.count}
        </div>
        <div className={`lv-mono${!lead && left <= 5 ? ' lv-gold' : ''}`} style={{ fontSize: 22 }} aria-hidden>
          {lead ? Math.ceil((s.timerAt! - now) / 1000) : Math.ceil(left)}
        </div>
      </div>
      <h1 className="lv-title">{slide.title}</h1>
      {slide.image && <img className="lv-phone-img" src={slide.image} alt="" />}
      {lead ? (
        <div className="lv-status">Get ready…</div>
      ) : slide.typed ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (typed.trim()) send({ text: typed })
          }}
          style={{ display: 'grid', gap: 10 }}
        >
          <input
            className="lv-input is-number"
            style={{ fontSize: 24 }}
            value={wrote ?? typed}
            disabled={!open || busy}
            maxLength={LIMITS.option}
            placeholder="Type your answer"
            aria-label="Your answer"
            autoComplete="off"
            autoCorrect="off"
            onChange={(e) => setTyped(e.target.value)}
          />
          <button className="lv-btn is-primary is-block" disabled={!open || busy || !typed.trim()}>
            Lock it in
          </button>
        </form>
      ) : (
        <Choices slide={slide} picked={picked} disabled={!open || busy} onPick={(i) => send({ choice: i })} quiz />
      )}
      {errBox}
      {answered && <div className="lv-status">Locked in. Wait for the answer.</div>}
      {!answered && !lead && !open && <div className="lv-status is-quiet">Time’s up.</div>}
    </>
  )
}

function Words({ entries, initial, disabled, onSend, sent }: { entries: number; initial: string[]; disabled: boolean; onSend: (w: string[]) => void; sent: boolean }) {
  const [words, setWords] = useState<string[]>(() => Array.from({ length: entries }, (_, i) => initial[i] ?? ''))
  const ok = words.some((w) => w.trim())
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onSend(words.map((w) => w.trim()).filter(Boolean))
      }}
      style={{ display: 'grid', gap: 10 }}
    >
      {words.map((w, i) => (
        <input
          key={i}
          className="lv-input"
          value={w}
          maxLength={LIMITS.word}
          disabled={disabled}
          placeholder={i === 0 ? 'A word or two' : 'Another (optional)'}
          aria-label={`Word ${i + 1}`}
          onChange={(e) => setWords(words.map((x, j) => (j === i ? e.target.value : x)))}
        />
      ))}
      <button className="lv-btn is-primary is-block" disabled={disabled || !ok}>
        {sent ? 'Update' : 'Send'}
      </button>
    </form>
  )
}

function OpenText({ initial, disabled, onSend, sent }: { initial: string; disabled: boolean; onSend: (t: string) => void; sent: boolean }) {
  const [text, setText] = useState(initial)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) onSend(text)
      }}
      style={{ display: 'grid', gap: 10 }}
    >
      <textarea
        className="lv-input"
        value={text}
        maxLength={LIMITS.text}
        disabled={disabled}
        placeholder="One line is plenty"
        aria-label="Your answer"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="lv-row" style={{ justifyContent: 'space-between' }}>
        <span className="lv-mono lv-muted" style={{ fontSize: 12 }}>
          {text.length} / {LIMITS.text}
        </span>
      </div>
      <button className="lv-btn is-primary is-block" disabled={disabled || !text.trim()}>
        {sent ? 'Update' : 'Send'}
      </button>
    </form>
  )
}

function AskInline({ code, pid }: { code: string; pid: string }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!text.trim()) return
        try {
          const r = await live.ask(code, pid, text)
          setText('')
          setNote(r.held ? 'Sent to the host, who will have a look before it goes on screen.' : 'Asked. Vote for the ones you want answered too.')
        } catch (x) {
          setNote(message(x))
        }
      }}
      style={{ display: 'grid', gap: 10 }}
    >
      <textarea
        className="lv-input"
        style={{ minHeight: 72 }}
        value={text}
        maxLength={LIMITS.question}
        placeholder="Your question"
        aria-label="Your question"
        onChange={(e) => setText(e.target.value)}
      />
      <button className="lv-btn is-primary is-block" disabled={!text.trim()}>
        Ask
      </button>
      {note && <div className="lv-status">{note}</div>}
    </form>
  )
}

function QaVotes({ s, pid }: { s: PublicState; pid: string }) {
  const [votes, setVotes] = useState<Record<string, boolean>>(() => readJson(votesKey(s.code), {}))
  const questions = s.results?.kind === 'qa' ? s.results.questions : []
  const toggle = async (id: string) => {
    const on = !votes[id]
    const next = { ...votes, [id]: on }
    setVotes(next)
    writeJson(votesKey(s.code), next)
    try {
      await live.vote(s.code, pid, id, on)
    } catch {
      setVotes(votes)
    }
  }
  return (
    <div style={{ fontSize: 16 }}>
      <QaList
        questions={questions.map((q) => ({ ...q }))}
        actions={(q) =>
          q.answered ? (
            <span className="lv-mono lv-muted" style={{ fontSize: 11 }}>
              DONE
            </span>
          ) : (
            <button
              className={`lv-votebtn${votes[q.id] ? ' is-on' : ''}`}
              aria-pressed={!!votes[q.id]}
              aria-label={votes[q.id] ? 'Take back your vote' : 'Vote for this question'}
              onClick={() => toggle(q.id)}
            >
              ▲
            </button>
          )
        }
      />
    </div>
  )
}

function AskSheet({ code, pid, onClose }: { code: string; pid: string; onClose: () => void }) {
  return (
    <div className="lv-sheet" role="dialog" aria-label="Ask a question">
      <div className="lv-row" style={{ justifyContent: 'space-between' }}>
        <div className="lv-eyebrow">Ask a question</div>
        <button className="lv-btn is-quiet is-small" onClick={onClose}>
          Close
        </button>
      </div>
      <AskInline code={code} pid={pid} />
    </div>
  )
}

function Leader({ s, pid }: { s: PublicState; pid: string }) {
  const [me, setMe] = useState<MeState | null>(null)
  useEffect(() => {
    let on = true
    live
      .me(s.code, pid)
      .then((m) => on && setMe(m))
      .catch(() => {})
    return () => {
      on = false
    }
  }, [s.code, s.index, pid])
  const slide = s.slide
  return (
    <>
      <div className="lv-eyebrow">{slide.title}</div>
      {me && me.rank != null ? (
        <>
          <div className="lv-big">#{me.rank}</div>
          <div className="lv-status">
            {me.score.toLocaleString('en')} points · {me.of} playing
          </div>
        </>
      ) : (
        <div className="lv-status is-quiet">No quiz answers from you yet.</div>
      )}
      {s.results?.kind === 'board' && (
        <div style={{ fontSize: 16 }}>
          <Board board={s.results.board.slice(0, 5)} />
        </div>
      )}
    </>
  )
}

function Ended({ code, pid }: { code: string; pid: string }) {
  const [me, setMe] = useState<MeState | null>(null)
  useEffect(() => {
    live
      .me(code, pid)
      .then(setMe)
      .catch(() => {})
  }, [code, pid])
  return (
    <div className="lv-center">
      <div className="lv-eyebrow">That’s it</div>
      <h1 className="lv-title">Thank you for joining.</h1>
      {me?.rank != null && me.score > 0 && (
        <div className="lv-status">
          You finished #{me.rank} of {me.of} with {me.score.toLocaleString('en')} points.
        </div>
      )}
      {BRAND.url && (
        <a className="lv-btn" href={BRAND.url}>
          {BRAND.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      )}
    </div>
  )
}

/** A tap flies its emoji up the phone and says it went to the screen, so a reaction never seems to vanish. */
function Reactions({ code, pid }: { code: string; pid: string }) {
  const [flying, setFlying] = useState<{ id: number; emoji: string; x: number; y: number }[]>([])
  const [note, setNote] = useState<{ id: number; text: string } | null>(null)
  const next = useRef(0)
  useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => setNote(null), 1800)
    return () => window.clearTimeout(t)
  }, [note])
  const send = (emoji: string, button: HTMLButtonElement) => {
    const box = button.getBoundingClientRect()
    const id = ++next.current
    setFlying((f) => [...f.slice(-11), { id, emoji, x: box.left + box.width / 2, y: box.top }])
    window.setTimeout(() => setFlying((f) => f.filter((x) => x.id !== id)), 1600)
    try {
      navigator.vibrate?.(8)
    } catch {
      /* no vibration here */
    }
    live.react(code, pid, emoji).then(
      () => setNote({ id, text: 'Sent to the screen' }),
      (e: ApiError) => setNote({ id, text: e.status === 429 ? 'Easy, one moment' : 'Not sent. Try again.' }),
    )
  }
  return (
    <div className="lv-rxwrap">
      <div className="lv-rx" role="group" aria-label="Send a reaction to the screen">
        {REACTIONS.map((r) => (
          <button key={r} aria-label={`React ${r}`} onClick={(e) => send(r, e.currentTarget)}>
            {r}
          </button>
        ))}
      </div>
      <div className="lv-rx-note" role="status">
        {note && <span key={note.id}>{note.text}</span>}
      </div>
      {flying.map((f) => (
        <span key={f.id} className="lv-rx-fly" style={{ left: f.x, top: f.y }} aria-hidden>
          {f.emoji}
        </span>
      ))}
    </div>
  )
}

function MultiChoices({
  slide,
  max,
  initial,
  disabled,
  onSend,
  sent,
}: {
  slide: Slide & { options: string[] }
  max: number
  initial: number[]
  disabled: boolean
  onSend: (c: number[]) => void
  sent: boolean
}) {
  const [picked, setPicked] = useState<number[]>(initial)
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < max ? [...p, i] : p))
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="lv-mono lv-muted" style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Pick up to {max} · {picked.length} picked
      </div>
      <div className="lv-choices" role="group" aria-label={slide.title}>
        {slide.options.map((o, i) => {
          const on = picked.includes(i)
          return (
            <button
              key={i}
              role="checkbox"
              aria-checked={on}
              className={`lv-choice${on ? ' is-picked' : ''}`}
              disabled={disabled || (!on && picked.length >= max)}
              onClick={() => toggle(i)}
            >
              <span className="lv-bar-mark" aria-hidden>
                {LETTERS[i]}
              </span>
              <span>{o}</span>
              <span aria-hidden>{on ? '✓' : ''}</span>
            </button>
          )
        })}
      </div>
      <button className="lv-btn is-primary is-block" disabled={disabled || !picked.length} onClick={() => onSend(picked)}>
        {sent ? 'Update' : 'Send'}
      </button>
    </div>
  )
}

function RankInput({ options, initial, disabled, onSend, sent }: { options: string[]; initial: number[] | null; disabled: boolean; onSend: (o: number[]) => void; sent: boolean }) {
  const [order, setOrder] = useState<number[]>(() => initial ?? options.map((_, i) => i))
  const move = (k: number, d: -1 | 1) => {
    const j = k + d
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[k], next[j]] = [next[j], next[k]]
    setOrder(next)
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="lv-mono lv-muted" style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Top is first. Move with the arrows.
      </div>
      <ol className="lv-ranklist">
        {order.map((opt, k) => (
          <li key={opt}>
            <span className="lv-bar-mark">{k + 1}</span>
            <span>{options[opt]}</span>
            <span className="lv-rank-moves">
              <button className="lv-btn is-small" aria-label={`Move ${options[opt]} up`} disabled={disabled || k === 0} onClick={() => move(k, -1)}>
                ↑
              </button>
              <button className="lv-btn is-small" aria-label={`Move ${options[opt]} down`} disabled={disabled || k === order.length - 1} onClick={() => move(k, 1)}>
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      <button className="lv-btn is-primary is-block" disabled={disabled} onClick={() => onSend(order)}>
        {sent ? 'Update my order' : 'Send my order'}
      </button>
    </div>
  )
}

function PointsInput({
  options,
  initial,
  disabled,
  onSend,
  sent,
}: {
  options: string[]
  initial: number[] | null
  disabled: boolean
  onSend: (p: number[]) => void
  sent: boolean
}) {
  const [points, setPoints] = useState<number[]>(() => initial ?? options.map(() => 0))
  const used = points.reduce((a, b) => a + b, 0)
  const left = POINTS_BUDGET - used
  const set = (i: number, v: number) => setPoints(points.map((p, j) => (j === i ? Math.max(0, Math.min(p + left, Math.round(v))) : p)))
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="lv-points-left" aria-live="polite">
        <b>{left}</b> of {POINTS_BUDGET} points left
        <span className="lv-points-meter" aria-hidden>
          <span style={{ width: `${used}%` }} />
        </span>
      </div>
      {options.map((o, i) => (
        <div key={i} className="lv-pointrow">
          <span className="lv-pointrow-label">{o}</span>
          <button className="lv-btn is-small" aria-label={`10 fewer for ${o}`} disabled={disabled || points[i] === 0} onClick={() => set(i, points[i] - 10)}>
            −
          </button>
          <input
            className="lv-input lv-pointrow-n"
            inputMode="numeric"
            aria-label={`Points for ${o}`}
            value={points[i]}
            disabled={disabled}
            onChange={(e) => set(i, Number(e.target.value.replace(/\D/g, '')) || 0)}
          />
          <button className="lv-btn is-small" aria-label={`10 more for ${o}`} disabled={disabled || left === 0} onClick={() => set(i, points[i] + Math.min(10, left))}>
            +
          </button>
        </div>
      ))}
      <button className="lv-btn is-primary is-block" disabled={disabled || used === 0} onClick={() => onSend(points)}>
        {sent ? 'Update' : 'Send'}
      </button>
    </div>
  )
}

function NumberInput({ slide, initial, disabled, onSend, sent }: { slide: NumberSlide; initial: number | null; disabled: boolean; onSend: (n: number) => void; sent: boolean }) {
  const [v, setV] = useState(initial == null ? '' : String(initial))
  const n = Number(v.replace(',', '.'))
  const ok = v.trim() !== '' && Number.isFinite(n) && n >= slide.min && n <= slide.max
  const span = slide.max - slide.min
  const step = span <= 20 ? 0.5 : span <= 200 ? 1 : 10 ** Math.floor(Math.log10(span / 100))
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onSend(n)
      }}
      style={{ display: 'grid', gap: 10 }}
    >
      <div className="lv-numberfield">
        <input
          className="lv-input is-number"
          inputMode="decimal"
          value={v}
          disabled={disabled}
          placeholder="Your guess"
          aria-label="Your guess"
          onChange={(e) => setV(e.target.value)}
        />
        {slide.unit && <span className="lv-mono">{slide.unit}</span>}
      </div>
      <input
        type="range"
        className="lv-range"
        min={slide.min}
        max={slide.max}
        step={step}
        value={ok ? n : (slide.min + slide.max) / 2}
        disabled={disabled}
        aria-label="Your guess, as a slider"
        onChange={(e) => setV(e.target.value)}
      />
      <div className="lv-row lv-mono lv-muted" style={{ justifyContent: 'space-between', fontSize: 12 }}>
        <span>{formatNumber(slide.min, slide.unit)}</span>
        <span>{formatNumber(slide.max, slide.unit)}</span>
      </div>
      <button className="lv-btn is-primary is-block" disabled={disabled || !ok}>
        {sent ? 'Update my guess' : 'Lock in my guess'}
      </button>
    </form>
  )
}

function GridInput({
  slide,
  initial,
  disabled,
  onSend,
  sent,
}: {
  slide: GridSlide
  initial: { x: number; y: number } | null
  disabled: boolean
  onSend: (p: { x: number; y: number }) => void
  sent: boolean
}) {
  const [p, setP] = useState(initial ?? { x: 50, y: 50 })
  const [touched, setTouched] = useState(!!initial)
  const pick = (q: { x: number; y: number }) => {
    if (disabled) return
    setP(q)
    setTouched(true)
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="lv-mono lv-muted" style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Tap the square, or use the sliders
      </div>
      <GridChart slide={slide} points={[]} mean={null} onPick={pick} mine={touched ? p : null} />
      <label className="lv-field">
        <span>
          {slide.xLow} → {slide.xHigh}
        </span>
        <input type="range" className="lv-range" min={0} max={100} value={p.x} disabled={disabled} onChange={(e) => pick({ ...p, x: Number(e.target.value) })} />
      </label>
      <label className="lv-field">
        <span>
          {slide.yLow} → {slide.yHigh}
        </span>
        <input type="range" className="lv-range" min={0} max={100} value={p.y} disabled={disabled} onChange={(e) => pick({ ...p, y: Number(e.target.value) })} />
      </label>
      <button className="lv-btn is-primary is-block" disabled={disabled || !touched} onClick={() => onSend(p)}>
        {sent ? 'Move my dot' : 'Place my dot'}
      </button>
    </div>
  )
}

/** A slide's own clock on the phone: seconds left, then "Time's up". */
function Clock({ at, seconds, offset }: { at: number; seconds: number; offset: number }) {
  const now = useNow(true, 250) + offset
  const left = Math.ceil((at + seconds * 1000 - now) / 1000)
  return (
    <span className={`lv-mono${left <= 5 ? ' lv-gold' : ''}`} style={{ fontSize: 15 }} aria-label={left > 0 ? `${left} seconds left` : 'Time is up'}>
      {left > 0 ? `${left}s` : 'Time’s up'}
    </span>
  )
}

const pacedKey = (code: string) => `live_kit_paced_${code}`

/**
 * Self-paced: the phone holds its own place in the deck. Results for a slide come after answering it, when the host
 * has results on. Content slides are pages to read; the last "Next" finishes.
 */
function Paced({ s, pid, answers, remember }: { s: PublicState; pid: string; answers: Record<string, Answer>; remember: (slide: string, a: Answer) => void }) {
  const slides = s.slides ?? []
  const [i, setI] = useState(() => Math.min(readJson<number>(pacedKey(s.code), 0), slides.length))
  const [results, setResults] = useState<Results | null>(null)
  const go = (n: number) => {
    setI(n)
    setResults(null)
    writeJson(pacedKey(s.code), n)
    scrollTo(0, 0)
  }
  const slide = slides[i]
  const mine = slide ? answers[slide.id] : undefined
  const wantResults = !!slide && (slide.kind === 'qa' || (!!mine && s.showResults))
  useEffect(() => {
    if (!wantResults || !slide) return
    let on = true
    const load = () =>
      live.slideResults(s.code, slide.id).then(
        (r) => on && setResults(r.results),
        () => {},
      )
    load()
    const t = window.setInterval(load, 4000)
    return () => {
      on = false
      window.clearInterval(t)
    }
  }, [wantResults, slide, s.code, mine])
  if (!slide)
    return (
      <div className="lv-center">
        <div className="lv-eyebrow">All done</div>
        <h1 className="lv-title">Thank you. That’s every question.</h1>
        <button className="lv-btn" onClick={() => go(0)}>
          Look back through it
        </button>
      </div>
    )
  const view: PublicState = { ...s, slide, index: i, results: results ?? undefined, showResults: !!results, timerAt: null, timerSeconds: null }
  return (
    <>
      <div className="lv-paced-progress" aria-label={`Question ${i + 1} of ${slides.length}`}>
        <i style={{ width: `${((i + 1) / slides.length) * 100}%` }} />
      </div>
      <SlideView key={slide.id} s={view} pid={pid} offset={0} mine={mine} onAnswered={(a) => remember(slide.id, a)} />
      <nav className="lv-paced-nav">
        <button className="lv-btn" onClick={() => go(i - 1)} disabled={i === 0}>
          ← Back
        </button>
        <span className="lv-mono lv-muted" style={{ fontSize: 12 }}>
          {i + 1} / {slides.length}
        </span>
        <button className="lv-btn is-ink" onClick={() => go(i + 1)}>
          {i === slides.length - 1 ? 'Finish' : ANSWERABLE.has(slide.kind) && !mine ? 'Skip' : 'Next →'}
        </button>
      </nav>
    </>
  )
}
