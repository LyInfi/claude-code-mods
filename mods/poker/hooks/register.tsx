import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Alert, Game, Profile } from '../types'
import { styledBot } from '../bots/styled'
import { deal, leave, newProfile, rebuyStack, recover, sitDown, step, topUp, wager } from '../engine/game'
import { legalActions, type Action } from '../engine/hand'
import { cryptoRng } from '../engine/table'
import { tableView, chips, type Intents } from '../ui/view'
import { logMaxTop } from '../ui/art'
import { t } from '../ui/i18n'

const PANE = 'poker'
const STORE_KEY = 'profile'
/** Pause between Bot Actions, so each one can be seen. */
const BOT_DELAY_MS = 600
const DONE_ALERT_MS = 8000
/** How long a settled Hand stays on the table before the next is dealt. */
export const NEXT_HAND_MS = 3000

const GAME = { plugin: 'poker', key: 'game' } as const
const ALERT = { plugin: 'poker', key: 'alert' } as const
const LOG_SCROLL = { plugin: 'poker', key: 'logScroll' } as const
const game = atom(GAME, { table: null, profile: newProfile(), log: [] } as Game)
const alert = atom(ALERT, null as Alert | null)
const logScroll = atom(LOG_SCROLL, -1)

/**
 * Scrolls the action log by rows, positive toward older lines. Scrolling up
 * pins the window where it is; reaching the newest row follows the Hand again.
 */
const scrollLog = ($: EngineInterface, rows: number) =>
  update($, logScroll, (top) => {
    const from = top < 0 ? logMaxTop : top
    const to = Math.max(0, from - rows)
    return to >= logMaxTop ? -1 : to
  })

let botTimer: Timer | undefined
let dealTimer: Timer | undefined
let doneTimer: Timer | undefined

/** Changes the Game, persists the Profile when it changed, and lets the Bots act. */
async function change($: EngineInterface, fn: (g: Game) => Game) {
  let before: Profile | undefined
  let logLength = 0
  let error: unknown
  const after = await update($, game, (g) => {
    before = g.profile
    logLength = g.log.length
    try {
      return fn(g)
    } catch (e) {
      error = e
      return g
    }
  })
  if (error) $.ui.toast(String(error instanceof Error ? error.message : error))
  if (after.profile !== before) await $.store.set(STORE_KEY, after.profile)
  // a new Hand starts its log from the top: follow it again
  if (after.log.length < logLength) await $.state.set(LOG_SCROLL, -1)
  scheduleBots($, after)
  scheduleDeal($, after)
}

/**
 * Deals the next Hand a while after one settles, unless the Player is out of
 * chips or Claude is waiting on them; then it looks again shortly.
 */
function scheduleDeal($: EngineInterface, g: Game) {
  const table = g.table
  if (dealTimer || !table?.hand?.result || table.seats[table.playerSeat]!.stack === 0) return
  const settled = g.profile.hands
  dealTimer = $.clock.after(NEXT_HAND_MS, () => {
    dealTimer = undefined
    void (async () => {
      const waiting = await read($, alert)
      if (waiting === 'permission' || waiting === 'question') return scheduleDeal($, await read($, game))
      // only the Hand this timer was set for: a press of `n` may have dealt already
      await change($, (g) => (g.table?.hand?.result && g.profile.hands === settled ? deal(g, cryptoRng) : g))
    })()
  })
}

/** Plays the next Bot Action after a pause while a Bot is to act. */
function scheduleBots($: EngineInterface, g: Game) {
  const hand = g.table?.hand
  if (botTimer || !hand || hand.toAct === null || hand.toAct === g.table!.playerSeat) return
  botTimer = $.clock.after(BOT_DELAY_MS, () => {
    botTimer = undefined
    void change($, (g) => {
      const table = g.table
      const seat = table?.hand?.toAct
      if (!table || seat === null || seat === undefined) return g
      const bot = table.seats[seat]
      if (bot?.kind !== 'bot') return g
      return step(g, styledBot(table.hand!, seat, bot.style, cryptoRng))
    })
  })
}

/** The Player's Action from a control, checked against whose turn it is. */
function playerAction($: EngineInterface, choose: (g: Game) => Action | null) {
  return change($, (g) => {
    const table = g.table
    if (!table?.hand || table.hand.toAct !== table.playerSeat) return g
    const action = choose(g)
    return action ? step(g, action) : g
  })
}

