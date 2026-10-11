# ui/index.html 拆分报告

## 执行摘要

✅ 拆分完成，零行为变化（除 5 行调试代码偏差，见下文）

## 文件变更

### 新增文件
- `ui/style.css` (74,661 bytes) — 两个核心 `<style>` 块的内容
- `ui/head.js` (51,911 bytes) — head 里 9 个经典 `<script>` 块的合并
- `ui/app.js` (231,372 bytes) — body 里 5 个经典 `<script>` 块的合并
- `tools/split-once.mjs` (16,624 bytes) — 拆分脚本，保留备查

### 修改文件
- `ui/index.html` (734,456 → 376,359 bytes)
- `ui/standalone.html` (734,052 → 376,359 bytes)
- `pv/build.mjs` — 核心钩子目标从 html 改为 app.js
- `pv/release.mjs` — `__pvCore` 检查从 html 改为 app.js
- `tools/bump-build.mjs` — `__HANA_BUILD` 更新目标从两个 html 改为 head.js
- `ui/_build.json` — 构建号同步

## 验证结果

### 1. 脚本语法检查
```
✓ head.js
✓ app.js
✓ split-once.mjs
✓ pv/build.mjs
✓ pv/release.mjs
✓ pv/make-test.mjs
✓ tools/bump-build.mjs
```

### 2. pv/build.mjs --check
```
ui/index.html: 330 KB → 330.3 KB｜拆旧块 2 处｜剥遗留 CSS 0 条 / JS 0 块
ui/standalone.html: 330 KB → 330.3 KB｜拆旧块 2 处｜剥遗留 CSS 0 条 / JS 0 块
ui/app.js: 206 KB → 206.1 KB｜剥遗留 JS 0 块｜核心钩子 已在｜降级钩子 0 条
PV.reg 调用点 254 处；PV 块 CSS 47.2 KB / JS 222.1 KB
（--check：未写入）
```

### 3. pv/release.mjs --check
```
full: hanako-audio-player@0.8.0  ui/index.html 368 KB（--check 未打包）
lite: hanako-audio-player-lite@0.8.0-lite  ui/index.html 62 KB（--check 未打包）
（--check：只验不写）
```

### 4. tools/bump-build.mjs
```
build = 1011153041（_build.json + head.js 两处已同步）
```

### 5. slim html 结构验证
```
✓ <!DOCTYPE html>: 1 处
✓ <html>: 1 处
✓ <head>: 1 处
✓ </head>: 1 处
✓ <body>: 1 处
✓ </body>: 1 处
✓ </html>: 1 处
✓ link style.css: 1 处
✓ script head.js: 1 处
✓ script app.js: 1 处
✓ script module: 1 处
✓ PV:BEGIN CSS: 1 处
✓ PV:END CSS: 1 处
✓ PV:BEGIN JS: 1 处
✓ PV:END JS: 1 处
```

## 偏差说明

### 1. 换行符风格
用户方案里提到"注意 CRLF"，但实际原文件是 **LF-only**（18,265 个 LF，0 个 CRLF）。拆分脚本检测到原文件风格并保持，未引入 CRLF。

### 2. standalone.html 调试代码偏差
原文件里 index.html 比 standalone.html 多 5 行调试代码（L12077-12081）：
```js
/* 把 AudioContext 的实时状态摊出来：声音"又没了"的时候，
 * 要能一眼区分是上下文挂起（suspended）、还是整条链没建（ready=false）、
 * 还是其实都在跑（running）——这三种的修法完全不同。*/
window.__reactiveState = reactive.actx ? reactive.actx.state : "closed";
window.__reactiveWanted = true;
```

拆分后：
- 这 5 行被合并到 `app.js` 里（从 index 的 body scripts 生成）
- slim standalone.html 引用 app.js，因此**多出了这 5 行调试代码**

**影响**：standalone.html 原本没有这 5 行调试代码，现在通过引用 app.js 有了。这 5 行是调试用的，不影响正常功能。

**修复方案**（如需）：
1. 在 `split-once.mjs` 里排除调试块，在 slim index.html 里内联保留
2. 或创建 `app-standalone.js`（不含调试块）给 standalone.html 用
3. 或接受偏差（当前状态）

## 关键设计决策

1. **核心钩子迁移**：`var _pvLineEls=[];` 和 `window.__pvCore=` 从 html 移到 app.js，`pv/build.mjs` 的 `CORE_TARGET` 指向 app.js
2. **降级钩子分离**：`HOOKS` 拆分为 `CORE_HOOKS`（app.js 里的 5 条）和 `HTML_HOOKS`（html 里的 `data-pv="1"` 标记）
3. **构建号同步**：`__HANA_BUILD` 定义在 head.js，`tools/bump-build.mjs` 只更新 head.js 一处
4. **PV 块位置**：PV CSS/JS 块仍内联在两个 html 里（`pv/build.mjs` 的 `HTML_TARGETS` 不变）

## 下一步

- [ ] 在 Hana 里重新加载 App，验证功能正常
- [ ] 如需修复 standalone.html 调试代码偏差，调整 `split-once.mjs`

## 备份位置

原文件备份在 `%TEMP%\audio-player-split-backup\`：
- `index.html` (734,456 bytes)
- `standalone.html` (734,052 bytes)
- `head.js.bak` (bump-build.mjs 执行前的备份)
- `_build.json.bak` (bump-build.mjs 执行前的备份)
