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

/** 初期位置での鬼と逃げの最短距離（迷路を歩いたときのマス数）の下限 */
export const MIN_SPAWN_DISTANCE = 12

const DELTA: Record<Dir, Cell> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

const ROAD_CELLS: Cell[] = MAZE.flatMap((row, y) =>
  [...row].flatMap((c, x): Cell[] => (c === '.' ? [[x, y]] : [])),
)

/** from から各通路マスまでの最短歩数（壁を通らない距離）。BFS で求める */
function walkDistances(from: Cell): Map<string, number> {
  const key = ([x, y]: Cell) => `${x},${y}`
  const dist = new Map([[key(from), 0]])
  const queue: Cell[] = [from]
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]
    const d = dist.get(key(cur))!
    for (const dir of Object.keys(DELTA) as Dir[]) {
      const next = step(cur, dir)
      if (dist.has(key(next))) continue
      dist.set(key(next), d + 1)
      queue.push(next)
    }
  }
  return dist
}

const pickRandom = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]

/**
 * 鬼と逃げの初期位置をランダムに決める。
 * 直線距離だと壁越しに近いだけのことがあるので、迷路を歩いたときの距離で MIN_SPAWN_DISTANCE 以上離す。
 */
export function randomSpawns(): { oni: Cell; runner: Cell } {
  const runner = pickRandom(ROAD_CELLS)
  const dist = walkDistances(runner)
  const far = ROAD_CELLS.filter(([x, y]) => (dist.get(`${x},${y}`) ?? 0) >= MIN_SPAWN_DISTANCE)
  if (far.length > 0) return { runner, oni: pickRandom(far) }
  // 盤面の端に近い場所を引いて条件を満たすマスが無いときは、いちばん遠いマスにする
  const farthest = ROAD_CELLS.reduce((best, c) =>
    (dist.get(`${c[0]},${c[1]}`) ?? 0) > (dist.get(`${best[0]},${best[1]}`) ?? 0) ? c : best,
  )
  return { runner, oni: farthest }
}

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
