<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, LogIn } from '@lucide/vue'
import BrandMark from '@/components/BrandMark.vue'
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
  <div class="flex min-h-[80dvh] items-center justify-center">
    <form class="panel w-full max-w-sm p-6 sm:p-8" novalidate @submit.prevent="submit">
      <div class="mb-6 flex items-center gap-3">
        <BrandMark class="size-11 shrink-0" />
        <div class="leading-tight">
          <h1 class="text-xl font-semibold">Dragon fruit grading</h1>
          <p class="text-sm text-stone-600">Sign in with the account from your admin</p>
        </div>
      </div>

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

      <button type="submit" class="btn btn-primary w-full py-2.5" :disabled="loading">
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
</template>
