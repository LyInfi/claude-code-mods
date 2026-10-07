import type { Card, Rank, Suit } from '../types'
export type { Card, Rank, Suit }

export const Category = {
  HighCard: 0,
  OnePair: 1,
  TwoPair: 2,
  ThreeOfAKind: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  FourOfAKind: 7,
  StraightFlush: 8,
} as const
export type Category = (typeof Category)[keyof typeof Category]

/** `ranks` are the five cards' tiebreak ranks, most significant first (2 = 0 … A = 12). */
export type HandValue = { category: Category; ranks: number[] }

const RANKS = '23456789TJQKA'
const rankOf = (c: Card) => RANKS.indexOf(c.charAt(0))

/** Highest rank topping a five-card run in `ranks`, the ace also playing low; -1 if none. */
function straightHigh(ranks: number[]): number {
  const present = new Set(ranks)
  if (present.has(12)) present.add(-1)
  for (let top = 12; top >= 3; top--) {
    let run = true
    for (let r = top; r > top - 5; r--) if (!present.has(r)) run = false
    if (run) return top
  }
  return -1
}

export function evaluate(cards: Card[]): HandValue {
  const bySuit = new Map<string, number[]>()
  const counts = new Map<number, number>()
  for (const c of cards) {
    const r = rankOf(c)
    counts.set(r, (counts.get(r) ?? 0) + 1)
    bySuit.set(c.charAt(1), [...(bySuit.get(c.charAt(1)) ?? []), r])
  }
  const flush = [...bySuit.values()].find((rs) => rs.length >= 5)?.sort((a, b) => b - a)
  const flushStraight = flush ? straightHigh(flush) : -1
  if (flushStraight >= 0) return { category: Category.StraightFlush, ranks: [flushStraight] }

  // ranks grouped by multiplicity, bigger groups first, then higher ranks
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const first = groups[0]!
  const second = groups[1]
  const kickers = (exclude: number[], n: number) =>
    [...counts.keys()].filter((r) => !exclude.includes(r)).sort((a, b) => b - a).slice(0, n)

  if (first[1] === 4) return { category: Category.FourOfAKind, ranks: [first[0], ...kickers([first[0]], 1)] }
  if (first[1] === 3 && (second?.[1] ?? 0) >= 2) {
    // a second set of trips plays as the pair; take the best pair among the rest
    const pair = Math.max(...groups.slice(1).filter(([, n]) => n >= 2).map(([r]) => r))
    return { category: Category.FullHouse, ranks: [first[0], pair] }
  }
  if (flush) return { category: Category.Flush, ranks: flush.slice(0, 5) }
  const straight = straightHigh([...counts.keys()])
  if (straight >= 0) return { category: Category.Straight, ranks: [straight] }
  if (first[1] === 3) return { category: Category.ThreeOfAKind, ranks: [first[0], ...kickers([first[0]], 2)] }
  if (first[1] === 2 && second?.[1] === 2) {
    const pairs = [first[0], second[0]]
    return { category: Category.TwoPair, ranks: [...pairs, ...kickers(pairs, 1)] }
  }
  if (first[1] === 2) return { category: Category.OnePair, ranks: [first[0], ...kickers([first[0]], 3)] }
  return { category: Category.HighCard, ranks: kickers([], 5) }
}

export function compare(a: HandValue, b: HandValue): -1 | 0 | 1 {
  if (a.category !== b.category) return a.category > b.category ? 1 : -1
  for (let i = 0; i < a.ranks.length; i++) {
    if (a.ranks[i] !== b.ranks[i]) return a.ranks[i]! > b.ranks[i]! ? 1 : -1
  }
  return 0
}
