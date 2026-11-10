<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import type Phaser from 'phaser'
import Mascot from '../components/Mascot.vue'
import { createMazeGame, type MazeScene } from '../game/MazeScene'
import { wsUrl } from '../lib/api'
import { mmss, mmssCs, roomNo } from '../lib/format'
import type { ClientMsg, Dir, EndReason, Role, ServerMsg } from '../lib/protocol'
import { getName, setLastResult } from '../lib/session'

type Phase = 'connecting' | 'matching' | 'full' | 'ready' | 'playing' | 'ended' | 'error'

const router = useRouter()
const name = getName()

const phase = ref<Phase>('connecting')
const roomId = ref(0)
const occupiedRooms = ref(0)
const totalRooms = ref(50)
const role = ref<Role>('runner')
const opponent = ref('')
const durationMs = ref(180_000)
const remainingMs = ref(180_000)
const countdown = ref(3)
const endReason = ref<EndReason>('caught')
const elapsedMs = ref(0)
const recordId = ref<number | null>(null)

const canvasHost = ref<HTMLDivElement>()
const game = shallowRef<{ game: Phaser.Game; scene: () => MazeScene | null }>()
let ws: WebSocket | null = null
let countdownTimer: number | undefined

const roleLabel = computed(() => (role.value === 'oni' ? '鬼 / ONI' : '逃げ / RUNNER'))
const roleColor = computed(() => (role.value === 'oni' ? 'var(--red)' : 'var(--cyan)'))
const progress = computed(() => 1 - remainingMs.value / durationMs.value)

