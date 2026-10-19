import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// GitHub Pages 網址為子路徑：帳號.github.io/<repo 名稱>/
// 在 GitHub Actions 中自動用 repo 名稱；本機開發為根路徑
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = process.env.VITE_BASE ?? (repo ? `/${repo}/` : '/')

export default defineConfig({
  base,
  plugins: [vue()],
})
