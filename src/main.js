import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { initAuth } from './lib/auth'
import './styles/tokens.css'
import './styles/base.css'

initAuth()
createApp(App).use(router).mount('#app')
