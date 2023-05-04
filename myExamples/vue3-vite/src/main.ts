import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { renderWithQiankun, qiankunWindow } from 'vite-plugin-qiankun/dist/helper'

const microAppName = 'vue3-vite'

let app = createApp(App)

if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  
  // app
  // .use(router)
  // .use(ElementPlus);
  app.mount('#microApp');
} else {
  renderWithQiankun({
    mount(props) {
      console.log(`[micro app ${microAppName}] mount`);
      app = createApp(App);

      // app.use(store).use(router).use(ElementPlus);
      app.mount(
        (props.container ? props.container.querySelector('#microApp') : '#microApp') as
          | Element
          | string,
      );
    },
    bootstrap() {
      console.log(`[micro app ${microAppName}] bootstrap`);
    },
    update() {
      console.log(`[micro app ${microAppName}] update`);
    },
    unmount() {
      console.log(`[micro app ${microAppName}] unmount`);
      app?.unmount();
    },
  });
}


// createApp(App).mount('#app')
