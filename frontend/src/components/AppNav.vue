<script setup lang="ts">
import { computed, type Component } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  Boxes,
  ChartNoAxesColumn,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  ScanLine,
  Users,
} from '@lucide/vue'
import BrandMark from '@/components/BrandMark.vue'
import { useAuthStore } from '@/stores/auth'

interface NavLink {
  to: string
  label: string
  icon: Component
  /** Shorter label for the mobile bottom bar; the bar shows only links that have one. */
  mobile?: string
}

const auth = useAuthStore()
const router = useRouter()

const adminGroups: { title: string; links: NavLink[] }[] = [
  {
    title: 'Monitoring',
    links: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, mobile: 'Dashboard' },
      { to: '/inventory', label: 'Inventory', icon: Boxes, mobile: 'Inventory' },
      { to: '/workers', label: 'Workers', icon: Users, mobile: 'Workers' },
    ],
  },
  {
    title: 'Tools',
    links: [{ to: '/grade', label: 'Quick grade', icon: ScanLine, mobile: 'Grade' }],
  },
  {
    title: 'Expert review',
    links: [
      { to: '/review', label: 'Review queue', icon: ListChecks, mobile: 'Review' },
      { to: '/history', label: 'History', icon: History },
      { to: '/model', label: 'Model metrics', icon: ChartNoAxesColumn },
    ],
  },
]

const workerGroups: { title: string; links: NavLink[] }[] = [
  {
    title: 'My work',
    links: [
      { to: '/scan', label: 'Scan', icon: ScanLine, mobile: 'Scan' },
      { to: '/my-dashboard', label: 'My dashboard', icon: LayoutDashboard, mobile: 'My dashboard' },
    ],
  },
]

const groups = computed(() => (auth.isAdmin ? adminGroups : workerGroups))
const mobileLinks = computed(() => groups.value.flatMap((g) => g.links).filter((l) => l.mobile))
const roleText = computed(() => (auth.isAdmin ? 'Admin' : 'Worker'))

async function signOut() {
  await auth.signOut()
  await router.replace('/login')
}
</script>

<template>
  <!-- Desktop / tablet sidebar: magenta skin with green scale tips on its edge -->
  <aside class="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col bg-sidebar p-4 md:flex">
    <div class="scale-tips absolute inset-y-0 -right-3" aria-hidden="true"></div>

    <div class="mb-8 flex items-center gap-3 px-2 pt-2">
      <BrandMark class="size-9 shrink-0" />
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

    <div class="mt-auto border-t border-sidebar-border px-2 pt-4">
      <p class="truncate text-sm font-medium text-white">{{ auth.profile?.full_name }}</p>
      <p class="text-xs text-white/75">{{ roleText }} · {{ auth.profile?.username }}</p>
      <button
        class="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-sidebar-accent hover:text-white"
        @click="signOut"
      >
        <LogOut class="size-[18px]" aria-hidden="true" />
        Sign out
      </button>
    </div>
  </aside>

  <!-- Mobile top strip: who is signed in, and sign out -->
  <header class="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-2.5 md:hidden">
    <BrandMark class="size-7 shrink-0" />
    <div class="min-w-0 flex-1 leading-tight">
      <p class="truncate text-sm font-medium">{{ auth.profile?.full_name }}</p>
      <p class="text-xs text-stone-500">{{ roleText }}</p>
    </div>
    <button class="btn px-2.5 py-1.5 text-xs" @click="signOut">
      <LogOut class="size-4" aria-hidden="true" />
      Sign out
    </button>
  </header>

  <!-- Mobile bottom bar -->
  <nav
    class="fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    aria-label="Main"
  >
    <RouterLink
      v-for="l in mobileLinks"
      :key="l.to"
      :to="l.to"
      class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-stone-600"
      active-class="!text-brand-700"
    >
      <component :is="l.icon" class="size-5" aria-hidden="true" />
      {{ l.mobile }}
    </RouterLink>
  </nav>
</template>
