import type { Elements } from 'claude-code'

export type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Input'>

/** How a run of cells is drawn. */
export type Ink = { color?: string; dim?: boolean; bold?: boolean; inverse?: boolean }

type Cell = { ch: string; ink: Ink }

/** CJK and fullwidth characters take two terminal columns; everything this table draws otherwise takes one. */
function isWide(ch: string): boolean {
  const c = ch.codePointAt(0)!
  return (
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe4f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6)
  )
}

/** The columns `text` takes in a terminal. */
export const width = (text: string) => [...text].reduce((w, ch) => w + (isWide(ch) ? 2 : 1), 0)

/** A grid of character cells written by position, then drawn as one Text per row. */
export class Canvas {
  private rows: (Cell | null)[][]

  constructor(
    readonly cols: number,
    readonly height: number,
  ) {
    this.rows = Array.from({ length: height }, () => Array.from({ length: cols }, (): Cell | null => ({ ch: ' ', ink: {} })))
  }

  /** Writes `text` from column `x`; a wide character covers the cell after it too. Off-grid cells are dropped. */
  put(x: number, y: number, text: string, ink: Ink = {}): number {
    const row = this.rows[y]
    if (!row) return x
    for (const ch of text) {
      const wide = isWide(ch)
      if (x >= 0 && x + (wide ? 1 : 0) < this.cols) {
        row[x] = { ch, ink }
        if (wide) row[x + 1] = null
      }
      x += wide ? 2 : 1
    }
    return x
  }

  /** Writes runs of differently inked text one after another; returns the column after the last. */
  spans(x: number, y: number, runs: [string, Ink?][]): number {
    for (const [text, ink] of runs) x = this.put(x, y, text, ink)
    return x
  }

  /** Writes runs centered on column `cx`. */
  center(cx: number, y: number, runs: [string, Ink?][]) {
    const w = runs.reduce((sum, [text]) => sum + width(text), 0)
    return this.spans(cx - Math.floor(w / 2), y, runs)
  }

  /** Writes runs ending at column `right` (inclusive). */
  right(right: number, y: number, runs: [string, Ink?][]) {
    const w = runs.reduce((sum, [text]) => sum + width(text), 0)
    return this.spans(right - w + 1, y, runs)
  }

  /** A rounded box outline from (x, y) spanning `w` by `h` cells. */
  box(x: number, y: number, w: number, h: number, ink: Ink = {}) {
    this.put(x, y, '╭' + '─'.repeat(w - 2) + '╮', ink)
    for (let i = 1; i < h - 1; i++) {
      this.put(x, y + i, '│', ink)
      this.put(x + w - 1, y + i, '│', ink)
    }
    this.put(x, y + h - 1, '╰' + '─'.repeat(w - 2) + '╯', ink)
  }

  /** One Text per row, each a series of inked runs. */
  draw(els: Els, key: string) {
    const { Box, Text } = els
    const same = (a: Ink, b: Ink) => a.color === b.color && a.dim === b.dim && a.bold === b.bold && a.inverse === b.inverse
    return (
      <Box key={key} flexDirection="column">
        {this.rows.map((row, y) => {
          const runs: { text: string; ink: Ink }[] = []
          for (const cell of row) {
            if (!cell) continue
            const last = runs[runs.length - 1]
            if (last && same(last.ink, cell.ink)) last.text += cell.ch
            else runs.push({ text: cell.ch, ink: cell.ink })
          }
          return (
            <Text key={`${key}-${y}`} wrap="truncate">
              {runs.map((r) =>
                r.ink.color || r.ink.dim || r.ink.bold || r.ink.inverse ? (
                  <Text color={r.ink.color} dimColor={r.ink.dim} bold={r.ink.bold} inverse={r.ink.inverse}>
                    {r.text}
                  </Text>
                ) : (
                  r.text
                ),
              )}
            </Text>
          )
        })}
      </Box>
    )
  }
}
