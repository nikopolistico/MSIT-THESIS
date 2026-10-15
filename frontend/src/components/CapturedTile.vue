<script setup lang="ts">
import type { Side } from '@/types'

defineProps<{
  side: Side
  title: string
  url: string | null
  flagged?: boolean
}>()
const emit = defineEmits<{ retake: [] }>()
</script>

<template>
  <!-- The saved photo is a 224 x 224 square, so the tile is square too: what is shown is exactly
       what the model reads, with nothing cropped away. -->
  <figure class="w-36 shrink-0 sm:w-44" :data-side="side">
    <div
      class="aspect-square overflow-hidden rounded-lg border"
      :class="[
        flagged ? 'border-red-300 ring-2 ring-red-100' : 'border-stone-200',
        !url && 'border-dashed bg-stone-50',
      ]"
    >
      <img v-if="url" :src="url" :alt="`${title} photo`" class="size-full object-contain" />
      <p v-else class="grid size-full place-items-center text-xs text-stone-600">Waiting</p>
    </div>
    <figcaption class="mt-1.5 flex items-center justify-between gap-2 text-xs">
      <span class="font-medium" :class="flagged && 'text-red-700'">
        {{ title }}<template v-if="flagged"> not recognized</template>
      </span>
      <button
        v-if="url"
        type="button"
        class="font-medium text-brand-700 underline underline-offset-2"
        @click="emit('retake')"
      >
        Retake
      </button>
    </figcaption>
  </figure>
</template>
