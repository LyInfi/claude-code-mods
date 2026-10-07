import { test, expect } from 'claude-code/testing'
import { leave, newProfile, recover, sitDown, step, topUp, needsTopUp, presets } from './game'
import type { Game } from '../types'
import type { Rng } from './table'

const seeded = (seed = 1): Rng => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
const fresh = (): Game => ({ table: null, profile: newProfile(), log: [] })

test('sitting down moves one buy-in from the bankroll to the table and deals a hand', async () => {
  const g = sitDown(fresh(), 6, seeded())
  expect(g.profile.bankroll).toBe(9000)
  expect(g.profile.seated).toBe(1000)
  expect(g.table?.hand?.toAct).not.toBe(null)
})

test('a settled hand is booked into the profile and leaving returns the stack', async () => {
  let g = sitDown(fresh(), 6, seeded())
  while (g.table!.hand!.result === null) g = step(g, { type: 'fold' })
  const stack = g.table!.seats[0]!.stack
  expect(g.profile.hands).toBe(1)
  expect(g.profile.net).toBe(stack - 1000)
  expect(g.profile.seated).toBe(stack)
  expect(g.log.at(-1)?.kind).toBe('pot')

  g = leave(g)
  expect(g.table).toBe(null)
  expect(g.profile.bankroll).toBe(9000 + stack)
  expect(g.profile.seated).toBe(0)
})

test('chips left seated by a session that ended abruptly come back to the bankroll', async () => {
  const p = recover({ ...newProfile(), bankroll: 4000, seated: 850 })
  expect(p.bankroll).toBe(4850)
  expect(p.seated).toBe(0)
  expect(recover(undefined)).toEqual(newProfile())
})

test('a top-up refills the bankroll only when short of a buy-in, and is counted', async () => {
  const rich = fresh()
  expect(needsTopUp(rich)).toBe(false)
  expect(topUp(rich)).toBe(rich)
  const broke: Game = { ...rich, profile: { ...rich.profile, bankroll: 300 } }
  expect(topUp(broke).profile).toMatchObject({ bankroll: 10000, topUps: 1 })
})

test('raise presets stay within the legal range', async () => {
  const g = sitDown(fresh(), 6, seeded())
  const hand = g.table!.hand!
  for (const p of presets(hand)) {
    expect(p.to).toBeGreaterThanOrEqual(20)
    expect(p.to).toBeLessThanOrEqual(1000)
  }
})

test('the log keeps the whole hand: the blinds, every action, each street turned and the pots', async () => {
  let g = sitDown(fresh(), 6, seeded(4))
  expect(g.log.slice(0, 2).map((e) => e.kind === 'blind' && e.blind)).toEqual(['SB', 'BB'])
  // everyone calls or checks down to the showdown
  while (g.table!.hand!.result === null) {
    const hand = g.table!.hand!
    const owed = hand.currentBet - hand.seats[hand.toAct!]!.bet
    g = step(g, owed > 0 ? { type: 'call' } : { type: 'check' })
  }
  const kinds = g.log.map((e) => (e.kind === 'street' ? e.street : e.kind))
  expect(kinds.filter((k) => k === 'action').length).toBeGreaterThan(20)
  expect(kinds.filter((k) => k === 'flop' || k === 'turn' || k === 'river')).toEqual(['flop', 'turn', 'river'])
  expect(kinds.at(-1)).toBe('pot')
})

test('an all-in runout still logs each street it turns', async () => {
  let g = sitDown(fresh(), 6, seeded(6))
  while (g.table!.hand!.result === null) g = step(g, { type: 'allIn' })
  const streets = g.log.flatMap((e) => (e.kind === 'street' ? [e.street] : []))
  expect(streets).toEqual(['flop', 'turn', 'river'])
})

test('sitting down remembers the Table Size chosen', async () => {
  const g = sitDown(fresh(), 9, seeded())
  expect(g.table?.seats.length).toBe(9)
  expect(g.profile.tableSize).toBe(9)
})
