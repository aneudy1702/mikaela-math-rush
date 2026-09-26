import { audioAssets, audioVolumes, musicLoop } from './audioAssets'

const MUTE_KEY = 'mikaela-math-rush:muted'
const MUSIC_FADE_IN_S = 0.8
const MUSIC_FADE_OUT_S = 0.35
/** Samples quieter than this at the head of a clip are skipped on play. */
const SILENCE_THRESHOLD = 0.001

export type StreakLevel = 'small' | 'big'

export interface GameAudio {
  playTap(): void
  playCorrect(): void
  playMiss(): void
  playStreak(level: StreakLevel): void
  playBoss(): void
  playMilestone(): void
  playVictory(): void
  playGotItBack(): void
  playStart(): void

  startMusic(): void
  stopMusic(): void
  setIntensity(level: number): void

  mute(): void
  unmute(): void
  toggleMute(): boolean
  isMuted(): boolean

  unlock(): Promise<void>
}

type SfxKey = keyof typeof audioAssets.sfx

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

function createContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    return new Ctor({ latencyHint: 'interactive' })
  } catch {
    return null
  }
}

/** Seconds of digital silence at the start of a buffer. */
function leadingSilence(buffer: AudioBuffer): number {
  let first = buffer.length
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < first; i++) {
      if (Math.abs(data[i]!) > SILENCE_THRESHOLD) {
        first = i
        break
      }
    }
  }
  return first >= buffer.length ? 0 : first / buffer.sampleRate
}

/**
 * Web Audio playback. Every clip is fetched and decoded into memory up front,
 * so a play is just scheduling a buffer — no media-element seek/decode lag.
 * The context starts suspended until `unlock()` runs inside a user gesture.
 */
class WebAudioManager implements GameAudio {
  private muted = typeof localStorage !== 'undefined' ? loadMutePreference() : false
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private buffers = new Map<string, AudioBuffer>()
  private offsets = new Map<string, number>()
  private loading = new Map<string, Promise<AudioBuffer | null>>()
  private musicSource: AudioBufferSourceNode | null = null
  private musicWanted = false
  private intensity = 0
  private lastMilestoneAt = -1

  /** Fetch + decode every clip. Safe to call before any user gesture. */
  preload(): void {
    if (!this.ensureContext()) return
    // Music is large; queue it behind the short clips.
    void Promise.all(Object.values(audioAssets.sfx).map((src) => this.load(src))).then(() =>
      this.load(audioAssets.music.rush),
    )
  }

  async unlock(): Promise<void> {
    const ctx = this.ensureContext()
    if (!ctx || ctx.state === 'running') return
    try {
      await ctx.resume()
    } catch {
      /* ignore */
    }
  }

  isMuted(): boolean {
    return this.muted
  }

  mute(): void {
    this.muted = true
    saveMutePreference(true)
    this.rampGain(this.master, 0, 0.05)
  }

  unmute(): void {
    this.muted = false
    saveMutePreference(false)
    this.rampGain(this.master, 1, 0.05)
  }

  toggleMute(): boolean {
    if (this.muted) this.unmute()
    else this.mute()
    return this.muted
  }

  playTap(): void {
    this.play('tap', audioVolumes.tap)
  }

  playCorrect(): void {
    this.play('correct', audioVolumes.correct)
  }

  playMiss(): void {
    this.play('miss', audioVolumes.miss)
  }

  playStreak(level: StreakLevel): void {
    if (level === 'big') this.play('streakBig', audioVolumes.streakBig)
    else this.play('streakSmall', audioVolumes.streakSmall)
  }

  playBoss(): void {
    this.play('bossStart', audioVolumes.boss)
  }

  playMilestone(): void {
    this.play('milestone', audioVolumes.milestone)
  }

  playVictory(): void {
    this.play('victory', audioVolumes.victory)
  }

  playGotItBack(): void {
    this.play('streakSmall', audioVolumes.streakSmall * 0.85)
  }

  playStart(): void {
    this.play('correct', audioVolumes.correct * 0.8)
  }

