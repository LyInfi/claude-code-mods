import { test, expect } from 'claude-code/testing'
import { inTopPercent } from './preflop'

test('the top 20% of starting hands holds the strong ones and leaves out the trash', async () => {
  for (const hand of [['As', 'Ad'], ['Ah', 'Kc'], ['Ah', 'Qh'], ['9s', '9d'], ['Kh', 'Qh']] as const) {
    expect(inTopPercent([...hand], 20)).toBe(true)
  }
  for (const hand of [['7c', '2d'], ['Jc', '4d'], ['9h', '3s'], ['Qc', '5d']] as const) {
    expect(inTopPercent([...hand], 20)).toBe(false)
  }
})

test('a tighter range is contained in a wider one', async () => {
  // A-T offsuit is a 15% hand: out of a nit's 8%, in a loose player's 30%
  expect(inTopPercent(['Ah', 'Td'], 8)).toBe(false)
  expect(inTopPercent(['Ah', 'Td'], 30)).toBe(true)
  // pocket aces are in every range; seven-two offsuit only in all of them
  expect(inTopPercent(['As', 'Ac'], 1)).toBe(true)
  expect(inTopPercent(['7c', '2d'], 99)).toBe(false)
  expect(inTopPercent(['7c', '2d'], 100)).toBe(true)
})
