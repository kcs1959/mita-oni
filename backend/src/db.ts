export interface ResultRow {
  name: string
  playTimeMs: number
  isOni: boolean
}

/** 対戦した 2 人分の記録をまとめて保存し、それぞれの ID を返す */
export async function saveResults(db: D1Database, rows: ResultRow[]): Promise<number[]> {
  const stmt = db.prepare('INSERT INTO players (name, play_time_ms, is_oni) VALUES (?1, ?2, ?3) RETURNING id')
  const results = await db.batch<{ id: number }>(rows.map((r) => stmt.bind(r.name, r.playTimeMs, r.isOni ? 1 : 0)))
  return results.map((r) => r.results[0].id)
}

export interface RankingEntry {
  id: number
  name: string
  playTimeMs: number
}

export async function countPlayers(db: D1Database, isOni: boolean): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS c FROM players WHERE is_oni = ?1').bind(isOni ? 1 : 0).first<{ c: number }>()
  return row?.c ?? 0
}

/** 並び順は (play_time_ms, id) の昇順。同タイムは先に記録した人が上。役割が違えば null */
export async function rankOf(db: D1Database, id: number, isOni: boolean): Promise<number | null> {
  const me = await db
    .prepare('SELECT play_time_ms AS t FROM players WHERE id = ?1 AND is_oni = ?2')
    .bind(id, isOni ? 1 : 0)
    .first<{ t: number }>()
  if (!me) return null
  const before = await db
    .prepare(
      'SELECT COUNT(*) AS c FROM players WHERE is_oni = ?1 AND (play_time_ms < ?2 OR (play_time_ms = ?2 AND id < ?3))',
    )
    .bind(isOni ? 1 : 0, me.t, id)
    .first<{ c: number }>()
  return (before?.c ?? 0) + 1
}

export async function page(db: D1Database, isOni: boolean, offset: number, limit: number): Promise<RankingEntry[]> {
  const { results } = await db
    .prepare(
      'SELECT id, name, play_time_ms AS playTimeMs FROM players WHERE is_oni = ?1 ORDER BY play_time_ms ASC, id ASC LIMIT ?2 OFFSET ?3',
    )
    .bind(isOni ? 1 : 0, limit, offset)
    .all<RankingEntry>()
  return results
}
