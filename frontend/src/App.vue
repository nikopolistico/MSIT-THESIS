<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppNav from '@/components/AppNav.vue'
</script>

<template>
  <AppNav />
  <!-- dvh: the height follows the phone's address bar. The bottom padding clears the mobile nav and
       the home-indicator area. -->
  <main
    class="min-h-dvh px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-[17rem] md:pr-8"
  >
    <div class="mx-auto max-w-6xl">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </div>
  </main>
</template>
