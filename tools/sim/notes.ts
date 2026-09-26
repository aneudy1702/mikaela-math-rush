// Hand-written report text for the revision 4 report. Numbers quoted here come from the default seeded run
// (SIM_N=400, SIM_NPAIR=4000) and match the generated tables; update if seeds or rules change.

export const SUMMARY = [
  '- **Rev-4 is the sim default** (no provisional/confirms, V1, V4, L9 = B @ 0.85, two-stage fluency pick, later-check only after a correct reintroduce, evidence = counted draws). No contradiction or clearly broken result was found running it.',
  '- **D12 (a) exact: PASS.** 480 journeys / 27 292 sessions replayed at latency ×0.3 and ×3: identical status, counted flags, completion and record eligibility.',
  '- **D12 (b) statistical: PASS in all three patterns** with 4 000 paired seeds each. Worst |Δmean| over any level is 0.029 sessions (bound 0.25; worst paired SE 0.026), p90 identical at every level, stuck>20 differs by ≤ 0.1 pp, KS p = 1.00 / 0.93 / 0.64 (Quick / Practice / Mixed). With fluency weights forced to 1.0 the paired paths are identical, so stage 2 is the only latency channel.',
  '- **D10 marks cut experience droughts, most where they were worst:** learning typical ≥ 3-session droughts 78% → 62% (Quick), 19% → 11% (Practice), 55% → 39% (Mixed); static p = 0.90 Quick 37% → 16%. ≥ 5-session droughts barely move (learning typical Quick 13% → 11%).',
  '- **All-Quick remains the drought hotspot for learning learners even with marks:** 55–77% hit a 3-session drought (43% for the rev-3 improving model). Practice stays low (7–22%). Marks help least where true p is low (static 0.60–0.80, clustered): the window rarely gains a net correct answer.',
  '- **Headline (rev-4):** static p = 0.90 finishes L9 in 43.5 / 26 / 36.5 sessions (Quick / Practice / Mixed) with 0% stuck>20; learning typical 86 / 54 / 72 with 25% / 0% / 8% stuck>20; static p = 0.80 89 / 60 / 77 with 54% / 20% / 38% stuck>20, mostly at L9.',
  '- **Rev-4 vs rev-3 (archive):** V1 and dropping confirms make Practice much faster (learning typical 82 → 54 sessions; static 0.90 38 → 26; static 1.00 Practice now finishes L9 in 20 sessions instead of never). V4 + 0.85 shortens L9 (learning typical Quick L9 median 15 → 11). Quick is essentially unchanged.',
  '- **Academic stuck is now concentrated in L4–L5 (×3, ×4) and L8–L9 for learning slow/start75 in Quick**: 63–78% exceed 20 sessions at some level. This is the model\'s learning speed at levels whose facts start at p0 ≈ 0.55–0.65, not a rule defect; R4 (0.85/20) remains the first knob after T10.',
].join('\n')

export const GAPS = [
  '1. **D12(b) per-level mean with censoring:** D12 does not say how to average a level some learners never finish. Pairs are included when both learners reached the level; a censored level (60-session cap) counts as 60. The p90 uses the same pairs. Stuck>20 and KS use all learners (∞ as a tie).',
  '2. **D10 score for mastered facts:** DECISIONS says a mastered fact shows a distinct state instead of marks, but defines the event sum as marks + 3×mastered with marks(f) = min(3, cW) for every non-new, non-struggling fact. Implemented literally: a mastered fact contributes min(3, cW) + 3. (With "mastered contributes only 3", mastering a fact that already had 3 marks would not count as advancement.)',
  '3. **Record eligibility** uses all draw answers (counted or not), as D3 says "answers with source draw"; the evidence buffer uses counted draws only (D2).',
  '4. **Visible "moved up a status"** (experience metric, not a rule): struggling→learning, learning→mastered, new→mastered; new→learning does not count. Badges modelled as in revision 3 (First Run, Hot/On Fire in-session streaks, Perfect, Comeback, Record Breaker, 3-Day).',
  '5. **Fast-track "at least one of those sessions not inferred"** is checked as "some correct counted attempt is live"; the sim has no inferred attempts, so this never binds.',
  '6. Revision 3 interpretations that still apply: floor not applied at question 1; floor restricts the chosen pool then the other pool; over-cap carried queue items wait; L1 intro running cap; queue items carry to the next session with their remaining delay; R4/L9 fail when the evidence is shorter than the window.',
].join('\n')

export const LIMITS = [
  '- Same learner models as revision 3 (independent Bernoulli answers, fixed latency ranges, 1 session/day, always the progress level, random 70/30 mode mix, assumed learning/forgetting parameters). Learning-learner numbers are directional.',
  '- Marks are measured over the current level\'s table facts only, as D10 defines; the kid may also notice review facts moving, which the metric ignores.',
  '- Placement, drop-down, XP-per-minute and inference (D5, D5b, D6 farming check) were not re-run for revision 4; the archived revision 3 results for them are unaffected by the rev-4 changes except through faster Practice progression. `placement.ts` and `xp.ts` remain as reference implementations.',
  '- Rush was not re-simulated.',
].join('\n')
