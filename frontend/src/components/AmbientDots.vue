<script setup lang="ts">
// 配置は固定し、背景の動きは CSS のみで描画する。
const stars = Array.from({ length: 144 }, (_, i) => ({
  left: `${(i * 37.13 + 3) % 100}%`,
  top: `${(i * 53.71 + 7) % 100}%`,
  size: i % 11 === 0 ? '4px' : i % 3 === 0 ? '3px' : '2px',
  color: i % 7 === 0 ? 'var(--cyan)' : i % 11 === 0 ? 'var(--lime)' : '#eaf5ff',
  duration: `${4 + (i % 7)}s`,
  delay: `${-(i * 1.37)}s`,
}))
</script>

<template>
  <div class="ambient" aria-hidden="true">
    <div class="star-field">
      <span
        v-for="(star, i) in stars"
        :key="i"
        class="star"
        :style="{
          left: star.left,
          top: star.top,
          width: star.size,
          height: star.size,
          background: star.color,
          color: star.color,
          animationDuration: star.duration,
          animationDelay: star.delay,
        }"
      />
    </div>
    <span class="shooting-star" />
    <span class="shooting-star shooting-star-secondary" />
    <span class="shooting-star shooting-star-tertiary" />
  </div>
</template>

<style scoped>
.ambient {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.ambient::before {
  content: '';
  position: absolute;
  inset: -12%;
  background:
    radial-gradient(ellipse at 18% 25%, rgb(75 106 181 / 15%), transparent 48%),
    radial-gradient(ellipse at 82% 72%, rgb(66 137 165 / 10%), transparent 44%);
  animation: nebula-drift 48s ease-in-out infinite alternate;
}

.star-field {
  position: absolute;
  inset: -24px;
  animation: star-drift 36s ease-in-out infinite alternate;
}

.star {
  position: absolute;
  border-radius: 50%;
  opacity: 0.4;
  box-shadow: 0 0 7px currentColor;
  animation: twinkle 6s ease-in-out infinite alternate;
}

.shooting-star {
  position: absolute;
  top: 12%;
  left: 68%;
  width: 180px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgb(120 232 240 / 50%) 55%, #eaf5ff);
  filter: drop-shadow(0 0 5px rgb(120 232 240 / 70%));
  opacity: 0;
  transform: rotate(135deg);
  animation: shooting-star 8s linear infinite;
  animation-delay: -5s;
}

.shooting-star::after {
  content: '';
  position: absolute;
  top: -1px;
  right: 0;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #eaf5ff;
  box-shadow: 0 0 8px #b7f4ff;
}

.shooting-star-secondary {
  top: 38%;
  left: 88%;
  width: 140px;
  animation-duration: 11s;
  animation-delay: -4s;
}

.shooting-star-tertiary {
  top: 58%;
  left: 98%;
  width: 160px;
  animation-duration: 13s;
  animation-delay: -11s;
}

@keyframes twinkle {
  from { opacity: 0.2; }
  to { opacity: 0.8; }
}

@keyframes star-drift {
  from { transform: translate(-10px, 8px); }
  to { transform: translate(10px, -8px); }
}

@keyframes nebula-drift {
  from { transform: translate(-2%, -1%) scale(1); }
  to { transform: translate(2%, 1%) scale(1.06); }
}

@keyframes shooting-star {
  0%, 72% {
    opacity: 0;
    transform: translate(0, 0) rotate(135deg);
  }
  76%, 88% { opacity: 0.9; }
  94%, 100% {
    opacity: 0;
    transform: translate(clamp(-520px, -40vw, -200px), clamp(200px, 40vw, 520px)) rotate(135deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ambient::before,
  .star-field,
  .star,
  .shooting-star {
    animation: none;
  }

  .shooting-star {
    display: none;
  }
}
</style>
