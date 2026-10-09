<script setup lang="ts">
import { computed, onMounted, ref, watch, type Component } from 'vue'
import {
  Apple,
  ImageOff,
  Package,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  Trash2,
} from '@lucide/vue'
import {
  deleteGrading,
  getGradings,
  getInventory,
  inventoryEnabled,
  photoUrl,
  type Grading,
  type InventoryRow,
} from '@/api/inventory'
import PageHeader from '@/components/PageHeader.vue'
import StateBlock from '@/components/StateBlock.vue'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BIN_ACTIONS, labelDef, TASK_KEYS, TASKS, type LabelDef, type Tone } from '@/config/labels'
import { errorMessage, formatDateTime, pct } from '@/utils/format'

const rows = ref<InventoryRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const entries = ref<Grading[]>([])
const hasMore = ref(false)
const loadingMore = ref(false)
const PAGE = 50
const selected = ref<{ g: Grading; no: number } | null>(null)
const confirming = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

// A different fruit starts with a clean delete state.
watch(selected, () => {
  confirming.value = false
  deleteError.value = null
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const [counts, first] = await Promise.all([getInventory(), getGradings(PAGE, 0)])
    rows.value = counts
    entries.value = first
    hasMore.value = first.length === PAGE
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function loadMore() {
  loadingMore.value = true
  try {
    const next = await getGradings(PAGE, entries.value.length)
    entries.value = [...entries.value, ...next]
    hasMore.value = next.length === PAGE
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loadingMore.value = false
  }
}

async function removeSelected() {
  if (!selected.value) return
  deleting.value = true
  deleteError.value = null
  try {
    const warning = await deleteGrading(selected.value.g)
    selected.value = null
    await load()
    if (warning) error.value = warning
  } catch (e) {
    deleteError.value = errorMessage(e)
  } finally {
    deleting.value = false
  }
}

/** The photos saved with a fruit, front first. */
const photos = (g: Grading) =>
  [
    { side: 'Front', url: photoUrl(g.image_path) },
    { side: 'Back', url: photoUrl(g.back_image_path) },
  ].filter((p): p is { side: string; url: string } => p.url !== null)

const advice = (g: Grading) => BIN_ACTIONS[`${g.maturity}|${g.quality}`] ?? ''

const total = computed(() => rows.value.reduce((a, r) => a + r.count, 0))

// A bin is one maturity + quality combination, i.e. a place the fruit is sent after grading.
const toneColor: Record<Tone, string> = {
  good: '#4a8226',
  warn: '#bf8500',
  bad: '#a62e22',
  neutral: '#b29ca8',
}
const toneText: Record<Tone, string> = {
  good: 'text-emerald-700',
  warn: 'text-amber-700',
  bad: 'text-red-700',
  neutral: 'text-stone-600',
}
// Ripe fruit gets the fruit icon, unripe the seedling; quality is a shield that is ticked or flagged.
const maturityIcon: Record<Tone, Component> = {
  good: Apple,
  warn: Sprout,
  bad: Sprout,
  neutral: Sprout,
}
const qualityIcon: Record<Tone, Component> = {
  good: ShieldCheck,
  warn: ShieldAlert,
  bad: ShieldAlert,
  neutral: ShieldCheck,
}

interface Bin {
  key: string
  maturity: LabelDef
  quality: LabelDef
  count: number
  share: number
  color: string
  action: string
}

const bins = computed<Bin[]>(() => {
  const out: Bin[] = []
  // Ripe fruit first: those are the bins that lead to a harvest decision.
  for (const m of [...TASKS.maturity.labels].reverse()) {
    for (const q of TASKS.quality.labels) {
      const count =
        rows.value.find((r) => r.maturity === m.value && r.quality === q.value)?.count ?? 0
      // Quality sets the hue; unripe fruit is shown paler.
      out.push({
        key: `${m.value}|${q.value}`,
        maturity: m,
        quality: q,
        count,
        share: total.value ? count / total.value : 0,
        color: `color-mix(in srgb, ${toneColor[q.tone]} ${m.tone === 'good' ? 100 : 40}%, white)`,
        action: BIN_ACTIONS[`${m.value}|${q.value}`] ?? '',
      })
    }
  }
  return out
})

/** Totals of one task regardless of the other, e.g. all mature fruit. */
const subtotals = computed(() =>
  TASK_KEYS.map((task) => ({
    title: TASKS[task].title,
    icon: task === 'maturity' ? Sprout : ShieldCheck,
    items: TASKS[task].labels.map((l) => ({
      text: l.text,
      count: rows.value.filter((r) => r[task] === l.value).reduce((a, r) => a + r.count, 0),
    })),
  })),
)
</script>

<template>
  <div>
    <PageHeader
      title="Inventory"
      description="Fruit graded in Quick grade, sorted into bins. Photos the model does not recognize are left out."
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

    <StateBlock v-else :loading="loading && !rows.length" :error="error" @retry="load">
      <p class="mb-4 flex items-center gap-2 text-sm text-stone-700">
        <Package class="size-4 text-brand-600" aria-hidden="true" />
        <span>
          <strong class="font-display text-lg font-semibold tabular-nums">{{ total }}</strong>
          fruit graded
        </span>
      </p>

      <!-- One card per bin -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card v-for="b in bins" :key="b.key" class="gap-0 py-0">
          <!-- Colour tab: the bin's colour, paler for unripe fruit -->
          <div class="h-1.5" :style="{ backgroundColor: b.color }" aria-hidden="true"></div>

          <CardHeader class="gap-1.5 px-5 pt-4">
            <div
              class="flex items-center gap-1.5 text-sm font-medium"
              :class="toneText[b.maturity.tone]"
            >
              <component :is="maturityIcon[b.maturity.tone]" class="size-4" aria-hidden="true" />
              {{ b.maturity.text }}
            </div>
            <div
              class="flex items-center gap-1.5 text-sm font-medium"
              :class="toneText[b.quality.tone]"
            >
              <component :is="qualityIcon[b.quality.tone]" class="size-4" aria-hidden="true" />
              {{ b.quality.text }}
            </div>
          </CardHeader>

          <CardContent class="px-5 pt-3 pb-4">
            <p class="font-display text-5xl leading-none font-semibold tabular-nums">
              {{ b.count }}
            </p>
            <p class="mt-2 text-xs text-stone-600">{{ pct(b.share) }} of all fruit</p>
          </CardContent>

          <CardFooter
            class="mt-auto min-h-[4.25rem] items-start border-t border-stone-200 px-5 py-3"
          >
            <p class="text-sm text-stone-700">{{ b.action }}</p>
          </CardFooter>
        </Card>
      </div>

      <dl class="mt-6 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <div v-for="s in subtotals" :key="s.title" class="flex flex-wrap items-baseline gap-x-4">
          <dt class="flex items-center gap-1.5 text-stone-600">
            <component :is="s.icon" class="size-4 self-center text-brand-600" aria-hidden="true" />
            All by {{ s.title.toLowerCase() }}
          </dt>
          <dd v-for="i in s.items" :key="i.text">
            {{ i.text }} <strong class="font-semibold tabular-nums">{{ i.count }}</strong>
          </dd>
        </div>
      </dl>

      <!-- Every fruit that was added, newest first -->
      <section class="mt-10">
        <div class="section-title">
          <h2>Every graded fruit</h2>
          <p>
            Oldest first, so No. 1 is the first fruit graded. Showing {{ entries.length }} of
            {{ total }}.
          </p>
        </div>
        <p v-if="!entries.length" class="max-w-prose py-6 text-sm text-stone-600">
          Nothing has been added yet. Each fruit graded in Quick grade appears here with the time it
          was graded.
        </p>
        <template v-else>
          <div
            class="hidden gap-4 border-b border-stone-200 pb-2 text-xs font-medium text-stone-600 md:flex"
          >
            <span class="w-10">No.</span>
            <span class="w-[7.25rem]">Photos</span>
            <span class="grid flex-1 grid-cols-[10rem_1fr_1.2fr] gap-x-4">
              <span>Graded</span><span>Bin</span><span>What to do</span>
            </span>
          </div>
          <ul class="divide-y divide-stone-200 border-b border-stone-200">
            <li v-for="(g, i) in entries" :key="g.id">
              <button
                type="button"
                class="flex w-full items-center gap-4 py-3 text-left transition-colors hover:bg-brand-50/60"
                :aria-label="`Open fruit number ${i + 1}`"
                @click="selected = { g, no: i + 1 }"
              >
                <span
                  class="hidden w-10 font-display text-lg font-semibold tabular-nums text-stone-500 md:block"
                >
                  {{ i + 1 }}
                </span>
                <span class="flex w-[7.25rem] shrink-0 gap-1">
                  <img
                    v-for="p in photos(g)"
                    :key="p.side"
                    :src="p.url"
                    :alt="`${p.side} photo`"
                    loading="lazy"
                    class="size-14 rounded-md object-cover"
                  />
                  <span
                    v-if="!photos(g).length"
                    class="grid size-14 place-items-center rounded-md bg-stone-100 text-stone-500"
                  >
                    <ImageOff class="size-5" aria-hidden="true" />
                  </span>
                </span>
                <span class="grid min-w-0 flex-1 gap-1 md:grid-cols-[10rem_1fr_1.2fr] md:gap-x-4">
                  <time class="order-2 text-xs text-stone-600 md:order-none md:text-sm">
                    {{ formatDateTime(g.created_at) }}
                  </time>
                  <span class="order-1 flex flex-wrap items-center gap-x-4 gap-y-1 md:order-none">
                    <span
                      class="flex items-center gap-1.5 text-sm font-medium"
                      :class="toneText[labelDef('maturity', g.maturity).tone]"
                    >
                      <component
                        :is="maturityIcon[labelDef('maturity', g.maturity).tone]"
                        class="size-4"
                        aria-hidden="true"
                      />
                      {{ labelDef('maturity', g.maturity).text }}
                    </span>
                    <span
                      class="flex items-center gap-1.5 text-sm font-medium"
                      :class="toneText[labelDef('quality', g.quality).tone]"
                    >
                      <component
                        :is="qualityIcon[labelDef('quality', g.quality).tone]"
                        class="size-4"
                        aria-hidden="true"
                      />
                      {{ labelDef('quality', g.quality).text }}
                    </span>
                  </span>
                  <span class="order-3 hidden text-sm text-stone-700 md:order-none md:block">
                    {{ advice(g) }}
                  </span>
                </span>
              </button>
            </li>
          </ul>
          <div v-if="hasMore" class="pt-5 text-center">
            <button class="btn" :disabled="loadingMore" @click="loadMore">
              {{ loadingMore ? 'Loading' : 'Show more' }}
            </button>
          </div>
        </template>
      </section>

      <!-- One fruit: its photo and where it was labeled -->
      <Dialog :open="selected !== null" @update:open="(open) => !open && (selected = null)">
        <DialogContent
          v-if="selected"
          class="gap-0 overflow-hidden p-0 sm:max-w-2xl [&_button.absolute]:bg-white/90 [&_button.absolute]:text-stone-900 [&_button.absolute]:hover:bg-white"
        >
          <div class="bg-stone-950">
            <div
              v-if="photos(selected.g).length"
              class="grid gap-px"
              :class="photos(selected.g).length > 1 && 'sm:grid-cols-2'"
            >
              <figure v-for="p in photos(selected.g)" :key="p.side" class="relative">
                <img
                  :src="p.url"
                  :alt="`${p.side} of fruit number ${selected.no}`"
                  class="mx-auto max-h-[55vh] w-auto object-contain"
                />
                <figcaption
                  class="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white"
                >
                  {{ p.side }}
                </figcaption>
              </figure>
            </div>
            <p v-else class="grid h-44 place-items-center px-6 text-center text-sm text-stone-300">
              No photo was saved for this fruit.
            </p>
          </div>
          <div class="space-y-4 p-5">
            <DialogHeader class="text-left">
              <DialogTitle class="font-display text-lg">Fruit number {{ selected.no }}</DialogTitle>
              <DialogDescription
                >Graded {{ formatDateTime(selected.g.created_at) }}</DialogDescription
              >
            </DialogHeader>
            <dl class="grid gap-3 sm:grid-cols-2">
              <div v-for="task in TASK_KEYS" :key="task">
                <dt class="text-xs text-stone-600">{{ TASKS[task].title }}</dt>
                <dd
                  class="mt-0.5 flex items-center gap-1.5 font-medium"
                  :class="toneText[labelDef(task, selected.g[task]).tone]"
                >
                  <component
                    :is="
                      (task === 'maturity' ? maturityIcon : qualityIcon)[
                        labelDef(task, selected.g[task]).tone
                      ]
                    "
                    class="size-4"
                    aria-hidden="true"
                  />
                  {{ labelDef(task, selected.g[task]).text }}
                </dd>
              </div>
            </dl>
            <p v-if="advice(selected.g)" class="rounded-md bg-stone-100 p-3 text-sm text-stone-700">
              <strong class="font-semibold">What to do:</strong> {{ advice(selected.g) }}
            </p>

            <div class="border-t border-stone-200 pt-4">
              <p
                v-if="deleteError"
                role="alert"
                class="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800"
              >
                {{ deleteError }}
              </p>
              <div v-if="!confirming" class="flex justify-end">
                <button class="btn !text-red-700" @click="confirming = true">
                  <Trash2 class="size-4" aria-hidden="true" />
                  Delete this fruit
                </button>
              </div>
              <div v-else class="flex flex-wrap items-center justify-between gap-3">
                <p class="text-sm text-stone-700">
                  Delete this fruit and its photo? This cannot be undone.
                </p>
                <span class="flex gap-2">
                  <button class="btn" :disabled="deleting" @click="confirming = false">
                    Keep it
                  </button>
                  <button class="btn btn-danger" :disabled="deleting" @click="removeSelected">
                    {{ deleting ? 'Deleting' : 'Yes, delete' }}
                  </button>
                </span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </StateBlock>
  </div>
</template>
