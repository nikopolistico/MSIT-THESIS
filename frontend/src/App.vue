<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppNav from '@/components/AppNav.vue'

const route = useRoute()
// The sign-in page has no navigation, so it is centred without the sidebar gap.
const bare = computed(() => !route.meta.roles)
</script>

<template>
  <AppNav v-if="!bare" />
  <!-- dvh: the height follows the phone's address bar. The bottom padding clears the mobile nav and
       the home-indicator area. -->
  <main
    :class="
      bare
        ? 'min-h-dvh px-4 py-6'
        : 'min-h-dvh px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-[17rem] md:pr-8'
    "
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
