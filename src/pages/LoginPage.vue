<script setup>
import { ref } from 'vue'
import { signInWithGoogle } from '../lib/auth'
import { BaseButton } from '../components/ui/index.js'

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
      <BaseButton variant="primary" @click="login">使用 Google 登入</BaseButton>
      <p v-if="error" class="body2 c-expense">{{ error }}</p>
    </div>
  </main>
</template>
