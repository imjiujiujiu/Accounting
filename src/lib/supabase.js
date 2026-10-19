import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)

// 只能使用 anon key；service_role key 絕對不可放進前端
export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        // PKCE：登入回來的參數放在 ?code=，不會和 hash 路由（#/...）衝突
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null
