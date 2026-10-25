<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ImageOff, Package, RefreshCw, Trash2, UserRound } from '@lucide/vue'
import {
  deleteGrading,
  getGradings,
  getWorkerCounts,
  inventoryEnabled,
  photoUrls,
  type Grading,
  type WorkerCountRow,
} from '@/api/inventory'
import { listProfiles } from '@/api/profiles'
import BinBreakdown from '@/components/dashboard/BinBreakdown.vue'
import PageHeader from '@/components/PageHeader.vue'
import StateBlock from '@/components/StateBlock.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BIN_ACTIONS, labelDef, TASK_KEYS, TASKS } from '@/config/labels'
import { maturityIcon, qualityIcon, toneText } from '@/config/tones'
import type { Profile } from '@/types'
import { summarize } from '@/utils/counts'
import { errorMessage, formatDateTime } from '@/utils/format'

const route = useRoute()
const router = useRouter()

const countRows = ref<WorkerCountRow[]>([])
const profiles = ref<Profile[]>([])
const urls = ref<Record<string, string>>({})
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

/** ?worker=<id> or ?worker=unassigned; missing means every worker. */
const workerParam = computed(() =>
  typeof route.query.worker === 'string' ? route.query.worker : '',
)
const workerFilter = computed<string | null | undefined>(() =>
  workerParam.value === 'unassigned' ? null : workerParam.value || undefined,
)
const setWorker = (value: string) =>
  router.replace({ query: { ...route.query, worker: value || undefined } })

// A different fruit starts with a clean delete state.
watch(selected, () => {
  confirming.value = false
  deleteError.value = null
})

/** Signed addresses for the photos of these fruit (the bucket is private). */
async function addPhotos(list: Grading[]) {
  const paths = list
    .flatMap((g) => [g.image_path, g.back_image_path])
    .filter((p): p is string => !!p && !urls.value[p])
  urls.value = { ...urls.value, ...(await photoUrls(paths)) }
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const [counts, first, people] = await Promise.all([
      getWorkerCounts(),
      getGradings(PAGE, 0, workerFilter.value),
      listProfiles(),
    ])
    countRows.value = counts
    entries.value = first
    profiles.value = people
    hasMore.value = first.length === PAGE
    await addPhotos(first)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(workerParam, load)

async function loadMore() {
  loadingMore.value = true
  try {
    const next = await getGradings(PAGE, entries.value.length, workerFilter.value)
    entries.value = [...entries.value, ...next]
    hasMore.value = next.length === PAGE
    await addPhotos(next)
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
    { side: 'Front', url: g.image_path ? urls.value[g.image_path] : undefined },
    { side: 'Back', url: g.back_image_path ? urls.value[g.back_image_path] : undefined },
  ].filter((p): p is { side: string; url: string } => !!p.url)

const advice = (g: Grading) => BIN_ACTIONS[`${g.maturity}|${g.quality}`] ?? ''

const workerName = (id: string | null) =>
  id === null ? 'Unassigned' : (profiles.value.find((p) => p.id === id)?.full_name ?? 'Unknown')

/** Bin counts for the chosen worker, or for everyone. */
const rows = computed(() => {
  const f = workerFilter.value
  const mine = f === undefined ? countRows.value : countRows.value.filter((r) => r.worker_id === f)
  return summarize(mine, new Date()).byBin
})
const total = computed(() => rows.value.reduce((a, r) => a + r.count, 0))
const hasUnassigned = computed(() => countRows.value.some((r) => r.worker_id === null))
</script>

<template>
  <div>
    <PageHeader
      title="Inventory"
      description="Every scanned fruit, sorted into bins. Choose a worker to see only the fruit they scanned."
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
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p class="flex items-center gap-2 text-sm text-stone-700">
          <Package class="size-4 text-brand-600" aria-hidden="true" />
          <span>
            <strong class="font-display text-lg font-semibold tabular-nums">{{ total }}</strong>
            fruit graded{{ workerFilter !== undefined ? ` by ${workerName(workerFilter)}` : '' }}
          </span>
        </p>
        <select
          :value="workerParam"
          class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          aria-label="Filter by worker"
          @change="setWorker(($event.target as HTMLSelectElement).value)"
        >
          <option value="">All workers</option>
          <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.full_name }}</option>
          <option v-if="hasUnassigned" value="unassigned">Unassigned (before accounts)</option>
        </select>
      </div>

      <BinBreakdown :rows="rows" />

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
          Nothing has been scanned yet. Each fruit a worker scans appears here with who scanned it
          and when.
        </p>
        <template v-else>
          <div
            class="hidden gap-4 border-b border-stone-200 pb-2 text-xs font-medium text-stone-600 md:flex"
          >
            <span class="w-10">No.</span>
            <span class="w-[7.25rem]">Photos</span>
            <span class="grid flex-1 grid-cols-[10rem_1fr_1.2fr] gap-x-4">
              <span>Graded by</span><span>Bin</span><span>What to do</span>
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
                  <span class="order-2 text-xs text-stone-600 md:order-none md:text-sm">
                    <span class="block font-medium text-stone-800">{{
                      workerName(g.worker_id)
                    }}</span>
                    <time>{{ formatDateTime(g.created_at) }}</time>
                  </span>
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
            <dl class="grid gap-3 sm:grid-cols-3">
              <div>
                <dt class="text-xs text-stone-600">Scanned by</dt>
                <dd class="mt-0.5 flex items-center gap-1.5 font-medium">
                  <UserRound class="size-4 text-stone-500" aria-hidden="true" />
                  {{ workerName(selected.g.worker_id) }}
                </dd>
              </div>
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