  startMusic(): void {
    this.musicWanted = true
    const ctx = this.ensureContext()
    if (!ctx || !this.musicGain || this.musicSource) return

    const buffer = this.buffers.get(audioAssets.music.rush)
    if (!buffer) {
      // Still downloading — start as soon as it lands, if the run is still going.
      void this.load(audioAssets.music.rush).then(() => {
        if (this.musicWanted) this.startMusic()
      })
      return
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.loopStart = musicLoop.start
    source.loopEnd = Math.min(musicLoop.end, buffer.duration)
    source.connect(this.musicGain)
    const now = ctx.currentTime
    this.musicGain.gain.cancelScheduledValues(now)
    this.musicGain.gain.setValueAtTime(0, now)
    this.musicGain.gain.linearRampToValueAtTime(this.musicLevel(), now + MUSIC_FADE_IN_S)
    source.start(now, musicLoop.start)
    this.musicSource = source
  }

  stopMusic(): void {
    this.musicWanted = false
    const source = this.musicSource
    if (!source || !this.ctx || !this.musicGain) return
    this.musicSource = null
    const now = this.ctx.currentTime
    this.musicGain.gain.cancelScheduledValues(now)
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now)
    this.musicGain.gain.linearRampToValueAtTime(0, now + MUSIC_FADE_OUT_S)
    source.stop(now + MUSIC_FADE_OUT_S)
  }

  /**
   * Intensity 0–1 based on session progress. Raises music volume gently
   * toward the end of longer runs without swapping tracks.
   */
  setIntensity(level: number): void {
    this.intensity = Math.max(0, Math.min(1, level))
    if (this.musicSource) this.rampGain(this.musicGain, this.musicLevel(), 0.5)
  }

  /** Fire progress milestone SFX at 25/50/75 once per threshold. */
  maybeProgressMilestone(displayIndex: number, total: number): void {
    if (total < 25) return
    for (const mark of [25, 50, 75]) {
      if (mark >= total) continue
      if (displayIndex === mark && this.lastMilestoneAt !== mark) {
        this.lastMilestoneAt = mark
        this.playMilestone()
        break
      }
    }
  }

  resetSessionFlags(): void {
    this.lastMilestoneAt = -1
    this.intensity = 0
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx
    const ctx = createContext()
    if (!ctx) return null

    // iOS: let Web Audio play even with the ringer switch on silent.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'

    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 1
    this.master.connect(ctx.destination)
    this.musicGain = ctx.createGain()
    this.musicGain.gain.value = 0
    this.musicGain.connect(this.master)
    this.ctx = ctx

    // Pause everything (music included) while the app is backgrounded.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void ctx.suspend().catch(() => undefined)
      else if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    })
    return ctx
  }

  private load(src: string): Promise<AudioBuffer | null> {
    const existing = this.loading.get(src)
    if (existing) return existing
    const ctx = this.ctx
    if (!ctx) return Promise.resolve(null)
    const task = fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${src}`)
        return res.arrayBuffer()
      })
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(src, buffer)
        this.offsets.set(src, leadingSilence(buffer))
        return buffer
      })
      .catch(() => {
        this.loading.delete(src) // allow a retry on a later play
        return null
      })
    this.loading.set(src, task)
    return task
  }

  private play(key: SfxKey, volume: number): void {
    if (this.muted) return
    const ctx = this.ensureContext()
    if (!ctx || !this.master) return
    if (ctx.state !== 'running') void this.unlock()

    const src = audioAssets.sfx[key]
    const buffer = this.buffers.get(src)
    // Not decoded yet (first seconds after boot): skip rather than play late.
    if (!buffer) {
      void this.load(src)
      return
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = Math.max(0, Math.min(1, volume))
    source.connect(gain)
    gain.connect(this.master)
    source.start(0, this.offsets.get(src) ?? 0)
  }

  private musicLevel(): number {
    const boost = 1 + this.intensity * 0.45
    return Math.min(0.55, audioVolumes.music * boost)
  }

  private rampGain(node: GainNode | null, value: number, seconds: number): void {
    if (!node || !this.ctx) return
    const now = this.ctx.currentTime
    node.gain.cancelScheduledValues(now)
    node.gain.setValueAtTime(node.gain.value, now)
    node.gain.linearRampToValueAtTime(value, now + seconds)
  }
}

export const gameAudio: WebAudioManager = new WebAudioManager()