function send(msg: ClientMsg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

// 押した瞬間（pointerdown）に 1 回だけ送る。押しっぱなしでは繰り返さないので、移動するには連打が必要
function move(dir: Dir) {
  if (phase.value === 'playing') send({ type: 'move', dir })
}

function destroyGame() {
  game.value?.game.destroy(true)
  game.value = undefined
}

async function onMessage(msg: ServerMsg) {
  switch (msg.type) {
    case 'matching':
      phase.value = 'matching'
      roomId.value = msg.roomId
      occupiedRooms.value = msg.occupiedRooms
      totalRooms.value = msg.totalRooms
      break
    case 'full':
      phase.value = 'full'
      break
    case 'ready': {
      phase.value = 'ready'
      roomId.value = msg.roomId
      role.value = msg.role
      opponent.value = msg.opponent
      durationMs.value = msg.durationMs
      remainingMs.value = msg.durationMs
      // カウントダウンの表示はクライアント側で進める。実際の開始はサーバーの start で決まる
      const startAt = performance.now() + msg.countdownMs
      countdown.value = Math.ceil(msg.countdownMs / 1000)
      countdownTimer = window.setInterval(() => {
        countdown.value = Math.max(1, Math.ceil((startAt - performance.now()) / 1000))
      }, 100)
      await nextTick()
      if (canvasHost.value) {
        game.value = createMazeGame(canvasHost.value, { maze: msg.maze, role: msg.role, you: msg.you, opp: msg.opp })
      }
      break
    }
    case 'start':
      clearInterval(countdownTimer)
      phase.value = 'playing'
      break
    case 'state':
      remainingMs.value = msg.remainingMs
      game.value?.scene()?.setPositions(msg.you, msg.opp)
      break
    case 'end':
      clearInterval(countdownTimer)
      endReason.value = msg.reason
      elapsedMs.value = msg.elapsedMs
      phase.value = 'ended'
      destroyGame()
      break
    case 'saved':
      recordId.value = msg.recordId
      setLastResult({ role: role.value, recordId: msg.recordId })
      break
  }
}

function connect() {
  ws = new WebSocket(wsUrl(`/api/ws/play?name=${encodeURIComponent(name)}`))
  ws.onmessage = (e) => onMessage(JSON.parse(e.data) as ServerMsg)
  ws.onclose = () => {
    // 決着後・満室時はサーバー側から閉じるので正常
    if (phase.value !== 'ended' && phase.value !== 'full') phase.value = 'error'
    ws = null
  }
}

function leave() {
  router.push('/')
}

function toRanking() {
  const query: Record<string, string> = { role: role.value }
  if (recordId.value !== null) query.me = String(recordId.value)
  router.push({ path: '/ranking', query })
}

onMounted(() => {
  if (!name) {
    router.replace('/')
    return
  }
  connect()
})

onBeforeUnmount(() => {
  clearInterval(countdownTimer)
  if (ws) {
    ws.onclose = null
    ws.close()
  }
  destroyGame()
})
</script>

<template>
  <!-- 02 · マッチング -->
  <main v-if="phase === 'connecting' || phase === 'matching'" class="screen center">
    <span class="step">02 / MATCHING</span>
    <div class="matching">
      <span class="chip" style="color: var(--lime)">● ONLINE {{ occupiedRooms }} / {{ totalRooms }} ROOMS</span>
      <h1 class="title">対戦相手を<br />探しています...</h1>
      <div class="radar">
        <span class="ring r1" />
        <span class="ring r2" />
        <span class="ring r3" />
        <span class="beacon" />
        <Mascot class="radar-me" color="var(--cyan)" :size="54" halo />
      </div>
      <div class="panel match-card">
        <Mascot color="var(--cyan)" :size="44" halo :mouth="false" />
        <div>
          <div class="joined">あなた • {{ name }}</div>
          <div class="muted small">対戦相手の参加を待っています</div>
        </div>
        <div class="track"><span class="bar" /></div>
      </div>
      <p class="muted small">自動で空いている2人ルームに入ります</p>
      <button class="btn btn-secondary" @click="leave">マッチングをキャンセル</button>
    </div>
  </main>

  <!-- 満室・切断 -->
  <main v-else-if="phase === 'full' || phase === 'error'" class="screen center">
    <div class="notice">
      <h1 class="title">{{ phase === 'full' ? '満室です' : '接続が切れました' }}</h1>
      <p class="muted">
        {{ phase === 'full' ? '全てのルームが使用中です。しばらくしてからもう一度お試しください。' : 'もう一度はじめからお試しください。' }}
      </p>
      <button class="btn btn-primary" @click="leave">ゲームに戻る</button>
    </div>
  </main>

  <!-- 03 · START / 04 · プレイ中 -->
  <main v-else-if="phase === 'ready' || phase === 'playing'" class="screen play">
    <section class="field">
      <div ref="canvasHost" class="canvas-host" />
      <div v-if="phase === 'ready'" class="veil">
        <div class="modal">
          <span class="chip" style="background: var(--panel-deep); color: var(--cyan)">ROOM #{{ roomNo(roomId) }} • 2/2</span>
          <div class="ready">READY?</div>
          <div class="count">{{ countdown }}</div>
          <div class="assign">あなたは「{{ role === 'oni' ? '鬼' : '逃げ' }}」！</div>
          <div class="muted small">
            {{ role === 'oni' ? '逃げをできるだけ早くつかまえよう' : '鬼につかまらず、180秒逃げ切ろう' }}
          </div>
          <div class="muted tiny">3 → 2 → 1 のカウントダウン後に開始 • 相手：{{ opponent }}</div>
        </div>
      </div>
    </section>

    <aside class="hud">
      <span class="step">{{ phase === 'ready' ? '03 / READY' : '04 / PLAYING' }}</span>
      <div class="badges">
        <span class="chip" :style="{ color: roleColor }">● {{ roleLabel }}</span>
        <span class="chip">ROOM {{ roomNo(roomId) }}</span>
      </div>
      <div class="timer">
        <span class="muted">残り時間</span>
        <span class="timer-value">{{ mmss(remainingMs) }}</span>
      </div>
      <div class="progress"><span :style="{ width: `${progress * 100}%` }" /></div>

      <div class="controls">
        <div class="controls-head">
          <span class="step">TAP TO MOVE</span>
          <span class="muted tiny">長押し無効・連打で移動</span>
        </div>
        <div class="dpad" @contextmenu.prevent>
          <button class="key up" :disabled="phase !== 'playing'" @pointerdown.prevent="move('up')">▲</button>
          <button class="key left" :disabled="phase !== 'playing'" @pointerdown.prevent="move('left')">◀</button>
          <button class="key down" :disabled="phase !== 'playing'" @pointerdown.prevent="move('down')">▼</button>
          <button class="key right" :disabled="phase !== 'playing'" @pointerdown.prevent="move('right')">▶</button>
        </div>
      </div>
    </aside>
  </main>

  <!-- 06 · タッチ成功 -->
  <main v-else-if="endReason === 'caught'" class="screen center">
    <span class="step">06 / TAG!</span>
    <div class="result">
      <span class="chip" style="color: var(--lime)">● TAG SUCCESS!</span>
      <h1 class="touch">タッチ！</h1>
      <div class="en">GOTCHA!</div>
      <div class="impact">
        <Mascot class="f-oni" color="var(--red)" :size="96" halo />
        <Mascot class="f-runner" color="var(--cyan)" :size="74" halo />
      </div>
      <div class="panel result-panel">
        <div class="muted detail">ROOM #{{ roomNo(roomId) }} • 鬼の勝利</div>
        <div class="big-time">{{ mmssCs(elapsedMs) }}</div>
        <div class="muted small">捕まえるまでにかかった時間</div>
      </div>
      <button class="btn btn-primary" @click="toRanking">ランキングを見る →</button>
    </div>
  </main>

  <!-- 07 · タイムアップ -->
  <main v-else-if="endReason === 'timeUp'" class="screen center">
    <span class="step">07 / TIME UP</span>
    <div class="result">
      <span class="chip" style="color: var(--cyan)">● TIME LIMIT</span>
      <h1 class="timeup">TIME UP!</h1>
      <div class="muted sub">180秒が経過しました</div>
      <div class="clock"><span>00:00</span></div>
      <div class="panel result-panel">
        <div class="victor">逃げ切り成功！</div>
        <div class="muted">逃げ側の勝利 • 生存時間 {{ mmss(elapsedMs) }}</div>
      </div>
      <button class="btn btn-primary" @click="toRanking">ランキングを見る →</button>
    </div>
  </main>

  <!-- 相手の切断 -->
  <main v-else class="screen center">
    <div class="notice">
      <h1 class="title">相手が切断しました</h1>
      <p class="muted">このゲームは記録されません。</p>
      <button class="btn btn-primary" @click="leave">ゲームに戻る</button>
    </div>
  </main>
</template>

<style scoped>
.center {
  align-items: center;
}

.center > .step {
  align-self: flex-start;
}

.small {
  font-size: 14px;
}

.tiny {
  font-size: 12px;
}

.title {
  margin: 0;
  font-size: 44px;
  line-height: 1.35;
  text-align: center;
}

.matching,
.notice {
  flex: 1;
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  text-align: center;
}

/* レーダー */
.radar {
  position: relative;
  width: 220px;
  height: 220px;
  display: grid;
  place-items: center;
}

.ring {
  position: absolute;
  border-radius: 50%;
  border: 1.6px solid var(--cyan);
  background: rgb(120 232 240 / 4%);
  animation: pulse 2.4s ease-out infinite;
}

.r1 {
  inset: 0;
}

.r2 {
  inset: 24px;
  animation-delay: 0.3s;
}

.r3 {
  inset: 48px;
  animation-delay: 0.6s;
}

.beacon {
  position: absolute;
  top: 24px;
  right: 22px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--lime);
}

