# Math Rush V3 — Design System

Status: **DRAFT.** Visual direction is settled. Component extraction is the work. Screen-by-screen HTML from Stitch is a reference, not the implementation.

---

## Source of truth

The Stitch export in [`docs/v3/reference/stitch/`](reference/stitch/) is the visual source of truth for V3. Decision O3 is closed.

Read these two files first:

- [`math_rush_design_system_guidelines.md`](reference/stitch/math_rush_design_system_guidelines.md) — brand, three intensity tiers, pips, 2×2 answers
- [`hyper_arcade_speed_runner/DESIGN.md`](reference/stitch/hyper_arcade_speed_runner/DESIGN.md) — tokens: color, type, spacing, components

Each screen folder has `code.html` and, when the export included one, `screen.png`. Agents read those for look and layout. They do not paste the HTML into `src/`.

V2 CSS and the current "Mikaela" wordmark are the baseline to replace, not the system to extend.

The product name inside the export is already **Math Rush**. Learner names stay on the profile ("Hi, Mikaela").

---

## Direction to preserve

Taken from the export, not re-invented:

| Role | Color | Use |
|---|---|---|
| Canvas | Obsidian `#0B0F19`, surfaces around `#111827` / `#0a0e17` | Every screen |
| Academic | Cyan `#00F0FF`, electric blue `#0066FF` | Questions, level track, evidence pips |
| Player progression | Purple `#8A2BE2`, magenta `#d946ef` / `#FF007F` | XP, player level, identity |
| Mastery | Gold `#FFD700` / `#fbbf24` | Mastered state, records, completed nodes |
| Correct | Laser green `#00FF66` / `#10b981` | Positive feedback |
| Miss | Coral `#FF6B6B` / `#f43f5e` | A soft correction, not an alarm |

Type: **Outfit** for UI, **Space Grotesk** for math and HUD numbers, so digits do not jitter.

Intensity has three tiers, and gameplay stays in the middle one:

1. **Quiet** — nav, metadata, locked skills, history. Low contrast, no glow.
2. **Active** — the question and the 2×2 answers. Legible immediately. Chunky press states.
3. **Celebration** — level complete, new record, mastered. Gold and particles. Never during the question.

The default answer layout is a **2×2 grid** of large buttons (about 84px tall on a phone): plain numbers, stacked fractions, `x = …`, or a visual tile. Multiplication, Division, Fractions, and Algebra share that grid.

Academic progress and game progression stay visually distinct, matching the engine split: learning is not XP.

---

## How it is built

```text
Design tokens
    → reusable primitives
    → game components
    → screens
```

Target layout:

```text
src/ui/
├── tokens/
│   ├── colors.ts
│   ├── typography.ts
│   ├── spacing.ts
│   └── motion.ts
├── primitives/
│   ├── ArcadeCard
│   ├── GlowButton
│   ├── ProgressBar
│   ├── EvidencePips
│   └── Avatar
├── game/
│   ├── AnswerChoice
│   ├── QuestionCard
│   ├── GameHUD
│   ├── LevelNode
│   ├── XpBar
│   └── BadgeTile
└── screens/
```

Tokens are the only place a hex value or a motion duration is introduced. Primitives have no learning logic. Game components display engine output; they do not compute mastery, XP, or the next question. Screens compose those pieces.

Evidence pips render engine marks. They do not compute them.

```text
○ ○ ○   New
● ○ ○   Evidence 1
● ● ○   Evidence 2
● ● ●   Evidence 3
★       Mastered
```

Three cyan marks, then a separate gold state. There is no fourth pip. Gold means **currently mastered**. It can leave if the learning state leaves mastered. It is not a lock, and it is not XP.

---

## Screens in the export

| Folder | What it is for V3 | Screenshot |
|---|---|---|
| `math_rush_multi_skill_hub` | **Home.** Skill hub, greeting, grade, continue path. This is the home to build. | Real |
| `home_hub`, `mikaela_math_rush` | Earlier multiplication-only hubs. Reference for HUD chrome only. | Empty |
| `live_race_stage` | **Play** for a fact skill: question, 2×2 choices, timer, evidence. | Real |
| `gameplay_fractions_compare` | **Play** for fractions. Same shell, fraction choices. | Real |
| `gameplay_linear_algebra` | **Play** for the one-step equations proof. The folder name is broader than the skill. | Real |
| `gameplay_geometry_area` | Visual-choice reference. Geometry is not a V3 skill. | Real |
| `level_journey_map` | Per-skill progress ladder. | Empty |
| `fact_mastery_matrix` | Concept evidence inside a level. | Empty |
| `arcade_leaderboards` | Mock leaderboard. [SOCIAL_FUTURE.md](SOCIAL_FUTURE.md). | Empty |
| `private_race_lobby` | Mock race lobby. | Empty |
| `multiplayer_live_race` | Mock live race. | Empty |
| `race_podium_results` | Mock podium. Also the tone for session results: accuracy before speed. | Empty |
| `math_rush_logo` | Logo lockup. | Real |

Empty means the PNG in the export is a 28-byte placeholder. Use `code.html` for those screens.

Home is the screen that makes V3 feel like a different product: several skills, one recommended path, the rest available or marked coming later.

The miss state is a coral correction, in the same spirit as the V2 reveal card: the mistake is visible, and the child is not punished with a timer trick.

---

## Where the export does not override V2

Stitch decides look. [docs/v2/DECISIONS.md](../v2/DECISIONS.md) decides learning and XP. The design track adapts the picture when they disagree.

| Export | V3 rule |
|---|---|
| Some screen HTML still draws four pips or a "locked" star. | Superseded. The canonical drawing is 0–3 cyan marks plus a separate gold mastered state. `math_rush_design_system_guidelines.md` and `hyper_arcade_speed_runner/DESIGN.md` are corrected to that rule. Do not copy a fourth pip out of the HTML. |
| Play screens show streak XP multipliers (`x1.5`, `4×`). | Streak may be visible. XP stays on the V2 formula. A multiplier label needs an owner decision; it is not implied by the mock. |
| Design prose mentions battle passes, cosmetics, and leagues. | Purple means player level, XP, and badges. Those extra systems are not in V3. |
| A geometry arena is in the export. | Use it to design visual choice. Do not build a geometry skill. |

---

## What "done" means for the design track

- A new screen can be assembled from tokens and components without a new palette.
- Multiplication, Division, Fractions, and Algebra share `QuestionCard`, `AnswerChoice`, and `GameHUD`.
- Celebration, progress, and miss states are components with stories or fixtures, not one-off CSS inside a screen.
- Reduced motion is respected for the neon and celebration motion.

The design track owns no curriculum, no mastery math, and no persistence.
