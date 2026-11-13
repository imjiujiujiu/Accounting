<script setup>
// 管理：支出分類、收入分類、標籤（三欄）。設計稿：Figma「Manage v2」（node 123:138）。
// 帳戶管理已移到左上角的帳戶側選單（AccountDrawer 的管理模式）。
// 分類：可新增、改名、換圖示、刪除（需求 3.3）；圖示用 IconPicker 從精選清單挑選。刪除時交易改套「其他」並加上同名標籤。「其他」不能刪除、不能改名。
// 兩層分類：清單為樹狀（小分類縮排在大分類下方）；編輯框多「所屬分類」（無＝大分類）。新增、編輯一律走 save_category：
// 第一次拆開有交易的大分類時，交易移到自動建立的「其他X」（toast 告知筆數）；小分類換組或刪除後，原大分類只剩「其他X」就收回單層。
// 有小分類的大分類不能刪除（不顯示垃圾桶）；「其他X」不能改名、刪除（沒有操作圖示）。
// 標籤：改名、刪除（只移除關聯）。
// 編輯：同一時間只開一個編輯框；新增出現在清單最上方，編輯就地取代該列。刪除前跳出確認對話框。
// 頁面頂端分段切換「分類與標籤｜固定收支」（需求 3.10）。固定收支：規則清單獨佔整頁寬，依下次產生日排序、
// 已結束的排在最下方並調淡；點整列開啟規則對話框（RuleDialog），刪除在對話框裡。
// 管理頁只能編輯、刪除規則；新增一律從清單頁的新增交易（日期旁的重複圖示）。
import { ref, computed, reactive } from 'vue'
import Icon from '../components/Icon.vue'
import IconPicker from '../components/IconPicker.vue'
import { BaseButton, IconButton, TextInput, FormField, SelectMenu, Skeleton } from '../components/ui/index.js'
import { refs, loadRefs, afterTransactionChange, showToast } from '../lib/store.js'
import { api } from '../lib/api/index.js'
import { OTHER } from '../lib/api/categories.js'
import { categoryIcon } from '../lib/logic/display.js'
import { categoryTree } from '../lib/logic/categoryTree.js'
import { confirmDialog } from '../lib/confirm.js'
import { focusFirstInvalid } from '../lib/focusInvalid.js'
import { accountsById, categoriesById } from '../lib/store.js'
import { formatSigned } from '../lib/logic/display.js'
import { ruleMeta, sortRules } from '../lib/logic/recurring.js'
import { manageTab, openRule } from '../lib/ruleDialog.js'

const TABS = [
  { key: 'categories', name: '分類與標籤' },
  { key: 'rules', name: '固定收支' },
]

/* ===== 固定收支 ===== */
const TONE = { income: 'var(--color-income)', expense: 'var(--color-expense)' }
const ruleRows = computed(() =>
  sortRules(refs.rules).map((r) => {
    const cat = categoriesById.value.get(r.category_id)
    const acc = accountsById.value.get(r.account_id)
    return {
      rule: r,
      ended: !!r.is_finished,
      title: r.note || cat?.name || (r.type === 'income' ? '收入' : '支出'),
      icon: categoryIcon(cat),
      meta: ruleMeta(r),
      accountName: acc?.name ?? '—',
      amountText: formatSigned(r.type === 'income' ? r.amount : -r.amount, acc?.currency ?? 'TWD', refs.currencies),
    }
  }),
)
const activeRules = computed(() => ruleRows.value.filter((r) => !r.ended))
const endedRules = computed(() => ruleRows.value.filter((r) => r.ended))

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
/** error：名稱沒填時顯示在名稱欄位下（儲存失敗則以短提示顯示） */
const editing = reactive({ section: null, id: null, error: '' })
const isEditing = (section, id) => editing.section === section && editing.id === id
function openEditor(section, id) {
  Object.assign(editing, { section, id, error: '' })
}
function closeEditor() {
  Object.assign(editing, { section: null, id: null, error: '' })
}

/* 第一次讀取中：各卡片顯示骨架列（寬度為名稱長度的百分比） */
const SKELETON_ROWS = { expense: [24, 32, 20, 28, 24, 36], income: [28, 20, 32], tag: [36, 52] }

