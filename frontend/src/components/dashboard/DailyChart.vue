<script setup lang="ts">
import { computed } from 'vue'
import ChartCanvas from '@/components/ChartCanvas.vue'
import type { CountSummary } from '@/utils/counts'

/** Fruit scanned per day, oldest on the left. */
const props = defineProps<{ daily: CountSummary['daily'] }>()

const short = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })
// day is a calendar date (YYYY-MM-DD); format it as that same date, not converted to local time.
const labels = computed(() => props.daily.map((d) => short.format(new Date(`${d.day}T00:00:00Z`))))
const datasets = computed(() => [
  { label: 'Fruit scanned', data: props.daily.map((d) => d.count), backgroundColor: '#d81b60' },
])
</script>

<template>
  <ChartCanvas type="bar" :labels="labels" :datasets="datasets" />
</template>
