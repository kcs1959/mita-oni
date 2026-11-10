import { countPlayers, page, rankOf } from './db'

/** 1 ページの人数（Figma の「前の7人 / 次の7人」） */
const PAGE_SIZE = 7

/**
 * GET /api/ranking?role=oni|runner&me=<記録ID>&offset=<n>
 * offset を省略して me を渡すと、自分がページ中央に来る位置から返す
 */
export async function handleRanking(url: URL, env: Env): Promise<Response> {
  const role = url.searchParams.get('role')
  if (role !== 'oni' && role !== 'runner') {
    return new Response('role must be oni or runner', { status: 400 })
  }
  const isOni = role === 'oni'
  const me = Number(url.searchParams.get('me'))
  const offsetParam = url.searchParams.get('offset')

  const total = await countPlayers(env.DB, isOni)
  const myRank = Number.isInteger(me) && me > 0 ? await rankOf(env.DB, me, isOni) : null

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
  let offset = 0
  if (offsetParam !== null) {
    offset = clamp(Math.trunc(Number(offsetParam)) || 0, 0, Math.max(total - 1, 0))
  } else if (myRank !== null) {
    // 自分の上に 3 人・下に 3 人が並ぶ位置から始める。端では範囲内に収める
    offset = clamp(myRank - 1 - Math.floor(PAGE_SIZE / 2), 0, Math.max(total - PAGE_SIZE, 0))
  }

  const entries = await page(env.DB, isOni, offset, PAGE_SIZE)
  return Response.json({ total, offset, limit: PAGE_SIZE, myRank, entries })
}