/* ===== 分類 ===== */
// 樹狀列：大分類（depth 0）之後接它的小分類（depth 1）
const catGroups = computed(() =>
  [
    { kind: 'expense', title: '支出分類', color: 'var(--color-expense)' },
    { kind: 'income', title: '收入分類', color: 'var(--color-income)' },
  ].map((g) => ({
    ...g,
    items: categoryTree(refs.categories, g.kind).flatMap(({ category, children }) => [
      { ...category, depth: 0, hasChildren: children.length > 0 },
      ...children.map((ch) => ({ ...ch, depth: 1, isOtherSub: ch.name === `${OTHER}${category.name}`, parentName: category.name })),
    ]),
  })),
)
const isFixed = (c) => (c.name === OTHER && !c.parent_id) || c.isOtherSub
/** 「所屬分類」選項：無＋同收支的大分類（不含「其他」與自己） */
function parentOptions(kind, selfId) {
  return [
    { value: '', label: '無（大分類）' },
    ...categoryTree(refs.categories, kind)
      .map((n) => n.category)
      .filter((c) => c.name !== OTHER && c.id !== selfId)
      .map((c) => ({ value: c.id, label: c.name, icon: categoryIcon(c), iconColor: kind === 'income' ? 'var(--color-income)' : 'var(--color-expense)' })),
  ]
}
// 還沒執行 20261022_manage_categories.sql：讀不到使用次數，分類暫時都不能刪除
const usageUnavailable = computed(() => refs.categories.some((c) => c.txn_count === null))
// 圖示：預設為目前顯示的圖示（新增時為該收支的「其他」）；只有改過才寫入 categories.icon
// 新增小分類時，沒動過圖示就預覽大分類的圖示（不寫入，之後沿用大分類）
const cat = reactive({ name: '', icon: '', initialIcon: '', parentId: '', hasChildren: false })
function editCategory(kind, c) {
  const icon = categoryIcon(c ?? { kind, name: OTHER })
  Object.assign(cat, { name: c ? c.name : '', icon, initialIcon: icon, parentId: c?.parent_id ?? '', hasChildren: !!c?.hasChildren })
  openEditor(kind, c ? c.id : 'new')
}
function changeParent(kind, parentId) {
  const untouched = cat.icon === cat.initialIcon
  cat.parentId = parentId
  if (editing.id === 'new' && untouched) {
    const parent = refs.categories.find((x) => x.id === parentId)
    cat.icon = cat.initialIcon = categoryIcon(parent ?? { kind, name: OTHER })
  }
}
// 按 Enter（或「儲存」）送出；名稱沒填 → 欄位下顯示錯誤並把焦點移過去
async function saveCategory(kind, e) {
  editing.error = cat.name.trim() ? '' : '請輸入分類名稱'
  if (editing.error) return focusFirstInvalid(e?.target)
  const isNew = editing.id === 'new'
  const id = editing.id
  const icon = cat.icon !== cat.initialIcon ? cat.icon : undefined
  let result = null
  const ok = await act(async () => {
    result = await api.categories.save({
      ...(isNew ? { kind } : { id }),
      name: cat.name,
      parent_id: cat.parentId || null,
      ...(icon !== undefined ? { icon } : {}),
    })
  }, null)
  if (!ok) return
  closeEditor()
  showToast(saveToast(isNew, result))
  // 有交易換了分類：清單與合計要重讀
  if (result?.split || result?.collapsed) afterTransactionChange()
}
// 例：已新增分類，12 筆交易及 1 條固定收支移到「其他交通」
function saveToast(isNew, r) {
  const base = isNew ? '已新增分類' : '已更新分類'
  if (r?.split) {
    const moved = [r.split.movedTxns && `${r.split.movedTxns} 筆交易`, r.split.movedRules && `${r.split.movedRules} 條固定收支`].filter(Boolean)
    return `${base}，${moved.join('及 ')}移到「${r.split.otherName}」`
  }
  if (r?.collapsed) {
    const p = refs.categories.find((x) => x.id === r.collapsed.parentId)
    return p ? `${base}；「${p.name}」已沒有小分類` : base
  }
  return base
}
async function removeCategory(c) {
  const ok = await confirmDialog({ title: `刪除「${c.name}」？`, message: removeMessage(c), confirmText: '刪除' })
  if (!ok) return
  // 交易改了分類、多了標籤：清單、合計與標籤都要重讀
  if (await act(() => api.categories.remove(c.id), '已刪除分類')) afterTransactionChange()
}
// 例：12 筆交易及 2 條固定收支將改為「其他」，並加上「娛樂」標籤。刪除後無法復原。
// 小分類改為同大分類的「其他X」；刪完只剩「其他X」時，另說明大分類會收回成沒有小分類
function removeMessage(c) {
  const target = c.parent_id ? `${OTHER}${c.parentName}` : OTHER
  const used = [c.txn_count && `${c.txn_count} 筆交易`, c.rule_count && `${c.rule_count} 條固定收支`].filter(Boolean)
  const siblings = c.parent_id ? refs.categories.filter((x) => x.parent_id === c.parent_id && x.id !== c.id) : []
  const collapse =
    c.parent_id && siblings.length === 1 && siblings[0].name === target
      ? `「${c.parentName}」將沒有小分類，「${target}」的交易會歸回「${c.parentName}」。`
      : ''
  if (!used.length) return `${collapse}刪除後無法復原。`
  return `${used.join('及 ')}將改為「${target}」，並加上「${c.name}」標籤。${collapse}刪除後無法復原。`
}

