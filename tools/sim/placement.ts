// D5 placement staircase: probe L1 → L3 → L5 → L7 → L8 while passing; back-probe a jumped k−1 on the first fail.
import type { Rules } from './rules.ts'
import { getLevel, product } from './curriculum.ts'
import type { Learner } from './learners.ts'

export interface PlacementResult {
  start: number
  questions: number
  capped: boolean
  probes: { level: number; pass: boolean }[]
}

const STAIRS = [1, 3, 5, 7, 8]

export function runPlacement(learner: Learner, r: Rules, rng: () => number): PlacementResult {
  let questions = 0
  const probes: { level: number; pass: boolean }[] = []
  const probed = new Set<number>()
  let highestPassed = 0

  // 'cap' when the question budget ran out before the probe was decided.
  const ask = (f: string): boolean | 'cap' => {
    if (questions >= r.placementMaxQuestions) return 'cap'
    questions++
    return rng() < learner.p(f)
  }
  const probe = (k: number): boolean | 'cap' => {
    probed.add(k)
    const G = getLevel(k).gatingFactIds
    const hardest = G.reduce((a, b) => (product(b) > product(a) ? b : a))
    const others = G.filter((f) => f !== hardest)
    const pickOther = (exclude: string[]): string => {
      const c = others.filter((f) => !exclude.includes(f))
      return c[Math.floor(rng() * c.length)]!
    }
    const second = pickOther([])
    const a1 = ask(hardest)
    if (a1 === 'cap') return 'cap'
    const a2 = ask(second)
    if (a2 === 'cap') return 'cap'
    let res: boolean
    if (a1 && a2) res = true
    else if (!a1 && !a2) res = false
    else {
      const t = ask(pickOther([second]))
      if (t === 'cap') return 'cap'
      res = t
    }
    probes.push({ level: k, pass: res })
    return res
  }
  // Cap: start = lowest level not yet passed; jumped levels below a passed probe count as passed (see spec gaps).
  const capped = (): PlacementResult => ({ start: highestPassed + 1, questions, capped: true, probes })

  for (const k of STAIRS) {
    const res = probe(k)
    if (res === 'cap') return capped()
    if (res) {
      highestPassed = k
      if (k === 8) return { start: 9, questions, capped: false, probes }
      continue
    }
    if (k === 1) return { start: 1, questions, capped: false, probes }
    if (!probed.has(k - 1)) {
      const back = probe(k - 1)
      if (back === 'cap') return capped()
      return { start: back ? k : k - 1, questions, capped: false, probes }
    }
    return { start: k, questions, capped: false, probes }
  }
  throw new Error('unreachable')
}
