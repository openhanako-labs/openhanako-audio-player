# 归档：一次性补丁脚本（已落地，不再执行）

这里放的是 `ui/index.html` 的历史变更记录。**不要运行它们**——它们的锚点早被自己消费掉了，
重跑要么抛「命中 0 次」，要么把同一段 CSS/JS 再注一遍变成双份。

复核办法（不靠信任，靠比对）：

```
node tools/audit-patches.mjs          # 逐个脚本给结论
node tools/audit-patches.mjs --json   # 额外写 tools/patches-audit.json
```

账本把每个锚点分成这几类：

| 结论 | 含义 |
|---|---|
| `applied` | NEW 在页面里、OLD 不在 → 已落地 |
| `injected` | 纯插入块，页面里出现 1 次 → 已落地（重跑会变双份） |
| `wrap-ok` / `self-chain-ok` | OLD 是 NEW 的子串，或同脚本后面另一步又把节点插回来 → 字面必然"并存"，属正常 |
| `applied-drift` | NEW 首行还在、整块对不上 → 落地后函数体被后续改动改过 |
| `anchor-weak` | 锚点太短（<40 字，数组项前缀），不足以判断 |
| `superseded` | 钉的是旧 JIZURA 引擎，`pv/` 迁移时整块删掉了 → 作废 |
| `overwritten-by:<file>` | 被链上更后面的补丁改写 → 链式正常结果 |
| `block-drift` | 插入块整体对不上（多半也是被 pv/ 或后续手改取代） |
| `replayable` | OLD 在、NEW 不在，且上面都套不上 → **真没落地，需要处理** |
| `missing` / `both` / `duplicated` | 解释不了 → 要人看 |

2026-10-02 清点结果：**已落地 58、仍可重放 0、要人看 0**。

## 那现在改核心 UI（非 PV 部分）怎么办

直接改 `ui/index.html`（与 `ui/standalone.html` 保持同步），然后 `node tools/bump-build.mjs`。
git 历史就是变更记录，不需要再造一套"可重放的注入脚本"。

文字 PV 是例外：它有源码目录和幂等构建，改 `pv/src`、`pv/css` 后跑 `node pv/build.mjs`，
`ui/*.html` 里 `PV:BEGIN/END` 之间的内容是产物，别手改。
