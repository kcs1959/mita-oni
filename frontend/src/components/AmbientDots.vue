<script setup lang="ts">
// Figma の背景に散らばる淡い光の点。座標は画面サイズに対する割合で配置する
const dots = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  top: `${(i * 53 + 7) % 100}%`,
  size: 3 + (i % 3),
  color: i % 2 === 0 ? 'var(--lime)' : 'var(--cyan)',
}))
</script>

<template>
  <div class="ambient" aria-hidden="true">
    <span
      v-for="(d, i) in dots"
      :key="i"
      :style="{ left: d.left, top: d.top, width: `${d.size}px`, height: `${d.size}px`, background: d.color }"
    />
  </div>
</template>

<style scoped>
.ambient {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

span {
  position: absolute;
  border-radius: 50%;
  opacity: 0.15;
}
</style>
