import type { ApiClient, Decision, ItemDetail, QueueItem } from '@/types'
import { postJson, request, resolveUrl } from './http'

const fixQueueItem = (item: QueueItem): QueueItem => ({
  ...item,
  imageUrl: resolveUrl(item.imageUrl),
})

const fixDetail = (item: ItemDetail): ItemDetail => ({
  ...item,
  imageUrl: resolveUrl(item.imageUrl),
  gradcamUrl: resolveUrl(item.gradcamUrl),
  neighbors: item.neighbors.map((n) => ({ ...n, imageUrl: resolveUrl(n.imageUrl) })),
  views: item.views?.map((v) => ({
    ...v,
    neighbors: v.neighbors.map((n) => ({ ...n, imageUrl: resolveUrl(n.imageUrl) })),
  })),
})

export const realApi: ApiClient = {
  async getQueue(limit, offset) {
    const items = await request<QueueItem[]>(`/api/queue?limit=${limit}&offset=${offset}`)
    return items.map(fixQueueItem)
  },

  async getItem(id) {
    return fixDetail(await request<ItemDetail>(`/api/items/${encodeURIComponent(id)}`))
  },

  async submitFeedback(id, payload) {
    await postJson<void>(`/api/items/${encodeURIComponent(id)}/feedback`, payload)
  },

  async predict(front, back) {
    const form = new FormData()
    form.append('image', front)
    if (back) form.append('back', back)
    const item = fixDetail(
      await request<ItemDetail>('/api/predict', { method: 'POST', body: form }),
    )
    // /api/predict is stateless: the backend keeps no photo, so the page shows its own copy.
    return { ...item, imageUrl: '' }
  },

  getMetrics: () => request('/api/metrics'),

  async getHistory() {
    const rows = await request<Decision[]>('/api/history')
    return rows.map((r) => ({ ...r, imageUrl: resolveUrl(r.imageUrl) }))
  },
}
