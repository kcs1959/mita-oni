import type { RankingResponse, Role } from './protocol'

export function wsUrl(path: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}${path}`
}

export async function fetchRanking(role: Role, opts: { me?: number; offset?: number }): Promise<RankingResponse> {
  const params = new URLSearchParams({ role })
  if (opts.me !== undefined) params.set('me', String(opts.me))
  if (opts.offset !== undefined) params.set('offset', String(opts.offset))
  const res = await fetch(`/api/ranking?${params}`)
  if (!res.ok) throw new Error(`ranking: ${res.status}`)
  return res.json()
}
