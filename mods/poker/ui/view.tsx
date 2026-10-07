import type { Alert, Game, TableSize } from '../types'
import { evaluate, Category } from '../engine/evaluate'
import { legalActions, type HandState } from '../engine/hand'
import { TABLE_SIZES, buyIn, isHandLive, type TableState } from '../engine/table'
import { BUY_IN, STAKE, canLeave, needsTopUp, presets } from '../engine/game'
import { ACCENT, TABLE_COLS, chips, drawList, drawLog, drawLogo, drawTable } from './art'
import type { Els } from './canvas'
import { categoryName, t, type Lang } from './i18n'

export { chips }

/** What the view's controls ask for; the register module turns these into state changes. */
export type Intents = {
  act: (a: 'fold' | 'check' | 'call' | 'minRaise' | 'allIn') => void
  wager: (to: number) => void
  amount: (text: string) => void
  next: () => void
  sit: (size: TableSize) => void
  leave: () => void
  rebuy: () => void
  topUp: () => void
  toggleLang: () => void
  toggleCards: () => void
  /** Moves the action log by rows: positive toward older lines. */
  scrollLog: (rows: number) => void
}

/** Rows kept for the controls, filled or not, so the block above them keeps its place. */
const CONTROL_ROWS = 3

const signed = (n: number) => (n > 0 ? `+${chips(n)}` : n < 0 ? `-${chips(-n)}` : '0')

/** The whole pane: the header across the top, everything else centered in the space below it. */
export function tableView(els: Els, g: Game, alert: Alert | null, logScroll: number, columns: number, rows: number, background: string | undefined, on: Intents) {
  const { Box, Text } = els
  const lang = g.profile.lang
  return (
    <Box flexDirection="column" width={columns} minHeight={rows} backgroundColor={background}>
      {header(els, g, lang, on)}
      {/* one row held for the alert, shown or not, so nothing below it moves */}
      <Box justifyContent="center" height={1}>
        {alert && (
          <Text color={alert === 'done' ? 'green' : 'yellow'} bold>
            {t(lang, alert === 'permission' ? 'alertPermission' : alert === 'question' ? 'alertQuestion' : 'alertDone')}
          </Text>
        )}
      </Box>
      <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
        {g.table ? seated(els, g, g.table, lang, columns, logScroll, on) : lobby(els, g, lang, columns, on)}
      </Box>
    </Box>
  )
}

/** One line: the game, the Stake, the Bankroll and the result on the left; the settings on the right. */
function header(els: Els, g: Game, lang: Lang, on: Intents) {
  const { Box, Text } = els
  const p = g.profile
  const stake = g.table ? ` · ${g.table.smallBlind}/${g.table.bigBlind}` : ''
  return (
    <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
      <Text>
        <Text color={ACCENT} bold>
          ♠ {t(lang, 'title')}
        </Text>
        <Text dimColor>{stake}</Text>
        <Text dimColor>
          {' · '}
          {t(lang, 'bankroll')} {chips(p.bankroll)} · {t(lang, 'hands')} {p.hands} · {t(lang, 'net')}{' '}
        </Text>
        <Text color={p.net > 0 ? 'green' : p.net < 0 ? 'red' : undefined} dimColor={p.net === 0}>
          {signed(p.net)}
        </Text>
      </Text>
      <Box flexDirection="row" gap={2}>
        {prefs(els, g, lang, on)}
      </Box>
    </Box>
  )
}

/**
 * The Lobby: the logo, the Stake, Buy-in and Bankroll, and a button per Table
 * Size, the one last chosen in focus. Short of a Buy-in, the sizes are drawn dim
 * and the Top-up is the button.
 */
function lobby(els: Els, g: Game, lang: Lang, columns: number, on: Intents) {
  const { Box, Text, Button } = els
  const short = needsTopUp(g)
  return (
    <Box flexDirection="column" gap={1} alignItems="center">
      {drawLogo(els, columns)}
      <Text dimColor>
        {`${STAKE.smallBlind}/${STAKE.bigBlind} · ${t(lang, 'buyIn')} ${chips(BUY_IN)} · ${t(lang, 'bankroll')} ${chips(g.profile.bankroll)}`}
      </Text>
      <Text dimColor>{short ? t(lang, 'broke') : t(lang, 'chooseTable')}</Text>
      <Box flexDirection="row" gap={3} justifyContent="center" flexWrap="wrap">
        {TABLE_SIZES.map((size) =>
          short ? (
            <Text key={`sit-${size}`} dimColor>
              {`${size}: ${t(lang, `size${size}`)}`}
            </Text>
          ) : (
            <Button key={`sit-${size}`} hotkey={String(size)} plain autoFocus={size === g.profile.tableSize ? true : undefined} onPress={() => on.sit(size)}>
              {t(lang, `size${size}`)}
            </Button>
          ),
        )}
      </Box>
      {short && (
        <Button key="topup" hotkey="t" plain autoFocus onPress={on.topUp}>
          {t(lang, 'topUp')}
        </Button>
      )}
    </Box>
  )
}

function prefs(els: Els, g: Game, lang: Lang, on: Intents) {
  const { Button } = els
  return [
    <Button key="lang" hotkey="l" plain onPress={on.toggleLang}>
      {t(lang, 'lang')}
    </Button>,
    <Button key="cards" hotkey="v" plain onPress={on.toggleCards}>
      {`${t(lang, 'cardStyle')} ${g.profile.cardStyle === 'compact' ? 'A♠' : '[A♠]'}`}
    </Button>,
  ]
}

