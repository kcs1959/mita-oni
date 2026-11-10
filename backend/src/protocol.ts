// WebSocket で送受信する JSON メッセージの定義。
// frontend/src/lib/protocol.ts と同じ形を保つこと。

export type Role = 'oni' | 'runner'
export type Dir = 'up' | 'down' | 'left' | 'right'
export type EndReason = 'caught' | 'timeUp' | 'opponentLeft'
export type Cell = [x: number, y: number]

export type ClientMsg = { type: 'move'; dir: Dir }

export type RoomStatus = 'empty' | 'waiting' | 'playing'

export interface RoomView {
  id: number
  status: RoomStatus
  players: string[]
  remainingMs: number | null
}

export type ServerMsg =
  | { type: 'matching'; roomId: number; occupiedRooms: number; totalRooms: number }
  | { type: 'full' }
  | {
      type: 'ready'
      roomId: number
      role: Role
      opponent: string
      countdownMs: number
      durationMs: number
      maze: readonly string[]
      you: Cell
      opp: Cell
    }
  | { type: 'start'; durationMs: number }
  | { type: 'state'; remainingMs: number; you: Cell; opp: Cell }
  | { type: 'end'; reason: EndReason; elapsedMs: number }
  | { type: 'saved'; recordId: number }
  | { type: 'rooms'; rooms: RoomView[]; playing: number; waiting: number; total: number }

export function send(ws: WebSocket, msg: ServerMsg) {
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    // 既に閉じている接続への送信は無視する
  }
}
