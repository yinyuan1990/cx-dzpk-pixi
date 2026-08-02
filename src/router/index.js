import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/loading' },
  { path: '/loading', name: 'loading', component: () => import('../views/LoadingView.vue') },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
  { path: '/hall', name: 'hall', component: () => import('../views/HallView.vue') },
  { path: '/friend', name: 'friend', component: () => import('../views/FriendView.vue') },
  // 牌桌(多玩法复用同一壳,玩法用 query/param 区分)
  { path: '/table/:id?', name: 'table', component: () => import('../views/TableView.vue') },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
