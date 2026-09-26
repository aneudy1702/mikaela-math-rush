/**
 * Kid-friendly SFX via Web Audio (no asset downloads).
 * Ordinary correct = tiny click; milestones get richer flourishes.
 * Mute is honored everywhere.
 */

export type SfxEvent =
  | 'correct'
  | 'miss'
  | 'got-it-back'
  | 'streak-5'
  | 'streak-10'
  | 'streak-25'
  | 'streak-50'
  | 'streak-100'
  | 'new-record'
  | 'tap'
  | 'start'

const MUTE_KEY = 'mikaela-math-rush:muted'

let ctx: AudioContext | null = null
let muted = false
let unlocked = false

function loadMutePreference(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function saveMutePreference(value: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

muted = typeof localStorage !== 'undefined' ? loadMutePreference() : false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

/** Call from a user gesture so iOS/Safari allows sound. */
export async function unlockAudio(): Promise<void> {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') {
    try {
      await c.resume()
    } catch {
      /* ignore */
    }
  }
  unlocked = c.state === 'running'
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean): void {
  muted = value
  saveMutePreference(value)
}

export function toggleMuted(): boolean {
  setMuted(!muted)
  return muted
}

function tone(
  c: AudioContext,
  {
    freq,
    duration,
    type = 'sine',
    gain = 0.08,
    when = 0,
    slideTo,
  }: {
    freq: number
    duration: number
    type?: OscillatorType
    gain?: number
    when?: number
    slideTo?: number
  },
): void {
  const t0 = c.currentTime + when
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, slideTo),
      t0 + duration,
    )
  }
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function chord(
  c: AudioContext,
  freqs: number[],
  duration: number,
  gain = 0.05,
  when = 0,
): void {
  for (const f of freqs) {
    tone(c, { freq: f, duration, gain: gain / freqs.length, when, type: 'triangle' })
  }
}

export function playSfx(event: SfxEvent): void {
  if (muted) return
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') {
    void c.resume()
  }

  switch (event) {
    case 'tap':
      tone(c, { freq: 680, duration: 0.04, gain: 0.03, type: 'square' })
      break
    case 'correct':
      // Tiny satisfying pop — ordinary correct stays subtle.
      tone(c, { freq: 880, duration: 0.07, gain: 0.045, type: 'sine' })
      tone(c, { freq: 1320, duration: 0.05, gain: 0.025, when: 0.03 })
      break
    case 'miss':
      tone(c, {
        freq: 320,
        duration: 0.16,
        gain: 0.05,
        type: 'triangle',
        slideTo: 220,
      })
      break
    case 'got-it-back':
      tone(c, { freq: 523, duration: 0.09, gain: 0.05 })
      tone(c, { freq: 659, duration: 0.1, gain: 0.05, when: 0.08 })
      tone(c, { freq: 784, duration: 0.12, gain: 0.045, when: 0.16 })
      break
    case 'streak-5':
      chord(c, [523, 659, 784], 0.22, 0.07)
      break
    case 'streak-10':
      chord(c, [587, 740, 880], 0.28, 0.08)
      tone(c, { freq: 1175, duration: 0.12, gain: 0.04, when: 0.18 })
      break
    case 'streak-25':
      chord(c, [392, 523, 659, 784], 0.35, 0.09)
      chord(c, [523, 659, 784, 1047], 0.3, 0.07, 0.2)
      break
    case 'streak-50':
      chord(c, [349, 440, 523, 659], 0.4, 0.1)
      chord(c, [440, 554, 659, 880], 0.35, 0.08, 0.22)
      tone(c, { freq: 1319, duration: 0.2, gain: 0.05, when: 0.4 })
      break
    case 'streak-100':
    case 'new-record':
      chord(c, [262, 330, 392, 523], 0.35, 0.1)
      chord(c, [330, 415, 523, 659], 0.35, 0.09, 0.2)
      chord(c, [392, 523, 659, 784], 0.4, 0.08, 0.4)
      tone(c, { freq: 1568, duration: 0.25, gain: 0.05, when: 0.65 })
      break
    case 'start':
      tone(c, { freq: 440, duration: 0.08, gain: 0.04 })
      tone(c, { freq: 554, duration: 0.1, gain: 0.04, when: 0.07 })
      break
  }
}

export function audioReady(): boolean {
  return unlocked && !muted
}
