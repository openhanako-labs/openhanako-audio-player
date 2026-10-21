(function () {
  // 构建标记：探针会把它报回后端，用来判断卡片到底跑的是新代码还是旧代码。
  window.__HANA_BUILD = "1021153547";

  // __whenHana(cb)：SDK 就绪后回调；已就绪立即执行。事件见 index.html 的 module 胶水。
  window.__whenHana = function (cb) {
    if (window.__hana) { try { cb(window.__hana); } catch (e) {} return; }
    window.addEventListener("hana-sdk-ready", function () { try { cb(window.__hana); } catch (e) {} }, { once: true });
  };

  // ── 卡片高度：声明意图，不测自己 ──
  //
  // 这里踩过的坑：v1 的 notifySize() 报 document.body.scrollHeight，而 body 高 = iframe 高，
  // 自己喂自己 → 宿主把框一路撑到聊天可视区上限（实测 1452px），卡片占满整屏、聊天区滚不动。
  //
  // 按 APPS.md「卡片尺寸与形态契约」：聊天流卡高度是 flexible，页面用
  // hana.ui.resize({ height }) 报一个**由 UI 意图决定**的数，宿主先 clamp 再落到框上；
  // 这个数不能由 iframe 当前高度推导，否则就是那个循环本身。
  //
  // 所以高度是参数，不是测量结果 —— 两种视图各一个档位：
  //   full    完整播放器（卡片中心 / 拆窗 / 展开后的对话流卡）
  //   compact 浓缩单曲卡（对话流默认，route 带 ?view=compact）
  var HEIGHTS = { full: 560, compact: 168, compactList: 520 };

  // 视图判定，两条来源，显式优先：
  //   ① route 上的 ?view=full|compact —— 投递方显式指定，最可靠
  //   ② 挂载位推断 —— 流内卡（embeddedSessionId 非空）默认浓缩；
  //      黑板 / 拆窗 / 卡片中心默认完整。
  //   SDK 在 module 里、可能晚于本脚本，所以②要等拿到上下文后再补判（见下方轮询）。
  function viewFromQuery() {
    var m = /(?:^|[?&])view=(full|compact)(?:&|$)/.exec(location.search);
    if (m) return m[1];
    // 拆窗页（standalone.html）永远是完整壳 —— 它本来就只给宽窗口用
    if (/standalone\.html$/i.test(location.pathname)) return "full";
    return null;
  }
  var view = viewFromQuery() || "full";
  function currentHeight() {
    if (window.__hanaCardHeightOverride != null) return window.__hanaCardHeightOverride;
    if (view === "compact" && document.body.classList.contains("list-open")) return HEIGHTS.compactList;
    return HEIGHTS[view] || HEIGHTS.full;
  }
  var H = currentHeight();

  // ── 先掐掉 v1 老 UI 自己的报高器 ──
  //
  // 页面 body 脚本里（IIFE 内）有：
  //   function notifySize() { parent.postMessage({type:'resize-request',
  //                            payload:{height: document.body.scrollHeight}}, '*'); }
  //   new ResizeObserver(notifySize).observe(document.body);
  //   setTimeout(notifySize, 300);
  //
  // 它报的是 body.scrollHeight —— 而 body 是 height:100%，等于 iframe 自己的高度，
  // 于是自我循环、一路上报，被宿主 clamp 到聊天可视区上限（实测 1452px），
  // 卡片就占满整屏、聊天区被顶住滑不动。
  //
  // 试过但**没用**的写法：覆盖 window.notifySize —— 那是 IIFE 内的函数声明，
  // 压根不在 window 上，覆盖了个空气。必须在它跑之前从更外层拦。

  // 1) ResizeObserver 换成空壳：v1 那个观察器每次 body 变化都重报。
  try {
    if (window.ResizeObserver) {
      var _RealRO = window.ResizeObserver;
      // 代理：保留真实 observe 能力（applyLayout/横条断点依赖的 documentElement 观察要真正生效），
      // 只拦掉 v1 的 "observe(document.body) 喂 notifySize 上报高度" 这一支，防循环。
      window.ResizeObserver = function (cb) {
        var _real = new _RealRO(function (entries, obs) {
          // 若这次回调是 body 尺寸变化引起的（v1 的 notifySize），已由下方 observe 拦截，
          // 不会走到这里；真实 documentElement 观察正常回调。
          cb && cb(entries, obs);
        });
        this.observe = function (target, opts) {
          if (target === document.body) return; // v1 的 notifySize 观察 body → 拦住
          _real.observe(target, opts);
        };
        this.unobserve = function (t) { _real.unobserve(t); };
        this.disconnect = function () { _real.disconnect(); };
      };
    }
  } catch (e) {}

  // 2) 夹住 body.scrollHeight：漏网的一次性 setTimeout(notifySize, 300) 会读它。
  try {
    var d = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");
    if (d && d.get) {
      Object.defineProperty(Element.prototype, "scrollHeight", {
        configurable: true,
        enumerable: d.enumerable,
        get: function () {
          var v = d.get.call(this);
          return this === document.body ? Math.min(v, currentHeight()) : v;
        },
      });
    }
  } catch (e) {}

  // 3) 把 v1 的 resize-request 改成发 H，而不是吞掉。
  //    实测宿主确实认这条消息（卡片就是被它顶到 1452 的），而 v2 的
  //    hana.ui.resize 这条反而没看到效果。两条通道都报 H，哪条生效都对。
  try {
    var pw = window.parent;
    if (pw && pw !== window) {
      var origPM = pw.postMessage;
      pw.postMessage = function (msg) {
        try {
          if (msg && msg.type === "resize-request") {
            msg = { type: "resize-request", payload: { height: currentHeight() } };
          }
        } catch (e) {}
        return origPM.apply(pw, arguments);
      };
    }
  } catch (e) {}

  // 4) 再自己直发一条（不经父窗口方法改写，双保险）
  function tellParent() {
    try {
      parent.postMessage({ type: "resize-request", payload: { height: currentHeight() } }, "*");
    } catch (e) {}
  }

  // ── 再报我自己的高度（走 v2 协议那条）──
  function report() {
    try {
      if (window.__hana) window.__hana.ui.resize({ height: currentHeight() });
    } catch (e) {
      /* 报不了不影响功能 */
    }
    tellParent();
  }
  /* 内嵌卡列表展开：app.js 切换 body.list-open 时改 override 再调 __hanaReport()，
   * 宿主随报高落框 —— 卡片高度不再是固定档位，展开列表时给足空间。 */
  window.__hanaCardHeightOverride = null;
  window.__hanaReport = function () { report(); };
  window.__whenHana(report);  // 首批上报：SDK 就绪后立即执行，不等重试
  setTimeout(report, 300);
  setTimeout(report, 800);
  setTimeout(report, 2000);
  setTimeout(report, 4000);

  // ② 挂载位补判：没有显式 view 时，等 SDK 起来后按卡片归属定形态。
  //    流内卡（embeddedSessionId 非空）→ 浓缩；其余（黑板 / 拆窗 / 卡片中心）→ 完整。
  //    拿不到上下文就保持默认，不阻塞任何东西。
  if (!viewFromQuery()) {
    var probeTries = 0;
    var probeTimer = setInterval(function () {
      probeTries++;
      var c = null;
      try {
        c = window.__hana && window.__hana.surface && window.__hana.surface.getContext
          ? window.__hana.surface.getContext()
          : null;
      } catch (e) {}
      if (c) {
        clearInterval(probeTimer);
        // 把挂载位事实报回主机侧：卡片里看不见的东西，就写出去让自己看得见。
        // envelope 是宿主告知的容器约束，其余是这次真实落到的尺寸。
        try {
          var appId =
            (/^\/api\/apps\/([^/]+)\//.exec(location.pathname) || [])[1] || "hanako-audio-player";
          var env =
            window.__hana && window.__hana.envelope && window.__hana.envelope.getSnapshot
              ? window.__hana.envelope.getSnapshot()
              : null;
          fetch("/api/apps/" + appId + "/routes/api/_probe/size", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              where: "view-probe",
              probeKey:
                (/standalone\.html$/i.test(location.pathname) ? "win" : "card") +
                ":" + view,
              view: view,
              context: {
                slot: c.slot,
                cardInstanceId: c.cardInstanceId,
                embeddedSessionId: c.embeddedSessionId,
                originSessionId: c.originSessionId,
              },
              envelope: env,
              innerHeight: window.innerHeight,
              innerWidth: window.innerWidth,
              bodyScrollHeight: document.body ? document.body.scrollHeight : null,
              build: window.__HANA_BUILD || null,
            }),
          }).catch(function () {});
        } catch (e) {}
        if (c.embeddedSessionId && view !== "compact") window.__hanaSetView("compact");
      } else if (probeTries > 40) {
        clearInterval(probeTimer); // 约 6 秒还没上下文，保持默认形态
      }
    }, 150);
  }

  // ── 视图切换（浓缩 ⇄ 完整）──
  //
  // 同一份页面渲染两个壳，而不是另建 compact.html：
  // 播放内核就在这份从 v1 搬来的页面里，另起一份就是双实现
  // —— "对话里是骨架、卡片中心是原版"已经踩过一次。
  // 切完立刻重报高度，宿主按 flexible 重新分配。
  function applyViewClass() {
    var b = document.body;
    if (!b) return false;
    b.classList.toggle("view-compact", view === "compact");
    b.classList.toggle("view-full", view === "full");
    return true;
  }

  window.__hanaGetView = function () { return view; };

  window.__hanaSetView = function (next) {
    if (next !== "compact" && next !== "full") return false;
    view = next;
    H = currentHeight();
    if (!applyViewClass()) document.addEventListener("DOMContentLoaded", applyViewClass);
    try {
      window.dispatchEvent(new CustomEvent("hana:view-changed", { detail: { view: view } }));
    } catch (e) {}
    report();
    setTimeout(report, 120);
    return true;
  };

  // 初始视图类必须尽早挂上，否则会先按完整版布局闪一下
  if (!applyViewClass()) document.addEventListener("DOMContentLoaded", applyViewClass);
})();

