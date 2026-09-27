import type { LearnerProfile, LearnerProfileV3 } from '../../engine/contracts'
import { createEmptyProfile, createEmptySkillProgress } from '../../engine/learning/selection'

export function sessionProfile(learner: LearnerProfileV3, skillId: string): LearnerProfile {
  const shell = createEmptyProfile(learner.identity.displayName)
  return {
    ...shell,
    pendingReinforcements: learner.pendingReinforcements,
    progress: learner.skills[skillId] ?? createEmptySkillProgress(skillId),
    rawLog: {
      attempts: [...learner.rawLog.attempts],
      sessions: [...learner.rawLog.sessions],
    },
    records: { ...learner.records },
    sessionLog: [...learner.sessionLog],
    player: { ...learner.player },
    gameXp: learner.player.xp,
  }
}

export function writeSessionBack(
  learner: LearnerProfileV3,
  skillId: string,
  profile: LearnerProfile,
): LearnerProfileV3 {
  return {
    ...learner,
    pendingReinforcements: profile.pendingReinforcements,
    skills: { ...learner.skills, [skillId]: profile.progress },
    rawLog: profile.rawLog,
    records: profile.records,
    sessionLog: profile.sessionLog,
    player: profile.player,
  }
}
