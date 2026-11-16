import { normalizeName } from './game'
import { send } from './protocol'
import { handleRanking } from './ranking'

// Durable Objects
export { LobbyDO } from './lobby'
export { RoomDO } from './room'

const lobbyOf = (env: Env) => env.LOBBY.get(env.LOBBY.idFromName('main'))
const roomOf = (env: Env, id: number) => env.ROOM.get(env.ROOM.idFromName(`room-${id}`))

const isUpgrade = (req: Request) => req.headers.get('Upgrade')?.toLowerCase() === 'websocket'

/**
 * 待機中 → 空室の順にルームへ WebSocket を中継する。
 * Lobby の情報は少し古いことがあるので、ルームが 409（満員・対戦中）を返したら次の候補を試す。
 */
async function joinRoom(req: Request, url: URL, env: Env): Promise<Response> {
  const name = normalizeName(url.searchParams.get('name'))
  if (!name) return new Response('name is required', { status: 400 })

  const { order, occupied } = await lobbyOf(env).candidates()
  for (const id of order) {
    const target = new URL(url)
    target.search = new URLSearchParams({ room: String(id), name, occupied: String(occupied) }).toString()
    const res = await roomOf(env, id).fetch(new Request(target, req))
    if (res.status !== 409) return res
  }

  // 全ルームが埋まっている。クライアントには WebSocket 経由で伝える
  const { 0: client, 1: server } = new WebSocketPair()
  server.accept()
  send(server, { type: 'full' })
  server.close(1000, 'full')
  return new Response(null, { status: 101, webSocket: client })
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url)
    switch (url.pathname) {
      case '/api/ws/play':
        return isUpgrade(req) ? joinRoom(req, url, env) : new Response('Expected WebSocket upgrade', { status: 426 })
      case '/api/ws/rooms':
        return isUpgrade(req)
          ? lobbyOf(env).fetch(req)
          : new Response('Expected WebSocket upgrade', { status: 426 })
      case '/api/ranking':
        return req.method === 'GET' ? handleRanking(url, env) : new Response('Method Not Allowed', { status: 405 })
      default:
        return new Response('Not Found', { status: 404 })
    }
  },
} satisfies ExportedHandler<Env>