(function () {
  // 防线：卡片里不允许开新窗口（包括别的脚本后面又接上的）
  try {
    window.open = function () {
      console.warn("[hana] 卡片里已拦下 window.open");
      return null;
    };
  } catch (e) {}

  function installPop() {
    var btn = document.getElementById("popBtn");
    if (!btn || btn.__rewired) return true;

    var fresh = btn.cloneNode(true); // 丢弃原监听（包括那个 window.open）
    fresh.__rewired = true;
    fresh.title = "切换横竖版 / 展开";
    btn.parentNode.replaceChild(fresh, btn);

    fresh.addEventListener("click", function () {
      // 浓缩视图里，这个按钮先负责“展开成完整播放器”；
      // 完整视图里，它切横竖版（.player-popup = 左右分栏）。
      // 不再在这里报死高度 —— 高度归 __hanaSetView 管。
      if (window.__hanaGetView && window.__hanaGetView() === "compact") {
        window.__hanaSetView("full");
        return;
      }
      // 宽卡默认自动分栏（见 B 档 media query）。这里切的是“用户要不要分栏”：
      // 加 wide-off 就强制堆叠，去掉就回到自动。
      // （原来 toggle 的 .player-popup 在自动分栏之后已经没有视觉效果，
      //   点了像没反应 —— 那是个真 bug。）
      document.body.classList.toggle("wide-off");
    });
    return true;
  }

  // 浓缩视图的展开入口：原 UI 没有这个按钮，注入一个到 .np-actions
  function installExpand() {
    if (document.getElementById("expandBtn")) return true;
    var host = document.querySelector(".np-actions");
    if (!host) return false;
    var b = document.createElement("button");
    b.className = "icon-btn";
    b.id = "expandBtn";
    b.title = "展开完整播放器";
    b.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/>' +
      '<path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';
    b.addEventListener("click", function () {
      if (window.__hanaSetView) window.__hanaSetView("full");
    });
    host.appendChild(b);
    return true;
  }

  function install() {
    return installPop() && installExpand();
  }

  // 按钮在 body 里，本脚本在 head —— 等它出现
  if (!install()) {
    var t = setInterval(function () {
      if (install()) clearInterval(t);
    }, 300);
    setTimeout(function () { clearInterval(t); }, 15000);
  }
})();

