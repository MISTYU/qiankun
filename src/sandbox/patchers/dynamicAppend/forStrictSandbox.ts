/**
 * @author Kuitos
 * @since 2020-10-13
 */

import type { Freer, SandBox } from '../../../interfaces';
import { isBoundedFunction, nativeDocument, nativeGlobal, isCallable } from '../../../utils';
import { getCurrentRunningApp } from '../../common';
import type { ContainerConfig } from './common';
import {
  calcAppCount,
  getAppWrapperHeadElement,
  isAllAppsUnmounted,
  isHijackingTag,
  patchHTMLDynamicAppendPrototypeFunctions,
  rebuildCSSRules,
  recordStyledComponentsCSSRules,
  styleElementTargetSymbol,
} from './common';

const elementAttachedSymbol = Symbol('attachedApp');
declare global {
  interface HTMLElement {
    [elementAttachedSymbol]: string;
  }
}

// Get native global window with a sandbox disgusted way, thus we could share it between qiankun instances🤪
Object.defineProperty(nativeGlobal, '__proxyAttachContainerConfigMap__', { enumerable: false, writable: true });

Object.defineProperty(nativeGlobal, '__currentLockingSandbox__', {
  enumerable: false,
  writable: true,
  configurable: true,
});

const rawHeadAppendChild = HTMLHeadElement.prototype.appendChild;

// Share proxyAttachContainerConfigMap between multiple qiankun instance, thus they could access the same record
nativeGlobal.__proxyAttachContainerConfigMap__ =
  nativeGlobal.__proxyAttachContainerConfigMap__ || new WeakMap<WindowProxy, ContainerConfig>();
const proxyAttachContainerConfigMap: WeakMap<WindowProxy, ContainerConfig> =
  nativeGlobal.__proxyAttachContainerConfigMap__;

const elementAttachContainerConfigMap = new WeakMap<HTMLElement, ContainerConfig>();
const docCreatePatchedMap = new WeakMap<typeof document.createElement, typeof document.createElement>();
const mutationObserverPatchedMap = new WeakMap<
  typeof MutationObserver.prototype.observe,
  typeof MutationObserver.prototype.observe
>();
const parentNodePatchedMap = new WeakMap<PropertyDescriptor, PropertyDescriptor>();

function patchDocument(cfg: { sandbox: SandBox; speedy: boolean }) {
  const { sandbox, speedy } = cfg;
  /**
   * 给 createElement 设置一些 config
   * @param element
   * @param proxy 
   */
  const attachElementToProxy = (element: HTMLElement, proxy: Window) => {
    const proxyContainerConfig = proxyAttachContainerConfigMap.get(proxy);
    if (proxyContainerConfig) {
      elementAttachContainerConfigMap.set(element, proxyContainerConfig);
    }
  };
  if (speedy) {
    // 代理 document 主要是重写 createElement 方法
    const proxyDocument = new Proxy(document, {
      set: (target, p, value) => {
        (<any>target)[p] = value;
        return true;
      },
      get: (target, p, receiver) => {
        if (p === 'createElement') {
          // Must store the original createElement function to avoid error in nested sandbox
          const targetCreateElement = target.createElement;
          // 重写 createElement
          return function createElement(...args: Parameters<typeof document.createElement>) {
            if (!nativeGlobal.__currentLockingSandbox__) {
              nativeGlobal.__currentLockingSandbox__ = sandbox.name;
            }

            const element = targetCreateElement.call(target, ...args);

            // only record the element which is created by the current sandbox, thus we can avoid the element created by nested sandboxes
            if (nativeGlobal.__currentLockingSandbox__ === sandbox.name) {
              attachElementToProxy(element, sandbox.proxy);
              delete nativeGlobal.__currentLockingSandbox__;
            }

            return element;
          };
        }

        const value = (<any>target)[p];
        // must rebind the function to the target otherwise it will cause illegal invocation error
        if (isCallable(value) && !isBoundedFunction(value)) {
          return function proxyFunction(...args: unknown[]) {
            return value.call(target, ...args.map((arg) => (arg === receiver ? target : arg)));
          };
        }

        return value;
      },
    });
    // 把之前 sandbox 代理的 document 改成 proxyDocument
    sandbox.patchDocument(proxyDocument);

    // patch MutationObserver.prototype.observe to avoid type error
    // https://github.com/umijs/qiankun/issues/2406
    const nativeMutationObserverObserveFn = MutationObserver.prototype.observe;
    if (!mutationObserverPatchedMap.has(nativeMutationObserverObserveFn)) {
      const observe = function observe(this: MutationObserver, target: Node, options: MutationObserverInit) {
        const realTarget = target instanceof Document ? nativeDocument : target;
        return nativeMutationObserverObserveFn.call(this, realTarget, options);
      };

      MutationObserver.prototype.observe = observe;
      mutationObserverPatchedMap.set(nativeMutationObserverObserveFn, observe);
    }

    // patch parentNode getter to avoid document === html.parentNode
    // https://github.com/umijs/qiankun/issues/2408#issuecomment-1446229105
    const parentNodeDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'parentNode');
    if (parentNodeDescriptor && !parentNodePatchedMap.has(parentNodeDescriptor)) {
      const { get: parentNodeGetter, configurable } = parentNodeDescriptor;
      if (parentNodeGetter && configurable) {
        const patchedParentNodeDescriptor = {
          ...parentNodeDescriptor,
          get(this: Node) {
            const parentNode = parentNodeGetter.call(this);
            if (parentNode instanceof Document) {
              const proxy = getCurrentRunningApp()?.window;
              if (proxy) {
                return proxy.document;
              }
            }

            return parentNode;
          },
        };
        Object.defineProperty(Node.prototype, 'parentNode', patchedParentNodeDescriptor);

        parentNodePatchedMap.set(parentNodeDescriptor, patchedParentNodeDescriptor);
      }
    }

    return () => {
      MutationObserver.prototype.observe = nativeMutationObserverObserveFn;
      mutationObserverPatchedMap.delete(nativeMutationObserverObserveFn);

      if (parentNodeDescriptor) {
        Object.defineProperty(Node.prototype, 'parentNode', parentNodeDescriptor);
        parentNodePatchedMap.delete(parentNodeDescriptor);
      }
    };
  }

  const docCreateElementFnBeforeOverwrite = docCreatePatchedMap.get(document.createElement);
  if (!docCreateElementFnBeforeOverwrite) {
    const rawDocumentCreateElement = document.createElement;
    Document.prototype.createElement = function createElement<K extends keyof HTMLElementTagNameMap>(
      this: Document,
      tagName: K,
      options?: ElementCreationOptions,
    ): HTMLElement {
      const element = rawDocumentCreateElement.call(this, tagName, options);
      if (isHijackingTag(tagName)) {
        const { window: currentRunningSandboxProxy } = getCurrentRunningApp() || {};
        if (currentRunningSandboxProxy) {
          attachElementToProxy(element, currentRunningSandboxProxy);
        }
      }

      return element;
    };

    // It means it have been overwritten while createElement is an own property of document
    if (document.hasOwnProperty('createElement')) {
      document.createElement = Document.prototype.createElement;
    }

    docCreatePatchedMap.set(Document.prototype.createElement, rawDocumentCreateElement);
  }

  return function unpatch() {
    if (docCreateElementFnBeforeOverwrite) {
      Document.prototype.createElement = docCreateElementFnBeforeOverwrite;
      document.createElement = docCreateElementFnBeforeOverwrite;
    }
  };
}

