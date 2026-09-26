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

export function Keypad({ disabled, onDigit, onBackspace, onEnter }: KeypadProps) {
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
              onClick={() => {
                tap()
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
              onClick={() => {
                tap()
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
            onClick={() => {
              tap()
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
