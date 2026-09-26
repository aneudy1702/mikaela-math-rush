# Mikaela Math Rush

Phone-friendly multiplication fluency arcade for Mikaela. Dark neon sporty UI, adaptive fact-level mastery, soft misses with spaced reinforcement, and beat-your-best-time pacing.

## Stack

Vite + React + TypeScript · Framer Motion · sample SFX + loop music · PWA (Add to Home Screen) · localStorage learner profile · Heroku

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
| `npm start` | Serve `dist` (used on Heroku) |

## Deploy (Heroku)

GitHub Actions deploys `main` to Heroku. Add this repo secret:

| Secret | Value |
| --- | --- |
| `HEROKU_API_KEY` | Account → Account settings → API Key |

Optional: `HEROKU_APP_NAME` (defaults to `mikaela-math-rush`). The workflow creates the app on first deploy if it does not exist.

```bash
# One-time local deploy (optional)
heroku create mikaela-math-rush
heroku buildpacks:set heroku/nodejs
git push heroku main
```

Live URL once deployed: `https://mikaela-math-rush.herokuapp.com`

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
