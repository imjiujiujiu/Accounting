<script setup>
// 管理：帳戶、標籤（左欄）、支出分類、收入分類。設計稿：Figma Manage（node 57:621）。
// 帳戶：有交易後不可改幣別、不可刪除（只能停用）。
// 分類：可新增、改名、停用；沒有交易使用才能刪除（垃圾桶），有交易使用時該位置改為停用。
// 標籤：改名、刪除（只移除關聯）。
// 編輯：同一時間只開一個編輯框；新增出現在清單最上方，編輯就地取代該列。刪除前跳出確認對話框。
import { ref, computed, reactive } from 'vue'
import Icon from '../components/Icon.vue'
import SelectMenu from '../components/SelectMenu.vue'
import { refs, loadRefs, afterTransactionChange, showToast, baseCurrency } from '../lib/store.js'
import { api, ACCOUNT_TYPES } from '../lib/api/index.js'
import { parseAmount, toInputString, minorUnitOf } from '../lib/logic/money.js'
import { formatSigned, categoryIcon } from '../lib/logic/display.js'
import { confirmDialog } from '../lib/confirm.js'

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

/** 目前開著的編輯框：section＝'account' | 'expense' | 'income' | 'tag'；id＝'new' 或項目 id */
const editing = reactive({ section: null, id: null, error: '' })
const isEditing = (section, id) => editing.section === section && editing.id === id
function openEditor(section, id) {
  Object.assign(editing, { section, id, error: '' })
}
function closeEditor() {
  Object.assign(editing, { section: null, id: null, error: '' })
}

// 停用的排最後
const byActive = (a, b) => b.is_active - a.is_active || a.sort_order - b.sort_order

/* ===== 帳戶 ===== */
const typeLabel = (k) => ACCOUNT_TYPES.find((t) => t.key === k)?.label ?? k
const typeOptions = ACCOUNT_TYPES.map((t) => ({ value: t.key, label: t.label }))
const currencyOptions = computed(() => refs.currencies.map((c) => ({ value: c.code, label: `${c.name_zh} ${c.code}` })))
const sortedAccounts = computed(() => [...refs.accounts].sort(byActive))
const acc = reactive({ name: '', type: 'bank', currency: 'TWD', initial: '0', locked: false })

function editAccount(a) {
  Object.assign(
    acc,
    a
      ? { name: a.name, type: a.type, currency: a.currency, initial: toInputString(a.initial_balance, minorUnitOf(a.currency, refs.currencies)), locked: a.txn_count > 0 }
      : { name: '', type: 'bank', currency: baseCurrency.value, initial: '0', locked: false },
  )
  openEditor('account', a ? a.id : 'new')
}
async function saveAccount() {
  if (!acc.name.trim()) return (editing.error = '請輸入帳戶名稱')
  const raw = String(acc.initial).trim()
  const initial = parseAmount(raw === '' ? '0' : raw.replace(/^-/, ''), minorUnitOf(acc.currency, refs.currencies))
  if (Number.isNaN(initial)) return (editing.error = '初始餘額格式不正確')
  const sign = raw.startsWith('-') ? -1 : 1
  const payload = { name: acc.name, type: acc.type, initial_balance: sign * initial }
  if (!acc.locked) payload.currency = acc.currency
  const isNew = editing.id === 'new'
  const id = editing.id
  const ok = await act(
    () => (isNew ? api.accounts.create({ ...payload, sort_order: refs.accounts.length + 1 }) : api.accounts.update(id, payload)),
    isNew ? '已新增帳戶' : '已更新帳戶',
  )
  if (ok) {
    closeEditor()
    afterTransactionChange()
  }
}
async function removeAccount(a) {
  if (!(await confirmDialog({ title: `刪除帳戶「${a.name}」？`, message: '刪除後無法復原。', confirmText: '刪除' }))) return
  await act(() => api.accounts.remove(a.id), '已刪除帳戶')
}

