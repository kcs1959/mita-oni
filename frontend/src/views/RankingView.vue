<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchRanking } from '../lib/api'
import PageNav from '../components/PageNav.vue'
import { mmssCs } from '../lib/format'
import type { RankingResponse, Role } from '../lib/protocol'

const route = useRoute()

// 自分の記録（直前のゲーム結果）。URL の ?role=&me= で受け取る
const myRole = route.query.role === 'oni' ? 'oni' : route.query.role === 'runner' ? 'runner' : null
const myId = Number(route.query.me) || undefined

const tab = ref<Role>(myRole ?? 'oni')
const data = ref<RankingResponse | null>(null)
const error = ref(false)

// 自分の記録があるのは自分の役割のタブだけ
const meForTab = computed(() => (tab.value === myRole ? myId : undefined))

async function load(offset?: number) {
  error.value = false
  try {
    data.value = await fetchRanking(tab.value, { me: meForTab.value, offset })
  } catch {
    error.value = true
  }
}

watch(tab, () => load(), { immediate: true })

const pageLabel = computed(() => {
  const d = data.value
  if (!d) return ''
  if (d.myRank !== null) return `${d.myRank}位 / ${d.total}人`
  if (d.entries.length === 0) return `0人`
  return `${d.offset + 1}〜${d.offset + d.entries.length}位 / ${d.total}人`
})
const hasPrev = computed(() => (data.value?.offset ?? 0) > 0)
const hasNext = computed(() => !!data.value && data.value.offset + data.value.limit < data.value.total)

function prev() {
  if (data.value) load(Math.max(0, data.value.offset - data.value.limit))
}

function next() {
  if (data.value) load(data.value.offset + data.value.limit)
}

</script>

<template>
  <main class="screen ranking">
    <PageNav />
    <header><h1>ランキング</h1></header>
    <div class="segments" role="group" aria-label="ランキングの役割">
      <button class="segment" :class="{ on: tab === 'oni' }" :aria-pressed="tab === 'oni'" @click="tab = 'oni'">プロ鬼</button>
      <button class="segment" :class="{ on: tab === 'runner' }" :aria-pressed="tab === 'runner'" @click="tab = 'runner'">プロ逃げ</button>
    </div>
    <div class="table-heading muted"><span>順位 / プレイヤー</span><span>{{ tab === 'oni' ? '捕まえるまでの時間' : '生き残った時間' }}</span></div>
    <div v-if="error" class="inset-list empty-state" role="alert">
      <p>ランキングを読み込めませんでした。</p>
      <button class="btn btn-secondary" @click="load()">再読み込み</button>
    </div>
    <ol v-else-if="data" class="inset-list rows" aria-label="ランキング">
      <li v-if="data.entries.length === 0" class="empty-state">まだ記録がありません</li>
      <li v-for="(e, i) in data.entries" :key="e.id" class="row" :class="{ me: e.id === meForTab }">
        <span class="rank">{{ data.offset + i + 1 }}</span>
        <span class="player"><span class="name">{{ e.name }}</span><span v-if="e.id === meForTab" class="here">あなた</span></span>
        <span class="time">{{ mmssCs(e.playTimeMs) }}</span>
      </li>
    </ol>
    <p v-else class="inset-list empty-state" role="status">ランキングを読み込んでいます…</p>
    <p v-if="data" class="page-label muted">{{ pageLabel }} ・ プレイ時間が短い順</p>
    <nav v-if="data && (hasPrev || hasNext)" class="pager" aria-label="ランキングのページ">
      <button class="link" :disabled="!hasPrev" @click="prev">‹ 前の7人</button>
      <button class="link" :disabled="!hasNext" @click="next">次の7人 ›</button>
    </nav>
    <footer class="bottom-actions"><RouterLink class="btn btn-secondary" to="/">ホームに戻る</RouterLink></footer>
  </main>
</template>

<style scoped>
.page-description { margin-bottom: 14px; }
.table-heading { display: flex; justify-content: space-between; padding: 16px 14px 10px; font-size: 13px; font-weight: 700; }
.rows { min-height: 343px; }
.row { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 8px; align-items: center; min-height: 49px; border-bottom: 1px solid var(--edge); font-weight: 700; }
.row:last-child { border-bottom: 0; }
.rank { color: var(--muted); font-size: 15px; }
.player { display: flex; align-items: center; gap: 8px; min-width: 0; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 17px; }
.time { font-size: 16px; font-variant-numeric: tabular-nums; }
.row.me { background: var(--panel); margin: 0 -14px; padding: 0 14px; border-radius: 10px; border-color: transparent; }
.row.me .rank, .here { color: var(--lime); }
.here { font-size: 12px; flex: none; }
.page-label { text-align: center; font-size: 14px; margin: 16px 0 0; }
.pager { display: flex; justify-content: space-between; margin-top: 8px; }
.link { color: var(--text); background: transparent; padding: 12px 4px; min-height: 44px; font-size: 14px; }
.link:disabled { opacity: .35; cursor: default; }
.bottom-actions .btn-secondary { min-height: 46px; }
</style>
