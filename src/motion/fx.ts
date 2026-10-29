/**
 * Impact effects for the presenter (round 2, 24 Oct): sparks off a bar's end, a flash on a landing cap, a hop, and the
 * final podium's confetti. All imperative: particles are made, animated with the Web Animations API on sampled
 * parabolas (linear x, gravity y: one motion value per particle, no stitched easings, MOTION.md §5) and removed, so
 * React never re-renders per frame. Reduced motion drops every one of them; the outcome they decorate still shows.
 */
import { useLayoutEffect, useRef } from 'react'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

type Point = { x: number; y: number }
type Edge = 'right' | 'top' | 'centre'

function pointOf(target: Element | Point, edge: Edge): Point {
  if (!(target instanceof Element)) return target
  const r = target.getBoundingClientRect()
  if (edge === 'right') return { x: r.right, y: r.top + r.height / 2 }
  if (edge === 'top') return { x: r.left + r.width / 2, y: r.top }
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

export type SparkOpts = {
  /** Where on the element the sparks start. */
  edge?: Edge
  /** The direction they are thrown, in radians: 0 is right, -π/2 is up. */
  dir?: number
  /** How wide the fan is, in radians. */
  spread?: number
  count?: number
  /** Launch speed in px/s (each spark gets 60–100% of it). */
  speed?: number
  ms?: number
  color?: string
}

/**
 * A small burst of gold sparks: tiny squares (zero radius) thrown outward from a point on parabolic paths, fading as
 * they fall. Returns the number spawned (0 under reduced motion).
 */
export function sparkAt(target: Element | Point, opts: SparkOpts = {}): number {
  if (reduced() || typeof document === 'undefined') return 0
  const { edge = 'right', dir = -Math.PI / 4, spread = Math.PI * 0.9, count = 10, speed = 340, ms = 700, color = 'var(--sds-gold)' } = opts
  const o = pointOf(target, edge)
  const g = 1100 // px/s², gravity
  const steps = 14
  for (let k = 0; k < count; k++) {
    const el = document.createElement('i')
    el.className = 'lv-spark'
    const size = 3 + Math.round(Math.random() * 3)
    el.style.cssText = `left:${o.x - size / 2}px;top:${o.y - size / 2}px;width:${size}px;height:${size}px;background:${color}`
    document.body.appendChild(el)
    const a = dir + (k / Math.max(1, count - 1) - 0.5) * spread + (Math.random() - 0.5) * 0.25
    const v = speed * (0.6 + Math.random() * 0.4)
    const vx = v * Math.cos(a)
    const vy = v * Math.sin(a)
    const spin = (Math.random() - 0.5) * 540
    const frames: Keyframe[] = []
    for (let s = 0; s <= steps; s++) {
      const u = s / steps
      const t = (u * ms) / 1000
      const x = vx * t
      const y = vy * t + 0.5 * g * t * t
      frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(spin * u).toFixed(0)}deg)`, opacity: u < 0.45 ? 1 : 1 - (u - 0.45) / 0.55 })
    }
    const anim = el.animate(frames, { duration: ms, easing: 'linear', fill: 'forwards' })
    anim.onfinish = () => el.remove()
    anim.oncancel = () => el.remove()
  }
  return count
}

/** A brief bright flash on the end cap of a bar that has just landed (non-leaders: no sparks). */
export function flashEnd(fill: Element | null, side: 'right' | 'top' = 'right', ms = 150) {
  if (!fill || reduced()) return
  const cap = document.createElement('i')
  cap.className = `lv-cap-flash is-${side}`
  fill.appendChild(cap)
  const anim = cap.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' })
  anim.onfinish = () => cap.remove()
  anim.oncancel = () => cap.remove()
}

/** Two parabolic hops upward from rest (the second a quarter of the height and half the time). */
export function hop(el: Element | null, px = 10, ms = 260) {
  if (!el || reduced()) return
  const frames: Keyframe[] = []
  const total = ms * 1.5
  const steps = 18
  for (let s = 0; s <= steps; s++) {
    const t = (s / steps) * total
    let y: number
    if (t < ms) y = -px * 4 * (t / ms) * (1 - t / ms)
    else {
      const u = (t - ms) / (ms / 2)
      y = -(px / 4) * 4 * u * (1 - u)
    }
    frames.push({ transform: `translateY(${y.toFixed(2)}px)` })
  }
  el.animate(frames, { duration: total, easing: 'linear' })
}

/**
 * Fire `onLand(i, lead)` once on the frame each bar lands during a race (never for the gentle eases after it, and
 * never under reduced motion, where every bar is landed from the first frame). Runs in a layout effect, so the effect
 * starts on the same frame the bar reaches its value.
 */
export function useLandings(landed: boolean[], lead: boolean[], done: boolean, onLand: (i: number, lead: boolean) => void) {
  const prev = useRef<boolean[]>([])
  // Whether the race had already finished on the frame before: the last bar lands on the frame `done` turns true.
  const wasDone = useRef(true)
  const fn = useRef(onLand)
  useLayoutEffect(() => {
    fn.current = onLand
  })
  const key = landed.map((l) => (l ? 1 : 0)).join('')
  useLayoutEffect(() => {
    const was = prev.current
    if (landed.every((l) => !l)) {
      prev.current = landed.slice()
      wasDone.current = false
      return
    }
    // The first frame we see already landed (reduced motion, or a later mount): remember it, do not fire.
    if (was.length === landed.length && !wasDone.current) landed.forEach((l, i) => l && !was[i] && fn.current(i, !!lead[i]))
    prev.current = landed.slice()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (landed.some(Boolean)) wasDone.current = done
  }, [done, key]) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * The final podium's confetti: a canvas over the stage (under the text), gold squares with ink and paper-coloured
 * ones, thrown up from the winner's block and falling under gravity with drag and flutter, about 2.5 s.
 */
export function confetti(host: HTMLElement | null, from: Point, ms = 2500, count = 150, floorY?: number): number {
  if (!host || reduced()) return 0
  const box = host.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cv = document.createElement('canvas')
  cv.className = 'lv-confetti'
  cv.width = Math.round(box.width * dpr)
  cv.height = Math.round(box.height * dpr)
  host.prepend(cv)
  const g = cv.getContext('2d')
  if (!g) {
    cv.remove()
    return 0
  }
  const css = getComputedStyle(host)
  const tone = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  const gold = tone('--sds-gold', '#e3b31a')
  const ink = tone('--sds-ink', '#111111')
  const paper = tone('--sds-paper', '#f4f0e8')
  const ox = from.x - box.left
  const oy = from.y - box.top
  // A floor (page y): pieces fall behind it, so nothing draws below its top edge.
  const clipH = floorY != null ? Math.max(0, floorY - box.top) : box.height
  const bits = Array.from({ length: count }, (_, k) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95
    const v = 700 + Math.random() * 900
    const pick = k % 10
    return {
      x: ox + (Math.random() - 0.5) * 60,
      y: oy,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      s: 6 + Math.random() * 7,
      phi: Math.random() * Math.PI * 2,
      w: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8),
      wob: Math.random() * Math.PI * 2,
      fill: pick < 6 ? gold : pick < 8 ? ink : paper,
      edge: pick >= 8,
    }
  })
  const t0 = performance.now()
  let last = t0
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const el = now - t0
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, box.width, box.height)
    g.save()
    g.beginPath()
    g.rect(0, 0, box.width, clipH)
    g.clip()
    g.globalAlpha = el > ms - 600 ? Math.max(0, (ms - el) / 600) : 1
    for (const b of bits) {
      b.vy += 1500 * dt
      const drag = Math.exp(-2.2 * dt)
      b.vx *= drag
      b.vy *= drag
      b.phi += b.w * dt
      b.x += (b.vx + Math.sin(b.phi * 0.7 + b.wob) * 40) * dt
      b.y += b.vy * dt
      const h = b.s * Math.abs(Math.cos(b.phi))
      g.save()
      g.translate(b.x, b.y)
      g.rotate(b.phi * 0.5)
      g.fillStyle = b.fill
      g.fillRect(-b.s / 2, -h / 2, b.s, h)
      if (b.edge) {
        g.strokeStyle = ink
        g.lineWidth = 1
        g.strokeRect(-b.s / 2, -h / 2, b.s, h)
      }
      g.restore()
    }
    g.restore()
    if (el < ms) requestAnimationFrame(frame)
    else cv.remove()
  }
  requestAnimationFrame(frame)
  return count
}

/**
 * A tile shatters (round 3, the quiz's wrong answers): small zero-radius squares spawned across the element's box and
 * thrown outward from its centre on parabolas, falling and fading. Returns the number spawned (0 under reduced motion).
 */
export function shatter(target: Element | null, opts: { count?: number; ms?: number; colors?: string[] } = {}): number {
  if (!target || reduced() || typeof document === 'undefined') return 0
  const { count = 30, ms = 820, colors = ['var(--sds-ink-3)', 'var(--sds-ink)', 'var(--sds-line-strong)'] } = opts
  const r = target.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const g = 1400
  const steps = 14
  for (let k = 0; k < count; k++) {
    const el = document.createElement('i')
    el.className = 'lv-spark lv-shard'
    const size = 4 + Math.round(Math.random() * 6)
    const x0 = r.left + Math.random() * r.width
    const y0 = r.top + Math.random() * r.height
    el.style.cssText = `left:${x0 - size / 2}px;top:${y0 - size / 2}px;width:${size}px;height:${size}px;background:${colors[k % colors.length]}`
    document.body.appendChild(el)
    const a = Math.atan2(y0 - cy, x0 - cx)
    const v = 220 + Math.random() * 320
    const vx = v * Math.cos(a) * 1.2
    const vy = v * Math.sin(a) - 260 * Math.random()
    const spin = (Math.random() - 0.5) * 720
    const frames: Keyframe[] = []
    for (let s = 0; s <= steps; s++) {
      const u = s / steps
      const t = (u * ms) / 1000
      frames.push({ transform: `translate(${(vx * t).toFixed(1)}px, ${(vy * t + 0.5 * g * t * t).toFixed(1)}px) rotate(${(spin * u).toFixed(0)}deg)`, opacity: u < 0.35 ? 1 : 1 - (u - 0.35) / 0.65 })
    }
    const anim = el.animate(frames, { duration: ms * (0.8 + Math.random() * 0.2), easing: 'linear', fill: 'forwards' })
    anim.onfinish = () => el.remove()
    anim.oncancel = () => el.remove()
  }
  return count
}
