---
name: Hyper-Arcade Speed Runner
colors:
  surface: '#0f131d'
  surface-dim: '#0f131d'
  surface-bright: '#353944'
  surface-container-lowest: '#0a0e18'
  surface-container-low: '#171b26'
  surface-container: '#1c1f2a'
  surface-container-high: '#262a35'
  surface-container-highest: '#313540'
  on-surface: '#dfe2f1'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#dfe2f1'
  inverse-on-surface: '#2c303b'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#dcb8ff'
  on-secondary: '#480081'
  secondary-container: '#7701d0'
  on-secondary-container: '#dcb7ff'
  tertiary: '#fff5de'
  on-tertiary: '#3a3000'
  tertiary-container: '#ffd700'
  on-tertiary-container: '#705d00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#efdbff'
  secondary-fixed-dim: '#dcb8ff'
  on-secondary-fixed: '#2c0051'
  on-secondary-fixed-variant: '#6700b5'
  tertiary-fixed: '#ffe16d'
  tertiary-fixed-dim: '#e9c400'
  on-tertiary-fixed: '#221b00'
  on-tertiary-fixed-variant: '#544600'
  background: '#0f131d'
  on-background: '#dfe2f1'
  surface-variant: '#313540'
typography:
  headline-xl:
    fontFamily: Outfit
    fontSize: 48px
    fontWeight: '900'
    lineHeight: 52px
  headline-xl-mobile:
    fontFamily: Outfit
    fontSize: 36px
    fontWeight: '900'
    lineHeight: 40px
  headline-lg:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 38px
  headline-lg-mobile:
    fontFamily: Outfit
    fontSize: 26px
    fontWeight: '800'
    lineHeight: 32px
  headline-md:
    fontFamily: Outfit
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
  math-display:
    fontFamily: Space Grotesk
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 60px
  math-display-mobile:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 44px
  body-lg:
    fontFamily: Outfit
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-md:
    fontFamily: Outfit
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 22px
  label-badge:
    fontFamily: Space Grotesk
    fontSize: 13px
    fontWeight: '700'
    lineHeight: 16px
  label-hud:
    fontFamily: Space Grotesk
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.875rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system drives a high-octane, futuristic arcade racing experience engineered for players aged 8 to 13. The interface channels the kinetic energy of futuristic street racing, cabinet arcade nostalgia, and hyper-responsive tactile toys. Every visual cue communicates momentum, precision, and mastery without inducing cognitive fatigue or visual clutter. 

The aesthetic fuses **Tactile / Chunky Skeuomorphism** with **Cyber-Glass Neon**. Key aesthetic pillars:
- **Kinetic Feedback:** Every interaction responds with crisp tactile depth, glowing edge-diffusions, and physical spring physics.
- **Clear Information Architecture:** Player progress (XP, cosmetics, prestige badges) is strictly styled with royal purples and radiant gold chrome, while academic core progression (math track, accuracy streaks, formula triggers) is styled in cool electric cyan and hyper-blue.
- **Friendly Resilience:** Success explodes in laser emerald brilliance, while missed answers resolve via soft, non-punitive neon coral animations that encourage immediate retry without frustration.

## Colors

The system relies on an ultra-deep obsidian space to let high-chroma neon accents project maximum luminescent energy.

### Core Roles & Palette Split
- **Canvas Base:** Obsidian `#0B0F19` anchored with deep midnight-navy `#111827` surface layers. 
- **Math Track & Speed Mechanics (Primary):** Neon Cyan `#00F0FF` paired with Electric Blue `#0066FF`. Reserved for primary game prompts, interactive formula steps, and the mathematical level track.
- **Meta-Progression & XP (Secondary):** Vivid Purple `#8A2BE2` paired with Magenta `#FF007F` and Neon Pink `#FF1493`. Signifies player profile identity, seasonal battle passes, and gear unlocks.
- **Mastery & Multipliers (Tertiary):** Radiant Gold `#FFD700`. Used strictly for mastery crowns, 3-star ratings, top-tier score streaks, and completed mastery nodes.
- **Feedback Accents:**
  - **Success / Hyper-Drive:** Laser Green `#00FF66` with high-luminosity bloom for instant correct-answer feedback.
  - **Correction / Soft Miss:** Gentle Coral `#FF6B6B`. Intentionally tuned away from alarmist deep reds to maintain psychological safety and rapid flow state.

All neon highlights feature subtle dual-stop gradients (e.g., `#00F0FF` to `#0066FF` at 135 degrees) to simulate active fiber-optic light tubes.

## Typography

Typography balances punchy arcade energy with clinical legibility at hyper-speed. 

- **Primary Typeface (Outfit):** Delivers geometric precision with soft, approachable curvature suited for pre-teens. Headings use aggressive weights (800 and 900) with slight letter-spacing contraction (`-0.02em`) for an authoritative arcade machine presence.
- **Secondary Monospace / Technical Typeface (Space Grotesk):** Drives numerical readouts, elapsed HUD timers, multipliers, and math equations. The fixed-width characteristics prevent layout jitter as numbers cycle at millisecond intervals during active runs.

## Layout & Spacing

The layout model is optimized around mobile ergonomics, placing high-frequency tactile interactive elements squarely within thumb reach while tucking read-only performance telemetry into the upper safe zone.

