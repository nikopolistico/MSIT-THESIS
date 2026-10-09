import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import type { QueueItem } from '@/types'
import { errorMessage } from '@/utils/format'

const PAGE_SIZE = 20

/** Review queue shared between the list page and the detail page (for next/prev navigation). */
export const useReviewStore = defineStore('review', () => {
  const items = ref<QueueItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const hasMore = ref(true)
  const loaded = ref(false)

  async function load(reset = false) {
    if (loading.value) return
    if (reset) {
      items.value = []
      hasMore.value = true
    }
    if (!hasMore.value) return
    loading.value = true
    error.value = null
    try {
      const page = await api.getQueue(PAGE_SIZE, items.value.length)
      const known = new Set(items.value.map((i) => i.id))
      items.value = [...items.value, ...page.filter((p) => !known.has(p.id))]
      items.value.sort((a, b) => b.entropy - a.entropy)
      hasMore.value = page.length === PAGE_SIZE
      loaded.value = true
    } catch (e) {
      error.value = errorMessage(e)
    } finally {
      loading.value = false
    }
  }

  const ids = computed(() => items.value.map((i) => i.id))

  function neighborIds(id: string) {
    const i = ids.value.indexOf(id)
    if (i < 0) return { prev: null, next: null, index: -1 }
    return { prev: ids.value[i - 1] ?? null, next: ids.value[i + 1] ?? null, index: i }
  }

  function remove(id: string) {
    items.value = items.value.filter((i) => i.id !== id)
  }

  return { items, loading, error, hasMore, loaded, load, neighborIds, remove }
})
