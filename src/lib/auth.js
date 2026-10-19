import { ref } from 'vue'
import { supabase } from './supabase'

export const session = ref(null)
export const authReady = ref(false)

export async function initAuth() {
  if (!supabase) {
    authReady.value = true
    return
  }
  const { data } = await supabase.auth.getSession()
  session.value = data.session
  authReady.value = true
  supabase.auth.onAuthStateChange((_event, s) => {
    session.value = s
  })
}

export function signInWithGoogle() {
  // 登入後回到網站根目錄（含 GitHub Pages 子路徑）
  const redirectTo = window.location.origin + import.meta.env.BASE_URL
  return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
}

export function signOut() {
  return supabase.auth.signOut()
}
