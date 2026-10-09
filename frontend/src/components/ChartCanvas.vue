<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartDataset,
} from 'chart.js'

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
)

const props = defineProps<{
  type: 'line' | 'bar'
  labels: string[]
  datasets: ChartDataset<'line' | 'bar', number[]>[]
  yMax?: number
  yMin?: number
  percent?: boolean
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function build() {
  if (!canvas.value) return
  chart?.destroy()
  chart = new Chart(canvas.value, {
    type: props.type,
    data: { labels: props.labels, datasets: props.datasets as ChartDataset[] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: props.yMin,
          max: props.yMax,
          ticks: props.percent
            ? { callback: (v) => `${(Number(v) * 100).toFixed(0)}%` }
            : { precision: 0 },
        },
      },
      plugins: { legend: { position: 'bottom' } },
    },
  })
}

onMounted(build)
watch(() => [props.type, props.labels, props.datasets], build, { deep: true })
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <div class="h-64 w-full"><canvas ref="canvas"></canvas></div>
</template>