// === default-theme.js ===
/**
 * default-theme.js
 * 默认歌词视觉主题
 * 
 * 纯CSS实现，无Canvas/WebGL依赖，兼容所有设备
 */

const defaultTheme = {
  id: 'default-theme',
  name: '默认主题',
  description: '基础歌词显示，兼容所有设备',
  version: '1.0.0',
  author: '奥菲莉娅',
  
  // 性能要求
  requirements: {
    minTier: 'low',
    features: [],
  },
  
  // 渲染器
  renderer: {
    type: 'css',
    container: null,
    settings: null,
    
    /**
     * 初始化渲染器
     * @param {HTMLElement} container
     * @param {object} settings
     */
    init(container, settings) {
      this.container = container;
      this.settings = settings;
      
      // 创建歌词容器
      this.lyricsContainer = document.createElement('div');
      this.lyricsContainer.className = 'lyrics-container default-theme';
      this.lyricsContainer.style.cssText = `
        font-size: ${settings.fontSize || 16}px;
        line-height: ${settings.lineHeight || 1.8};
        color: ${settings.text || '#e0e0e0'};
        padding: ${settings.padding || 16}px;
        text-align: center;
        overflow-y: auto;
        max-height: 100%;
      `;
      
      this.container.appendChild(this.lyricsContainer);
    },
    
    /**
     * 渲染歌词
     * @param {object} state
     */
    render(state) {
      if (!this.lyricsContainer) return;
      
      const { lines, currentLine, highlightColor } = state;
      
      // 清空容器
      this.lyricsContainer.innerHTML = '';
      
      // 渲染每一行歌词
      lines.forEach((line, index) => {
        const lineElement = document.createElement('div');
        lineElement.className = 'lyric-line';
        lineElement.textContent = line.text;
        
        // 高亮当前行
        if (index === currentLine) {
          lineElement.style.cssText = `
            color: ${highlightColor || this.settings.highlight || '#d49a6a'};
            font-weight: bold;
            font-size: ${(this.settings.fontSize || 16) * 1.1}px;
            transition: all 0.3s ease;
          `;
        } else {
          lineElement.style.cssText = `
            color: ${this.settings.text || '#e0e0e0'};
            opacity: ${index < currentLine ? 0.5 : 0.8};
            transition: all 0.3s ease;
          `;
        }
        
        this.lyricsContainer.appendChild(lineElement);
      });
      
      // 滚动到当前行
      if (currentLine >= 0 && currentLine < lines.length) {
        const currentElement = this.lyricsContainer.children[currentLine];
        if (currentElement) {
          currentElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }
    },
    
    /**
     * 销毁渲染器
     */
    destroy() {
      if (this.lyricsContainer) {
        this.lyricsContainer.remove();
        this.lyricsContainer = null;
      }
    },
  },
  
  // 设置Schema
  settingsSchema: {
    type: 'object',
    properties: {
      fontSize: {
        type: 'number',
        default: 16,
        title: '字号',
        minimum: 12,
        maximum: 24,
      },
      lineHeight: {
        type: 'number',
        default: 1.8,
        title: '行高',
        minimum: 1.2,
        maximum: 2.5,
      },
      text: {
        type: 'string',
        default: '#e0e0e0',
        title: '文字颜色',
        format: 'color',
      },
      highlight: {
        type: 'string',
        default: '#d49a6a',
        title: '高亮颜色',
        format: 'color',
      },
      padding: {
        type: 'number',
        default: 16,
        title: '内边距',
        minimum: 8,
        maximum: 32,
      },
    },
  },
  
  // 默认设置
  defaultSettings: {
    fontSize: 16,
    lineHeight: 1.8,
    text: '#e0e0e0',
    highlight: '#d49a6a',
    padding: 16,
  },
  
  // Fallback主题ID（自身是最终fallback）
  fallback: null,
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = defaultTheme;
} else if (typeof window !== 'undefined') {
  window.defaultTheme = defaultTheme;
}

// === waveform-theme.js ===
/**
 * waveform-theme.js
 * 波形歌词视觉主题
 * 
 * Canvas实现，显示音频波形，中性能档位
 */

const waveformTheme = {
  id: 'waveform-theme',
  name: '波形主题',
  description: '歌词与音频波形同步显示',
  version: '1.0.0',
  author: '奥菲莉娅',
  
  // 性能要求
  requirements: {
    minTier: 'medium',
    features: ['canvas'],
  },
  
  // 渲染器
  renderer: {
    type: 'canvas',
    container: null,
    settings: null,
    canvas: null,
    ctx: null,
    animationId: null,
    waveformData: [],
    
    /**
     * 初始化渲染器
     * @param {HTMLElement} container
     * @param {object} settings
     */
    init(container, settings) {
      this.container = container;
      this.settings = settings;
      
      // 创建Canvas元素
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'waveform-canvas';
      this.canvas.style.cssText = `
        width: 100%;
        height: ${settings.waveHeight || 60}px;
        display: block;
      `;
      this.container.appendChild(this.canvas);
      
      // 获取上下文
      this.ctx = this.canvas.getContext('2d');
      
      // 创建歌词容器
      this.lyricsContainer = document.createElement('div');
      this.lyricsContainer.className = 'lyrics-container waveform-theme';
      this.lyricsContainer.style.cssText = `
        font-size: ${settings.fontSize || 16}px;
        line-height: ${settings.lineHeight || 1.8};
        color: ${settings.lyricColor || '#d49a6a'};
        padding: ${settings.padding || 16}px;
        text-align: center;
        overflow-y: auto;
        max-height: calc(100% - ${settings.waveHeight || 60}px);
      `;
      this.container.appendChild(this.lyricsContainer);
      
      // 初始化波形数据
      this.waveformData = new Array(64).fill(0);
      
      // 调整Canvas大小
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    },
    
    /**
     * 调整Canvas大小
     */
    resizeCanvas() {
      if (!this.canvas) return;
      
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * window.devicePixelRatio;
      this.canvas.height = rect.height * window.devicePixelRatio;
      this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    },
    
    /**
     * 渲染歌词和波形
     * @param {object} state
     */
    render(state) {
      if (!this.ctx || !this.lyricsContainer) return;
      
      const { lines, currentLine, waveData } = state;
      
      // 更新波形数据
      if (waveData && waveData.length > 0) {
        this.waveformData = waveData;
      }
      
      // 清空Canvas
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      // 绘制波形
      this.drawWaveform();
      
      // 渲染歌词
      this.renderLyrics(lines, currentLine);
    },
    
    /**
     * 绘制波形
     */
    drawWaveform() {
      const { width, height } = this.canvas.getBoundingClientRect();
      const barWidth = width / this.waveformData.length;
      const waveColor = this.settings.waveColor || '#4ade80';
      
      this.ctx.fillStyle = waveColor;
      
      this.waveformData.forEach((value, index) => {
        const barHeight = value * height * 0.8;
        const x = index * barWidth;
        const y = (height - barHeight) / 2;
        
        this.ctx.fillRect(x, y, barWidth - 1, barHeight);
      });
    },
    
    /**
     * 渲染歌词
     * @param {Array} lines
     * @param {number} currentLine
     */
    renderLyrics(lines, currentLine) {
      // 清空容器
      this.lyricsContainer.innerHTML = '';
      
      // 渲染每一行歌词
      lines.forEach((line, index) => {
        const lineElement = document.createElement('div');
        lineElement.className = 'lyric-line';
        lineElement.textContent = line.text;
        
        // 高亮当前行
        if (index === currentLine) {
          lineElement.style.cssText = `
            color: ${this.settings.lyricColor || '#d49a6a'};
            font-weight: bold;
            font-size: ${(this.settings.fontSize || 16) * 1.1}px;
            transition: all 0.3s ease;
          `;
        } else {
          lineElement.style.cssText = `
            color: ${this.settings.lyricColor || '#d49a6a'};
            opacity: ${index < currentLine ? 0.5 : 0.8};
            transition: all 0.3s ease;
          `;
        }
        
        this.lyricsContainer.appendChild(lineElement);
      });
      
      // 滚动到当前行
      if (currentLine >= 0 && currentLine < lines.length) {
        const currentElement = this.lyricsContainer.children[currentLine];
        if (currentElement) {
          currentElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }
    },
    
    /**
     * 销毁渲染器
     */
    destroy() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
      }
      
      if (this.canvas) {
        this.canvas.remove();
        this.canvas = null;
      }
      
      if (this.lyricsContainer) {
        this.lyricsContainer.remove();
        this.lyricsContainer = null;
      }
      
      window.removeEventListener('resize', this.resizeCanvas);
    },
  },
  
  // 设置Schema
  settingsSchema: {
    type: 'object',
    properties: {
      waveColor: {
        type: 'string',
        default: '#4ade80',
        title: '波形颜色',
        format: 'color',
      },
      lyricColor: {
        type: 'string',
        default: '#d49a6a',
        title: '歌词颜色',
        format: 'color',
      },
      waveHeight: {
        type: 'number',
        default: 60,
        title: '波形高度',
        minimum: 30,
        maximum: 120,
      },
      fontSize: {
        type: 'number',
        default: 16,
        title: '字号',
        minimum: 12,
        maximum: 24,
      },
      lineHeight: {
        type: 'number',
        default: 1.8,
        title: '行高',
        minimum: 1.2,
        maximum: 2.5,
      },
      padding: {
        type: 'number',
        default: 16,
        title: '内边距',
        minimum: 8,
        maximum: 32,
      },
    },
  },
  
  // 默认设置
  defaultSettings: {
    waveColor: '#4ade80',
    lyricColor: '#d49a6a',
    waveHeight: 60,
    fontSize: 16,
    lineHeight: 1.8,
    padding: 16,
  },
  
  // Fallback主题ID
  fallback: 'default-theme',
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = waveformTheme;
} else if (typeof window !== 'undefined') {
  window.waveformTheme = waveformTheme;
}

