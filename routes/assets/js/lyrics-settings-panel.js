/**
 * lyrics-settings-panel.js — AUDIO-08 歌词手动修正 UI
 * 
 * 提供模态对话框用于手动修正歌词来源、封面来源和元数据。
 * 三种修正模式：本地文件选择、文本粘贴、URL 指定。
 */

(function () {
  "use strict";

  // ── DOM 引用缓存 ──
  let dialogEl = null;
  let backdropEl = null;
  let currentTrackIdx = -1;
  let currentMode = "local-file"; // local-file | paste-text | specify-url

  // ── 打开歌词设置对话框 ──
  function openLyricsSettings(trackIdx) {
    if (typeof trks === "undefined" || !trks[trackIdx]) return;
    currentTrackIdx = trackIdx;
    const t = trks[trackIdx];

    // 创建对话框
    if (!dialogEl) {
      dialogEl = createDialogDOM();
      document.body.appendChild(dialogEl);
      bindDialogEvents();
    }

    // 填充当前值
    populateForm(t);
    showLyricsPreview(t);
    dialogEl.style.display = "flex";
    try { parent.postMessage({ type: "resize-request", payload: { height: document.body.scrollHeight } }, "*"); } catch (e) {}
  }

  function closeLyricsSettings() {
    if (dialogEl) dialogEl.style.display = "none";
    currentTrackIdx = -1;
  }

  // ── 创建对话框 DOM ──
  function createDialogDOM() {
    const bd = document.createElement("div");
    bd.id = "lyricsSettingsDialog";
    bd.style.cssText = `
      position: fixed; inset: 0; z-index: 9999; display: none;
      align-items: center; justify-content: center;
    `;

    // 遮罩
    const back = document.createElement("div");
    back.className = "ls-backdrop";
    back.style.cssText = `
      position: absolute; inset: 0; background: rgba(0,0,0,0.45);
    `;
    bd.appendChild(back);

    // 内容
    const content = document.createElement("div");
    content.className = "ls-dialog";
    content.style.cssText = `
      position: relative; background: var(--card-bg, #1e1e22);
      border: 1px solid var(--border-strong, rgba(255,255,255,0.14));
      border-radius: 12px; padding: 20px; min-width: 380px; max-width: 500px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.5); color: var(--text, #e4e4e7);
      font-family: inherit; font-size: 13px;
    `;

    content.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-weight:600;font-size:14px">🎵 歌词设置</span>
        <button class="ls-close" title="关闭" style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:16px;padding:4px 8px">&times;</button>
      </div>

      <!-- 歌词来源 -->
      <div class="ls-section" style="margin-bottom:16px">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">歌词来源</div>
        <div class="ls-source-tabs" style="display:flex;gap:4px;margin-bottom:10px">
          <button class="ls-tab active" data-mode="local-file" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-dim);cursor:pointer;font-size:11px;font-family:inherit">本地文件</button>
          <button class="ls-tab" data-mode="paste-text" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-dim);cursor:pointer;font-size:11px;font-family:inherit">粘贴文本</button>
          <button class="ls-tab" data-mode="specify-url" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-dim);cursor:pointer;font-size:11px;font-family:inherit">指定 URL</button>
        </div>

        <!-- 本地文件模式 -->
        <div class="ls-mode-panel ls-mode-local" style="display:block">
          <input type="file" id="lsFileInput" accept=".lrc,.txt,.vtt,.ttml,.json" style="display:none">
          <div style="display:flex;gap:6px">
            <button class="ls-browse-btn" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--accent);background:var(--accent-soft);color:var(--accent);cursor:pointer;font-size:11px;font-family:inherit">浏览文件</button>
            <span id="lsFileName" style="flex:1;font-size:11px;color:var(--text-faint);padding:6px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">未选择文件</span>
          </div>
        </div>

        <!-- 粘贴文本模式 -->
        <div class="ls-mode-panel ls-mode-text" style="display:none">
          <textarea id="lsPasteArea" rows="6" placeholder="粘贴 LRC 歌词内容...&#10;例如：&#10;[00:12.00]Deep Focus&#10;[00:24.00]Ambient beats" style="width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;font-family:inherit;resize:vertical;outline:none"></textarea>
        </div>

        <!-- 指定 URL 模式 -->
        <div class="ls-mode-panel ls-mode-url" style="display:none">
          <div style="display:flex;gap:6px">
            <input id="lsUrlInput" type="text" placeholder="https://example.com/song.lrc" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;font-family:inherit;outline:none">
            <button class="ls-test-btn" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-dim);cursor:pointer;font-size:11px;font-family:inherit">测试</button>
          </div>
          <div id="lsUrlStatus" style="font-size:10px;margin-top:4px;color:var(--text-faint)"></div>
        </div>
      </div>

      <!-- 预览 -->
      <div class="ls-section" style="margin-bottom:16px">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">预览</div>
        <div id="lsPreview" class="ls-preview-area" style="max-height:120px;overflow-y:auto;padding:8px;background:var(--surface);border-radius:6px;font-size:11px;color:var(--text-dim);line-height:1.8">暂无预览</div>
      </div>

      <!-- 封面独立修正 -->
      <div class="ls-section" style="margin-bottom:16px">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">封面来源（可选）</div>
        <select id="lsCoverSource" style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;font-family:inherit;outline:none;margin-bottom:6px">
          <option value="auto">自动（跟随歌词匹配源）</option>
          <option value="online">在线搜索</option>
          <option value="local">本地图片</option>
          <option value="none">不设置</option>
        </select>
        <div id="lsCoverExtra" style="display:none">
          <input id="lsCoverUrlInput" type="text" placeholder="封面图片 URL" style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;font-family:inherit;outline:none">
        </div>
      </div>

      <!-- 底部按钮 -->
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="ls-cancel" style="padding:6px 16px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-dim);cursor:pointer;font-size:12px;font-family:inherit">取消</button>
        <button class="ls-save" style="padding:6px 16px;border-radius:6px;border:none;background:linear-gradient(135deg,var(--accent),#c48454);color:#fff;cursor:pointer;font-size:12px;font-weight:500;font-family:inherit">保存修正</button>
      </div>
    `;

    bd.appendChild(content);
    return bd;
  }

  // ── 绑定事件 ──
  function bindDialogEvents() {
    const bd = dialogEl;
    const content = bd.children[0];

    // 关闭
    content.querySelector(".ls-close").addEventListener("click", closeLyricsSettings);
    content.querySelector(".ls-cancel").addEventListener("click", closeLyricsSettings);
    bd.querySelector(".ls-backdrop").addEventListener("click", closeLyricsSettings);

    // Tab 切换
    content.querySelectorAll(".ls-tab").forEach((tab) => {
      tab.addEventListener("click", function () {
        content.querySelectorAll(".ls-tab").forEach((t) => t.classList.remove("active"));
        this.classList.add("active");
        currentMode = this.dataset.mode;
        content.querySelectorAll(".ls-mode-panel").forEach((p) => p.style.display = "none");
        content.querySelector(`.ls-mode-${currentMode}`).style.display = "block";
      });
    });

    // 浏览文件
    content.querySelector(".ls-browse-btn").addEventListener("click", function () {
      const fileInput = document.getElementById("lsFileInput");
      if (fileInput) fileInput.click();
    });
    content.querySelector("#lsFileInput").addEventListener("change", function () {
      const nameEl = document.getElementById("lsFileName");
      if (this.files && this.files.length > 0) {
        nameEl.textContent = this.files[0].name;
        // 读取文件内容并预览
        const reader = new FileReader();
        reader.onload = function (e) {
          const content = e.target.result;
          previewLrcContent(content);
        };
        reader.readAsText(this.files[0]);
      } else {
        nameEl.textContent = "未选择文件";
      }
    });

    // 粘贴文本预览
    const pasteArea = content.querySelector("#lsPasteArea");
    if (pasteArea) {
      pasteArea.addEventListener("input", function () {
        previewLrcContent(this.value);
      });
    }

    // URL 测试
    const testBtn = content.querySelector(".ls-test-btn");
    if (testBtn) {
      testBtn.addEventListener("click", function () {
        const urlInput = document.getElementById("lsUrlInput");
        const statusEl = document.getElementById("lsUrlStatus");
        if (!urlInput || !statusEl) return;
        const url = urlInput.value.trim();
        if (!url) { statusEl.textContent = "请输入 URL"; statusEl.style.color = "#facc15"; return; }
        statusEl.textContent = "测试中…";
        statusEl.style.color = "var(--text-faint)";
        fetch(url, { method: "HEAD" })
          .then((r) => {
            if (r.ok) {
              statusEl.textContent = "✓ 可用";
              statusEl.style.color = "#4ade80";
            } else {
              statusEl.textContent = "✕ 不可访问";
              statusEl.style.color = "#ef4444";
            }
          })
          .catch(() => {
            statusEl.textContent = "✕ 网络错误";
            statusEl.style.color = "#ef4444";
          });
      });
    }

    // 封面来源切换
    const coverSelect = content.querySelector("#lsCoverSource");
    const coverExtra = document.getElementById("lsCoverExtra");
    if (coverSelect && coverExtra) {
      coverSelect.addEventListener("change", function () {
        coverExtra.style.display = this.value !== "auto" && this.value !== "none" ? "block" : "none";
      });
    }

    // 保存
    content.querySelector(".ls-save").addEventListener("click", function () {
      saveLyricsFix(currentTrackIdx, bd);
    });
  }

  // ── 填充表单 ──
  function populateForm(track) {
    if (!track) return;
    // 重置
    currentMode = "local-file";
    document.querySelectorAll(".ls-tab").forEach((t) => t.classList.remove("active"));
    document.querySelector('.ls-tab[data-mode="local-file"]').classList.add("active");
    document.querySelectorAll(".ls-mode-panel").forEach((p) => p.style.display = "none");
    document.querySelector(".ls-mode-local").style.display = "block";
    document.getElementById("lsFileName").textContent = track.lrcSource === "manual" && track.lrcContent ? "已加载（手动）" : "未选择文件";
    const pasteArea = document.getElementById("lsPasteArea");
    if (pasteArea) pasteArea.value = track.lrcContent || "";
    const urlInput = document.getElementById("lsUrlInput");
    if (urlInput) urlInput.value = track.lrcUrl || "";
    const coverSelect = document.getElementById("lsCoverSource");
    if (coverSelect) coverSelect.value = "auto";
    const coverExtra = document.getElementById("lsCoverExtra");
    if (coverExtra) coverExtra.style.display = "none";
    const coverUrlInput = document.getElementById("lsCoverUrlInput");
    if (coverUrlInput) coverUrlInput.value = track.pic || "";
  }

  // ── 预览歌词 ──
  function previewLrcContent(raw) {
    const previewEl = document.getElementById("lsPreview");
    if (!previewEl || !raw) {
      previewEl.textContent = "暂无预览";
      return;
    }
    // 解析前 5 行显示
    const lines = raw.split("\n").filter((l) => l.trim()).slice(0, 5);
    const parsed = parseLrcPreview(lines.join("\n"));
    previewEl.innerHTML = parsed.map((l) => `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(l.text)}</div>`).join("");
  }

  function parseLrcPreview(raw) {
    const lines = raw.split("\n");
    const result = [];
    for (const line of lines) {
      const m = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/);
      if (m) {
        const ms = parseInt(m[1]) * 60000 + parseInt(m[2]) * 1000 + (m[3] ? parseInt(m[3].padEnd(3, "0")) : 0);
        const txt = m[4].trim();
        if (txt) result.push({ time: ms, text: txt });
      }
    }
    return result;
  }

  function showLyricsPreview(track) {
    const previewEl = document.getElementById("lsPreview");
    if (!previewEl) return;
    if (track.lrcContent) {
      previewLrcContent(track.lrcContent);
    } else if (track.lrcUrl) {
      previewEl.textContent = `当前使用在线歌词: ${track.lrcUrl}`;
    } else {
      previewEl.textContent = "暂无歌词";
    }
  }

  // ── 保存修正 ──
  function saveLyricsFix(trackIdx, dialog) {
    if (trackIdx < 0 || !trks[trackIdx]) { showToast("无效曲目", 1500); return; }
    const t = trks[trackIdx];
    const content = dialog.querySelector(".ls-dialog");

    // 歌词内容
    let lrcContent = null;
    let lrcUrl = null;
    let lrcSource = "manual";

    if (currentMode === "local-file") {
      const fileInput = document.getElementById("lsFileInput");
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        // 从 file reader 读取的内容已在 preview 中处理，这里需要重新读
        const reader = new FileReader();
        // 同步方式：直接从 textarea 获取（如果用户也粘贴了的话）
        const pasteVal = content.querySelector("#lsPasteArea")?.value;
        if (pasteVal && pasteVal.trim()) {
          lrcContent = pasteVal.trim();
        }
      }
      // 如果没选文件但有粘贴内容
      const pasteVal = content.querySelector("#lsPasteArea")?.value;
      if (pasteVal && pasteVal.trim()) {
        lrcContent = pasteVal.trim();
      }
    } else if (currentMode === "paste-text") {
      const pasteVal = content.querySelector("#lsPasteArea")?.value;
      if (pasteVal && pasteVal.trim()) {
        lrcContent = pasteVal.trim();
      }
    } else if (currentMode === "specify-url") {
      const urlVal = content.querySelector("#lsUrlInput")?.value?.trim();
      if (urlVal) {
        lrcUrl = urlVal;
      }
    }

    if (!lrcContent && !lrcUrl) {
      showToast("请提供歌词内容或 URL", 2000);
      return;
    }

    // 更新 track
    if (lrcContent) {
      t.lrcContent = lrcContent;
      t.lrcSource = "manual";
    }
    if (lrcUrl) {
      t.lrcUrl = lrcUrl;
      t.lrcSource = "manual";
    }

    // 封面修正
    const coverSource = content.querySelector("#lsCoverSource")?.value;
    if (coverSource && coverSource !== "auto") {
      t.coverSource = coverSource;
      const coverUrlInput = content.querySelector("#lsCoverUrlInput");
      if (coverUrlInput && coverUrlInput.value.trim()) {
        t.pic = coverUrlInput.value.trim();
      }
    }

    // 持久化
    const trackKey = t.url || t.name || "";
    window.saveManualMatch?.(trackKey, {
      lrcContent: t.lrcContent,
      lrcUrl: t.lrcUrl,
      lrcSource: t.lrcSource,
      coverSource: t.coverSource,
      coverUrl: t.pic,
    });

    saveTrks();
    renderPL();
    closeLyricsSettings();
    showToast("歌词修正已保存", 1500);
  }

  function escHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── 全局暴露 ──
  window.openLyricsSettings = openLyricsSettings;
  window.closeLyricsSettings = closeLyricsSettings;

})();
