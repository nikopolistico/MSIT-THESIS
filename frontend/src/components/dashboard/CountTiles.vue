<script setup lang="ts">
import { computed } from 'vue'
import { CalendarDays, CalendarRange, Package } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import type { CountSummary } from '@/utils/counts'

/** Today / this week / all time, for one worker or the whole farm. */
const props = defineProps<{ summary: CountSummary }>()

const tiles = computed(() => [
  { label: 'Today', value: props.summary.today, hint: 'fruit scanned today', icon: CalendarDays },
  {
    label: 'This week',
    value: props.summary.week,
    hint: 'the last 7 days, today included',
    icon: CalendarRange,
  },
  { label: 'Total', value: props.summary.total, hint: 'all fruit scanned', icon: Package },
])
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-3">
    <Card v-for="t in tiles" :key="t.label" class="gap-3">
      <CardHeader>
        <CardDescription class="flex items-center justify-between gap-2">
          <span class="font-medium text-stone-700">{{ t.label }}</span>
          <component :is="t.icon" class="size-4 shrink-0 text-brand-600" aria-hidden="true" />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p class="font-display text-4xl font-semibold tabular-nums">{{ t.value }}</p>
        <p class="mt-1 text-xs text-stone-600">{{ t.hint }}</p>
      </CardContent>
    </Card>
  </div>
</template>