/* ===== 標籤 ===== */
const tagName = ref('')
function editTag(t) {
  tagName.value = t.name
  openEditor('tag', t.id)
}
async function saveTag(e) {
  editing.error = tagName.value.trim() ? '' : '請輸入標籤名稱'
  if (editing.error) return focusFirstInvalid(e?.target)
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

</script>

<template>
  <div class="seg" role="tablist" aria-label="管理項目">
    <button
      v-for="t in TABS"
      :key="t.key"
      type="button"
      class="seg-btn body2-bold"
      :class="{ on: manageTab === t.key }"
      role="tab"
      :aria-selected="manageTab === t.key"
      @click="manageTab = t.key"
    >
      {{ t.name }}
    </button>
  </div>

  <!-- 固定收支 -->
  <section v-if="manageTab === 'rules'" class="card block rules" :aria-busy="!refs.loaded">
    <div class="block-head">
      <p class="h5">固定收支</p>
    </div>
    <template v-if="!refs.loaded">
      <div v-for="w in [20, 28, 16]" :key="w" class="rule sk" aria-hidden="true">
        <Skeleton w="40" h="40" r="12" />
        <span class="desc"><Skeleton :w="w + '%'" h="16" /><Skeleton w="120" h="12" /></span>
        <Skeleton w="88" h="16" />
      </div>
    </template>
    <template v-else>
      <template v-for="(group, gi) in [activeRules, endedRules]" :key="gi">
        <hr v-if="gi === 1 && activeRules.length && endedRules.length" class="divider" />
        <button v-for="r in group" :key="r.rule.id" class="rule" :class="{ ended: r.ended }" type="button" @click="openRule(r.rule)">
          <span class="cat-icon"><Icon :name="r.icon" :color="TONE[r.rule.type]" /></span>
          <span class="desc">
            <span class="desc-title">{{ r.title }}</span>
            <span class="desc-meta"><Icon name="repeat" :size="14" color="var(--color-text)" />{{ r.meta }}</span>
          </span>
          <span class="wallet"><span class="tag"><Icon name="wallet" :size="16" color="var(--color-text)" />{{ r.accountName }}</span></span>
          <span class="amount" :class="r.rule.type === 'income' ? 'c-income' : 'c-expense'">{{ r.amountText }}</span>
        </button>
      </template>
      <div v-if="!ruleRows.length" class="rules-empty">
        <p class="body2 c-text">還沒有固定收支。房租、薪水、訂閱這類固定的收入或支出，設定一次，之後到日期當天會自動記一筆。</p>
        <p class="body2 c-text">在清單頁新增交易時，點日期旁的重複圖示就能設定。</p>
      </div>
    </template>
    <p v-if="ruleRows.length" class="caption c-text">到日期當天自動新增一筆交易；修改只影響之後產生的交易。要新增固定收支，請在清單頁新增交易時點日期旁的重複圖示。</p>
  </section>

  <div v-else class="manage">
    <!-- 支出分類、收入分類 -->
    <section v-for="g in catGroups" :key="g.kind" class="card block" :aria-busy="!refs.loaded">
      <div class="block-head">
        <p class="h5">{{ g.title }}</p>
        <BaseButton icon="plus" :disabled="busy || !refs.loaded" @click="editCategory(g.kind, null)">新增</BaseButton>
      </div>

      <div v-for="(w, i) in refs.loaded ? [] : SKELETON_ROWS[g.kind]" :key="'sk' + i" class="item" aria-hidden="true">
        <span class="label-row"><Skeleton w="16" h="16" r="4" /><Skeleton :w="w + '%'" h="16" /></span>
        <span class="actions"><Skeleton w="24" h="24" r="6" /><Skeleton w="24" h="24" r="6" /></span>
      </div>
      <template v-for="c in [{ id: 'new' }, ...g.items]" :key="c.id">
        <form v-if="isEditing(g.kind, c.id)" class="editor" @submit.prevent="saveCategory(g.kind, $event)">
          <div class="cat-fields">
            <FormField label="圖示" as="div">
              <IconPicker v-model="cat.icon" :color="g.color" />
            </FormField>
            <FormField label="名稱" class="grow-field" :error="editing.error"><TextInput v-model="cat.name" maxlength="20" :invalid="!!editing.error" @input="editing.error = ''" /></FormField>
          </div>
          <FormField label="所屬分類" as="div">
            <SelectMenu
              :model-value="cat.parentId"
              :options="parentOptions(g.kind, c.id)"
              :disabled="cat.hasChildren"
              @update:model-value="changeParent(g.kind, $event)"
            />
          </FormField>
          <p v-if="cat.hasChildren" class="caption c-text">這個分類底下有小分類，不能成為小分類。</p>
          <div class="editor-foot">
            <BaseButton @click="closeEditor">取消</BaseButton>
            <BaseButton variant="primary" type="submit" :disabled="busy">儲存</BaseButton>
          </div>
        </form>
        <div v-else-if="c.id !== 'new'" class="item" :class="{ sub: c.depth === 1, parent: c.hasChildren }">
          <span class="label-row">
            <Icon :name="categoryIcon(c)" :size="16" :color="g.color" />
            <span class="body1">{{ c.name }}</span>
          </span>
          <!-- 「其他」與「其他X」是收容分類：不能改名、不能刪除；有小分類的大分類只能編輯 -->
          <span v-if="!isFixed(c)" class="actions">
            <IconButton icon="pen" label="編輯" @click="editCategory(g.kind, c)" />
            <IconButton v-if="c.canDelete && !c.hasChildren" icon="trash" label="刪除" tone="danger" :disabled="busy" @click="removeCategory(c)" />
            <!-- 有小分類的大分類沒有垃圾桶：留位置讓筆對齊其他列 -->
            <span v-else-if="c.hasChildren" class="action-spacer" aria-hidden="true"></span>
          </span>
        </div>
      </template>
      <p v-if="usageUnavailable" class="caption c-supply">資料庫尚未更新，分類暫時都不能刪除。請到 Supabase 執行 20261022_manage_categories.sql。</p>
      <p class="caption c-text">刪除分類時，使用中的交易會改為「其他」（小分類改為同組的「其他X」），並加上與原分類同名的標籤。「其他」不能改名或刪除。有小分類的大分類，需先刪除小分類。</p>
    </section>

    <!-- 標籤 -->
    <section class="card block">
      <div class="block-head"><p class="h5">標籤</p></div>
      <div v-for="(w, i) in refs.loaded ? [] : SKELETON_ROWS.tag" :key="'sk' + i" class="item" aria-hidden="true">
        <span class="label-row"><Skeleton w="16" h="16" r="4" /><Skeleton :w="w + '%'" h="16" /></span>
        <span class="actions"><Skeleton w="24" h="24" r="6" /><Skeleton w="24" h="24" r="6" /></span>
      </div>
      <template v-for="t in refs.tags" :key="t.id">
        <form v-if="isEditing('tag', t.id)" class="editor" @submit.prevent="saveTag($event)">
          <FormField label="名稱" :error="editing.error"><TextInput v-model="tagName" maxlength="30" :invalid="!!editing.error" @input="editing.error = ''" /></FormField>
          <div class="editor-foot">
            <BaseButton @click="closeEditor">取消</BaseButton>
            <BaseButton variant="primary" type="submit" :disabled="busy">儲存</BaseButton>
          </div>
        </form>
        <div v-else class="item">
          <span class="label-row"><Icon name="tag16" :size="16" color="var(--color-text)" /><span class="body1">{{ t.name }}</span></span>
          <span class="actions">
            <IconButton icon="pen" label="改名" @click="editTag(t)" />
            <IconButton icon="trash" label="刪除" tone="danger" :disabled="busy" @click="removeTag(t)" />
          </span>
        </div>
      </template>
      <p v-if="refs.loaded && !refs.tags.length" class="body2 c-text">還沒有標籤。記帳時在「標籤」欄位輸入就會自動建立。</p>
      <p class="caption c-text">刪除標籤只會移除標籤本身，交易不受影響。沒有交易使用的標籤會自動移除。</p>
    </section>
  </div>
</template>

<style scoped>
/* 頁面頂端分段切換：Card 底、Line 框；選中為 Tag 底＋Title 字（同分類選單的分段樣式） */
.seg {
  display: inline-flex; gap: var(--sp-2); padding: var(--sp-2); margin-bottom: var(--sp-24);
  background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--r-12);
}
.seg-btn { height: 36px; padding: 0 var(--sp-20); border-radius: var(--r-8); color: var(--color-text); }
.seg-btn.on { background: var(--color-tag); color: var(--color-title); }

