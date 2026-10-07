import type { BotStyle, Card, Occupant, Rank, Suit, TableSize, TableState } from '../types'
export type { BotStyle, Occupant, TableSize, TableState }
import { applyAction, startHand, type Action, type HandState } from './hand'

export const BOT_STYLES: readonly BotStyle[] = ['TAG', 'LAG', 'CallingStation', 'Nit']

/** A source of uniform numbers in [0, 1). */
export type Rng = () => number

export const TABLE_SIZES: readonly TableSize[] = [9, 6, 2]
export const BIG_BLINDS_PER_BUY_IN = 100

const BOT_NAMES = [
  'Ace', 'Blaze', 'Clover', 'Dusty', 'Echo', 'Fox', 'Ginger', 'Hawk', 'Iris', 'Jade', 'Kit', 'Luna',
  'Milo', 'Nova', 'Onyx', 'Pike', 'Quinn', 'Rex', 'Sage', 'Tex', 'Uma', 'Vex', 'Wren', 'Zed',
]

export const buyIn = (t: Pick<TableState, 'bigBlind'>) => t.bigBlind * BIG_BLINDS_PER_BUY_IN

/** A Table of `size` Seats with the Player in seat 0 holding `playerStack` and a fresh Bot in every other Seat. */
export function createTable(playerStack: number, rng: Rng, stake = { smallBlind: 5, bigBlind: 10 }, size: TableSize = 6): TableState {
  const table: TableState = {
    seats: Array.from({ length: size }, () => null),
    playerSeat: 0,
    button: size - 1,
    ...stake,
    hand: null,
    usedNames: [],
  }
  table.seats[0] = { kind: 'player', stack: playerStack }
  for (let i = 1; i < size; i++) table.seats[i] = newBot(table, rng)
  return table
}

function newBot(table: TableState, rng: Rng): Occupant {
  const free = BOT_NAMES.filter((n) => !table.usedNames.includes(n))
  const pool = free.length > 0 ? free : BOT_NAMES
  const name = pool[Math.floor(rng() * pool.length)]!
  table.usedNames.push(name)
  const style = BOT_STYLES[Math.floor(rng() * BOT_STYLES.length)]!
  return { kind: 'bot', name, style, stack: buyIn(table) }
}

/** Whether a Hand is being played: dealt and not yet settled. */
export const isHandLive = (t: TableState) => t.hand !== null && t.hand.result === null

/**
 * Deals the next Hand: busted Bots leave and fresh ones take their Seats, the
 * button moves on, and a shuffled deck is dealt. The Player must have chips.
 */
export function dealNext(prev: TableState, rng: Rng): TableState {
  if (isHandLive(prev)) throw new Error('a Hand is still being played')
  const table: TableState = structuredClone(prev)
  const player = table.seats[table.playerSeat]!
  if (player.stack === 0) throw new Error('the Player has no chips: Rebuy first')
  table.seats = table.seats.map((o) => (o && o.kind === 'bot' && o.stack === 0 ? newBot(table, rng) : o))
  table.button = nextOccupied(table, table.button)
  const stacks = table.seats.map((o) => o?.stack ?? null)
  table.hand = startHand({ stacks, button: table.button, smallBlind: table.smallBlind, bigBlind: table.bigBlind }, shuffle(rng))
  return table
}

/** Applies the Action of whoever is to act, and carries the Stacks back to the Seats once the Hand is settled. */
export function act(prev: TableState, action: Action): TableState {
  if (!prev.hand) throw new Error('no Hand dealt')
  const hand = applyAction(prev.hand, action)
  const table: TableState = { ...prev, hand }
  table.seats = prev.seats.map((o, i) => (o ? { ...o, stack: hand.seats[i]!.stack } : null))
  return table
}

/** Adds chips to the Player's Stack between Hands. */
export function rebuy(prev: TableState, amount: number): TableState {
  if (isHandLive(prev)) throw new Error('rebuy only between Hands')
  const seats = prev.seats.map((o, i) => (o && i === prev.playerSeat ? { ...o, stack: o.stack + amount } : o))
  return { ...prev, seats }
}

function nextOccupied(table: TableState, from: number): number {
  const n = table.seats.length
  for (let i = 1; i <= n; i++) {
    const seat = (from + i) % n
    if (table.seats[seat]) return seat
  }
  throw new Error('empty table')
}

const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS: Suit[] = ['s', 'h', 'd', 'c']

export function shuffle(rng: Rng): Card[] {
  const deck = RANKS.flatMap((r) => SUITS.map((s): Card => `${r}${s}`))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

/** Uniform numbers from the environment's cryptographic source. */
export const cryptoRng: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32
