/**
 * hanako-audio-player/tools/test-track-ref.js
 *
 * AUDIO-13 测试套件 — 覆盖 TrackRef 接口、迁移脚本、三种来源适配器
 *
 * 运行方式: node test-track-ref.js
 */

import {
  createTrackRef,
  migrateToTrackRef,
  migratePlaylist,
  LocalSourceAdapter,
  SearchSourceAdapter,
  TTSSourceAdapter,
  filterByGroups,
  getGroupLabels,
  isValidTrack,
  isSameTrack,
  SOURCE,
  SCHEMA,
} from "./track-ref.js";

// ═══════════════════════════════════════════════════════════
// 测试框架（极简，零依赖）
// ═══════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, msg) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ ${msg}`);
  }
}

function assertThrows(fn, msg) {
  total++;
  try {
    fn();
    console.error(`  ❌ ${msg} (should have thrown)`);
    failed++;
  } catch (e) {
    passed++;
    console.log(`  ✅ ${msg}`);
  }
}

// ═══════════════════════════════════════════════════════════
// 1. TrackRef 创建测试
// ═══════════════════════════════════════════════════════════

console.log("\n📦 1. TrackRef 创建测试");
console.log("─".repeat(50));

{
  // 1.1 基本创建
  const track = createTrackRef({
    id: "test_001",
    source: SOURCE.LOCAL,
    title: "Test Song",
    streamUrl: "/media/test.mp3",
    groupIds: ["本地音乐"],
  });
  assert(track.id === "test_001", "id 正确");
  assert(track.source === SOURCE.LOCAL, "source 正确");
  assert(track.title === "Test Song", "title 正确");
  assert(track.streamUrl === "/media/test.mp3", "streamUrl 正确");
  assert(Array.isArray(track.groupIds), "groupIds 是数组");
  assert(track.groupIds[0] === "本地音乐", "groupIds[0] 正确");
  assert(track.artist === "", "artist 默认空字符串");
  assert(track.album === "", "album 默认空字符串");
  assert(track.duration === 0, "duration 默认 0");
  assert(track.cover === "", "cover 默认空字符串");
  assert(track.lrcUrl === "", "lrcUrl 默认空字符串");
  assert(typeof track.meta === "object", "meta 是对象");
  assert(typeof track.createdAt === "number", "createdAt 是时间戳");
}

{
  // 1.2 完整字段
  const full = createTrackRef({
    id: "test_002",
    source: SOURCE.SEARCH,
    title: "Full Track",
    artist: "Artist A",
    album: "Album B",
    duration: 245,
    cover: "https://example.com/cover.jpg",
    lrcUrl: "https://example.com/lrc.lrc",
    streamUrl: "https://stream.example.com/track.mp3",
    groupIds: ["在线音乐", "流行"],
    meta: { searchServer: "netease" },
  });
  assert(full.artist === "Artist A", "artist 完整");
  assert(full.album === "Album B", "album 完整");
  assert(full.duration === 245, "duration 完整");
  assert(full.cover === "https://example.com/cover.jpg", "cover 完整");
  assert(full.lrcUrl === "https://example.com/lrc.lrc", "lrcUrl 完整");
  assert(full.streamUrl === "https://stream.example.com/track.mp3", "streamUrl 完整");
  assert(full.groupIds.length === 2, "groupIds 多分组");
  assert(full.meta.searchServer === "netease", "meta 保留来源特有字段");
}

{
  // 1.3 必填字段校验
  assertThrows(() => createTrackRef({}), "缺少所有必填字段 → 抛错");
  assertThrows(() => createTrackRef({ id: "x" }), "缺少 source → 抛错");
  assertThrows(() => createTrackRef({ id: "x", source: "local" }), "缺少 title → 抛错");
}

