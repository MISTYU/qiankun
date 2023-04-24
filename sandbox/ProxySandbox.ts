type FakeWindow = Window & Record<PropertyKey, any>;

const rawObjectDefineProperty = Object.defineProperty;
const mockTop = 'mockTop';
const mockSafariTop = 'mockSafariTop';
const mockGlobalThis = 'mockGlobalThis';
const frozenPropertyCacheMap = new WeakMap<any, Record<PropertyKey, boolean>>();
// 在浏览器中就是 window
export const nativeGlobal = new Function('return this')();
export function isPropertyFrozen(target: any, p?: PropertyKey): boolean {
  if (!target || !p) {
    return false;
  }

  const targetPropertiesFromCache = frozenPropertyCacheMap.get(target) || {};

  if (targetPropertiesFromCache[p]) {
    return targetPropertiesFromCache[p];
  }

  const propertyDescriptor = Object.getOwnPropertyDescriptor(target, p);
  const frozen = Boolean(
    propertyDescriptor &&
      propertyDescriptor.configurable === false &&
      (propertyDescriptor.writable === false || (propertyDescriptor.get && !propertyDescriptor.set)),
  );

  targetPropertiesFromCache[p] = frozen;
  frozenPropertyCacheMap.set(target, targetPropertiesFromCache);

  return frozen;
}

const variableWhiteListInDev =
  process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' || window.__QIANKUN_DEVELOPMENT__
    ? [
        // for react hot reload
        // see https://github.com/facebook/create-react-app/blob/66bf7dfc43350249e2f09d138a20840dae8a0a4a/packages/react-error-overlay/src/index.js#L180
        '__REACT_ERROR_OVERLAY_GLOBAL_HOOK__',
      ]
    : [];
const globalVariableWhiteList: string[] = [
  // FIXME System.js used a indirect call with eval, which would make it scope escape to global
  // To make System.js works well, we write it back to global window temporary
  // see https://github.com/systemjs/systemjs/blob/457f5b7e8af6bd120a279540477552a07d5de086/src/evaluate.js#L106
  'System',

  // see https://github.com/systemjs/systemjs/blob/457f5b7e8af6bd120a279540477552a07d5de086/src/instantiate.js#L357
  '__cjsWrapper',
  ...variableWhiteListInDev,
];

const useNativeWindowForBindingsProps = new Map<PropertyKey, boolean>([
  ['fetch', true],
  ['mockDomAPIInBlackList', process.env.NODE_ENV === 'test'],
]);

function createFakeWindow(globalContext: Window) {
  // map always has the fastest performance in has check scenario
  // see https://jsperf.com/array-indexof-vs-set-has/23
  const fakeWindow = {} as FakeWindow;

  /*
   copy the non-configurable property of global to fakeWindow
   see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/handler/getOwnPropertyDescriptor
   > A property cannot be reported as non-configurable, if it does not exist as an own property of the target object or if it exists as a configurable own property of the target object.
   */
  Object.getOwnPropertyNames(globalContext)
    // 过滤出不可配置的属性
    .filter((p) => {
      const descriptor = Object.getOwnPropertyDescriptor(globalContext, p);
      return !descriptor?.configurable;
    })
    .forEach((p) => {
      const descriptor = Object.getOwnPropertyDescriptor(globalContext, p);
      if (descriptor) {
        // 在 fakeWindow 添加属性
        Object.defineProperty(fakeWindow, p, Object.freeze(descriptor) /* 一个被冻结的对象再也不能被修改, 此外，冻结一个对象后该对象的原型也不能被修改 */);
      }
    });

  return fakeWindow
}

export class PrxoySandbox {
  private updatedValueSet = new Set<PropertyKey>()
  private document = document
  proxy: WindowProxy | undefined
  globalContext: typeof window
  sandboxRunning = true
  name: string;
  // the descriptor of global variables in whitelist before it been modified
  globalWhitelistPrevDescriptor: { [p in (typeof globalVariableWhiteList)[number]]: PropertyDescriptor | undefined } = {};
  
  constructor(name: string, globalContext = window) {
    this.name = name;
    this.globalContext = globalContext;
    const { updatedValueSet } = this;

    const fakeWindow = createFakeWindow(globalContext);
    // 创建一个 proxy 代理 fakeWindow
    const proxy = new Proxy(fakeWindow, {
      set: (target: FakeWindow, p: PropertyKey, value: any): boolean => {
        if (this.sandboxRunning) {
          // We must keep its description while the property existed in globalContext before
          // 如果不在 target, 在 window 上，需要再次设置下
          if (!target.hasOwnProperty(p) && globalContext.hasOwnProperty(p)) {
            const descriptor = Object.getOwnPropertyDescriptor(globalContext, p);
            const { writable, configurable, enumerable, set } = descriptor!;
            // only writable property can be overwritten
            // here we ignored accessor descriptor of globalContext as it makes no sense to trigger its logic(which might make sandbox escaping instead)
            // we force to set value by data descriptor
            if (writable || set) {
              Object.defineProperty(target, p, { configurable, enumerable, writable: true, value });
            }
          } else {
            target[p] = value;
          }

          // 白名单下的属性不放在沙箱里
          if (typeof p === 'string' && globalVariableWhiteList.indexOf(p) !== -1) {
            // @ts-ignore
            globalContext[p] = value;
          }
          // 记录变更的属性
          updatedValueSet.add(p);

          return true;
        }

        if (process.env.NODE_ENV === 'development') {
          console.warn(`[qiankun] Set window.${p.toString()} while sandbox destroyed or inactive in ${name}!`);
        }

        // 在 strict-mode 下，Proxy 的 handler.set 返回 false 会抛出 TypeError，在沙箱卸载的情况下应该忽略错误
        return true;
      },

      get: (target: FakeWindow, p: PropertyKey): any => {
        // avoid who using window.window or window.self to escape the sandbox environment to touch the real window
        // see https://github.com/eligrey/FileSaver.js/blob/master/src/FileSaver.js#L13
        if (p === 'window' || p === 'self') {
          return proxy;
        }

        // hijack globalWindow accessing with globalThis keyword
        if (p === 'globalThis' || mockGlobalThis) {
          return proxy;
        }

        if (p === 'top' || p === 'parent' || ((p === mockTop || p === mockSafariTop))) {
          // if your master app in an iframe context, allow these props escape the sandbox
          if (globalContext === globalContext.parent) {
            return proxy;
          }
          return (globalContext as any)[p];
        }

        if (p === 'document') {
          return this.document;
        }

        if (p === 'eval') {
          return eval;
        }
      },

      // makes sure `window instanceof Window` returns truthy in micro app
      getPrototypeOf() {
        return Reflect.getPrototypeOf(globalContext);
      },
    });

    this.proxy = proxy;
  }
  // 激活状态
  active() {
    this.sandboxRunning = true;
  }
  // 失活状态
  inactive() {
    Object.keys(this.globalWhitelistPrevDescriptor).forEach((p) => {
      const descriptor = this.globalWhitelistPrevDescriptor[p];

      if (descriptor) {
        Object.defineProperty(this.globalContext, p, descriptor);
      } else {
        // @ts-ignore
        delete this.globalContext[p];
      }
    });
    this.sandboxRunning = false;
  }
}