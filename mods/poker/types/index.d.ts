export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'

export type Suit = 's' | 'h' | 'd' | 'c'

export type Card = `${Rank}${Suit}`

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export type SeatState = {
  stack: number
  /** The Stack the seat was dealt in with. */
  startStack: number
  holeCards: [Card, Card]
  /** Chips put in on the current Street. */
  bet: number
  /** Chips put in over the whole Hand. */
  committed: number
  folded: boolean
  /** Has acted since the last full bet or raise. */
  acted: boolean
}

export type HandState = {
  seats: (SeatState | null)[]
  button: number
  bigBlind: number
  street: Street
  /** All five board cards, dealt up front; `board` shows those turned so far. */
  runout: Card[]
  board: Card[]
  /** The seat to act, or null once the Hand is over. */
  toAct: number | null
  /** The highest `bet` on this Street. */
  currentBet: number
  /** The size of the last full bet or raise on this Street: the least the next raise must add. */
  minRaise: number
  /** Set once the Hand is over. */
  result: HandResult | null
}

export type HandResult = {
  /** Each Pot, Main Pot first, with the seats that split it. */
  pots: { amount: number; winners: number[] }[]
  /** Seats whose hole cards were turned face up at the Showdown. */
  shown: number[]
}

/** Seats at a Table: 9-max, 6-max or Heads-up. */
export type TableSize = 9 | 6 | 2

export type BotStyle = 'TAG' | 'LAG' | 'CallingStation' | 'Nit'

export type Occupant =
  | { kind: 'player'; stack: number }
  | { kind: 'bot'; name: string; style: BotStyle; stack: number }

export type TableState = {
  seats: (Occupant | null)[]
  /** The Seat the Player sits in. */
  playerSeat: number
  button: number
  smallBlind: number
  bigBlind: number
  /** The Hand in play or just finished; null before the first deal. */
  hand: HandState | null
  /** Bot names already used at this Table, so a replacement gets a fresh one. */
  usedNames: string[]
}

export type Lang = 'zh' | 'en'

export type CardStyle = 'compact' | 'boxed'

/** How amounts at the Table read: in chips, or in big blinds. */
export type ChipUnit = 'chips' | 'bb'

/** What the Player keeps across Sessions. */
export type Profile = {
  /** Chips off the Table. */
  bankroll: number
  /** The Player's Stack as last saved while seated; returned to the Bankroll if a Session ends abruptly. */
  seated: number
  hands: number
  net: number
  topUps: number
  biggestPot: number
  lang: Lang
  cardStyle: CardStyle
  chipUnit: ChipUnit
  /** The Table Size last chosen in the Lobby. */
  tableSize: TableSize
}

/** Why the Table Pane is calling the Player back to Claude. */
export type Alert = 'permission' | 'question' | 'done'

export type LogEntry =
  | { kind: 'blind'; seat: number; blind: 'SB' | 'BB'; amount: number }
  | { kind: 'action'; seat: number; action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn'; to: number }
  | { kind: 'street'; street: Street }
  | { kind: 'pot'; index: number; amount: number; winners: number[]; category: number | null }

/** Everything the Table Pane draws from, changed as one value. */
export type Game = {
  /** Null while the Player is not seated. */
  table: TableState | null
  profile: Profile
  /** The latest events of the Hand in play, oldest first. */
  log: LogEntry[]
}

declare module 'claude-code' {
  interface PluginState {
    'poker': {
      game: Game
      alert: Alert | null
      /** The first action log row shown; -1 follows the newest rows as the Hand goes on. */
      logScroll: number
      /** Whether the settings row under the header is open. */
      settings: boolean
    }
  }
}