/* ===== 分類 ===== */
const catGroups = computed(() =>
  [
    { kind: 'expense', title: '支出分類', color: 'var(--color-expense)' },
    { kind: 'income', title: '收入分類', color: 'var(--color-income)' },
  ].map((g) => ({ ...g, items: refs.categories.filter((c) => c.kind === g.kind).sort(byActive) })),
)
// 還沒執行 20261022_manage_categories.sql：讀不到使用次數，分類暫時都不能刪除
const usageUnavailable = computed(() => refs.categories.some((c) => c.txn_count === null))
const cat = reactive({ name: '', icon: '' })
function editCategory(kind, c) {
  // MVP：圖示依名稱對應、不可自選；新增的分類一律用該收支的「其他」圖示
  Object.assign(cat, { name: c ? c.name : '', icon: categoryIcon(c ?? { kind, name: '其他' }) })
  openEditor(kind, c ? c.id : 'new')
}
async function saveCategory(kind) {
  if (!cat.name.trim()) return (editing.error = '請輸入分類名稱')
  const isNew = editing.id === 'new'
  const id = editing.id
  const ok = await act(
    () => (isNew ? api.categories.create({ name: cat.name, kind }) : api.categories.update(id, { name: cat.name })),
    isNew ? '已新增分類' : '已更新分類',
  )
  if (ok) closeEditor()
}
async function removeCategory(c) {
  if (!(await confirmDialog({ title: `刪除分類「${c.name}」？`, message: '刪除後無法復原。', confirmText: '刪除' }))) return
  await act(() => api.categories.remove(c.id), '已刪除分類')
}

/* ===== 標籤 ===== */
const tagName = ref('')
function editTag(t) {
  tagName.value = t.name
  openEditor('tag', t.id)
}
async function saveTag() {
  if (!tagName.value.trim()) return (editing.error = '請輸入標籤名稱')
  const id = editing.id
  if (await act(() => api.tags.rename(id, tagName.value), '已更新標籤')) {
    closeEditor()
    afterTransactionChange()
  }
}
async function removeTag(t) {
  const ok = await confirmDialog({
    title: `刪除標籤「${t.name}」？`,
    message: '只會移除標籤本身，使用這個標籤的交易不受影響。',
    confirmText: '刪除',
  })
  if (!ok) return
  if (await act(() => api.tags.remove(t.id), '已刪除標籤')) afterTransactionChange()
}

/** 停用／啟用（帳戶與分類共用） */
function toggleActive(kind, item) {
  const fn = kind === 'account' ? api.accounts.setActive : api.categories.setActive
  return act(() => fn(item.id, !item.is_active), item.is_active ? '已停用' : '已啟用')
}
</script>

