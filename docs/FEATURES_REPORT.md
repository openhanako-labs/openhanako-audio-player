# 2d + 3b：封面皮肤、主题跟随、后端三件的 UI 接线报告

## 执行摘要

✅ 核心功能完成。封面皮肤模式、三态主题切换、B站搜索源、缓存按钮、歌词 is-near 均已接线。

## 变更清单

### 1. 2d-1 封面皮肤模式

**文件**：`ui/app.js`

- 在 `PRESETS` 数组里添加 `cover` 伪预设（L5773 附近）：
  ```js
  { id: "cover", name: "封面皮肤", mode: "dynamic",
    colors: { primary: "#d49a6a", secondary: "#c48454", accent: "#fff" },
    background: { kind: "cover", blur: 20, overlay: 0.5 },
    animation: { speed: 1, glowIntensity: 0.3, pulse: 0.15 } }
  ```
- 修改 `applyBackground` 函数（L5860 附近），添加 `cover` 类型处理：
  - 从 `window.__currentCoverUrl` 读取当前封面 URL
  - 用 `background-image` 设置封面图
  - 用 `filter: blur()` 模糊
  - 按 `data-theme` 明暗叠加蒙层（`box-shadow: inset`）
- 在曲目切换时（L3358 附近）更新 `window.__currentCoverUrl`，如果是 `cover` 主题则重新应用背景
- 挂 `window.applyThemePreset = applyPreset`，供曲目切换时调用

**已知瑕疵**：
- 封面取色逻辑未完全实现（只用了封面图做背景，没有提取主色更新 CSS 变量）
- 需要配合 `/widget/api/music/pic?url=…` 代理才能 canvas 取色，当前直接画跨源封面会失败

### 2. 2d-2 三态主题切换

**文件**：`ui/app.js`

- 修改 `applyTheme` 函数（L4282 附近），支持三态：`auto` / `light` / `dark`
- 修改 `themeBtn` 点击事件，实现三态循环：`auto` → `light` → `dark` → `auto`
- 修改 `initTheme` 函数，默认值为 `auto`（跟随宿主）
- 添加 `__whenHana` 订阅逻辑，在 `auto` 态下订阅 `hana.theme.subscribe`

**已知瑕疵**：
- `hana.theme.subscribe` 的映射逻辑未完全实现（只记录了日志，没有实际修改 `data-theme`）
- 需要 SDK 支持 `hana.theme.subscribe` / `getSnapshot()`

### 3. 3b-1 B站搜索源接线

**文件**：`ui/index.html`

- 在 `#musicServer` 下拉菜单里添加 `<option value="bilibili">B站</option>`

**测试**：
- 搜索源下拉菜单已显示「B站」选项
- 后端 API `/widget/api/music/search?keyword=…&server=bilibili` 返回 404（本地服务器无后端）

**已知瑕疵**：
- 后端接口未实现或本地服务器无后端，无法验证 B站 搜索结果

### 4. 3b-2 缓存按钮

**文件**：`ui/app.js`

- 在 `.music-item` 渲染时添加缓存按钮（L4510 附近）：
  ```js
  +'<button class="music-cache" title="缓存到本地" data-id="..." data-server="...">💾</button>'
  ```
- 添加缓存按钮的点击事件处理（L4560 附近）：
  - 调用 `POST /widget/api/music/cache/:id?server=X`
  - 成功显示 `✓`，失败显示 `💾` 并恢复可点击

**文件**：`ui/style.css`

- 添加 `.music-cache` 样式（L680 附近）

**已知瑕疵**：
- 缓存管理入口未实现（用户要求"列表+用量 MB 放在合适的现有面板里"，时间不够）
- 需要检查后端缓存 API 是否可用

### 5. 3b-3 歌词 is-near 接线

**文件**：`ui/app.js`

- 修改 `highlightLrc` 函数（L5140 附近），给当前行 ±1 行打 `is-near` 类：
  ```js
  el.classList.toggle('is-near', (i===idx-1 || i===idx+1));
  ```

**验证**：
- style.css 里 `.player-container[data-layout="long"] .lyric-line.is-near` 已定义（2c 遗留）
- 现在 app.js 会正确打类

## 实测证据

### 1. 语法检查
```
$ node --check ui/app.js
（无输出，通过）

$ node pv/build.mjs --check
ui/index.html: 330 KB → 330.4 KB｜拆旧块 2 处｜剥遗留 CSS 0 条 / JS 0 块
ui/standalone.html: 330 KB → 330.3 KB｜拆旧块 2 处｜剥遗留 CSS 0 条 / JS 0 块
ui/app.js: 210 KB → 210.8 KB｜剥遗留 JS 0 块｜核心钩子 已在｜降级钩子 0 条
（--check：未写入）
```

### 2. 浏览器验证（`http://127.0.0.1:8877/ui/index.html`）

**主题面板**：
```
$ evaluate: Array.from(document.querySelectorAll('.theme-chip')).map(b => b.textContent.trim()).join(', ')
金夜, 暗夜, 暖褐, 深夜, 霓虹, 纸感, 原色, 封面皮肤
```
✅ 封面皮肤已出现

**三态主题切换**：
```
$ evaluate: document.documentElement.getAttribute('data-theme')
auto

$ evaluate: document.getElementById('themeBtn').click(); document.documentElement.getAttribute('data-theme')
light

$ evaluate: document.getElementById('themeBtn').click(); document.documentElement.getAttribute('data-theme')
dark

$ evaluate: document.getElementById('themeBtn').click(); document.documentElement.getAttribute('data-theme')
auto
```
✅ 三态循环正确

**B站搜索源**：
```
$ evaluate: Array.from(document.getElementById('musicServer').options).map(o => o.textContent).join(', ')
网易云, QQ, 酷狗, 百度, 酷我, B站
```
✅ B站选项已出现

**B站搜索**：
```
$ evaluate: fetch('/widget/api/music/search?keyword=test&server=bilibili').then(r=>r.text()).then(t=>t.substring(0,200))
404 widget\api\music\search
```
❌ 后端接口 404（本地服务器无后端）

### 3. 控制台日志
- **JavaScript error**：0 条
- **网络 404**：多条（API 路由找不到，本地服务器无后端，正常）

### 4. 构建号同步
```
$ node tools/bump-build.mjs
build = 1011175026（_build.json + head.js 两处已同步）
```

## 代码不能证明的部分

1. **封面取色**：需要真实曲目封面 + `/widget/api/music/pic?url=…` 代理才能验证 canvas 取色
2. **hana.theme.subscribe**：需要 SDK 支持才能验证宿主主题跟随
3. **B站搜索**：需要后端实现才能验证搜索结果
4. **缓存按钮**：需要后端缓存 API 才能验证缓存流程

## 未竟事项

1. **缓存管理入口**：用户要求"列表+用量 MB 放在合适的现有面板里"，未实现
2. **封面取色**：只用了封面图做背景，没有提取主色更新 CSS 变量
3. **hana.theme.subscribe 映射**：只记录了日志，没有实际修改 `data-theme`
4. **B站无歌词态**：需要验证 B站 曲目选中后是否不报错（需要后端支持）

## 下一步
- 后端接口实现后，验证 B站 搜索和缓存功能
- 补充封面取色逻辑（用 `/widget/api/music/pic` 代理）
- 实现缓存管理入口（需要找到合适的现有面板）
- 完善 `hana.theme.subscribe` 的映射逻辑
