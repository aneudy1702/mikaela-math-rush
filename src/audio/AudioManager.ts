import { audioAssets, audioVolumes } from './audioAssets'

const MUTE_KEY = 'mikaela-math-rush:muted'

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

/**
 * Sample-based audio for V1. Unlock from a user gesture before play/music.
 * Ordinary answers stay quiet; milestones / victory get louder cues.
 */
class SampleAudioManager implements GameAudio {
  private muted = typeof localStorage !== 'undefined' ? loadMutePreference() : false
  private unlocked = false
  private music: HTMLAudioElement | null = null
  private intensity = 0
  private lastMilestoneAt = -1
  private pools = new Map<string, HTMLAudioElement[]>()

  async unlock(): Promise<void> {
    if (typeof window === 'undefined') return
    // Warm a silent tap so subsequent plays are allowed on iOS.
    try {
      const warm = new Audio(audioAssets.sfx.tap)
      warm.volume = 0
      await warm.play().catch(() => undefined)
      warm.pause()
    } catch {
      /* ignore */
    }
    this.unlocked = true
    if (!this.muted && this.music && this.music.paused) {
      void this.music.play().catch(() => undefined)
    }
  }

  isMuted(): boolean {
    return this.muted
  }

  mute(): void {
    this.muted = true
    saveMutePreference(true)
    if (this.music) {
      this.music.pause()
    }
  }

  unmute(): void {
    this.muted = false
    saveMutePreference(false)
    if (this.music && this.unlocked) {
      void this.music.play().catch(() => undefined)
      this.applyMusicVolume()
    }
  }

  toggleMute(): boolean {
    if (this.muted) this.unmute()
    else this.mute()
    return this.muted
  }

  playTap(): void {
    this.play(audioAssets.sfx.tap, audioVolumes.tap)
  }

  playCorrect(): void {
    this.play(audioAssets.sfx.correct, audioVolumes.correct)
  }

  playMiss(): void {
    this.play(audioAssets.sfx.miss, audioVolumes.miss)
  }

  playStreak(level: StreakLevel): void {
    if (level === 'big') {
      this.play(audioAssets.sfx.streakBig, audioVolumes.streakBig)
    } else {
      this.play(audioAssets.sfx.streakSmall, audioVolumes.streakSmall)
    }
  }

  playBoss(): void {
    this.play(audioAssets.sfx.bossStart, audioVolumes.boss)
  }

  playMilestone(): void {
    this.play(audioAssets.sfx.milestone, audioVolumes.milestone)
  }

  playVictory(): void {
    this.play(audioAssets.sfx.victory, audioVolumes.victory)
  }

  playGotItBack(): void {
    this.play(audioAssets.sfx.streakSmall, audioVolumes.streakSmall * 0.85)
  }

  playStart(): void {
    this.play(audioAssets.sfx.correct, audioVolumes.correct * 0.8)
  }

  startMusic(): void {
    if (typeof window === 'undefined') return
    if (!this.music) {
      this.music = new Audio(audioAssets.music.rush)
      this.music.loop = true
      this.music.preload = 'auto'
    }
    this.applyMusicVolume()
    if (this.muted || !this.unlocked) return
    void this.music.play().catch(() => undefined)
  }

  stopMusic(): void {
    if (!this.music) return
    this.music.pause()
    this.music.currentTime = 0
  }

  /**
   * Intensity 0–1 based on session progress. Raises music volume gently
   * toward the end of longer runs without swapping tracks.
   */
  setIntensity(level: number): void {
    this.intensity = Math.max(0, Math.min(1, level))
    this.applyMusicVolume()
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

  private applyMusicVolume(): void {
    if (!this.music) return
    const boost = 1 + this.intensity * 0.45
    this.music.volume = Math.min(0.55, audioVolumes.music * boost)
  }

  private play(src: string, volume: number): void {
    if (this.muted || typeof window === 'undefined') return
    const el = this.acquire(src)
    el.volume = Math.max(0, Math.min(1, volume))
    el.currentTime = 0
    void el.play().catch(() => undefined)
  }

  private acquire(src: string): HTMLAudioElement {
    let pool = this.pools.get(src)
    if (!pool) {
      pool = []
      this.pools.set(src, pool)
    }
    const idle = pool.find((a) => a.paused || a.ended)
    if (idle) return idle
    if (pool.length >= 4) return pool[0]!
    const fresh = new Audio(src)
    fresh.preload = 'auto'
    pool.push(fresh)
    return fresh
  }
}

export const gameAudio: SampleAudioManager = new SampleAudioManager()