// === spectrum-theme.js ===
/**
 * spectrum-theme.js
 * 频谱歌词视觉主题
 * 
 * WebGL实现，实时频谱分析，高性能档位
 */

const spectrumTheme = {
  id: 'spectrum-theme',
  name: '频谱主题',
  description: '实时频谱分析与歌词同步',
  version: '1.0.0',
  author: '奥菲莉娅',
  
  // 性能要求
  requirements: {
    minTier: 'high',
    features: ['webgl'],
  },
  
  // 渲染器
  renderer: {
    type: 'webgl',
    container: null,
    settings: null,
    canvas: null,
    gl: null,
    animationId: null,
    spectrumData: [],
    
    /**
     * 初始化渲染器
     * @param {HTMLElement} container
     * @param {object} settings
     */
    init(container, settings) {
      this.container = container;
      this.settings = settings;
      
      // 创建Canvas元素
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'spectrum-canvas';
      this.canvas.style.cssText = `
        width: 100%;
        height: 100%;
        display: block;
      `;
      this.container.appendChild(this.canvas);
      
      // 获取WebGL上下文
      this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
      
      if (!this.gl) {
        console.error('WebGL not supported, falling back to default theme');
        return;
      }
      
      // 初始化WebGL
      this.initWebGL();
      
      // 创建歌词容器
      this.lyricsContainer = document.createElement('div');
      this.lyricsContainer.className = 'lyrics-container spectrum-theme';
      this.lyricsContainer.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        font-size: ${settings.fontSize || 16}px;
        line-height: ${settings.lineHeight || 1.8};
        color: ${settings.lyricColor || '#d49a6a'};
        padding: ${settings.padding || 16}px;
        text-align: center;
        background: linear-gradient(transparent, rgba(0,0,0,0.7));
        max-height: 40%;
        overflow-y: auto;
      `;
      this.container.appendChild(this.lyricsContainer);
      
      // 初始化频谱数据
      this.spectrumData = new Array(settings.barCount || 64).fill(0);
      
      // 调整Canvas大小
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    },
    
    /**
     * 初始化WebGL
     */
    initWebGL() {
      const gl = this.gl;
      
      // 着色器源码
      const vertexShaderSource = `
        attribute vec2 a_position;
        attribute float a_height;
        uniform vec2 u_resolution;
        varying float v_height;
        
        void main() {
          vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
          gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
          v_height = a_height;
        }
      `;
      
      const fragmentShaderSource = `
        precision mediump float;
        uniform vec3 u_color;
        varying float v_height;
        
        void main() {
          gl_FragColor = vec4(u_color * v_height, 1.0);
        }
      `;
      
      // 编译着色器
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
      
      // 创建程序
      this.program = gl.createProgram();
      gl.attachShader(this.program, vertexShader);
      gl.attachShader(this.program, fragmentShader);
      gl.linkProgram(this.program);
      
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        console.error('Program link failed:', gl.getProgramInfoLog(this.program));
        return;
      }
      
      // 获取属性位置
      this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
      this.heightLocation = gl.getAttribLocation(this.program, 'a_height');
      this.resolutionLocation = gl.getUniformLocation(this.program, 'u_resolution');
      this.colorLocation = gl.getUniformLocation(this.program, 'u_color');
      
      // 创建缓冲区
      this.positionBuffer = gl.createBuffer();
      this.heightBuffer = gl.createBuffer();
    },
    
    /**
     * 编译着色器
     * @param {number} type
     * @param {string} source
     * @returns {WebGLShader}
     */
    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile failed:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      
      return shader;
    },
    
    /**
     * 调整Canvas大小
     */
    resizeCanvas() {
      if (!this.canvas || !this.gl) return;
      
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * window.devicePixelRatio;
      this.canvas.height = rect.height * window.devicePixelRatio;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    },
    
    /**
     * 渲染歌词和频谱
     * @param {object} state
     */
    render(state) {
      if (!this.gl || !this.lyricsContainer) return;
      
      const { lines, currentLine, spectrumData } = state;
      
      // 更新频谱数据
      if (spectrumData && spectrumData.length > 0) {
        this.spectrumData = spectrumData;
      }
      
      // 绘制频谱
      this.drawSpectrum();
      
      // 渲染歌词
      this.renderLyrics(lines, currentLine);
    },
    
    /**
     * 绘制频谱
     */
    drawSpectrum() {
      const gl = this.gl;
      const { width, height } = this.canvas.getBoundingClientRect();
      
      // 清空画布
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      gl.useProgram(this.program);
      
      // 设置分辨率
      gl.uniform2f(this.resolutionLocation, width, height);
      
      // 设置颜色
      const color = this.hexToRgb(this.settings.spectrumColor || '#818cf8');
      gl.uniform3f(this.colorLocation, color.r, color.g, color.b);
      
      // 计算顶点位置
      const barWidth = width / this.spectrumData.length;
      const positions = [];
      const heights = [];
      
      this.spectrumData.forEach((value, index) => {
        const x = index * barWidth;
        const barHeight = value * height * 0.8;
        
        // 矩形顶点（两个三角形）
        positions.push(
          x, height - barHeight,
          x + barWidth - 1, height - barHeight,
          x, height,
          x, height,
          x + barWidth - 1, height - barHeight,
          x + barWidth - 1, height
        );
        
        // 高度值
        heights.push(value, value, value, value, value, value);
      });
      
      // 更新位置缓冲区
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.positionLocation);
      gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
      
      // 更新高度缓冲区
      gl.bindBuffer(gl.ARRAY_BUFFER, this.heightBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(heights), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.heightLocation);
      gl.vertexAttribPointer(this.heightLocation, 1, gl.FLOAT, false, 0, 0);
      
      // 绘制
      gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
    },
    
    /**
     * 渲染歌词
     * @param {Array} lines
     * @param {number} currentLine
     */
    renderLyrics(lines, currentLine) {
      // 清空容器
      this.lyricsContainer.innerHTML = '';
      
      // 渲染每一行歌词
      lines.forEach((line, index) => {
        const lineElement = document.createElement('div');
        lineElement.className = 'lyric-line';
        lineElement.textContent = line.text;
        
        // 高亮当前行
        if (index === currentLine) {
          lineElement.style.cssText = `
            color: ${this.settings.lyricColor || '#d49a6a'};
            font-weight: bold;
            font-size: ${(this.settings.fontSize || 16) * 1.1}px;
            transition: all 0.3s ease;
            text-shadow: 0 0 10px ${this.settings.lyricColor || '#d49a6a'};
          `;
        } else {
          lineElement.style.cssText = `
            color: ${this.settings.lyricColor || '#d49a6a'};
            opacity: ${index < currentLine ? 0.5 : 0.8};
            transition: all 0.3s ease;
          `;
        }
        
        this.lyricsContainer.appendChild(lineElement);
      });
      
      // 滚动到当前行
      if (currentLine >= 0 && currentLine < lines.length) {
        const currentElement = this.lyricsContainer.children[currentLine];
        if (currentElement) {
          currentElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }
    },
    
    /**
     * Hex转RGB
     * @param {string} hex
     * @returns {object}
     */
    hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      } : { r: 0.5, g: 0.5, b: 1.0 };
    },
    
    /**
     * 销毁渲染器
     */
    destroy() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
      }
      
      if (this.gl) {
        this.gl.deleteProgram(this.program);
        this.gl.deleteBuffer(this.positionBuffer);
        this.gl.deleteBuffer(this.heightBuffer);
      }
      
      if (this.canvas) {
        this.canvas.remove();
        this.canvas = null;
      }
      
      if (this.lyricsContainer) {
        this.lyricsContainer.remove();
        this.lyricsContainer = null;
      }
      
      window.removeEventListener('resize', this.resizeCanvas);
    },
  },
  
  // 设置Schema
  settingsSchema: {
    type: 'object',
    properties: {
      spectrumColor: {
        type: 'string',
        default: '#818cf8',
        title: '频谱颜色',
        format: 'color',
      },
      lyricColor: {
        type: 'string',
        default: '#d49a6a',
        title: '歌词颜色',
        format: 'color',
      },
      barCount: {
        type: 'number',
        default: 64,
        title: '频谱条数',
        minimum: 16,
        maximum: 128,
      },
      sensitivity: {
        type: 'number',
        default: 1.0,
        title: '灵敏度',
        minimum: 0.5,
        maximum: 2.0,
      },
      fontSize: {
        type: 'number',
        default: 16,
        title: '字号',
        minimum: 12,
        maximum: 24,
      },
      lineHeight: {
        type: 'number',
        default: 1.8,
        title: '行高',
        minimum: 1.2,
        maximum: 2.5,
      },
      padding: {
        type: 'number',
        default: 16,
        title: '内边距',
        minimum: 8,
        maximum: 32,
      },
    },
  },
  
  // 默认设置
  defaultSettings: {
    spectrumColor: '#818cf8',
    lyricColor: '#d49a6a',
    barCount: 64,
    sensitivity: 1.0,
    fontSize: 16,
    lineHeight: 1.8,
    padding: 16,
  },
  
  // Fallback主题ID
  fallback: 'waveform-theme',
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = spectrumTheme;
} else if (typeof window !== 'undefined') {
  window.spectrumTheme = spectrumTheme;
}

(function () {
  try {
    var origSetInterval = window.setInterval;
    window.setInterval = function (fn, ms) {
      var wrapped = function () {
        // 30 秒那一轮是清理器：播放中就不执行
        if (ms === 30000) {
          var a = document.getElementById("audio");
          if (a && !a.paused && !a.ended) return;
        }
        return fn.apply(this, arguments);
      };
      return origSetInterval.call(window, wrapped, ms);
    };
  } catch (e) {
    /* 包不上就维持原行为 */
  }
})();

(function () {
  try {
    var ticket = new URLSearchParams(location.search).get("appSurfaceSession");
    if (!ticket) return;
    var KEY = "appSurfaceSession";

    function withTicket(v) {
      if (typeof v !== "string" || !v) return v;
      if (v.indexOf(KEY + "=") >= 0) return v;
      var same;
      try {
        same = new URL(v, location.href).origin === location.origin;
      } catch (e) {
        same = v.charAt(0) === "/";
      }
      if (!same) return v;
      return v + (v.indexOf("?") > -1 ? "&" : "?") + KEY + "=" + encodeURIComponent(ticket);
    }
    window.__apWithTicket = withTicket;

    function patchSrc(proto) {
      if (!proto) return;
      var d = Object.getOwnPropertyDescriptor(proto, "src");
      if (d && d.set) {
        Object.defineProperty(proto, "src", {
          configurable: true,
          enumerable: d.enumerable,
          get: d.get,
          set: function (v) {
            return d.set.call(this, withTicket(v));
          },
        });
      }
      var origSetAttr = proto.setAttribute;
      proto.setAttribute = function (name, value) {
        if (String(name).toLowerCase() === "src") value = withTicket(value);
        return origSetAttr.call(this, name, value);
      };
    }

    patchSrc(window.HTMLMediaElement && window.HTMLMediaElement.prototype);
    patchSrc(window.HTMLImageElement && window.HTMLImageElement.prototype);
  } catch (e) {
    /* 补不上也不能把页面弄死 */
  }
})();

(function () {
  var tries = { idx: null, n: 0, ts: 0 };
  function install() {
    if (typeof window.load !== "function") return false;
    if (window.load.__retryGuarded) return true;
    var orig = window.load;
    window.load = function (i) {
      var now = Date.now();
      if (i === tries.idx && now - tries.ts < 20000) {
        tries.n++;
        if (tries.n > 2) {
          console.warn("[guard] 同一曲目连续失败 " + tries.n + " 次，停止重试");
          return;
        }
      } else {
        tries.idx = i;
        tries.n = 1;
      }
      tries.ts = now;
      return orig.apply(this, arguments);
    };
    window.load.__retryGuarded = true;
    return true;
  }
  // 页面脚本在 body 里，晚于本脚本执行 —— 轮询等它出现。
  var t = setInterval(function () {
    if (install()) clearInterval(t);
  }, 300);
})();

(function () {
  var ticket = new URLSearchParams(location.search).get("appSurfaceSession");
  if (!ticket || !window.fetch) return;
  var orig = window.fetch;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var isLocal = false;
      try {
        var abs = new URL(url, location.href);
        isLocal = abs.origin === location.origin;
      } catch (e) {
        isLocal = url.charAt(0) === "/";
      }
      if (isLocal) {
        init = init || {};
        var h = new Headers(init.headers || {});
        if (!h.has("X-Hana-App-Surface-Session")) h.set("X-Hana-App-Surface-Session", ticket);
        init.headers = h;
      }
    } catch (e) {
      /* 头没补上也不能把请求弄丢 */
    }
    return orig.call(this, input, init);
  };
})();

(function () {
  var APP_BASE = "/api/apps/hanako-audio-player/routes";

  // 1) 迁移 localStorage 里的 v1 路径
  try {
    var KEY = "hanako_audio_playlist";
    var s = localStorage.getItem(KEY);
    if (s && s.indexOf("/api/plugins/") >= 0) {
      localStorage.setItem(KEY, s.split("/api/plugins/hanako-audio-player/").join(APP_BASE + "/"));
    }
  } catch (e) {
    /* 迁移失败不能拦住界面 */
  }

  // 2) 当前歌词行 → 输入框上方横幅（每 2 秒看一眼，变了才推）
  //
  // 前提：必须先在对话里用过一次工具（audio_play），把会话绑上。
  // 卡片自己拿不到 sessionPath —— 宿主只给 appId/slot/cardInstanceId，
  // SDK 里也没有任何 session API（查过）。所以这里只能“报告状态”，
  // 不能在卡片里自己把会话绑上。
  var lastLine = "";
  var warned = false;
  var lastReportedTitle = "";

  // 2b) 当前曲目 → 后端
  //
  // 症状：在卡片里换歌后，横幅里的歌名还是旧的。
  // 根因：后端只在 audio_play 工具调用时更新曲目；卡片自己换歌只改了
  // 界面（trackName），从没告知后端。而 /api/lyric-line 拼文案时读的
  // 就是后端的 track.title。
  // 这里盯 #trackName 的变化，一变就上报。
  setInterval(function () {
    try {
      var el = document.getElementById("trackName");
      if (!el) return;
      var title = (el.textContent || "").trim();
      // “播放器”是待机占位，不是真曲目，别上报
      if (!title || title === "播放器" || title === lastReportedTitle) return;
      lastReportedTitle = title;
      fetch(APP_BASE + "/api/now-playing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title }),
      }).catch(function () {});
    } catch (e) {}
  }, 1500);

  function tipOnce(msg) {
    if (warned) return;
    warned = true;
    // 页面自带的 toast（toastContainer + .toast-item 样式）
    try {
      if (typeof showToast === "function") showToast(msg, 5000);
    } catch (e) {}
  }

  // 启动时查一次会话绑定状态，未绑就提醒（只提一次，不烦人）
  setTimeout(function () {
    fetch(APP_BASE + "/api/session-status")
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.bound === false) {
          tipOnce("想让歌词显示在输入框上方？先在对话里让我播一首（会用 audio_play）。");
        }
      })
      .catch(function () {});
  }, 2500);

  setInterval(function () {
    try {
      var el = document.querySelector(".lyric-line.current");
      if (!el) return;
      var line = (el.textContent || "").trim();
      if (!line || line === lastLine) return;
      lastLine = line;
      fetch(APP_BASE + "/api/lyric-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line: line }),
      })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (res) {
          if (res && res.error === "no-bound-session") {
            tipOnce("歌词横幅需要先在对话里播一首（用 audio_play）绑定会话。");
          }
        })
        .catch(function () {});
    } catch (e) {
      /* 推不了就算了，不打扰播放 */
    }
  }, 2000);
  // 3) SMTC 可行性探针（只读，Phase B 用；验完可拆）
  //
  // 需求文档 §八 的前置条件：先查 navigator.mediaSession 在这个沙盒 iframe
  // 里到底能不能用，再决定要不要投入实现。
  // 这个探针不碰播放、不改任何状态，只把“能不能用”报回后端。
  setTimeout(function () {
    try {
      var ms = navigator.mediaSession;
      var result = {
        inIframe: window.self !== window.top,
        hasMediaSession: "mediaSession" in navigator,
        hasMediaMetadata: typeof window.MediaMetadata === "function",
        // 逐个方法查存在性 —— 光看对象存在不够，要能真调
        methods: {},
        // 权限策略：能不能看到 mediaSession 相关的 controlled features
        permPolicy:
          document.featurePolicy && typeof document.featurePolicy.allowsFeature === "function"
            ? {
                "mediasession": document.featurePolicy.allowsFeature("mediasession"),
                autoplay: document.featurePolicy.allowsFeature("autoplay"),
              }
            : null,
        origin: location.origin,
        isSecureContext: window.isSecureContext === true,
      };
      [
        "setActionHandler",
        "setPositionState",
        "setMicrophoneActive",
        "setCameraActive",
      ].forEach(function (k) {
        result.methods[k] = ms ? typeof ms[k] === "function" : false;
      });
      // 再试一次真调：setActionHandler 传个合法 action + 空函数
      if (ms && typeof ms.setActionHandler === "function") {
        try {
          ms.setActionHandler("play", function () {});
          ms.setActionHandler("play", null);
          result.setActionHandlerWorks = true;
        } catch (e) {
          result.setActionHandlerWorks = false;
          result.setActionHandlerError = String(e && e.message);
        }
      }
      // metadata 赋值测试
      if (result.hasMediaMetadata && ms) {
        try {
          ms.metadata = new window.MediaMetadata({ title: "probe", artist: "probe" });
          result.metadataAssignWorks = true;
        } catch (e) {
          result.metadataAssignWorks = false;
          result.metadataError = String(e && e.message);
        }
      }
      fetch(APP_BASE + "/api/_probe/smtc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      }).catch(function () {});
    } catch (e) {
      /* 探针本身报错不能影响界面 */
    }
  }, 1500);

  // 5) 尺寸探针（只读，诊断用；验完可拆）
  //
  // 症状：卡片在聊天流里撑满整个视口，聊天区被顶住滑不动。我上报的是 460px，
  // 但看着没生效。这里把真实尺寸 + envelope（宿主告知的容器约束）报回后端。
  // 同时轮询 /api/_probe/resize：从后端就能触发一次 resize，
  // 用来区分「通道不通」和「通道通但宿主不采纳」。
  setInterval(function () {
    try {
      function box(sel) {
        var el = document.querySelector(sel);
        return el ? Math.round(el.getBoundingClientRect().height) : null;
      }
      function boxW(sel) {
        var el = document.querySelector(sel);
        return el ? Math.round(el.getBoundingClientRect().width) : null;
      }
      var env = null;
      try {
        env =
          window.__hana && window.__hana.envelope
            ? window.__hana.envelope.getSnapshot()
            : null;
      } catch (e) {}
      fetch(APP_BASE + "/api/_probe/size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          probeKey:
            (/standalone\.html$/i.test(location.pathname) ? "win" : "card") +
            ":" + ((window.__hanaGetView && window.__hanaGetView()) || "?"),
          innerHeight: window.innerHeight,
          docClientHeight: document.documentElement.clientHeight,
          bodyClientHeight: document.body.clientHeight,
          bodyScrollHeight: document.body.scrollHeight,
          cssBodyHeight: getComputedStyle(document.body).height,
          cssHtmlHeight: getComputedStyle(document.documentElement).height,
          container: box(".player-container"),
          playerRight: box(".player-right"),
          plBody: box("#plBody"),
          // ── 布局诊断（主机侧看不到这个窗口，就把事实写出来）──
          // 注：这里量的是“布局结果”，不是像素——截图我看不到，数字能看。
          bodyClass: document.body.className,
          viewportW: window.innerWidth,
          leftW: boxW(".player-left"),
          rightW: boxW(".player-right"),
          lyricsH: box(".lyrics-section"),
          lyricBodyH: box(".lyric-body"),
          lyricLineCount: document.querySelectorAll(".lyric-body > *").length,
          wideOff: document.body.classList.contains("wide-off"),
          popup: document.body.classList.contains("player-popup"),
          hasHana: !!window.__hana,
          build: window.__HANA_BUILD || null,
          envelope: env,
          // ── 滚动诊断 ──
          // 症状：卡片高度修好了，但内部滚不动。
          // 这里把每个候选滚动容器的可滚性量出来，不靠猜。
          scroll: (function () {
            function m(sel) {
              var el = document.querySelector(sel);
              if (!el) return null;
              var cs = getComputedStyle(el);
              return {
                scrollH: el.scrollHeight,
                clientH: el.clientHeight,
                scrollable: el.scrollHeight - el.clientHeight,
                overflowY: cs.overflowY,
                flex: cs.flex,
                height: cs.height,
                minHeight: cs.minHeight,
                display: cs.display,
              };
            }
            // 把 .player-container 的直接子元素逐个量出来（窄版下 display:contents
            // 会让 .player-left / .player-right 从布局里消失，子元素变成容器的 flex item）
            var kids = [];
            try {
              var cont = document.querySelector(".player-container");
              if (cont) {
                var walk = function (n, depth) {
                  for (var i = 0; i < n.children.length; i++) {
                    var c = n.children[i];
                    var cs = getComputedStyle(c);
                    var r = c.getBoundingClientRect();
                    if (depth < 2) {
                      kids.push({
                        d: depth,
                        cls: (c.className || c.id || c.tagName) + "",
                        h: Math.round(r.height),
                        display: cs.display,
                        flex: cs.flex,
                        flexShrink: cs.flexShrink,
                        overflowY: cs.overflowY,
                      });
                    }
                    if (cs.display === "contents") walk(c, depth);
                    else if (depth < 1) walk(c, depth + 1);
                  }
                };
                walk(cont, 0);
              }
            } catch (e) {}
            return {
              container: m(".player-container"),
              tabContent: m(".tab-content"),
              tabPane: m(".tab-pane.active"),
              plBody: m("#plBody"),
              kids: kids,
            };
          })(),
        }),
      }).catch(function () {});
    } catch (e) {}
  }, 3000);

  // 6) 修「白天/黑夜切换失效」
  //
  // 症状：AI 主题跑过一次后，右上角那个日/月图标就切不动了。
  //
  // 原因：applyThemeToCSS() 用 root.style.setProperty() 把 19 个变量写在
  // **inline style** 上（--bg / --surface / --text …），而 applyTheme() 只改
  // data-theme 属性。[data-theme="light"] 那些 CSS 规则优先级低于行内，
  // 所以行内一铺上去，切换就被压住了。
  //
  // 不去改 applyThemeToCSS（那是主题引擎的地盘），而在外层包 applyTheme：
  // 切主题时把那些行内覆盖清掉，让 CSS 接管。清空之后 AI 主题下次仍会重写，
  // 行为不回退。
  var THEMED_VARS = [
    "--accent", "--accent-hover", "--accent-glow", "--accent-soft",
    "--bg", "--card-bg", "--surface", "--surface-hover", "--surface-active",
    "--border", "--border-strong", "--text", "--text-dim", "--text-faint",
    "--lyric-color", "--lyric-active-color", "--lyric-chorus-color",
    "--font-base", "--anim-speed",
  ];
  function clearInlineTheme() {
    var root = document.documentElement;
    for (var i = 0; i < THEMED_VARS.length; i++) {
      root.style.removeProperty(THEMED_VARS[i]);
    }
  }
  function patchApplyTheme() {
    if (typeof window.applyTheme !== "function") return false;
    if (window.applyTheme.__themed) return true;
    var orig = window.applyTheme;
    window.applyTheme = function () {
      clearInlineTheme();
      return orig.apply(this, arguments);
    };
    window.applyTheme.__themed = true;
    return true;
  }
  var pt = setInterval(function () {
    if (patchApplyTheme()) clearInterval(pt);
  }, 300);
  setTimeout(function () { clearInterval(pt); }, 15000);

  // 1.5 秒后清一次：初始 applyTheme 会先跑，可能存在早期污染
  setTimeout(clearInlineTheme, 1500);

  setInterval(function () {
    fetch(APP_BASE + "/api/_probe/resize")
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (!res || !res.ok || res.height == null) return;
        try {
          if (window.__hana) window.__hana.ui.resize({ height: res.height });
        } catch (e) {}
      })
      .catch(function () {});
  }, 5000);
})();

(function () {
  var MINE = window.__HANA_BUILD;
  if (!MINE) return;
  // APP_BASE 是 .../routes，静态资源在 .../ui
  var APP_BASE = "/api/apps/hanako-audio-player/routes";
  var UI_BASE = APP_BASE.replace(/\/routes$/, "/ui");
  var last = 0;
  setInterval(function () {
    var now = Date.now();
    if (now - last < 5000) return;
    last = now;
    fetch(UI_BASE + "/_build.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.build && j.build !== MINE) {
          // 自限：10 秒内只自动重载一次。
          // 宿主若对 ui/ 静态资源强缓存，重载后仍是旧页面，
          // 它会反复拿到新构建号 —— 那就变成无限刷新，比“没自动更新”糟得多。
          var t = Date.now();
          var lastTry = 0;
          try {
            lastTry = Number(sessionStorage.getItem("hana:build-reload-at") || 0);
          } catch (e) {}
          if (t - lastTry < 10000) {
            console.warn("[hana] 构建号不一致，但刚刚已重载过，停止自动刷新（可能命中了缓存）");
            return;
          }
          try {
            sessionStorage.setItem("hana:build-reload-at", String(t));
          } catch (e) {}
          console.log("[hana] 检测到新构建 " + j.build + "（当前 " + MINE + "），重载页面");
          location.reload();
        }
      })
      .catch(function () {});
  }, 5000);
})();