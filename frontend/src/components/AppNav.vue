<script setup lang="ts">
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'
import { Boxes, History, LayoutDashboard, ListChecks, ScanLine } from '@lucide/vue'

interface NavLink {
  to: string
  label: string
  icon: Component
}

const groups: { title: string; links: NavLink[] }[] = [
  {
    title: 'Monitoring',
    links: [
      { to: '/dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
      { to: '/inventory', label: 'Inventory', icon: Boxes },
    ],
  },
  { title: 'Tools', links: [{ to: '/grade', label: 'Quick grade', icon: ScanLine }] },
  {
    title: 'Expert review',
    links: [
      { to: '/review', label: 'Review queue', icon: ListChecks },
      { to: '/history', label: 'History', icon: History },
    ],
  },
]
const links = groups.flatMap((g) => g.links)
const mobileLabel: Record<string, string> = { '/dashboard': 'Dashboard', '/grade': 'Grade' }
</script>

<template>
  <!-- Desktop / tablet sidebar: magenta skin with green scale tips on its edge -->
  <aside class="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col bg-sidebar p-4 md:flex">
    <div class="scale-tips absolute inset-y-0 -right-3" aria-hidden="true"></div>

    <div class="mb-8 flex items-center gap-3 px-2 pt-2">
      <!-- Halved pitaya: skin, flesh, seeds -->
      <svg viewBox="0 0 32 32" class="size-9 shrink-0" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="#f8bbd0" />
        <circle cx="16" cy="16" r="11.5" fill="#fff8fa" />
        <g fill="#1f1219">
          <circle cx="16" cy="10.5" r="1" />
          <circle cx="11" cy="14" r="1" />
          <circle cx="21" cy="14" r="1" />
          <circle cx="13" cy="20" r="1" />
          <circle cx="19" cy="20" r="1" />
          <circle cx="16" cy="16" r="1" />
        </g>
      </svg>
      <div class="leading-tight">
        <p class="font-display text-base font-semibold text-white">Dragon fruit</p>
        <p class="text-xs text-white/75">Grading console</p>
      </div>
    </div>

    <nav class="flex flex-col gap-6" aria-label="Main">
      <div v-for="g in groups" :key="g.title" class="flex flex-col gap-0.5">
        <p class="mb-1 border-b border-sidebar-border px-2 pb-1.5 text-xs text-white/75">
          {{ g.title }}
        </p>
        <RouterLink
          v-for="l in g.links"
          :key="l.to"
          :to="l.to"
          class="flex items-center gap-3 rounded-lg border-l-2 border-transparent px-2 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-sidebar-accent hover:text-white"
          active-class="!border-sidebar-primary !bg-sidebar-accent !text-white"
        >
          <component :is="l.icon" class="size-[18px] shrink-0" aria-hidden="true" />
          {{ l.label }}
        </RouterLink>
      </div>
    </nav>
  </aside>

  <!-- Mobile bottom bar -->
  <nav
    class="fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white md:hidden"
    aria-label="Main"
  >
    <RouterLink
      v-for="l in links"
      :key="l.to"
      :to="l.to"
      class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-stone-600"
      active-class="!text-brand-700"
    >
      <component :is="l.icon" class="size-5" aria-hidden="true" />
      {{ mobileLabel[l.to] ?? l.label.split(' ')[0] }}
    </RouterLink>
  </nav>
</template>
