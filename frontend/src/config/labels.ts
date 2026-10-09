import type { TaskKey } from '@/types'

/**
 * The ONLY place where task labels are defined.
 * `value` must match what the backend sends/accepts; `text` is what the expert sees.
 * Order matters: the index drives the 1/2/3 keyboard shortcuts.
 *
 * To move quality to the PNS/BAFPS 115:2013 grades later, replace the quality labels with e.g.
 *   { value: 'extra', text: 'Extra', tone: 'good' },
 *   { value: 'class_1', text: 'Class I', tone: 'neutral' },
 *   { value: 'class_2', text: 'Class II', tone: 'warn' },
 */
export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

export interface LabelDef {
  value: string
  text: string
  tone: Tone
}

export interface TaskDef {
  key: TaskKey
  title: string
  labels: LabelDef[]
}

export const TASKS: Record<TaskKey, TaskDef> = {
  maturity: {
    key: 'maturity',
    title: 'Maturity',
    labels: [
      { value: 'immature', text: 'Immature', tone: 'warn' },
      { value: 'mature', text: 'Mature', tone: 'good' },
    ],
  },
  quality: {
    key: 'quality',
    title: 'Quality',
    labels: [
      { value: 'fresh', text: 'Fresh', tone: 'good' },
      { value: 'defective', text: 'Defective', tone: 'bad' },
    ],
  },
}

export const TASK_KEYS: TaskKey[] = ['maturity', 'quality']

export function labelDef(task: TaskKey, value: string): LabelDef {
  return (
    TASKS[task].labels.find((l) => l.value === value) ?? { value, text: value, tone: 'neutral' }
  )
}

/** Below this (0..1), either task's confidence marks an image out-of-distribution. */
export const CONFIDENCE_THRESHOLD = 0.75

/** Below this (0..1), similarity to the model's reference set marks an image out-of-distribution. */
export const SIMILARITY_THRESHOLD = 0.9

/**
 * What to do with fruit in each bin, keyed "maturity|quality". Copied from "actions" in
 * backend/model/deploy/config.json; keep the two in step. A missing key just shows no advice.
 */
export const BIN_ACTIONS: Record<string, string> = {
  'immature|fresh': 'Do not harvest yet. Re-check later.',
  'immature|defective': 'Do not harvest yet. Show the fruit to the expert.',
  'mature|fresh': 'Harvest. Sort for the fresh market.',
  'mature|defective': 'Harvest and set aside for sorting.',
}

/** Side of the square photo the model reads. Must match "input.size" in backend/model/deploy/config.json. */
export const MODEL_INPUT_SIZE = 224
