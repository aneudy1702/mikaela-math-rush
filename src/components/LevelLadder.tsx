import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'
import type { LevelDef, LevelId } from '../engine'

export interface LevelLadderProps {
  /** Only levels intended for display. The caller is responsible for excluding deferred L10. */
  levels: readonly LevelDef[]
  currentLevelId: LevelId
  unlockedLevelIds: readonly LevelId[]
  completedLevelIds: readonly LevelId[]
  onSelect: (levelId: LevelId) => void
  onParentUnlock: (levelId: LevelId) => void
}

export const PARENT_UNLOCK_HOLD_MS = 1_500

type LadderStepState = 'current' | 'completed' | 'unlocked' | 'locked'

interface LevelStepProps {
  level: LevelDef
  current: boolean
  unlocked: boolean
  completed: boolean
  onSelect: (levelId: LevelId) => void
  onParentUnlock: (levelId: LevelId) => void
}

function LevelStep({
  level,
  current,
  unlocked,
  completed,
  onSelect,
  onParentUnlock,
}: LevelStepProps) {
  const holdTimer = useRef<number | null>(null)
  const didLongPress = useRef(false)
  const available = current || unlocked || completed
  const locked = !available
  const state: LadderStepState = current
    ? 'current'
    : completed
      ? 'completed'
      : unlocked
        ? 'unlocked'
        : 'locked'

  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  useEffect(() => clearHold, [locked])

  const startHold = (event: PointerEvent<HTMLButtonElement>) => {
    if (!locked || event.button > 0 || event.isPrimary === false) return
    clearHold()
    didLongPress.current = false
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null
      didLongPress.current = true
      onParentUnlock(level.id)
    }, PARENT_UNLOCK_HOLD_MS)
  }

  const selectLevel = (event: MouseEvent<HTMLButtonElement>) => {
    if (locked || didLongPress.current) {
      event.preventDefault()
      didLongPress.current = false
      return
    }
    onSelect(level.id)
  }

  const cancelContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
    clearHold()
    event.preventDefault()
  }

  const stateCopy = current
    ? completed
      ? 'Current · Completed'
      : 'Current level'
    : completed
      ? 'Completed'
      : unlocked
        ? 'Unlocked'
        : 'Locked'

  return (
    <li className={`level-ladder-item ${state}`} data-state={state}>
      <button
        type="button"
        className={`level-step ${state}${current ? ' is-current' : ''}${completed ? ' is-completed' : ''}`}
        aria-current={current ? 'step' : undefined}
        aria-disabled={locked || undefined}
        aria-label={`Level ${level.index}, ${level.title}, ${stateCopy}`}
        data-level-id={level.id}
        data-state={state}
        data-current={current}
        data-completed={completed}
        onClick={selectLevel}
        onPointerDown={startHold}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        onContextMenu={cancelContextMenu}
      >
        <span className="level-step-number" aria-hidden="true">
          {level.index}
        </span>
        <span className="level-step-copy">
          <strong className="level-step-title">{level.title}</strong>
          <span className="level-step-state">{stateCopy}</span>
        </span>
      </button>
    </li>
  )
}

export function LevelLadder({
  levels,
  currentLevelId,
  unlockedLevelIds,
  completedLevelIds,
  onSelect,
  onParentUnlock,
}: LevelLadderProps) {
  const unlocked = new Set(unlockedLevelIds)
  const completed = new Set(completedLevelIds)

  return (
    <ol className="level-ladder" aria-label="Levels">
      {levels.map((level) => (
        <LevelStep
          key={level.id}
          level={level}
          current={level.id === currentLevelId}
          unlocked={unlocked.has(level.id)}
          completed={completed.has(level.id)}
          onSelect={onSelect}
          onParentUnlock={onParentUnlock}
        />
      ))}
    </ol>
  )
}
