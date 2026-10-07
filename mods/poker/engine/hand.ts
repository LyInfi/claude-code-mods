import { compare, evaluate, type HandValue } from './evaluate'
import type { Card, HandResult, HandState, SeatState, Street } from '../types'
export type { HandResult, HandState, SeatState, Street }

export type TableSetup = {
  /** One entry per Seat: the Stack sitting there, or null for an empty Seat. */
  stacks: (number | null)[]
  button: number
  smallBlind: number
  bigBlind: number
}

export type LegalActions = {
  seat: number
  canCheck: boolean
  /** Chips needed to call, capped at the seat's Stack; 0 when checking is possible. */
  toCall: number
  /**
   * The totals this Street a bet (nothing to call) or raise may reach, `max`
   * being all in; below `min` only all in is allowed. Null when the seat can
   * only call or fold.
   */
  raise: { min: number; max: number } | null
}

/**
 * Deals a Hand. The deck is read in order: each occupied Seat's two hole
 * cards, Seats from 0 upward, then the five board cards.
 */
export function startHand(table: TableSetup, deck: Card[]): HandState {
  let next = 0
  const seats = table.stacks.map((stack): SeatState | null =>
    stack === null
      ? null
      : { stack, startStack: stack, holeCards: [deck[next++]!, deck[next++]!], bet: 0, committed: 0, folded: false, acted: false },
  )
  const state: HandState = {
    seats,
    button: table.button,
    bigBlind: table.bigBlind,
    street: 'preflop',
    runout: deck.slice(next, next + 5),
    board: [],
    toAct: null,
    currentBet: 0,
    minRaise: table.bigBlind,
    result: null,
  }
  // heads up the button is the small blind
  const headsUp = seats.filter(Boolean).length === 2
  const sb = headsUp ? table.button : nextSeat(state, table.button)
  const bb = nextSeat(state, sb)
  put(state, sb, table.smallBlind)
  put(state, bb, table.bigBlind)
  state.currentBet = table.bigBlind
  state.toAct = nextSeat(state, bb)
  return state
}

export function legalActions(state: HandState): LegalActions {
  const seat = state.toAct
  if (seat === null) throw new Error('the Hand is over')
  const s = state.seats[seat]!
  const owed = state.currentBet - s.bet
  const max = s.bet + s.stack
  // having acted, a seat facing more only through a short all in may call or fold
  const reopened = !s.acted
  const raise = reopened && max > state.currentBet ? { min: Math.min(state.currentBet + state.minRaise, max), max } : null
  return { seat, canCheck: owed === 0, toCall: Math.min(owed, s.stack), raise }
}

/** The next occupied Seat clockwise after `from` that passes `which`. */
function nextSeat(state: HandState, from: number, which: (s: SeatState) => boolean = () => true): number {
  const n = state.seats.length
  for (let i = 1; i <= n; i++) {
    const seat = (from + i) % n
    const s = state.seats[seat]
    if (s && which(s)) return seat
  }
  throw new Error('no occupied seat')
}

/** Moves up to `amount` from a seat's Stack into its bet. */
function put(state: HandState, seat: number, amount: number) {
  const s = state.seats[seat]!
  const chips = Math.min(amount, s.stack)
  s.stack -= chips
  s.bet += chips
  s.committed += chips
}

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; to: number }
  | { type: 'raise'; to: number }
  | { type: 'allIn' }

export function applyAction(prev: HandState, action: Action): HandState {
  const legal = legalActions(prev)
  const seat = legal.seat
  const state: HandState = structuredClone(prev)
  const s = state.seats[seat]!
  switch (action.type) {
    case 'fold':
      s.folded = true
      break
    case 'check':
      if (!legal.canCheck) throw new Error('cannot check facing a bet')
      break
    case 'call':
      if (legal.canCheck) throw new Error('nothing to call')
      put(state, seat, legal.toCall)
      break
    case 'allIn':
      if (legal.raise) raiseTo(state, seat, legal.raise.max)
      else put(state, seat, s.stack) // all in for no more than a call
      break
    case 'bet':
    case 'raise': {
      if (!legal.raise) throw new Error('cannot raise')
      if (action.type === 'bet' && !legal.canCheck) throw new Error('cannot bet facing a bet, raise instead')
      if (action.type === 'raise' && legal.canCheck) throw new Error('nothing to raise, bet instead')
      const to = action.to
      if (to > legal.raise.max || (to < legal.raise.min && to !== legal.raise.max)) {
        throw new Error(`cannot ${action.type} to ${to}`)
      }
      raiseTo(state, seat, to)
      break
    }
  }
  s.acted = true

  const live = liveSeats(state)
  if (live.length === 1) {
    const pot = state.seats.reduce((sum, x) => sum + (x?.committed ?? 0), 0)
    const winner = live[0]!
    state.seats[winner]!.stack += pot
    state.result = { pots: [{ amount: pot, winners: [winner] }], shown: [] }
    state.toAct = null
    return state
  }
  const waiting = state.seats.findIndex((_, i) => owesAction(state, i))
  if (waiting >= 0) {
    state.toAct = nextSeat(state, seat, (x) => owesAction(state, state.seats.indexOf(x)))
    return state
  }
  return endStreet(state)
}

