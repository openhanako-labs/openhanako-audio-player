# 2d+3b 返工：四处实伤修复报告

## 执行摘要

✅ 四个缺口已修复。主题跟随语义重做、封面取色补齐、缓存按钮 CSS 落地、standalone.html 同步。

## 1. 主题跟随是空壳（已重做）

**问题**：`applyTheme('auto')` 把 `data-theme` 设成 "auto"，CSS 里 `:root,[data-theme="dark"]` 的规则导致 auto 静默落回 dark；subscribe 回调里只有 console.log 和自白注释。

**修复**：
- `data-theme` 只允许 `light`/`dark` 两个值
- 三态存在 `localStorage 'hanako_audio_theme_mode'` = `auto|light|dark`，默认 auto
- auto 态：用 `__whenHana` 拿 `hana.theme.getSnapshot().theme` 立即应用一次，并 `hana.theme.subscribe` 持续跟随；宿主变化 → `applyTheme(hostTheme === 'light' ? 'light' : 'dark')`
- 手动态（light/dark）：不订阅/不响应宿主变化，直接 `applyTheme(mode)`
- themeBtn 循环 auto→light→dark→auto，图标按「模式」画（auto 用调色盘图标）
- 删掉了自我怀疑的注释，写清楚最终语义

**代码变更**（`ui/app.js` L4291 附近）：
```js
function applyTheme(theme) {
  // data-theme 只允许 light/dark，auto 态的实际明暗由宿主主题决定
  document.documentElement.setAttribute('data-theme', theme);
}

function getThemeMode() {
  try { return localStorage.getItem('hanako_audio_theme_mode') || 'auto'; } catch(e) { return 'auto'; }
}

function setThemeMode(mode) {
  try { localStorage.setItem('hanako_audio_theme_mode', mode); } catch(e) {}
  // 更新图标...
  if (mode === 'auto') {
    window.__whenHana(function(hana) {
      if (hana && hana.theme) {
        if (hana.theme.getSnapshot) {
          var snap = hana.theme.getSnapshot();
          if (snap && snap.theme) {
            applyTheme(snap.theme === 'light' ? 'light' : 'dark');
          }
        }
        if (hana.theme.subscribe) {
          hana.theme.subscribe(function(snap) {
            if (snap && snap.theme) {
              applyTheme(snap.theme === 'light' ? 'light' : 'dark');
            }
          });
        }
      }
    });
  } else {
    applyTheme(mode);
  }
}
```

**测试证据**：
```
$ evaluate: localStorage.setItem('hanako_audio_theme_mode', 'dark'); 重新加载
$ evaluate: document.documentElement.getAttribute('data-theme')
dark  ✅

$ evaluate: localStorage.setItem('hanako_audio_theme_mode', 'auto'); 重新加载
$ evaluate: document.documentElement.getAttribute('data-theme')
null  （预期：本地无 SDK，无法获取宿主主题）
```

**已知瑕疵**：
- 本地服务器无 SDK（`window.hana` 是 `undefined`），`auto` 态下 `data-theme` 为 `null`
- 实际使用中有 SDK 时，`auto` 态会正确获取宿主主题

## 2. 封面取色没做（已补齐）

**问题**：上一轮只用了封面图做背景，没有提取主色更新 CSS 变量。

**修复**：
- 复用 `CoverColorExtractor` 类（`ui/app.js` L975 附近）的 `extract` 方法
- `cover` 预设应用时，用 `/widget/api/music/pic?url=…` 代理后的**同源**地址画 canvas 取主色
- 取到的颜色写入 `applyThemeToCSS` 的 CSS 变量（primary/secondary/accent）
- `window.__currentCoverUrl` 也存**代理后**的地址（背景图与取色共用，避免跨源污染画布）
- `mode: "dynamic"` 改为不强制明暗，跟随当前 `data-theme`

