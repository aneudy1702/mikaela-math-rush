interface KeypadProps {
  disabled?: boolean
  onDigit: (digit: string) => void
  onBackspace: () => void
  onEnter: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'Go'] as const

export function Keypad({ disabled, onDigit, onBackspace, onEnter }: KeypadProps) {
  return (
    <div className="keypad" role="group" aria-label="Number keypad">
      {KEYS.map((key) => {
        if (key === '⌫') {
          return (
            <button
              key={key}
              type="button"
              className="key action"
              disabled={disabled}
              onClick={onBackspace}
              aria-label="Backspace"
            >
              ⌫
            </button>
          )
        }
        if (key === 'Go') {
          return (
            <button
              key={key}
              type="button"
              className="key action enter"
              disabled={disabled}
              onClick={onEnter}
            >
              Go
            </button>
          )
        }
        return (
          <button
            key={key}
            type="button"
            className="key"
            disabled={disabled}
            onClick={() => onDigit(key)}
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}
