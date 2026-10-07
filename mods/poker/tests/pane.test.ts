import { test, expect, mock } from 'claude-code/testing'

const pane = (bodyColumns: number) =>
  ({
    plugin: 'poker',
    component: 'Pane',
    requestId: 'poker',
    props: { title: 'poker', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }) as const

test('the player sits down, plays a hand against the bots and reaches the next-hand button', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const columns of [100, 50]) {
      const ui = await $.ui.mount({ ...pane(columns), surface })
      if (await ui.find({ key: 'sit-6' })) await ui.press({ key: 'sit-6' })

      // play until the hand ends: check or call when it is our turn, let the bots act otherwise
      for (let i = 0; i < 200 && !(await ui.find({ key: 'next' })) && !(await ui.find({ key: 'rebuy' })); i++) {
        if (await ui.find({ key: 'check' })) await ui.press({ key: 'check' })
        else if (await ui.find({ key: 'call' })) await ui.press({ key: 'call' })
        else await clock.advance(700)
      }
      expect((await ui.find({ key: 'next' })) ?? (await ui.find({ key: 'rebuy' }))).toBeDefined()
      await ui.press({ key: 'leave' })
      expect(await ui.find({ key: 'sit-6' })).toBeDefined()
      await ui.unmount()
    }
  }
})

test('the language toggle switches the pane between Chinese and English', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount({ ...pane(100), surface: 'terminal' })
  expect((await ui.find({ key: 'sit-2' }))?.text).toContain('单挑')
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'lang' })
  expect((await ui.find({ key: 'sit-2' }))?.text).toContain('Heads-up')
  await ui.unmount()
})

test('a settled hand is followed by the next one on its own', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const ui = await $.ui.mount({ ...pane(100), surface: 'terminal' })
  await ui.press({ key: 'sit-6' })
  // fold every hand we are asked about; the bots finish it and the table shows the result
  for (let i = 0; i < 200 && !(await ui.find({ key: 'next' })); i++) {
    if (await ui.find({ key: 'fold' })) await ui.press({ key: 'fold' })
    else await clock.advance(700)
  }
  expect(await ui.find({ key: 'next' })).toBeDefined()
  await clock.advance(3500)
  expect(await ui.find({ key: 'next' })).toBeUndefined()
  await ui.unmount()
})

test('the action log scrolls up to older rows and back down to follow the hand', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const ui = await $.ui.mount({ ...pane(100), surface: 'terminal' })
  await ui.press({ key: 'sit-6' })
  // play until the log outgrows its box
  for (let i = 0; i < 300 && !(await ui.find({ key: 'next' })); i++) {
    if (await ui.find({ key: 'call' })) await ui.press({ key: 'call' })
    else if (await ui.find({ key: 'check' })) await ui.press({ key: 'check' })
    else await clock.advance(700)
  }
  // the drawing as text, without the press handles a redraw renews
  const text = async () => JSON.stringify(await ui.drawn(), (k, v) => (k === 'press' ? undefined : v))
  const newest = await text()
  await ui.press({ key: 'log-up' })
  await ui.press({ key: 'log-up' })
  const older = await text()
  expect(older).not.toBe(newest)
  expect(older).toContain('▼')
  await ui.press({ key: 'log-down' })
  await ui.press({ key: 'log-down' })
  expect(await text()).toBe(newest)
  await ui.unmount()
})

for (const [key, seats] of [['sit-9', 9], ['sit-6', 6], ['sit-2', 2]] as const) {
  test(`the Lobby seats the Player at a table of ${seats} from ${key}`, async ($, on) => {
    mock.clock(on)
    mock.store(on)
    const ui = await $.ui.mount({ ...pane(100), surface: 'terminal' })
    expect(JSON.stringify(await ui.drawn())).toContain('██')
    await ui.press({ key })
    // each Seat is a ring of the same width around the felt
    const rings = JSON.stringify(await ui.drawn()).split('╭───────────╮').length - 1
    expect(rings).toBe(seats)
    await ui.unmount()
  })
}

test('a pane narrower than the logo shows it on one line', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount({ ...pane(30), surface: 'terminal' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).not.toContain('██')
  expect(drawn).toContain('POKER')
  await ui.unmount()
})

test('the units button shows the amounts at the table in big blinds, and an amount typed then is in big blinds', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const ui = await $.ui.mount({ ...pane(100), surface: 'terminal' })
  await ui.press({ key: 'sit-2' })
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'unit' })
  for (let i = 0; i < 50 && !(await ui.find({ key: 'amount' })); i++) await clock.advance(700)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toMatch(/\d+(\.\d)?BB/)
  expect(drawn).not.toContain('1,000')
  // 100 typed is 100 big blinds: the whole 1,000-chip Buy-in goes in
  await ui.input({ key: 'amount', text: '100' })
  expect(await ui.find({ key: 'amount' })).toBeUndefined()
  // the all-in button is gone with the turn: what reads 100BB now is the log's all in
  expect(JSON.stringify(await ui.drawn())).toContain('100BB')
  await ui.unmount()
})

test('the settings button opens and closes a row holding language, cards and units', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount({ ...pane(50), surface: 'terminal' })
  for (const key of ['lang', 'cards', 'unit']) expect(await ui.find({ key })).toBeUndefined()
  await ui.press({ key: 'settings' })
  for (const key of ['lang', 'cards', 'unit']) expect(await ui.find({ key })).toBeDefined()
  await ui.press({ key: 'cards' })
  expect((await ui.find({ key: 'cards' }))?.text).toContain('[A♠]')
  await ui.press({ key: 'settings' })
  expect(await ui.find({ key: 'cards' })).toBeUndefined()
  await ui.unmount()
})
