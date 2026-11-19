<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import type Phaser from 'phaser'
import routeReady from '../assets/figma/route-ready.svg'
import routeResult from '../assets/figma/route-result.svg'
import radarOuter from '../assets/figma/radar-outer.svg'
import radarMiddle from '../assets/figma/radar-middle.svg'
import radarInner from '../assets/figma/radar-inner.svg'
import Mascot from '../components/Mascot.vue'
import ControlStick from '../components/ControlStick.vue'
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
const tapEffects = ref<{ id: number; x: number; y: number }[]>([])
let nextTapId = 0
const game = shallowRef<{ game: Phaser.Game; scene: () => MazeScene | null }>()
let ws: WebSocket | null = null
let countdownTimer: number | undefined
const mobileControls = ref(false)
let controlMedia: MediaQueryList | undefined
const heldKeys = new Map<string, Dir>()
let stickDirection: Dir | null = null
let heldDirection: Dir | null = null
let movementTimer: number | undefined
const KEY_DIRECTIONS: Record<string, Dir> = {
  KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right',
  ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right',
}
const MOVE_INTERVAL_MS = 120

const roleColor = computed(() => (role.value === 'oni' ? 'var(--red)' : 'var(--cyan)'))
const roleLabel = computed(() => (role.value === 'oni' ? '鬼' : '逃げ'))
const progress = computed(() => Math.max(0, Math.min(1, remainingMs.value / durationMs.value)))
// 鬼は捕まえたら勝ち、逃げは時間切れまで逃げ切ったら勝ち。
const isWin = computed(() => (endReason.value === 'caught') === (role.value === 'oni'))

