import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'node22',
    outDir: 'dist-terminal',
    emptyOutDir: true,
    rollupOptions: {
      external: [/^node:/, 'sharp'],
      input: {
        main: fileURLToPath(new URL('./src/main.ts', import.meta.url)),
        manualFakeTui: fileURLToPath(new URL('./scripts/manual-fake-tui.ts', import.meta.url)),
        editorBridgeMain: fileURLToPath(new URL('./src/editorBridgeMain.ts', import.meta.url)),
        editorSetupMain: fileURLToPath(new URL('./src/editorSetupMain.ts', import.meta.url)),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'es',
      },
    },
  },
})
