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
    if (!PV._booted) {
      PV._booted = true;
      document.addEventListener('pv:cut', function () { PV.markStyle(); });
    }
    return true;
  };

  /* ---------- 兼容核心调用 ---------- */
  window.renderJizuraInit = function () {
    if (!PV.boot()) return;
    if (!PV.active()) return;
    var c = core();
    if (!PV.lyrics().length && c && c.lrc) PV.setLyrics(c.lrc());
    var i = c && c.idx ? c.idx() : PV.idxFromTime();
    var l = PV.lyrics();
    if (!l.length) { PV.empty('暂无歌词'); return; }
    PV.show(i >= 0 ? i : 0, { force: true });
  };

  window.renderJizuraLine = function (idx) {
    if (!PV.boot()) return;
    if (!PV.active()) return;
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
    if (c && c.lrc) PV.setLyrics(c.lrc());
    document.body.classList.add('jizura-mode');
    window.renderJizuraInit();
  };

  PV.exit = function () {
    document.body.classList.remove('jizura-mode');
    var c = core();
    /* 旧实现这里 dispatch 了一个没人听的 'jizura-exit'，folia 层不会重建。
     * 现在直接请核心重画，退出后不会停在上一句 PV。 */
    if (c && c.render) c.render();
  };

  PV.toggle = function () {
    if (PV.active()) PV.exit(); else PV.enter();
  };

  /* R 键 */
  document.addEventListener('keydown', function (e) {
    if (!PV.active()) return;
    if (e.key === 'r' || e.key === 'R') {
      var t = e.target || {};
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      PV.omakase();
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
  PV.version = 'pv-registry/0.2';
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
