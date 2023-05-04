// 一些放在全局的白名单
const variableWhiteList = []

// 全局变量，记录沙箱激活的数量
let activeSandboxCount = 0;
/**
 * 基于 Proxy 实现的沙箱
 */
class ProxySandbox {
  updatedValueSet = new Set(); // window 值变更记录
  name; // 沙箱名称
  proxy; // 代理 window 的沙箱
  sandboxRunning = true;

  constructor(name) {
    this.name = name
    // 通过createFakeWindow创建一个fakeWindow对象
    const fakeWindow = {};
    // 判断沙箱或全局是否存在这个属性
    const hasOwnProperty = (key) => fakeWindow.hasOwnProperty(key) || rawWindow.hasOwnProperty(key);
    const proxy = new Proxy(window, {
      set(target, k, value) {
        // 只有在沙箱激活的状态下才能设置值
        // 只有沙箱激活的状态下才能设置值
        if (this.sandboxRunning) {
          // 判断 window 上有该属性，并获取到属性的 writable, configurable, enumerable等值，target 上第一次设置值
          if (!target.hasOwnProperty(k) && window.hasOwnProperty(k)) {
            const { writable, configurable, enumerable } = Object.getOwnPropertyDescriptor(window, p);
            if (writable) {
              // 通过 defineProperty 把值复制到代理对象上，
              Object.defineProperty(target, k, {
                configurable,
                enumerable,
                writable,
                value,
              });
            }
          } else {
            // window 上没有属性，支持设置值
            target[p] = value;
          }
          // 存放一些变量的白名单，那么也需要复制一份到 window
          if (variableWhiteList.indexOf(p) !== -1) {
            window[p] = value;
          }
          // 记录变更记录
          updatedValueSet.add(k);
        }
        // 在 strict-mode 下，Proxy 的 handler.set 返回 false 会抛出 TypeError，在沙箱卸载的情况下应该忽略错误
        return true;
      },
      get(target, k) {
        // 判断用 window.top, window.parent等也返回代理对象，在ifream环境也会返回代理对象。做到了真正的隔离，
        if (k === 'window' || p === 'self') {
          return proxy;
        }
        if (k === 'globalThis') {
          return proxy;
        }
        if (
          k === 'top' ||
          k === 'parent'
        ) {
          if (window === window.parent) {
            return proxy;
          }
          return window[k];
        }

        // 返回当前值
        const value = target[p] || Window[p]
        return value;
      },
    })
    this.proxy = proxy
  }
  /**
   * 激活沙箱
   */
  active() {
    // 沙箱激活记，记录激活数量
    if (sandboxRunning) activeSandboxCount++
    this.sandboxRunning = true;
  }
  /**
   * 失活沙箱
   */
  inactive() {
    if (--activeSandboxCount === 0) {
      // 在白名单的属性要从window上删除
      variableWhiteList.forEach((p) => {
        if (this.proxy.hasOwnProperty(p)) {
          delete window[p];
        }
      });
    }
    this.sandboxRunning = false;
  }
}
