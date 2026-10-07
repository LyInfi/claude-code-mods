import type { Game, LogEntry, Profile, TableSize } from '../types'
import { evaluate } from './evaluate'
import { legalActions, type Action, type HandState, type Street } from './hand'
import { act, buyIn, createTable, dealNext, isHandLive, rebuy, type Rng, type TableState } from './table'

export const STARTING_BANKROLL = 10_000

export const newProfile = (): Profile => ({
  bankroll: STARTING_BANKROLL,
  seated: 0,
  hands: 0,
  net: 0,
  topUps: 0,
  biggestPot: 0,
  lang: 'zh',
  cardStyle: 'compact',
  tableSize: 6,
})

export const STAKE = { smallBlind: 5, bigBlind: 10 }
export const BUY_IN = buyIn(STAKE)

/** A saved Profile coming back: chips left seated by a Session that ended abruptly return to the Bankroll. */
export function recover(saved: Profile | undefined): Profile {
  const profile = { ...newProfile(), ...saved }
  return { ...profile, bankroll: profile.bankroll + profile.seated, seated: 0 }
}

/** Sits the Player down at a Table of `size` with one Buy-in and deals the first Hand. */
export function sitDown(g: Game, size: TableSize, rng: Rng): Game {
  if (g.table) return g
  if (g.profile.bankroll < BUY_IN) throw new Error('not enough for a buy-in')
  const table = createTable(BUY_IN, rng, STAKE, size)
  const profile = { ...g.profile, bankroll: g.profile.bankroll - BUY_IN, seated: BUY_IN, tableSize: size }
  return deal({ table, profile, log: [] }, rng)
}

/** Deals the next Hand. */
export function deal(g: Game, rng: Rng): Game {
  if (!g.table) return g
  const table = dealNext(g.table, rng)
  return { ...g, table, log: blinds(table.hand!) }
}

/** The blinds as posted: the seat after the button (heads up, the button itself) and the one after it. */
function blinds(hand: HandState): LogEntry[] {
  const occupied = hand.seats.flatMap((s, i) => (s ? [i] : []))
  const after = (from: number) => occupied.find((i) => i > from) ?? occupied[0]!
  const sb = occupied.length === 2 ? hand.button : after(hand.button)
  const bb = after(sb)
  return [
    { kind: 'blind', seat: sb, blind: 'SB', amount: hand.seats[sb]!.bet },
    { kind: 'blind', seat: bb, blind: 'BB', amount: hand.seats[bb]!.bet },
  ]
}

/** Whether the Player may get up now: between Hands, or once out of the one in play. */
export function canLeave(table: TableState): boolean {
  if (!isHandLive(table)) return true
  return table.hand!.seats[table.playerSeat]!.folded
}

/** The Player leaves the Table and the Stack goes back to the Bankroll. */
export function leave(g: Game): Game {
  if (!g.table || !canLeave(g.table)) return g
  const stack = g.table.seats[g.table.playerSeat]!.stack
  return { table: null, profile: { ...g.profile, bankroll: g.profile.bankroll + stack, seated: 0 }, log: [] }
}

/** Between Hands, tops the Player's Stack back up to one Buy-in from the Bankroll. */
export function rebuyStack(g: Game): Game {
  if (!g.table || isHandLive(g.table)) return g
  const stack = g.table.seats[g.table.playerSeat]!.stack
  const amount = Math.min(BUY_IN - stack, g.profile.bankroll)
  if (amount <= 0) return g
  return {
    ...g,
    table: rebuy(g.table, amount),
    profile: { ...g.profile, bankroll: g.profile.bankroll - amount, seated: stack + amount },
  }
}

/** Whether the Player is short of a Buy-in counting chips on and off the Table. */
export function needsTopUp(g: Game): boolean {
  const stack = g.table ? g.table.seats[g.table.playerSeat]!.stack : 0
  return g.profile.bankroll + stack < BUY_IN
}

/** Fills the Bankroll back up to the starting amount; counted in the Profile. */
export function topUp(g: Game): Game {
  if (!needsTopUp(g)) return g
  return { ...g, profile: { ...g.profile, bankroll: STARTING_BANKROLL, topUps: g.profile.topUps + 1 } }
}

