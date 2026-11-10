import { DurableObject } from 'cloudflare:workers'
import { GAME_DURATION_MS, ROOM_COUNT } from './game'
import { send, type RoomStatus, type RoomView } from './protocol'

/** 各ルームが状態変化のたびに送ってくる報告 */
export interface RoomReport {
  id: number
  status: RoomStatus
  players: string[]
  /** 対戦の終了予定時刻（epoch ms）。対戦中以外は null */
  endsAt: number | null
  /** 報告した時刻。RPC の到着順が前後しても古い報告で上書きしないために使う */
  at: number
}

/** /rooms 監視画面へ定期送信する間隔（残り時間の表示更新用） */
const MONITOR_PUSH_MS = 1_000
const STORAGE_KEY = 'rooms'

const emptyReport = (id: number): RoomReport => ({ id, status: 'empty', players: [], endsAt: null, at: 0 })

/**
 * 全ルームの状況を集約する Durable Object（1 インスタンス "main"）。
 * - Worker にマッチング候補のルーム順を返す（実際に入れるかは各ルームが決める）
 * - /rooms 監視画面の WebSocket に一覧を配信する
 *
 * 監視用 WebSocket はハイバネーション API で受ける。一覧はストレージにも保存しているので、
 * DO がメモリから退避されても復元できる。
 */
export class LobbyDO extends DurableObject<Env> {
  private rooms = new Map<number, RoomReport>()
  private pushTimer: ReturnType<typeof setInterval> | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      for (let id = 1; id <= ROOM_COUNT; id++) this.rooms.set(id, emptyReport(id))
      const saved = await ctx.storage.get<RoomReport[]>(STORAGE_KEY)
      for (const r of saved ?? []) this.rooms.set(r.id, r)
    })
  }

  /** 相手が待っているルームを優先し、次に空室。対戦中のルームは含めない */
  candidates(): { order: number[]; occupied: number } {
    const all = [...this.rooms.values()]
    const order = [
      ...all.filter((r) => r.status === 'waiting').map((r) => r.id),
      ...all.filter((r) => r.status === 'empty').map((r) => r.id),
    ]
    return { order, occupied: all.filter((r) => r.status !== 'empty').length }
  }

  async update(report: RoomReport): Promise<void> {
    const current = this.rooms.get(report.id)
    if (current && current.at > report.at) return
    this.rooms.set(report.id, report)
    await this.ctx.storage.put(STORAGE_KEY, [...this.rooms.values()])
    this.broadcast()
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    send(server, this.snapshot())
    this.syncPushTimer()
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage() {
    // 監視画面からのメッセージは受け付けない
  }

  async webSocketClose(ws: WebSocket) {
    ws.close()
    this.syncPushTimer()
  }

  private snapshot() {
    const now = Date.now()
    const rooms: RoomView[] = [...this.rooms.values()]
      .sort((a, b) => a.id - b.id)
      .map((r) => ({
        id: r.id,
        status: r.status,
        players: r.players,
        remainingMs:
          r.status === 'playing' && r.endsAt !== null
            ? Math.min(GAME_DURATION_MS, Math.max(0, r.endsAt - now))
            : null,
      }))
    const count = (s: RoomStatus) => rooms.filter((r) => r.status === s).length
    return {
      type: 'rooms' as const,
      rooms,
      playing: count('playing'),
      waiting: count('waiting'),
      total: ROOM_COUNT,
    }
  }

  private broadcast() {
    const sockets = this.ctx.getWebSockets()
    if (sockets.length > 0) {
      const msg = this.snapshot()
      for (const ws of sockets) send(ws, msg)
    }
    this.syncPushTimer()
  }

  /** 監視者がいて、かつ対戦中のルームがあるときだけ 1 秒ごとに配信する */
  private syncPushTimer() {
    const needed =
      this.ctx.getWebSockets().length > 0 && [...this.rooms.values()].some((r) => r.status === 'playing')
    if (needed && this.pushTimer === null) {
      this.pushTimer = setInterval(() => this.broadcast(), MONITOR_PUSH_MS)
    } else if (!needed && this.pushTimer !== null) {
      clearInterval(this.pushTimer)
      this.pushTimer = null
    }
  }
}
