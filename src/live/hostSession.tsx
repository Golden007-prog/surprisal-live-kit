/** One live session as the host sees it: the polled host state, the controls, the clock, and the moderation actions.
 * The presenter and the console both use it, so a second window or a phone drives the same session. */
import { useCallback, useMemo } from 'react'
import { type HostState, type QuestionRow, type Slide } from '../lib/live'
import { live, useNow, usePoll } from './api'
import { type Hosting } from './hostStore'
import { type HostActions } from './Results'

export function clockSeconds(slide: Slide): number | null {
  if (slide.kind === 'quiz') return slide.seconds
  return slide.timer ?? null
}

export function useHostSession(hosting: Hosting, opts: { onSpotlight?: (text: string) => void } = {}) {
  const { code, token } = hosting
  const load = useCallback(() => live.hostState(code, token), [code, token])
  const poll = usePoll<HostState>(load, 900)
  const { data: s, refresh, patch, hold } = poll

  // Clicks change the screen at once; the server's answer replaces the guess when it lands (polls in between are dropped).
  const control = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      if (action === 'results') patch((d) => ({ ...d, showResults: extra.on === true, ...(extra.on === true && d.slide.kind === 'quiz' ? { accepting: false } : {}) }))
      else if (action === 'accepting') patch((d) => ({ ...d, accepting: extra.on === true }))
      const release = hold()
      try {
        await live.control(code, token, action, extra)
      } finally {
        release()
      }
    },
    [code, token, patch, hold],
  )
  const goto = useCallback(
    (i: number) => {
      if (!s || i < 0 || i >= s.count) return undefined
      const slide = s.deck.slides[i]
      // Results, clocks and counts for the new slide arrive with the server's answer, a moment later.
      if (slide) patch((d) => ({ ...d, index: i, slide, showResults: false, accepting: false, timerAt: null, timerSeconds: null, answered: 0, results: { kind: 'none', total: 0 } }))
      return control('goto', { index: i })
    },
    [s, control, patch],
  )

  // The slide's clock: seconds left (negative after the buzzer), and the share left for the progress line.
  const seconds = s ? clockSeconds(s.slide) : null
  const running = !!s && seconds != null && s.timerAt != null && !(s.slide.kind === 'quiz' && s.showResults)
  const now = useNow(running) + poll.offset
  const remaining = running && s?.timerAt != null ? (s.timerAt + seconds! * 1000 - now) / 1000 : null
  const fraction = remaining != null && seconds ? Math.min(1, Math.max(0, remaining / seconds)) : null

  const { onSpotlight } = opts
  const actions = useMemo<HostActions>(
    () => ({
      qa: (q: QuestionRow) => (
        <>
          <button className="lv-btn is-small" onClick={() => live.moderate(code, token, q.id, { answered: !q.answered }).then(refresh)}>
            {q.answered ? 'Reopen' : 'Answered'}
          </button>
          <button className="lv-btn is-small is-quiet" aria-label="Hide this question" onClick={() => live.moderate(code, token, q.id, { hidden: true }).then(refresh)}>
            Hide
          </button>
        </>
      ),
      // Reading answers aloud: Spotlight puts one answer full screen.
      note: (e: { id: string; text: string }) => (
        <>
          {onSpotlight && (
            <button className="lv-btn is-small" onClick={() => onSpotlight(e.text)}>
              Spotlight
            </button>
          )}
          <button className="lv-btn is-small" aria-label="Hide this answer from the screen" onClick={() => live.hideEntry(code, token, e.id).then(refresh)}>
            Hide
          </button>
        </>
      ),
    }),
    [code, token, onSpotlight], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return {
    ...poll,
    s,
    control,
    goto,
    remaining,
    fraction,
    actions,
    approve: (id: string) => live.approve(code, token, id).then(refresh),
    reject: (id: string) => live.reject(code, token, id).then(refresh),
  }
}
