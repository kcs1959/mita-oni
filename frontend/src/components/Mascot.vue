<script setup lang="ts">
import oni from '../assets/figma/oni.svg'
import runner from '../assets/figma/runner.svg'
withDefaults(defineProps<{ color: string; size: number; halo?: boolean; mouth?: boolean }>(), { halo: false, mouth: true })
</script>

<template>
  <span class="mascot" :class="{ halo }" :style="{ width: `${size}px`, height: `${size}px`, '--c': color }" aria-hidden="true">
    <img :src="color === 'var(--red)' ? oni : runner" alt="" :width="size" :height="size" />
  </span>
</template>

<style scoped>
.mascot { position: relative; display: inline-flex; flex: none; }
img { display: block; object-fit: contain; }
.halo::before { content: ''; position: absolute; inset: 10%; z-index: -1; border-radius: 50%; background: color-mix(in srgb, var(--c) 13%, transparent); }
</style>
