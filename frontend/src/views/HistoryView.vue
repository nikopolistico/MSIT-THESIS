<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Download, Search } from '@lucide/vue'
import { api } from '@/api'
import LabelBadge from '@/components/LabelBadge.vue'
import PageHeader from '@/components/PageHeader.vue'
import StateBlock from '@/components/StateBlock.vue'
import { TASK_KEYS, TASKS } from '@/config/labels'
import type { Decision, TaskKey } from '@/types'
import { downloadText, toCsv } from '@/utils/csv'
import { errorMessage, formatDateTime } from '@/utils/format'
import { cohensKappa } from '@/utils/stats'

const rows = ref<Decision[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const status = ref<'all' | 'agreed' | 'corrected'>('all')
const search = ref('')

const modelOf = (d: Decision, t: TaskKey) => (t === 'maturity' ? d.modelMaturity : d.modelQuality)
const expertOf = (d: Decision, t: TaskKey) =>
  t === 'maturity' ? d.expertMaturity : d.expertQuality
const isCorrected = (d: Decision) => TASK_KEYS.some((t) => modelOf(d, t) !== expertOf(d, t))

async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = await api.getHistory()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter((d) => {
    if (status.value === 'agreed' && isCorrected(d)) return false
    if (status.value === 'corrected' && !isCorrected(d)) return false
    if (!q) return true
    return [d.itemId, d.note ?? '', ...TASK_KEYS.map((t) => expertOf(d, t))]
      .join(' ')
      .toLowerCase()
      .includes(q)
  })
})

const agreement = computed(() => {
  const n = filtered.value.length
  const agreed = filtered.value.filter((d) => !isCorrected(d)).length
  return { n, agreed, rate: n ? agreed / n : null }
})

const kappas = computed(() =>
  TASK_KEYS.map((t) => ({
    task: t,
    kappa: cohensKappa(
      filtered.value.map((d) => modelOf(d, t)),
      filtered.value.map((d) => expertOf(d, t)),
    ),
  })),
)

function exportCsv() {
  const header = [
    'timestamp',
    'item_id',
    ...TASK_KEYS.flatMap((t) => [`model_${t}`, `expert_${t}`]),
    'outcome',
    'note',
  ]
  const body = filtered.value.map((d) => [
    d.timestamp,
    d.itemId,
    ...TASK_KEYS.flatMap((t) => [modelOf(d, t), expertOf(d, t)]),
    isCorrected(d) ? 'corrected' : 'agreed',
    d.note ?? '',
  ])
  downloadText(`expert-decisions-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(header, body))
}
</script>

<template>
  <div>
    <PageHeader
      title="History"
      description="Every expert decision next to what the model said, with agreement and Cohen's kappa."
    >
      <button class="btn btn-primary" :disabled="!filtered.length" @click="exportCsv">
        <Download class="size-4" aria-hidden="true" />
        Export CSV
      </button>
    </PageHeader>

    <StateBlock :loading="loading && !rows.length" :error="error" @retry="load">
      <div class="space-y-6">
        <div class="ruled grid-cols-2 lg:grid-cols-4">
          <div class="p-4">
            <p class="text-xs font-medium text-stone-500">Decisions shown</p>
            <p class="mt-2 font-display text-3xl font-semibold tabular-nums">{{ agreement.n }}</p>
            <p class="mt-0.5 text-xs text-stone-500">
              {{
                agreement.rate === null
                  ? 'nothing to compare yet'
                  : `${Math.round(agreement.rate * 100)}% agreed on both labels`
              }}
            </p>
          </div>
          <div v-for="k in kappas" :key="k.task" class="p-4">
            <p class="text-xs font-medium text-stone-500">
              Cohen's kappa for {{ TASKS[k.task].title.toLowerCase() }}
            </p>
            <p class="mt-2 font-display text-3xl font-semibold tabular-nums">
              {{ k.kappa === null ? 'n/a' : k.kappa.toFixed(3) }}
            </p>
            <p class="mt-0.5 text-xs text-stone-500">model vs expert</p>
          </div>
          <div class="hidden p-4 lg:block">
            <p class="text-xs font-medium text-stone-500">Corrected</p>
            <p class="mt-2 font-display text-3xl font-semibold tabular-nums">
              {{ agreement.n - agreement.agreed }}
            </p>
            <p class="mt-0.5 text-xs text-stone-500">decisions that changed a label</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-3">
          <select
            v-model="status"
            class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            aria-label="Filter by outcome"
          >
            <option value="all">All outcomes</option>
            <option value="agreed">Agreed</option>
            <option value="corrected">Corrected</option>
          </select>
          <div class="relative min-w-0 flex-1">
            <Search
              class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
              aria-hidden="true"
            />
            <input
              v-model="search"
              type="search"
              placeholder="Search by fruit id, label or note"
              class="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm"
            />
          </div>
        </div>

        <div class="panel overflow-x-auto">
          <table class="w-full min-w-[40rem] text-left text-sm">
            <thead class="bg-stone-100 text-xs font-medium text-stone-600">
              <tr>
                <th class="px-4 py-2.5">Fruit</th>
                <th class="px-4 py-2.5">Model said</th>
                <th class="px-4 py-2.5">Expert decided</th>
                <th class="px-4 py-2.5">Outcome</th>
                <th class="px-4 py-2.5">When</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-200">
              <tr v-if="!filtered.length">
                <td colspan="5" class="px-4 py-10 text-center text-stone-500">
                  {{
                    rows.length
                      ? 'No decisions match these filters.'
                      : 'No decisions yet. Review a fruit from the queue and it will appear here.'
                  }}
                </td>
              </tr>
              <tr v-for="d in filtered" :key="d.id" class="align-top">
                <td class="px-4 py-3">
                  <img
                    :src="d.imageUrl"
                    :alt="d.itemId"
                    loading="lazy"
                    decoding="async"
                    class="size-12 rounded-lg object-cover"
                  />
                  <span class="mt-1 block max-w-32 truncate text-xs text-stone-500">{{
                    d.itemId
                  }}</span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-col items-start gap-1">
                    <LabelBadge v-for="t in TASK_KEYS" :key="t" :task="t" :value="modelOf(d, t)" />
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-col items-start gap-1">
                    <LabelBadge v-for="t in TASK_KEYS" :key="t" :task="t" :value="expertOf(d, t)" />
                  </div>
                  <p v-if="d.note" class="mt-1.5 max-w-48 text-xs text-stone-500">{{ d.note }}</p>
                </td>
                <td class="px-4 py-3">
                  <span
                    class="rounded-full px-2.5 py-0.5 text-xs font-medium"
                    :class="
                      isCorrected(d)
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    "
                  >
                    {{ isCorrected(d) ? 'Corrected' : 'Agreed' }}
                  </span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-stone-600">
                  {{ formatDateTime(d.timestamp) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </StateBlock>
  </div>
</template>