{
  // 1.4 groupIds 字符串自动转数组
  const single = createTrackRef({
    id: "test_003",
    source: SOURCE.LOCAL,
    title: "Single Group",
    streamUrl: "/media/s.mp3",
    groupIds: "本地音乐",
  });
  assert(Array.isArray(single.groupIds), "groupIds 字符串转为数组");
  assert(single.groupIds.length === 1, "groupIds 长度 1");
}

// ═══════════════════════════════════════════════════════════
// 2. 迁移脚本测试
// ═══════════════════════════════════════════════════════════

console.log("\n🔄 2. 迁移脚本测试");
console.log("─".repeat(50));

{
  // 2.1 bus.js _normalize 产物迁移
  const busItem = {
    type: "play",
    url: "https://example.com/song.mp3",
    name: "Bus Song",
    mode: "在线",
    dur: 180,
    group: "在线音乐",
    lrcUrl: "https://example.com/bus.lrc",
    pic: "https://example.com/bus-cover.jpg",
  };
  const migrated = migrateToTrackRef(busItem);
  assert(migrated.id.startsWith("migrated_"), "bus 产物迁移后 ID 格式正确");
  assert(migrated.source === SOURCE.SEARCH, "bus 产物 source 为 search");
  assert(migrated.title === "Bus Song", "title 正确");
  assert(migrated.streamUrl === "https://example.com/song.mp3", "streamUrl 映射正确");
  assert(migrated.duration === 180, "duration 映射正确");
  assert(migrated.cover === "https://example.com/bus-cover.jpg", "cover 映射正确");
  assert(migrated.lrcUrl === "https://example.com/bus.lrc", "lrcUrl 映射正确");
  assert(migrated.groupIds[0] === "在线音乐", "groupIds 映射正确");
  assert(migrated.meta.rawMode === "在线", "meta 保留原始 mode");
}

{
  // 2.2 前端 playlist JSON 迁移
  const playlistItem = {
    name: "Playlist Song",
    url: "/api/media/song.mp3",
    mode: "本地",
    dur: 210,
    group: "本地音乐",
  };
  const pm = migrateToTrackRef(playlistItem);
  assert(pm.source === SOURCE.LOCAL, "本地 playlist source 为 local");
  assert(pm.title === "Playlist Song", "title 正确");
  assert(pm.streamUrl === "/api/media/song.mp3", "streamUrl 正确");
  assert(pm.duration === 210, "dur → duration 映射正确");
}

{
  // 2.3 搜索 API 结果迁移
  const searchResult = {
    title: "Search Song",
    author: "Search Artist",
    album: "Search Album",
    duration: 300,
    url: "https://search.example.com/stream.mp3",
    pic: "https://search.example.com/pic.jpg",
    lrc: "https://search.example.com/lrc.lrc",
    searchKey: "search song",
    searchServer: "netease",
  };
  const sm = migrateToTrackRef(searchResult);
  assert(sm.source === SOURCE.SEARCH, "搜索源 source 为 search");
  assert(sm.artist === "Search Artist", "author → artist 映射");
  assert(sm.album === "Search Album", "album 映射");
  assert(sm.meta.searchServer === "netease", "meta.searchServer 保留");
  assert(sm.meta.searchKey === "search song", "meta.searchKey 保留");
}

{
  // 2.4 TTS 产物迁移
  const ttsItem = {
    type: "play",
    url: "/api/media/tts_task.wav",
    name: "合成语音片段",
    mode: "TTS",
    _origin: { type: "say", text: "你好世界", spk: "my_voice" },
  };
  const tm = migrateToTrackRef(ttsItem);
  assert(tm.source === SOURCE.TTS, "TTS 产物 source 为 tts");
  assert(tm.groupIds.includes("TTS/语音"), "TTS 分组正确");
  assert(tm.meta.origin.text === "你好世界", "meta.origin 保留原始 say 数据");
}

