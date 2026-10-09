<script setup lang="ts">
import { SIMILARITY_THRESHOLD, TASK_KEYS, TASKS } from '@/config/labels'
import type { ItemDetail } from '@/types'
import ConfidenceBar from './ConfidenceBar.vue'
import LabelBadge from './LabelBadge.vue'

defineProps<{ item: Pick<ItemDetail, 'maturity' | 'quality' | 'entropy' | 'oodSimilarity'> }>()
</script>

<template>
  <div class="panel divide-y divide-stone-200">
    <div v-for="t in TASK_KEYS" :key="t" class="space-y-1 px-5 py-4">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold">{{ TASKS[t].title }}</h3>
        <LabelBadge :task="t" :value="item[t].label" />
      </div>
      <ConfidenceBar :value="item[t].confidence" />
    </div>
    <div v-if="item.oodSimilarity !== undefined" class="space-y-1 px-5 py-4">
      <h3 class="text-base font-semibold">Match to the training set</h3>
      <ConfidenceBar :value="item.oodSimilarity" :threshold="SIMILARITY_THRESHOLD" :digits="1" />
    </div>
    <p class="px-5 py-3 text-xs text-stone-500">
      Uncertainty (entropy) {{ item.entropy.toFixed(3) }}. The tick on each bar marks the
      reliability threshold.
    </p>
  </div>
</template>
