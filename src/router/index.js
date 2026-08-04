import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/loading' },
  { path: '/loading', name: 'loading', component: () => import('../views/LoadingView.vue') },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
  { path: '/hall', name: 'hall', component: () => import('../views/HallView.vue') },
  { path: '/friend', name: 'friend', component: () => import('../views/FriendView.vue') },
  { path: '/minigames', name: 'minigames', component: () => import('../views/MiniGamesView.vue') },
  { path: '/career', name: 'career', component: () => import('../views/CareerView.vue') },
  { path: '/profile', name: 'profile', component: () => import('../views/ProfileView.vue') },
  // 俱乐部列表已并入好友局页(对齐扯旋:大厅 Tab 即俱乐部列表)
  { path: '/club', redirect: '/friend' },
  { path: '/club/:id', name: 'clubDetail', component: () => import('../views/ClubDetailView.vue') },
  // 建房独立页(只有俱乐部可建房;大厅=系统公共俱乐部,后续接入)
  { path: '/create-room/:clubId', name: 'createRoom', component: () => import('../views/CreateRoomView.vue') },
  // 牌桌(多玩法复用同一壳,玩法用 query/param 区分)
  { path: '/table/:id?', name: 'table', component: () => import('../views/TableView.vue') },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