function seated(els: Els, g: Game, table: TableState, lang: Lang, columns: number, logScroll: number, on: Intents) {
  const { Box } = els
  const wide = columns >= TABLE_COLS
  return (
    <Box flexDirection="column" width={wide ? TABLE_COLS : columns}>
      {wide ? drawTable(els, g, table, lang) : drawList(els, g, table, lang, columns)}
      {/* fixed heights below the table: the centered block keeps one size through the Hand */}
      <Box marginTop={1}>{drawLog(els, g, table, lang, wide ? TABLE_COLS : columns, logScroll, { up: () => on.scrollLog(1), down: () => on.scrollLog(-1) })}</Box>
      <Box flexDirection="column" minHeight={CONTROL_ROWS} marginTop={1}>
        {controls(els, g, table, lang, on)}
      </Box>
    </Box>
  )
}

const potTotal = (hand: HandState) => hand.seats.reduce((sum, s) => sum + (s?.committed ?? 0), 0)

/** The Player's made hand and, facing a bet, the pot odds. */
function hints(table: TableState, lang: Lang): string {
  const hand = table.hand!
  const me = hand.seats[table.playerSeat]!
  const made =
    hand.board.length > 0
      ? categoryName(lang, evaluate([...me.holeCards, ...hand.board]).category)
      : categoryName(lang, me.holeCards[0].charAt(0) === me.holeCards[1].charAt(0) ? Category.OnePair : Category.HighCard)
  const legal = legalActions(hand)
  const odds = legal.toCall > 0 ? ` · ${t(lang, 'potOdds')} ${Math.round((legal.toCall / (potTotal(hand) + legal.toCall)) * 100)}%` : ''
  return `${made}${odds}`
}

function controls(els: Els, g: Game, table: TableState, lang: Lang, on: Intents) {
  const { Box, Text, Button, Input } = els
  const hand = table.hand
  const live = isHandLive(table)
  const myTurn = live && hand!.toAct === table.playerSeat
  const stack = table.seats[table.playerSeat]!.stack

  if (myTurn) {
    const legal = legalActions(hand!)
    const raiseVerb = t(lang, legal.canCheck ? 'bet' : 'raise')
    return (
      <Box flexDirection="column">
        <Text>
          <Text color={ACCENT} bold>
            ❯ {t(lang, 'yourTurn')}
          </Text>
          <Text dimColor> · {hints(table, lang)}</Text>
        </Text>
        <Box flexDirection="row" gap={2} flexWrap="wrap" paddingLeft={2}>
          <Button key="fold" hotkey="f" plain onPress={() => on.act('fold')}>
            {t(lang, 'fold')}
          </Button>
          {legal.canCheck ? (
            <Button key="check" hotkey="c" plain autoFocus onPress={() => on.act('check')}>
              {t(lang, 'check')}
            </Button>
          ) : (
            <Button key="call" hotkey="c" plain autoFocus onPress={() => on.act('call')}>
              {`${t(lang, 'call')} ${chips(legal.toCall)}`}
            </Button>
          )}
          {legal.raise && (
            <Button key="raise" hotkey="r" plain onPress={() => on.act('minRaise')}>
              {`${raiseVerb} ${chips(legal.raise.min)}`}
            </Button>
          )}
          <Button key="allin" hotkey="a" plain onPress={() => on.act('allIn')}>
            {`${t(lang, 'allIn')} ${chips(stack + hand!.seats[table.playerSeat]!.bet)}`}
          </Button>
        </Box>
        {legal.raise && (
          <Box flexDirection="row" gap={2} flexWrap="wrap" paddingLeft={2}>
            {presets(hand!).map((p) => (
              <Button key={`preset-${p.key}`} hotkey={p.key} plain onPress={() => on.wager(p.to)}>
                {`${p.label === 'x2.5' ? '2.5x' : t(lang, p.label)} ${chips(p.to)}`}
              </Button>
            ))}
            <Input key="amount" label={raiseVerb} placeholder={`${legal.raise.min}–${legal.raise.max}`} onSubmit={(v) => on.amount(v)} />
          </Box>
        )}
      </Box>
    )
  }

  if (live) {
    return (
      <Box flexDirection="row" gap={2}>
        <Text dimColor>{t(lang, 'waiting')}</Text>
        {canLeave(table) && (
          <Button key="leave" hotkey="q" plain onPress={on.leave}>
            {t(lang, 'leave')}
          </Button>
        )}
      </Box>
    )
  }

  // between Hands
  const busted = stack === 0
  const canRebuy = stack < buyIn(table) && g.profile.bankroll > 0
  return (
    <Box flexDirection="column">
      {busted ? <Text color="red">{t(lang, 'busted')}</Text> : <Text dimColor>{t(lang, 'autoNext')}</Text>}
      <Box flexDirection="row" gap={2} flexWrap="wrap">
        {!busted && (
          <Button key="next" hotkey="n" plain autoFocus onPress={on.next}>
            {t(lang, 'nextHand')}
          </Button>
        )}
        {canRebuy && (
          <Button key="rebuy" hotkey="b" plain autoFocus={busted ? true : undefined} onPress={on.rebuy}>
            {t(lang, 'rebuy')}
          </Button>
        )}
        {busted && needsTopUp(g) && (
          <Button key="topup" hotkey="t" plain onPress={on.topUp}>
            {t(lang, 'topUp')}
          </Button>
        )}
        <Button key="leave" hotkey="q" plain onPress={on.leave}>
          {t(lang, 'leave')}
        </Button>
      </Box>
    </Box>
  )
}
