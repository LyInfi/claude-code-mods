import { compare, evaluate, type Card } from '../engine/evaluate'
import { shuffle, type Rng } from '../engine/table'

/**
 * The share of the pot `hole` wins against `opponents` random hands, by
 * playing the rest of the board out `iterations` times. A tie counts as the
 * share of the pot it splits.
 */
export function equity(hole: Card[], board: Card[], opponents: number, iterations: number, rng: Rng): number {
  const known = new Set<Card>([...hole, ...board])
  const rest = shuffle(rng).filter((c) => !known.has(c))
  let won = 0
  for (let i = 0; i < iterations; i++) {
    // a partial shuffle: only the cards this run deals are drawn
    const need = opponents * 2 + (5 - board.length)
    for (let k = 0; k < need; k++) {
      const j = k + Math.floor(rng() * (rest.length - k))
      ;[rest[k], rest[j]] = [rest[j]!, rest[k]!]
    }
    const runout = [...board, ...rest.slice(opponents * 2, need)]
    const mine = evaluate([...hole, ...runout])
    let ties = 1
    let lost = false
    for (let o = 0; o < opponents && !lost; o++) {
      const theirs = evaluate([rest[o * 2]!, rest[o * 2 + 1]!, ...runout])
      const c = compare(mine, theirs)
      if (c < 0) lost = true
      else if (c === 0) ties++
    }
    if (!lost) won += 1 / ties
  }
  return won / iterations
}
