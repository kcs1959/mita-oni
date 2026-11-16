<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createMazeGame } from '../game/MazeScene'

const canvasHost = ref<HTMLDivElement>()
let preview: ReturnType<typeof createMazeGame> | undefined
// Figma「05 · 盤面デザイン」の説明用レイアウト。実際の対戦マップは従来どおりサーバーから受信する。
const maze = [
  '#############', '#...#.......#', '#.#.#.#####.#', '#.#...#...#.#',
  '#.###.#.#.#.#', '#...#...#...#', '###.#.###.#.#', '#...#.....#.#',
  '#.###.#.###.#', '#.#...#.....#', '#.#.#####.#.#', '#...#.....#.#',
  '#.###.###.#.#', '#.....#.....#', '#.###.#.###.#', '#...#.......#',
  '#############',
]
onMounted(() => {
  if (canvasHost.value) preview = createMazeGame(canvasHost.value, { maze, role: 'runner', you: [4, 8], opp: [10, 14], preview: true })
})
onBeforeUnmount(() => preview?.game.destroy(true))
</script>

<template>
  <main class="screen guide">
    <header><span class="step">遊び方</span><h1>三田のマップ</h1><p class="page-description">名所を目印に、迷路を駆け抜けよう。</p></header>
    <div ref="canvasHost" class="map" role="img" aria-label="三田の迷路マップ。東京タワー、田町駅、三田二郎を目印に移動できます。" />
    <div class="legend"><span class="chip runner">◇ 逃げ</span><span class="chip oni">▲ 鬼</span><span class="chip muted">■ 壁</span></div>
    <p class="muted instructions">対戦中は自分の周囲だけが見えます。壁は通れません。<br />スマートフォン：盤面のスティックをスワイプして移動。指を離すと停止します。<br />パソコン：WASD・矢印キーの長押しで移動。方向ボタンは1回押すと1マス進みます。</p>
    <footer class="bottom-actions"><RouterLink class="btn btn-secondary" to="/">タイトルに戻る</RouterLink></footer>
  </main>
</template>

<style scoped>
.page-description { margin-bottom: 16px; }
.map { position: relative; width: 100%; aspect-ratio: 13 / 17; border-radius: 15px; overflow: hidden; background: var(--field); }
.legend { display: flex; gap: 16px; margin-top: 14px; }
.runner { color: var(--cyan); }.oni { color: var(--red); }
.instructions { font-size: 14px; margin: 16px 0 0; }
</style>
