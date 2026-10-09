<script setup lang="ts">
import { CONFIDENCE_THRESHOLD } from '@/config/labels'
import { pct } from '@/utils/format'

withDefaults(defineProps<{ value: number; threshold?: number; digits?: number }>(), {
  threshold: CONFIDENCE_THRESHOLD,
  digits: 0,
})
</script>

<template>
  <div class="flex items-center gap-2">
    <div class="relative flex-1 py-1.5">
      <div
        class="h-1.5 overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        :aria-valuenow="Math.round(value * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="h-full rounded-full"
          :class="value >= threshold ? 'bg-emerald-500' : 'bg-amber-500'"
          :style="{ width: pct(value) }"
        ></div>
      </div>
      <!-- Below this line the UI treats the prediction as unreliable (out-of-distribution). -->
      <span
        class="absolute top-0 h-full w-px bg-stone-800/60"
        :style="{ left: pct(threshold) }"
        :title="`Threshold ${pct(threshold)}`"
      ></span>
    </div>
    <span class="w-12 text-right text-xs font-medium tabular-nums text-stone-700">{{
      pct(value, digits)
    }}</span>
  </div>
</template>
