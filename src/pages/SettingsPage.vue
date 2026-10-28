<script setup>
// 設定：外幣預設匯率（預估台幣的備用來源）、匯出 CSV、帳號
import { BaseButton, TextInput, Skeleton } from '../components/ui/index.js'
import { ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { refs, loadRefs, showToast, baseCurrency } from '../lib/store.js'
import { api, isDemo } from '../lib/api/index.js'
import { session, signOut } from '../lib/auth.js'

const router = useRouter()
const foreign = computed(() => refs.currencies.filter((c) => c.code !== baseCurrency.value))
const rates = reactive({})
watch(
  () => refs.defaultRates,
  (list) => {
    for (const c of refs.currencies) rates[c.code] = ''
    for (const r of list) rates[r.currency] = String(r.rate)
  },
  { immediate: true },
)

const busy = ref(false)
async function saveRate(code) {
  const raw = String(rates[code] ?? '').trim()
  busy.value = true
  try {
    if (!raw) await api.settings.removeDefaultRate(code)
    else {
      const n = Number(raw)
      if (!(n > 0)) throw new Error('匯率必須是大於 0 的數字')
      await api.settings.setDefaultRate(code, n)
    }
    await loadRefs()
    showToast('已儲存匯率')
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    busy.value = false
  }
}

async function exportCsv() {
  busy.value = true
  try {
    const name = await api.export.download()
    showToast(`已下載 ${name}`)
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    busy.value = false
  }
}

async function logout() {
  await signOut()
  router.replace('/login')
}
</script>

<template>
  <div class="settings">
    <section class="card block">
      <p class="h5">外幣預設匯率</p>
      <p class="body2 c-text">
        外幣刷卡的預估台幣，優先用該幣別最近一次回壓的實際匯率；還沒有回壓紀錄時才用這裡的匯率。空白＝不預估。
      </p>
      <div v-for="i in refs.loaded ? 0 : 2" :key="'sk' + i" class="rate" aria-hidden="true">
        <Skeleton class="code" w="88" h="16" /><Skeleton w="64" h="14" /><Skeleton w="100%" h="40" /><Skeleton w="32" h="14" /><Skeleton w="52" h="32" />
      </div>
      <form v-for="c in foreign" :key="c.code" class="rate" @submit.prevent="saveRate(c.code)">
        <span class="body1-bold code">{{ c.name_zh }} {{ c.code }}</span>
        <span class="body2 c-text">1 {{ c.code }} ＝</span>
        <TextInput v-model="rates[c.code]" inputmode="decimal" placeholder="未設定" />
        <span class="body2 c-text">{{ baseCurrency }}</span>
        <BaseButton size="small" type="submit" :disabled="busy">儲存</BaseButton>
      </form>
    </section>

    <section class="card block">
      <p class="h5">資料匯出</p>
      <p class="body2 c-text">
        下載一個 zip，內含交易、帳戶、分類、標籤的 CSV（Excel 可直接開啟）。刪除與修改都無法復原，自動匯出上線前請<strong class="c-title">每月手動匯出一次</strong>。
      </p>
      <BaseButton variant="primary" class="start" :disabled="busy || isDemo" @click="exportCsv">匯出 CSV</BaseButton>
    </section>

    <section class="card block">
      <p class="h5">帳號</p>
      <p class="body1">{{ isDemo ? '示範模式' : session?.user?.email }}</p>
      <BaseButton class="start" :disabled="isDemo" @click="logout">登出</BaseButton>
    </section>
  </div>
</template>

<style scoped>
.settings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-24); align-items: start; }
.block { display: flex; flex-direction: column; gap: var(--sp-16); }
.block .start { align-self: flex-start; }
.settings > .block:first-child { grid-row: span 2; }
.rate { display: grid; grid-template-columns: 100px 76px 1fr auto auto; align-items: center; gap: var(--sp-8); }
/* 手機：幣別名稱獨立一列，下一列「1 JPY ＝ [輸入框] TWD [儲存]」，輸入框吃掉剩下的寬度 */
@media (max-width: 760px) {
  .rate { grid-template-columns: 64px minmax(0, 1fr) auto auto; row-gap: var(--sp-4); }
  .rate .code { grid-column: 1 / -1; }
  .rate + .rate { padding-top: var(--sp-8); border-top: 1px solid var(--color-line); }
}
@media (max-width: 1100px) { .settings { grid-template-columns: 1fr; } .settings > .block:first-child { grid-row: auto; } }
</style>
