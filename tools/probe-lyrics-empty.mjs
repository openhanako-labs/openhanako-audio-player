#!/usr/bin/env node
/**
 * tools/probe-lyrics-empty.mjs — 查「空歌词容器为什么没被 :empty 规则隐藏」
 *
 * 怀疑点：
 *   1) :empty 不成立 —— 容器里其实有空白文本节点或占位元素
 *   2) :has() 不成立 —— 里面确实没有 .lyric-line，但前一条 :empty 也不成立
 *   3) 规则被更高特异性覆盖
 * 用 computedStyle + 直接读 childNodes 判断，不猜。
 *
 * 用法：node tools/probe-lyrics-empty.mjs --w 420 --h 700
 */

const CDP = 'http://127.0.0.1:9222';
const PORT = Number(process.env.PROBE_PORT || 8778);
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const W = Number(arg('w', 420));
const H = Number(arg('h', 700));

const MEASURE = `
(function () {
  var sec = document.querySelector('.lyrics-section');
  if (!sec) return { error: 'no .lyrics-section' };

  var nodes = [];
  for (var i = 0; i < sec.childNodes.length; i++) {
    var n = sec.childNodes[i];
    nodes.push({
      type: n.nodeType,
      name: n.nodeName,
      // 文本节点的内容（转义可见）
      data: n.nodeType === 3 ? JSON.stringify(n.data) : null,
      cls: n.nodeType === 1 && typeof n.className === 'string' ? n.className : null,
    });
  }

  var cs = getComputedStyle(sec);
  var r = sec.getBoundingClientRect();

  return {
    childNodeCount: sec.childNodes.length,
    elementChildCount: sec.children.length,
    nodes: nodes,
    matchesEmpty: sec.matches(':empty'),
    matchesHasLine: sec.matches(':has(.lyric-line)'),
    lyricLineCount: sec.querySelectorAll('.lyric-line').length,
    computed: {
      display: cs.display,
      width: cs.width,
      flex: cs.flex,
      minWidth: cs.minWidth,
    },
    rect: { w: Math.round(r.width), h: Math.round(r.height) },
    // 谁赢了这个属性（Chrome 支持获取匹配规则）
    displayRules: (function () {
      try {
        var out = [];
        for (var s = 0; s < document.styleSheets.length; s++) {
          var sheet = document.styleSheets[s];
          var rules;
          try { rules = sheet.cssRules; } catch (e) { continue; }
          for (var j = 0; j < rules.length; j++) {
            var rule = rules[j];
            if (!rule.selectorText || !rule.style) continue;
            if (rule.style.display === 'none' && rule.selectorText.indexOf('lyrics-section') >= 0) {
              out.push({ sel: rule.selectorText, display: rule.style.display });
            }
          }
        }
        return out;
      } catch (e) { return [{ err: String(e) }]; }
    })(),
  };
})();
`;

const main = async () => {
  const r = await fetch(CDP + '/json/version');
  const ws = new WebSocket((await r.json()).webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id && pend.has(m.id)) {
      const { resolve, reject } = pend.get(m.id); pend.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id; pend.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);

  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/ui/standalone.html` });
  await new Promise((x) => setTimeout(x, 2600));

  const out = (await S('Runtime.evaluate', { expression: MEASURE, returnByValue: true })).result?.value;
  await send('Target.closeTarget', { targetId });
  ws.close();
  console.log(JSON.stringify({ size: `${W}x${H}`, ...out }, null, 2));
};

main().catch((e) => { console.error(e); process.exit(1); });
