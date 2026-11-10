<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Mascot from '../components/Mascot.vue'
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
    <header class="top">
      <span class="step">01 / WELCOME</span>
      <span class="chip festival">KCS × 三田祭 2026</span>
    </header>

    <div class="body">
      <section class="brand">
        <div class="stripe" />
        <h1>
          <span class="mita">MITA</span>
          <span class="oni">ONI</span>
        </h1>
        <p class="sub">三田の街で、鬼ごっこ。</p>
        <p class="catch muted">迷路を駆けろ。つかまるな。</p>
        <div class="mascots">
          <Mascot color="var(--red)" :size="56" />
          <Mascot class="runner" color="var(--cyan)" :size="54" />
        </div>
      </section>

      <form class="entry" @submit.prevent="start">
        <label class="label" for="player-name">PLAYER NAME</label>
        <input id="player-name" v-model="name" maxlength="12" autocomplete="off" placeholder="なまえ" />
        <button class="btn btn-primary" type="submit" :disabled="!canStart">ゲームをはじめる →</button>
        <p class="muted support">2人で対戦 • 1プレイ最大180秒</p>
      </form>
    </div>

    <footer class="footer muted">MITA–ONI&nbsp;&nbsp;/&nbsp;&nbsp;2026</footer>
  </main>
</template>

<style scoped>
.top {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 24px;
}

.festival {
  color: var(--lime);
}

.body {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 64px;
  align-items: center;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.brand {
  position: relative;
  overflow: hidden;
  background: var(--panel-deep);
  border-radius: 27px;
  padding: 56px 48px 40px;
}

.stripe {
  position: absolute;
  inset: 0 0 auto;
  height: 10px;
  background: var(--lime);
}

h1 {
  margin: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.05;
  font-weight: 700;
}

.mita {
  font-size: clamp(64px, 7vw, 96px);
}

.oni {
  font-size: clamp(70px, 8vw, 108px);
  color: var(--lime);
}

.sub {
  margin: 28px 0 8px;
  font-size: clamp(20px, 2vw, 26px);
  font-weight: 700;
  white-space: nowrap;
}

.catch {
  margin: 0;
  font-size: 16px;
}

.mascots {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-top: 32px;
  padding: 0 8px;
}

.mascots .runner {
  margin-bottom: 12px;
}

.entry {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: flex-start;
}

.label {
  color: var(--cyan);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.06em;
}

input {
  width: 100%;
  height: 68px;
  padding: 0 24px;
  border-radius: 16px;
  border: 1.5px solid var(--border);
  background: var(--panel);
  color: var(--text);
  caret-color: var(--lime);
  font: inherit;
  font-size: 20px;
  font-weight: 700;
  outline: none;
}

input:focus {
  border-color: var(--lime);
}

.support {
  margin: 0;
  font-size: 14px;
}

.footer {
  border-top: 1px solid var(--panel);
  padding-top: 16px;
  margin-top: 32px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5em;
  text-align: center;
}
</style>
