<script setup lang="ts">
import { ref } from 'vue'
import { RotateCcw } from '@lucide/vue'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { Side } from '@/types'

defineProps<{
  side: Side
  title: string
  url: string | null
  flagged?: boolean
}>()
const emit = defineEmits<{ retake: [] }>()

const zoomed = ref(false)

function retake() {
  zoomed.value = false
  emit('retake')
}
</script>

<template>
  <!-- The saved photo is a 224 x 224 square, so the tile is square too: what is shown is exactly
       what the model reads, with nothing cropped away. Tapping it opens it full size. -->
  <figure class="w-20 shrink-0 sm:w-24" :data-side="side">
    <button
      v-if="url"
      type="button"
      class="block aspect-square w-full overflow-hidden rounded-lg border"
      :class="flagged ? 'border-red-300 ring-2 ring-red-100' : 'border-stone-200'"
      :aria-label="`Zoom the ${title.toLowerCase()} photo`"
      @click="zoomed = true"
    >
      <img :src="url" :alt="`${title} photo`" class="size-full object-contain" />
    </button>
    <p
      v-else
      class="grid aspect-square place-items-center rounded-lg border border-dashed border-stone-200 bg-stone-50 text-xs text-stone-600"
    >
      Waiting
    </p>
    <p v-if="flagged" class="mt-1 text-xs leading-tight text-red-700">Not recognized</p>
    <figcaption class="mt-1 flex items-center justify-between gap-1 text-xs">
      <span class="font-medium" :class="flagged && 'text-red-700'">{{ title }}</span>
      <button
        v-if="url"
        type="button"
        class="font-medium text-brand-700 underline underline-offset-2"
        @click="emit('retake')"
      >
        Retake
      </button>
    </figcaption>

    <Dialog v-model:open="zoomed">
      <DialogContent
        v-if="url"
        class="gap-0 overflow-hidden p-0 sm:max-w-lg [&_button.absolute]:bg-white/90 [&_button.absolute]:text-stone-900 [&_button.absolute]:hover:bg-white"
      >
        <img
          :src="url"
          :alt="`${title} photo`"
          class="aspect-square w-full bg-stone-950 object-contain"
        />
        <div class="flex items-center justify-between gap-3 p-4">
          <DialogTitle class="font-display text-lg">
            {{ title }}<span v-if="flagged" class="text-red-700"> not recognized</span>
          </DialogTitle>
          <button type="button" class="btn btn-primary !py-2.5" @click="retake">
            <RotateCcw class="size-4" aria-hidden="true" />
            Retake
          </button>
        </div>
      </DialogContent>
    </Dialog>
  </figure>
</template>
