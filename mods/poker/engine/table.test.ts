import { test, expect } from 'claude-code/testing'
import { act, createTable, dealNext, rebuy, shuffle, TABLE_SIZES, type Rng } from './table'

/** A repeatable source of numbers for shuffling and seating. */
const seeded = (seed = 1): Rng => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

test('a new table seats the Player in seat 0 and five bots with a 100 big blind buy-in', async () => {
  const t = createTable(1000, seeded())
  expect(t.seats[0]).toEqual({ kind: 'player', stack: 1000 })
  expect(t.seats.slice(1).every((o) => o?.kind === 'bot' && o.stack === 1000)).toBe(true)
  expect(new Set(t.seats.slice(1).map((o) => (o?.kind === 'bot' ? o.name : ''))).size).toBe(5)
})

test('the button moves one seat each hand and the stacks carry over', async () => {
  const rng = seeded()
  let t = dealNext(createTable(1000, rng), rng)
  const firstButton = t.button
  while (t.hand?.result === null) t = act(t, { type: 'fold' })
  const total = t.seats.reduce((sum, o) => sum + (o?.stack ?? 0), 0)
  expect(total).toBe(6000)
  t = dealNext(t, rng)
  expect(t.button).toBe((firstButton + 1) % 6)
})

test('a busted bot is replaced by a fresh one with a new name', async () => {
  const rng = seeded(7)
  let t = createTable(1000, rng)
  const busted = t.seats[3]!
  t = { ...t, seats: t.seats.map((o, i) => (o && i === 3 ? { ...o, stack: 0 } : o)) }
  t = dealNext(t, rng)
  const replacement = t.seats[3]!
  expect(replacement.kind).toBe('bot')
  expect(replacement.kind === 'bot' && busted.kind === 'bot' && replacement.name !== busted.name).toBe(true)
  expect(t.hand?.seats[3]?.committed !== undefined).toBe(true)
})

test('the Player cannot be dealt in with no chips until a rebuy', async () => {
  const rng = seeded()
  let t = createTable(1000, rng)
  t = { ...t, seats: t.seats.map((o, i) => (o && i === 0 ? { ...o, stack: 0 } : o)) }
  expect(() => dealNext(t, rng)).toThrow()
  t = rebuy(t, 1000)
  expect(t.seats[0]?.stack).toBe(1000)
  expect(() => dealNext(t, rng)).not.toThrow()
})

test('a shuffled deck holds all 52 cards once', async () => {
  const deck = shuffle(seeded(3))
  expect(deck.length).toBe(52)
  expect(new Set(deck).size).toBe(52)
})

test("a table has as many Seats as its Table Size, a bot in each but the Player's", async () => {
  for (const size of TABLE_SIZES) {
    const rng = seeded(size)
    let t = createTable(1000, rng, { smallBlind: 5, bigBlind: 10 }, size)
    expect(t.seats.length).toBe(size)
    expect(t.seats.filter((o) => o?.kind === 'bot').length).toBe(size - 1)
    t = dealNext(t, rng)
    expect(t.hand?.seats.length).toBe(size)
    while (t.hand?.result === null) t = act(t, { type: 'fold' })
    expect(t.seats.reduce((sum, o) => sum + (o?.stack ?? 0), 0)).toBe(1000 * size)
  }
})
