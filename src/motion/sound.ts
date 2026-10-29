/**
 * The presenter's sound (round 3, 24 Oct): quiz and podium only, off by default, synthesized with WebAudio (no audio
 * files). The AudioContext is made on the toggle's click (autoplay rules); a choice remembered from last time makes
 * it on the first click or key press instead. Polls never call `cue`. Every state still reads with the sound off.
 *
 * Every call is logged on `window.__liveSound` (cue name, whether it played), so a probe can check the logic without
 * listening: muted by default, no context before the click, nothing on polls.
 */
import { useSyncExternalStore } from 'react'

export type Cue = 'tick' | 'swell' | 'thud' | 'chime' | 'land' | 'drumroll' | 'fanfare'

const KEY = 'live_kit_sound'
const VOLUME = 0.16

type Debug = { calls: { cue: Cue; played: boolean; at: number }[]; contexts: number }
const debug: Debug = { calls: [], contexts: 0 }
if (typeof window !== 'undefined') (window as unknown as { __liveSound: Debug }).__liveSound = debug

let on = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
})()
let ctx: AudioContext | null = null
let master: GainNode | null = null
const subs = new Set<() => void>()

function make() {
  if (ctx || typeof window === 'undefined') return
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx = new AC()
  debug.contexts++
  master = ctx.createGain()
  master.gain.value = VOLUME
  master.connect(ctx.destination)
}

// Only the presenter plays: phones, the console and the report share these charts but never arm the sound.
let armed = false

/** The presenter arms the sound while it is mounted. Remembered as on: the context waits for the first gesture. */
export function armSound(): () => void {
  armed = true
  const first = () => {
    if (on) make()
    removeEventListener('pointerdown', first)
    removeEventListener('keydown', first)
  }
  if (on && !ctx) {
    addEventListener('pointerdown', first)
    addEventListener('keydown', first)
  }
  return () => {
    armed = false
    removeEventListener('pointerdown', first)
    removeEventListener('keydown', first)
  }
}

export function soundOn() {
  return on
}

/** Call from a click or key handler: it makes the AudioContext inside the gesture. */
export function setSound(next: boolean) {
  on = next
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off')
  } catch {
    /* private mode: the choice lasts this page */
  }
  if (next) {
    make()
    void ctx?.resume()
  }
  subs.forEach((f) => f())
}

export function useSound(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => on,
    () => false,
  )
}

/** ±10 cents per hit, so repeats never sound mechanical. */
const wobble = () => (Math.random() * 2 - 1) * 10

function tone(freq: number, at: number, dur: number, peak: number, type: OscillatorType = 'sine', glideTo?: number) {
  const c = ctx!
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur)
  o.detune.value = wobble()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.012, dur / 4))
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(master!)
  o.start(at)
  o.stop(at + dur + 0.02)
}

function noise(at: number, dur: number, peak: number, lowpass: number) {
  const c = ctx!
  const len = Math.ceil(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = lowpass
  const g = c.createGain()
  g.gain.setValueAtTime(peak, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  src.connect(f).connect(g).connect(master!)
  src.start(at)
}

/**
 * Play a cue. `n` varies it: the podium place for `land` (3 is lowest), the second left for `tick`. Muted, or before
 * the context exists, it only logs the call.
 */
export function cue(name: Cue, n = 0) {
  const played = armed && on && !!ctx && ctx.state !== 'closed'
  debug.calls.push({ cue: name, played, at: Math.round(performance.now()) })
  if (!played) return
  const t = ctx!.currentTime + 0.01
  switch (name) {
    case 'tick':
      // The last second ticks a little higher.
      tone(n <= 1 ? 1760 : 1320, t, 0.05, 0.5, 'triangle')
      break
    case 'swell': {
      const o = ctx!.createOscillator()
      const g = ctx!.createGain()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(110, t)
      o.frequency.exponentialRampToValueAtTime(440, t + 0.6)
      o.detune.value = wobble()
      const f = ctx!.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(400, t)
      f.frequency.exponentialRampToValueAtTime(2400, t + 0.6)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.55)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.66)
      o.connect(f).connect(g).connect(master!)
      o.start(t)
      o.stop(t + 0.7)
      break
    }
    case 'thud':
      tone(110, t, 0.22, 0.9, 'sine', 48)
      noise(t, 0.08, 0.25, 600)
      break
    case 'chime':
      tone(1318.5, t, 0.5, 0.45, 'triangle')
      tone(1975.5, t + 0.12, 0.7, 0.4, 'triangle')
      break
    case 'land': {
      // 3rd lowest, 1st highest.
      const f = n === 1 ? 130 : n === 2 ? 98 : 73
      tone(f, t, 0.3, 1, 'sine', f * 0.5)
      noise(t, 0.06, 0.3, 900)
      break
    }
    case 'drumroll':
      for (let k = 0; k < 16; k++) noise(t + k * 0.031, 0.03, 0.08 + (0.22 * k) / 15, 1800)
      break
    case 'fanfare':
      ;[523.25, 659.25, 783.99, 1046.5].forEach((f, k) => tone(f, t + k * 0.09, k === 3 ? 0.9 : 0.22, 0.4, 'triangle'))
      tone(523.25, t + 0.27, 0.9, 0.18, 'sawtooth')
      break
  }
}
