import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { initAuth } from './lib/auth'
import './styles/tokens.css'
import './styles/base.css'

initAuth()
// 等第一個頁面確定（含登入狀態確認）再掛載：在那之前 index.html 的開機骨架一直顯示，不會閃空白
const app = createApp(App).use(router)
router.isReady().then(() => app.mount('#app'))
