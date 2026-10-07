import { test, expect } from 'claude-code/testing'
import { styledBot, STYLE_TARGETS } from './styled'
import { startHand, applyAction, type HandState } from '../engine/hand'
import { shuffle, BOT_STYLES, TABLE_SIZES, type BotStyle, type Rng, type TableSize } from '../engine/table'

const seeded = (seed = 1): Rng => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

/** How often a style puts money in, and raises, when the action folds to it before the flop. */
function openingFrequencies(style: BotStyle, deals: number, size: TableSize = 6) {
  const rng = seeded(42)
  let vpip = 0
  let pfr = 0
  for (let i = 0; i < deals; i++) {
    // button 0: first to act after the blinds is seat 3, or heads up the button itself
    let hand: HandState = startHand({ stacks: Array.from({ length: size }, () => 1000), button: 0, smallBlind: 5, bigBlind: 10 }, shuffle(rng))
    const action = styledBot(hand, hand.toAct!, style, rng)
    if (action.type !== 'fold') vpip++
    if (action.type === 'raise' || action.type === 'allIn') pfr++
    hand = applyAction(hand, action)
  }
  return { vpip: (vpip / deals) * 100, pfr: (pfr / deals) * 100 }
}

test('each style opens about as often as its VPIP and PFR targets at every Table Size', async () => {
  for (const size of TABLE_SIZES) {
    for (const style of BOT_STYLES) {
      const seen = openingFrequencies(style, 3000, size)
      const target = STYLE_TARGETS[size][style]
      expect(Math.abs(seen.vpip - target.vpip)).toBeLessThan(4)
      expect(Math.abs(seen.pfr - target.pfr)).toBeLessThan(4)
    }
  }
})

test('the fewer the seats, the looser every style opens', async () => {
  for (const style of BOT_STYLES) {
    const [nine, six, two] = TABLE_SIZES.map((size) => openingFrequencies(style, 2000, size).vpip)
    expect(nine!).toBeLessThan(six!)
    expect(six!).toBeLessThan(two!)
  }
})

test('the styles differ the way their names say', async () => {
  const f = Object.fromEntries(BOT_STYLES.map((s) => [s, openingFrequencies(s, 2000)])) as Record<BotStyle, { vpip: number; pfr: number }>
  expect(f.Nit.vpip).toBeLessThan(f.TAG.vpip)
  expect(f.TAG.vpip).toBeLessThan(f.LAG.vpip)
  expect(f.LAG.vpip).toBeLessThan(f.CallingStation.vpip)
  // a calling station puts money in most and raises least
  expect(f.CallingStation.pfr).toBeLessThan(f.Nit.pfr)
})

test('postflop a bot never folds when it can check', async () => {
  const rng = seeded(9)
  for (const style of BOT_STYLES) {
    for (let i = 0; i < 50; i++) {
      let hand = startHand({ stacks: [1000, 1000, null, null, null, null], button: 0, smallBlind: 5, bigBlind: 10 }, shuffle(rng))
      hand = applyAction(applyAction(hand, { type: 'call' }), { type: 'check' })
      expect(hand.street).toBe('flop')
      expect(styledBot(hand, hand.toAct!, style, rng).type).not.toBe('fold')
    }
  }
})

test('postflop a bot calls a small bet with the nuts and folds air to a huge one', async () => {
  const rng = seeded(5)
  // seat 1 flops a royal flush: As Ks on Qs Js Ts
  const deck = ['2c', '7d', 'As', 'Ks', 'Qs', 'Js', 'Ts', '3h', '4d'] as const
  for (const style of BOT_STYLES) {
    let hand = startHand({ stacks: [1000, 1000, null, null, null, null], button: 0, smallBlind: 5, bigBlind: 10 }, [...deck])
    hand = applyAction(applyAction(hand, { type: 'call' }), { type: 'check' })
    // flop: seat 1 (big blind) acts first and checks; the button bets small
    hand = applyAction(hand, { type: 'check' })
    hand = applyAction(hand, { type: 'bet', to: 15 })
    expect(styledBot(hand, 1, style, rng).type).not.toBe('fold')
  }
  for (const style of ['Nit', 'TAG'] as const) {
    const air = ['As', 'Ks', '2c', '7d', 'Qh', '9h', '4c', '3h', '5d'] as const // seat 1: 2c 7d, no draw
    let hand = startHand({ stacks: [1000, 1000, null, null, null, null], button: 0, smallBlind: 5, bigBlind: 10 }, [...air])
    hand = applyAction(applyAction(hand, { type: 'call' }), { type: 'check' })
    hand = applyAction(hand, { type: 'check' })
    hand = applyAction(hand, { type: 'bet', to: 200 })
    expect(styledBot(hand, 1, style, rng).type).toBe('fold')
  }
})
