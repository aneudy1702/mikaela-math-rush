# Mikaela Math Rush

Phone-friendly multiplication fluency arcade for Mikaela. Dark neon sporty UI, adaptive fact-level mastery, soft misses with spaced reinforcement, and beat-your-best-time pacing.

## Stack

Vite + React + TypeScript · Framer Motion · Web Audio SFX · PWA (Add to Home Screen) · localStorage learner profile

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port **43127** |
| `npm test` | Vitest unit tests (engine) |
| `npm run build` | Production build |

## Play (V1)

- First launch: **Placement Run** seeds fact-level mastery
- **Quick 10 / Practice 25 / Rush 100**
- Soft miss → type the correct product to continue (timer paused)
- Streak milestones + new-record celebration art
- Profile + best times persist in `localStorage`
- Installable as a PWA (“Add to Home Screen”)

## Art

Decorative assets live under `src/assets/` (characters, icons, effects). Gameplay numbers and buttons stay React/CSS — see `src/assets/index.ts`.

## Architecture

```text
Game Shell → Session Engine → Question Orchestrator ⇄ Learning Engine + Content Plugins → Learner Profile
```
