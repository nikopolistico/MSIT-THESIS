<script setup lang="ts">
import { Camera, ImagePlus, ScanLine } from '@lucide/vue'
import ScanView from '@/components/ScanView.vue'
import type { Side } from '@/types'

defineProps<{
  side: Side
  title: string
  step: string
  hint: string
  scanning: boolean
  cancellable?: boolean
}>()
const emit = defineEmits<{
  pick: [file: File]
  scan: []
  stopScan: []
  cancel: []
}>()

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow picking the same file again
  if (file) emit('pick', file)
}
</script>

<template>
  <section class="rounded-xl border border-stone-200 bg-white p-4" :data-active-side="side">
    <div class="mb-3 flex items-baseline justify-between gap-3">
      <h2 class="text-lg font-semibold">{{ title }}</h2>
      <span class="text-xs text-stone-600">{{ step }}</span>
    </div>

    <!-- Live scan: the camera opens and the model captures by itself when it sees a fruit -->
    <ScanView
      v-if="scanning"
      :side="side"
      :cooldown="side === 'back' ? 2500 : 0"
      @capture="emit('pick', $event)"
      @close="emit('stopScan')"
    />

    <template v-else>
      <p
        class="grid h-44 place-items-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-600"
      >
        {{ hint }}
      </p>

      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" class="btn btn-primary !py-2.5" @click="emit('scan')">
          <ScanLine class="size-4" aria-hidden="true" />
          Scan
        </button>
        <label class="btn cursor-pointer !py-2.5">
          <Camera class="size-4" aria-hidden="true" />
          Take photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            class="sr-only"
            @change="onPick"
          />
        </label>
        <label class="btn cursor-pointer !py-2.5">
          <ImagePlus class="size-4" aria-hidden="true" />
          Upload
          <input type="file" accept="image/*" class="sr-only" @change="onPick" />
        </label>
      </div>
    </template>

    <div v-if="cancellable" class="mt-2 flex flex-wrap gap-2">
      <button type="button" class="btn !py-2.5" @click="emit('cancel')">Cancel</button>
    </div>
  </section>
</template>