<template>
  <div class="manage">
    <div class="col">
      <!-- 帳戶 -->
      <section class="card block">
        <div class="block-head">
          <p class="h5">帳戶</p>
          <button class="btn sm" type="button" :disabled="busy" @click="editAccount(null)">
            <Icon name="plus" :size="20" color="var(--color-content)" />新增帳戶
          </button>
        </div>

        <template v-for="a in [{ id: 'new' }, ...sortedAccounts]" :key="a.id">
          <form v-if="isEditing('account', a.id)" class="editor" @submit.prevent="saveAccount">
            <label class="field"><span class="label">名稱</span><input v-model="acc.name" class="input" maxlength="40" /></label>
            <div class="field">
              <span class="label">類型</span>
              <SelectMenu v-model="acc.type" :options="typeOptions" />
            </div>
            <div class="field">
              <span class="label">幣別</span>
              <SelectMenu v-model="acc.currency" :options="currencyOptions" :disabled="acc.locked" />
              <span v-if="acc.locked" class="hint">已有交易，不可改幣別</span>
            </div>
            <label class="field">
              <span class="label">初始餘額</span>
              <input v-model="acc.initial" class="input" inputmode="decimal" />
              <span class="hint">信用卡欠款請填負數</span>
            </label>
            <div class="editor-foot">
              <span class="body2 c-expense">{{ editing.error }}</span>
              <button class="btn sm" type="button" @click="closeEditor">取消</button>
              <button class="btn sm primary" type="submit" :disabled="busy">儲存</button>
            </div>
          </form>
          <div v-else-if="a.id !== 'new'" class="item account" :class="{ dim: !a.is_active }">
            <span class="grow">
              <span class="name body1-bold">{{ a.name }}<span v-if="!a.is_active" class="tag">已停用</span></span>
              <span class="caption c-text">{{ typeLabel(a.type) }} • {{ a.currency }} • {{ a.txn_count }} 筆</span>
            </span>
            <span class="h6 num" :class="a.balance < 0 ? 'c-expense' : ''">{{ formatSigned(a.balance, a.currency, refs.currencies) }}</span>
            <span class="actions">
              <button class="icon-btn" type="button" title="編輯" aria-label="編輯" @click="editAccount(a)">
                <Icon name="pen" :size="24" color="var(--color-text)" />
              </button>
              <button class="icon-btn" type="button" :title="a.is_active ? '停用' : '啟用'" :aria-label="a.is_active ? '停用' : '啟用'" :disabled="busy" @click="toggleActive('account', a)">
                <Icon :name="a.is_active ? 'block' : 'restore'" :size="24" :color="a.is_active ? 'var(--color-expense)' : 'var(--color-primary)'" />
              </button>
              <button v-if="a.canDelete" class="icon-btn" type="button" title="刪除" aria-label="刪除" :disabled="busy" @click="removeAccount(a)">
                <Icon name="trash" :size="24" color="var(--color-expense)" />
              </button>
            </span>
          </div>
        </template>
        <p v-if="!refs.accounts.length && editing.section !== 'account'" class="body2 c-text">還沒有帳戶。先建立常用的現金、銀行與信用卡帳戶。</p>
      </section>

      <!-- 標籤 -->
      <section class="card block">
        <div class="block-head"><p class="h5">標籤</p></div>
        <template v-for="t in refs.tags" :key="t.id">
          <form v-if="isEditing('tag', t.id)" class="editor" @submit.prevent="saveTag">
            <label class="field"><span class="label">名稱</span><input v-model="tagName" class="input" maxlength="30" /></label>
            <div class="editor-foot">
              <span class="body2 c-expense">{{ editing.error }}</span>
              <button class="btn sm" type="button" @click="closeEditor">取消</button>
              <button class="btn sm primary" type="submit" :disabled="busy">儲存</button>
            </div>
          </form>
          <div v-else class="item">
            <span class="label-row"><Icon name="tag16" :size="16" color="var(--color-text)" /><span class="body1">{{ t.name }}</span></span>
            <span class="actions">
              <button class="icon-btn" type="button" title="改名" aria-label="改名" @click="editTag(t)">
                <Icon name="pen" :size="24" color="var(--color-text)" />
              </button>
              <button class="icon-btn" type="button" title="刪除" aria-label="刪除" :disabled="busy" @click="removeTag(t)">
                <Icon name="trash" :size="24" color="var(--color-expense)" />
              </button>
            </span>
          </div>
        </template>
        <p v-if="!refs.tags.length" class="body2 c-text">還沒有標籤。記帳時在「標籤」欄位輸入就會自動建立。</p>
        <p class="caption c-text">刪除標籤只會移除標籤本身，交易不受影響。</p>
      </section>
    </div>

    <!-- 支出分類、收入分類 -->
    <section v-for="g in catGroups" :key="g.kind" class="card block">
      <div class="block-head">
        <p class="h5">{{ g.title }}</p>
        <button class="btn sm" type="button" :disabled="busy" @click="editCategory(g.kind, null)">
          <Icon name="plus" :size="20" color="var(--color-content)" />新增
        </button>
      </div>

      <template v-for="c in [{ id: 'new' }, ...g.items]" :key="c.id">
        <form v-if="isEditing(g.kind, c.id)" class="editor" @submit.prevent="saveCategory(g.kind)">
          <div class="cat-fields">
            <div class="field">
              <span class="label">圖示</span>
              <!-- MVP 不可自選圖示（之後改為下拉選擇） -->
              <button class="icon-select" type="button" disabled title="之後開放選擇圖示">
                <Icon :name="cat.icon" :size="16" :color="g.color" />
                <Icon name="down" :size="20" color="var(--color-text)" />
              </button>
            </div>
            <label class="field grow-field"><span class="label">名稱</span><input v-model="cat.name" class="input" maxlength="20" /></label>
          </div>
          <div class="editor-foot">
            <span class="body2 c-expense">{{ editing.error }}</span>
            <button class="btn sm" type="button" @click="closeEditor">取消</button>
            <button class="btn sm primary" type="submit" :disabled="busy">儲存</button>
          </div>
        </form>
        <div v-else-if="c.id !== 'new'" class="item" :class="{ dim: !c.is_active }">
          <span class="label-row">
            <Icon :name="categoryIcon(c)" :size="16" :color="g.color" />
            <span class="body1">{{ c.name }}</span>
            <span v-if="!c.is_active" class="tag">已停用</span>
          </span>
          <span class="actions">
            <button class="icon-btn" type="button" title="改名" aria-label="改名" @click="editCategory(g.kind, c)">
              <Icon name="pen" :size="24" color="var(--color-text)" />
            </button>
            <button v-if="!c.is_active" class="icon-btn" type="button" title="啟用" aria-label="啟用" :disabled="busy" @click="toggleActive('category', c)">
              <Icon name="restore" :size="24" color="var(--color-primary)" />
            </button>
            <button v-else-if="c.canDelete" class="icon-btn" type="button" title="刪除" aria-label="刪除" :disabled="busy" @click="removeCategory(c)">
              <Icon name="trash" :size="24" color="var(--color-expense)" />
            </button>
            <button v-else class="icon-btn" type="button" :title="c.txn_count ? `已有 ${c.txn_count} 筆交易，只能停用` : `停用`" aria-label="停用" :disabled="busy" @click="toggleActive('category', c)">
              <Icon name="block" :size="24" color="var(--color-expense)" />
            </button>
          </span>
        </div>
      </template>
      <p v-if="usageUnavailable" class="caption c-supply">資料庫尚未更新，分類暫時都不能刪除。請到 Supabase 執行 20261022_manage_categories.sql。</p>
      <p class="caption c-text">有交易使用的分類不能刪除，避免歷史交易失去歸屬；不用的請停用。</p>
    </section>
  </div>
