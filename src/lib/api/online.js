// 連線狀態（需求 3.9）：離線時新增交易先存在這台裝置、連線後同步；已同步的交易離線時不能編輯（顯示「目前離線，無法儲存」）。
// 用法：import { isOnline } from '@/lib/api/online.js'，在模板裡 :disabled="!isOnline"
import { ref } from 'vue'

export const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine !== false)

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (isOnline.value = true))
  window.addEventListener('offline', () => (isOnline.value = false))
}

export const OFFLINE_MESSAGE = '目前離線，無法儲存'
export const OFFLINE_QUEUE_MESSAGE = '目前離線，儲存後會在連線時同步'
export const SAVE_FAILED_MESSAGE = '儲存失敗，請重試'
