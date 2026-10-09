<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppNav from '@/components/AppNav.vue'
</script>

<template>
  <AppNav />
  <main class="min-h-screen px-4 pt-6 pb-24 md:pb-10 md:pl-[17rem] md:pr-8">
    <div class="mx-auto max-w-6xl">
      <RouterView />
    </div>
  </main>
</template>
