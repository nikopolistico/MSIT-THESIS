<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, LogIn } from '@lucide/vue'
import background from '@/assets/images/background image.jpg'
import logo from '@/assets/images/LOGO.jpg'
import { useAuthStore } from '@/stores/auth'
import { canVisit, homeFor } from '@/utils/auth'
import { errorMessage } from '@/utils/format'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)

async function submit() {
  if (!username.value.trim() || !password.value) {
    error.value = 'Enter your username and password.'
    return
  }
  loading.value = true
  error.value = null
  try {
    await auth.signIn(username.value, password.value)
    const role = auth.role!
    // Only follow ?next= to a page this role may open.
    const next = typeof route.query.next === 'string' ? route.query.next : null
    const target = next && router.resolve(next)
    await router.replace(target && canVisit(role, target.meta.roles) ? next! : homeFor(role))
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="relative flex min-h-[calc(100dvh-3rem)] items-center justify-center">
    <!-- The farm behind everything, darkened so the text stays readable -->
    <div class="fixed inset-0 -z-10" aria-hidden="true">
      <img :src="background" alt="" class="size-full object-cover" />
      <div
        class="absolute inset-0 bg-gradient-to-b from-stone-950/30 via-stone-950/45 to-stone-950/80 lg:bg-gradient-to-r lg:from-stone-950/75 lg:via-stone-950/45 lg:to-stone-950/25"
      ></div>
    </div>

    <div
      class="grid w-full max-w-5xl items-center gap-8 py-6 lg:grid-cols-[1.1fr_minmax(0,26rem)] lg:gap-16"
    >
      <!-- The farm -->
      <div class="flex flex-col items-center text-center text-white lg:items-start lg:text-left">
        <img
          :src="logo"
          alt="ECRJ Dragon Fruit Farm logo"
          class="size-28 rounded-full bg-white object-cover shadow-2xl ring-4 ring-white/80 sm:size-32 lg:size-44"
        />
        <h1
          class="mt-5 font-display text-3xl leading-tight font-semibold drop-shadow-md sm:text-4xl lg:text-5xl"
        >
          ECRJ Dragon Fruit Farm
        </h1>
        <p class="mt-2 text-sm text-white/85 drop-shadow sm:text-base">
          P3 Brgy. Sumilihon, Butuan City · Est. 2019
        </p>
        <p class="mt-4 hidden max-w-md text-base text-white/80 lg:block">
          Scan each fruit, front and back. The app grades its ripeness and quality and keeps the
          farm's inventory up to date.
        </p>
      </div>

      <!-- Sign in -->
      <form
        class="w-full rounded-2xl bg-white/95 p-6 shadow-2xl ring-1 ring-black/5 backdrop-blur sm:p-8"
        novalidate
        @submit.prevent="submit"
      >
        <h2 class="text-2xl font-semibold">Sign in</h2>
        <p class="mt-1 mb-6 text-sm text-stone-600">Use the account your admin gave you.</p>

        <label class="mb-4 block">
          <span class="mb-1 block text-sm font-medium text-stone-700">Username</span>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base"
          />
        </label>

        <label class="mb-5 block">
          <span class="mb-1 block text-sm font-medium text-stone-700">Password</span>
          <span class="relative block">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              class="w-full rounded-lg border border-stone-300 bg-white py-2.5 pr-11 pl-3 text-base"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-stone-500"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              @click="showPassword = !showPassword"
            >
              <component :is="showPassword ? EyeOff : Eye" class="size-4" aria-hidden="true" />
            </button>
          </span>
        </label>

        <p
          v-if="error"
          role="alert"
          class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {{ error }}
        </p>

        <button type="submit" class="btn btn-primary w-full py-3 text-base" :disabled="loading">
          <span
            v-if="loading"
            class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            aria-hidden="true"
          ></span>
          <LogIn v-else class="size-4" aria-hidden="true" />
          {{ loading ? 'Signing in' : 'Sign in' }}
        </button>
      </form>
    </div>
  </div>
</template>
