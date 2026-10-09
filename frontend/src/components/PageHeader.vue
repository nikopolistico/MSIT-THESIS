<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="mb-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-[1.75rem] leading-tight font-semibold">{{ title }}</h1>
        <p v-if="description" class="mt-1 max-w-prose text-sm text-stone-600">{{ description }}</p>
      </div>
      <div class="flex items-center gap-2"><slot /></div>
    </header>
    <div class="seed-rule mt-5" aria-hidden="true"></div>
  </div>
</template>
