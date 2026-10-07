import type { Card } from '../engine/evaluate'
import type { HandState } from '../engine/hand'
import type { TableState } from '../engine/table'
import type { Game } from '../types'
import { Canvas, width, type Els, type Ink } from './canvas'
import { categoryName, t, type Lang } from './i18n'

/** The columns the drawn table takes; a narrower pane gets the list layout. */
export const TABLE_COLS = 72

/** Claude Code's own accent, for the seat to act. */
export const ACCENT = '#D97757'
const CHIP: Ink = { color: 'yellow', bold: true }
const DIM: Ink = { dim: true }

const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
const face = (c: Card) => `${c.charAt(0) === 'T' ? '10' : c.charAt(0)}${SUIT_GLYPH[c.charAt(1)]}`
const cardInk = (c: Card): Ink => ({ bold: true, color: c.charAt(1) === 'h' || c.charAt(1) === 'd' ? 'red' : undefined })

export const chips = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** Compact cards as runs: `A♠ K♥`, face down `░░`, an empty board place `··`. */
function compact(cards: (Card | null)[], slots = cards.length): [string, Ink?][] {
  const runs: [string, Ink?][] = []
  for (let i = 0; i < slots; i++) {
    if (i > 0) runs.push([' '])
    const c = cards[i]
    if (c === undefined) runs.push(['··', DIM])
    else if (c === null) runs.push(['░░', DIM])
    else runs.push([face(c), cardInk(c)])
  }
  return runs
}

/** Boxed cards, three rows tall and five columns each, centered on `cx`. */
function boxed(canvas: Canvas, cx: number, y: number, cards: (Card | null)[], slots = cards.length) {
  const total = slots * 5 + (slots - 1)
  let x = cx - Math.floor(total / 2)
  for (let i = 0; i < slots; i++, x += 6) {
    const c = cards[i]
    const edge: Ink = c ? {} : DIM
    canvas.put(x, y, '╭───╮', edge)
    canvas.put(x, y + 1, '│', edge)
    if (c === undefined) canvas.put(x + 1, y + 1, '   ')
    else if (c === null) canvas.put(x + 1, y + 1, '░░░', DIM)
    else canvas.put(x + 1, y + 1, face(c).padEnd(3), cardInk(c))
    canvas.put(x + 4, y + 1, '│', edge)
    canvas.put(x, y + 2, '╰───╯', edge)
  }
}

/** Which blind a seat posted this Hand: the two seats after the button, or heads up the button itself. */
function blindTag(table: TableState, seat: number): 'SB' | 'BB' | null {
  const hand = table.hand
  if (!hand) return null
  const occupied = hand.seats.flatMap((s, i) => (s ? [i] : []))
  const after = (from: number) => occupied.find((i) => i > from) ?? occupied[0]!
  const sb = occupied.length === 2 ? hand.button : after(hand.button)
  const bb = after(sb)
  return seat === sb ? 'SB' : seat === bb ? 'BB' : null
}

const faceUp = (table: TableState, seat: number) =>
  seat === table.playerSeat || (table.hand?.result?.shown.includes(seat) ?? false)

const winners = (hand: HandState | null) => new Set(hand?.result?.pots.flatMap((p) => p.winners) ?? [])

/** The pot in the middle: earlier Streets' chips while betting goes on, everything once the Hand is settled. */
const potBehind = (hand: HandState) =>
  hand.seats.reduce((sum, s) => sum + (s?.committed ?? 0) - (hand.result ? 0 : (s?.bet ?? 0)), 0)

/** What a seat took from the Pots of a settled Hand, the odd chip to the first winner listed. */
function winnings(hand: HandState, seat: number): number {
  let total = 0
  for (const pot of hand.result?.pots ?? []) {
    const k = pot.winners.indexOf(seat)
    if (k < 0) continue
    const share = Math.floor(pot.amount / pot.winners.length)
    total += share + (k === 0 ? pot.amount - share * pot.winners.length : 0)
  }
  return total
}

/** A Seat's ring: five rows by thirteen columns, or wider and taller around boxed cards. */
const RING_W = 13
const RING_H = 5

/**
 * Where each Seat sits around the felt, by its place counted clockwise from the
 * Player's: across the top (with its share of the width), on the left and right
 * sides, and beside the Player along the bottom.
 */
