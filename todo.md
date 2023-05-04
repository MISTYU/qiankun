## ts
`implements`

## sandbox
qiankun 有 3 中沙箱模式
sandbox/

## vite 是如何插入 css 的
原生的 import 加载 js css 因此 qiankun 无法劫持 css, js 无法做沙箱处理

## qiankun 是如何给 css scoped 的？
1. 通过重写 head.append head.insert body.append 方法来拦截动态 style link
2. 