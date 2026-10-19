// 測試用的假 Supabase client：記錄每次呼叫的鏈（from/rpc → select/eq/order/range…），
// 回傳值由 respond(call) 決定。只給測試使用。
export function fakeDb(respond = () => ({ data: null, error: null })) {
  const calls = []
  const make = (start) => {
    const call = { ...start, chain: [] }
    calls.push(call)
    const builder = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === 'then') {
            const p = Promise.resolve().then(() => respond(call))
            return p.then.bind(p)
          }
          return (...args) => {
            call.chain.push([prop, ...args])
            return builder
          }
        },
      },
    )
    return builder
  }
  return {
    calls,
    from: (table) => make({ table }),
    rpc: (fn, args, opts) => make({ rpc: fn, args, opts }),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
  }
}

/** 取出鏈中某個方法的所有參數 */
export const argsOf = (call, method) => call.chain.filter((c) => c[0] === method).map((c) => c.slice(1))
