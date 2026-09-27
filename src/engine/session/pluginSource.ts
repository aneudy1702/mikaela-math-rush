import type { PendingReinforcement } from '../contracts'
import { completionGatingIds, getLevel } from '../curriculum'
import type { QuestionSourceContext, SessionQuestionSource } from './levelSession'

/**
 * Asks the current skill plugin for the next question.
 * Evidence is keyed by the plugin's concept id. The source does not inspect which skill it is.
 */
export function createPluginQuestionSource(ctx: QuestionSourceContext): SessionQuestionSource {
  const level = getLevel(ctx.levelId, ctx.curriculum)
  const targets = completionGatingIds(level)
  let pending: PendingReinforcement[] = []

  return {
    seedPending(items) {
      pending = [...items]
      return 0
    },
    nextQuestion() {
      const question = ctx.skill.generateQuestion({
        skillId: ctx.skill.id,
        targetConcepts: targets.length > 0 ? [...targets] : undefined,
        cognitiveDifficulty: 0.5,
      })
      const factId = ctx.skill.conceptIdFor?.(question) ?? question.conceptIds[0]
      if (!factId) throw new Error(`Question ${question.id} has no evidence key`)
      return {
        question,
        pick: {
          factId,
          source: 'draw',
          pool: 'level',
          likely: false,
          carried: false,
        },
      }
    },
    recordAnswer(factId, source, correct) {
      void factId
      void source
      void correct
    },
    discardLast() {
      return false
    },
    exportPending() {
      return pending
    },
  }
}
