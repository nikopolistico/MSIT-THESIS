<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { RefreshCw, UserPlus, Users } from '@lucide/vue'
import { getWorkerCounts, inventoryEnabled, type WorkerCountRow } from '@/api/inventory'
import { listProfiles } from '@/api/profiles'
import BinBreakdown from '@/components/dashboard/BinBreakdown.vue'
import CountTiles from '@/components/dashboard/CountTiles.vue'
import DailyChart from '@/components/dashboard/DailyChart.vue'
import PageHeader from '@/components/PageHeader.vue'
import StateBlock from '@/components/StateBlock.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Profile } from '@/types'
import { byWorker, summarize } from '@/utils/counts'
import { errorMessage, formatDateTime } from '@/utils/format'

const rows = ref<WorkerCountRow[]>([])
const profiles = ref<Profile[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const updatedAt = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const [counts, people] = await Promise.all([getWorkerCounts(), listProfiles()])
    rows.value = counts
    profiles.value = people
    updatedAt.value = new Date().toISOString()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const farm = computed(() => summarize(rows.value, new Date()))

/** One row per worker, including workers with no scans yet, busiest today first. */
const workerRows = computed(() => {
  const per = byWorker(rows.value, new Date())
  const zero = { today: 0, week: 0, total: 0 }
  const list = profiles.value
    .filter((p) => p.role === 'worker' || per.has(p.id))
    .map((p) => ({
      key: p.id,
      name: p.full_name,
      username: p.username,
      active: p.active,
      link: `/inventory?worker=${p.id}`,
      ...(per.get(p.id) ?? zero),
    }))
  const unassigned = per.get(null)
  if (unassigned) {
    list.push({
      key: 'unassigned',
      name: 'Unassigned',
      username: 'scanned before accounts',
      active: true,
      link: '/inventory?worker=unassigned',
      ...unassigned,
    })
  }
  return list.sort((a, b) => b.today - a.today || b.total - a.total)
})
</script>

<template>
  <div>
    <PageHeader
      title="Dashboard"
      :description="
        updatedAt
          ? `The farm's scanned fruit and each worker's count. Updated ${formatDateTime(updatedAt)}.`
          : `The farm's scanned fruit and each worker's count.`
      "
    >
      <button class="btn" :disabled="loading || !inventoryEnabled" @click="load">
        <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" aria-hidden="true" />
        Refresh
      </button>
    </PageHeader>

    <p
      v-if="!inventoryEnabled"
      class="rounded-xl border border-dashed border-stone-300 p-10 text-center text-stone-600"
    >
      The inventory is not connected. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to
      frontend/.env.local and restart the app.
    </p>

    <StateBlock v-else :loading="loading && !updatedAt" :error="error" @retry="load">
      <div class="space-y-8">
        <CountTiles :summary="farm" />

        <!-- Workers -->
        <section>
          <div class="section-title">
            <h2 class="flex items-center gap-2">
              <Users class="size-5 text-brand-600" aria-hidden="true" />
              Workers
            </h2>
            <p>Fruit each worker scanned. Open a worker to see their fruit.</p>
          </div>

          <div
            v-if="!workerRows.length"
            class="rounded-xl border border-dashed border-stone-300 p-8 text-center text-stone-600"
          >
            <p>No workers yet.</p>
            <RouterLink to="/workers" class="btn btn-primary mt-4">
              <UserPlus class="size-4" aria-hidden="true" />
              Add a worker
            </RouterLink>
          </div>

          <div v-else class="panel overflow-x-auto">
            <table class="w-full min-w-[34rem] text-left text-sm">
              <thead class="bg-stone-100 text-xs font-medium text-stone-600">
                <tr>
                  <th class="px-4 py-2.5">Worker</th>
                  <th class="px-4 py-2.5 text-right">Today</th>
                  <th class="px-4 py-2.5 text-right">This week</th>
                  <th class="px-4 py-2.5 text-right">Total</th>
                  <th class="px-4 py-2.5"><span class="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stone-200">
                <tr v-for="w in workerRows" :key="w.key">
                  <td class="px-4 py-3">
                    <p class="flex items-center gap-2 font-medium">
                      {{ w.name }}
                      <span
                        v-if="!w.active"
                        class="rounded bg-stone-200 px-1.5 py-0.5 text-[11px] font-medium text-stone-700"
                      >
                        disabled
                      </span>
                    </p>
                    <p class="text-xs text-stone-500">{{ w.username }}</p>
                  </td>
                  <td class="px-4 py-3 text-right font-display text-lg font-semibold tabular-nums">
                    {{ w.today }}
                  </td>
                  <td class="px-4 py-3 text-right tabular-nums">{{ w.week }}</td>
                  <td class="px-4 py-3 text-right tabular-nums">{{ w.total }}</td>
                  <td class="px-4 py-3 text-right">
                    <RouterLink
                      :to="w.link"
                      class="font-medium whitespace-nowrap text-brand-700 underline underline-offset-2"
                    >
                      View fruit
                    </RouterLink>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle class="text-base">The last 14 days</CardTitle>
            <CardDescription>Fruit scanned each day by all workers</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyChart :daily="farm.daily" />
          </CardContent>
        </Card>

        <section>
          <div class="section-title">
            <h2>Inventory by bin</h2>
            <p>
              Every scanned fruit by ripeness and quality.
              <RouterLink
                to="/inventory"
                class="font-medium text-brand-700 underline underline-offset-2"
              >
                Open the inventory
              </RouterLink>
            </p>
          </div>
          <BinBreakdown :rows="farm.byBin" />
        </section>
     