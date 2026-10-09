<script setup lang="ts">
defineProps<{ loading?: boolean; error?: string | null }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    v-if="error"
    role="alert"
    class="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"
  >
    <p class="font-semibold">Could not load this page</p>
    <p class="mt-1 break-words">{{ error }}</p>
    <button class="btn mt-4" @click="$emit('retry')">Try again</button>
  </div>
  <div v-else-if="loading" class="flex items-center gap-3 p-8 text-stone-500" role="status">
    <span
      class="size-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600"
    ></span>
    Loading
  </div>
  <slot v-else />
</template>
