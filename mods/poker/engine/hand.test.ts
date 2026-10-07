import { test, expect } from 'claude-code/testing'
import { startHand, applyAction, legalActions, type HandState, type Action } from './hand'
import type { Card } from './evaluate'

/** Three seats at 5/10 with 1000 each, seats 3-5 empty. */
const threeHanded = (button = 0, stacks: (number | null)[] = [1000, 1000, 1000, null, null, null]) =>
  ({ stacks, button, smallBlind: 5, bigBlind: 10 })

/** Hole cards in seat order for the occupied seats, then the five board cards. */
const deck = (...cards: Card[]) => cards

const anyDeck = deck(
  '2c', '7d', // first occupied seat
  '3c', '8d',
  '4c', '9d',
  '5h', '6h', '8s', 'Js', 'Kh', // board
)

const stacks = (s: HandState) => s.seats.map((seat) => seat?.stack ?? null)

test('posts the blinds left of the button and the seat after the big blind acts first', async () => {
  const s = startHand(threeHanded(0), anyDeck)
  expect(stacks(s)).toEqual([1000, 995, 990, null, null, null])
  expect(s.toAct).toBe(0)
  expect(legalActions(s)).toMatchObject({ seat: 0, canCheck: false, toCall: 10 })
})

/** Applies actions in turn, each by whoever is to act. */
const play = (s: HandState, ...actions: Action[]) => actions.reduce(applyAction, s)

test('when everyone else folds the last seat takes the pot without a showdown', async () => {
  const s = play(startHand(threeHanded(0), anyDeck), { type: 'fold' }, { type: 'fold' })
  expect(s.toAct).toBe(null)
  expect(stacks(s)).toEqual([1000, 995, 1005, null, null, null])
  expect(s.result?.shown).toEqual([])
})

const call: Action = { type: 'call' }
const check: Action = { type: 'check' }
const fold: Action = { type: 'fold' }

test('streets turn the board, postflop action starts left of the button, and the best hand wins the showdown', async () => {
  // seat 1 pairs its 8 on the board 5h 6h 8s Js Kh; the others have nothing
  let s = play(startHand(threeHanded(0), anyDeck), call, call, check)
  expect(s.street).toBe('flop')
  expect(s.board).toEqual(['5h', '6h', '8s'])
  expect(s.toAct).toBe(1)

  s = play(s, check, check, check)
  expect(s.street).toBe('turn')
  expect(s.board).toEqual(['5h', '6h', '8s', 'Js'])

  s = play(s, check, check, check)
  expect(s.board).toEqual(['5h', '6h', '8s', 'Js', 'Kh'])

  s = play(s, check, check, check)
  expect(s.toAct).toBe(null)
  expect(stacks(s)).toEqual([990, 1020, 990, null, null, null])
  expect(s.result?.shown).toEqual([0, 1, 2])
})

test('a raise must add at least the size of the last bet or raise', async () => {
  let s = startHand(threeHanded(0), anyDeck)
  // facing the 10 big blind: raise to at least 20, at most the whole stack
  expect(legalActions(s)).toMatchObject({ raise: { min: 20, max: 1000 } })

  s = play(s, { type: 'raise', to: 35 }) // a raise of 25
  expect(legalActions(s)).toMatchObject({ seat: 1, toCall: 30, raise: { min: 60, max: 1000 } })
  expect(() => applyAction(s, { type: 'raise', to: 59 })).toThrow()

  s = play(s, fold, call)
  // postflop the first bet must be at least the big blind
  expect(s.street).toBe('flop')
  expect(legalActions(s)).toMatchObject({ seat: 2, canCheck: true, raise: { min: 10, max: 965 } })
  expect(() => applyAction(s, { type: 'bet', to: 9 })).toThrow()
  s = play(s, { type: 'bet', to: 40 })
  expect(stacks(s)).toEqual([965, 995, 925, null, null, null])
})

test('an all in short of a full raise does not reopen raising for seats that already acted', async () => {
  // the big blind has 60: 50 behind after posting
  let s = startHand(threeHanded(0, [1000, 1000, 60, null, null, null]), anyDeck)
  s = play(s, { type: 'raise', to: 40 }, call) // a raise of 30
  s = play(s, { type: 'allIn' }) // to 60: only 20 more, short of 30
  expect(legalActions(s)).toMatchObject({ seat: 0, toCall: 20, raise: null })
  s = play(s, call)
  expect(legalActions(s)).toMatchObject({ seat: 1, toCall: 20, raise: null })
  s = play(s, call)
  expect(s.street).toBe('flop')
})

test('three all ins for different amounts build a main pot and a side pot, and the uncalled rest goes back', async () => {
  const cards = deck(
    '2c', '3d', // seat 0, 1000: nothing
    'Kc', 'Kd', // seat 1, 300: kings
    'Ac', 'Ad', // seat 2, 100: aces
    '7h', '8s', '9d', 'Jc', '4h',
  )
  let s = startHand(threeHanded(0, [1000, 300, 100, null, null, null]), cards)
  s = play(s, { type: 'allIn' }, { type: 'allIn' }, { type: 'allIn' })
  expect(s.toAct).toBe(null)
  expect(s.board).toEqual(['7h', '8s', '9d', 'Jc', '4h'])
  expect(s.result?.pots).toEqual([
    { amount: 300, winners: [2] }, // main pot: 100 from each
    { amount: 400, winners: [1] }, // side pot: 200 more from seats 0 and 1
  ])
  expect(stacks(s)).toEqual([700, 400, 300, null, null, null])
})

test('a split pot gives the odd chip to the first winner left of the button', async () => {
  const cards = deck('2c', '3d', '4c', '5d', '2d', '3c', 'As', 'Ks', 'Qs', 'Js', 'Ts') // the board plays
  let s = startHand(threeHanded(0), cards)
  s = play(s, call, fold, check) // pot of 25: 10 + 5 + 10
  while (s.toAct !== null) s = play(s, check)
  expect(s.result?.pots).toEqual([{ amount: 25, winners: [2, 0] }])
  expect(stacks(s)).toEqual([1002, 995, 1003, null, null, null])
})

test('heads up the button posts the small blind, acts first preflop and last after the flop', async () => {
  const cards = deck('2c', '7d', '3c', '8d', '5h', '6h', '8s', 'Js', 'Kh')
  let s = startHand(threeHanded(0, [1000, null, null, 1000, null, null]), cards)
  expect(stacks(s)).toEqual([995, null, null, 990, null, null])
  expect(s.toAct).toBe(0)
  s = play(s, call, check)
  expect(s.street).toBe('flop')
  expect(s.toAct).toBe(3)
})

test('illegal actions are refused', async () => {
  const s = startHand(threeHanded(0), anyDeck)
  expect(() => applyAction(s, check)).toThrow() // facing the big blind
  expect(() => applyAction(s, { type: 'bet', to: 30 })).toThrow() // there is a bet: raise
  expect(() => applyAction(s, { type: 'raise', to: 1001 })).toThrow() // more than the stack
  const bigBlindOption = play(s, call, call)
  expect(() => applyAction(bigBlindOption, call)).toThrow() // nothing to call
  const over = play(s, fold, fold)
  expect(() => applyAction(over, check)).toThrow() // the Hand is over
})
