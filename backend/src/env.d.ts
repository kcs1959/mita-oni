import type { LobbyDO } from './lobby'
import type { RoomDO } from './room'

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      ROOM: DurableObjectNamespace<RoomDO>
      LOBBY: DurableObjectNamespace<LobbyDO>
    }
  }
  interface Env extends Cloudflare.Env {}
}
