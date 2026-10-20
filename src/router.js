import { createRouter, createWebHashHistory } from 'vue-router'
import { session, authReady } from './lib/auth'
import { isDemo } from './lib/api/index.js'
import LoginPage from './pages/LoginPage.vue'
import AppShell from './pages/AppShell.vue'
import ListPage from './pages/ListPage.vue'
import StatsPage from './pages/StatsPage.vue'
import ManagePage from './pages/ManagePage.vue'
import SettingsPage from './pages/SettingsPage.vue'

// hash 路由（#/...）：GitHub Pages 重新整理不會 404
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: LoginPage, meta: { public: true } },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', component: ListPage },
        { path: 'stats', component: StatsPage },
        { path: 'manage', component: ManagePage },
        { path: 'settings', component: SettingsPage },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  if (isDemo) return to.path === '/login' ? '/' : true
  while (!authReady.value) await new Promise((r) => setTimeout(r, 20))
  if (!to.meta.public && !session.value) return '/login'
  if (to.path === '/login' && session.value) return '/'
})
