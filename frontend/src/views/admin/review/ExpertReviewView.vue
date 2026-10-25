<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ChevronLeft, ChevronRight, Send } from '@lucide/vue'
import { api } from '@/api'
import ConfidenceBar from '@/components/ConfidenceBar.vue'
import HeatmapViewer from '@/components/HeatmapViewer.vue'
import NeighborStrip from '@/components/NeighborStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import StateBlock from '@/components/StateBlock.vue'
import TaskDecision from '@/components/TaskDecision.vue'
import { SIMILARITY_THRESHOLD, TASK_KEYS, TASKS } from '@/config/labels'
import { useReviewStore } from '@/stores/review'
import type { ItemDetail, TaskKey } from '@/types'
import { errorMessage } from '@/utils/format'
import { maxEntropy, queueReason } from '@/utils/review'

const props = defineProps<{ id: string }>()
const router = useRouter()
const store = useReviewStore()

const item = ref<ItemDetail | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const submitting = ref(false)
const submitError = ref<string | null>(null)
const note = ref('')
const choices = ref<Record<TaskKey, string | null>>({ maturity: null, quality: null })
const activeTask = ref<TaskKey>('maturity')

const taskKeys: Record<TaskKey, string> = { maturity: 'M', quality: 'Q' }
const nav = computed(() => store.neighborIds(props.id))
const ready = computed(() => TASK_KEYS.every((t) => choices.value[t] !== null))