@keyframes pulse {
  50% {
    opacity: 0.45;
  }
}

.match-card {
  width: 100%;
  padding: 24px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 16px;
  align-items: center;
  text-align: left;
}

.joined {
  font-weight: 700;
  font-size: 18px;
}

.track {
  grid-column: 1 / -1;
  height: 6px;
  margin-top: 12px;
  border-radius: 3px;
  background: var(--bg);
  overflow: hidden;
}

.bar {
  display: block;
  width: 40%;
  height: 100%;
  border-radius: 3px;
  background: var(--lime);
  animation: slide 1.6s ease-in-out infinite alternate;
}

@keyframes slide {
  from {
    transform: translateX(-20%);
  }
  to {
    transform: translateX(170%);
  }
}

/* プレイ画面 */
.play {
  flex-direction: row;
  gap: 40px;
  height: 100vh;
  padding: 32px 40px;
}

.field {
  position: relative;
  flex: 1;
  min-width: 0;
  border-radius: 17px;
  overflow: hidden;
  background: var(--field);
}

.canvas-host {
  position: absolute;
  inset: 0;
}

.veil {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(16 23 40 / 70%);
}

.modal {
  width: min(420px, 90%);
  padding: 32px;
  border-radius: 26px;
  background: var(--panel);
  border: 1.5px solid #4e617b;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.ready {
  font-size: 48px;
  font-weight: 700;
}