- **Grid Structure:** Fluid column architecture within fixed max-width constraints (430px for portrait gameplay, 840px for tablet landscape).
- **Safe Margins:** Standard canvas margin is `1rem` (16px) on mobile, preserving edge clearance for curved bezels and gesture home bars.
- **Game Arena Hierarchy:**
  - **Upper 20%:** Fixed Telemetry HUD (Timer, Streak Multiplier, Evidence Pip Module, Audio Control).
  - **Middle 35%:** Question Projection Stage & Dynamic Speed Lane visualizers.
  - **Lower 45%:** 2x2 Massive Answer Matrix, directly above device thumb anchors with minimum 12px gaps between touch targets to eradicate mis-taps.

## Elevation & Depth

Visual depth is conveyed through layered dark-glass surfaces, rim lighting, and exaggerated 3D physical bevels.

- **Background Void (Level 0):** Hex `#0B0F19` with a subtle angled cyber-grid backdrop pattern at 4% opacity.
- **Glass Consoles (Level 1):** Hex `#111827` at 80% opacity with `16px` backdrop-filter blur. Edges are framed with a 1px inner border: `rgba(255, 255, 255, 0.08)` along the top, fading to `rgba(255, 255, 255, 0.02)` at the bottom.
- **Elevated Interactive Blocks (Level 2):** Chunky 3D arcade buttons feature a physical lower bevel (4px solid drop shadow in darker matching saturation) paired with an ambient drop glow: `0 8px 24px rgba(0, 240, 255, 0.25)`.
- **Active State / Supercharge (Level 3):** Buttons compress 4px downward along the Y-axis to eliminate the bevel gap on touch, with neon box-shadows flaring outward to `0 0 28px rgba(0, 255, 102, 0.6)`.

## Shapes

The shape vocabulary employs chunky, rounded geometry tempered with high-tech racing angles.

- **Base Radius:** Roundedness level `2` (`0.5rem` to `1rem`) delivers a squishy, inviting feel that prevents visual sharpness while maintaining a streamlined silhouette.
- **Arcade Chamfers:** Badges, XP tags, and streak capsules utilize a 45-degree angled clipped-corner treatment (`clip-path: polygon(...)`) integrated with rounded profiles to evoke dashboard racing instrumentation.

## Components

### 1. 2x2 Massive Answer Buttons
- **Layout:** 2-column, 2-row thumb-accessible grid filling the bottom viewport.
- **Geometry:** Height 84px minimum, `rounded-lg` (16px), styled in dark navy-slate with an electric blue rim (`#0066FF`).
- **Physical Bevel:** A 4px solid bottom border (`#0044B3`) creates a mechanical push-switch aesthetic.
- **States:**
  - *Default:* Ambient neon inner glow, white bold numbers.
  - *Pressed:* Translates downward 4px; bottom border collapses; inner tone brightens.
  - *Correct:* Instantly swaps to Laser Green (`#00FF66`), radiant outward pulse, 3D bottom bevel turns deep green (`#00B344`).
  - *Incorrect / Soft Miss:* Subtly flashes Gentle Coral (`#FF6B6B`) with a quick horizontal 4px spring-shake, auto-revealing the correct answer in soft cyan without jarring screen-freeze.

### 2. Top HUD Telemetry
- **Elapsed Timer:** Capsule badge in semi-translucent smoke glass; countdown or elapsed digits render in Space Grotesk with a subtle pulsating cyan core.
- **Streak Multiplier (Combo Meter):** Chamfered arcade badge sporting electric magenta/purple gradients. When multiplier hits 2x, 3x, or 4x, the badge ignites with an animated cycling stroke and a mini fire graphic.
- **Audio Toggle:** Minimalist glass disc (36x36px) placed in the upper perimeter with an inner speaker icon and cyan glow indicator dot.

### 3. Evidence Tracker (3 marks + mastered)

Supersedes the exported "4-pip / step 4 mastery" wording. There is no fourth pip, and mastery is not locked.

- **Architecture:** Horizontal row of 3 elliptical pips. Mastered replaces that row with a gold star; it does not add a fourth pip.
- **States:**
  - *New (0):* `○ ○ ○` Dim gunmetal outline, deep obsidian fill.
  - *Evidence 1–3:* `● ○ ○` through `● ● ●` in Neon Cyan (`#00F0FF`). Marks can move backward.
  - *Currently mastered:* The pips give way to a Radiant Gold Star (`#FFD700`). This means the learning state is mastered now. If that state changes, the star goes away. It is not player XP.

### 4. Glowing Road / Level Nodes
- **Track Layout:** Dynamic vertical S-curve racing ladder cutting through obsidian terrain.
- **Math Track Nodes:** Circular speed gates bordered with double neon cyan tracks. Completed nodes show electric blue pathways; current node pulses rhythmically; locked nodes sit in muted low-contrast obsidian glass.
- **Player XP & Boss Milestone Badges:** Scaled larger with vivid royal purple borders, golden laurel crowns, and distinct numeral tags indicating overall player rank.

### 5. Arcade Celebration Modal
- **Frame:** Centered glassmorphic card featuring an external 2px gold-to-magenta gradient border.
- **Content:** Large animated trophy/star illustration, large Outfit-900 typography ("NEW RECORD!", "TRACK CLEARED"), score counter spinning up rapidly, and a prominent chunky "NEXT RACE" button with an active pulsing glow.