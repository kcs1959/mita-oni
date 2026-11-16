<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import routeArt from '../assets/figma/route-home.svg'
import Mascot from '../components/Mascot.vue'
import PageNav from '../components/PageNav.vue'
import { getName, setName } from '../lib/session'

const router = useRouter()
const name = ref(getName())
const canStart = computed(() => name.value.trim().length > 0)

function start() {
  if (!canStart.value) return
  setName(name.value.trim())
  router.push('/play')
}
</script>

<template>
  <main class="screen home">
    <PageNav />
    <section class="panel route-panel brand" aria-label="MITA ONI 三田の街で、鬼ごっこ。">
      <img class="route-art" :src="routeArt" alt="" />
      <span class="chip festival">KCS × 三田祭 2026</span>
      <h1><span>MITA</span><span class="oni">ONI</span></h1>
      <p class="sub">三田の街で、鬼ごっこ。</p>
      <p class="catch muted">迷路を駆けろ。つかまるな。</p>
      <Mascot class="brand-oni" color="var(--red)" :size="68" />
      <Mascot class="brand-runner" color="var(--cyan)" :size="48" />
    </section>
    <form class="entry" @submit.prevent="start">
      <label for="player-name">プレイヤー名</label>
      <input id="player-name" v-model="name" maxlength="12" autocomplete="nickname" placeholder="なまえ" />
      <button class="btn btn-primary" type="submit" :disabled="!canStart">対戦をはじめる</button>
      <RouterLink class="btn btn-secondary" to="/how-to">遊び方</RouterLink>
      <RouterLink class="btn btn-secondary" to="/rooms">ルーム一覧</RouterLink>
      <p class="muted support">2人対戦 ・ 1プレイ最大180秒</p>
    </form>
  </main>
</template>

<style scoped>
.home { padding-top: max(72px, env(safe-area-inset-top)); }
.brand { padding: 18px 16px 40px; min-height: 363px; }
.festival { color: var(--lime); }
h1 { display: flex; flex-direction: column; margin: 22px 0 28px; font-size: 68px; line-height: 1.03; font-weight: 900; letter-spacing: -.04em; }
.oni { color: var(--lime); }
.sub { font-size: 21px; font-weight: 700; margin: 0 0 16px; }
.catch { font-size: 15px; margin: 0; }
.brand-oni { position: absolute; right: 34px; top: 81px; }
.brand-runner { position: absolute; right: 32px; top: 162px; }
.entry { display: flex; flex-direction: column; margin-top: 26px; gap: 12px; }
label { font-size: 16px; font-weight: 700; }
input { width: 100%; min-height: 58px; padding: 14px 16px; margin: -4px 0 10px; border: 1px solid var(--edge); border-radius: 14px; background: var(--panel-deep); color: var(--text); caret-color: var(--lime); font-size: 19px; font-weight: 500; box-shadow: var(--inset); }
.support { text-align: center; font-size: 14px; margin: 12px 0 0; }
@media (max-width: 359px) { .brand { padding-left: 14px; } .sub { font-size: 18px; } .brand-oni { right: 12px; } .brand-runner { right: 14px; } }
</style>
