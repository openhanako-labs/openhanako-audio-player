# 市场发布流程（可复用 · 复制到任意 Hana 扩展仓库）

> 面向：要把 App / Skill / Recipe / Connector 登记或更新到 **liliMozi/hana-marketplace** 的仓库。
> 本文件是通用流程；仓库自带脚本名可能不同，按注释替换即可。

---

## 0. 一句话流程

```
改 manifest.version
  → push v<版本> tag（CI 自动出 Release）
  → 生成本仓的「市场包」app-<id>-<version>.zip + .entry.json
  → 上传到该 Release
  → fork 市场仓、改 approvals.json 的 tag+sha256、提 PR
  → 维护者合并后才真正生效
```

市场**不会**自动发现新版本，也**不会**自动发版——每次更新都必须走一次 PR。

---

## 1. 关键规则（踩过才知道）

| 规则 | 说明 |
|---|---|
| **只认 approvals.json 的 tag** | 市场不取 latest Release。登记哪个 tag，就发哪个 tag 的附件。 |
| **Release 必须正式稳定版** | 不能是 draft / pre-release。tag 字符限 `字母数字 . _ + -`。 |
| **三方哈希一致** | `entry.archive.sha256` == 实际 zip 的 sha256 == `approvals.json` 里登记的 sha256。三者任一不同 → 安装失败。 |
| **不校验 zip 内部结构** | 市场只按 sha256/size 校验，不检查压缩包层级。但自身构建应保证「顶层一层目录 = manifest.id」以免宿主装不上。 |
| **一次 PR 只改登记信息** | 不上传源码或安装包；只在 `approvals.json` 改 `tag`（+必要时 `registry.json` 改仓库/publisher）。 |
| **改了 Release 附件也不影响已发布版本** | 客户端按已批准的 sha256 校验，附件与批准值不符会装失败。 |
| **新增授权要写在 PR 描述里** | `capabilities` / `network.allowedHosts` 有变化时，PR 里单独说明，维护者会重点看。 |

---

## 2. 具体步骤

### 2.1 版本号 + tag
```bash
# manifest.json / package.json 里的 version 改成新版本（如 0.11.0）
git add -A && git commit -m "release: v0.11.0"
git push origin master
git tag -a v0.11.0 -m "v0.11.0"
git push origin v0.11.0        # 触发 CI（若仓库有 package.yml）
```

> 若仓库有 `.github/workflows/package.yml`：push tag 会**自动**出 Release + 打包 zip。
> 没有 CI 的仓库，需要自己 `gh release create`。

### 2.2 生成市场包（本步是市场独有的，必须做）
市场要的两个附件**不是** CI 产物，要另出：
- `app-<id>-<version>.zip`：可安装包
- `app-<id>-<version>.entry.json`：元数据，含 `archive.{url,sha256,size}`

本仓有 `tools/pack-market.mjs` 直接生成（见该文件头注释）；等价实现见本文件 §4。

### 2.3 上传附件到 Release
```bash
gh release upload v0.11.0 \
  "dist/market/app-<id>-0.11.0.zip" \
  "dist/market/app-<id>-0.11.0.entry.json" \
  --repo <owner>/<repo> --clobber
```

### 2.4 提市场 PR
```bash
# fork：gh repo fork liliMozi/hana-marketplace --clone=false
git clone https://github.com/<you>/hana-marketplace.git && cd hana-marketplace
git remote add upstream https://github.com/liliMozi/hana-marketplace.git
git fetch upstream main
git checkout -B update/<id>-<version> upstream/main

# 改 approvals.json：找到 id 对应的条目，改 tag 与 sha256
# （jq / Node 都行；注意保留原文件的 CRLF 与缩进风格，减少 diff 噪音）
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('approvals.json','utf8'));const a=j.approvals.find(x=>x.id==='<id>');a.tag='v0.11.0';a.sha256='<新sha256>';let o=JSON.stringify(j,null,2).replace(/\n/g,'\r\n')+'\r\n';fs.writeFileSync('approvals.json',o);"

git add approvals.json
git commit -m "update <id> to v0.11.0"
git push -u origin update/<id>-<version>

gh pr create --repo liliMozi/hana-marketplace --base main \
  --head <you>:update/<id>-<version> \
  --title "update: <id> v0.11.0" --body "…见下节模板…"
```

---

## 3. PR 描述模板

```md
## 更新：<id> v<old> → v<new>
**仓库 / publisher**：<owner>/<repo> / <publisher>

### approvals.json 改动
- tag: `v<old>` → `v<new>`
- sha256: `<old前8位>…` → `<new完整>`

### Release 附件（均已在 v<new> Release，正式版）
- `app-<id>-<new>.zip`（<size> 字节，sha256 与上一致）
- `app-<id>-<new>.entry.json`

### 变化说明
（主要功能/修复；若含 breaking change 单列）

**权限变化**：无 / 新增 <列明 capability 或 allowedHosts>

### 测试结果
- <命令> 全绿；zip 由 <打包脚本> 生成
- 手工实测：<关键路径>
```

---

## 4. entry.json 生成的最小实现（无自带脚本时）

```js
// gen-entry.mjs —— 放在仓库根，node gen-entry.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';

const man = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const id = man.id, ver = man.version;
const zipName = `app-${id}-${ver}.zip`;          // 改名后的 zip 放 dist/market/
const buf = fs.readFileSync(`dist/market/${zipName}`);
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

const entry = {
  kind: 'app',                                    // skill/recipe 同理，kind 换成对应值
  id, name: man.name,
  publisher: '<你的署名>',
  description: man.description,
  version: ver,
  permissions: (man.capabilities || []).map((c) => ({ capability: c })),
  compatibility: { minAppVersion: man.minAppVersion },
  icon: 'data:image/png;base64,' + fs.readFileSync('assets/icon.png').toString('base64'),
  archive: { url: `{{BASE_URL}}/${zipName}`, sha256, size: buf.length, format: 'zip' },
};
fs.writeFileSync(`dist/market/app-${id}-${ver}.entry.json`, JSON.stringify(entry, null, 2) + '\n');
console.log('sha256 =', sha256);                  // 这个值填进 approvals.json
```

> skill / recipe 的 zip 用**内容寻址名** `{kind}-{id}-{64位hex}.zip`，entry 里 version 保留 `0.0.0`。
> App / Connector / Role / Bundle 用 `{kind}-{id}-{version}.zip`。

---

## 5. 排障

| 症状 | 先查 |
|---|---|
| 市场里没出现新版本 | 是否漏了 PR；PR 是否已合并；合并后 Actions 是否成功；approvals.json 是否真有该条 |
| 安装失败 | 三方 sha256 不一致；Release 附件名与 `entry.archive.url` 不符；附件被替换过 |
| 整个批次都没发布 | 发布是**原子**的——任一新包校验失败，整批不更新、旧索引保留。看 Actions 日志定位失败条目 |
| 版本回退 | 版本化扩展不允许降级或替换既有版本的归档 |

---

## 6. 检查清单

- [ ] manifest.version 已升，tag 已 push，Release 为正式版
- [ ] `app-<id>-<ver>.zip` + `.entry.json` 已生成并上传到该 Release
- [ ] entry.archive.sha256 == 实际 zip sha256
- [ ] approvals.json 条目 tag+sha256 已改（保留原格式）
- [ ] PR 描述含：仓库、变化、权限变化、测试结果
- [ ] 无权限变更时也明写「无」
