/** Stitch tokens. `math-rush.css` uses these same values. */

export const colors = {
  canvas: '#0B0F19',
  surface: '#111827',
  surfaceLow: '#171b26',
  ink: '#dfe2f1',
  inkMuted: '#b9cacb',
  academic: '#00F0FF',
  academicDeep: '#0066FF',
  player: '#8A2BE2',
  playerHot: '#FF007F',
  mastery: '#FFD700',
  correct: '#00FF66',
  miss: '#FF6B6B',
} as const

export const type = {
  ui: 'Outfit, system-ui, sans-serif',
  math: '"Space Grotesk", system-ui, sans-serif',
} as const

export const space = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '0.875rem',
  lg: '1.25rem',
  xl: '2rem',
  margin: '1rem',
  gutter: '0.75rem',
} as const

export const motion = {
  press: '120ms',
  reveal: '180ms',
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const