/** Puts a seat's bet up to `to`; a full raise sets the new minimum and reopens the action. */
function raiseTo(state: HandState, seat: number, to: number) {
  const increment = to - state.currentBet
  put(state, seat, to - state.seats[seat]!.bet)
  if (increment <= 0) return // an all in for no more than a call
  if (increment >= state.minRaise) {
    state.minRaise = increment
    for (const x of state.seats) if (x) x.acted = false
  }
  state.currentBet = to
}

/** Whether a seat still has to act on this Street. */
function owesAction(state: HandState, seat: number): boolean {
  const s = state.seats[seat]
  if (!s || s.folded || s.stack === 0) return false
  return !s.acted || s.bet < state.currentBet
}

const NEXT_STREET: Record<Street, Street | null> = { preflop: 'flop', flop: 'turn', turn: 'river', river: null }
const BOARD_SIZE: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 }

/** Closes the betting on this Street and opens the next one, or settles the Hand. */
function endStreet(state: HandState): HandState {
  const street = NEXT_STREET[state.street]
  if (street === null) return showdown(state)
  state.street = street
  state.board = state.runout.slice(0, BOARD_SIZE[street])
  state.currentBet = 0
  state.minRaise = state.bigBlind
  for (const x of state.seats) if (x) Object.assign(x, { bet: 0, acted: false })
  const canAct = liveSeats(state).filter((i) => state.seats[i]!.stack > 0)
  // with at most one seat able to bet, the rest of the board just runs out
  if (canAct.length < 2) return endStreet(state)
  state.toAct = nextSeat(state, state.button, (x) => !x.folded && x.stack > 0)
  return state
}

/** Splits the chips into Pots by the all-in levels and pays each to its best eligible hands. */
function showdown(state: HandState): HandState {
  state.board = state.runout.slice(0, 5)
  state.toAct = null
  const live = liveSeats(state)
  const value = new Map<number, HandValue>(
    live.map((i) => [i, evaluate([...state.seats[i]!.holeCards, ...state.board])]),
  )
  const committed = state.seats.map((x) => x?.committed ?? 0)
  const levels = [...new Set(committed.filter((c) => c > 0))].sort((a, b) => a - b)

  // seats in the order odd chips go: clockwise from the button's left
  const n = state.seats.length
  const fromButton = (i: number) => (i - state.button - 1 + n) % n
  const pots: (HandResult['pots'][number] & { eligible: number[] })[] = []
  let below = 0
  for (const level of levels) {
    const amount = committed.reduce((sum, c) => sum + Math.max(0, Math.min(c, level) - below), 0)
    const eligible = live.filter((i) => committed[i]! >= level).sort((a, b) => fromButton(a) - fromButton(b))
    below = level
    if (eligible.length === 0) {
      pots[pots.length - 1]!.amount += amount
      continue
    }
    if (committed.filter((c) => c >= level).length === 1) {
      // a bet nobody called goes back to whoever made it, outside any Pot
      state.seats[eligible[0]!]!.stack += amount
      continue
    }
    const last = pots[pots.length - 1]
    if (last && last.eligible.join() === eligible.join()) {
      last.amount += amount
      continue
    }
    const best = eligible.reduce((top, i) => (compare(value.get(i)!, value.get(top)!) > 0 ? i : top))
    const winners = eligible.filter((i) => compare(value.get(i)!, value.get(best)!) === 0)
    pots.push({ amount, winners, eligible })
  }
  for (const pot of pots) {
    const share = Math.floor(pot.amount / pot.winners.length)
    pot.winners.forEach((i, k) => {
      state.seats[i]!.stack += share + (k === 0 ? pot.amount - share * pot.winners.length : 0)
    })
  }
  state.result = { pots: pots.map(({ amount, winners }) => ({ amount, winners })), shown: live }
  return state
}

/** Seats still in the Hand. */
function liveSeats(state: HandState): number[] {
  return state.seats.flatMap((x, i) => (x && !x.folded ? [i] : []))
}
