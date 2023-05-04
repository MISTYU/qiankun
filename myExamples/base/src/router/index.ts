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
          path: 'vue3-vite',
          name: 'vueVite',
          component: MicroApp,
        },
        {
          path: 'vue2-webpack',
          name: 'vueWebpack',
          component: MicroApp,
        }
      ]
    },
  ]
})

export default router