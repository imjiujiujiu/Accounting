<script setup>
// 管理：帳戶、類別、標籤。
// 帳戶：有交易後不可改幣別、不可刪除（只能停用）。類別：可新增、改名、停用，不可刪除。標籤：改名、刪除（只移除關聯）。
import { ref, computed, reactive } from 'vue'
import Icon from '../components/Icon.vue'
import { refs, loadRefs, afterTransactionChange, showToast, baseCurrency } from '../lib/store.js'
import { api, ACCOUNT_TYPES } from '../lib/api/index.js'
import { parseAmount, toInputString, minorUnitOf } from '../lib/logic/money.js'
import { formatSigned, categoryIcon } from '../lib/logic/display.js'

const busy = ref(false)
async function act(fn, okText) {
  busy.value = true
  try {
    await fn()
    await loadRefs()
    if (okText) showToast(okText)
    return true
  } catch (e) {
    showToast(e.message, 'error')
    return false
  } finally {
    busy.value = false
  }
}

/* ===== 帳戶 ===== */
const typeLabel = (k) => ACCOUNT_TYPES.find((t) => t.key === k)?.label ?? k
const sortedAccounts = computed(() => [...refs.accounts].sort((a, b) => b.is_active - a.is_active || a.sort_order - b.sort_order))
const acc = reactive({ id: null, draft: null, error: '' }) // id = 'new' 為新增

function editAccount(a) {
  acc.error = ''
  acc.id = a ? a.id : 'new'
  acc.draft = a
    ? { name: a.name, type: a.type, currency: a.currency, initial: toInputString(a.initial_balance, minorUnitOf(a.currency, refs.currencies)), locked: a.txn_count > 0 }
    : { name: '', type: 'bank', currency: baseCurrency.value, initial: '0', locked: false }
}
async function saveAccount() {
  const d = acc.draft
  if (!d.name.trim()) return (acc.error = '請輸入帳戶名稱')
  const initial = parseAmount(d.initial === '' ? '0' : String(d.initial).replace(/^-/, ''), minorUnitOf(d.currency, refs.currencies))
  if (Number.isNaN(initial)) return (acc.error = '初始餘額格式不正確')
  const sign = String(d.initial).trim().startsWith('-') ? -1 : 1
  const payload = { name: d.name, type: d.type, initial_balance: sign * initial }
  if (!d.locked) payload.currency = d.currency
  const ok = await act(
    () => (acc.id === 'new' ? api.accounts.create({ ...payload, sort_order: refs.accounts.length + 1 }) : api.accounts.update(acc.id, payload)),
    acc.id === 'new' ? '已新增帳戶' : '已更新帳戶',
  )
  if (ok) {
    acc.id = null
    afterTransactionChange()
  }
}
const confirmDel = ref(null)
async function removeAccount(a) {
  if (confirmDel.value !== a.id) return (confirmDel.value = a.id)
  confirmDel.value = null
  await act(() => api.accounts.remove(a.id), '已刪除帳戶')
}

/* ===== 類別 ===== */
const catGroups = computed(() =>
  [
    { kind: 'expense', title: '支出類別', color: 'var(--color-expense)' },
    { kind: 'income', title: '收入類別', color: 'var(--color-income)' },
  ].map((g) => ({
    ...g,
    items: refs.categories.filter((c) => c.kind === g.kind).sort((a, b) => b.is_active - a.is_active || a.sort_order - b.sort_order),
  })),
)
const cat = reactive({ id: null, name: '' })
const newCat = reactive({ expense: '', income: '' })
async function saveCategory() {
  if (!cat.name.trim()) return
  if (await act(() => api.categories.update(cat.id, { name: cat.name }), '已更新類別')) cat.id = null
}
async function addCategory(kind) {
  if (!newCat[kind].trim()) return
  if (await act(() => api.categories.create({ name: newCat[kind], kind }), '已新增類別')) newCat[kind] = ''
}