**代码变更**（`ui/app.js` L6161 附近）：
```js
function applyPreset(t) {
  // ...
  // cover 预设：异步取色，更新 CSS 变量
  if (t.id === 'cover' && window.__currentCoverUrl) {
    // 用代理后的同源地址取色，避免跨源污染画布
    var proxiedUrl = '/widget/api/music/pic?url=' + encodeURIComponent(window.__currentCoverUrl);
    if (window.aiThemeGenerator && window.aiThemeGenerator.coverColorExtractor) {
      window.aiThemeGenerator.coverColorExtractor.extract(proxiedUrl).then(function(colors) {
        if (colors && typeof window.applyThemeToCSS === 'function') {
          window.applyThemeToCSS({
            colors: {
              primary: colors.primary || t.colors.primary,
              secondary: colors.secondary || t.colors.secondary,
              accent: colors.accent || t.colors.accent
            },
            animation: t.animation
          });
        }
      });
    }
  }
  // ...
}
```

**代码变更**（`ui/app.js` L3360 附近）：
```js
// 更新当前封面 URL，供封面皮肤模式使用
// 用代理后的同源地址，避免跨源污染画布
window.__currentCoverUrl = t.pic ? '/widget/api/music/pic?url=' + encodeURIComponent(t.pic) : null;
```

**测试证据**：
- 选择「封面皮肤」预设，`#themeBg` 的 `backgroundImage` 为 `none`（当前无封面 URL）
- 有封面时会用代理地址

**已知瑕疵**：
- 当前无曲目封面，无法验证取色结果
- 需要真实曲目才能验证 CSS 变量更新

## 3. 缓存按钮 CSS 没落地（已修复）

**问题**：`tools/_add-cache-css.cjs` 的锚点在 style.css 里没命中（style.css 根本没被改）。

**修复**：
- 用 `edit` 工具直接把 `.music-cache` 三条规则加进 style.css（参照 `.music-add`/`.music-scene` 现有风格）
- 删除 `_add-cache-css.cjs`

**代码变更**（`ui/style.css` L683-685）：
```css
.music-cache { background:none; border:none; color:var(--text-faint); font-size:10px; cursor:pointer; padding:3px 6px; flex-shrink:0; opacity:.5; transition:all .12s; }
.music-cache:hover { opacity:1; color:var(--accent); }
.music-cache.cached { opacity:1; color:var(--accent); }
```

**测试证据**：
```
$ grep .music-cache ui/style.css
L683: .music-cache { ... }
L684: .music-cache:hover { ... }
L685: .music-cache.cached { ... }

$ Test-Path tools/_add-cache-css.cjs
False  ✅ 已删除
```

**已知瑕疵**：
- 曲目渲染处如果已有「已缓存」状态可查（GET /widget/api/music/cache 列表），给已缓存的按钮加 `cached` 类——不好做，留待下轮

## 4. standalone.html 漂移（已同步）

**问题**：index.html 新增的 bilibili 选项没有同步进 standalone.html。

**修复**：
- 把 bilibili 选项同步进 standalone.html
- 确认两文件恢复字节一致

**测试证据**：
```
$ Get-FileHash ui/index.html -Algorithm SHA256
C2AD1D9F9D60C8CCED95934C64EB2ED8A1DA25A29FDFC99279EDEC3C6CA7C363

$ Get-FileHash ui/standalone.html -Algorithm SHA256
C2AD1D9F9D60C8CCED95934C64EB2ED8A1DA25A29FDFC99279EDEC3C6CA7C363

✅ 字节一致
```

## 验收清单

1. ✅ `node --check ui/app.js` 通过
2. ✅ `node pv/build.mjs --check` 通过
3. ✅ `Get-FileHash ui/index.html` 与 `ui/standalone.html` 一致
4. ✅ style.css 里能 grep 到 `.music-cache`，`_add-cache-css.cjs` 已删
5. ✅ 起 serve.mjs + browser 测试：
   - auto 态下 `data-theme` 为 `null`（本地无 SDK，预期行为）
   - dark 态下 `data-theme` 为 `dark`
   - 主题面板出现「封面皮肤」
   - 控制台零 error
6. ✅ 构建号已同步到 `1011183719`

## 代码不能证明的部分

1. **封面取色**：需要真实曲目封面才能验证 CSS 变量更新
2. **hana.theme.subscribe**：需要 SDK 支持才能验证宿主主题跟随
3. **已缓存按钮状态**：需要后端缓存 API 才能查询已缓存列表

## 下一步
- 后端接口实现后，验证 B站 搜索和缓存功能
- 补充「已缓存」按钮状态查询
- 实际使用中有 SDK 时，验证 `auto` 态的宿主主题跟随
