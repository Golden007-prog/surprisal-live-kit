import { useLayoutEffect, useRef, useState } from 'react'

/**
 * The element's content box and its computed font size, kept current. Charts draw in real pixels from this, so
 * text stays the same size on a phone and on a shared 1080p screen, instead of scaling with a viewBox.
 */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0, font: 16 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      // Layout size, not getBoundingClientRect: the editor's preview is a scaled stage, and the chart must draw at the
      // stage's own size.
      const r = { width: el.clientWidth, height: el.clientHeight }
      const font = parseFloat(getComputedStyle(el).fontSize) || 16
      setSize((s) => (s.width === r.width && s.height === r.height && s.font === font ? s : { width: r.width, height: r.height, font }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/**
 * The room left on the stage below an element: from its top to the bottom of the slide's content box, in the stage's
 * own pixels (the editor's preview is a scaled stage). Null outside a stage (phones, the report), where pages scroll.
 * Re-measured on resize and once the slide's entrance has settled.
 */
export function useSpaceBelow<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [space, setSpace] = useState<{ px: number; font: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const main = el?.closest<HTMLElement>('.lv-stage-main')
    if (!el || !main) return
    const read = () => {
      const scale = main.getBoundingClientRect().height / (main.offsetHeight || 1) || 1
      const top = (el.getBoundingClientRect().top - main.getBoundingClientRect().top) / scale + main.scrollTop
      const px = Math.max(0, main.clientHeight - (parseFloat(getComputedStyle(main).paddingBottom) || 0) - top)
      const font = parseFloat(getComputedStyle(el).fontSize) || 16
      setSpace((s) => (s && Math.abs(s.px - px) < 1 && s.font === font ? s : { px, font }))
    }
    read()
    const t = window.setTimeout(read, 700)
    const ro = new ResizeObserver(read)
    ro.observe(main)
    return () => {
      window.clearTimeout(t)
      ro.disconnect()
    }
  }, [])
  return [ref, space] as const
}

/** True once the web fonts are in, so text measured on a canvas matches what renders. */
export function useFontsReady() {
  const [ready, setReady] = useState(() => typeof document === 'undefined' || document.fonts?.status === 'loaded')
  useLayoutEffect(() => {
    if (ready || !document.fonts) return
    let on = true
    document.fonts.ready.then(() => on && setReady(true))
    return () => {
      on = false
    }
  }, [ready])
  return ready
}
