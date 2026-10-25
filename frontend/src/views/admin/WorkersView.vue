<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, UserPlus } from '@lucide/vue'
import { createWorker, listWorkers, resetWorkerPassword, setWorkerActive } from '@/api/workers'
import PageHeader from '@/components/PageHeader.vue'
import StateBlock from '@/components/StateBlock.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/auth'
import type { Profile } from '@/types'
import { isValidUsername, MIN_PASSWORD, normalizeUsername } from '@/utils/auth'
import { errorMessage, formatDateTime } from '@/utils/format'

const auth = useAuthStore()
const people = ref<Profile[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    people.value = await listWorkers()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Admin first, then workers by name.
const sorted = computed(() =>
  [...people.value].sort(
    (a, b) =>
      Number(b.role === 'admin') - Number(a.role === 'admin') ||
      a.full_name.localeCompare(b.full_name),
  ),
)

// ----- Add a worker -----
const adding = ref(false)
const form = ref({ full_name: '', username: '', password: '' })
const showPassword = ref(false)
const saving = ref(false)
const formError = ref<string | null>(null)
/** The new account's sign-in details, shown once so the admin can hand them over. */
const created = ref<{ name: string; username: string; password: string } | null>(null)
const copied = ref(false)

function openAdd() {
  form.value = { full_name: '', username: '', password: '' }
  formError.value = null
  showPassword.value = false
  adding.value = true
}

function checkForm(): string | null {
  if (!form.value.full_name.trim()) return 'Enter the worker’s full name.'
  if (!isValidUsername(normalizeUsername(form.value.username)))
    return 'Username must be 3-32 characters: letters, numbers, dot, dash or underscore.'
  if (form.value.password.length < MIN_PASSWORD)
    return `Password must be at least ${MIN_PASSWORD} characters.`
  return null
}

async function submitAdd() {
  formError.value = checkForm()
  if (formError.value) return
  saving.value = true
  try {
    const p = await createWorker({
      full_name: form.value.full_name.trim(),
      username: normalizeUsername(form.value.username),
      password: form.value.password,
    })
    created.value = { name: p.full_name, username: p.username, password: form.value.password }
    copied.value = false
    adding.value = false
    await load()
  } catch (e) {
    formError.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}

async function copyCredentials() {
  if (!created.value) return
  const text = `Username: ${created.value.username}\nPassword: ${created.value.password}`
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
  } catch {
    copied.value = false
  }
}

// ----- Disable / enable -----
const toggling = ref<Profile | null>(null)
const toggleBusy = ref(false)
const toggleError = ref<string | null>(null)

function askToggle(p: Profile) {
  toggling.value = p
  toggleError.value = null
}

async function confirmToggle() {
  if (!toggling.value) return
  toggleBusy.value = true
  try {
    await setWorkerActive(toggling.value.id, !toggling.value.active)
    toggling.value = null
    await load()
  } catch (e) {
    toggleError.value = errorMessage(e)
  } finally {
    toggleBusy.value = false
  }
}

// ----- Reset password -----
const resetting = ref<Profile | null>(null)
const newPassword = ref('')
const resetBusy = ref(false)
const resetError = ref<string | null>(null)
const resetDone = ref(false)

function openReset(p: Profile) {
  resetting.value = p
  newPassword.value = ''
  resetError.value = null
  resetDone.value = false
}

async function submitReset() {
  if (!resetting.value) return
  if (newPassword.value.length < MIN_PASSWORD) {
    resetError.value = `Password must be at least ${MIN_PASSWORD} characters.`
    return
  }
  resetBusy.value = true
  resetError.value = null
  try {
    await resetWorkerPassword(resetting.value.id, newPassword.value)
    resetDone.value = true
  } catch (e) {
    resetError.value = errorMessage(e)
  } finally {
    resetBusy.value = false
  }
}

const input = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base'
</script>

<template>
  <div>
    <PageHeader
      title="Workers"
      description="Accounts for the farm staff. A worker signs in with a username and password and can only scan fruit and see their own count."
    >
      <button class="btn" :disabled="loading" @click="load">
        <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" aria-hidden="true" />
        Refresh
      </button>
      <button class="btn btn-primary" @click="openAdd">
        <UserPlus class="size-4" aria-hidden="true" />
        Add worker
      </button>
    </PageHeader>

    <!-- The details of the account just created -->
    <div
      v-if="created"
      role="status"
      class="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-100/60 p-5 text-sm"
    >
      <p class="font-semibold text-emerald-800">{{ created.name }} can sign in now.</p>
      <p class="mt-1 text-stone-700">
        Give these to the worker. The password is shown only this once.
      </p>
      <dl class="mt-3 grid max-w-sm grid-cols-[6rem_1fr] gap-y-1 font-mono">
        <dt class="text-stone-600">Username</dt>
        <dd class="font-semibold">{{ created.username }}</dd>
        <dt class="text-stone-600">Password</dt>
        <dd class="font-semibold break-all">{{ created.password }}</dd>
      </dl>
      <div class="mt-4 flex gap-2">
        <button class="btn" @click="copyCredentials">
          <component :is="copied ? Check : Copy" class="size-4" aria-hidden="true" />
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
        <button class="btn" @click="created = null">Done</button>
      </div>
    </div>

    <StateBlock :loading="loading && !people.length" :error="error" @retry="load">
      <p
        v-if="!sorted.length"
        class="rounded-xl border border-dashed border-stone-300 p-10 text-center text-stone-600"
      >
        No accounts yet.
      </p>
      <div v-else class="panel overflow-x-auto">
        <table class="w-full min-w-[40rem] text-left text-sm">
          <thead class="bg-stone-100 text-xs font-medium text-stone-600">
            <tr>
              <th class="px-4 py-2.5">Name</th>
              <th class="px-4 py-2.5">Username</th>
              <th class="px-4 py-2.5">Role</th>
              <th class="px-4 py-2.5">Status</th>
              <th class="px-4 py-2.5">Added</th>
              <th class="px-4 py-2.5"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-200">
            <tr v-for="p in sorted" :key="p.id">
              <td class="px-4 py-3 font-medium">
                {{ p.full_name }}
                <span v-if="p.id === auth.profile?.id" class="text-xs font-normal text-stone-500">
                  (you)
                </span>
              </td>
              <td class="px-4 py-3 font-mono text-stone-700">{{ p.username }}</td>
              <td class="px-4 py-3 capitalize">{{ p.role }}</td>
              <td class="px-4 py-3">
                <span
                  class="rounded px-2 py-0.5 text-xs font-medium"
                  :class="
                    p.active ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'
                  "
                >
                  {{ p.active ? 'Active' : 'Disabled' }}
                </span>
              </td>
              <td class="px-4 py-3 text-stone-600">
                {{ p.created_at ? formatDateTime(p.created_at) : '' }}
              </td>
              <td class="px-4 py-3">
                <span class="flex justify-end gap-2">
                  <button class="btn px-2.5 py-1.5 text-xs" @click="openReset(p)">
                    <KeyRound class="size-3.5" aria-hidden="true" />
                    Reset password
                  </button>
                  <button
                    v-if="p.id !== auth.profile?.id"
                    class="btn px-2.5 py-1.5 text-xs"
                    :class="p.active && '!text-red-700'"
                    @click="askToggle(p)"
                  >
                    {{ p.active ? 'Disable' : 'Enable' }}
                  </button>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </StateBlock>

    <!-- Add worker -->
    <Dialog :open="adding" @update:open="(open) => (adding = open)">
      <DialogContent class="sm:max-w-md">
        <form class="space-y-4" novalidate @submit.prevent="submitAdd">
          <DialogHeader>
            <DialogTitle>Add a worker</DialogTitle>
            <DialogDescription>
              The worker can sign in right away with this username and password. No email is needed.
            </DialogDescription>
          </DialogHeader>
          <label class="block">
            <span class="mb-1 block text-sm font-medium text-stone-700">Full name</span>
            <input v-model="form.full_name" type="text" autocomplete="off" :class="input" />
          </label>
          <label class="block">
            <span class="mb-1 block text-sm font-medium text-stone-700">Username</span>
            <input
              v-model="form.username"
              type="text"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              :class="input"
            />
            <span class="mt-1 block text-xs text-stone-500">
              3-32 characters: letters, numbers, dot, dash or underscore.
            </span>
          </label>
          <label class="block">
            <span class="mb-1 block text-sm font-medium text-stone-700">Password</span>
            <span class="relative block">
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                :class="[input, 'pr-11']"
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
            <span class="mt-1 block text-xs text-stone-500"
              >At least {{ MIN_PASSWORD }} characters.</span
            >
          </label>
          <p v-if="formError" role="alert" class="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {{ formError }}
          </p>
          <DialogFooter>
            <button type="button" class="btn" @click="adding = false">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Adding' : 'Add worker' }}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- Disable / enable -->
    <Dialog :open="toggling !== null" @update:open="(open) => !open && (toggling = null)">
      <DialogContent v-if="toggling" class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {{ toggling.active ? 'Disable' : 'Enable' }} {{ toggling.full_name }}?
          </DialogTitle>
          <DialogDescription>
            {{
              toggling.active
                ? 'They will not be able to sign in or save scans. The fruit they already scanned stays in the inventory.'
                : 'They will be able to sign in and scan again.'
            }}
          </DialogDescription>
        </DialogHeader>
        <p v-if="toggleError" role="alert" class="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {{ toggleError }}
        </p>
        <DialogFooter>
          <button class="btn" @click="toggling = null">Cancel</button>
          <button
            class="btn"
            :class="toggling.active ? 'btn-danger' : 'btn-primary'"
            :disabled="toggleBusy"
            @click="confirmToggle"
          >
            {{ toggleBusy ? 'Saving' : toggling.active ? 'Disable' : 'Enable' }}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Reset password -->
    <Dialog :open="resetting !== null" @update:open="(open) => !open && (resetting = null)">
      <DialogContent v-if="resetting" class="sm:max-w-md">
        <form class="space-y-4" novalidate @submit.prevent="submitReset">
          <DialogHeader>
            <DialogTitle>New password for {{ resetting.full_name }}</DialogTitle>
            <DialogDescription>
              Tell the worker their new password. Their old one stops working.
            </DialogDescription>
          </DialogHeader>
          <template v-if="!resetDone">
            <input
              v-model="newPassword"
              type="text"
              autocomplete="new-password"
              :placeholder="`At least ${MIN_PASSWORD} characters`"
              :class="input"
            />
            <p v-if="resetError" role="alert" class="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {{ resetError }}
            </p>
          </template>
          <p v-else role="status" class="rounded-md bg-emerald-100/60 p-3 text-sm text-emerald-800">
            Password changed. Username <strong class="font-mono">{{ resetting.username }}</strong
            >, password <strong class="font-mono">{{ newPassword }}</strong
            >.
          </p>
          <DialogFooter>
            <button type="button" class="btn" @click="resetting = null">
              {{ resetDone ? 'Done' : 'Cancel' }}
            </button>
            <button v-if="!resetDone" type="submit" class="btn btn-primary" :disabled="resetBusy">
              {{ resetBusy ? 'Saving' : 'Change password' }}
            </button>
          </DialogFo