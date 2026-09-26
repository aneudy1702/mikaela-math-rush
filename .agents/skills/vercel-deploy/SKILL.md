---
name: vercel-deploy
description: Deploy Mikaela Math Rush to Vercel (preview by default, production on request). Use when asked to deploy, ship, publish, or push the app to Vercel, or to check a Vercel deployment.
---

# Deploy to Vercel

Target: team `aneudy-abreus-projects`, project `mikaela-math-rush`
(prod URL: https://mikaela-math-rush.vercel.app).

Normal path: GitHub Actions (`.github/workflows/deploy.yml`) deploys pushes to
`main` to production and PRs to preview, using the `VERCEL_TOKEN` repo secret. To
check an Actions deploy: `gh run list --workflow deploy.yml` / `gh run view <id> --log-failed`.
Use the CLI steps below for manual deploys. Build settings live in `vercel.json`
(Vite, `npm run build`, output `dist`); don't rely on dashboard settings.

## Auth

1. If `vercel whoami` succeeds, use the existing CLI login — no token needed.
2. Otherwise, load the token from `.env` (gitignored; template in
   `.env.example`) and pass it per command:
   `set -a; source .env; set +a` then add `--token "$VERCEL_TOKEN"`.
   Never print, echo, or commit the token.
3. If neither works, ask the user to run `vercel login` or fill in `.env`.

## Steps

1. Run `npm test` and `npm run build` locally; stop and report if either fails.
2. Ensure the repo is linked (`.vercel/project.json` exists). If not:
   `vercel link --yes --project mikaela-math-rush --scope aneudy-abreus-projects`
3. Deploy:
   - Preview (default): `vercel deploy --yes --scope aneudy-abreus-projects`
   - Production (only when the user explicitly asks): add `--prod`
4. Verify: `vercel curl <deployment-url> --scope aneudy-abreus-projects` must return
   HTML that references `/assets/index-*.js`. If it references `/src/main.tsx`, the
   build was skipped — check `vercel inspect <url> --logs --scope aneudy-abreus-projects`.
5. Report the deployment URL to the user.

Always pass `--scope aneudy-abreus-projects`: the CLI's default team is a different one.