function send(msg: ClientMsg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

// 画面上の矢印ボタンは従来どおり1回押すごとに1マス移動する。
function move(dir: Dir) {
  if (phase.value === 'playing') send({ type: 'move', dir })
}

function updateMovement() {
  const next = stickDirection ?? [...heldKeys.values()].at(-1) ?? null
  if (next === heldDirection) return
  clearInterval(movementTimer)
  movementTimer = undefined
  heldDirection = next
  if (next && phase.value === 'playing') {
    move(next)
    movementTimer = window.setInterval(() => {
      if (heldDirection) move(heldDirection)
    }, MOVE_INTERVAL_MS)
  }
}

function setStickDirection(dir: Dir | null) {
  stickDirection = dir
  updateMovement()
}

function resetMovement() {
  heldKeys.clear()
  stickDirection = null
  updateMovement()
}

function onKeyDown(event: KeyboardEvent) {
  const target = event.target
  if (phase.value !== 'playing' || event.metaKey || event.ctrlKey || event.altKey || event.isComposing ||
    (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select')))) return
  const dir = KEY_DIRECTIONS[event.code]
  if (!dir) return
  event.preventDefault()
  if (event.repeat || heldKeys.has(event.code)) return
  heldKeys.set(event.code, dir)
  updateMovement()
}

function onKeyUp(event: KeyboardEvent) {
  if (!heldKeys.delete(event.code)) return
  event.preventDefault()
  updateMovement()
}

function onVisibilityChange() {
  if (document.hidden) resetMovement()
}

function updateControlMode() {
  mobileControls.value = controlMedia?.matches ?? false
  resetMovement()
}

function getScreenCharacters() {
  const current = game.value
  const scene = current?.scene()
  if (!current || !scene) return []
  const bounds = current.game.canvas.getBoundingClientRect()
  const scaleX = bounds.width / current.game.scale.gameSize.width
  const scaleY = bounds.height / current.game.scale.gameSize.height
  return scene.getVisibleCharacters().map((character) => ({
    x: bounds.left + character.x * scaleX,
    y: bounds.top + character.y * scaleY,
    radius: character.radius * Math.max(scaleX, scaleY),
  }))
}

watch(phase, (next) => {
  if (next !== 'playing') resetMovement()
})

function showTap(event: PointerEvent) {
  if (phase.value !== 'playing' || event.button !== 0) return
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  tapEffects.value.push({ id: nextTapId++, x: event.clientX - bounds.left, y: event.clientY - bounds.top })
}

function removeTap(id: number) {
  tapEffects.value = tapEffects.value.filter((effect) => effect.id !== id)
}

function destroyGame() {
  resetMovement()
  tapEffects.value = []
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
      await nextTick()
      game.value?.game.scale.getParentBounds()
      game.value?.game.scale.refresh()
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
  controlMedia = window.matchMedia('(pointer: coarse)')
  updateControlMode()
  controlMedia.addEventListener('change', updateControlMode)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', resetMovement)
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (!name) {
    router.replace('/')
    return
  }
  connect()
})

onBeforeUnmount(() => {
  controlMedia?.removeEventListener('change', updateControlMode)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', resetMovement)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clearInterval(countdownTimer)
  if (ws) {
    ws.onclose = null
    ws.close()
  }
  destroyGame()
})
</script>

<template>
  <main v-if="phase === 'connecting' || phase === 'matching'" class="screen matching">
    <header><h1>対戦相手を検索中</h1></header>
    <div class="panel radar" role="status" aria-label="対戦相手を検索中">
      <span class="chip searching">検索中</span>
      <img class="ring" :src="radarOuter" width="234" height="234" alt="" />
      <img class="ring" :src="radarMiddle" width="172" height="172" alt="" />
      <img class="ring" :src="radarInner" width="110" height="110" alt="" />
      <Mascot color="var(--cyan)" :size="90" />
    </div>
    <div class="panel participants">
      <div><strong class="player-name">{{ name }}</strong><span class="joined">あなた ・ 参加済み</span></div>
      <div><strong>対戦相手</strong><span class="muted">参加を待っています</span></div>
    </div>
    <p class="occupancy muted">稼働中 {{ occupiedRooms }} / {{ totalRooms }} ルーム</p>
    <div class="bottom-actions"><button class="btn btn-secondary" @click="leave">キャンセル</button></div>
  </main>

  <main v-else-if="phase === 'full' || phase === 'error'" class="screen notice">
    <span class="step">対戦ロビー</span>
    <h1>{{ phase === 'full' ? '満室です' : '接続が切れました' }}</h1>
    <p class="muted">{{ phase === 'full' ? '全てのルームが使用中です。しばらくしてからもう一度お試しください。' : 'もう一度はじめからお試しください。' }}</p>
    <div class="bottom-actions"><button class="btn btn-primary" @click="leave">ホームに戻る</button></div>
  </main>

  <main v-else-if="phase === 'ready' || phase === 'playing'" class="screen play" :class="{ 'ready-phase': phase === 'ready', 'touch-controls': mobileControls }">
    <template v-if="phase === 'ready'">
      <header>
        <span class="step">room {{ roomNo(roomId) }}</span>
        <h1>対戦準備</h1>
        <p class="page-description">2人そろいました。相手：{{ opponent }}</p>
      </header>
      <section class="panel route-panel ready-card" :style="{ '--role-color': roleColor }">
        <img class="route-art" :src="routeReady" alt="" />
        <span class="chip role-chip">あなたの役割 ・ {{ roleLabel }}</span>
        <Mascot :color="roleColor" :size="106" />
        <div class="count" role="status" aria-live="polite">{{ countdown }}</div>
        <p>{{ role === 'oni' ? '逃げをできるだけ早くつかまえよう。' : `鬼につかまらず、${durationMs / 1000}秒逃げ切ろう。` }}</p>
        <span class="muted small">{{ mobileControls ? 'スティックをスワイプして移動・指を離すと停止' : 'WASD・矢印キー、または方向ボタンで移動' }}</span>
      </section>
      <p class="countdown-note muted">カウントダウン後に自動で対戦開始</p>
    </template>

    <div v-if="phase === 'playing'" class="hud">
      <div class="hud-header">
        <div class="player-role" :style="{ '--role-color': roleColor }">
          <Mascot :color="roleColor" :size="32" />
          <div class="role-text">
            <span class="small">あなたの役割</span>
            <strong>{{ roleLabel }}</strong>
          </div>
        </div>
        <div class="timer">
          <span class="muted small">ルーム #{{ roomNo(roomId) }}</span>
          <strong class="small">残り時間</strong>
          <span class="timer-value">{{ mmss(remainingMs) }}</span>
        </div>
      </div>
      <div class="progress" role="progressbar" aria-label="残り時間" :aria-valuenow="Math.ceil(remainingMs / 1000)" :aria-valuemax="durationMs / 1000" :aria-valuemin="0"><span :style="{ width: `${progress * 100}%` }" /></div>
    </div>
    <section class="field" aria-label="対戦マップ" @pointerdown="showTap">
      <div ref="canvasHost" class="canvas-host" />
      <span class="fog-label muted">視界外</span>
      <div class="tap-effects" aria-hidden="true">
        <span v-for="effect in tapEffects" :key="effect.id" class="tap-effect" :style="{ left: `${effect.x}px`, top: `${effect.y}px`, color: roleColor }" @animationend="removeTap(effect.id)" />
      </div>
      <ControlStick v-if="phase === 'playing' && mobileControls" :get-characters="getScreenCharacters" @direction="setStickDirection" />
    </section>
    <div v-if="phase === 'playing' && mobileControls" class="stick-help">
      <strong>スティックをスワイプして移動</strong>
      <span class="muted small">倒した方向へ進む・指を離すと停止</span>
    </div>
    <div v-else-if="phase === 'playing'" class="controls">
      <strong>方向をタップして1マス移動</strong>
      <span class="muted small">WASD・矢印キーは長押しで連続移動</span>
      <div class="dpad" @contextmenu.prevent>
        <button class="key up" aria-label="上に移動" @pointerdown.prevent="move('up')" @click="(event) => { if (event.detail === 0) move('up') }">↑</button>
        <button class="key left" aria-label="左に移動" @pointerdown.prevent="move('left')" @click="(event) => { if (event.detail === 0) move('left') }">←</button>
        <button class="key down" aria-label="下に移動" @pointerdown.prevent="move('down')" @click="(event) => { if (event.detail === 0) move('down') }">↓</button>
        <button class="key right" aria-label="右に移動" @pointerdown.prevent="move('right')" @click="(event) => { if (event.detail === 0) move('right') }">→</button>
      </div>
    </div>
  </main>

  <main v-else-if="endReason === 'caught' || endReason === 'timeUp'" class="screen result">
    <header>
      <span class="step">room {{ roomNo(roomId) }}</span>
      <h1 class="result-title">
        {{ isWin ? 'Win!' : 'Lose...' }}
        <small>{{ isWin ? 'あなたの勝ち' : 'あなたの負け' }}</small>
      </h1>
      <p class="page-description">{{ endReason === 'caught' ? '鬼が逃げをつかまえました。' : `制限時間の${durationMs / 1000}秒を逃げ切りました。` }}</p>
    </header>
    <section class="panel route-panel result-card" :style="{ '--winner-color': endReason === 'caught' ? 'var(--red)' : 'var(--cyan)' }">
      <img class="route-art" :src="routeResult" alt="" />
      <div class="result-badges"><span class="chip winner">{{ endReason === 'caught' ? '▲ 鬼の勝利' : '◇ 逃げの勝利' }}</span><span class="chip kcs-chip">KCS × 三田祭 2026</span></div>
      <Mascot :color="endReason === 'caught' ? 'var(--red)' : 'var(--cyan)'" :size="148" />
      <strong class="result-word">{{ endReason === 'caught' ? 'TAG!' : 'TIME UP' }}</strong>
    </section>
    <div class="panel result-record"><span class="muted">{{ endReason === 'caught' ? '捕まえるまでの時間' : '生存時間' }}</span><strong>{{ mmssCs(elapsedMs) }}</strong></div>
    <div class="bottom-actions"><button class="btn btn-primary" @click="toRanking">ランキングを見る</button></div>
  </main>

  <main v-else class="screen notice">
    <span class="step">対戦終了</span><h1>相手が切断しました</h1><p class="muted">このゲームは記録されません。</p>
    <div class="bottom-actions"><button class="btn btn-primary" @click="leave">ホームに戻る</button></div>
  </main>
</template>

<style scoped>
.small { font-size: 13px; }
.radar { position: relative; height: 300px; display: grid; place-items: center; margin-top: 6px; flex: none; }
.ring { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
.searching { position: absolute; top: 18px; left: 18px; color: var(--cyan); }
.participants { display: grid; grid-template-columns: 1fr 1fr; padding: 16px; margin-top: 24px; min-height: 105px; border-radius: 16px; }
.participants > div { min-width: 0; display: flex; flex-direction: column; gap: 12px; font-size: 13px; }
.participants > div + div { border-left: 1px solid var(--edge); padding-left: 16px; }
.participants strong { font-size: 18px; }
.player-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.joined { color: var(--cyan); }
.occupancy { text-align: center; font-size: 14px; margin: 28px 0; }
.ready-card { display: flex; flex-direction: column; align-items: center; min-height: 400px; padding: 18px 16px 40px; text-align: center; }
.role-chip { align-self: flex-start; color: var(--role-color); }
.ready-card .mascot { margin-top: 18px; }
.count { font-size: 66px; font-weight: 900; color: var(--role-color); line-height: 1.2; }
.ready-card p { font-size: 16px; margin: 16px 0; }
.countdown-note { text-align: center; font-size: 15px; margin-top: auto; padding-top: 32px; }
.play { gap: 18px; }
.play.ready-phase { gap: 0; }
.ready-phase .field { visibility: hidden; position: absolute; top: 190px; left: 24px; right: 24px; height: 400px; }
.hud { display: flex; flex-direction: column; gap: 12px; }
.hud-header { display: flex; justify-content: space-between; align-items: stretch; gap: 8px; }
.player-role {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--role-color);
  border-radius: 14px;
  background: color-mix(in srgb, var(--role-color) 12%, var(--panel-deep));
  color: var(--role-color);
}
.role-text, .timer { display: flex; flex-direction: column; justify-content: center; gap: 2px; }
.role-text { white-space: nowrap; }
.role-text strong { font-size: 32px; font-weight: 900; line-height: 1.1; }
.timer { align-items: flex-end; white-space: nowrap; }
.timer-value { font-size: 37px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1.05; }
.progress { height: 6px; border-radius: 3px; overflow: hidden; background: var(--border); }
.progress span { display: block; height: 100%; background: var(--cyan); border-radius: 3px; transition: width .1s linear; }
.field { position: relative; height: clamp(260px, 48svh, 450px); border-radius: 15px; overflow: hidden; background: var(--field); flex: none; }
.canvas-host, .tap-effects { position: absolute; inset: 0; }
.fog-label { position: absolute; left: 12px; top: 12px; font-size: 11px; pointer-events: none; }
.tap-effects { pointer-events: none; }
.tap-effect { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; border: 2px solid currentColor; border-radius: 50%; box-shadow: 0 0 12px currentColor; animation: tap-ripple 450ms ease-out forwards; }
@keyframes tap-ripple { from { opacity: .9; transform: scale(.25); } to { opacity: 0; transform: scale(1.4); } }
.controls { display: flex; flex-direction: column; gap: 6px; }
.controls > strong { font-size: 15px; }
.stick-help { display: flex; flex-direction: column; gap: 6px; font-size: 15px; }
.touch-controls .field { height: auto; aspect-ratio: 13 / 17; }
.dpad { display: grid; grid-template-columns: repeat(3, 60px); grid-template-rows: repeat(2, 60px); gap: 8px; justify-content: center; touch-action: none; user-select: none; -webkit-user-select: none; }
.key { border-radius: 19px; border: 1px solid var(--edge); box-shadow: var(--raised); background: var(--panel); color: var(--text); font-size: 28px; font-weight: 700; -webkit-touch-callout: none; }
.key:active { background: var(--lime); color: var(--bg); box-shadow: var(--inset); }
.up { grid-column: 2; grid-row: 1; }.left { grid-column: 1; grid-row: 2; }.down { grid-column: 2; grid-row: 2; }.right { grid-column: 3; grid-row: 2; }
.result-title { font-size: 56px; line-height: 1.1; }
.result-title small { display: block; margin-top: 8px; font-size: 15px; font-weight: 700; }
.result-card { min-height: 324px; padding: 16px; display: flex; flex-direction: column; align-items: center; }
.result-badges { align-self: stretch; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.winner { color: var(--winner-color); }
.kcs-chip { color: var(--lime); }
.result-card .mascot { margin-top: 32px; }
.result-word { color: var(--winner-color); font-size: 37px; font-weight: 900; margin-top: 12px; }
.result-record { display: flex; flex-direction: column; align-items: center; gap: 10px; min-height: 133px; padding: 16px; margin-top: 24px; border-radius: 18px; font-size: 15px; }
.result-record strong { font-size: 42px; line-height: 1.4; font-weight: 900; font-variant-numeric: tabular-nums; }
@media (min-width: 900px) {
  .play:not(.ready-phase):not(.touch-controls) { width: min(100%, 1100px); display: grid; grid-template-columns: minmax(0, 1fr) 320px; grid-template-rows: auto 1fr; column-gap: 40px; height: 100svh; }
  .play:not(.ready-phase):not(.touch-controls) .field { grid-column: 1; grid-row: 1 / 3; height: 100%; min-height: 440px; }
  .hud { grid-column: 2; grid-row: 1; }.controls { grid-column: 2; grid-row: 2; justify-content: end; padding-bottom: 8px; }
  .dpad { grid-template-columns: repeat(3, 88px); grid-template-rows: repeat(2, 88px); gap: 12px; margin-top: 18px; }
}
@media (orientation: landscape) and (max-height: 500px) {
  .play.touch-controls:not(.ready-phase) { width: min(100%, 900px); height: 100svh; padding: 16px max(24px, env(safe-area-inset-right)) 16px max(24px, env(safe-area-inset-left)); display: grid; grid-template-columns: minmax(0, 1fr) minmax(160px, 220px); grid-template-rows: auto 1fr; gap: 16px 24px; }
  .play.touch-controls:not(.ready-phase) .field { grid-column: 1; grid-row: 1 / 3; height: 100%; min-height: 0; width: auto; max-width: 100%; justify-self: center; }
  .touch-controls .hud { grid-column: 2; grid-row: 1; gap: 8px; }
  .touch-controls .stick-help { grid-column: 2; grid-row: 2; align-self: end; }
}
</style>
