/* PV 引擎 · 05 对外接口与宿主接线
 * 核心只认四样东西：body.jizura-mode、window._jizuraLrcData、
 * window.renderJizuraInit()、window.renderJizuraLine(idx)。
 * 这四个名字保持稳定，核心代码从此不用再改；其余都走 window.PV。
 */
(function () {
  'use strict';
  var PV = window.PV;
  var core = function () { return window.__pvCore || null; };

  PV.idxFromTime = function () {
    var l = PV.lyrics();
    if (!l.length) return -1;
    var a = document.querySelector('audio');
    if (!a) return 0;
    var ms = a.currentTime * 1000, best = 0;
    for (var i = 0; i < l.length; i++) {
      if ((l[i].time || 0) <= ms) best = i; else break;
    }
    return best;
  };

  PV.boot = function () {
    var layer = PV.mount();
    if (!layer) return false;
    PV.mountChrome();
    if (!PV.style()) PV.useStyle('auto');
    PV.markStyle();
    PV.startLoop();
    if (PV.applyMonoStack) PV.applyMonoStack();     // ⑥ 等宽链给 type 版式与小字用
    if (PV.audioStart) PV.audioStart();          // ③ 音频驱动：跟着 PV 开，不单独常驻
    if (PV.tuneRestore) PV.tuneRestore();        // ⑲ 把上次选的档位贴回来
    if (!PV._booted) {
      PV._booted = true;
      document.addEventListener('pv:cut', function () { PV.markStyle(); });
    }
    return true;
  };

  /* ---------- 歌词表同步 ----------
   * 核心在换歌时是**重新赋值** lrcData（lrcData = parsed），旧数组立刻作废。
   * 而这里以前写的是 `if (!PV.lyrics().length) PV.setLyrics(...)`——只有空表才灌，
   * 于是第一首歌把表灌满之后，换歌永远灌不进来：PV 就拿着上一首的旧数组反复演，
   * 看上去像「歌词被固定住了」，而且行号还是按新曲时间去查旧表——全盘对不上。
   *
   * 现在每帧都对身份：引用不同或首尾签名不同就重灌。同一张表不会重复灌
   * （setLyrics 会清 cut 缓存，重灌就等于重掷版式，所以“只在真变了时变”是必须的）。
   */
  PV.syncTable = function (l) {
    l = l || [];
    var sig = l.length + '|' + (l[0] ? (l[0].text + '@' + l[0].time) : '') +
      '|' + (l.length ? (l[l.length - 1].text + '@' + l[l.length - 1].time) : '');
    if (PV._tblRef === l && PV._tblSig === sig) return false;   // 同一张表，没动
    PV.setLyrics(l);
    /* 必须在 setLyrics 之后记：setLyrics 会把这两个字段清掉（见引擎里的注释） */
    PV._tblRef = l; PV._tblSig = sig;
    return true;
  };

  /* ---------- 兼容核心调用 ---------- */
  window.renderJizuraInit = function () {
    if (!PV.boot()) return;
    if (!PV.active()) return;
    var c = core();
    PV.syncTable(c && c.lrc ? c.lrc() : null);
    var i = c && c.idx ? c.idx() : PV.idxFromTime();
    var l = PV.lyrics();
    if (!l.length) { PV.empty('暂无歌词'); return; }
    PV.show(i >= 0 ? i : 0, { force: true });
  };

  window.renderJizuraLine = function (idx) {
    if (!PV.boot()) return;
    if (!PV.active()) return;
    var c = core();
    /* 行回调里也要对表：换歌时核心可能先走到这里，此时 PV 手上还是上一首的词 */
    if (PV.syncTable(c && c.lrc ? c.lrc() : null)) {
      var l = PV.lyrics();
      if (!l.length) { PV.empty('暂无歌词'); return; }
      idx = Math.max(0, Math.min(l.length - 1, (c && c.idx ? c.idx() : idx) || 0));
    }
    PV.show(idx);
  };
  /* ---------- おまかせ：换 seed、换风格、换气氛，重掷当前行 ---------- */
  PV.omakase = function () {
    PV.seed(Math.floor(Math.random() * 1e9));
    PV.rollStyle();
    var m = PV.pick(PV.parts('mood'));
    PV.setMood(m ? m.key : null);
    PV.setLastLayout('');
    var l = PV.lyrics(), i = PV.curIdx();
    if (l.length && i >= 0 && i < l.length) PV.show(i, { force: true });
    else if (l.length) PV.show(PV.idxFromTime(), { force: true });
    PV.dispatch('pv:omakase', { mood: PV.mood, style: PV.style() ? PV.style().id : null });
  };

  /* 只重掷版式（保留风格与歌词时序）——② 的「部分重掷」入口 */
  PV.reroll = function (opts) {
    var i = PV.curIdx();
    if (i < 0) return;
    PV.setLastLayout('');
    PV.show(i, Object.assign({ force: true }, opts || {}));
  };

  /* ---------- 模式切换 ---------- */
  PV.enter = function () {
    var c = core();
    PV.syncTable(c && c.lrc ? c.lrc() : null);
    document.body.classList.add('jizura-mode');
    window.renderJizuraInit();
  };

  PV.exit = function () {
    document.body.classList.remove('jizura-mode');
    if (PV.audioStop) PV.audioStop();
    var c = core();
    /* 旧实现这里 dispatch 了一个没人听的 'jizura-exit'，folia 层不会重建。
     * 现在直接请核心重画，退出后不会停在上一句 PV。 */
    if (c && c.render) c.render();
  };
  PV.toggle = function () {
    if (PV.active()) PV.exit(); else PV.enter();
  };

  /* R 键重掷；T 键开关配牌读数（默认关） */
  document.addEventListener('keydown', function (e) {
    if (!PV.active()) return;
    var t = e.target || {};
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    if (e.key === 'r' || e.key === 'R') {
      PV.omakase();
    } else if (e.key === 't' || e.key === 'T') {
      PV.tagOn = !PV.tagOn;
      PV.applyTag(PV.lastPlan());
    }
  });

  /* 双击舞台切换（附件上双击不算） */
  document.addEventListener('dblclick', function (e) {
    var st = PV.stage();
    if (!st || !st.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.jv-dice,.jv-bar,.jv-tag')) return;
    if (!document.body.classList.contains('lyrics-mode')) return;
    PV.toggle();
  });

  /* 首帧后再挂载一次：确保 #pvStage 已存在 */
  requestAnimationFrame(function () { try { PV.boot(); } catch (e) { } });

  /* 控制台与自检 */
  PV.version = 'pv-registry/0.6';
  /* 核心靠这两个字段判断能不能用 PV：没 PV 块时 window.PV 不存在，
   * 三档胶囊与循环自动降级成两档——lite 包就是「不带 PV 块」，不用改核心 */
  PV.available = true;
  PV.selftest = function () {
    var out = { version: PV.version, groups: PV.stats(), mounted: !!PV.layer() };
    out.demo = [];
    ['主歌的第一句歌词', 'We are the champions', '夜', ''].forEach(function (t, i) {
      var p = PV.demo([t], 0);
      out.demo.push({ text: t || '(空行)', layout: p && p.layout.key, enter: p && p.enter.key });
    });
    return out;
  };
})();