{
  // 2.5 批量迁移
  const tracks = [
    { name: "A", url: "/a.mp3", mode: "本地" },
    { name: "B", url: "http://b.mp3", mode: "在线", searchKey: "b" },
    { name: "C", url: "/c.wav", mode: "TTS", _origin: {} },
  ];
  const migratedBatch = migratePlaylist(tracks);
  assert(migratedBatch.length === 3, "批量迁移数量正确");
  assert(migratedBatch[0].source === SOURCE.LOCAL, "第1个 local");
  assert(migratedBatch[1].source === SOURCE.SEARCH, "第2个 search");
  assert(migratedBatch[2].source === SOURCE.TTS, "第3个 tts");
}

// ═══════════════════════════════════════════════════════════
// 3. 来源适配器测试
// ═══════════════════════════════════════════════════════════

console.log("\n🔌 3. 来源适配器测试");
console.log("─".repeat(50));

// 声明在块外以便所有适配器测试共用
const localAdapter = new LocalSourceAdapter({ pluginId: "hanako-audio-player" });
const searchAdapter = new SearchSourceAdapter({ pluginId: "hanako-audio-player" });
const ttsAdapter = new TTSSourceAdapter({});

{
  // 3.1 本地文件适配器
  const fileInfo = {
    name: "sample.mp3",
    url: "/api/plugins/hanako-audio-player/widget/media/sample.mp3",
    size: 3456789,
    mtime: "2026-07-17T10:00:00.000Z",
    filePath: "/home/media/sample.mp3",
  };
  const localTrack = localAdapter.adapt(fileInfo);
  assert(localTrack.source === SOURCE.LOCAL, "本地适配器 source");
  assert(localTrack.title === "sample", "标题去掉扩展名");
  assert(localTrack.streamUrl === fileInfo.url, "streamUrl 正确");
  assert(localTrack.groupIds[0] === "本地音乐", "本地分组");
  assert(localTrack.meta.size === 3456789, "meta.size 保留文件大小");
  assert(localTrack.meta.filePath === fileInfo.filePath, "meta.filePath 保留路径");
}

{
  // 3.2 在线搜索适配器 — 网易云
  const neteaseResult = {
    id: "418608185",
    title: "晴天",
    author: "周杰伦",
    album: "叶惠美",
    duration: 269,
    pic: "https://p1.music.126.net/xxx.jpg",
    url: "https://music.163.com/song/media/outer/url?id=418608185.mp3",
    lrc: "https://music.163.com/api/song/lyric?id=418608185&lv=1&kv=1&tv=-1",
    group: "华语流行",
  };
  const searchTrack = searchAdapter.adapt(neteaseResult, "netease");
  assert(searchTrack.source === SOURCE.SEARCH, "搜索适配器 source");
  assert(searchTrack.title === "晴天", "标题正确");
  assert(searchTrack.artist === "周杰伦", "作者正确");
  assert(searchTrack.album === "叶惠美", "专辑正确");
  assert(searchTrack.duration === 269, "时长正确");
  assert(searchTrack.meta.searchServer === "netease", "meta.searchServer 正确");
  assert(searchTrack.groupIds[0] === "华语流行", "分组正确");
}

{
  // 3.3 在线搜索适配器 — 腾讯
  const tencentResult = {
    id: "003W2vYr2Yy0Ug",
    title: "起风了",
    author: "买辣椒也用券",
    album: "起风了",
    duration: 325,
    pic: "https://y.qq.com/music/photo/new/T002R800x800.jpg",
    url: "https://isure.stream.qqmusic.qq.com/M500002W2vYr.m4a",
    lrc: "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric.fcg",
    group: "网络歌曲",
  };
  const tcTrack = searchAdapter.adapt(tencentResult, "tencent");
  assert(tcTrack.source === SOURCE.SEARCH, "搜索适配器 source");
  assert(tcTrack.artist === "买辣椒也用券", "腾讯源作者正确");
  assert(tcTrack.meta.searchServer === "tencent", "meta.searchServer 正确");
}

