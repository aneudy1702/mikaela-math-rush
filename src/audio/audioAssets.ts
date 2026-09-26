/** Public-path registry for V1 sample audio (see public/audio/). */

export const audioAssets = {
  music: {
    rush: '/audio/music/rush-loop.m4a',
  },
  sfx: {
    tap: '/audio/sfx/tap.ogg',
    correct: '/audio/sfx/correct.ogg',
    miss: '/audio/sfx/miss.ogg',
    streakSmall: '/audio/sfx/streak-small.ogg',
    streakBig: '/audio/sfx/streak-big.ogg',
    bossStart: '/audio/sfx/boss-start.ogg',
    milestone: '/audio/sfx/milestone.ogg',
    victory: '/audio/sfx/victory.ogg',
  },
} as const

/**
 * Seamless loop window for the music, in seconds. GameOtoon ends on a hit
 * that rings out; jumping from that hit back to the opening hit keeps the
 * downbeat on the grid and skips the ~1s decay.
 */
export const musicLoop = {
  start: 0.01,
  end: 60.41,
} as const

/** Relative volumes — music must stay under feedback. */
export const audioVolumes = {
  music: 0.3,
  tap: 0.2,
  correct: 0.3,
  miss: 0.25,
  streakSmall: 0.45,
  streakBig: 0.55,
  boss: 0.5,
  milestone: 0.5,
  victory: 0.65,
} as const
