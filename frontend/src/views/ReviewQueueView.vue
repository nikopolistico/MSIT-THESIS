<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { RefreshCw } from '@lucide/vue'
import ConfidenceBar from '@/components/ConfidenceBar.vue'
import LabelBadge from '@/components/LabelBadge.vue'
import PageHeader from '@/components/PageHeader.vue'
import StateBlock from '@/components/StateBlock.vue'
import { TASK_KEYS, TASKS } from '@/config/labels'
import { useReviewStore } from '@/stores/review'
import { pct } from '@/utils/format'
import { maxEntropy, queueReason } from '@/utils/review'

const store = useReviewStore()

onMounted(() => {
  void store.load(true)
})
</script>

<template>
  <div>
    <PageHeader
      title="Review queue"
      :description="
        store.items.length
          ? `${store.items.length} fruit waiting, the one the model is least sure about first.`
          : 'Fruit the model is least sure about, the most uncertain first.'
      "
    >
      <button class="btn" :disabled="store.loading" @click="store.load(true)">
        <RefreshCw class="size-4" :class="{ 'animate-spin': store.loading }" aria-hidden="true" />
        Refresh
      </button>
    </PageHeader>

    <StateBlock
      :loading="store.loading && !store.items.length"
      :error="store.error"
      @retry="store.load(true)"
    >
      <div v-if="store.loaded && !store.items.length" class="max-w-prose py-10">
        <p class="font-display text-xl font-semibold">Nothing to review</p>
        <p class="mt-2 text-stone-600">
          Put fruit photos in backend/data/pool and press Refresh. New photos are scored by the
          model and the least certain ones are listed here first.
        </p>
      </div>

      <div v-else>
        <div class="section-title"><h2>In order of uncertainty</h2></div>
        <div
          class="hidden grid-cols-[2rem_4.5rem_minmax(0,1.5fr)_minmax(0,1fr)_5rem] gap-4 border-b border-stone-200 py-2 text-xs font-medium text-stone-600 md:grid"
        >
          <span>No.</span>
          <span>Fruit</span>
          <span>The model says</span>
          <span>Why it is here</span>
          <span class="text-right">Uncertainty</span>
        </div>

        <ul class="divide-y divide-stone-200 border-b border-stone-200">
          <li v-for="(item, i) in store.items" :key="item.id">
            <RouterLink
              :to="{ name: 'review-detail', params: { id: item.id } }"
              class="group grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 py-4 transition-colors hover:bg-brand-50/60 md:grid-cols-[2rem_4.5rem_minmax(0,1.5fr)_minmax(0,1fr)_5rem]"
            >
              <span
                class="hidden font-display text-lg font-semibold tabular-nums text-stone-500 md:block"
              >
                {{ i + 1 }}
              </span>
              <img
                :src="item.imageUrl"
                :alt="`Fruit ${item.id}`"
                class="size-16 rounded-md object-cover md:size-[4.5rem]"
              />
              <div class="grid gap-2">
                <div
                  v-for="t in TASK_KEYS"
                  :key="t"
                  class="grid grid-cols-[5.5rem_1fr] items-center gap-3"
                >
                  <span class="flex items-center gap-2 text-xs text-stone-600">
                    {{ TASKS[t].title }}
                  </span>
                  <span class="flex items-center gap-3">
                    <LabelBadge :task="t" :value="item[t].label" />
                    <span class="min-w-0 flex-1"
                      ><ConfidenceBar :value="item[t].confidence"
                    /></span>
                  </span>
                </div>
              </div>
              <p class="col-span-2 text-sm text-stone-700 md:col-span-1">{{ queueReason(item) }}</p>
              <div class="col-span-2 md:col-span-1">
                <p class="text-right text-sm font-semibold tabular-nums">
                  {{ item.entropy.toFixed(3) }}
                </p>
                <div class="mt-1 h-1 overflow-hidden rounded-full bg-stone-200">
                  <div
                    class="h-full rounded-full bg-brand-600"
                    :style="{ width: pct(Math.min(1, item.entropy / maxEntropy)) }"
                  ></div>
                </div>
              </div>
            </RouterLink>
          </li>
        </ul>

        <div v-if="store.hasMore && store.items.length" class="pt-6 text-center">
          <button class="btn" :disabled="store.loading" @click="store.load()">
            {{ store.loading ? 'Loading' : 'Load more' }}
          </button>
        </div>
      </div>
    </StateBlock>
  </div>
</template>
