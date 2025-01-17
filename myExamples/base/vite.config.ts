import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  server: {
    port: 8080,
    cors: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    }

  },
  plugins: [vue()],
})
