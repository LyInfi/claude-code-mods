import type { Action, HandState } from '../engine/hand'
import { legalActions } from '../engine/hand'
import type { BotStyle, Rng, TableSize } from '../engine/table'
import { equity } from './equity'
import { percentile } from './preflop'

/**
 * Picks an Action for the Bot in `seat`. A policy reads only its own hole
 * cards, the board and the betting; never another seat's cards. Any strategy
 * (these styles, a GTO table, a model) plugs in here.
 */
export type BotPolicy = (hand: HandState, seat: number, style: BotStyle, rng: Rng) => Action

/**
 * The opening frequencies each Bot Style aims at for each Table Size, in
 * percent of hands: VPIP (puts money in) and PFR (raises). Fewer seats, looser play.
 */
export const STYLE_TARGETS: Record<TableSize, Record<BotStyle, { vpip: number; pfr: number }>> = {
  9: {
    TAG: { vpip: 15, pfr: 12 },
    LAG: { vpip: 24, pfr: 20 },
    CallingStation: { vpip: 40, pfr: 4 },
    Nit: { vpip: 9, pfr: 7 },
  },
  6: {
    TAG: { vpip: 20, pfr: 16 },
    LAG: { vpip: 30, pfr: 25 },
    CallingStation: { vpip: 45, pfr: 5 },
    Nit: { vpip: 12, pfr: 10 },
  },
  2: {
    TAG: { vpip: 55, pfr: 45 },
    LAG: { vpip: 75, pfr: 65 },
    CallingStation: { vpip: 80, pfr: 10 },
    Nit: { vpip: 35, pfr: 28 },
  },
}

/** How each style plays after the flop and against raises. */
const POSTFLOP: Record<
  BotStyle,
  {
    /** Equity needed to bet when checked to, and to raise a bet. */
    bet: number
    raise: number
    /** Equity over the pot odds needed to call; below 0 calls too much. */
    callMargin: number
    /** How often it bets or raises with nothing. */
    bluff: number
    /** Bet size as a share of the pot. */
    sizing: number
    /** The share of its opening range it continues with against a raise. */
    defend: number
  }
> = {
  TAG: { bet: 0.6, raise: 0.78, callMargin: 0.04, bluff: 0.08, sizing: 0.66, defend: 0.45 },
  LAG: { bet: 0.52, raise: 0.7, callMargin: 0, bluff: 0.2, sizing: 0.8, defend: 0.55 },
  CallingStation: { bet: 0.75, raise: 0.9, callMargin: -0.12, bluff: 0.02, sizing: 0.5, defend: 0.8 },
  Nit: { bet: 0.68, raise: 0.85, callMargin: 0.1, bluff: 0.02, sizing: 0.6, defend: 0.5 },
}

/** Monte Carlo runs per decision: enough for a steady estimate, cheap enough for each Action. */
const ITERATIONS = 400

const pot = (hand: HandState) => hand.seats.reduce((sum, s) => sum + (s?.committed ?? 0), 0)
const opponents = (hand: HandState, seat: number) => hand.seats.filter((s, i) => s && !s.folded && i !== seat).length

/** A bet or raise to `to`, or all in when that is the whole Stack. */
function aggress(hand: HandState, to: number): Action {
  const legal = legalActions(hand)
  if (!legal.raise) return legal.canCheck ? { type: 'check' } : { type: 'call' }
  const total = Math.max(legal.raise.min, Math.min(legal.raise.max, Math.round(to / hand.bigBlind) * hand.bigBlind))
  if (total >= legal.raise.max) return { type: 'allIn' }
  return legal.canCheck ? { type: 'bet', to: total } : { type: 'raise', to: total }
}

function preflop(hand: HandState, seat: number, style: BotStyle, rng: Rng): Action {
  const legal = legalActions(hand)
  // the Table Size is the number of Seats the Hand was dealt around
  const target = (STYLE_TARGETS[hand.seats.length as TableSize] ?? STYLE_TARGETS[6])[style]
  const p = POSTFLOP[style]
  const rank = percentile(hand.seats[seat]!.holeCards)
  const raised = hand.currentBet > hand.bigBlind

  if (!raised) {
    // first in, or behind limpers: raise the top of the range, limp the rest of it
    if (rank <= target.pfr) return aggress(hand, hand.bigBlind * (2.5 + opponents(hand, seat) * 0.25))
    if (rank <= target.vpip) return legal.canCheck ? { type: 'check' } : { type: 'call' }
    return legal.canCheck ? { type: 'check' } : { type: 'fold' }
  }

  // facing a raise: re-raise the very top, call with the stronger part of the range
  if (rank <= target.pfr * 0.3 || (rng() < p.bluff / 3 && rank <= target.vpip)) return aggress(hand, hand.currentBet * 3)
  const odds = legal.toCall / (pot(hand) + legal.toCall)
  if (rank <= target.vpip * p.defend || (odds < 0.2 && rank <= target.vpip)) return { type: 'call' }
  return { type: 'fold' }
}

function postflop(hand: HandState, seat: number, style: BotStyle, rng: Rng): Action {
  const legal = legalActions(hand)
  const p = POSTFLOP[style]
  const eq = equity(hand.seats[seat]!.holeCards, hand.board, opponents(hand, seat), ITERATIONS, rng)
  const size = pot(hand) * p.sizing

  if (legal.canCheck) {
    if (eq >= p.bet || rng() < p.bluff) return aggress(hand, size)
    return { type: 'check' }
  }
  if (legal.raise && (eq >= p.raise || (rng() < p.bluff / 2 && eq > 0.3))) return aggress(hand, hand.currentBet + pot(hand) * p.sizing)
  const odds = legal.toCall / (pot(hand) + legal.toCall)
  if (eq >= odds + p.callMargin) return { type: 'call' }
  return { type: 'fold' }
}

/** Plays by Bot Style: starting-hand ranges sized to the style's VPIP and PFR, then equity against the pot odds. */
export const styledBot: BotPolicy = (hand, seat, style, rng) =>
  hand.street === 'preflop' ? preflop(hand, seat, style, rng) : postflop(hand, seat, style, rng)