function intents($: EngineInterface): Intents {
  return {
    act: (a) =>
      playerAction($, (g) => {
        const hand = g.table!.hand!
        if (a === 'minRaise') return wager(hand, legalActions(hand).raise?.min ?? 0)
        return { type: a }
      }),
    wager: (to) => playerAction($, (g) => wager(g.table!.hand!, to)),
    amount: (text) =>
      playerAction($, (g) => {
        const to = Number.parseInt(text.replace(/[,\s]/g, ''), 10)
        if (!Number.isFinite(to)) throw new Error(t(g.profile.lang, 'amount') + '?')
        return wager(g.table!.hand!, to)
      }),
    next: () => change($, (g) => deal(g, cryptoRng)),
    scrollLog: (rows) => void scrollLog($, rows),
    sit: (size) => change($, (g) => sitDown(g, size, cryptoRng)),
    leave: () => change($, leave),
    rebuy: () => change($, rebuyStack),
    topUp: () => change($, topUp),
    toggleLang: () => change($, (g) => ({ ...g, profile: { ...g.profile, lang: g.profile.lang === 'zh' ? 'en' : 'zh' } })),
    toggleCards: () =>
      change($, (g) => ({ ...g, profile: { ...g.profile, cardStyle: g.profile.cardStyle === 'compact' ? 'boxed' : 'compact' } })),
  }
}

/**
 * The pane's fill, so it matches the terminal rather than the docked pane's
 * own shade: the terminal's black under a dark theme, the pane's default otherwise.
 */
async function background($: EngineInterface): Promise<string | undefined> {
  try {
    const theme = (await $.config.list()).find((row) => row.key === 'theme')?.value
    return typeof theme === 'string' && theme.startsWith('dark') ? 'black' : undefined
  } catch {
    return undefined
  }
}

async function raise($: EngineInterface, why: Alert) {
  await $.state.set(ALERT, why)
  doneTimer?.cancel()
  doneTimer = undefined
  const { profile } = await read($, game)
  const key = why === 'permission' ? 'alertPermission' : why === 'question' ? 'alertQuestion' : 'alertDone'
  $.ui.toast(t(profile.lang, key))
  if (why === 'done') doneTimer = $.clock.after(DONE_ALERT_MS, () => void $.state.set(ALERT, null))
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'poker',
      description: "Texas Hold'em against bots in a side pane: /poker [stats|lang|cards|topup]",
    })
    // a reload keeps the session's Game; a new session recovers the saved Profile
    const current = await $.state.get(GAME)
    if (current.value === undefined) {
      const profile = recover((await $.store.get(STORE_KEY)) as Profile | undefined)
      await $.state.set(GAME, { table: null, profile, log: [] })
      await $.store.set(STORE_KEY, profile)
    } else {
      scheduleBots($, current.value)
      scheduleDeal($, current.value)
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // the Hand in play counts as folded: the Stack as it stands goes back
    const g = await read($, game)
    if (g.table) {
      const stack = g.table.seats[g.table.playerSeat]!.stack
      await $.store.set(STORE_KEY, { ...g.profile, bankroll: g.profile.bankroll + stack, seated: 0 })
    }
    return next(e)
  })

  on('command.run', { command: 'poker' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const g = await read($, game)
    const lang = g.profile.lang
    switch (arg) {
      case 'stats': {
        const p = g.profile
        return {
          text: [
            `${t(lang, 'statsTitle')}`,
            `${t(lang, 'bankroll')}: ${chips(p.bankroll + (g.table ? g.table.seats[g.table.playerSeat]!.stack : 0))}`,
            `${t(lang, 'hands')}: ${p.hands}`,
            `${t(lang, 'net')}: ${p.net >= 0 ? '+' : ''}${chips(p.net)}`,
            `${t(lang, 'biggestPot')}: ${chips(p.biggestPot)}`,
            `${t(lang, 'topUps')}: ${p.topUps}`,
          ].join('\n'),
        }
      }
      case 'lang':
        await intents($).toggleLang()
        return { text: `language: ${lang === 'zh' ? 'English' : '中文'}` }
      case 'cards':
        await intents($).toggleCards()
        return { text: `cards: ${g.profile.cardStyle === 'compact' ? 'boxed' : 'compact'}` }
      case 'topup':
        await intents($).topUp()
        return { text: `${t(lang, 'bankroll')}: ${chips((await read($, game)).profile.bankroll)}` }
      default:
        await $.ui.open({ id: PANE, title: t(lang, 'title'), focus: true })
        return { text: t(lang, 'title') }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const g = await read($, game)
    const why = await read($, alert)
    const up = await read($, logScroll)
    const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 80
    const rows = e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 24
    return tableView(els as never, g, why, up, columns, rows, await background($), intents($))
  })

  // the wheel scrolls the action log while the whole pane fits; otherwise it scrolls the pane
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.contentRows <= e.bodyRows && (await read($, game)).table) await scrollLog($, -e.by)
    return next(e)
  })

  // calling the Player back when Claude needs them
  on('classic.PermissionRequest', async ($, e, next) => {
    await raise($, 'permission')
    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    await raise($, 'question')
    const result = await next(e)
    await $.state.set(ALERT, null)
    return result
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    // a permission prompt is answered once the call goes on
    if ((await read($, alert)) === 'permission') await $.state.set(ALERT, null)
    return result
  })

  on('classic.Stop', async ($, e, next) => {
    await raise($, 'done')
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await $.state.set(ALERT, null)
    return next(e)
  })
}
