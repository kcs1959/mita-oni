<script setup lang="ts">
// Figma のキャラクター（丸い顔に目と口）。halo=true で周囲に淡い光をつける
withDefaults(defineProps<{ color: string; size: number; halo?: boolean; mouth?: boolean }>(), {
  halo: false,
  mouth: true,
})
</script>

<template>
  <div class="mascot" :class="{ halo }" :style="{ width: `${size}px`, height: `${size}px`, '--c': color }">
    <span class="eye l" />
    <span class="eye r" />
    <span v-if="mouth" class="mouth" />
  </div>
</template>

<style scoped>
.mascot {
  position: relative;
  border-radius: 50%;
  background: var(--c);
  flex: none;
}

.halo {
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--c) 13%, transparent);
}

.eye {
  position: absolute;
  top: 34%;
  width: 11%;
  height: 16%;
  border-radius: 50%;
  background: var(--bg);
}

.eye.l {
  left: 30%;
}

.eye.r {
  right: 30%;
}

.mouth {
  position: absolute;
  left: 30%;
  right: 30%;
  top: 68%;
  height: 5%;
  min-height: 2px;
  border-radius: 2px;
  background: var(--bg);
}
</style>
