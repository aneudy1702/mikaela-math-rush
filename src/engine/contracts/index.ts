export type {
  Answer,
  AnswerType,
  FactAttempt,
  FactRecord,
  FeedbackTier,
  MathSkill,
  PendingReinforcement,
  Question,
  QuestionPrompt,
  QuestionRequest,
  ReinforcementState,
  Result,
  SelectionBucket,
  SelectionStrategy,
  SessionConfig,
  SessionMode,
  SessionQuestionState,
  SessionSnapshot,
  SoftMissHold,
} from './types'

export {
  DEFAULT_SELECTION_STRATEGY,
  SESSION_LENGTHS,
} from './types'

export {
  RULES,
  SPEC_CONSTANTS,
  type Rules,
  type RulesShape,
  type SpecConstantsShape,
} from './rules'

export {
  CORE_MAX_FACTOR,
  MAX_FACTOR,
  MIN_FACTOR,
  canonicalFactId,
  isCanonicalFactId,
  isCoreFactId,
  parseFactId,
} from './factId'

export {
  FIRST_LEVEL_ID,
  isLevelId,
  levelIdOf,
  levelIndexOf,
  type LevelDef,
  type LevelId,
  type LevelKind,
  type SkillCurriculum,
} from './curriculum'

export type {
  AttemptSource,
  DiscardedQuestion,
  EvidenceBufferEntry,
  EvidenceWindowEntry,
  FactEvidence,
  FactStatus,
  RawAttempt,
  RawLog,
  SessionEndReason,
  SessionKind,
  SessionPause,
  SessionRecord,
  SkillProgress,
  UnlockReason,
} from './evidence'

export {
  recordKeyId,
  type PersonalRecord,
  type RecordEvaluation,
  type RecordKey,
  type SessionLogEntry,
} from './records'

export type {
  BadgeAward,
  BadgeDef,
  BadgeEarnedEvent,
  BadgeId,
  BaselineSetEvent,
  FactComebackEvent,
  FactMasteredEvent,
  LevelCompletedEvent,
  LevelUnlockedEvent,
  PlayerLevelUpEvent,
  PlayerProgress,
  ProgressionEvent,
  ProgressionEventType,
  RecordBeatenEvent,
  XpBreakdown,
  XpContext,
} from './progression'

export type {
  AdvancementResult,
  LevelCompletionChecks,
  LevelInferenceVerdict,
  MarksProgress,
  MixedLevelChecks,
  NoCompletionChecks,
  PlacementProbe,
  PlacementResult,
  SessionResultSummaryV2,
  StartLevelInference,
  StartLevelOutcome,
  TableLevelChecks,
} from './advancement'

export type {
  LearnerProfile,
  LearnerProfileV1,
  LearnerProfileV2,
  ProfileMigrationInfo,
} from './profile'
