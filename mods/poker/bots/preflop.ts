import type { Card } from '../engine/evaluate'

const RANKS = '23456789TJQKA'
const rank = (c: Card) => RANKS.indexOf(c.charAt(0))

/** Bill Chen's starting-hand score: the high card, doubled for a pair, plus suitedness, less the gap. */
function chen(high: number, low: number, suited: boolean): number {
  const points = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10]
  if (high === low) return Math.max(5, points[high]! * 2)
  let score = points[high]! + (suited ? 2 : 0)
  const gap = high - low - 1
  score -= [0, 1, 2, 4][gap] ?? 5
  if (gap <= 1 && high < RANKS.indexOf('Q')) score += 1
  return Math.ceil(score)
}

/** The 169 starting hands, strongest first, each with where its combos end, as a percent of all 1326. */
const LADDER: { key: string; upTo: number }[] = (() => {
  const hands: { key: string; score: number; high: number; low: number; combos: number }[] = []
  for (let high = 0; high < 13; high++) {
    for (let low = 0; low <= high; low++) {
      if (high === low) hands.push({ key: `${high}-${low}p`, score: chen(high, low, false), high, low, combos: 6 })
      else {
        hands.push({ key: `${high}-${low}s`, score: chen(high, low, true), high, low, combos: 4 })
        hands.push({ key: `${high}-${low}o`, score: chen(high, low, false), high, low, combos: 12 })
      }
    }
  }
  hands.sort((a, b) => b.score - a.score || b.high - a.high || b.low - a.low)
  let total = 0
  return hands.map((h) => ({ key: h.key, upTo: ((total += h.combos) / 1326) * 100 }))
})()

const UP_TO = new Map(LADDER.map((h) => [h.key, h.upTo]))

function keyOf(hole: Card[]): string {
  const [a, b] = [rank(hole[0]!), rank(hole[1]!)].sort((x, y) => y - x) as [number, number]
  if (a === b) return `${a}-${b}p`
  return `${a}-${b}${hole[0]!.charAt(1) === hole[1]!.charAt(1) ? 's' : 'o'}`
}

/** Where a starting hand ranks, as the percent of all hands at least as strong (pocket aces about 0.5). */
export const percentile = (hole: Card[]) => UP_TO.get(keyOf(hole))!

/** Whether a starting hand is among the strongest `percent` of all starting hands. */
export const inTopPercent = (hole: Card[], percent: number) => percentile(hole) <= percent + 1e-9
