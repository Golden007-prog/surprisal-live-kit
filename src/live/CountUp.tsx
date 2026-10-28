import { useEffect, useRef, useState } from 'react'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A number that counts to its new value when it changes (600 ms, easing out), so a hero figure moves as answers land.
 * A chart that races its bars passes the race's length and curve, so the figure lands with them.
 */
export function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  ms = 600,
  curve = (k) => 1 - (1 - k) ** 3,
}: {
  value: number
  format?: (n: number) => string
  ms?: number
  curve?: (k: number) => number
}) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (reduced() || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      setShown(a + (value - a) * curve(k))
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      from.current = value
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>{format(shown)}</>
}
