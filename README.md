# Mikaela Math Rush

Phone-friendly multiplication fluency game for Mikaela. Adaptive fact-level mastery, soft misses with spaced reinforcement, and subtle-by-default feedback.

## Stack

Vite + React + TypeScript · Framer Motion · localStorage learner profile

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

## Architecture

```text
Game Shell → Session Engine → Question Orchestrator ⇄ Learning Engine + Content Plugins → Learner Profile
```

Framework-independent engine code lives under `src/engine/`. V1 content plugin: multiplication facts.

## Play (V1 slice)

- **Quick Play (10)** and **Practice (25)** from Home
- Numeric keypad, soft miss reveal, streak milestones
- Mastery + profile persist in `localStorage`
