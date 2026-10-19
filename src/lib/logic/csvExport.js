// CSV 匯出（獨立模組：手動按鈕與之後的每月自動匯出共用）。
// 欄位名稱與順序固定；改欄位時一定要把 FORMAT_VERSION 加 1。
import { toInputString, minorUnitOf } from './money.js'
import { createZip } from './zip.js'

export const FORMAT_VERSION = 1

// 欄位定義：[欄位名, 取值函式, 是否為文字（文字欄位會防 Excel 公式注入）]
const TRANSACTION_COLUMNS = [
  ['id', (t) => t.id],
  ['date', (t) => t.date],
  ['type', (t) => t.type],
  ['account_id', (t) => t.account_id],
  ['account_name', (t, x) => x.account(t.account_id)?.name, true],
  ['currency', (t, x) => x.account(t.account_id)?.currency],
  ['amount', (t, x) => x.money(t.amount, x.account(t.account_id)?.currency)],
  ['to_account_id', (t) => t.to_account_id],
  ['to_account_name', (t, x) => x.account(t.to_account_id)?.name, true],
  ['to_currency', (t, x) => (t.to_account_id ? x.account(t.to_account_id)?.currency : null)],
  ['to_amount', (t, x) => x.money(t.to_amount, x.account(t.to_account_id)?.currency)],
  ['category_id', (t) => t.category_id],
  ['category_name', (t, x) => x.category(t.category_id)?.name, true],
  ['original_currency', (t) => t.original_currency],
  ['original_amount', (t, x) => x.money(t.original_amount, t.original_currency)],
  ['estimated_amount', (t, x) => x.money(t.estimated_amount, x.account(t.account_id)?.currency)],
  ['fee', (t, x) => x.money(t.fee, x.account(t.account_id)?.currency)],
  ['is_estimated', (t) => (t.is_pending ? 'true' : 'false')],
  ['settled_at', (t) => t.settled_at],
  ['note', (t) => t.note, true],
  ['tags', (t, x) => x.tagsOf(t.id).join('|'), true],
  ['created_at', (t) => t.created_at],
  ['updated_at', (t) => t.updated_at],
]

const ACCOUNT_COLUMNS = [
  ['id', (a) => a.id],
  ['name', (a) => a.name, true],
  ['type', (a) => a.type],
  ['currency', (a) => a.currency],
  ['initial_balance', (a, x) => x.money(a.initial_balance, a.currency)],
  ['is_active', (a) => String(a.is_active)],
  ['sort_order', (a) => a.sort_order],
  ['created_at', (a) => a.created_at],
]

const CATEGORY_COLUMNS = [
  ['id', (c) => c.id],
  ['name', (c) => c.name, true],
  ['kind', (c) => c.kind],
  ['is_active', (c) => String(c.is_active)],
  ['sort_order', (c) => c.sort_order],
]

const TAG_COLUMNS = [
  ['id', (t) => t.id],
  ['name', (t) => t.name, true],
]

const TRANSACTION_TAG_COLUMNS = [
  ['transaction_id', (r) => r.transaction_id],
  ['tag_id', (r) => r.tag_id],
]

export const COLUMNS = {
  transactions: TRANSACTION_COLUMNS.map((c) => c[0]),
  accounts: ACCOUNT_COLUMNS.map((c) => c[0]),
  categories: CATEGORY_COLUMNS.map((c) => c[0]),
  tags: TAG_COLUMNS.map((c) => c[0]),
  transaction_tags: TRANSACTION_TAG_COLUMNS.map((c) => c[0]),
}

/** 單一欄位值 → CSV 格式 */
export function csvCell(value, isText = false) {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // 防止 Excel 把 =、+、-、@ 開頭的文字當公式執行
  if (isText && /^[=+\-@\t\r]/.test(s)) s = "'" + s
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function toCsv(rows, columns, ctx) {
  const lines = [columns.map((c) => c[0]).join(',')]
  for (const r of rows) lines.push(columns.map(([, get, isText]) => csvCell(get(r, ctx), isText)).join(','))
  // 開頭加 BOM，Excel（含 Mac）開啟時中文才不會亂碼
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/**
 * data：{ transactions, transactionTags, accounts, categories, tags, currencies }
 * 回傳 [{ name, content }]，金額以「一般單位」輸出（台幣整數元、美元 12.34）。
 */
export function buildExportFiles(data, { exportedAt = new Date(), range = null } = {}) {
  const accounts = new Map((data.accounts ?? []).map((a) => [a.id, a]))
  const categories = new Map((data.categories ?? []).map((c) => [c.id, c]))
  const tagNames = new Map((data.tags ?? []).map((t) => [t.id, t.name]))
  const tagsByTxn = new Map()
  for (const r of data.transactionTags ?? []) {
    if (!tagsByTxn.has(r.transaction_id)) tagsByTxn.set(r.transaction_id, [])
    const name = tagNames.get(r.tag_id)
    if (name != null) tagsByTxn.get(r.transaction_id).push(name)
  }

  const ctx = {
    account: (id) => (id ? accounts.get(id) : undefined),
    category: (id) => (id ? categories.get(id) : undefined),
    tagsOf: (id) => tagsByTxn.get(id) ?? [],
    money: (v, code) => (v === null || v === undefined || !code ? null : toInputString(v, minorUnitOf(code, data.currencies))),
  }

  const manifest = {
    format_version: FORMAT_VERSION,
    exported_at: exportedAt.toISOString(),
    range: range && (range.from || range.to) ? { from: range.from ?? null, to: range.to ?? null } : null,
    amount_unit: 'major', // 金額為一般單位（非最小單位整數）
    counts: {
      transactions: data.transactions?.length ?? 0,
      accounts: data.accounts?.length ?? 0,
      categories: data.categories?.length ?? 0,
      tags: data.tags?.length ?? 0,
      transaction_tags: data.transactionTags?.length ?? 0,
    },
    columns: COLUMNS,
  }

  return [
    { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) + '\n' },
    { name: 'transactions.csv', content: toCsv(data.transactions ?? [], TRANSACTION_COLUMNS, ctx) },
    { name: 'accounts.csv', content: toCsv(data.accounts ?? [], ACCOUNT_COLUMNS, ctx) },
    { name: 'categories.csv', content: toCsv(data.categories ?? [], CATEGORY_COLUMNS, ctx) },
    { name: 'tags.csv', content: toCsv(data.tags ?? [], TAG_COLUMNS, ctx) },
    { name: 'transaction_tags.csv', content: toCsv(data.transactionTags ?? [], TRANSACTION_TAG_COLUMNS, ctx) },
  ]
}

/** 下載檔名：記帳匯出-v1-2026-10-19.zip */
export function exportFileName(dateStr) {
  return `記帳匯出-v${FORMAT_VERSION}-${dateStr}.zip`
}

export function buildExportZip(data, opts = {}) {
  return createZip(buildExportFiles(data, opts), opts.exportedAt ?? new Date())
}

/** 瀏覽器下載 */
export function downloadBytes(bytes, filename, type = 'application/zip') {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