/* 固定收支清單：列的樣式比照交易清單 */
.rules { gap: var(--sp-8); }
.rules .block-head { margin-bottom: var(--sp-8); }
.rules > .caption { margin-top: var(--sp-8); }
.rule {
  display: flex; align-items: center; gap: var(--sp-12); min-height: 50px;
  border-radius: var(--r-12); text-align: left; padding: var(--sp-4); margin: 0 calc(-1 * var(--sp-4));
  width: calc(100% + 2 * var(--sp-4));
}
button.rule:hover { background: rgba(32, 42, 58, .5); }
.rule.ended { opacity: .5; }
.cat-icon { width: 40px; height: 40px; border-radius: var(--r-12); background: var(--color-tag); display: grid; place-items: center; flex-shrink: 0; }
.desc { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-4); justify-content: center; }
.desc-title { font-size: 16px; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
.desc-meta { display: flex; align-items: center; gap: var(--sp-4); font-size: 12px; color: var(--color-text); }
.wallet { width: 230px; flex-shrink: 0; display: flex; align-items: center; }
.amount { flex-shrink: 0; min-width: 150px; text-align: right; font-size: 16px; font-weight: 700; white-space: nowrap; }
.divider { width: 100%; border: 0; border-top: 1px solid var(--color-line); margin: var(--sp-8) 0; }
.rules-empty { display: flex; flex-direction: column; gap: var(--sp-4); padding: var(--sp-16) 0; }
@media (max-width: 760px) {
  .seg { display: flex; margin-bottom: var(--sp-16); }
  .seg-btn { flex: 1; height: 40px; padding: 0; }
  .wallet { display: none; }
  .amount { min-width: 0; }
}

.manage { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-24); align-items: start; }
.block { display: flex; flex-direction: column; gap: var(--sp-16); min-width: 0; }
.block-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-12); }

