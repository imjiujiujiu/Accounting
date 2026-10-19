<script setup>
// 暫時的首頁：確認登入與資料庫連線正常。正式畫面等 UI 定稿後替換。
import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabase'
import { session, signOut } from '../lib/auth'
import { useRouter } from 'vue-router'

const router = useRouter()
const status = ref('檢查中…')
const ok = ref(false)

onMounted(async () => {
  const { count, error } = await supabase
    .from('categories')
    .select('*', { count: 'exact', head: true })
  if (error) {
    status.value = `資料庫連線失敗：${error.message}`
  } else {
    ok.value = true
    status.value = `資料庫連線正常，共 ${count} 個類別`
  }
})

async function logout() {
  await signOut()
  router.replace('/login')
}
</script>

<template>
  <main class="center">
    <div class="card">
      <h1>已登入</h1>
      <p class="muted">{{ session?.user?.email }}</p>
      <p :class="ok ? 'ok' : 'muted'">{{ status }}</p>
      <button @click="logout">登出</button>
    </div>
  </main>
</template>