type Layout = { top: [pos: number, share: number][]; left?: number; right?: number; bottomLeft?: number; bottomRight?: number }

const LAYOUTS: Record<number, Layout> = {
  2: { top: [[1, 0.5]] },
  6: { top: [[2, 0.25], [3, 0.5], [4, 0.75]], left: 1, right: 5 },
  9: { top: [[3, 0.2], [4, 0.4], [5, 0.6], [6, 0.8]], left: 2, right: 7, bottomLeft: 1, bottomRight: 8 },
}

/** The table drawn in box characters: each Seat in its own ring around the felt, bets and the dealer button on the felt, the board in the middle. */
export function drawTable(els: Els, g: Game, table: TableState, lang: Lang) {
  const tall = g.profile.cardStyle === 'boxed'
  const hand = table.hand
  const won = winners(hand)
  const W = TABLE_COLS
  const mid = Math.floor(W / 2)
  const feltLeft = RING_W + 1
  const feltRight = W - RING_W - 2

  // rows: the top rings, then the felt (top bets, board, pot, the Player's bet), then the Player's ring;
  // the side bets sit level with the board, or with the pot beside the wider boxed board
  const feltTop = RING_H
  const topSpotRow = feltTop + 1
  const boardRow = feltTop + 2
  const potRow = boardRow + (tall ? 3 : 1)
  const sideSpotRow = tall ? potRow : boardRow
  const playerSpotRow = potRow + 1
  const feltBottom = playerSpotRow + 1
  const sideTop = Math.round((feltTop + feltBottom) / 2 - RING_H / 2 + 0.5)
  const playerRingH = tall ? RING_H + 2 : RING_H
  const canvas = new Canvas(W, feltBottom + 1 + playerRingH)

  canvas.box(feltLeft, feltTop, feltRight - feltLeft + 1, feltBottom - feltTop + 1, DIM)

  const seats = table.seats.length
  const layout = LAYOUTS[seats] ?? LAYOUTS[6]!
  const seatOf = (pos: number) => (table.playerSeat + pos) % seats

  /** The ring's colour: the accent for the seat to act, green for a winner, dim otherwise. */
  const ringInk = (seat: number): Ink =>
    won.has(seat) ? { color: 'green' } : hand?.toAct === seat ? { color: ACCENT, bold: true } : DIM

  /** The seat's name, tagged with its blind. */
  const label = (seat: number): [string, Ink?][] => {
    const o = table.seats[seat]!
    const hs = hand?.seats[seat]
    const name = o.kind === 'player' ? t(lang, 'you') : o.name
    const ink: Ink = won.has(seat)
      ? { color: 'green', bold: true }
      : hand?.toAct === seat
        ? { color: ACCENT, bold: true }
        : hs?.folded
          ? DIM
          : { bold: o.kind === 'player' }
    const tag = blindTag(table, seat)
    return tag ? [[name, ink], [` ${tag}`, DIM]] : [[name, ink]]
  }

  const stack = (seat: number): [string, Ink?][] => {
    const o = table.seats[seat]!
    const hs = hand?.seats[seat]
    if (hs && hs.stack === 0 && !hs.folded && hand?.result === null) return [[t(lang, 'isAllIn'), { color: 'red', bold: true }]]
    return [[chips(o.stack), hs?.folded ? DIM : {}]]
  }

  const hole = (seat: number): [string, Ink?][] => {
    const hs = hand?.seats[seat]
    if (!hs) return []
    if (hs.folded) return [[t(lang, 'folded'), DIM]]
    return compact(faceUp(table, seat) ? hs.holeCards : [null, null])
  }

  /** A Seat in its ring, centered on column `cx` from row `y`: name, Stack, cards. */
  const ring = (seat: number, cx: number, y: number) => {
    const x = cx - Math.floor(RING_W / 2)
    canvas.box(x, y, RING_W, RING_H, ringInk(seat))
    canvas.center(cx, y + 1, label(seat))
    canvas.center(cx, y + 2, stack(seat))
    canvas.center(cx, y + 3, hole(seat))
  }

  /** What sits on the felt in front of a seat: the dealer button and the bet, or a winner's take. */
  const spot = (seat: number): [string, Ink?][] => {
    const runs: [string, Ink?][] = []
    if (hand && hand.button === seat) runs.push([' D ', { inverse: true, bold: true }])
    const amount = hand?.result ? winnings(hand, seat) : (hand?.seats[seat]?.bet ?? 0)
    if (amount > 0) {
      if (runs.length) runs.push([' '])
      if (hand?.result) runs.push([`+${chips(amount)}`, { color: 'green', bold: true }])
      else runs.push(['● ', CHIP], [chips(amount), CHIP])
    }
    return runs
  }

  // across the top
  const crowded = layout.top.length > 3
  layout.top.forEach(([pos, share], i) => {
    const seat = seatOf(pos)
    if (!table.seats[seat]) return
    const cx = Math.round(W * share)
    ring(seat, cx, 0)
    // drawn a little toward the middle, clear of the side seats' bets; four across
    // leave no room for that, so the outer two keep to the felt's edges instead
    if (crowded && i === 0) canvas.spans(feltLeft + 2, topSpotRow, spot(seat))
    else if (crowded && i === layout.top.length - 1) canvas.right(feltRight - 2, topSpotRow, spot(seat))
    else canvas.center(crowded ? cx : Math.round(cx + (mid - cx) * 0.4), topSpotRow, spot(seat))
  })

  // left and right
  const left = layout.left === undefined ? null : seatOf(layout.left)
  if (left !== null && table.seats[left]) {
    ring(left, Math.floor(RING_W / 2), sideTop)
    canvas.spans(feltLeft + 2, sideSpotRow, spot(left))
  }
  const right = layout.right === undefined ? null : seatOf(layout.right)
  if (right !== null && table.seats[right]) {
    ring(right, W - 1 - Math.floor(RING_W / 2), sideTop)
    canvas.right(feltRight - 2, sideSpotRow, spot(right))
  }

  // the board and the pot
  const board = hand?.board ?? []
  if (tall) boxed(canvas, mid, boardRow, board, 5)
  else canvas.center(mid, boardRow, compact(board, 5))
  if (hand) canvas.center(mid, potRow, [[`${t(lang, 'pot')} `, DIM], [chips(potBehind(hand)), { bold: true }]])

  // the Player at the bottom, in a ring wide enough for boxed cards
  const me = table.playerSeat
  canvas.center(mid, playerSpotRow, spot(me))
  const y = feltBottom + 1
  const mine = hand?.seats[me]
  if (tall) {
    const w = 15
    canvas.box(mid - Math.floor(w / 2), y, w, playerRingH, ringInk(me))
    canvas.center(mid, y + 1, [...label(me), [' '], ...stack(me)])
    if (mine && !mine.folded) boxed(canvas, mid, y + 2, mine.holeCards)
    else canvas.center(mid, y + 3, hole(me))
  } else {
    ring(me, mid, y)
  }

  // beside the Player along the bottom, their bets level with the Player's
  const bottomLeft = layout.bottomLeft === undefined ? null : seatOf(layout.bottomLeft)
  if (bottomLeft !== null && table.seats[bottomLeft]) {
    ring(bottomLeft, Math.round(W * 0.2), y)
    canvas.spans(feltLeft + 2, playerSpotRow, spot(bottomLeft))
  }
  const bottomRight = layout.bottomRight === undefined ? null : seatOf(layout.bottomRight)
  if (bottomRight !== null && table.seats[bottomRight]) {
    ring(bottomRight, Math.round(W * 0.8), y)
    canvas.right(feltRight - 2, playerSpotRow, spot(bottomRight))
  }

  return canvas.draw(els, 'table')
}

