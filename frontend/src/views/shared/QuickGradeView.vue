<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ImagePlus, RotateCcw, ScanLine } from '@lucide/vue'
import { api } from '@/api'
import { inventoryEnabled, recordGrading } from '@/api/inventory'
import CaptureBox from '@/components/CaptureBox.vue'
import CapturedTile from '@/components/CapturedTile.vue'
import HeatmapViewer from '@/components/HeatmapViewer.vue'
import LabelBadge from '@/components/LabelBadge.vue'
import NeighborStrip from '@/components/NeighborStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import PredictionCard from '@/components/PredictionCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import { BIN_ACTIONS, labelDef, TASK_KEYS, TASKS } from '@/config/labels'
import { useAuthStore } from '@/stores/auth'
import type { ItemDetail, Side } from '@/types'
import { errorMessage, pct } from '@/utils/format'
import { toModelInput } from '@/utils/image'
import { oodReasons } from '@/utils/ood'

const sideText: Record<Side, string> = { front: 'Front', back: 'Back' }

// Workers get the scan flow only: photos, the bin and what to do. The model's evidence (heatmap,
// similar fruit, per-side confidence) stays with the admin.
const auth = useAuthStore()
const simple = computed(() => !auth.isAdmin)

/** RLS refuses the insert when the worker's account was disabled after they signed in. */
const saveError = (e: unknown) =>
  /row-level security/i.test(errorMessage(e))
    ? 'Your account is disabled, so this fruit was not saved. Ask the admin.'
    : errorMessage(e)

const files = ref<Record<Side, File | null>>({ front: null, back: null })
const urls = ref<Record<Side, string | null>>({ front: null, back: null })
const result = ref<ItemDetail | null>(null)
const shown = ref<Side>('front')
const loading = ref(false)
const error = ref<string | null>(null)
const inventoryError = ref<string | null>(null)
const recorded = ref(false)

const editing = ref<Side | null>(null) // a retake asked for from a tile
// Once the user starts a live scan, each next side opens the scanner by itself.
const scanMode = ref(false)

/** The side the single capture box asks for: front, then back, then nothing (ready to grade). */
const active = computed<Side | null>(() => {
  if (editing.value) return editing.value
  if (!files.value.front) return 'front'
  if (!files.value.back) return 'back'
  return null
})

/** Takes a photo for one side. It is cropped to a square and shrunk to 224 x 224 right away. */
async function setFile(side: Side, file: File | null) {
  let prepared: File | null = null
  if (file) {
    try {
      prepared = await toModelInput(file)
    } catch (e) {
      error.value = errorMessage(e)
      return
    }
  }
  if (urls.value[side]) URL.revokeObjectURL(urls.value[side]!)
  files.value[side] = prepared
  urls.value[side] = prepared ? URL.createObjectURL(prepared) : null
  result.value = null // a different photo needs a new reading
  editing.value = null
  error.value = null
}

/** Sides whose own photo the model does not recognize. Each side is judged on its own. */
const flagged = computed(() =>
  (result.value?.views ?? []).filter((v) => oodReasons(v).length).map((v) => v.side),
)
const flaggedWhy = computed(() =>
  (result.value?.views ?? []).flatMap((v) => oodReasons(v).map((r) => `${sideText[v.side]}: ${r}`)),
)

function retake(side: Side) {
  editing.value = side
}

function startOver() {
  setFile('front', null)
  setFile('back', null)
  shown.value = 'front'
}

