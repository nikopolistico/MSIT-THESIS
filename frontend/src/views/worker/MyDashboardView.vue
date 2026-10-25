<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { RefreshCw, ScanLine } from '@lucide/vue'
import { getWorkerCounts, type WorkerCountRow } from '@/api/inventory'
import BinBreakdown from '@/components/dashboard/BinBreakdown.vue'
import CountTiles from '@/components/dashboard/CountTiles.vue'
import DailyChart from '@/components/dashboard/DailyChart.vue'
import PageHeader from '@/components/PageHeader.vue'
import StateBlock from '@/components/StateBlock.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth'
import { summarize } from '@/utils/counts'
import { errorMessage, formatDateTime } from '@/utils/format'

const auth = useAuthStore()
const rows = ref<WorkerCountRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const updatedAt = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    // RLS returns only this worker's rows.
    rows.value = await getWorkerCounts()
    updatedAt.value = new Date().toISOString()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const summary = computed(() => summarize(rows.value, new Date()))
const firstName = computed(() => auth.profile?.full_name.split(' ')[0] ?? '')
</script>

<template>
  <div>
    <PageHeader
      :title="firstName ? `Hi, ${firstName}` : 'My dashboard'"
      :description="
        updatedAt
          ? `The fruit you have scanned. Updated ${formatDateTime(updatedAt)}.`
          : 'The fruit you have scanned.'
      "
    >
      <button class="btn" :disabled="loading" @click="load">
        <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" aria-hidden="true" />
        Refresh
      </button>
      <RouterLink to="/scan" class="btn btn-primary">
        <ScanLine class="size-4" aria-hidden="true" />
        Scan fruit
      </RouterLink>
    </PageHeader>

    <StateBlock :loading="loading && !rows.length" :error="error" @retry="load">
      <div
        v-if="!summary.total"
        class="rounded-xl border border-dashed border-stone-300 p-10 text-center text-stone-600"
      >
        <p>No scans yet.</p>
        <RouterLink to="/scan" class="btn btn-primary mt-4">
          <ScanLine class="size-4" aria-hidden="true" />
          Scan your first fruit
        </RouterLink>
      </div>

      <div v-else class="space-y-8">
        <CountTiles :summary="summary" />

        <Card>
          <CardHeader>
            <CardTitle class="text-base">Your last 14 days</CardTitle>
            <CardDescription>Fruit you scanned each day</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyChart :daily="summary.daily" />
          </CardContent>
        </Card>

        <section>
          <div class="section-title">
            <h2>Your fruit by bin</h2>
            <p>All the fruit you have scanned, by ripeness and quality.</p>
          </div>
          <BinBreakdown :rows="summary.byBin" />
        </section>
      </div>
    </StateBlock>
  </div>
</template>