/** The narrow layout: one row per Seat with its markers, cards, Stack and bet, then the board and the pot. */
export function drawList(els: Els, g: Game, table: TableState, lang: Lang, columns: number) {
  const hand = table.hand
  const won = winners(hand)
  const seats = table.seats.flatMap((o, i) => (o ? [i] : []))
  const canvas = new Canvas(columns, seats.length + 2)
  seats.forEach((seat, row) => {
    const o = table.seats[seat]!
    const hs = hand?.seats[seat]
    const acting = hand?.toAct === seat
    const name = o.kind === 'player' ? t(lang, 'you') : o.name
    const ink: Ink = won.has(seat) ? { color: 'green', bold: true } : acting ? { color: ACCENT, bold: true } : hs?.folded ? DIM : o.kind === 'player' ? { bold: true } : {}
    canvas.put(0, row, acting ? '❯' : ' ', { color: ACCENT })
    canvas.put(2, row, name, ink)
    canvas.put(10, row, hand?.button === seat ? ' D ' : '', { inverse: true, bold: true })
    canvas.put(14, row, blindTag(table, seat) ?? '', DIM)
    if (hs) canvas.spans(18, row, hs.folded ? [[t(lang, 'folded'), DIM]] : compact(faceUp(table, seat) ? hs.holeCards : [null, null]))
    canvas.right(31, row, hs && hs.stack === 0 && !hs.folded && hand?.result === null ? [[t(lang, 'isAllIn'), { color: 'red', bold: true }]] : [[chips(o.stack), hs?.folded ? DIM : {}]])
    if (hand?.result && won.has(seat)) canvas.spans(33, row, [[`+${chips(winnings(hand, seat))}`, { color: 'green', bold: true }]])
    else if (hs && hs.bet > 0 && !hand?.result) canvas.spans(33, row, [['● ', CHIP], [chips(hs.bet), CHIP]])
  })
  const y = seats.length + 1
  const x = canvas.spans(2, y, compact(hand?.board ?? [], 5))
  if (hand) canvas.spans(x + 3, y, [[`${t(lang, 'pot')} `, DIM], [chips(potBehind(hand)), { bold: true }]])
  return canvas.draw(els, 'list')
}

