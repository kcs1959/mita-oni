import { DurableObject } from 'cloudflare:workers'
import {
  COUNTDOWN_MS,
  GAME_DURATION_MS,
  MAX_QUEUED_INPUTS,
  MAZE,
  ONI_SPAWN,
  ROOM_COUNT,
  RUNNER_SPAWN,
  TICK_MS,
  isDir,
  samePos,
  step,
} from './game'
import type { RoomReport } from './lobby'
import { saveResults } from './db'
import { send, type Cell, type Dir, type EndReason, type Role } from './protocol'

interface Player {
  ws: WebSocket
  name: string
  role: Role
  pos: Cell
  /** 直前の tick での位置。すれ違い（位置の入れ替わり）判定に使う */
  prev: Cell
  inputs: Dir[]
}

type Phase =
  | { kind: 'empty' }
  | { kind: 'waiting' }
  /** 2 人そろってカウントダウン中。`until` に開始する */
  | { kind: 'ready'; until: number }
  | { kind: 'playing'; started: number }

/**
 * 2 人ルーム 1 つ分の Durable Object（"room-1" 〜 "room-50"）。
 * 移動・当たり判定・残り時間はすべてここで決める（サーバー権威）。
 *
 * WebSocket はハイバネーション API ではなく通常の accept() を使う。接続がある間は
 * DO がメモリに常駐するので、ルームの状態をストレージへ退避・復元しなくてよい。
 */
export class RoomDO extends DurableObject<Env> {
  private roomId = 0
  private phase: Phase = { kind: 'empty' }
  private players: Player[] = []
  private timer: ReturnType<typeof setInterval> | null = null

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    this.roomId = Number(url.searchParams.get('room'))
    const name = url.searchParams.get('name') ?? ''

    // 満員・対戦中なら断る。Worker は次の候補ルームを試す
    if (this.players.length >= 2 || this.phase.kind === 'ready' || this.phase.kind === 'playing') {
      return new Response('room is busy', { status: 409 })
    }

    const { 0: client, 1: server } = new WebSocketPair()
    server.accept()
    const player: Player = { ws: server, name, role: 'runner', pos: RUNNER_SPAWN, prev: RUNNER_SPAWN, inputs: [] }
    this.players.push(player)
    server.addEventListener('message', (e) => this.onMessage(player, e.data))
    server.addEventListener('close', () => this.onLeave(player))
    server.addEventListener('error', () => this.onLeave(player))

