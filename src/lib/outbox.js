// 離線待送佇列（需求 3.9）：連不上時新增的交易先存在這台裝置（localStorage），連線後依序上傳。
// - 交易 id 在開表單時就產生，save_transaction 以 id 覆蓋寫入：同一筆送兩次也不會重複。
// - 同步時機：恢復連線、切回這個分頁、開啟網頁，以及佇列不空時每 30 秒一次（收訊差時 navigator.onLine 不一定準）。
// - 資料本身有問題（例如分類已在其他裝置被刪除）→ 標記「同步失敗」，等使用者打開修改或刪除，不再自動重送。
// - 連線或登入問題 → 停下來，下次再試。
import { reactive, computed } from 'vue'
import { api } from './api/index.js'
import { queuedToRow } from './logic/outbox.js'

const KEY = 'accounting.outbox.v1'
const RETRY_MS = 30_000
const DATA_ERRORS = new Set(['invalid', 'in_use', 'not_found', 'duplicate'])

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export const outbox = reactive({ items: read(), syncing: false })

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(outbox.items))
  } catch {
    /* 無痕模式或空間不足：至少這個分頁還留著 */
  }
}

/** 清單用：尚未同步的交易（已轉成交易列的形狀） */
export const queuedRows = computed(() => outbox.items.map(queuedToRow))
export const queuedCount = computed(() => outbox.items.length)
export const failedCount = computed(() => outbox.items.filter((i) => i.error).length)

export const isQueued = (id) => outbox.items.some((i) => i.id === id)

/** 放進佇列（同 id 覆蓋：在佇列裡的交易再編輯一次） */
export function enqueue(payload) {
  const id = payload.txn.id
  const old = outbox.items.find((i) => i.id === id)
  if (old) {
    old.payload = payload
    old.error = ''
  } else {
    outbox.items.push({ id, payload, createdAt: new Date().toISOString(), error: '' })
  }
  persist()
  scheduleRetry()
}

export function dequeue(id) {
  outbox.items = outbox.items.filter((i) => i.id !== id)
  persist()
}

let onSynced = () => {}

/** 依序上傳。回傳這次成功幾筆 */
export async function flush() {
  if (outbox.syncing || !outbox.items.length) return 0
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0
  outbox.syncing = true
  let done = 0
  try {
    for (const item of [...outbox.items]) {
      if (item.error) continue
      const sent = item.payload
      try {
        await api.transactions.save(sent)
        // 上傳途中又被編輯過：留著，下一輪再送新版本
        const cur = outbox.items.find((i) => i.id === item.id)
        if (cur && cur.payload === sent) dequeue(item.id)
        done++
      } catch (e) {
        if (DATA_ERRORS.has(e.kind)) {
          const cur = outbox.items.find((i) => i.id === item.id)
          if (cur && cur.payload === sent) cur.error = e.message || '同步失敗'
          persist()
          continue
        }
        break // 連線、登入或不明錯誤：停下來，下次再試
      }
    }
  } finally {
    outbox.syncing = false
  }
  if (done) onSynced(done)
  if (outbox.items.some((i) => !i.error) && navigator.onLine !== false) scheduleRetry()
  return done
}

let timer = null
function scheduleRetry() {
  clearTimeout(timer)
  timer = null
  if (outbox.items.some((i) => !i.error)) timer = setTimeout(flush, RETRY_MS)
}

/** 由 AppShell 呼叫一次。synced(n)：有交易同步成功後（重讀清單、顯示提示） */
let started = false
export function startOutbox(synced) {
  onSynced = synced
  if (typeof window === 'undefined') return
  if (started) return flush()
  started = true
  window.addEventListener('online', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flush()
  })
  // 其他分頁改了佇列（同一台裝置開兩個分頁）
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) outbox.items = read()
  })
  flush()
}
