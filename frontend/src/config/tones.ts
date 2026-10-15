import { Apple, ShieldAlert, ShieldCheck, Sprout } from '@lucide/vue'
import type { Component } from 'vue'
import type { Tone } from '@/config/labels'

/** Fill colour of a tone, for bars and colour tabs. */
export const toneColor: Record<Tone, string> = {
  good: '#4a8226',
  warn: '#bf8500',
  bad: '#a62e22',
  neutral: '#b29ca8',
}

/** Text class of a tone. */
export const toneText: Record<Tone, string> = {
  good: 'text-emerald-700',
  warn: 'text-amber-700',
  bad: 'text-red-700',
  neutral: 'text-stone-600',
}

// Ripe fruit gets the fruit icon, unripe the seedling; quality is a shield that is ticked or flagged.
export const maturityIcon: Record<Tone, Component> = {
  good: Apple,
  warn: Sprout,
  bad: Sprout,
  neutral: Sprout,
}

export const qualityIcon: Record<Tone, Component> = {
  good: ShieldCheck,
  warn: ShieldAlert,
  bad: ShieldAlert,
  neutral: ShieldCheck,
}
