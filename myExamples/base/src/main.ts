import { createApp } from 'vue'
import './style.css'
import router from './router'
import App from './App.vue'
import { registerMicroApps, start } from '../../../src'

registerMicroApps([
  {
    name: 'vue3Vite', // app name registered
    entry: 'http://127.0.0.1:8081',
    container: '#microApp',
    activeRule: '/vue3-vite',
    // render: (...params) => {
    //   // console.log(params, 'params')
    //   const e = document.createElement('div')
    //   e.setAttribute('id', 'microApp')
    //   return e
    // }
  },
  // {
  //   name: 'vue2Webpack',
  //   entry: 'http://127.0.0.1:80812',
  //   container: '#microApp',
  //   activeRule: '/vue2-webpack',
  // },
]);

start({
  sandbox: {
    strictStyleIsolation: true
  }
})

createApp(App)
  .use(router)
  .mount('#app')

  
