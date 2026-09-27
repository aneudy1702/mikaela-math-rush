import type { LeaderboardEntry, PodiumFixture, RaceFixture, RaceLobbyFixture } from './contracts'

/** One family board. Every row is Multiplication, Level 7, Rush 100. */
export const FAMILY_RUSH_CONTEXT = {
  skillId: 'multiplication',
  levelId: 'L7',
  mode: 'rush',
  skillTitle: 'Multiplication',
  levelTitle: 'Level 7',
  modeTitle: 'Rush 100',
} as const

const context = FAMILY_RUSH_CONTEXT

export const FAMILY_BOARD: readonly LeaderboardEntry[] = [
  {
    nickname: 'Mikaela',
    avatarLabel: 'M',
    context,
    correct: 100,
    answered: 100,
    completed: true,
    elapsedMs: 252_000,
  },
  {
    nickname: 'Adrian',
    avatarLabel: 'A',
    context,
    correct: 100,
    answered: 100,
    completed: true,
    elapsedMs: 280_000,
  },
  {
    nickname: 'Noa',
    avatarLabel: 'N',
    context,
    correct: 96,
    answered: 100,
    completed: true,
    elapsedMs: 210_000,
  },
  {
    nickname: 'Sam',
    avatarLabel: 'S',
    context,
    correct: 40,
    answered: 40,
    completed: false,
    elapsedMs: 90_000,
  },
]

export const FAMILY_LOBBY: RaceLobbyFixture = {
  roomCode: '482917',
  context,
  participants: [
    { nickname: 'Mikaela', avatarLabel: 'M', host: true, ready: true },
    { nickname: 'Adrian', avatarLabel: 'A', host: false, ready: true },
    { nickname: 'Noa', avatarLabel: 'N', host: false, ready: true },
    { nickname: 'Sam', avatarLabel: 'S', host: false, ready: false },
  ],
}

export const FAMILY_RACE: RaceFixture = {
  context,
  questionIndex: 7,
  total: 100,
  evidence: { marks: 2, mastered: false },
  lanes: [
    { nickname: 'Mikaela', avatarLabel: 'M', answered: 7, total: 100, you: true },
    { nickname: 'Adrian', avatarLabel: 'A', answered: 6, total: 100, you: false },
    { nickname: 'Noa', avatarLabel: 'N', answered: 5, total: 100, you: false },
    { nickname: 'Sam', avatarLabel: 'S', answered: 4, total: 100, you: false },
  ],
}

/** Display-only question. Answering it does not enter the learning engine. */
export const FAMILY_RACE_QUESTION = {
  id: 'social-fixture-7x8',
  skillId: 'multiplication',
  conceptIds: ['multiplication.fact.7x8'],
  instanceKey: 'multiplication.fact.7x8',
  difficulty: 0.5,
  prompt: { type: 'expression' as const, expression: '7 × 8' },
  answerType: 'multiple-choice' as const,
  correctAnswer: 56,
  choices: [
    { id: '48', value: 48 },
    { id: '56', value: 56 },
    { id: '64', value: 64 },
    { id: '15', value: 15 },
  ],
}

export const FAMILY_PODIUM: PodiumFixture = {
  roomCode: '482917',
  context,
  entries: FAMILY_BOARD.filter((entry) => entry.completed),
}
