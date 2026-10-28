/**
 * The bar race: when results land, every bar rises at one shared pace that gathers speed, as if
 * falling. Each bar stops at its value with a small thud; the leader lands last, turns gold on impact and bounces off
 * its end. After that, new answers ease the bars to their new lengths without racing again.
 *
 * One motion value drives everything (MOTION.md §5: no stitched keyframes). Lengths are fractions of the chart's full
 * scale, 0 to 1.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export const RACE_MS = 1800
const EASE_MS = 600
const HOP_MS = 280
const THUD_HOP = 0.012
/**
 * The leader's landing (the line grows slightly, bounces and sparkles): its end runs on
 * past the value, springs back and settles. A damped sine from the impact, one motion value: the first peak is
 * OVERSHOOT past the value at SPRING_PEAK_MS, then a shallow dip and rest. Its starting speed (about 0.001 of the
 * scale per ms) matches the race's speed at impact, so the turn has no seam.
 */
const OVERSHOOT = 0.025
const SPRING_PEAK_MS = 90
const SPRING_DECAY_MS = 110
const SPRING_MS = 620
const springW = Math.PI / 2 / SPRING_PEAK_MS
const springA = OVERSHOOT / Math.exp(-SPRING_PEAK_MS / SPRING_DECAY_MS)
const runOn = (dt: number, scale: number) => (dt >= SPRING_MS ? 0 : scale * springA * Math.exp(-dt / SPRING_DECAY_MS) * Math.sin(dt * springW))

/** The shared level at progress p: moving at once, then a constant acceleration, so the end comes with weight. */
export const raceLevel = (p: number) => 0.3 * p + 0.7 * p * p
const raceSpeed = (p: number) => 0.3 + 1.4 * p
/** The progress p at which the level reaches v (the inverse of raceLevel). */
const raceAt = (v: number) => (-0.3 + Math.sqrt(0.09 + 2.8 * Math.min(1, Math.max(0, v)))) / 1.4

/**
 * How far a bar's end has bounced back from its wall, `dt` ms after impact. Parabolic hops (gravity), each a quarter
 * of the height and half the time of the one before, three in all.
 */
function hopBack(dt: number, height: number, ms: number): number {
  let t = dt
  let h = height
  let d = ms
  for (let k = 0; k < 3; k++) {
    if (t < d) {
      const u = t / d
      return h * 4 * u * (1 - u)
    }
    t -= d
    h *= 0.25
    d *= 0.5
  }
  return 0
}
const settleMs = (ms: number) => ms * (1 + 0.5 + 0.25)

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const easeOut = (k: number) => 1 - (1 - k) ** 3

export type Race = {
  /** Each bar's length now, 0 to 1. */
  len: number[]
  /** True once a bar has reached its value. Gold and final figures wait for this. */
  landed: boolean[]
  /** How far the bar has travelled to its value, 0 to 1 (figures count with it). */
  shown: number[]
  /** The shared level, 0 to 1: other parts of a chart (a marker, a hero figure) can ride it. */
  level: number
  /** True when every bar has landed and stopped bouncing. */
  done: boolean
}

export type RaceOpts = {
  /** Per-bar start delays in ms: each bar rises at the shared pace from its own start (the podium's stagger). */
  delays?: number[]
  /** The race's length in ms when the full scale is reached (default RACE_MS). The leaderboard runs longer. */
  ms?: number
  /** false: bars stop dead at their value, with no thud and no run-on (nothing may move back down). */
  bounce?: boolean
}

/**
 * Drive a set of bars. `lead` marks the bars that land last and run on past their end (the leader, or the right
 * answer). All zeros means nothing to show: the bars wait at zero, and the next non-zero set races.
 */
