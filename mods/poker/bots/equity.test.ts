import { test, expect } from 'claude-code/testing'
import { equity } from './equity'
import type { Rng } from '../engine/table'

const seeded = (seed = 1): Rng => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

test('pocket aces win about 85% heads up before the flop', async () => {
  const e = equity(['As', 'Ah'], [], 1, 2000, seeded())
  expect(e).toBeGreaterThan(0.81)
  expect(e).toBeLessThan(0.89)
})

test('more opponents lower the equity of the same hand', async () => {
  const one = equity(['As', 'Ah'], [], 1, 1500, seeded(2))
  const four = equity(['As', 'Ah'], [], 4, 1500, seeded(2))
  expect(four).toBeLessThan(one - 0.2)
})

test('the nuts on the river always win', async () => {
  expect(equity(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2d', '3c'], 3, 200, seeded())).toBe(1)
})

test('seven-two offsuit is a big underdog heads up', async () => {
  const e = equity(['7c', '2d'], [], 1, 2000, seeded(3))
  expect(e).toBeGreaterThan(0.28)
  expect(e).toBeLessThan(0.38)
})
