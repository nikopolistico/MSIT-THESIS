<script setup lang="ts">
import { computed } from 'vue'
import { labelDef, type Tone } from '@/config/labels'
import type { TaskKey } from '@/types'

const props = defineProps<{ task: TaskKey; value: string }>()

const def = computed(() => labelDef(props.task, props.value))

const tones: Record<Tone, { chip: string; dot: string }> = {
  good: { chip: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-600' },
  warn: { chip: 'bg-amber-100 text-amber-800', dot: 'bg-amber-600' },
  bad: { chip: 'bg-red-100 text-red-800', dot: 'bg-red-600' },
  neutral: { chip: 'bg-stone-200 text-stone-700', dot: 'bg-stone-500' },
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
    :class="tones[def.tone].chip"
  >
    <span class="size-1.5 rounded-full" :class="tones[def.tone].dot"></span>
    {{ def.text }}
  </span>
</template>
