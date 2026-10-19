import { createRouter, createWebHashHistory } from 'vue-router'
import { session, authReady } from './lib/auth'
import LoginPage from './pages/LoginPage.vue'
import HomePage from './pages/HomePage.vue'

// hash 路由（#/...）：GitHub Pages 重新整理不會 404
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: LoginPage, meta: { public: true } },
    { path: '/', component: HomePage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  while (!authReady.value) await new Promise((r) => setTimeout(r, 20))
  if (!to.meta.public && !session.value) return '/login'
  if (to.path === '/login' && session.value) return '/'
})
