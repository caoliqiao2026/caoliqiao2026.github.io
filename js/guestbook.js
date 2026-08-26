/* ============================================================
   guestbook.js · 集体记忆留言板（云端 + 本地双模式）
   ------------------------------------------------------------
   · 云端模式：配置了 SITE_CONFIG.SUPABASE_URL / KEY 时，
     所有访客共享同一份数据（读写均走 Supabase REST API，
     配合数据库行级安全策略：匿名可读可写、不可删除）。
   · 本地模式：未配置时自动降级为 localStorage，仅本机可见。
   · 管理后台在 admin.html（删除留言、数据迁移、导出）。
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var SUPABASE_URL = (CFG.SUPABASE_URL || "").replace(/\/+$/, "");
  var SUPABASE_KEY = CFG.SUPABASE_KEY || "";
  var CLOUD_READY = !!(SUPABASE_URL && SUPABASE_KEY);

  var STORAGE_KEY = "caoliqiao_guestbook_v1";
  var MY_IDS_KEY = "caoliqiao_guestbook_myids";
  var MY_IDS_TTL = 30 * 60 * 1000; // 本机发送标记保留 30 分钟
  var MAX_LEN = 200;
  var LIST_LIMIT = 100;           // 首屏拉取条数
  var POLL_INTERVAL = 60 * 1000;  // 云端模式静默轮询周期

  var form = document.getElementById("gb-form");
  var nameInput = document.getElementById("gb-name");
  var textInput = document.getElementById("gb-text");
  var countEl = document.getElementById("gb-count");
  var statusEl = document.getElementById("gb-status");
  var messagesEl = document.getElementById("gb-messages");
  var emptyEl = document.getElementById("gb-empty");
  var modeBadge = document.getElementById("gb-mode");
  var refreshBtn = document.getElementById("gb-refresh");

  if (!form || !textInput) return;

  /* ---------- 本机发送标记（用于“me”高亮） ---------- */
  function getMyIds() {
    try {
      var raw = sessionStorage.getItem(MY_IDS_KEY);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      var now = Date.now();
      var out = {};
      Object.keys(obj).forEach(function (k) {
        if (now - obj[k] < MY_IDS_TTL) out[k] = obj[k];
      });
      return out;
    } catch (e) { return {}; }
  }

  function markMyId(id) {
    try {
      var ids = getMyIds();
      ids[id] = Date.now();
      sessionStorage.setItem(MY_IDS_KEY, JSON.stringify(ids));
    } catch (e) { /* 隐私模式忽略 */ }
  }

  /* ---------- 本地存储（降级模式 / 兼容旧数据） ---------- */
  function loadLocal() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveLocal(arr) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) { /* 隐私模式可能写入失败，忽略 */ }
  }

  /* ---------- Supabase REST ---------- */
  function sbHeaders(extra) {
    var h = {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json"
    };
    if (extra) {
      Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    }
    return h;
  }

  function fetchCloud() {
    return fetch(SUPABASE_URL + "/rest/v1/messages?select=id,name,text,created_at&order=created_at.desc&limit=" + LIST_LIMIT, {
      headers: sbHeaders()
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function (rows) {
      return rows.map(function (r) {
        return { id: r.id, name: r.name, text: r.text, time: r.created_at };
      });
    });
  }

  function postCloud(name, text) {
    return fetch(SUPABASE_URL + "/rest/v1/messages", {
      method: "POST",
      headers: sbHeaders({ "Prefer": "return=representation,representation" }),
      body: JSON.stringify({ name: name, text: text })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function (rows) {
      var r = rows && rows[0];
      if (!r) throw new Error("empty response");
      return { id: r.id, name: r.name, text: r.text, time: r.created_at };
    });
  }

  /* ---------- 渲染 ---------- */
  function formatTime(iso) {
    try {
      var d = new Date(iso);
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
        + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    } catch (e) {
      return "";
    }
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderList(msgs) {
    var myIds = getMyIds();
    if (!msgs.length) {
      messagesEl.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    var frag = document.createDocumentFragment();
    msgs.forEach(function (m) {
      var div = document.createElement("div");
      div.className = "gb-message";
      if (myIds[m.id] || m.me) div.classList.add("gb-message-me");
      div.innerHTML = ""
        + '<div class="gb-message-head">'
        + '<span class="gb-message-name">' + esc(m.name || "匿名") + '</span>'
        + '<span class="gb-message-time">' + formatTime(m.time) + '</span>'
        + '</div>'
        + '<div class="gb-message-text">' + esc(m.text) + '</div>';
      frag.appendChild(div);
    });
    messagesEl.innerHTML = "";
    messagesEl.appendChild(frag);
  }

  function setEmptyText() {
    if (emptyEl) {
      var p = emptyEl.querySelector("p");
      if (p) {
        p.textContent = CLOUD_READY
          ? "NO_SIGNAL — 成为第一条留言"
          : "本地模式 — 未连接云端，留言仅本机可见（配置 js/config.js 后开放）";
      }
    }
  }

  /* ---------- 状态与模式标记 ---------- */
  function updateModeBadge() {
    if (!modeBadge) return;
    modeBadge.textContent = CLOUD_READY ? "CLOUD_SYNC · 公共留言" : "LOCAL_MODE · 仅本机可见";
    modeBadge.classList.toggle("is-local", !CLOUD_READY);
    modeBadge.style.display = "";
  }

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = "gb-status " + (cls || "");
  }

  /* ---------- 字数计数 ---------- */
  function updateCount() {
    var n = textInput.value.length;
    countEl.textContent = n;
    countEl.parentElement.classList.toggle("over", n >= MAX_LEN);
  }
  textInput.addEventListener("input", updateCount);

  /* ---------- 提交 ---------- */
  var sending = false;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    var name = nameInput.value.trim();
    var text = textInput.value.trim();

    if (!text) {
      setStatus("写点内容再发送吧 ✍️", "err");
      return;
    }
    if (text.length > MAX_LEN) {
      setStatus("消息超过 200 字了", "err");
      return;
    }

    if (CLOUD_READY) {
      sending = true;
      setStatus("发送中…", "");
      postCloud(name || "匿名", text).then(function (msg) {
        markMyId(msg.id);
        return refresh();
      }).then(function () {
        form.reset();
        updateCount();
        setStatus("已送达 ✓ 感谢你的留言", "ok");
        nameInput.focus();
      }).catch(function () {
        setStatus("发送失败，请稍后再试", "err");
      }).then(function () {
        sending = false;
      });
    } else {
      // 本地模式
      var msg = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        name: name || "匿名",
        text: text,
        time: new Date().toISOString(),
        me: true
      };
      var msgs = loadLocal();
      msgs.unshift(msg);
      if (msgs.length > 200) msgs.length = 200;
      saveLocal(msgs);
      form.reset();
      updateCount();
      renderList(msgs);
      setStatus("已保存到本机 ✓（连接云端后所有人可见）", "ok");
    }
  });

  /* ---------- 刷新 ---------- */
  var lastRendered = "";

  function renderAll(msgs) {
    renderList(msgs);
    lastRendered = msgs.map(function (m) { return m.id; }).join(",");
  }

  function refresh(silent) {
    if (CLOUD_READY) {
      return fetchCloud().then(function (msgs) {
        var sig = msgs.map(function (m) { return m.id; }).join(",");
        if (sig !== lastRendered) {
          renderAll(msgs);
        }
        if (!silent) setStatus("已同步最新留言 ✓", "ok");
        return msgs;
      }).catch(function () {
        if (!silent) setStatus("云端连接失败，请稍后再试", "err");
        return [];
      });
    }
    renderAll(loadLocal());
    if (!silent) setStatus("本地列表已刷新 ✓", "ok");
    return Promise.resolve(loadLocal());
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      var icon = refreshBtn.querySelector("i");
      if (icon) icon.classList.add("fa-spin");
      refresh(false).then(function () {
        setTimeout(function () {
          if (icon) icon.classList.remove("fa-spin");
        }, 400);
      });
    });
  }

  /* ---------- 云端静默轮询：别人新留言自动浮现 ---------- */
  if (CLOUD_READY && typeof setInterval === "function") {
    setInterval(function () {
      if (document.hidden) return; // 页面不可见时跳过
      refresh(true);
    }, POLL_INTERVAL);
  }

  /* ---------- 初始化 ---------- */
  updateCount();
  setEmptyText();
  updateModeBadge();
  refresh(true);
})();
