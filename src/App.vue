<script setup>
import { isConfigured } from './lib/supabase'
import { isDemo } from './lib/api/index.js'
</script>

<template>
  <main v-if="!isConfigured && !isDemo" class="center">
    <div class="card">
      <h1>尚未設定 Supabase</h1>
      <p class="muted">
        本機請複製 <code>.env.example</code> 為 <code>.env.local</code> 並填入；
        GitHub Pages 請在 repo 的 Settings → Secrets and variables → Actions → Variables 設定。
      </p>
    </div>
  </main>
  <RouterView v-else />
</template>
