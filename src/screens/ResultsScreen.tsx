import { motion } from 'framer-motion'
import { gameAssets } from '../assets'
import { FactProgress } from '../components/FactProgress'
import {
  getBadgeDefs,
  type LevelProgressFact,
  type SessionResultSummaryV2,
} from '../engine'

interface ResultsScreenProps {
  summary: SessionResultSummaryV2
  levelTitle: string
  levelProgress: readonly LevelProgressFact[]
  persistenceWarning?: string | null
  onAgain: () => void
  onHome: () => void
}

function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatFact(factId: string): string {
  return factId.replace('x', ' × ')
}

const badgeTitles = new Map(getBadgeDefs().map((badge) => [badge.id, badge.title]))

export function ResultsScreen({
  summary,
  levelTitle,
  levelProgress,
  persistenceWarning,
  onAgain,
  onHome,
}: ResultsScreenProps) {
  const levelCompleted = summary.advancement.newlyCompleted
  const baselineSet = summary.recordVisible && summary.record.isBaseline
  const newRecord = summary.recordVisible && summary.record.isNewRecord
  const perfect = summary.drawAnswers > 0 && summary.drawCorrect === summary.drawAnswers
  const headline = levelCompleted
    ? `${summary.levelId} complete!`
    : baselineSet
      ? 'Baseline set'
      : newRecord
        ? 'New record!'
        : perfect
          ? 'Perfect run!'
          : 'Great run!'
  const masteredEvents = summary.events.flatMap((event) =>
    event.type === 'fact-mastered' ? [event] : [],
  )

  return (
    <section className={`results${levelCompleted ? ' victory' : ''}`}>
      {persistenceWarning ? (
        <div className="save-warning" role="status">
          <strong>Progress is not being saved.</strong> {persistenceWarning}
        </div>
      ) : null}

      {levelCompleted ? (
        <div className="results-hero" aria-hidden>
          <motion.img
            src={gameAssets.effects.celebrationBurst}
            alt=""
            className="results-burst"
            draggable={false}
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.95 }}
            transition={{ type: 'spring', stiffness: 150, damping: 14 }}
          />
          <motion.img
            src={gameAssets.characters.victory}
            alt=""
            className="results-victory"
            draggable={false}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
          />
        </div>
      ) : (
        <motion.img
          src={gameAssets.icons.trophy}
          alt=""
          className="results-trophy-solo"
          draggable={false}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        />
      )}

      <motion.div
        className="results-head"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <span className="results-kicker">{summary.levelId} · {levelTitle}</span>
          <h1>{headline}</h1>
          {levelCompleted && summary.advancement.unlockedLevelId ? (
            <p>{summary.advancement.unlockedLevelId} is ready to play.</p>
          ) : null}
        </div>
      </motion.div>

      <div className="results-time-card">
        <span className="stat-label">Your time</span>
        <div className="stat-value cyan xl">{formatClock(summary.elapsedMs)}</div>
        {baselineSet ? <div className="baseline-pill">A starting time for future races</div> : null}
        {newRecord && summary.record.previousBestMs != null ? (
          <div className="delta-pill">
            <img src={gameAssets.icons.lightning} alt="" className="pace-bolt" draggable={false} />
            {Math.max(0, Math.round((summary.record.previousBestMs - summary.elapsedMs) / 1000))} sec faster
          </div>
        ) : null}
      </div>

      <div className="results-grid four">
        <div className="mini-stat">
          <span className="stat-label">Correct</span>
          <div className="stat-value">{summary.correct} / {summary.answered}</div>
        </div>
        <div className="mini-stat">
          <span className="stat-label">Accuracy</span>
          <div className="stat-value">{Math.round(summary.accuracy * 100)}%</div>
        </div>
        <div className="mini-stat">
          <span className="stat-label">Longest streak</span>
          <div className="stat-value">{summary.longestStreak}</div>
        </div>
        <div className="mini-stat">
          <span className="stat-label">XP earned</span>
          <div className="stat-value hot">+{summary.xp.total}</div>
        </div>
      </div>

      <section className="result-detail-card xp-breakdown" aria-labelledby="xp-title">
        <div className="detail-card-head">
          <div>
            <span className="section-eyebrow">Player progress</span>
            <h2 id="xp-title">XP breakdown</h2>
          </div>
          <strong>{summary.xpBefore} → {summary.xpAfter} XP</strong>
        </div>
        <dl>
          <div><dt>Correct answers</dt><dd>+{summary.xp.perCorrect}</dd></div>
          <div><dt>Run bonus</dt><dd>+{summary.xp.completionBonus}</dd></div>
          {summary.xp.perfectBonus > 0 ? <div><dt>Perfect bonus</dt><dd>+{summary.xp.perfectBonus}</dd></div> : null}
          {summary.xp.factMastered > 0 ? <div><dt>Facts mastered</dt><dd>+{summary.xp.factMastered}</dd></div> : null}
          {summary.xp.levelCompleted > 0 ? <div><dt>Level complete</dt><dd>+{summary.xp.levelCompleted}</dd></div> : null}
          {summary.xp.recordBeaten > 0 ? <div><dt>Record</dt><dd>+{summary.xp.recordBeaten}</dd></div> : null}
        </dl>
        {summary.playerLevelAfter > summary.playerLevelBefore ? (
          <p className="player-level-up">Player level {summary.playerLevelAfter}!</p>
        ) : null}
      </section>

      <section className="result-detail-card marks-result" aria-labelledby="marks-title">
        <div className="detail-card-head">
          <div>
            <span className="section-eyebrow">Learning progress</span>
            <h2 id="marks-title">Fact evidence</h2>
          </div>
          <strong>{summary.marks.before} → {summary.marks.after}</strong>
        </div>
        <p>
          {summary.marks.advanced
            ? 'Your fact marks moved forward this run.'
            : 'Keep practicing—every answer adds useful evidence.'}
        </p>
        <FactProgress facts={levelProgress} compact />
      </section>

      {summary.factsMasteredThisSession.length > 0 ? (
        <section className="result-detail-card" aria-labelledby="mastered-title">
          <h2 id="mastered-title">Facts mastered this run</h2>
          <ul className="result-chip-list">
            {summary.factsMasteredThisSession.map((factId) => {
              const event = masteredEvents.find((candidate) => candidate.factId === factId)
              return (
                <li key={factId}>
                  <strong>{formatFact(factId)}</strong>
                  <span>{event?.firstTime ? 'Mastered for the first time' : 'Re-mastered'}</span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {summary.badgesEarned.length > 0 ? (
        <section className="result-detail-card badges-earned" aria-labelledby="badges-title">
          <h2 id="badges-title">Badges earned</h2>
          <ul className="result-chip-list">
            {summary.badgesEarned.map((award) => (
              <li key={`${award.badgeId}-${award.levelId ?? 'all'}`}>
                <span aria-hidden>★</span>
                <strong>{badgeTitles.get(award.badgeId) ?? award.badgeId}</strong>
                {award.levelId ? <span>{award.levelId}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="results-cta">
        <motion.button type="button" className="mode-btn mode-quick" onClick={onAgain} whileTap={{ scale: 0.98 }}>
          <span className="mode-copy"><span className="mode-title">Play again</span></span>
        </motion.button>
        <button type="button" className="secondary-btn" onClick={onHome}>Home</button>
      </div>
    </section>
  )
}