async function load() {
  loading.value = true
  error.value = null
  item.value = null
  choices.value = { maturity: null, quality: null }
  activeTask.value = 'maturity'
  note.value = ''
  submitError.value = null
  try {
    if (!store.loaded) await store.load(true)
    item.value = await api.getItem(props.id)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

function go(id: string | null) {
  if (id) void router.push({ name: 'review-detail', params: { id } })
}

function advanceTask() {
  const i = TASK_KEYS.indexOf(activeTask.value)
  const next = TASK_KEYS[i + 1]
  if (next) activeTask.value = next
}

function setChoice(task: TaskKey, value: string) {
  choices.value[task] = value
}

async function submit() {
  if (!item.value || !ready.value || submitting.value) return
  submitting.value = true
  submitError.value = null
  const { prev, next } = nav.value
  try {
    await api.submitFeedback(item.value.id, {
      maturityLabel: choices.value.maturity!,
      qualityLabel: choices.value.quality!,
      note: note.value.trim() || undefined,
    })
    store.remove(item.value.id)
    if (next ?? prev) go(next ?? prev)
    else await router.push({ name: 'review-queue' })
  } catch (e) {
    submitError.value = errorMessage(e)
  } finally {
    submitting.value = false
  }
}

function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
  if (e.ctrlKey || e.metaKey || e.altKey || !item.value) return

  const key = e.key.toLowerCase()
  const active = item.value[activeTask.value]

  if (key === 'enter') void submit()
  else if (key === 'arrowright') go(nav.value.next)
  else if (key === 'arrowleft') go(nav.value.prev)
  else if (key === 'c') {
    setChoice(activeTask.value, active.label)
    advanceTask()
  } else if (key === 'a') {
    for (const t of TASK_KEYS) setChoice(t, item.value[t].label)
  } else if (key === 'm') activeTask.value = 'maturity'
  else if (key === 'q') activeTask.value = 'quality'
  else if (/^[1-9]$/.test(key)) {
    const label = TASKS[activeTask.value].labels[Number(key) - 1]
    if (label) {
      setChoice(activeTask.value, label.value)
      advanceTask()
    }
  } else return
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(() => props.id, load, { immediate: true })
</script>

<template>
  <div>
    <PageHeader
      :title="id"
      :description="
        nav.index >= 0
          ? `Number ${nav.index + 1} of ${store.items.length} in the review queue.`
          : 'Confirm or correct what the model says about this fruit.'
      "
    >
      <RouterLink to="/review" class="btn">Back to queue</RouterLink>
      <button
        class="btn !px-2"
        :disabled="!nav.prev"
        aria-label="Previous fruit"
        @click="go(nav.prev)"
      >
        <ChevronLeft class="size-5" aria-hidden="true" />
      </button>
      <button class="btn !px-2" :disabled="!nav.next" aria-label="Next fruit" @click="go(nav.next)">
        <ChevronRight class="size-5" aria-hidden="true" />
      </button>
    </PageHeader>

    <StateBlock :loading="loading" :error="error" @retry="load">
      <div v-if="item" class="space-y-6">
        <!-- Case file: why the fruit is here, in three numbers -->
        <div class="ruled grid-cols-1 md:grid-cols-3">
          <div class="p-4">
            <p class="text-xs font-medium text-stone-600">Why it is in the queue</p>
            <p class="mt-1.5 text-sm font-medium">{{ queueReason(item) }}</p>
          </div>
          <div class="p-4">
            <p class="text-xs font-medium text-stone-600">Uncertainty</p>
            <p class="mt-1 font-display text-2xl font-semibold tabular-nums">
              {{ item.entropy.toFixed(3) }}
              <span class="font-sans text-sm font-normal text-stone-600"
                >of {{ maxEntropy.toFixed(3) }} at most</span
              >
            </p>
          </div>
          <div v-if="item.oodSimilarity !== undefined" class="p-4">
            <p class="text-xs font-medium text-stone-600">Match to the training set</p>
            <ConfidenceBar
              :value="item.oodSimilarity"
              :threshold="SIMILARITY_THRESHOLD"
              :digits="1"
            />
          </div>
        </div>

        <div
          class="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
        >
          <div class="min-w-0 space-y-10">
            <HeatmapViewer :image-url="item.imageUrl" :gradcam-url="item.gradcamUrl" />
            <NeighborStrip v-for="t in TASK_KEYS" :key="t" :task="t" :neighbors="item.neighbors" />
          </div>

          <!-- Decision sheet -->
          <section class="lg:sticky lg:top-6">
            <div class="section-title"><h2>Your decision</h2></div>
            <div class="panel divide-y divide-stone-200">
              <TaskDecision
                v-for="t in TASK_KEYS"
                :key="t"
                :task="t"
                :prediction="item[t]"
                :model-value="choices[t]"
                :active="activeTask === t"
                :shortcut="taskKeys[t]"
                @update:model-value="setChoice(t, $event)"
                @activate="activeTask = t"
              />

              <div class="space-y-4 px-5 py-4">
                <label class="block">
                  <span class="text-sm font-medium text-stone-700"
                    >Note for the record (optional)</span
                  >
                  <textarea
                    v-model="note"
                    rows="3"
                    class="mt-1 w-full rounded-md border border-stone-300 bg-white p-2.5 text-sm placeholder:text-stone-500"
                    placeholder="For example: bruise near the base, ripeness unclear under this light"
                  ></textarea>
                </label>

                <p
                  v-if="submitError"
                  role="alert"
                  class="rounded-md bg-red-50 p-3 text-sm text-red-800"
                >
                  {{ submitError }}
                </p>

                <button
                  class="btn btn-primary w-full !py-3 text-base"
                  :disabled="!ready || submitting"
                  @click="submit"
                >
                  <Send class="size-4" aria-hidden="true" />
                  {{ submitting ? 'Saving' : 'Save labels' }}
                  <kbd class="!border-white/30 !bg-transparent !text-white/80">Enter</kbd>
                </button>
                <p v-if="!ready" class="text-center text-xs text-stone-600">
                  Confirm or change both Maturity and Quality to save.
                </p>
              </div>

              <p class="hidden px-5 py-3 text-xs leading-relaxed text-stone-600 md:block">
                Keys: <kbd>M</kbd> <kbd>Q</kbd> switch task, <kbd>C</kbd> confirm,
                <kbd>A</kbd> confirm both, <kbd>1</kbd> <kbd>2</kbd> choose label,
                <kbd>Enter</kbd> save, <kbd>←</kbd> <kbd>→</kbd> previous or next fruit.
              </p>
            </div>
          </section>
        </div>
      </div>
    </StateBlock>
  </div>
</template>
