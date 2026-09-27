/**
 * Social preview contracts. These are not learner records, XP, or mastery.
 * The learning engine must not import this module.
 */

export type SocialMode = 'quick' | 'practice' | 'rush'

export interface CompetitionContext {
  skillId: string
  levelId: string
  mode: SocialMode
  skillTitle: string
  levelTitle: string
  modeTitle: string
}

/** A nickname on a fixture. Not an account. */
export interface SocialRacer {
  nickname: string
  avatarLabel: string
}

export interface LeaderboardEntry extends SocialRacer {
  context: CompetitionContext
  correct: number
  answered: number
  completed: boolean
  /** Present when the run finished. Speed is a tie-break, not the rank. */
  elapsedMs: number | null
}

export interface LobbyParticipant extends SocialRacer {
  host: boolean
  ready: boolean
}

export interface RaceLobbyFixture {
  roomCode: string
  context: CompetitionContext
  participants: readonly LobbyParticipant[]
}

export interface RaceLane extends SocialRacer {
  answered: number
  total: number
  you: boolean
}

export interface RaceFixture {
  context: CompetitionContext
  questionIndex: number
  total: number
  lanes: readonly RaceLane[]
  evidence: { marks: 0 | 1 | 2 | 3; mastered: boolean }
}

export interface PodiumFixture {
  roomCode: string
  context: CompetitionContext
  entries: readonly LeaderboardEntry[]
}

export function sameContext(a: CompetitionContext, b: CompetitionContext): boolean {
  return a.skillId === b.skillId && a.levelId === b.levelId && a.mode === b.mode
}

/** Rush and Quick show a time. Practice ranks on completion and accuracy only. */
export function modeUsesSpeed(mode: SocialMode): boolean {
  return mode === 'rush' || mode === 'quick'
}

export function accuracy(entry: Pick<LeaderboardEntry, 'correct' | 'answered'>): number {
  if (entry.answered <= 0) return 0
  return entry.correct / entry.answered
}