/* ===== 標籤 ===== */
const tag = reactive({ id: null, name: '' })
async function saveTag() {
  if (!tag.name.trim()) return
  if (await act(() => api.tags.rename(tag.id, tag.name), '已更新標籤')) {
    tag.id = null
    afterTransactionChange()
  }
}
async function removeTag(t) {
  if (confirmDel.value !== t.id) return (confirmDel.value = t.id)
  confirmDel.value = null
  if (await act(() => api.tags.remove(t.id), '已刪除標籤')) afterTransactionChange()
}
</script>

<template>
  <div class="manage">
    <div class="col">
    <!-- 帳戶 -->
    <section class="card block">
      <div class="block-head">
        <p class="h4">帳戶</p>
        <button class="btn small" type="button" :disabled="busy" @click="editAccount(null)"><Icon name="add" :size="18" />新增帳戶</button>
      </div>

      <template v-for="a in [{ id: 'new' }, ...sortedAccounts]" :key="a.id">
        <form v-if="acc.id === a.id" class="editor" @submit.prevent="saveAccount">
          <label class="field"><span class="label">名稱</span><input v-model="acc.draft.name" class="input" maxlength="40" /></label>
          <label class="field">
            <span class="label">類型</span>
            <select v-model="acc.draft.type" class="input"><option v-for="t in ACCOUNT_TYPES" :key="t.key" :value="t.key">{{ t.label }}</option></select>
          </label>
          <label class="field">
            <span class="label">幣別</span>
            <select v-model="acc.draft.currency" class="input" :disabled="acc.draft.locked">
              <option v-for="c in refs.currencies" :key="c.code" :value="c.code">{{ c.name_zh }} {{ c.code }}</option>
            </select>
            <span v-if="acc.draft.locked" class="hint">已有交易，不可改幣別</span>
          </label>
          <label class="field">
            <span class="label">初始餘額</span>
            <input v-model="acc.draft.initial" class="input" inputmode="decimal" />
            <span class="hint">信用卡欠款請填負數</span>
          </label>
          <div class="editor-foot">
            <span class="body2 c-expense">{{ acc.error }}</span>
            <button class="btn ghost small" type="button" @click="acc.id = null">取消</button>
            <button class="btn primary small" type="submit" :disabled="busy">儲存</button>
          </div>
        </form>
        <div v-else-if="a.id !== 'new'" class="item" :class="{ dim: !a.is_active }">
          <span class="grow">
            <span class="body1-bold">{{ a.name }}</span>
            <span class="caption c-text">{{ typeLabel(a.type) }} · {{ a.currency }}{{ a.is_active ? '' : ' · 已停用' }} · {{ a.txn_count }} 筆</span>
          </span>
          <span class="body1-bold" :class="a.balance < 0 ? 'c-expense' : ''">{{ formatSigned(a.balance, a.currency, refs.currencies) }}</span>
          <span class="actions">
            <button class="btn ghost small" type="button" @click="editAccount(a)">編輯</button>
            <button class="btn ghost small" type="button" :disabled="busy" @click="act(() => api.accounts.setActive(a.id, !a.is_active), a.is_active ? '已停用' : '已啟用')">
              {{ a.is_active ? '停用' : '啟用' }}
            </button>
            <button v-if="a.canDelete" class="btn danger small" :class="{ confirm: confirmDel === a.id }" type="button" :disabled="busy" @click="removeAccount(a)">
              {{ confirmDel === a.id ? '確定刪除？' : '刪除' }}
            </button>
          </span>
        </div>
      </template>
      <p v-if="!refs.accounts.length && acc.id !== 'new'" class="body2 c-text">還沒有帳戶。先建立常用的現金、銀行與信用卡帳戶。</p>
    </section>

    <!-- 標籤 -->
    <section class="card block">
      <p class="h4">標籤</p>
      <div v-for="t in refs.tags" :key="t.id" class="item">
        <Icon name="tag" :size="20" color="var(--color-text)" />
        <form v-if="tag.id === t.id" class="grow inline" @submit.prevent="saveTag">
          <input v-model="tag.name" class="input small-input" maxlength="30" />
          <button class="btn primary small" type="submit" :disabled="busy">儲存</button>
          <button class="btn ghost small" type="button" @click="tag.id = null">取消</button>
        </form>
        <template v-else>
          <span class="grow body1">{{ t.name }}</span>
          <span class="actions">
            <button class="btn ghost small" type="button" @click="Object.assign(tag, { id: t.id, name: t.name })">改名</button>
            <button class="btn danger small" :class="{ confirm: confirmDel === t.id }" type="button" :disabled="busy" @click="removeTag(t)">
              {{ confirmDel === t.id ? '確定刪除？' : '刪除' }}
            </button>
          </span>
        </template>
      </div>
      <p v-if="!refs.tags.length" class="body2 c-text">還沒有標籤。記帳時在「標籤」欄位輸入就會自動建立。</p>
      <p class="caption c-text">刪除標籤只會移除標籤本身，交易不受影響。</p>
    </section>
    </div>
    <div class="col">
    <!-- 類別 -->
    <section v-for="g in catGroups" :key="g.kind" class="card block">
      <p class="h4">{{ g.title }}</p>
      <div v-for="c in g.items" :key="c.id" class="item" :class="{ dim: !c.is_active }">
        <Icon :name="categoryIcon(c)" :size="20" :color="g.color" />
        <form v-if="cat.id === c.id" class="grow inline" @submit.prevent="saveCategory">
          <input v-model="cat.name" class="input small-input" maxlength="20" />
          <button class="btn primary small" type="submit" :disabled="busy">儲存</button>
          <button class="btn ghost small" type="button" @click="cat.id = null">取消</button>
        </form>
        <template v-else>
          <span class="grow body1">{{ c.name }}<span v-if="!c.is_active" class="caption c-text">（停用）</span></span>
          <span class="actions">
            <button class="btn ghost small" type="button" @click="Object.assign(cat, { id: c.id, name: c.name })">改名</button>
            <button class="btn ghost small" type="button" :disabled="busy" @click="act(() => api.categories.setActive(c.id, !c.is_active), c.is_active ? '已停用' : '已啟用')">
              {{ c.is_active ? '停用' : '啟用' }}
            </button>
          </span>
        </template>
      </div>
      <form class="inline add" @submit.prevent="addCategory(g.kind)">
        <input v-model="newCat[g.kind]" class="input small-input" placeholder="新增類別" maxlength="20" />
        <button class="btn small" type="submit" :disabled="busy || !newCat[g.kind].trim()">新增</button>
      </form>
      <p class="caption c-text">類別不能刪除，避免歷史交易失去分類；不用的請停用。</p>
    </section>

    </div>
  </div>
</template>

<style scoped>
.manage { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-16); align-items: start; }
.col { display: flex; flex-direction: column; gap: var(--sp-16); min-width: 0; }
.block { display: flex; flex-direction: column; gap: var(--sp-8); }
.block-head { display: flex; align-items: center; justify-content: space-between; }
.block > .h4 { margin-bottom: var(--sp-8); }
.item { display: flex; align-items: center; gap: var(--sp-12); min-height: 48px; padding: var(--sp-4) 0; border-bottom: 1px solid var(--color-line); }
.item.dim { opacity: .55; }
.grow { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.actions { display: flex; gap: var(--sp-4); }
.inline { flex-direction: row; align-items: center; gap: var(--sp-8); display: flex; }
.add { margin-top: var(--sp-8); }
.small-input { height: 36px; }
.editor { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-12); padding: var(--sp-16); border: 1px solid var(--color-primary); border-radius: var(--r-12); margin: var(--sp-8) 0; }
.editor-foot { grid-column: 1 / -1; display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-8); }
.editor-foot > span { flex: 1; }
@media (max-width: 1100px) { .manage { grid-template-columns: 1fr; } }
</style>
