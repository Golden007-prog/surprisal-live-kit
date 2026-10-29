/**
 * The word cloud's physics (round 3, 24 Oct). At rest every word floats a few pixels round its home. The presenter's
 * mouse pushes words within PUSH_R of it away, and they spring back home with damping when it moves off. Touch
 * pointers do nothing (no hover), so phones and touch screens keep only the float. Reduced motion: nothing runs.
 *
 * Imperative: one requestAnimationFrame loop reads the pointer, steps every word's spring and writes a transform on
 * each word's inner span. React never re-renders per frame. `step` is pure, so it can be tested without a browser.
 */

export type Body = {
  text: string
  /** Home box in the cloud's own pixels. */
  x: number
  y: number
  w: number
  h: number
  /** 0 to 1: the word's size against the biggest; bigger words are pushed less. */
  mass: number
  /** Offset from home now, and its velocity. */
  px: number
  py: number
  vx: number
  vy: number
  /** The idle float's offset this frame (the spring's rest point without a pointer). */
  ix: number
  iy: number
  phase: [number, number]
  period: [number, number]
}

export const IDLE_PX = 3
export const PUSH_R = 120
export const PUSH_PX = 64
const STIFF = 120 // 1/s²
const DAMP = 2 * 0.72 * Math.sqrt(STIFF) // a little under critical damping

export type Point = { x: number; y: number }

export function makeBody(p: { text: string; x: number; y: number; w: number; h: number; size: number }, maxSize: number, seed: number): Body {
  // A cheap deterministic hash, so a word floats the same way every time the cloud is drawn.
  const r = (k: number) => {
    const s = Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453
    return s - Math.floor(s)
  }
  return {
    text: p.text,
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    mass: maxSize ? Math.min(1, p.size / maxSize) : 1,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    ix: 0,
    iy: 0,
    phase: [r(1) * Math.PI * 2, r(2) * Math.PI * 2],
    period: [3.6 + r(3) * 2.4, 4.2 + r(4) * 2.6],
  }
}

/** Where the pointer pushes a word to: away from the pointer, more the nearer it is (0 beyond PUSH_R). */
export function pushOf(b: Body, at: Point | null): Point {
  if (!at) return { x: 0, y: 0 }
  // Distance from the pointer to the word's home box (0 when the pointer is on the word).
  const dx = Math.max(b.x - at.x, 0, at.x - (b.x + b.w))
  const dy = Math.max(b.y - at.y, 0, at.y - (b.y + b.h))
  const d = Math.hypot(dx, dy)
  if (d >= PUSH_R) return { x: 0, y: 0 }
  let ux = b.x + b.w / 2 - at.x
  let uy = b.y + b.h / 2 - at.y
  const n = Math.hypot(ux, uy)
  if (n < 1) {
    ux = 0
    uy = -1
  } else {
    ux /= n
    uy /= n
  }
  const k = PUSH_PX * (1 - d / PUSH_R) * (1.25 - 0.5 * b.mass)
  return { x: ux * k, y: uy * k }
}

/** One step of every spring, then a pass that pushes overlapping words apart. `t` and `dt` in seconds. */
export function step(bodies: Body[], at: Point | null, t: number, dt: number, bounds: { w: number; h: number }) {
  const h = Math.min(dt, 1 / 30)
  for (const b of bodies) {
    b.ix = IDLE_PX * Math.sin((t * Math.PI * 2) / b.period[0] + b.phase[0])
    b.iy = IDLE_PX * Math.sin((t * Math.PI * 2) / b.period[1] + b.phase[1])
    const push = pushOf(b, at)
    const tx = b.ix + push.x
    const ty = b.iy + push.y
    b.vx += (STIFF * (tx - b.px) - DAMP * b.vx) * h
    b.vy += (STIFF * (ty - b.py) - DAMP * b.vy) * h
    b.px += b.vx * h
    b.py += b.vy * h
    // Stay inside the cloud's box.
    b.px = Math.min(bounds.w - b.x - b.w, Math.max(-b.x, b.px))
    b.py = Math.min(bounds.h - b.y - b.h, Math.max(-b.y, b.py))
  }
  // Displaced words must not pile onto their neighbours: separate any pair that overlaps, along its shallower axis,
  // the lighter word giving more. Words at home never overlap (the layout pads them), so this only acts on a push.
  if (!at) return
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]
      const c = bodies[j]
      const ox = Math.min(a.x + a.px + a.w, c.x + c.px + c.w) - Math.max(a.x + a.px, c.x + c.px)
      const oy = Math.min(a.y + a.py + a.h, c.y + c.py + c.h) - Math.max(a.y + a.py, c.y + c.py)
      if (ox <= 0 || oy <= 0) continue
      const share = c.mass / (a.mass + c.mass || 1)
      if (ox < oy) {
        const s = a.x + a.px + a.w / 2 < c.x + c.px + c.w / 2 ? -1 : 1
        a.px += s * ox * share
        c.px -= s * ox * (1 - share)
        a.vx *= 0.5
        c.vx *= 0.5
      } else {
        const s = a.y + a.py + a.h / 2 < c.y + c.py + c.h / 2 ? -1 : 1
        a.py += s * oy * share
        c.py -= s * oy * (1 - share)
        a.vy *= 0.5
        c.vy *= 0.5
      }
    }
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Run the cloud. `bodies` is read every frame (the caller swaps in new homes as the layout changes) and `el(text)`
 * finds each word's inner span. Returns a stop function. The live state hangs off the host as `__cloud` so a probe can
 * read it.
 */
export function runCloud(host: HTMLElement, bodies: () => Body[], el: (text: string) => HTMLElement | undefined): () => void {
  if (reduced()) return () => {}
  let at: { x: number; y: number } | null = null
  let raf = 0
  const t0 = performance.now()
  let last = t0
  const move = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    at = { x: e.clientX, y: e.clientY }
  }
  const leave = () => {
    at = null
  }
  window.addEventListener('pointermove', move, { passive: true })
  document.documentElement.addEventListener('pointerleave', leave)
  window.addEventListener('blur', leave)
  const frame = (now: number) => {
    const list = bodies()
    const r = host.getBoundingClientRect()
    // The editor shows a scaled stage: pointer pixels to the cloud's own pixels.
    const scale = host.clientWidth ? r.width / host.clientWidth : 1
    const p = at ? { x: (at.x - r.left) / scale, y: (at.y - r.top) / scale } : null
    step(list, p, (now - t0) / 1000, (now - last) / 1000, { w: host.clientWidth, h: host.clientHeight })
    last = now
    for (const b of list) {
      const e = el(b.text)
      if (e) e.style.transform = `translate(${b.px.toFixed(2)}px, ${b.py.toFixed(2)}px)`
    }
    ;(host as HTMLElement & { __cloud?: unknown }).__cloud = { at: p, bodies: list }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', move)
    document.documentElement.removeEventListener('pointerleave', leave)
    window.removeEventListener('blur', leave)
  }
}
