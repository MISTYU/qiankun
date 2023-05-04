import path from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import qiankun from 'vite-plugin-qiankun'

// https://vitejs.dev/config/
export default defineConfig({
  base: 'http://127.0.0.1:8081',
  server: {
    port: 8081,
    cors: true,
  },
  plugins: [
    vue(),
    qiankun('vue3-vite', {
      useDevMode: true,
    }
)
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', 'vue'],
  }
})
