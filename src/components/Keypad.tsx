import { useEffect, type MouseEvent } from 'react'
import { playSfx, unlockAudio } from '../audio/engine'

interface KeypadProps {
  disabled?: boolean
  onDigit: (digit: string) => void
  onBackspace: () => void
  onEnter: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'] as const

function tap() {
  void unlockAudio()
  playSfx('tap')
}

// Sound fires on pointerdown so it lands with the finger; keyboard
// activation has no pointerdown, so click still needs to sound.
function tapIfKeyboard(e: MouseEvent<HTMLButtonElement>) {
  if (e.detail === 0) tap()
}

export function Keypad({ disabled, onDigit, onBackspace, onEnter }: KeypadProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (disabled || event.metaKey || event.ctrlKey || event.altKey) return

      // Focused keypad buttons already have native keyboard activation. Skipping them
      // prevents Enter/Space from submitting twice.
      if (event.target instanceof HTMLButtonElement) return

      if (/^\d$/.test(event.key)) {
        event.preventDefault()
        tap()
        onDigit(event.key)
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        tap()
        onBackspace()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        tap()
        onEnter()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [disabled, onBackspace, onDigit, onEnter])

  return (
    <div className="keypad" role="group" aria-label="Number keypad">
      {KEYS.map((key) => {
        if (key === '⌫') {
          return (
            <button
              key={key}
              type="button"
              className="key action back"
              disabled={disabled}
              onPointerDown={tap}
              onClick={(e) => {
                tapIfKeyboard(e)
                onBackspace()
              }}
              aria-label="Backspace"
            >
              ⌫
            </button>
          )
        }
        if (key === '✓') {
          return (
            <button
              key={key}
              type="button"
              className="key action enter"
              disabled={disabled}
              onPointerDown={tap}
              onClick={(e) => {
                tapIfKeyboard(e)
                onEnter()
              }}
              aria-label="Submit"
            >
              ✓
            </button>
          )
        }
        return (
          <button
            key={key}
            type="button"
            className="key"
            disabled={disabled}
            onPointerDown={tap}
            onClick={(e) => {
              tapIfKeyboard(e)
              onDigit(key)
            }}
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}
