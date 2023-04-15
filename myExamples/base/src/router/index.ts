import { createRouter, createWebHistory } from 'vue-router'
import Index from '@/views/Index.vue'
import MicroApp from '@/views/MicroApp.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Index',
      component: Index,
      children: [
        {
          path: 'vue-vite',
          name: 'vueVite',
          component: MicroApp,
        },
        {
          path: 'vue-webpack',
          name: 'vueWebpack',
          component: MicroApp,
        }
      ]
    },
  ]
})

export default router