export function useRace(targets: number[], lead: boolean[], opts: RaceOpts = {}): Race {
  const n = targets.length
  const key = targets.map((t) => t.toFixed(4)).join(',')
  const live = useRef({ targets, lead, opts })
  const empty = targets.every((t) => t <= 0)

  const zero = (): Race => ({ len: targets.map(() => 0), landed: targets.map(() => false), shown: targets.map(() => 0), level: 0, done: false })
  const [frame, setFrame] = useState<Race>(zero)
  const now = useRef(frame)
  // The animation loops read the latest answers and the bars' current lengths through these.
  useLayoutEffect(() => {
    live.current = { targets, lead, opts }
    now.current = frame
  })
  const still = reduced()
  // idle: waiting at zero · racing: the first rise, which takes new answers in flight · settled: later changes ease.
  const phase = useRef<'idle' | 'racing' | 'settled'>('idle')

  // Start the race when results arrive; fall back to zero when they go (hidden, or a new slide's empty state).
  useEffect(() => {
    if (still) {
      phase.current = empty ? 'idle' : 'settled'
      return
    }
    let raf = 0
    const start = performance.now()
    if (empty) {
      phase.current = 'idle'
      const from = now.current.len.slice()
      if (from.every((x) => x <= 0)) return
      const fall = (t: number) => {
        const k = Math.min(1, Math.max(0, t - start) / 300)
        setFrame({ len: from.map((a) => a * (1 - easeOut(k))), landed: from.map(() => false), shown: from.map(() => 0), level: 0, done: false })
        if (k < 1) raf = requestAnimationFrame(fall)
      }
      raf = requestAnimationFrame(fall)
      return () => cancelAnimationFrame(raf)
    }
    if (phase.current !== 'idle') return
    phase.current = 'racing'
    const step = (t: number) => {
      const { targets: tg, lead: l, opts: o } = live.current
      const D = o.ms ?? RACE_MS
      const delay = (i: number) => o.delays?.[i] ?? 0
      const bounce = o.bounce !== false
      // A frame can be stamped a little before the effect began: never run time backwards.
      const el = Math.max(0, t - start)
      const level = raceLevel(Math.min(1, el / D))
      let settled = tg.every((v, i) => el >= delay(i) + raceAt(v) * D)
      const len = tg.map((v, i) => {
        if (v <= 0) return 0
        const own = Math.max(0, el - delay(i))
        const hitAt = raceAt(v) * D
        if (own < hitAt) return raceLevel(own / D)
        if (!bounce) return v
        const impact = raceSpeed(hitAt / D) / raceSpeed(1)
        const since = own - hitAt
        if (l[i]) {
          if (since < SPRING_MS) settled = false
          return v + runOn(since, impact)
        }
        const ms = HOP_MS * 0.6
        if (since < settleMs(ms)) settled = false
        return Math.max(0, v - hopBack(since, THUD_HOP * impact * impact, ms))
      })
      const landed = tg.map((v, i) => v > 0 && el >= delay(i) + raceAt(v) * D)
      const shown = tg.map((v, i) => (v <= 0 || landed[i] ? 1 : Math.min(1, len[i] / v)))
      setFrame({ len, landed, shown, level: settled ? 1 : level, done: settled })
      if (settled) phase.current = 'settled'
      else raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      // Cut short (unmount, or React's development double run): the next run starts the race again.
      if (phase.current === 'racing') phase.current = 'idle'
    }
  }, [empty, n, still])

  // After the race, new answers ease the bars to their new lengths.
  useEffect(() => {
    if (phase.current !== 'settled' || empty || still) return
    const from = now.current.len.slice()
    const start = performance.now()
    let raf = 0
    const ease = (t: number) => {
      const k = Math.min(1, Math.max(0, t - start) / EASE_MS)
      const tg = live.current.targets
      setFrame({ len: tg.map((v, i) => (from[i] ?? 0) + (v - (from[i] ?? 0)) * easeOut(k)), landed: tg.map((v) => v > 0), shown: tg.map(() => 1), level: 1, done: k >= 1 })
      if (k < 1) raf = requestAnimationFrame(ease)
    }
    raf = requestAnimationFrame(ease)
    return () => cancelAnimationFrame(raf)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reduced motion: the outcome without the travel (MOTION.md: degrade, not disappear).
  if (still) return { len: targets, landed: targets.map((v) => v > 0), shown: targets.map(() => 1), level: empty ? 0 : 1, done: !empty }
  return frame
}

/**
 * A marker that drops onto its place once `active` turns true: it falls `from` px under gravity, lands, and hops twice.
 * Returns the offset in px (0 at rest; negative is above).
 */
export function useDrop(active: boolean, from = 48, ms = 520): number {
  const [y, setY] = useState(-from)
  const still = reduced()
  useEffect(() => {
    if (!active || still) return
    const start = performance.now()
    let raf = 0
    const step = (t: number) => {
      const el = Math.max(0, t - start)
      if (el < ms) {
        const u = el / ms
        setY(-from * (1 - u * u))
      } else {
        const back = hopBack(el - ms, from * 0.14, ms * 0.42)
        setY(-back)
        if (el - ms >= settleMs(ms * 0.42)) {
          setY(0)
          return
        }
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [active, from, ms, still])
  if (!active) return -from
  return still ? 0 : y
}

/**
 * A held breath before a reveal (the quiz's "And the answer is…"): true for `ms` from the moment `on` turns true,
 * starting on that very render, so a chart can hold its bars at zero through the beat. Reduced motion skips it.
 */
export function useBeat(on: boolean, ms = 600): boolean {
  const still = reduced()
  const [was, setWas] = useState(false)
  const [beat, setBeat] = useState(false)
  if (on !== was) {
    setWas(on)
    setBeat(on && !still)
  }
  useEffect(() => {
    if (!beat) return
    const t = setTimeout(() => setBeat(false), ms)
    return () => clearTimeout(t)
  }, [beat, ms])
  return beat && on
}
