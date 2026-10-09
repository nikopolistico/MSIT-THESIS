<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Activity,
  Handshake,
  ListChecks,
  Pencil,
  RefreshCcw,
  RefreshCw,
  Scale,
  Tags,
  Target,
  UserCheck,
} from '@lucide/vue'
import { api } from '@/api'
import ChartCanvas from '@/components/ChartCanvas.vue'
import PageHeader from '@/components/PageHeader.vue'
import StateBlock from '@/components/StateBlock.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { labelDef, TASK_KEYS, TASKS } from '@/config/labels'
import { useReviewStore } from '@/stores/review'
import type { Decision, Metrics, TaskKey } from '@/types'
import { errorMessage, formatDateTime, pct } from '@/utils/format'
import { cohensKappa } from '@/utils/stats'

const store = useReviewStore()
const metrics = ref<Metrics | null>(null)
const history = ref<Decision[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const updatedAt = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const [m, h] = await Promise.all([api.getMetrics(), api.getHistory()])
    metrics.value = m
    history.value = h
    await store.load(true)
    updatedAt.value = new Date().toISOString()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const modelOf = (d: Decision, t: TaskKey) => (t === 'maturity' ? d.modelMaturity : d.modelQuality)
const expertOf = (d: Decision, t: TaskKey) =>
  t === 'maturity' ? d.expertMaturity : d.expertQuality
const isCorrected = (d: Decision) => TASK_KEYS.some((t) => modelOf(d, t) !== expertOf(d, t))

const latest = computed(() => metrics.value?.evaluations.at(-1) ?? null)
const corrected = computed(() => history.value.filter(isCorrected))
const agreeRate = computed(() =>
  history.value.length ? 1 - corrected.value.length / history.value.length : null,
)

/** Per task: how often the expert kept the model's label, plus Cohen's kappa. */
const taskStats = computed(() =>
  TASK_KEYS.map((task) => {
    const total = history.value.length
    const agreed = history.value.filter((d) => modelOf(d, task) === expertOf(d, task)).length
    return {
      task,
      title: TASKS[task].title,
      total,
      agreed,
      rate: total ? agreed / total : 0,
      kappa: cohensKappa(
        history.value.map((d) => modelOf(d, task)),
        history.value.map((d) => expertOf(d, task)),
      ),
    }
  }),
)

const kpis = computed(() => {
  const m = metrics.value
  if (!m) return []
  return [
    {
      label: 'Waiting for review',
      value: `${store.items.length}${store.hasMore ? '+' : ''}`,
      hint: 'fruit in the queue.',
      icon: ListChecks,
      to: '/review',
    },
    {
      label: 'Expert reviews',
      value: String(m.expertQueries),
      hint: `${m.correctionsApplied} of them changed a label.`,
      icon: UserCheck,
    },
    {
      label: 'Model agrees with expert',
      value: agreeRate.value === null ? 'n/a' : pct(agreeRate.value, 0),
      hint: 'of reviews, on both labels.',
      icon: Handshake,
    },
    {
      label: 'Labeled images',
      value: String(m.labelCount),
      hint: `${m.referenceCount} training, ${m.labelCount - m.referenceCount} from experts.`,
      icon: Tags,
    },
  ]
})

const recent = computed(() => corrected.value.slice(0, 5))
const changes = (d: Decision) =>
  TASK_KEYS.filter((t) => modelOf(d, t) !== expertOf(d, t))
    .map(
      (t) =>
        `${TASKS[t].title}: ${labelDef(t, modelOf(d, t)).text} to ${labelDef(t, expertOf(d, t)).text}`,
    )
    .join('; ')

const evalLabels = computed(() => metrics.value?.evaluations.map((e) => e.date) ?? [])
const evalSets = computed(() => [
  {
    label: 'Accuracy',
    data: metrics.value?.evaluations.map((e) => e.accuracy) ?? [],
    borderColor: '#c2185b',
    backgroundColor: '#c2185b',
    tension: 0.25,
  },
  {
    label: 'Macro-F1',
    data: metrics.value?.evaluations.map((e) => e.macroF1) ?? [],
    borderColor: '#4a8226',
    backgroundColor: '#4a8226',
    tension: 0.25,
  },
])
const roundLabels = computed(() => metrics.value?.rounds.map((r) => r.round) ?? [])
const roundSets = computed(() => [
  {
    label: 'Reviews',
    data: metrics.value?.rounds.map((r) => r.queries) ?? [],
    backgroundColor: '#d9c6cf',
  },
  {
    label: 'Corrections',
    data: metrics.value?.rounds.map((r) => r.corrections) ?? [],
    backgroundColor: '#c2185b',
  },
])

const statusStyle = {
  accepted: 'bg-emerald-100 text-emerald-800',
  rolled_back: 'bg-red-100 text-red-800',
  running: 'bg-amber-100 text-amber-800',
}
const statusText = { accepted: 'Accepted', rolled_back: 'Rolled back', running: 'Running' }

/** Accuracy change of the last consolidation in percentage points, or null if not reported. */
const delta = computed(() => {
  const c = metrics.value?.lastConsolidation
  if (!c || c.accuracyBefore == null || c.accuracyAfter == null) return null
  return (c.accuracyAfter - c.accuracyBefore) * 100
})
</script>

<template>
  <div>
    <PageHeader
      title="Admin Dashboard"
      :description="
        updatedAt
          ? `How the labeling is going and how the model is doing. Updated ${formatDateTime(updatedAt)}.`
          : 'How the labeling is going and how the model is doing.'
      "
    >
      <button class="btn" :disabled="loading" @click="load">
        <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" aria-hidden="true" />
        Refresh
      </button>
    </PageHeader>

    <StateBlock :loading="loading && !metrics" :error="error" @retry="load">
      <div v-if="metrics" class="space-y-4">
        <!-- What needs attention, in four numbers -->
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card v-for="k in kpis" :key="k.label" class="gap-3">
            <CardHeader>
              <CardDescription class="flex items-center justify-between gap-2">
                <span class="font-medium text-stone-700">{{ k.label }}</span>
                <component :is="k.icon" class="size-4 shrink-0 text-brand-600" aria-hidden="true" />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p class="font-display text-3xl font-semibold tabular-nums">{{ k.value }}</p>
              <p class="mt-1 text-xs text-stone-600">
                {{ k.hint }}
                <RouterLink
                  v-if="k.to"
                  :to="k.to"
                  class="font-medium text-brand-700 underline underline-offset-2"
                >
                  Open the queue
                </RouterLink>
              </p>
            </CardContent>
          </Card>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle class="flex items-center gap-2 text-base">
                <Scale class="size-4 text-brand-600" aria-hidden="true" />
                Model and expert
              </CardTitle>
              <CardDescription>How often the expert kept the model's label</CardDescription>
            </CardHeader>
            <CardContent class="space-y-5">
              <p v-if="!history.length" class="py-6 text-sm text-stone-600">
                No fruit has been reviewed yet. Save labels for a fruit in the review queue and the
                comparison appears here.
              </p>
              <div v-for="s in history.length ? taskStats : []" :key="s.task">
                <div class="flex items-baseline justify-between">
                  <span class="text-sm font-medium">{{ s.title }}</span>
                  <span class="font-display text-2xl font-semibold tabular-nums">
                    {{ pct(s.rate) }}
                  </span>
                </div>
                <div class="mt-2 flex h-2 overflow-hidden rounded-full bg-stone-200">
                  <div class="bg-emerald-500" :style="{ width: pct(s.rate) }"></div>
                  <div class="bg-amber-500" :style="{ width: pct(1 - s.rate) }"></div>
                </div>
                <p class="mt-1.5 text-xs text-stone-600">
                  {{ s.agreed }} kept, {{ s.total - s.agreed }} changed. Cohen's kappa
                  {{ s.kappa === null ? 'n/a' : s.kappa.toFixed(2) }}.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="flex items-center gap-2 text-base">
                <Target class="size-4 text-brand-600" aria-hidden="true" />
                Model performance
              </CardTitle>
              <CardDescription>
                {{
                  latest?.split
                    ? `Measured on ${latest.n} fruit photos held out from training (${latest.split} split), ${latest.date}`
                    : 'Accuracy and macro-F1 at each evaluation'
                }}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div class="mb-4 grid grid-cols-2 gap-4">
                <div>
                  <p class="text-xs text-stone-600">Accuracy</p>
                  <p class="font-display text-2xl font-semibold tabular-nums">
                    {{ latest ? pct(latest.accuracy, 1) : 'n/a' }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-stone-600">Macro-F1</p>
                  <p class="font-display text-2xl font-semibold tabular-nums">
                    {{ latest ? pct(latest.macroF1, 1) : 'n/a' }}
                  </p>
                </div>
              </div>
              <p v-if="!metrics.evaluations.length" class="text-sm text-stone-600">
                No evaluation has been recorded yet. Run backend/evaluate.py to measure the model on
                the test split.
              </p>
              <dl
                v-else-if="latest?.tasks"
                class="divide-y divide-stone-200 border-t border-stone-200"
              >
                <div
                  v-for="t in TASK_KEYS"
                  :key="t"
                  class="flex items-baseline justify-between gap-4 py-2.5 text-sm"
                >
                  <dt class="font-medium">
                    {{ TASKS[t].title }}
                    <span class="font-normal text-stone-600">({{ latest.tasks[t].n }} photos)</span>
                  </dt>
                  <dd class="tabular-nums">
                    accuracy <strong>{{ pct(latest.tasks[t].accuracy, 1) }}</strong
                    >, macro-F1
                    <strong>{{ pct(latest.tasks[t].macroF1, 1) }}</strong>
                  </dd>
                </div>
              </dl>
              <ChartCanvas
                v-if="metrics.evaluations.length > 1"
                type="line"
                :labels="evalLabels"
                :datasets="evalSets"
                :y-min="0.5"
                :y-max="1"
                percent
              />
            </CardContent>
          </Card>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle class="flex items-center gap-2 text-base">
                <Activity class="size-4 text-brand-600" aria-hidden="true" />
                Expert activity
              </CardTitle>
              <CardDescription>Reviews and corrections per day</CardDescription>
            </CardHeader>
            <CardContent>
              <p v-if="!metrics.rounds.length" class="py-6 text-sm text-stone-600">
                Nothing yet. Each day an expert saves labels, a bar appears here.
              </p>
              <ChartCanvas v-else type="bar" :labels="roundLabels" :datasets="roundSets" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle class="flex items-center gap-2 text-base">
                <Pencil class="size-4 text-brand-600" aria-hidden="true" />
                Recent corrections
              </CardTitle>
              <CardDescription>The latest fruit where the expert changed a label</CardDescription>
            </CardHeader>
            <CardContent>
              <p v-if="!recent.length" class="py-6 text-sm text-stone-600">
                No corrections yet. Every label the expert changes is listed here.
              </p>
              <ul v-else class="divide-y divide-stone-200">
                <li v-for="d in recent" :key="d.id" class="flex items-center gap-3 py-3">
                  <img
                    :src="d.imageUrl"
                    :alt="d.itemId"
                    class="size-10 shrink-0 rounded-md object-cover"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium">{{ d.itemId }}</p>
                    <p class="text-xs text-stone-600">{{ changes(d) }}</p>
                  </div>
                  <time class="shrink-0 text-xs text-stone-600">{{
                    formatDateTime(d.timestamp)
                  }}</time>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-base">
              <RefreshCcw class="size-4 text-brand-600" aria-hidden="true" />
              Last consolidation
            </CardTitle>
            <CardDescription>The most recent fine-tune of the model</CardDescription>
          </CardHeader>
          <CardContent>
            <p v-if="!metrics.lastConsolidation" class="text-sm text-stone-600">
              No fine-tune has run yet.
            </p>
            <dl v-else class="grid gap-5 text-sm sm:grid-cols-4">
              <div>
                <dt class="text-xs text-stone-600">Status</dt>
                <dd class="mt-1">
                  <span
                    class="rounded-full px-2.5 py-0.5 text-xs font-medium"
                    :class="statusStyle[metrics.lastConsolidation.status]"
                  >
                    {{ statusText[metrics.lastConsolidation.status] }}
                  </span>
                </dd>
              </div>
              <div>
                <dt class="text-xs text-stone-600">Ran at</dt>
                <dd class="mt-1 font-medium">
                  {{ formatDateTime(metrics.lastConsolidation.runAt) }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-stone-600">Accuracy</dt>
                <dd class="mt-1 font-medium tabular-nums">
                  <template v-if="delta !== null">
                    {{ pct(metrics.lastConsolidation.accuracyBefore!, 1) }} to
                    {{ pct(metrics.lastConsolidation.accuracyAfter!, 1) }}
                    <span :class="delta >= 0 ? 'text-emerald-700' : 'text-red-700'">
                      ({{ delta >= 0 ? '+' : '' }}{{ delta.toFixed(1) }} pts)
                    </span>
                  </template>
                  <template v-else>Not reported</template>
                </dd>
              </div>
              <div v-if="metrics.lastConsolidation.reason">
                <dt class="text-xs text-stone-600">Reason</dt>
                <dd class="mt-1">{{ metrics.lastConsolidation.reason }}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </StateBlock>
  </div>
</template>