    if (this.players.length === 1) {
      this.phase = { kind: 'waiting' }
      // 自分が空室を埋めたぶん +1 する（Lobby の集計はまだこの入室を反映していない）
      const occupied = Number(url.searchParams.get('occupied') ?? 0) + 1
      send(server, { type: 'matching', roomId: this.roomId, occupiedRooms: occupied, totalRooms: ROOM_COUNT })
    } else {
      this.startCountdown()
    }
    this.report()
    return new Response(null, { status: 101, webSocket: client })
  }

  private startCountdown() {
    const oniIndex = Math.random() < 0.5 ? 0 : 1
    this.players.forEach((p, i) => {
      p.role = i === oniIndex ? 'oni' : 'runner'
      p.pos = p.role === 'oni' ? ONI_SPAWN : RUNNER_SPAWN
      p.prev = p.pos
      p.inputs = []
    })
    this.phase = { kind: 'ready', until: Date.now() + COUNTDOWN_MS }
    const [a, b] = this.players
    for (const [me, other] of [
      [a, b],
      [b, a],
    ]) {
      send(me.ws, {
        type: 'ready',
        roomId: this.roomId,
        role: me.role,
        opponent: other.name,
        countdownMs: COUNTDOWN_MS,
        durationMs: GAME_DURATION_MS,
        maze: MAZE,
        you: me.pos,
        opp: other.pos,
      })
    }
    // 対戦中（カウントダウン含む）だけゲームループを回す
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  private onMessage(player: Player, data: string | ArrayBuffer) {
    if (this.phase.kind !== 'playing' || typeof data !== 'string') return
    let msg: unknown
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }
    const m = msg as { type?: unknown; dir?: unknown }
    if (m.type === 'move' && isDir(m.dir) && player.inputs.length < MAX_QUEUED_INPUTS) {
      player.inputs.push(m.dir)
    }
  }

  private onLeave(player: Player) {
    // 決着後にこちらから閉じた接続などは、もう players にいないので何もしない
    if (!this.players.includes(player)) return
    const others = this.players.filter((p) => p !== player)
    const wasActive = this.phase.kind === 'ready' || this.phase.kind === 'playing'
    const elapsedMs = this.phase.kind === 'playing' ? Math.min(Date.now() - this.phase.started, GAME_DURATION_MS) : 0
    this.reset()
    // 対戦中に抜けられたら残った側にだけ通知して終了。記録は残さない
    if (wasActive) {
      for (const p of others) {
        send(p.ws, { type: 'end', reason: 'opponentLeft', elapsedMs })
        p.ws.close(1000, 'opponent left')
      }
    }
    this.report()
  }

  private tick() {
    const now = Date.now()
    if (this.phase.kind === 'ready' && now >= this.phase.until) {
      this.phase = { kind: 'playing', started: now }
      for (const p of this.players) send(p.ws, { type: 'start', durationMs: GAME_DURATION_MS })
      this.report()
      return
    }
    if (this.phase.kind !== 'playing') return

    // 1 tick につき 1 マスだけ動かす。連打は先行入力として次の tick 以降に回る
    for (const p of this.players) {
      p.prev = p.pos
      const dir = p.inputs.shift()
      if (dir) p.pos = step(p.pos, dir)
    }

    // 残り時間・プレイ時間は tick 回数ではなく実時間で数える（ループが遅れてもずれない）
    const elapsed = now - this.phase.started
    const [a, b] = this.players
    // 同じマスにいる、または同じ tick 内ですれ違ったらタッチ成立（マスの飛び越えを防ぐ）
    const caught = samePos(a.pos, b.pos) || (samePos(a.pos, b.prev) && samePos(b.pos, a.prev))
    if (caught) return this.finish('caught', Math.min(elapsed, GAME_DURATION_MS))
    if (elapsed >= GAME_DURATION_MS) return this.finish('timeUp', GAME_DURATION_MS)

    const remainingMs = GAME_DURATION_MS - elapsed
    send(a.ws, { type: 'state', remainingMs, you: a.pos, opp: b.pos })
    send(b.ws, { type: 'state', remainingMs, you: b.pos, opp: a.pos })
  }

  private finish(reason: EndReason, elapsedMs: number) {
    const players = this.players
    for (const p of players) send(p.ws, { type: 'end', reason, elapsedMs })
    // 先にルームを空けてから D1 に書く（保存待ちの間も次の人が入れる）
    this.reset()
    this.report()
    this.ctx.waitUntil(this.save(players, elapsedMs))
  }

  private async save(players: Player[], playTimeMs: number) {
    try {
      const ids = await saveResults(
        this.env.DB,
        players.map((p) => ({ name: p.name, playTimeMs, isOni: p.role === 'oni' })),
      )
      players.forEach((p, i) => send(p.ws, { type: 'saved', recordId: ids[i] }))
    } catch (e) {
      console.error('failed to save results', e)
    }
    for (const p of players) p.ws.close(1000, 'game over')
  }

  private reset() {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.phase = { kind: 'empty' }
    this.players = []
  }

  /** ルームの状態を Lobby に知らせる（マッチングの候補選びと /rooms 表示に使われる） */
  private report() {
    const status = this.phase.kind === 'empty' ? 'empty' : this.phase.kind === 'waiting' ? 'waiting' : 'playing'
    const endsAt =
      this.phase.kind === 'playing'
        ? this.phase.started + GAME_DURATION_MS
        : this.phase.kind === 'ready'
          ? this.phase.until + GAME_DURATION_MS
          : null
    const report: RoomReport = {
      id: this.roomId,
      status,
      players: this.players.map((p) => p.name),
      endsAt,
      at: Date.now(),
    }
    const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('main'))
    this.ctx.waitUntil(lobby.update(report).catch((e) => console.error('failed to report room', e)))
  }
}