export function patchStrictSandbox(
  appName: string,
  appWrapperGetter: () => HTMLElement | ShadowRoot,
  sandbox: SandBox,
  mounting = true,
  scopedCSS = false,
  excludeAssetFilter?: CallableFunction,
  speedySandbox = false,
): Freer {
  const { proxy } = sandbox;
  let containerConfig = proxyAttachContainerConfigMap.get(proxy);
  if (!containerConfig) {
    containerConfig = {
      appName,
      proxy,
      appWrapperGetter,
      dynamicStyleSheetElements: [],
      strictGlobal: true,
      speedySandbox,
      excludeAssetFilter,
      scopedCSS,
    };
    proxyAttachContainerConfigMap.set(proxy, containerConfig);
  }
  // all dynamic style sheets are stored in proxy container
  const { dynamicStyleSheetElements } = containerConfig;
  const unpatchDocument = patchDocument({ sandbox, speedy: speedySandbox });

  const unpatchDynamicAppendPrototypeFunctions = patchHTMLDynamicAppendPrototypeFunctions(
    (element) => elementAttachContainerConfigMap.has(element),
    (element) => elementAttachContainerConfigMap.get(element)!,
  );

  if (!mounting) calcAppCount(appName, 'increase', 'bootstrapping');
  if (mounting) calcAppCount(appName, 'increase', 'mounting');

  return function free() {
    if (!mounting) calcAppCount(appName, 'decrease', 'bootstrapping');
    if (mounting) calcAppCount(appName, 'decrease', 'mounting');

    // release the overwritten prototype after all the micro apps unmounted
    if (isAllAppsUnmounted()) {
      unpatchDynamicAppendPrototypeFunctions();
      unpatchDocument();
    }

    recordStyledComponentsCSSRules(dynamicStyleSheetElements);

    // As now the sub app content all wrapped with a special id container,
    // the dynamic style sheet would be removed automatically while unmoutting

    return function rebuild() {
      rebuildCSSRules(dynamicStyleSheetElements, (stylesheetElement) => {
        const appWrapper = appWrapperGetter();
        if (!appWrapper.contains(stylesheetElement)) {
          const mountDom =
            stylesheetElement[styleElementTargetSymbol] === 'head' ? getAppWrapperHeadElement(appWrapper) : appWrapper;
          rawHeadAppendChild.call(mountDom, stylesheetElement);
          return true;
        }

        return false;
      });
    };
  };
}
