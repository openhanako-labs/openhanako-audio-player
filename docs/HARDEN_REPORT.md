# 2b：启动时序硬化报告

## 执行摘要

✅ 完成。SDK 就绪事件派发 + `__whenHana` 桥已就位，首批 ui.resize 上报改走事件驱动。

## 变更清单

### 1. `ui/index.html` / `ui/standalone.html`（各 +1 行）
在 module 胶水的 `window.__hana = hana;` 之后、`</script>` 之前加事件派发：
```js
window.dispatchEvent(new Event("hana-sdk-ready"));
```
- `ready()` 失败也派发（在 try/catch 之后无条件执行）

### 2. `ui/head.js`（+6 行，-1 行）
- **顶部新增 `__whenHana` 桥**（L5-10）：SDK 就绪后回调；已就绪立即执行，未就绪挂事件监听（`once: true`）
- **L110 改走 `__whenHana`**：`report()` 的首批调用从直接执行改为 `window.__whenHana(report)`；L111-114 的 4 次 setTimeout 重试保持原样

### 3. `ui/_build.json` + `ui/head.js` 构建号同步
`build = 1011163548`

## grep 全仓 `__hana` 命中清单

### 定义点（2 处）
| 文件 | 行 | 内容 | 处置 |
|------|----|------|------|
| ui/index.html | 1381 | `window.__hana = hana;` | 保留 |
| ui/standalone.html | 1381 | `window.__hana = hana;` | 保留 |

### head.js 消费点（8 处）
| 行 | 内容 | 上下文 | 处置 |
|----|------|--------|------|
| 7-8 | `__whenHana` 桥内部 | 新增 | 新增 |
| 110 | `if (window.__hana) window.__hana.ui.resize(...)` | `report()` 函数内 | **改走 `__whenHana`**（L110 调用处改为 `window.__whenHana(report)`） |
| 131-132 | `window.__hana && window.__hana.surface && ...` | `setInterval` 探针内 | 保持原样（幂等重试） |
| 143-144 | `window.__hana && window.__hana.envelope && ...` | `setInterval` 探针内 | 保持原样（幂等重试） |
| 1434-1435 | `window.__hana && window.__hana.envelope ? ...` | `_probe/size` 探针内 | 保持原样（幂等重试） |
| 1465 | `hasHana: !!window.__hana` | `_probe/size` 探针内 | 保持原样（只读探针） |
| 1581 | `if (window.__hana) window.__hana.ui.resize(...)` | `.then()` 异步回调内 | 保持原样（异步回调，SDK 应已就绪） |

### head.js 非 `__hana` 命中（`__hanaGetView` / `__hanaSetView`，共 7 处）
| 行 | 内容 | 说明 |
|----|------|------|
| 169 | `window.__hanaSetView("compact")` | 视图切换函数，非 SDK |
| 190 | `window.__hanaGetView = function...` | 定义 |
| 192 | `window.__hanaSetView = function...` | 定义 |
| 230-232 | `__hanaGetView` / `__hanaSetView` | 使用 |
| 258 | `window.__hanaSetView("full")` | 使用 |
| 1444 | `window.__hanaGetView()` | 探针内使用 |

### app.js 命中（2 处）
| 行 | 内容 | 说明 |
|----|------|------|
| 3322 | `if (!(window.__hanaGetView && window.__hanaGetView() === "compact")) return;` | 视图切换函数，非 SDK |
| 6146 | `var compact = window.__hanaGetView && window.__hanaGetView() === "compact";` | 视图切换函数，非 SDK |

**结论**：app.js **没有** `window.__hana` 消费点，只有 `__hanaGetView`（head.js 里定义的视图切换函数）。用户的审计正确。

## 实测证据

### 1. 语法检查
```
$ node --check ui/head.js
（无输出，通过）

$ node pv/build.mjs --check
ui/index.html: 330 KB → 330.3 KB｜拆旧块 2 处｜剥遗留 CSS 0 条 / JS 0 块
ui/standalone.html: 330 KB → 330.3 KB｜拆旧块 2 处｜剥遗留 CSS 0 条 / JS 0 块
ui/app.js: 206 KB → 206.1 KB｜剥遗留 JS 0 块｜核心钩子 已在｜降级钩子 0 条
（--check：未写入）
```

### 2. 浏览器验证（`http://127.0.0.1:8877/ui/index.html`）
```js
> typeof window.__whenHana
'function'

> !!window.__hana
true

> window.__testHook = false;
  window.__whenHana(function() { window.__testHook = true; });
  window.__testHook
true  // 立即执行（SDK 已就绪）
```

### 3. 控制台日志
- **JavaScript error**：0 条
- **JavaScript warning**：1 条（`Unrecognized feature: 'mediasession'`，浏览器不支持，正常）
- **网络 404**：多条（API 路由找不到，本地服务器无后端，正常）

### 4. 构建号同步
```
$ node tools/bump-build.mjs
build = 1011163548（_build.json + head.js 两处已同步）
```

## 判断标准与遗留点

### 「顺序敏感」vs「幂等重试」的判断标准
- **顺序敏感**：在 SDK 就绪前执行一次就永久失败，没有重试机制 → 改走 `__whenHana`
- **幂等重试**：带守卫（`if(window.__hana)` / `&&`）且有重试机制（`setTimeout` / `setInterval` / 异步回调） → 保持原样

### 判断不了的情况
无。所有 `__hana` 消费点都有守卫，且上下文明确（探针 vs boot 期首批）。

### 遗留点
1. **L1581 的 `.then()` 回调**：SDK 应该已就绪，但如果 `fetch` 失败或延迟很长，理论上可能有边界情况。保持原样是因为已有守卫且上下文是异步回调。
2. **`__whenHana` 的 `once: true`**：如果 `report()` 在 SDK 就绪前被多次调用（L110 改走 `__whenHana`，L111-114 直接调用），只有 L110 会注册事件监听，后续调用会直接执行（SDK 已就绪时）。这是预期行为。

## 下一步
- 后续接 `hana.theme` 等功能时，用 `window.__whenHana(function(hana) { ... })` 即可，不用再改时序