{
  // 3.4 TTS 适配器 — CosyVoice
  const ttsResult = {
    ok: true,
    layer: "cosyvoice",
    url: "/api/plugins/hanako-audio-player/widget/media/tts_a1b2c3d4.wav",
    filename: "tts_a1b2c3d4.wav",
    taskId: "a1b2c3d4",
    text: "欢迎来到光圈科学，测试员。我是 GLaDOS，你的引导人工智能。",
    spk: "my_voice",
    instruct: "温柔",
    translate: "Welcome to Aperture Science, test subject. I am GLaDOS, your guiding AI.",
  };
  const ttsTrack = ttsAdapter.adapt(ttsResult);
  assert(ttsTrack.source === SOURCE.TTS, "TTS 适配器 source");
  assert(ttsTrack.title.includes("欢迎来到光圈科学"), "TTS 标题截断正确");
  assert(ttsTrack.artist === "my_voice", "TTS spk → artist");
  assert(ttsTrack.groupIds && Array.isArray(ttsTrack.groupIds), `TTS groupIds 是数组: ${JSON.stringify(ttsTrack.groupIds)}`);
  assert(ttsTrack.groupIds[0] === "TTS/语音", `TTS 分组正确 (got: ${JSON.stringify(ttsTrack.groupIds)})`);
  assert(ttsTrack.meta.ttsLayer === "cosyvoice", "meta.ttsLayer 正确");
  assert(ttsTrack.meta.taskId === "a1b2c3d4", "meta.taskId 正确");
  assert(ttsTrack.meta.fullText === ttsResult.text, "meta.fullText 保留完整文本");
  assert(ttsTrack.meta.translate === ttsResult.translate, "meta.translate 保留翻译");
}

{
  // 3.5 TTS 适配器 — 浏览器原生
  const browserTts = {
    ok: true,
    layer: "browser",
    kind: "browser-native",
    text: "This is browser native TTS",
    spk: "default",
  };
  const btTrack = ttsAdapter.adapt(browserTts);
  assert(btTrack.source === SOURCE.TTS, "浏览器 TTS source");
  assert(btTrack.meta.kind === "browser-native", "meta.kind 标记浏览器原生");
}

{
  // 3.6 批量适配
  const files = [
    { name: "a.mp3", url: "/a.mp3" },
    { name: "b.mp3", url: "/b.mp3" },
  ];
  const localBatch = localAdapter.adaptBatch(files);
  assert(localBatch.length === 2, "本地批量适配数量");
  assert(localBatch.every(t => t.source === SOURCE.LOCAL), "全部为本地来源");
}

// ═══════════════════════════════════════════════════════════
// 4. 工具函数测试
// ═══════════════════════════════════════════════════════════

console.log("\n🛠️ 4. 工具函数测试");
console.log("─".repeat(50));

// 创建测试数据（在块外以便所有子测试共用）
const tracks = [
  createTrackRef({ id: "1", source: SOURCE.LOCAL, title: "A", streamUrl: "/a.mp3", groupIds: ["本地音乐"] }),
  createTrackRef({ id: "2", source: SOURCE.SEARCH, title: "B", streamUrl: "/b.mp3", groupIds: ["在线音乐"] }),
  createTrackRef({ id: "3", source: SOURCE.TTS, title: "C", streamUrl: "/c.mp3", groupIds: ["TTS/语音"] }),
  createTrackRef({ id: "4", source: SOURCE.SEARCH, title: "D", streamUrl: "/d.mp3", groupIds: ["在线音乐", "流行"] }),
];

{
  // 4.1 filterByGroups
  const filtered = filterByGroups(tracks, ["在线音乐"]);
  assert(filtered.length === 2, "filterByGroups 过滤出2条在线音乐");
  assert(filtered[0].title === "B", "第一条是 B");
  assert(filtered[1].title === "D", "第二条是 D");
}

{
  // 4.2 filterByGroups 多组匹配
  const multiFiltered = filterByGroups(tracks, ["在线音乐", "TTS/语音"]);
  assert(multiFiltered.length === 3, "多组过滤出3条");
}

