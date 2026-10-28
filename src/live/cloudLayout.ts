/**
 * Word-cloud layout: an Archimedean spiral from the centre, biggest word first, axis-aligned boxes, no overlaps.
 * Deterministic for the same words and box, so a poll that adds one word moves the cloud a little, not all of it.
 */

export type Placed = { text: string; count: number; size: number; x: number; y: number; w: number; h: number; weight: number }

type Box = { x: number; y: number; w: number; h: number }
const hits = (a: Box, b: Box, pad: number) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad

export function layoutCloud(
  words: { text: string; count: number }[],
  width: number,
  height: number,
  measure: (text: string, px: number) => number,
  opts: { maxFont?: number; minFont?: number; fill?: number } = {},
): Placed[] {
  if (!words.length || width < 40 || height < 40) return []
  const max = words[0].count
  const min = Math.min(...words.map((w) => w.count))
  // Weight 1..4.2 by the square root of the count's place between min and max: area, not length, carries the count.
  const weighted = words.map((w) => ({ ...w, weight: max === min ? 2.2 : 1 + 3.2 * Math.sqrt((w.count - min) / (max - min)) }))
  const lineH = 1.02
  // First guess at the scale: the words' boxes cover `fill` of the area.
  const area1 = weighted.reduce((a, w) => a + measure(w.text, w.weight) * w.weight * lineH, 0)
  let k = Math.sqrt(((opts.fill ?? 0.38) * width * height) / Math.max(1, area1))
  const maxFont = opts.maxFont ?? height * 0.34
  k = Math.min(k, maxFont / Math.max(...weighted.map((w) => w.weight)))
  // ...and never wider than the box for the biggest word.
  const top = weighted[0]
  k = Math.min(k, (width * 0.92) / Math.max(1, measure(top.text, top.weight)))

  for (let attempt = 0; attempt < 10; attempt++) {
    const placed: Placed[] = []
    const cx = width / 2
    const cy = height / 2
    const aspect = width / height
    let ok = true
    for (const w of weighted) {
      const size = Math.max(opts.minFont ?? 11, w.weight * k)
      const bw = measure(w.text, size)
      const bh = size * lineH
      const pad = Math.max(2, size * 0.12)
      let done = false
      for (let t = 0; t < 600; t += 0.25) {
        const r = t * Math.max(2, k * 0.12)
        const x = cx + r * Math.cos(t) * Math.sqrt(aspect) - bw / 2
        const y = cy + r * Math.sin(t) / Math.sqrt(aspect) - bh / 2
        if (x < 0 || y < 0 || x + bw > width || y + bh > height) {
          if (r > Math.max(width, height)) break
          continue
        }
        const box = { x, y, w: bw, h: bh }
        if (placed.some((p) => hits(box, p, pad))) continue
        placed.push({ text: w.text, count: w.count, size, weight: w.weight, ...box })
        done = true
        break
      }
      if (!done) {
        ok = false
        break
      }
    }
    if (ok) return placed
    k *= 0.86
  }
  return []
}
