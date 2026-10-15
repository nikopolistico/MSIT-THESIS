<script setup lang="ts">
import { computed } from 'vue'
import { TASKS } from '@/config/labels'
import type { Neighbor, TaskKey } from '@/types'
import { pct } from '@/utils/format'
import LabelBadge from './LabelBadge.vue'

const props = defineProps<{ neighbors: Neighbor[]; task: TaskKey }>()

// A reference image carries only the label of its own dataset, so each task shows its own neighbors.
const labelOf = (n: Neighbor) => (props.task === 'maturity' ? n.maturityLabel : n.qualityLabel)
const shown = computed(() => props.neighbors.filter((n) => labelOf(n) !== null).slice(0, 5))
</script>

<template>
  <section>
    <h3 class="text-base font-semibold">
      Similar fruits for {{ TASKS[task].title.toLowerCase() }}
    </h3>
    <p class="mb-3 text-sm text-stone-600">
      Closest fruits in the training set and in past reviews, with their
      {{ TASKS[task].title.toLowerCase() }}
      label.
    </p>
    <p
      v-if="!shown.length"
      class="rounded-xl border border-dashed border-stone-300 p-5 text-sm text-stone-500"
    >
      No labeled fruit for this task yet. Add the reference images (see
      backend/extract_reference.py) or save a review to start the memory bank.
    </p>
    <ul v-else class="flex gap-3 overflow-x-auto pb-2">
      <li v-for="n in shown" :key="n.id" class="panel w-36 shrink-0 overflow-hidden">
        <img
          :src="n.imageUrl"
          :alt="`Reference ${n.id}`"
          loading="lazy"
          decoding="async"
          class="aspect-square w-full object-cover"
        />
        <div class="space-y-1.5 p-2.5">
          <LabelBadge :task="task" :value="labelOf(n)!" />
          <p class="text-xs text-stone-500">
            Similarity
            <span class="font-semibold tabular-nums text-stone-800">{{
              pct(n.similarity, 1)
            }}</span>
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>
