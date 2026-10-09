import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/review' },
    {
      path: '/review',
      name: 'review-queue',
      component: () => import('@/views/ReviewQueueView.vue'),
      meta: { title: 'Review queue' },
    },
    {
      path: '/review/:id',
      name: 'review-detail',
      component: () => import('@/views/ExpertReviewView.vue'),
      props: true,
      meta: { title: 'Expert review' },
    },
    {
      path: '/grade',
      name: 'grade',
      component: () => import('@/views/QuickGradeView.vue'),
      meta: { title: 'Quick grade' },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { title: 'Admin Dashboard' },
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('@/views/InventoryView.vue'),
      meta: { title: 'Inventory' },
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('@/views/HistoryView.vue'),
      meta: { title: 'History' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/review' },
  ],
})

router.afterEach((to) => {
  document.title = `${(to.meta.title as string) ?? 'Review'} · Dragon Fruit Expert Review`
})

export default router
