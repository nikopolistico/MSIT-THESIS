<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Camera, X } from '@lucide/vue'
import { api } from '@/api'
import LabelBadge from '@/components/LabelBadge.vue'
import type { Side, ViewReading } from '@/types'
import { errorMessage, pct } from '@/utils/format'
import { squareJpeg } from '@/utils/image'
import { oodReasons } from '@/utils/ood'

const props = defineProps<{ side: Side; cooldown?: number }>()
const emit = defineEmits<{ capture: [file: File]; close: [] }>()

const NEEDED = 3 // good checks in a row before it captures by itself
const INTERVAL = 800 // ms between checks
const MISSES_BEFORE_WARNING = 3

type Phase = 'starting' | 'turn' | 'searching' | 'locking' | 'captured' | 'error'

const video = ref<HTMLVideoElement | null>(null)
const phase = ref<Phase>('starting')
const streak = ref(0)
const reading = ref<ViewReading | null>(null)
const errorText = ref('')
const modelSilent = ref(false)

let stream: MediaStream | null = null
let timer: number | undefined
let busy = false
let alive = true
let misses = 0

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const looking = () => phase.value === 'searching' || phase.value === 'locking'

/** The current video frame as the model-sized square, the same picture the model will read. */
function grab(): Promise<Blob> {
  const v = video.value!
  return squareJpeg(v, v.videoWidth, v.videoHeight)
}

function stop() {
  window.clearInterval(timer)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

async function capture() {
  if (phase.value === 'captured' || !video.value?.videoWidth) return
  phase.value = 'captured'
  navigator.vibrate?.(80)
  const blob = await grab()
  stop()
  await sleep(350) // let the flash show before the next step replaces this view
  emit('capture', new File([blob], `scan-${props.side}.jpg`, { type: 'image/jpeg' }))
}

/** Asks the model about the current frame. */
async function check() {
  if (busy || !alive || !looking() || !video.value?.videoWidth) return
  busy = true
  try {
    const frame = new File([await grab()], 'frame.jpg', { type: 'image/jpeg' })
    const result = await api.predict(frame)
    misses = 0
    modelSilent.value = false
    if (!alive || !looking()) return
    const view = result.views?.[0] ?? null
    reading.value = view
    if (view && !oodReasons(view).length) {
      streak.value++
      phase.value = 'locking'
      if (streak.value >= NEEDED) await capture()
    } else {
      streak.value = 0
      phase.value = 'searching'
    }
  } catch {
    // A missed check is not fatal: keep scanning, and offer the manual shutter if it keeps happening.
    if (++misses >= MISSES_BEFORE_WARNING) modelSilent.value = true
  } finally {
    busy = false
  }
}

function cameraProblem(e: unknown): string {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError')
    return 'The camera is blocked. Allow it in your browser settings, or use Take photo.'
  if (name === 'NotFoundError') return 'No camera was found. Use Take photo or Upload instead.'
  return `The camera could not start: ${errorMessage(e)}`
}

onMounted(async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    phase.value = 'error'
    errorText.value =
      'Live scan needs a camera and a secure (https) page. Use Take photo or Upload instead.'
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    })
    if (!alive) return stop()
    video.value!.srcObject = stream
    await video.value!.play()
  } catch (e) {
    phase.value = 'error'
    errorText.value = cameraProblem(e)
    return
  }
  if (props.cooldown) {
    phase.value = 'turn' // time to turn the fruit over before the next side is judged
    await sleep(props.cooldown)
  }
  if (!alive) return
  phase.value = 'searching'
  timer = window.setInterval(check, INTERVAL)
})

onBeforeUnmount(() => {
  alive = false
  stop()
})

const status = computed(() => {
  switch (phase.value) {
    case 'starting':
      return 'Starting the camera'
    case 'turn':
      return 'Front captured. Turn the fruit over.'
    case 'searching':
      return 'Looking for a dragon fruit'
    case 'locking':
      return `Fruit found. Hold still (${streak.value} of ${NEEDED})`
    case 'captured':
      return 'Captured'
    default:
      return ''
  }
})
const locked = computed(() => phase.value === 'locking' || phase.value === 'captured')
</script>