/** Content rows of the action log; the box adds its two borders. */
export const LOG_ROWS = 6

/** The last row the log's window could start at when last drawn, so the scroll keys stay within it. */
export let logMaxTop = 0
/** Columns the street labels take, so the actions line up after them. */
const LABEL_COLS = 6

type Runs = [string, Ink?][]

/**
 * The Hand so far in a bordered box: one group per street, its label and the
 * board it turned, then the actions joined by ` · ` and wrapped to the width,
 * then the pots. The newest rows show when they outgrow the box.
 */
export function drawLog(els: Els, g: Game, table: TableState, lang: Lang, cols: number, scroll: number, on: { up: () => void; down: () => void }) {
  const inner = cols - 4
  const lines: Runs[] = []
  let line: Runs = []
  let used = 0
  const name = (seat: number): [string, Ink?] => {
    const o = table.seats[seat]
    return [o?.kind === 'player' ? t(lang, 'you') : (o?.name ?? '?'), { bold: o?.kind === 'player' }]
  }
  const runsWidth = (runs: Runs) => runs.reduce((w, [text]) => w + width(text), 0)
  const newLine = (label: Runs = []) => {
    if (line.length) lines.push(line)
    const pad = LABEL_COLS - runsWidth(label)
    line = [...label, [' '.repeat(Math.max(1, pad))]]
    used = Math.max(LABEL_COLS, runsWidth(label) + 1)
  }
  /** Adds one item after a separator, wrapping onto an indented line when it does not fit. */
  const add = (item: Runs) => {
    const w = runsWidth(item)
    const first = used <= LABEL_COLS
    if (!first && used + 3 + w > inner) newLine()
    if (used > LABEL_COLS && line.length > 1) {
      line.push([' · ', DIM])
      used += 3
    }
    line.push(...item)
    used += w
  }
  const board = table.hand?.board ?? []
  let settled = false
  const SIZE = { preflop: 0, flop: 3, turn: 4, river: 5 } as const

  newLine([[t(lang, 'preflop'), DIM]])
  for (const e of g.log) {
    switch (e.kind) {
      case 'blind':
        add([name(e.seat), [` ${e.blind} `, DIM], [chips(e.amount)]])
        break
      case 'action': {
        const amount: Runs = e.action === 'fold' || e.action === 'check' ? [] : [[` ${chips(e.to)}`]]
        add([name(e.seat), [` ${t(lang, e.action)}`, DIM], ...amount])
        break
      }
      case 'street':
        newLine([[t(lang, e.street), DIM]])
        line.push(...compact(board.slice(0, SIZE[e.street])))
        used += runsWidth(compact(board.slice(0, SIZE[e.street])))
        newLine()
        break
      case 'pot': {
        // the first pot starts the result group under its label; the rest follow beneath
        newLine(settled ? [] : [[t(lang, 'settle'), DIM]])
        settled = true
        const label = e.index === 0 ? t(lang, 'mainPot') : `${t(lang, 'sidePot')} ${e.index}`
        const who = e.winners.map((s) => name(s)[0]).join(', ')
        const verb = e.winners.length > 1 ? t(lang, 'split') : t(lang, 'wins')
        const how = e.category === null ? '' : ` (${categoryName(lang, e.category)})`
        line.push([`${label} ${chips(e.amount)}: ${who} ${verb}${how}`, { color: 'green' }])
        used = inner
        break
      }
    }
  }
  if (line.some(([text]) => text.trim() !== '')) lines.push(line)

  // the window over the lines: from row `scroll`, or the newest rows while following (-1)
  const maxTop = Math.max(0, lines.length - LOG_ROWS)
  logMaxTop = maxTop
  const top = scroll < 0 ? maxTop : Math.min(scroll, maxTop)
  const shown = lines.slice(top, top + LOG_ROWS)

  // the top border is a row of its own, carrying the scroll keys; the canvas draws the rest
  const { Box, Text, Button } = els
  const title = ` ${t(lang, 'logTitle')} `
  const keys = 4 + 1 + 4 // `k: ↑`, a rule, `j: ↓`
  const rule = Math.max(1, cols - 2 - width(title) - keys - 3)
  const canvas = new Canvas(cols, LOG_ROWS + 1)
  for (let y = 0; y < LOG_ROWS; y++) {
    canvas.put(0, y, '│', DIM)
    canvas.put(cols - 1, y, '│', DIM)
  }
  canvas.put(0, LOG_ROWS, '╰' + '─'.repeat(cols - 2) + '╯', DIM)
  if (top > 0) canvas.put(cols - 1, 0, '▲', { color: ACCENT })
  if (top < maxTop) canvas.put(cols - 1, LOG_ROWS - 1, '▼', { color: ACCENT })
  shown.forEach((runs, i) => canvas.spans(2, i, runs))
  return (
    <Box key="log" flexDirection="column" width={cols}>
      <Box flexDirection="row">
        <Text dimColor>{`╭─${title}${'─'.repeat(rule)}─`}</Text>
        <Button key="log-up" hotkey="k" plain onPress={on.up}>
          ↑
        </Button>
        <Text dimColor>─</Text>
        <Button key="log-down" hotkey="j" plain onPress={on.down}>
          ↓
        </Button>
        <Text dimColor>─╮</Text>
      </Box>
      {canvas.draw(els, 'log-body')}
    </Box>
  )
}

