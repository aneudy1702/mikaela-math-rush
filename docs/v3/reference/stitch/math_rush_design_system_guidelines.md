# Math Rush Design System & Component Matrix
## Hyper-Arcade Speed Runner Evolution

### 1. Brand Hierarchy & Philosophy
- **Product Name**: `Math Rush` (Never "Mikaela Math Rush").
- **Learner Profile**: Personalized contextually ("Hi, Mikaela!", avatar selector, independent player rank).
- **Core Emotional Hook**: *"I want to try one more round and beat my score."*
- **Aesthetic**: Cyber-arcade neon racing, deep obsidian `#0a0e17`, electric cyan `#00f0ff`, neon purple/magenta `#d946ef`, mastery gold `#fbbf24`, laser green `#10b981`, soft coral miss `#f43f5e`.

---

### 2. Three-Tier Visual Intensity System

#### Tier 1: Quiet UI (Background / Secondary)
- **Use Cases**: Secondary navigation, metadata headers, settings, historical stats, room details, quiet badges, locked tracks.
- **Styling**: Subtle borders `border-white/10`, dark translucent surfaces `bg-[#131927]/60`, muted text `text-slate-400`, zero or ultra-soft drop-shadows, zero blur bleed.
- **Goal**: Never compete with active math problem solving.

#### Tier 2: Active Game UI (Focused / High-Readability)
- **Use Cases**: Math problem stage (`7 × 8 = ?`), 2×2 answer choices, session elapsed timer, streak counter, active progress bar.
- **Styling**: Deep obsidian cards `bg-[#131a2a]`, crisp high-contrast white text `text-white text-3xl font-extrabold`, tactile 3D bevels `border-b-4 border-slate-700/80 active:translate-y-1 active:border-b-0`, electric cyan glow focus `shadow-[0_0_15px_rgba(0,240,255,0.25)]`.
- **Golden Rule**: Math problem is legible from 10 feet away in 0.5s.

#### Tier 3: Celebration UI (High-Voltage Reward Moments)
- **Use Cases**: Currently-mastered gold state (separate from evidence pips), Level Complete, New Record, 10+ Streak, 1st Place Podium.
- **Styling**: Prismatic neon gradients `bg-gradient-to-r from-amber-400 via-pink-500 to-cyan-400`, pulsating gold glows `shadow-[0_0_35px_rgba(251,191,36,0.6)]`, particle bursts, celebratory animated badges.

---

### 3. Evidence Pip Protocol (canonical V3 rule)

The exported Stitch text said "0–4 engine values" and "mastery is locked." That wording is superseded. Learning rules win over the mock.

```text
○ ○ ○   New
● ○ ○   Evidence 1
● ● ○   Evidence 2
● ● ●   Evidence 3
★       Mastered
```

- There is no fourth evidence pip. `● ● ● ●` is not mastery.
- Cyan pips are evidence marks (0–3). They can move backward.
- The gold star means **currently mastered**. It is a separate status, not pip 4, and it is not permanent. If the learning state leaves mastered, the gold state leaves with it.
- Gold mastery is distinct from player XP.

---

### 4. Multi-Skill Answer Architecture (Universal 2×2 Matrix)
- **Multiplication / Division**: Massive numeric display (`32`, `8`).
- **Fractions**: Dedicated stacked fraction component (`numerator` over `divider` over `denominator`) with uniform height and oversized legible typography.
- **Algebra**: Monospaced equation roots (`x = 5`, `x = 7`).
- **Visual / Geometry**: High-contrast SVG/Canvas diagrams (e.g. grid shapes, irregular polygons with 24 sq units) rendered crisply inside 2×2 thumb cards.
