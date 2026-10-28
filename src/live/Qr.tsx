import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import qrcode from 'qrcode-generator'

/** True for a module inside one of the three 7x7 finder squares. They are drawn on their own and never move. */
const inFinder = (r: number, c: number, n: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)

/**
 * A QR code in currentColor, so it follows the theme.
 * `playful` (the big join card) adds the Easter egg: the ink modules assemble from the centre out on load, and every
 * so often (or on hover) a ripple runs through them. Each module dips to half size and back, which shows a gold
 * square under it for a moment. A module's centre stays dark the whole time, and the finders never move, so the
 * code scans mid-ripple too. At rest it is plain dark on light.
 */
export function Qr({ value, size = 160, label, playful = false }: { value: string; size?: number; label: string; playful?: boolean }) {
  const { n, d, finders, rest, modules } = useMemo(() => {
    const q = qrcode(0, 'M')
    q.addData(value)
    q.make()
    const n = q.getModuleCount()
    const half = n / 2
    const far = Math.hypot(half, half)
    let d = ''
    let finders = ''
    let rest = ''
    const modules: { r: number; c: number; k: number }[] = []
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (!q.isDark(r, c)) continue
        const sq = `M${c} ${r}h1v1h-1z`
        d += sq
        if (inFinder(r, c, n)) finders += sq
        else {
          rest += sq
          modules.push({ r, c, k: Math.hypot(c + 0.5 - half, r + 0.5 - half) / far })
        }
      }
    return { n, d, finders, rest, modules }
  }, [value])

  // The ripple: a class on the svg, set and cleared by hand so a re-render on every poll never restarts it.
  const ref = useRef<SVGSVGElement>(null)
  const ripple = () => {
    const el = ref.current
    if (!el || el.classList.contains('is-ripple') || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.classList.add('is-ripple')
    window.setTimeout(() => el.classList.remove('is-ripple'), 1900)
  }
  useEffect(() => {
    if (!playful) return
    const first = window.setTimeout(ripple, 2600)
    const every = window.setInterval(ripple, 11000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(every)
    }
  }, [playful])

  if (!playful)
    return (
      <svg className="lv-qr" width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label={label} shapeRendering="crispEdges">
        <rect x="-2" y="-2" width={n + 4} height={n + 4} className="lv-qr-ground" />
        <path d={d} fill="currentColor" />
      </svg>
    )
  return (
    <svg
      ref={ref}
      className="lv-qr is-playful"
      width={size}
      height={size}
      viewBox={`-2 -2 ${n + 4} ${n + 4}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      onPointerEnter={ripple}
    >
      <rect x="-2" y="-2" width={n + 4} height={n + 4} className="lv-qr-ground" />
      <path d={rest} className="lv-qr-glint" />
      <path d={finders} fill="currentColor" />
      <g fill="currentColor">
        {modules.map((m) => (
          <rect key={`${m.r}-${m.c}`} x={m.c} y={m.r} width="1" height="1" className="lv-qr-m" style={{ '--k': m.k.toFixed(3) } as CSSProperties} />
        ))}
      </g>
    </svg>
  )
}