/** POKER in the "ANSI Shadow" block letters, one array of rows per letter. */
const LOGO_LETTERS = [
  ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔═══╝ ', '██║     ', '╚═╝     '],
  [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  ['██╗  ██╗', '██║ ██╔╝', '█████╔╝ ', '██╔═██╗ ', '██║  ██╗', '╚═╝  ╚═╝'],
  ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
]
const LOGO = LOGO_LETTERS[0]!.map((_, row) => LOGO_LETTERS.map((letter) => letter[row]).join(''))
/** The columns the block-letter logo takes; a narrower pane gets it on one line. */
export const LOGO_COLS = width(LOGO[0]!)

/** The Lobby's POKER logo with a row of suits under it: block letters in the accent, their shadow dim. */
export function drawLogo(els: Els, columns: number) {
  const suits: [string, Ink?][] = [['♠', { bold: true }], ['   '], ['♥', { color: 'red', bold: true }], ['   '], ['♦', { color: 'red', bold: true }], ['   '], ['♣', { bold: true }]]
  if (columns < LOGO_COLS) {
    const canvas = new Canvas(columns, 1)
    canvas.center(Math.floor(columns / 2), 0, [['♠ ', { bold: true }], ['POKER', { color: ACCENT, bold: true }], [' ♥', { color: 'red', bold: true }]])
    return canvas.draw(els, 'logo')
  }
  const canvas = new Canvas(LOGO_COLS, LOGO.length + 2)
  LOGO.forEach((line, y) => {
    let x = 0
    for (const ch of line) x = canvas.put(x, y, ch, ch === '█' ? { color: ACCENT, bold: true } : ch === ' ' ? {} : { color: ACCENT, dim: true })
  })
  canvas.center(Math.floor(LOGO_COLS / 2), LOGO.length + 1, suits)
  return canvas.draw(els, 'logo')
}