/** Applies the Action of whoever is to act, logs it, and books the Hand into the Profile once it settles. */
export function step(g: Game, action: Action): Game {
  if (!g.table?.hand) throw new Error('no Hand dealt')
  const before = g.table.hand
  const seat = before.toAct!
  const legal = legalActions(before)
  const table = act(g.table, action)
  const hand = table.hand!

  const log: LogEntry[] = [...g.log, { kind: 'action', seat, action: action.type, to: actionTotal(before, seat, action, legal.raise?.max) }]
  // every street the board turned, several at once when an all in runs it out
  const turned: [Street, number][] = [['flop', 3], ['turn', 4], ['river', 5]]
  for (const [street, size] of turned) {
    if (before.board.length < size && hand.board.length >= size) log.push({ kind: 'street', street })
  }
  let profile = g.profile
  if (hand.result) {
    hand.result.pots.forEach((pot, index) => {
      const category = hand.result!.shown.length > 0 ? evaluate([...hand.seats[pot.winners[0]!]!.holeCards, ...hand.board]).category : null
      log.push({ kind: 'pot', index, amount: pot.amount, winners: pot.winners, category })
    })
    profile = book(profile, table)
  }
  const playerStack = table.seats[table.playerSeat]!.stack
  return { table, profile: { ...profile, seated: playerStack }, log }
}

/** The total a seat's bet comes to on this Street after `action`. */
function actionTotal(hand: HandState, seat: number, action: Action, max: number | undefined): number {
  const s = hand.seats[seat]!
  switch (action.type) {
    case 'bet':
    case 'raise':
      return action.to
    case 'allIn':
      return max ?? s.bet + s.stack
    case 'call':
      return Math.min(hand.currentBet, s.bet + s.stack)
    default:
      return s.bet
  }
}

/** Records a settled Hand's result for the Player. */
function book(profile: Profile, table: TableState): Profile {
  const seat = table.playerSeat
  const hand = table.hand!
  const s = hand.seats[seat]!
  return {
    ...profile,
    hands: profile.hands + 1,
    net: profile.net + (s.stack - s.startStack),
    biggestPot: Math.max(profile.biggestPot, won(hand, seat)),
  }
}

/** Chips a seat took from the Pots of a settled Hand, uncalled bets aside. */
function won(hand: HandState, seat: number): number {
  const pots = hand.result?.pots ?? []
  let total = 0
  for (const pot of pots) {
    const k = pot.winners.indexOf(seat)
    if (k < 0) continue
    const share = Math.floor(pot.amount / pot.winners.length)
    total += share + (k === 0 ? pot.amount - share * pot.winners.length : 0)
  }
  return total
}

/** The raise sizes offered as one-key choices, as totals clamped to what is legal. */
export function presets(hand: HandState): { key: '1' | '2' | '3' | '4'; label: 'x2.5' | 'halfPot' | 'fullPot' | 'allIn'; to: number }[] {
  const legal = legalActions(hand)
  if (!legal.raise) return []
  const pot = hand.seats.reduce((sum, x) => sum + (x?.committed ?? 0), 0)
  const afterCall = pot + legal.toCall
  const clamp = (to: number) => Math.max(legal.raise!.min, Math.min(legal.raise!.max, Math.round(to)))
  const base = hand.currentBet > 0 ? hand.currentBet : hand.bigBlind
  return [
    { key: '1', label: 'x2.5', to: clamp(base * 2.5) },
    { key: '2', label: 'halfPot', to: clamp(hand.currentBet + afterCall / 2) },
    { key: '3', label: 'fullPot', to: clamp(hand.currentBet + afterCall) },
    { key: '4', label: 'allIn', to: legal.raise.max },
  ]
}

/** The Action that puts the bet to `to`: a bet or raise, or all in at the top. */
export function wager(hand: HandState, to: number): Action {
  const legal = legalActions(hand)
  if (legal.raise && to >= legal.raise.max) return { type: 'allIn' }
  return legal.canCheck ? { type: 'bet', to } : { type: 'raise', to }
}
