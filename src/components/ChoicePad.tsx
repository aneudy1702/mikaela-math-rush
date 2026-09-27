import { useEffect, useState, type MouseEvent } from 'react'
import { playSfx, unlockAudio } from '../audio/engine'

interface ChoicePadProps {
  choices: readonly number[]
  disabled?: boolean
  onChoose: (value: number) => void
}

function tap() {
  void unlockAudio()
  playSfx('tap')
}

function tapIfKeyboard(event: MouseEvent<HTMLButtonElement>) {
  if (event.detail === 0) tap()
}

export function ChoicePad({ choices, disabled, onChoose }: ChoicePadProps) {
  const choicesKey = choices.join(',')
  const [seenKey, setSeenKey] = useState(choicesKey)
  const [picked, setPicked] = useState(false)
  if (seenKey !== choicesKey) {
    setSeenKey(choicesKey)
    setPicked(false)
  }

  const locked = disabled || picked

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (locked || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target instanceof HTMLButtonElement) return
      const index = Number(event.key) - 1
      if (!Number.isInteger(index) || index < 0 || index >= choices.length) return
      const value = choices[index]
      if (value == null) return
      event.preventDefault()
      setPicked(true)
      tap()
      onChoose(value)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [choices, locked, onChoose])

  function choose(value: number) {
    if (locked) return
    setPicked(true)
    onChoose(value)
  }

  return (
    <div className="choice-pad" role="group" aria-label="Answer choices">
      <p className="choice-caption">Tap the answer</p>
      {choices.map((value) => (
        <button
          key={value}
          type="button"
          className="key choice"
          disabled={locked}
          aria-label={`Answer ${value}`}
          onPointerDown={locked ? undefined : tap}
          onClick={(event) => {
            tapIfKeyboard(event)
            choose(value)
          }}
        >
          {value}
        </button>
      ))}
    </div>
  )
}
