<script setup lang="ts">
import { computed } from 'vue'
import { ShieldCheck, Sprout } from '@lucide/vue'
import type { InventoryRow } from '@/api/inventory'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { TASK_KEYS, TASKS } from '@/config/labels'
import { maturityIcon, qualityIcon, toneText } from '@/config/tones'
import { buildBins } from '@/utils/bins'
import { pct } from '@/utils/format'

/** Fruit per maturity + quality bin, one card each, with totals per task underneath. */
const props = defineProps<{ rows: InventoryRow[] }>()

const total = computed(() => props.rows.reduce((a, r) => a + r.count, 0))
const bins = computed(() => buildBins(props.rows, total.value))

/** Totals of one task regardless of the other, e.g. all mature fruit. */
const subtotals = computed(() =>
  TASK_KEYS.map((task) => ({
    title: TASKS[task].title,
    icon: task === 'maturity' ? Sprout : ShieldCheck,
    items: TASKS[task].labels.map((l) => ({
      text: l.text,
      count: props.rows.filter((r) => r[task] === l.value).reduce((a, r) => a + r.count, 0),
    })),
  })),
)
</script>

<template>
  <div>
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

        <CardFooter class="mt-auto min-h-[4.25rem] items-start border-t border-stone-200 px-5 py-3">
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
  </div>
</template>
