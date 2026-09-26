/**
 * Compatibility facade — gameplay should prefer `gameAudio` from AudioManager.
 * Kept so existing Keypad / App imports keep working.
 */

import { gameAudio } from './AudioManager'

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
  | 'boss'
  | 'milestone'

export async function unlockAudio(): Promise<void> {
  await gameAudio.unlock()
}

export function isMuted(): boolean {
  return gameAudio.isMuted()
}

export function setMuted(value: boolean): void {
  if (value) gameAudio.mute()
  else gameAudio.unmute()
}

export function toggleMuted(): boolean {
  return gameAudio.toggleMute()
}

export function playSfx(event: SfxEvent): void {
  switch (event) {
    case 'tap':
      gameAudio.playTap()
      break
    case 'correct':
      gameAudio.playCorrect()
      break
    case 'miss':
      gameAudio.playMiss()
      break
    case 'got-it-back':
      gameAudio.playGotItBack()
      break
    case 'streak-5':
    case 'streak-10':
      gameAudio.playStreak('small')
      break
    case 'streak-25':
    case 'streak-50':
    case 'streak-100':
      gameAudio.playStreak('big')
      break
    case 'new-record':
      gameAudio.playVictory()
      break
    case 'start':
      gameAudio.playStart()
      break
    case 'boss':
      gameAudio.playBoss()
      break
    case 'milestone':
      gameAudio.playMilestone()
      break
  }
}

export function audioReady(): boolean {
  return !gameAudio.isMuted()
}

export { gameAudio } from './AudioManager'
