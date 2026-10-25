import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types'
import { canVisit, homeFor } from '@/utils/auth'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    /** Who may open the page; missing means public (only the sign-in page). */
    roles?: Role[]
  }
}

const admin: Role[] = ['admin']
const worker: Role[] = ['worker']

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { title: 'Sign in' },
    },

    // Worker
    {
      path: '/scan',
      name: 'scan',
      component: () => import('@/views/shared/QuickGradeView.vue'),
      meta: { title: 'Scan', roles: worker },
    },
    {
      path: '/my-dashboard',
      name: 'my-dashboard',
      component: () => import('@/views/worker/MyDashboardView.vue'),
      meta: { title: 'My dashboard', roles: worker },
    },

    // Admin: monitoring
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/admin/DashboardView.vue'),
      meta: { title: 'Dashboard', roles: admin },
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('@/views/admin/InventoryView.vue'),
      meta: { title: 'Inventory', roles: admin },
    },
    {
      path: '/workers',
      name: 'workers',
      component: () => import('@/views/admin/WorkersView.vue'),
      meta: { title: 'Workers', roles: admin },
    },
    {
      path: '/grade',
      name: 'grade',
      component: () => import('@/views/shared/QuickGradeView.vue'),
      meta: { title: 'Quick grade', roles: admin },
    },

    // Admin: expert review
    {
      path: '/review',
      name: 'review-queue',
      component: () => import('@/views/admin/review/ReviewQueueView.vue'),
      meta: { title: 'Review queue', roles: admin },
    },
    {
      path: '/review/:id',
      name: 'review-detail',
      component: () => import('@/views/admin/review/ExpertReviewView.vue'),
      props: true,
      meta: { title: 'Expert review', roles: admin },
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('@/views/admin/review/HistoryView.vue'),
      meta: { title: 'History', roles: admin },
    },
    {
      path: '/model',
      name: 'model',
      component: () => import('@/views/admin/ModelMetricsView.vue'),
      meta: { title: 'Model metrics', roles: admin },
    },
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()
  const role = auth.role
  if (to.name === 'login' && role) return homeFor(role)
  if (canVisit(role, to.meta.roles)) return true
  return role ? homeFor(role) : { name: 'login', query: { next: to.fullPath } }
})

router.afterEach((to) => {
  document.title = `${to.meta.title ?? 'Dragon fruit'} · Dragon Fruit Grading`
})

export default router
