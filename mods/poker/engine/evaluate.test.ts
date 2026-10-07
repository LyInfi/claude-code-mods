import { test, expect } from 'claude-code/testing'
import { evaluate, compare, type Card } from './evaluate'

test('a pair beats high card', async () => {
  const pair = evaluate(['As', 'Ad', '7c', '5h', '3s', '9d', 'Jc'])
  const highCard = evaluate(['Ks', 'Qd', '7c', '5h', '3s', '9d', 'Jc'])
  expect(compare(pair, highCard)).toBe(1)
  expect(compare(highCard, pair)).toBe(-1)
})

test('hand categories rank from high card up to straight flush', async () => {
  const ladder: Card[][] = [
    ['2s', '4d', '7c', '9h', 'Js', 'Kd', '3c'], // high card
    ['2s', '2d', '7c', '9h', 'Js', 'Kd', '3c'], // one pair
    ['2s', '2d', '7c', '7h', 'Js', 'Kd', '3c'], // two pair
    ['2s', '2d', '2c', '9h', 'Js', 'Kd', '4c'], // three of a kind
    ['5s', '6d', '7c', '8h', '9s', 'Kd', '2c'], // straight
    ['2h', '6h', '9h', 'Jh', 'Kh', '3d', '4c'], // flush
    ['2s', '2d', '2c', '9h', '9s', 'Kd', '4c'], // full house
    ['2s', '2d', '2c', '2h', '9s', 'Kd', '4c'], // four of a kind
    ['5h', '6h', '7h', '8h', '9h', 'Kd', '2c'], // straight flush
  ]
  for (let i = 1; i < ladder.length; i++) {
    expect(compare(evaluate(ladder[i]!), evaluate(ladder[i - 1]!))).toBe(1)
  }
})

test('within a category the higher ranks and then the kickers win', async () => {
  const wins: [Card[], Card[]][] = [
    // pair of aces with king kicker beats pair of aces with queen kicker
    [['As', 'Ad', 'Kc', '7h', '5s', '3d', '2c'], ['Ah', 'Ac', 'Qc', '7h', '5s', '3d', '2c']],
    // kings up beats queens up even with a worse kicker
    [['Ks', 'Kd', '3c', '3h', '2s', '7d', '8c'], ['Qs', 'Qd', 'Jc', 'Jh', '2s', '7d', '4c']],
    // threes full of twos beats twos full of aces
    [['3s', '3d', '3c', '2h', '2s', '7d', '8c'], ['2s', '2d', '2c', 'Ah', 'As', '7d', '8c']],
    // flushes compare card by card down to the fifth
    [['Ah', 'Jh', '9h', '6h', '4h', 'Kc', 'Qd'], ['Ah', 'Jh', '9h', '6h', '3h', 'Kc', 'Qd']],
  ]
  for (const [better, worse] of wins) {
    expect(compare(evaluate(better), evaluate(worse))).toBe(1)
  }
})

test('only the best five cards count, so equal fives tie', async () => {
  // both play A-A-K-Q-J; the 4 and the 3 are not kickers
  const a = evaluate(['As', 'Ad', 'Kc', 'Qh', 'Js', '4d', '2c'])
  const b = evaluate(['Ah', 'Ac', 'Kc', 'Qh', 'Js', '3d', '2c'])
  expect(compare(a, b)).toBe(0)
})

test('the ace plays low in a wheel, the lowest straight', async () => {
  const wheel = evaluate(['As', '2d', '3c', '4h', '5s', 'Kd', '9c'])
  const sixHigh = evaluate(['6s', '2d', '3c', '4h', '5s', 'Kd', '9c'])
  const trips = evaluate(['Ks', 'Kd', 'Kc', '4h', '5s', '2d', '9c'])
  expect(compare(wheel, trips)).toBe(1)
  expect(compare(sixHigh, wheel)).toBe(1)
})

test('two sets of trips make a full house of the higher over the lower', async () => {
  const twoTrips = evaluate(['9s', '9d', '9c', '4h', '4s', '4d', 'Ac'])
  const ninesFullOfThrees = evaluate(['9s', '9d', '9c', '3h', '3s', 'Kd', 'Ac'])
  const foursFullOfAces = evaluate(['4h', '4s', '4d', 'As', 'Ac', '2d', '7c'])
  expect(compare(twoTrips, ninesFullOfThrees)).toBe(1)
  expect(compare(twoTrips, foursFullOfAces)).toBe(1)
})