async function grade() {
  const front = files.value.front
  const back = files.value.back
  if (!front || !back) return // the inventory keeps both sides of every fruit
  loading.value = true
  error.value = null
  inventoryError.value = null
  recorded.value = false
  try {
    const next = await api.predict(front, back)
    result.value = next
    shown.value = flagged.value[0] ?? 'front'
    // Unrecognized photos are not counted. An inventory failure must not hide a good reading.
    if (!flagged.value.length && inventoryEnabled) {
      await recordGrading(next.maturity.label, next.quality.label, { front, back })
        .then(() => {
          recorded.value = true
        })
        .catch((e) => {
          inventoryError.value = saveError(e)
        })
    }
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

function onPickAgain(side: Side, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) setFile(side, file)
}

const view = computed(
  () => result.value?.views?.find((v) => v.side === shown.value) ?? result.value?.views?.[0],
)

/** The bin the fruit belongs in, with the model's advice for it. */
const verdict = computed(() => {
  const r = result.value
  if (!r) return null
  const m = labelDef('maturity', r.maturity.label).text
  const q = labelDef('quality', r.quality.label).text
  return {
    title: `${m}, ${q.toLowerCase()}`,
    action: BIN_ACTIONS[`${r.maturity.label}|${r.quality.label}`] ?? '',
  }
})

/** The side whose quality reading became the fruit's quality (the worse one). */
const decides = (v: NonNullable<ItemDetail['views']>[number]) =>
  v.quality.label === result.value?.quality.label &&
  v.quality.confidence === result.value?.quality.confidence

const disagreeing = computed(() =>
  TASK_KEYS.filter((t) => new Set((result.value?.views ?? []).map((v) => v[t].label)).size > 1),
)

const disagreeText = computed(() =>
  disagreeing.value.map((t) => TASKS[t].title.toLowerCase()).join(' and '),
)

const readyHint = 'Both sides will be checked, and both photos are saved with the fruit.'

const boxText: Record<Side, { title: string; step: string; hint: string }> = {
  front: {
    title: 'Front of the fruit',
    step: 'Step 1 of 2',
    hint: 'Take or upload a photo of the front. Keep the fruit in the middle of the frame.',
  },
  back: {
    title: 'Back of the fruit',
    step: 'Step 2 of 2',
    hint: 'Turn the fruit over and photograph the back. A defect often hides there.',
  },
}

onBeforeUnmount(() => {
  for (const side of ['front', 'back'] as const) {
    if (urls.value[side]) URL.revokeObjectURL(urls.value[side]!)
  }
})
</script>

<template>
  <div>
    <PageHeader
      v-if="simple"
      title="Scan"
      description="Photograph the front and the back of one fruit, then grade it. The fruit is saved to the inventory under your name."
    />
    <PageHeader
      v-else
      title="Quick grade"
      description="Photograph the front and the back of one fruit. Each photo is cropped to a square and reduced to 224 × 224 pixels, the size the model reads. Nothing is added to the review queue."
    />

    <div class="mb-10 flex flex-col gap-6 md:flex-row md:items-start">
      <!-- The photos already taken are set aside here -->
      <div class="flex gap-3 md:order-last">
        <CapturedTile
          side="front"
          title="Front"
          :url="urls.front"
          :flagged="flagged.includes('front')"
          @retake="retake('front')"
        />
        <CapturedTile
          side="back"
          title="Back"
          :url="urls.back"
          :flagged="flagged.includes('back')"
          @retake="retake('back')"
        />
      </div>

      <!-- The single box: it asks for one side at a time -->
      <div class="min-w-0 max-w-xl flex-1">
        <CaptureBox
          v-if="active"
          :key="active"
          :side="active"
          :title="boxText[active].title"
          :step="boxText[active].step"
          :hint="boxText[active].hint"
          :cancellable="editing !== null"
          :scanning="scanMode"
          @scan="scanMode = true"
          @stop-scan="scanMode = false"
          @pick="setFile(active, $event)"
          @cancel="editing = null"
        />
        <section v-else class="rounded-xl border border-stone-200 bg-white p-4">
          <h2 class="text-lg font-semibold">Ready to grade</h2>
          <p class="mt-1 text-sm text-stone-600">{{ readyHint }}</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button class="btn btn-primary !py-2.5" :disabled="loading" @click="grade">
              <ScanLine class="size-4" aria-hidden="true" />
              {{ loading ? 'Grading' : 'Grade this fruit' }}
            </button>
            <button class="btn !py-2.5" :disabled="loading" @click="startOver">Start over</button>
          </div>
        </section>
      </div>
    </div>

    <StateBlock :loading="loading" :error="error" @retry="grade">
      <div
        v-if="result && verdict && view"
        class="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
      >
        <div class="min-w-0 space-y-10">
          <div>
            <div
              v-if="result.views!.length > 1"
              class="mb-3 inline-flex rounded-lg border border-stone-300 bg-white p-0.5"
              role="group"
              aria-label="Photo shown"
            >
              <button
                v-for="v in result.views"
                :key="v.side"
                type="button"
                class="rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors"
                :class="
                  shown === v.side ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
                "
                :aria-pressed="shown === v.side"
                @click="shown = v.side"
              >
                {{ sideText[v.side] }}
              </button>
            </div>
            <img
              v-if="simple"
              :src="urls[view.side]!"
              :alt="`${sideText[view.side]} of the fruit`"
              class="w-full max-w-md rounded-xl border border-stone-200"
            />
            <HeatmapViewer v-else :image-url="urls[view.side]!" gradcam-url="" />
          </div>
          <template v-if="!flagged.length && !simple">
            <NeighborStrip v-for="t in TASK_KEYS" :key="t" :task="t" :neighbors="view.neighbors" />
          </template>
        </div>

        <section>
          <div class="section-title">
            <h2>{{ flagged.length ? 'Not recognized' : 'Reading' }}</h2>
          </div>

          <!-- A photo the model does not know: no reading, no advice, no neighbors, nothing recorded -->
          <div
            v-if="flagged.length"
            role="alert"
            class="rounded-lg border border-red-200 bg-red-50 p-5 text-red-800"
          >
            <p class="font-display text-xl font-semibold">Outside what the model knows</p>
            <p class="mt-2 text-sm">
              This may not be a dragon fruit in the
              {{ flagged.length > 1 ? 'front or back photo' : `${flagged[0]} photo` }}. Please
              upload the correct {{ flagged.length > 1 ? 'photos' : 'photo' }} again.
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <label v-for="side in flagged" :key="side" class="btn btn-primary cursor-pointer">
                <ImagePlus class="size-4" aria-hidden="true" />
                Upload another {{ side }} photo
                <input
                  type="file"
                  accept="image/*"
                  class="sr-only"
                  @change="onPickAgain(side, $event)"
                />
              </label>
            </div>
            <details class="mt-4 text-xs">
              <summary class="cursor-pointer font-medium">Why it was flagged</summary>
              <p class="mt-1">{{ flaggedWhy.join('; ') }}.</p>
            </details>
          </div>

          <template v-else>
            <!-- The answer first: the bin and what to do with the fruit -->
            <div
              class="mb-4 rounded-lg border border-emerald-100 bg-emerald-100/60 p-4 text-emerald-800"
            >
              <p class="font-display text-xl font-semibold">{{ verdict.title }}</p>
              <p v-if="verdict.action" class="mt-1 text-sm">{{ verdict.action }}</p>
              <p v-if="recorded" class="mt-2 text-xs">Added to the inventory.</p>
            </div>
            <button v-if="simple" class="btn btn-primary mb-4 w-full !py-2.5" @click="startOver">
              <RotateCcw class="size-4" aria-hidden="true" />
              Scan next fruit
            </button>
            <p
              v-if="inventoryError"
              role="alert"
              class="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800"
            >
              Not saved to the inventory: {{ inventoryError }}
              <template v-if="!simple">
                Both photos must be saved with the fruit. If this keeps happening, check that
                frontend/supabase/auth-roles.sql was run in Supabase.
              </template>
            </p>

            <PredictionCard v-if="!simple" :item="result" />

            <!-- Side by side, so the expert can see which side decided -->
            <div v-if="!simple && result.views!.length > 1" class="panel mt-4 overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-stone-100 text-left text-xs font-medium text-stone-600">
                  <tr>
                    <th class="px-4 py-2">Side</th>
                    <th class="px-4 py-2">Maturity</th>
                    <th class="px-4 py-2">Quality</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-stone-200">
                  <tr v-for="v in result.views" :key="v.side">
                    <td class="px-4 py-2.5 font-medium">{{ sideText[v.side] }}</td>
                    <td class="px-4 py-2.5">
                      <LabelBadge task="maturity" :value="v.maturity.label" />
                      <span class="ml-1 text-xs tabular-nums text-stone-600">{{
                        pct(v.maturity.confidence)
                      }}</span>
                    </td>
                    <td class="px-4 py-2.5">
                      <LabelBadge task="quality" :value="v.quality.label" />
                      <span class="ml-1 text-xs tabular-nums text-stone-600">{{
                        pct(v.quality.confidence)
                      }}</span>
                      <span v-if="decides(v)" class="ml-1.5 text-xs font-medium text-brand-700"
                        >decides</span
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
              <p class="border-t border-stone-200 px-4 py-3 text-xs text-stone-600">
                Maturity is the average of both sides. Quality follows the worse side, so a defect
                on one side is never hidden by a clean one.
                <template v-if="disagreeText">
                  The sides disagree on
                  {{ disagreeText }}.
                </template>
              </p>
            </div>
          </template>
        </section>
      </div>
      <p v-else-if="simple" class="max-w-prose py-6 text-stone-600">
        The result appears here once the fruit is graded: its bin and what to do with it.
      </p>
      <p v-else class="max-w-prose py-6 text-stone-600">
        The reading appears here once the fruit is graded: its bin, what to do with it, the model's
        confidence and the closest known fruit.
      </p>
    </StateBlock>
  </div>
</template>
