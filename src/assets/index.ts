import mikaelaRunner from './characters/mikaela-runner.png'
import mikaelaVictory from './characters/mikaela-victory.png'

import trophy from './icons/trophy.png'
import streakFire from './icons/streak-fire.png'
import lightning from './icons/lightning.png'
import practiceTarget from './icons/practice-target.png'
import rushFlag from './icons/rush-flag.png'

import celebrationBurst from './effects/celebration-burst.png'

export const gameAssets = {
  characters: {
    runner: mikaelaRunner,
    victory: mikaelaVictory,
  },
  icons: {
    trophy,
    streakFire,
    lightning,
    practiceTarget,
    rushFlag,
  },
  effects: {
    celebrationBurst,
  },
} as const
