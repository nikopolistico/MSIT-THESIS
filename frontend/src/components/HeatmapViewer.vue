<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ imageUrl: string; gradcamUrl: string }>()

const show = ref(true)
const opacity = ref(0.55)
</script>

<template>
  <!-- Dark matte so the fruit colour is judged against a neutral background. -->
  <figure class="overflow-hidden rounded-xl bg-stone-950">
    <div class="relative mx-auto max-w-xl p-3">
      <img :src="imageUrl" alt="Dragon fruit" class="block h-auto w-full rounded-lg" />
      <img
        v-if="show && gradcamUrl"
        :src="gradcamUrl"
        alt="Grad-CAM heatmap"
        class="pointer-events-none absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] rounded-lg"
        :style="{ opacity }"
      />
    </div>
    <figcaption
      v-if="gradcamUrl"
      class="flex items-center gap-3 border-t border-stone-800 px-4 py-2.5 text-sm text-stone-300"
    >
      <label class="flex items-center gap-2 font-medium">
        <input v-model="show" type="checkbox" class="size-4 accent-brand-500" />
        Heatmap
      </label>
      <input
        v-model.number="opacity"
        type="range"
        min="0"
        max="1"
        step="0.05"
        :disabled="!show"
        class="flex-1 accent-brand-500"
        aria-label="Heatmap opacity"
      />
      <span class="w-10 text-right text-xs tabular-nums text-stone-400">
        {{ Math.round(opacity * 100) }}%
      </span>
    </figcaption>
  </figure>
</template>
