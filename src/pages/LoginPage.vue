<script setup>
import { ref } from 'vue'
import { signInWithGoogle } from '../lib/auth'

const error = ref('')
async function login() {
  error.value = ''
  const { error: e } = await signInWithGoogle()
  if (e) error.value = '登入失敗，請重試'
}
</script>

<template>
  <main class="center">
    <div class="card">
      <h1>記帳</h1>
      <button class="primary" @click="login">使用 Google 登入</button>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </main>
</template>
