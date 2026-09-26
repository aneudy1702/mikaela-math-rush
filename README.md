# Mikaela Math Rush

Phone-friendly multiplication fluency arcade for Mikaela. Dark neon sporty UI, adaptive fact-level mastery, soft misses with spaced reinforcement, and beat-your-best-time pacing.

## Stack

Vite + React + TypeScript · Framer Motion · sample SFX + loop music · PWA (Add to Home Screen) · localStorage learner profile · Vercel

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

## Deploy (Vercel)

GitHub Actions (`.github/workflows/deploy.yml`) runs tests, then deploys to Vercel project `mikaela-math-rush`:

- push to `main` → production: https://mikaela-math-rush.vercel.app
- pull request → preview deployment

Required repo secret:

| Secret | Value |
| --- | --- |
| `VERCEL_TOKEN` | https://vercel.com/account/tokens (scope: aneudy-abreus-projects) |

Build settings live in `vercel.json`. Manual deploy: `vercel deploy --scope aneudy-abreus-projects` (add `--prod` for production).

## Play (V1)

- First launch: **Placement Run** seeds fact-level mastery
- **Quick 10 / Practice 25 / Rush 100**
- Soft miss → type the correct product to continue (timer paused)
- Streak milestones + new-record celebration art
- Profile + best times persist in `localStorage`
- Installable as a PWA (“Add to Home Screen”)

## Art

Decorative assets live under `src/assets/` (characters, icons, effects). Gameplay numbers and buttons stay React/CSS — see `src/assets/index.ts`.

## Audio

Sample SFX + rush loop live in `public/audio/`. `src/audio/AudioManager.ts` owns mute (persisted), music intensity, and event cues. Licenses/provenance: `src/assets/audio/AUDIO_LICENSES.md` (music is CC-BY 3.0 — credit Trinnox / OpenGameArt).

## Architecture

```text
Game Shell → Session Engine → Question Orchestrator ⇄ Learning Engine + Content Plugins → Learner Profile
```
