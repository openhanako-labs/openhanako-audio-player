/* PV 引擎 · 13 歌词语法层
 * JIZURA 那套行内记号，播放器里同样吃：
 *   今夜/我还在这里    → 分 cut（12-cuts 做）
 *   *透明*             → 强调：该段优先抽冲击型版式、装饰加权
 *   行末 !             → 闪：入场更狠、允许白闪
 *   歌词|注釈          → 注釈：小号副文本，交给 decor/note 件
 *
 * 记号不单独跑一遍「先剥后配」的解析——那样会丢掉位置信息，
 * 到底是哪一段被强调就查不回来了。所以 * 与 ! 留在 token 流里，
 * 由 12-cuts 分段时顺手带上 cut.emph / cut.flash 标记；
 * 这里只管两件事：把 `|` 之后的注釈摘出来（行级），以及给出判定用的正则。
 */
(function () {
  'use strict';
  var PV = window.PV;

  PV.MARK = { star: '*', bang: '!' };

  /* 行级：摘注釈。返回 {text, note}，text 里保留 * 与 ! 交给分段 */
  PV.splitNote = function (raw) {
    var s = raw || '';
    var i = s.indexOf('|');
    if (i < 0) return { text: s, note: '' };
    return { text: s.slice(0, i), note: s.slice(i + 1).trim() };
  };

  /* token 级：这一段里有 * 就算强调（成对与否都认，写歌词的人经常只打一半） */
  PV.markFlags = function (tokens) {
    var emph = 0, flash = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i] === PV.MARK.star) emph = 1;
      else if (tokens[i] === PV.MARK.bang) flash = 1;
    }
    return { emph: emph, flash: flash };
  };

  /* 渲染前清掉记号字符：记号只表达意图，不该出现在画面上 */
  PV.cleanTokens = function (tokens) {
    return tokens.filter(function (t) { return t !== PV.MARK.star && t !== PV.MARK.bang; });
  };

  /* 给「邻行文本」用：前后行、ghost、注釈外的地方显示的是原始行，
   * 不加这一步会把 / * ! | 这些记号直接印到画面上（实测连行版式的前行就泄露了） */
  PV.plain = function (raw) {
    var s = (raw || '').split('|')[0];
    return s.replace(/[\/*!]/g, '').replace(/\s+/g, ' ').trim();
  };
})();