/* 清單列 */
.item { display: flex; align-items: center; gap: var(--sp-16); min-height: 32px; }
/* 小分類：縮排在大分類下方，左側一條細線標示同一組 */
.item.sub { margin-left: 7px; padding-left: var(--sp-16); border-left: 1px solid var(--color-line); min-height: 36px; }
.item.parent .body1 { font-weight: 700; }
.label-row { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--sp-8); }
.label-row > .body1 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: var(--sp-16); flex-shrink: 0; }
.action-spacer { width: 24px; flex-shrink: 0; }
/* 觸控裝置：圖示點擊範圍 44px（視覺位置不變），比照帳戶側選單 */
@media (hover: none), (pointer: coarse) {
  .actions { gap: 0; margin: -10px -10px -10px 0; }
  .actions :deep(.icon-button), .action-spacer { width: 44px; height: 44px; }
}

/* 編輯框（新增在最上方；編輯就地取代該列） */
.editor { display: flex; flex-direction: column; gap: var(--sp-16); padding: var(--sp-16); border: 1px solid var(--color-primary); border-radius: var(--r-12); }
.editor-foot { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-12); }
.editor-foot > span { flex: 1; min-width: 0; }
.cat-fields { display: flex; gap: var(--sp-12); align-items: flex-start; }
.grow-field { flex: 1; }

@media (max-width: 1100px) { .manage { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 720px) { .manage { grid-template-columns: 1fr; } }
</style>
