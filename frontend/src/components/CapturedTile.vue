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
  <figure class="w-32 shrink-0" :data-side="side">
    <div
      class="aspect-[4/3] overflow-hidden rounded-lg border"
      :class="[
        flagged ? 'border-red-300 ring-2 ring-red-100' : 'border-stone-200',
        !url && 'border-dashed bg-stone-50',
      ]"
    >
      <img v-if="url" :src="url" :alt="`${title} photo`" class="size-full object-cover" />
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
