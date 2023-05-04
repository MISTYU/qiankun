function iter(obj, callback) {
  const keys = Reflect.ownKeys(obj)
  keys.forEach(k => {
    callback(k)
  })
}

/**
 * 基于 diff 方式实现的沙箱，用于不支持 Proxy 的低版本浏览器
 */
class SnapshotSandbox {
  name; // 沙箱名称
  sandboxRunning; // 此沙箱是否正在运行
  windowSnapshot; // 当前快照
  modifyPropsMap = {};

  constructor(name) {
    this.name = name;
  }
  /**
   * 激活沙箱
   */
  active() {
    // 记录当前快照
    this.windowSnapshot = {};
    // 把当前 window 对象保存一份到 windowSnapshot
    iter(window, (prop) => {
      this.windowSnapshot[prop] = window[prop];
    });
    // 恢复之前的变更
    const keys = Reflect.ownKeys(this.modifyPropsMap)
    keys.forEach((k) => {
      window[k] = this.modifyPropsMap[k];
    });
    this.sandboxRunning = true
  }
  /**
   * 失活沙箱
   */
  inactive() {
    this.windowSnapshot = {};
    // 恢复初始环境，记录变更
    iter(window, (prop) => {
      if (window[prop] !== this.windowSnapshot[prop]) {
        // 记录变更，恢复环境
        this.modifyPropsMap[prop] = window[prop];
        window[prop] = this.windowSnapshot[prop];
      }
    });
    this.sandboxRunning = false
  }
}
