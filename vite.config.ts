import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Library build: ESM bundle + extracted CSS. Type declarations are emitted by vue-tsc (see tsconfig.build.json).
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/lib.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'vue-command-palette',
      cssFileName: 'style',
    },
    rollupOptions: {
      external: ['vue'],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts'],
    restoreMocks: true,
  },
})