<template>
  <div>
    <div
      v-if="phase === 'error'"
      role="alert"
      class="grid h-56 place-items-center rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800"
    >
      {{ errorText }}
    </div>

    <div
      v-show="phase !== 'error'"
      class="relative aspect-[4/3] overflow-hidden rounded-lg bg-stone-950"
    >
      <video ref="video" class="size-full object-cover" autoplay playsinline muted></video>

      <!-- Reticle: corner brackets turn green once a fruit is found -->
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        <span
          v-for="corner in [
            'left-5 top-12 border-l-[3px] border-t-[3px] rounded-tl-lg',
            'right-5 top-12 border-r-[3px] border-t-[3px] rounded-tr-lg',
            'left-5 bottom-[4.75rem] border-l-[3px] border-b-[3px] rounded-bl-lg',
            'right-5 bottom-[4.75rem] border-r-[3px] border-b-[3px] rounded-br-lg',
          ]"
          :key="corner"
          class="absolute size-9 transition-colors duration-200"
          :class="[corner, locked ? 'border-emerald-400' : 'border-white/85']"
        ></span>
        <span class="absolute left-1/2 top-[44%] h-5 w-px -translate-x-1/2 bg-white/50"></span>
        <span
          class="absolute left-[calc(50%-0.625rem)] top-[44%] mt-2.5 h-px w-5 bg-white/50"
        ></span>
        <div v-if="looking()" class="scan-line"></div>
        <div v-if="phase === 'captured'" class="scan-flash absolute inset-0 bg-white"></div>
      </div>

      <div
        class="absolute left-3 top-3 rounded bg-black/55 px-2 py-1 text-xs font-medium text-white"
      >
        Scanning the {{ side }}
      </div>
      <div
        v-if="reading"
        class="absolute right-3 top-3 rounded bg-black/55 px-2 py-1 text-xs font-medium tabular-nums text-white"
      >
        Match {{ pct(reading.oodSimilarity, 1) }}
      </div>

      <!-- Status: what the scanner is doing, and how close it is to capturing -->
      <div class="absolute inset-x-0 bottom-0 bg-black/65 px-4 py-2.5 text-white">
        <div class="flex items-center justify-between gap-3">
          <p class="flex items-center gap-2 text-sm font-medium" aria-live="polite">
            <span
              class="size-2 rounded-full"
              :class="locked ? 'bg-emerald-400' : 'animate-pulse bg-pink-400'"
            ></span>
            {{ status }}
          </p>
          <span class="flex gap-1" aria-hidden="true">
            <span
              v-for="n in NEEDED"
              :key="n"
              class="h-1.5 w-6 rounded-full transition-colors"
              :class="n <= streak || phase === 'captured' ? 'bg-emerald-400' : 'bg-white/30'"
            ></span>
          </span>
        </div>
        <div v-if="reading && phase === 'locking'" class="mt-1.5 flex flex-wrap gap-1.5">
          <LabelBadge task="maturity" :value="reading.maturity.label" />
          <LabelBadge task="quality" :value="reading.quality.label" />
        </div>
      </div>
    </div>

    <p v-if="modelSilent" role="alert" class="mt-2 text-xs text-amber-800">
      The model is not answering, so it cannot capture by itself. Use Capture now.
    </p>

    <div class="mt-3 flex flex-wrap gap-2">
      <!-- The model captures by itself; the manual shutter is only a fallback when it stops answering -->
      <button
        v-if="modelSilent && phase !== 'error'"
        type="button"
        class="btn btn-primary !py-2.5"
        :disabled="phase === 'captured'"
        @click="capture"
      >
        <Camera class="size-4" aria-hidden="true" />
        Capture now
      </button>
      <button type="button" class="btn !py-2.5" @click="emit('close')">
        <X class="size-4" aria-hidden="true" />
        Stop scanning
      </button>
    </div>
  </div>
</template>
