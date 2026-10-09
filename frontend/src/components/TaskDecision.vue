<script setup lang="ts">
import { computed } from 'vue'
import { TASKS } from '@/config/labels'
import type { TaskKey, TaskPrediction } from '@/types'
import ConfidenceBar from './ConfidenceBar.vue'
import LabelBadge from './LabelBadge.vue'

const props = defineProps<{
  task: TaskKey
  prediction: TaskPrediction
  modelValue: string | null
  active: boolean
  shortcut: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; activate: [] }>()

const def = computed(() => TASKS[props.task])
const status = computed(() => {
  if (props.modelValue === null) return null
  return props.modelValue === props.prediction.label ? 'Confirmed' : 'Corrected'
})

function choose(value: string) {
  emit('activate')
  emit('update:modelValue', value)
}
</script>

<template>
  <!-- One section of the decision rail; the left bar marks the task the keyboard acts on. -->
  <section
    class="space-y-3 border-l-4 px-5 py-4 transition-colors"
    :class="active ? 'border-brand-600 bg-brand-50/50' : 'border-transparent'"
    @click="$emit('activate')"
  >
    <header class="flex items-center justify-between">
      <h3 class="text-base font-semibold">
        {{ def.title }}
        <kbd class="ml-1 align-middle">{{ shortcut }}</kbd>
      </h3>
      <span
        v-if="status"
        class="text-xs font-semibold"
        :class="status === 'Confirmed' ? 'text-emerald-700' : 'text-amber-700'"
      >
        {{ status }}
      </span>
    </header>

    <div>
      <div class="mb-0.5 flex items-center gap-2 text-sm text-stone-600">
        Model says <LabelBadge :task="task" :value="prediction.label" />
      </div>
      <ConfidenceBar :value="prediction.confidence" />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="btn"
        :class="
          modelValue === prediction.label && '!border-emerald-600 !bg-emerald-600 !text-white'
        "
        @click.stop="choose(prediction.label)"
      >
        Confirm
      </button>
      <span class="text-xs text-stone-500">or change to</span>
      <button
        v-for="l in def.labels.filter((x) => x.value !== prediction.label)"
        :key="l.value"
        type="button"
        class="btn"
        :class="modelValue === l.value && '!border-amber-600 !bg-amber-600 !text-white'"
        @click.stop="choose(l.value)"
      >
        {{ l.text }}
        <kbd class="!border-current/30 !bg-transparent !text-current opacity-70">{{
          def.labels.findIndex((x) => x.value === l.value) + 1
        }}</kbd>
      </button>
    </div>
  </section>
</template>
