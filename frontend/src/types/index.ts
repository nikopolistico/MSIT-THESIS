export type TaskKey = 'maturity' | 'quality'

export interface TaskPrediction {
  label: string
  confidence: number // 0..1
}

export interface QueueItem {
  id: string
  imageUrl: string
  maturity: TaskPrediction
  quality: TaskPrediction
  entropy: number
}

export interface Neighbor {
  id: string
  imageUrl: string
  maturityLabel: string | null // reference images carry only the label of their own dataset
  qualityLabel: string | null
  similarity: number // 0..1
}

/** One photographed side of a fruit. */
export type Side = 'front' | 'back'

export interface ViewReading {
  side: Side
  maturity: TaskPrediction
  quality: TaskPrediction
  entropy: number
  oodSimilarity: number
  neighbors: Neighbor[]
}

export interface ItemDetail extends QueueItem {
  gradcamUrl: string // empty when the backend has no heatmap
  oodSimilarity?: number // similarity to the model's reference set, 0..1
  neighbors: Neighbor[]
  views?: ViewReading[] // one per photographed side; the top-level readings combine them
}

export interface FeedbackPayload {
  maturityLabel: string
  qualityLabel: string
  note?: string
}

export interface EvalPoint {
  date: string // ISO date
  accuracy: number // 0..1
  macroF1: number // 0..1
  split?: string // which data it was measured on, e.g. "test"
  n?: number // images evaluated
  tasks?: Record<TaskKey, { n: number; accuracy: number; macroF1: number }>
}

export interface RoundStat {
  round: string
  queries: number
  corrections: number
}

export interface Consolidation {
  runAt: string // ISO datetime
  status: 'accepted' | 'rolled_back' | 'running'
  accuracyBefore?: number
  accuracyAfter?: number
  reason?: string
}

export interface Metrics {
  referenceCount: number // training images in the memory bank
  labelCount: number // training images + expert labels
  expertQueries: number
  correctionsApplied: number
  evaluations: EvalPoint[]
  rounds: RoundStat[]
  lastConsolidation: Consolidation | null
}

export interface Decision {
  id: string
  itemId: string
  imageUrl: string
  modelMaturity: string
  modelQuality: string
  expertMaturity: string
  expertQuality: string
  note?: string
  timestamp: string // ISO datetime
}

export interface ApiClient {
  getQueue(limit: number, offset: number): Promise<QueueItem[]>
  getItem(id: string): Promise<ItemDetail>
  submitFeedback(id: string, payload: FeedbackPayload): Promise<void>
  predict(front: File, back?: File): Promise<ItemDetail>
  getMetrics(): Promise<Metrics>
  getHistory(): Promise<Decision[]>
}
