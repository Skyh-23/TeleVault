import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tauri-apps/api/core': path.resolve(__dirname, 'src/lib/tauri-invoke.ts'),
      '@tauri-apps/plugin-store': path.resolve(__dirname, 'src/lib/tauri-store.ts'),
      '@tauri-apps/plugin-shell': path.resolve(__dirname, 'src/lib/tauri-extras.ts'),
      '@tauri-apps/plugin-dialog': path.resolve(__dirname, 'src/lib/tauri-extras.ts'),
      '@tauri-apps/api/event': path.resolve(__dirname, 'src/lib/tauri-extras.ts'),
      '@tauri-apps/plugin-updater': path.resolve(__dirname, 'src/lib/tauri-extras.ts'),
      '@tauri-apps/plugin-process': path.resolve(__dirname, 'src/lib/tauri-extras.ts'),
    }
  },
  server: {
    port: 3000
  }
})