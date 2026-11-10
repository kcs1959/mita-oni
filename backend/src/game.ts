import type { Cell, Dir } from './protocol'

export const ROOM_COUNT = 50
/** ゲームループの 1 ループの長さ（約 30Hz） */
export const TICK_MS = 33
export const COUNTDOWN_MS = 3_000
export const GAME_DURATION_MS = 180_000
/** 連打の先行入力として溜めておける最大数。これを超えた入力は捨てる */
export const MAX_QUEUED_INPUTS = 3
export const NAME_MAX_CHARS = 12

/** '#' = 壁, '.' = 通路。Figma「05 · 盤面デザイン」の 13x17 マス */
export const MAZE = [
  '#############',
  '#...#.......#',
  '#.#.#.#####.#',
  '#.#...#...#.#',
  '#.###.#.#.#.#',
  '#...#...#...#',
  '###.#.###.#.#',
  '#...#.....#.#',
  '#.###.#.###.#',
  '#.#...#.....#',
  '#.#.#####.#.#',
  '#...#.....#.#',
  '#.###.###.#.#',
  '#.....#.....#',
  '#.###.#.###.#',
  '#...#.......#',
  '#############',
] as const

export const RUNNER_SPAWN: Cell = [1, 1]
export const ONI_SPAWN: Cell = [11, 15]

const DELTA: Record<Dir, Cell> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

export function isDir(v: unknown): v is Dir {
  return typeof v === 'string' && v in DELTA
}

/** 壁なら元の位置のまま */
export function step([x, y]: Cell, dir: Dir): Cell {
  const [dx, dy] = DELTA[dir]
  const nx = x + dx
  const ny = y + dy
  return MAZE[ny]?.[nx] === '.' ? [nx, ny] : [x, y]
}

export const samePos = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1]

/** 前後の空白を除き、12 文字（サロゲートペアも 1 文字）までに切り詰める。空なら null */
export function normalizeName(raw: string | null): string | null {
  const name = Array.from(raw?.trim() ?? '')
    .slice(0, NAME_MAX_CHARS)
    .join('')
  return name || null
}
