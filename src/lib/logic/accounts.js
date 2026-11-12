// 帳戶選單的分區與合計（需求 3.2）：資產／負債＋淨資產。純邏輯，手機與電腦共用。
//   負債＝信用卡帳戶；資產＝其餘類型。只計主幣別（台幣）帳戶；
//   外幣帳戶（例如日幣現金錢包）以自身幣別另列一區，不計入合計。
//   餘額沿用帳戶清單的 balance（預估中的外幣刷卡以預估值計入）。

const byOrder = (a, b) => a.sort_order - b.sort_order

/**
 * @param accounts      api.accounts.list() 的結果（含 balance）
 * @param types         帳戶類型 [{ key, label }]（ACCOUNT_TYPES，決定區內的群組順序）
 * @param baseCurrency  主幣別
 * @returns {{ netWorth: number, sections: Array<{ key, label, total: number|null, groups: Array<{ key, label, accounts }> }> }}
 *   sections 依序為 asset 資產、liability 負債、foreign 外幣（total 為 null）；沒有帳戶的區不回傳
 */
export function accountSections(accounts, types, baseCurrency = 'TWD') {
  const sectionOf = (a) => (a.currency !== baseCurrency ? 'foreign' : a.type === 'credit_card' ? 'liability' : 'asset')
  const build = (key, label) => {
    const list = accounts.filter((a) => sectionOf(a) === key)
    const groups = types
      .map((t) => ({ key: t.key, label: t.label, accounts: list.filter((a) => a.type === t.key).sort(byOrder) }))
      .filter((g) => g.accounts.length)
    const total = key === 'foreign' ? null : list.reduce((sum, a) => sum + Number(a.balance ?? 0), 0)
    return { key, label, total, groups }
  }
  const sections = [build('asset', '資產'), build('liability', '負債'), build('foreign', '外幣')].filter((s) => s.groups.length)
  const netWorth = sections.reduce((sum, s) => sum + (s.total ?? 0), 0)
  return { netWorth, sections }
}