.count {
  font-size: 120px;
  line-height: 1;
  font-weight: 700;
  color: var(--lime);
}

.assign {
  font-size: 24px;
  font-weight: 700;
}

.hud {
  width: 360px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.badges {
  display: flex;
  justify-content: space-between;
}

.timer {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.timer-value {
  font-size: 48px;
  font-weight: 700;
  color: var(--lime);
  font-variant-numeric: tabular-nums;
}

.progress {
  height: 6px;
  border-radius: 3px;
  background: var(--panel);
  overflow: hidden;
}

.progress span {
  display: block;
  height: 100%;
  background: var(--lime);
  border-radius: 3px;
}

.controls {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.controls-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.dpad {
  display: grid;
  grid-template-columns: repeat(3, 96px);
  grid-template-rows: repeat(2, 96px);
  gap: 10px;
  justify-content: center;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.key {
  border-radius: 20px;
  background: var(--panel);
  color: var(--text);
  font-size: 22px;
  font-weight: 700;
  -webkit-touch-callout: none;
}

.key:active:not(:disabled) {
  background: var(--lime);
  color: var(--bg);
}

.key:disabled {
  opacity: 0.5;
  cursor: default;
}

.up {
  grid-column: 2;
  grid-row: 1;
}

.left {
  grid-column: 1;
  grid-row: 2;
}

.down {
  grid-column: 2;
  grid-row: 2;
}

.right {
  grid-column: 3;
  grid-row: 2;
}

/* 結果画面 */
.result {
  flex: 1;
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
}

.touch {
  margin: 0;
  line-height: 1.1;
  font-size: 80px;
  color: var(--yellow);
}

.en {
  font-size: 36px;
  font-weight: 700;
}

.impact {
  position: relative;
  width: 210px;
  height: 210px;
  border-radius: 50%;
  border: 2px solid var(--yellow);
  background: rgb(255 227 122 / 7%);
}

.f-oni {
  position: absolute;
  left: 22px;
  top: 34px;
}

.f-runner {
  position: absolute;
  right: 14px;
  bottom: 30px;
}

.result-panel {
  width: 100%;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail {
  font-weight: 700;
}

.big-time {
  font-size: 44px;
  font-weight: 700;
  color: var(--lime);
  font-variant-numeric: tabular-nums;
}

.timeup {
  margin: 0;
  line-height: 1.1;
  font-size: 72px;
}

.sub {
  font-size: 22px;
  font-weight: 700;
}

.clock {
  width: 210px;
  height: 210px;
  border-radius: 50%;
  border: 2px solid var(--cyan);
  display: grid;
  place-items: center;
}

.clock span {
  width: 152px;
  height: 152px;
  border-radius: 50%;
  background: var(--panel);
  display: grid;
  place-items: center;
  font-size: 34px;
  font-weight: 700;
  color: var(--cyan);
}

.victor {
  font-size: 26px;
  font-weight: 700;
  color: var(--lime);
}
</style>
