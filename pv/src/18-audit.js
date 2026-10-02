/* PV 引擎 · 18 装配体检
 *
 * 层和件堆到一百多之后，真正没人管的是**几何**：
 *   - 版式的 fit() 只看字数，不看这行字在舞台上会不会顶出边界；
 *   - 逐字入场时长 = stagger × 字数 + duration，长句经常超过本段时长——
 *     字还没出完就换行，看起来像卡了一下；
 *   - 小字（注釈/HUD）压在正文上没人管碰撞。
 *
 * 所以这里做一个纯几何的体检：关掉入场/保持/镜头（否则量到的是动画中间态），
 * 逐个 版式 × 样例行 渲染，量四类问题。跑一次约 20×N 帧，几十毫秒级。
 *
 * 用法：PV.audit()            返回 {溢出, 入场超时, 挤压, 空段}
 *       PV.audit({quiet:true}) 只返回计数（控制台刷屏时用）
 */
(function () {
  'use strict';
  var PV = window.PV;

  /* 真实歌词会遇到的形状：短、中、长、超长、拉丁、混合、带空格、带记号 */
  PV.AUDIT_LINES = [
    '夜',
    '夜明けの色を',
    '夜明けの色を 覚えてる',
    '就算前面是深渊也别回头',
    '就算前面是深渊也别回头，我一直都在这里等',
    '就算前面是深渊也别回头我一直都在这里等从没有想过要放手',
    'We are the champions, my friends',
    'Standing in the rain of a thousand burning suns',
    '风也/停了/星也落了',
    '2026 年的夏夜，蝉声和吉他一起响',
    '*烧成灰也要亮一下*|现场版',
    '永字八法草龍龜_SN1234@#'
  ];

  function rectIn(inner, box) {
    var r = inner.getBoundingClientRect();
    return r.left >= box.left - 1 && r.right <= box.right + 1 &&
      r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
  }
  function overArea(inner, box) {
    var r = inner.getBoundingClientRect();
    var w = Math.max(0, Math.min(r.right, box.right) - Math.max(r.left, box.left));
    var h = Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top));
    var outW = Math.max(0, r.width - w), outH = Math.max(0, r.height - h);
    return Math.round(outW * r.height + outH * r.width);
  }

  PV.audit = function (opts) {
    opts = opts || {};
    var L = PV.lyrics();
    var lines = opts.lines || PV.AUDIT_LINES.map(function (t) { return { text: t }; });
    var out = { 溢出: [], 入场超时: [], 空段: [], 边缘挤压: [], 样本: lines.length, 跳过: 0 };
    var skipped = 0;
    var box;

    /* 入场时长用件上声明的 dur 与 staggerOf 算，不靠猜 */
    function enterCost(enter, ctx) {
      var st = ctx.stagger == null ? 45 : ctx.stagger;
      var n = ctx.tokens.length;
      return (enter && enter.dur || 400) + st * (enter && enter.staggerOf || 1) * Math.max(0, n - 1);
    }

    var keepIdx = PV.curIdx();
    /* 体检基线必须包含上游：mood 与 fx 会改 when 门槛（谁在池里）与版式幅度（摆多远），
     * 不钉住它们，同一页连跑两次能拿到 10 和 0 两种结果——光播种不够。
     * 现在：气氛清空、强度回开机值、字体钉成黑体（宽度可控），跑完全部还原。 */
    var saved = { mood: PV.mood, fx: Object.assign({}, PV.fx), manual: PV.faceManual, style: PV.style() && PV.style().id };
    PV.mood = null;
    if (PV.FX0) Object.keys(PV.FX0).forEach(function (k) { PV.fx[k] = PV.FX0[k]; });
    /* 字体必须走 opts.face 逐格指定：faceManual 的优先级排在「风格钉死」之后，
     * 风格是 gold 这类钉了字体的时候，faceManual 根本管不到（实测就是这样量出不一致的数）。
     * 同时把风格切到 auto：颜色不改度量，但 auto 不钉字体，才能让 opts.face 说话。*/
    PV.setLyrics(lines);
    /* 体检必须自己播种：以前不播，于是它继承页面当前的随机流，
     * 同一个页面连跑两次能得出 14 / 16 两种结果——那这个工具给的数字就没一句能信。
     * 现在按（版式 × 行 × 段）固定播种，每一格都是可复现的。*/
    var layNo = {};
    PV.parts('layout').forEach(function (d, i) { layNo[d.key] = i; });
    /* 一轮扫描 = 一个字体下的全部（版式 × 行 × 段）格子。
     * 字体是真实变量（同一格子宋体比黑体宽），钉死字体换来的「0 溢出」不算答案，
     * 所以 opts.eachFace 能把 12 套字体各扫一遍。 */
    function pass(PINFACE) {
      var F = PINFACE === 'hei' ? '' : ' @' + PINFACE;
      for (var li = 0; li < lines.length; li++) {
        var cuts = PV.splitLine(lines[li], li) || [];
        if (!cuts.length && (lines[li].text || '').trim()) out.空段.push(li + ':' + lines[li].text.slice(0, 10));
        for (var ci = 0; ci < cuts.length; ci++) {
          var avail = cuts[ci].t1 - cuts[ci].t0;
          PV.parts('layout').forEach(function (lay) {
            if (lay.sp) return;
            /* 体检是强制每套版式吃每一行，但 fit() 本来就会拒掉一部分组合
             * （比如 22 字塞竖写）——那些在真实配牌里抽不到，报出来是假问题。
             * 先按 fit 筛一遍，只量可达的组合。 */
            var probe = PV.makeCtx(li, cuts[ci].text);
            probe.tokens = cuts[ci].tokens; probe.cutN = cuts.length; probe.cutI = ci;
            probe.t0 = cuts[ci].t0; probe.t1 = cuts[ci].t1;
            probe.ltr = PV.hasLatin(cuts[ci].text);
            if (lay.pre) lay.pre(probe);
            if (lay.fit && !lay.fit(probe)) { skipped++; return; }
            var p = null;
            var sd = 90000 + li * 419 + ci * 31 + (layNo[lay.key] || 0);
            PV.seed(sd);
            try {
              p = PV.show(li, {
                force: true, keepCuts: true, cutI: ci, layout: lay.key,
                bg: 'solid', look: 'none', face: PINFACE,
                enter: 'none', hold: 'none', exit: 'none', transition: 'cut', camera: 'none',
                decor: [], treatment: []
              });
            } catch (e) {
              out.溢出.push(lay.key + '@' + li + ' 抛错 ' + e.message + ' [seed ' + sd + ']' + F); return;
            }
            if (!p) return;
            var stage = PV.stage();
            if (!stage) return;
            box = stage.getBoundingClientRect();
            var toks = p.ctx.tokensEls || [];
            /* 量「所有可见行」而不只量当前行：前后幽灵行也在台上，
             * 上一轮就是幽灵行因为版式重写了 position 而排到舞台外，体检完全没看到。*/
            var lnav = PV.layer() ? PV.layer().querySelectorAll('.jv-line:not(.jv-out) .jv-t') : [];
            if (lnav.length) toks = Array.prototype.slice.call(lnav).filter(function (el) {
              if (!el.isConnected) return false;
              var q = el.getBoundingClientRect();
              return q.width || q.height;
            });
            if (!toks.length && lay.key !== 'ring' && lay.key !== 'interlude') {
              out.空段.push(lay.key + '@' + li + ' 无 token'); return;
            }
            var worst = 0, first = null;
            toks.forEach(function (el) {
              if (!rectIn(el, box)) {
                var a = overArea(el, box);
                if (a > worst) { worst = a; first = el.textContent; }
              }
            });
            if (worst > 40) out.溢出.push(lay.key + '@' + li + '「' + (first || '') + '」溢出 ' + worst + 'px² [seed ' + sd + ']' + F);
            /* 贴边：任何 token 距边界 < 6px 记一笔，攒久了画面很挤 */
            var tight = 0;
            toks.forEach(function (el) {
              var r = el.getBoundingClientRect();
              if (r.left - box.left < 6 || box.right - r.right < 6) tight++;
            });
            if (tight && tight >= Math.min(4, toks.length)) out.边缘挤压.push(lay.key + '@' + li + ' 贴边 ' + tight + ' 字 [seed ' + sd + ']' + F);

            /* 入场跑不完本段：拿基准登场件（升起）重算一次配牌（不碰 DOM），
             * 看引擎把 stagger 收完之后还有多长——收不下的才是真问题。 */
            var tp = PV.planLine(li, {
              keepCuts: true, cutI: ci, layout: lay.key, face: PINFACE, look: 'none', bg: 'solid',
              enter: 'rise', hold: 'none', exit: 'none', transition: 'cut', camera: 'none',
              decor: [], treatment: []
            });
            var cost = tp ? enterCost(tp.enter, tp.ctx) : 0;
            if (cost > avail * 0.9) {
              out.入场超时.push(lay.key + '@' + li + ' 入场 ' + Math.round(cost) + 'ms，本段 ' + Math.round(avail) + 'ms（阈值 90%）[seed ' + sd + ']' + F);
            }
          });
        }
      }
    }
    try {
      if (opts.eachFace) PV.parts('face').forEach(function (f) { pass(f.key); });
      else pass(opts.face || 'hei');
    } finally {
      PV.faceManual = saved.manual;
      if (saved.style && PV.useStyle) PV.useStyle(saved.style);
      /* 先恢复气氛（setMood 会把 fx 刷成该气氛的预设），再把 fx 精确贴回体检前的值 */
      if (saved.mood) PV.setMood(saved.mood);
      Object.assign(PV.fx, saved.fx);
      PV.setLyrics(L);
      if (keepIdx >= 0) PV.show(keepIdx, { force: true });
    }
    out.跳过 = skipped;
    out.可达组合 = out.可达组合 || (21 - 2) * lines.length;
    if (opts.quiet) {
      return {
        溢出: out.溢出.length, 入场超时: out.入场超时.length,
        空段: out.空段.length, 边缘挤压: out.边缘挤压.length
      };
    }
    return out;
  };
})();