{
  // 4.3 filterByGroups 空条件返回全部
  const allFiltered = filterByGroups(tracks, []);
  assert(allFiltered.length === 4, "空分组返回全部");
}

{
  // 4.4 getGroupLabels
  const track = createTrackRef({
    id: "gl",
    source: SOURCE.SEARCH,
    title: "Multi Group",
    streamUrl: "/mg.mp3",
    groupIds: ["在线音乐", "华语", "流行"],
  });
  assert(getGroupLabels(track) === "在线音乐,华语,流行", "多组标签拼接正确");
}

{
  // 4.5 isValidTrack
  const valid = createTrackRef({ id: "v", source: SOURCE.LOCAL, title: "V", streamUrl: "/v.mp3" });
  const invalidNoUrl = createTrackRef({ id: "inv", source: SOURCE.LOCAL, title: "Inv", streamUrl: "" });
  const ttsInvalid = createTrackRef({ id: "tts-inv", source: SOURCE.TTS, title: "TTS", streamUrl: "/tts.mp3" });
  assert(isValidTrack(valid) === true, "有效曲目");
  assert(isValidTrack(invalidNoUrl) === false, "无流地址无效");
  assert(isValidTrack(ttsInvalid) === false, "TTS 不视为有效播放曲目");
}

{
  // 4.6 isSameTrack
  const t1 = createTrackRef({ id: "s1", source: SOURCE.SEARCH, title: "晴天", streamUrl: "http://example.com/s.mp3?token=abc" });
  const t2 = createTrackRef({ id: "s2", source: SOURCE.SEARCH, title: "晴天", streamUrl: "http://example.com/s.mp3?token=xyz" });
  const t3 = createTrackRef({ id: "s3", source: SOURCE.SEARCH, title: "稻香", streamUrl: "http://example.com/r.mp3" });
  assert(isSameTrack(t1, t2) === true, "同 URL 不同 token 视为同一曲目");
  assert(isSameTrack(t1, t3) === false, "不同曲目");
  assert(isSameTrack(null, t1) === false, "null 比较返回 false");
  assert(isSameTrack(t1, null) === false, "null 比较返回 false");
}

// ═══════════════════════════════════════════════════════════
// 5. JSON Schema 验证
// ═══════════════════════════════════════════════════════════

console.log("\n📋 5. JSON Schema 验证");
console.log("─".repeat(50));

{
  // 5.1 Schema 结构检查
  assert(SCHEMA.$schema === "http://json-schema.org/draft-07/schema#", "Schema 版本正确");
  assert(SCHEMA.title === "TrackRef", "Schema 标题正确");
  assert(Array.isArray(SCHEMA.required), "required 是数组");
  assert(SCHEMA.required.includes("id"), "id 在 required 中");
  assert(SCHEMA.required.includes("source"), "source 在 required 中");
  assert(SCHEMA.required.includes("title"), "title 在 required 中");
  assert(SCHEMA.required.includes("streamUrl"), "streamUrl 在 required 中");
  assert(SCHEMA.required.includes("groupIds"), "groupIds 在 required 中");
}

{
  // 5.2 source 枚举值
  assert(SCHEMA.properties.source.enum.includes(SOURCE.LOCAL), "source 包含 local");
  assert(SCHEMA.properties.source.enum.includes(SOURCE.SEARCH), "source 包含 search");
  assert(SCHEMA.properties.source.enum.includes(SOURCE.TTS), "source 包含 tts");
}

{
  // 5.3 额外属性禁止
  assert(SCHEMA.additionalProperties === false, "additionalProperties 为 false");
}

// ═══════════════════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════════════════

console.log("\n" + "═".repeat(50));
console.log(`测试结果: ${passed}/${total} 通过, ${failed} 失败`);
if (failed > 0) {
  console.error(`\n⚠️ ${failed} 项测试未通过`);
  process.exit(1);
} else {
  console.log("\n✅ 全部测试通过！AUDIO-13 模型就绪。");
}