</template>

<style scoped>
.manage { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-24); align-items: start; }
.col { display: flex; flex-direction: column; gap: var(--sp-24); min-width: 0; }
.block { display: flex; flex-direction: column; gap: var(--sp-16); min-width: 0; }
.block-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-12); }
.h5 { font-size: 18px; font-weight: 700; line-height: 1.2; }

/* 小按鈕：Tag 底（取消、新增）／主色（儲存） */
.btn.sm { height: auto; padding: var(--sp-8) var(--sp-12); border-radius: var(--r-8); font-size: 14px; gap: var(--sp-4); line-height: 1.5; }

/* 清單列 */
.item { display: flex; align-items: center; gap: var(--sp-16); min-height: 32px; }
.item.dim > :not(.actions) { opacity: .45; }
.item.account { min-height: 0; }
.grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
.name { display: flex; align-items: center; gap: var(--sp-8); }
.label-row { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--sp-8); }
.label-row > .body1 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { white-space: nowrap; }
.actions { display: flex; gap: var(--sp-16); flex-shrink: 0; }
.icon-btn { display: grid; place-items: center; width: 24px; height: 24px; border-radius: var(--r-4); }
.icon-btn:not(:disabled):hover { filter: brightness(1.25); }
.icon-btn:disabled { opacity: .4; cursor: default; }

/* 編輯框（新增在最上方；編輯就地取代該列） */
.editor { display: flex; flex-direction: column; gap: var(--sp-16); padding: var(--sp-16); border: 1px solid var(--color-primary); border-radius: var(--r-12); }
.editor .field { gap: var(--sp-4); }
.editor .input { height: 40px; border-color: transparent; }
.editor .input:focus { border-color: var(--color-primary); }
.editor .input:disabled { color: var(--color-text); cursor: not-allowed; }
.editor-foot { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-12); }
.editor-foot > span { flex: 1; min-width: 0; }
.cat-fields { display: flex; gap: var(--sp-12); align-items: flex-start; }
.grow-field { flex: 1; }
.icon-select {
  display: inline-flex; align-items: center; gap: var(--sp-4); height: 40px; padding: 0 var(--sp-12);
  background: var(--color-page); border-radius: var(--r-8); cursor: not-allowed;
}

@media (max-width: 1100px) { .manage { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 720px) { .manage { grid-template-columns: 1fr; } }
</style>
