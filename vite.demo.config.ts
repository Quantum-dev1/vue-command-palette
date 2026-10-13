import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Demo app: dev server and static build (deployable to GitHub Pages).
export default defineConfig({
  root: fileURLToPath(new URL('./demo', import.meta.url)),
  base: './',
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL('./demo-dist', import.meta.url)),
    emptyOutDir: true,
  },
})
