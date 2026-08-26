/* ============================================================
   admin.js · 留言板管理后台
   ------------------------------------------------------------
   · 登录：密码经 SHA-256 后调用云端 RPC verify_admin_pass 校验，
     明文密码不出本机、不落库（数据库里只存哈希）。
   · 删除：调用 SECURITY DEFINER 函数 delete_message，服务端
     再次校验密码哈希，RLS 保证匿名访客无法删除任何数据。
   · 会话：登录状态保存在 sessionStorage，关闭标签页即失效。
   依赖：js/config.js（window.SITE_CONFIG）
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var SUPABASE_URL = (CFG.SUPABASE_URL || "").replace(/\/+$/, "");
  var SUPABASE_KEY = CFG.SUPABASE_KEY || "";
  var READY = !!(SUPABASE_URL && SUPABASE_KEY);

  var SESSION_KEY = "caoliqiao_admin_session";
  var LOCAL_GUESTBOOK_KEY = "caoliqiao_guestbook_v1";
  var PAGE_SIZE = 50;

  var el = function (id) { return document.getElementById(id); };
  var loginBox = el("admin-login");
  var loginForm = el("admin-login-form");
  var loginPass = el("admin-pass");
  var loginStatus = el("admin-login-status");
  var panel = el("admin-panel");
  var listEl = el("admin-list");
  var listStatus = el("admin-list-status");
  var moreBtn = el("admin-more-btn");
  var noConfig = el("admin-noconfig");
  var modeBadge = el("admin-mode-badge");
  var migrateBtn = el("admin-migrate");

  var passHash = "";
  var offset = 0;
  var loaded = [];
  var hasMore = true;
  var loading = false;

  /* ---------- 基础工具 ---------- */
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatTime(iso) {
    try {
      var d = new Date(iso);
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
        + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    } catch (e) { return ""; }
  }

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

  function rpc(fnName, params) {
    return fetch(SUPABASE_URL + "/rest/v1/rpc/" + fnName, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify(params || {})
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function sha256(text) {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return (b < 16 ? "0" : "") + b.toString(16);
        }).join("");
      });
    }
    return Promise.reject(new Error("no-crypto"));
  }

  function setListStatus(text, cls) {
    if (listStatus) {
      listStatus.textContent = text || "";
      listStatus.className = "gb-status " + (cls || "");
    }
  }

  /* ---------- 初始化 ---------- */
  function init() {
    if (modeBadge) {
      modeBadge.textContent = READY ? "CLOUD_CONNECTED" : "OFFLINE";
      modeBadge.classList.toggle("is-local", !READY);
    }

    if (!READY) {
      if (noConfig) noConfig.hidden = false;
      if (loginBox) loginBox.hidden = true;
      return;
    }

    // 已配置：隐藏"未连接"提示
    if (noConfig) noConfig.hidden = true;

    // 恢复本次浏览器会话的登录态
    try {
      passHash = sessionStorage.getItem(SESSION_KEY) || "";
    } catch (e) { passHash = ""; }

    if (passHash) {
      verify(passHash).then(function (ok) {
        if (ok) enterPanel();
        else logout(false);
      }).catch(function () { logout(false); });
    }

    // 检测本机是否有旧版本地留言可迁移
    try {
      var raw = localStorage.getItem(LOCAL_GUESTBOOK_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr) && arr.length && migrateBtn) {
        migrateBtn.hidden = false;
        migrateBtn.insertAdjacentHTML("beforeend", ' <em class="multi-num">' + arr.length + ' 条</em>');
      }
    } catch (e) { /* ignore */ }
  }

  /* ---------- 登录 / 退出 ---------- */
  function verify(hash) {
    return rpc("verify_admin_pass", { pass_hash: hash }).then(function (r) {
      return r === true;
    }).catch(function () { return false; });
  }

  function enterPanel() {
    loginBox.hidden = true;
    panel.hidden = false;
    reloadAll();
  }

  function logout(notify) {
    passHash = "";
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    panel.hidden = true;
    loginBox.hidden = false;
    if (notify) setLoginStatus("已退出管理面板", "");
  }

  function setLoginStatus(text, cls) {
    if (loginStatus) {
      loginStatus.textContent = text || "";
      loginStatus.className = "gb-status " + (cls || "");
    }
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var pass = loginPass.value;
      if (!pass) return;
      setLoginStatus("验证中…", "");
      sha256(pass).then(function (hash) {
        return verify(hash).then(function (ok) {
          if (ok) {
            passHash = hash;
            try { sessionStorage.setItem(SESSION_KEY, hash); } catch (e2) { /* ignore */ }
            setLoginStatus("验证通过 ✓", "ok");
            enterPanel();
          } else {
            setLoginStatus("密码不正确", "err");
          }
        });
      }).catch(function () {
        setLoginStatus("当前环境不支持加密（请通过 http(s):// 访问，不要直接双击文件打开）", "err");
      });
    });
  }

  if (el("admin-logout")) {
    el("admin-logout").addEventListener("click", function () { logout(true); });
  }

  /* ---------- 列表加载 ---------- */
  function fetchPage(limit, offsetVal) {
    var q = "select=id,name,text,created_at&order=created_at.desc"
      + "&limit=" + limit + "&offset=" + offsetVal;
    return fetch(SUPABASE_URL + "/rest/v1/messages?" + q, {
      headers: sbHeaders()
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function fetchCount() {
    return fetch(SUPABASE_URL + "/rest/v1/messages?select=id", {
      headers: sbHeaders({ "Prefer": "count=exact", "Range": "0-0" })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      var range = res.headers.get("content-range"); // 形如 "0-0/123"
      if (range && range.indexOf("/") > -1) {
        var n = parseInt(range.split("/")[1], 10);
        if (!isNaN(n)) return n;
      }
      return -1;
    });
  }

  function renderMessages(rows, append) {
    if (!append) {
      listEl.innerHTML = "";
      loaded = [];
    }
    var frag = document.createDocumentFragment();
    rows.forEach(function (r) {
      loaded.push(r);
      var div = document.createElement("div");
      div.className = "admin-message";
      div.setAttribute("data-id", r.id);
      div.innerHTML = ""
        + '<div class="gb-message-head">'
        + '<span class="gb-message-name">' + esc(r.name || "匿名") + '</span>'
        + '<span class="gb-message-time">' + formatTime(r.created_at) + '</span>'
        + '</div>'
        + '<div class="gb-message-text">' + esc(r.text) + '</div>'
        + '<button class="btn btn-small admin-del-btn" data-del="' + esc(r.id) + '">'
        + '<i class="fa-solid fa-trash-can"></i> 删除</button>';
      frag.appendChild(div);
    });
    listEl.appendChild(frag);
  }

  function loadMore() {
    if (loading || !hasMore) return;
    loading = true;
    setListStatus("加载中…", "");
    fetchPage(PAGE_SIZE, offset).then(function (rows) {
      renderMessages(rows, offset > 0);
      offset += rows.length;
      hasMore = rows.length === PAGE_SIZE;
      moreBtn.hidden = !hasMore;
      setListStatus(hasMore ? "" : (loaded.length ? "已全部加载（" + loaded.length + " 条）" : ""), "");
    }).catch(function () {
      setListStatus("加载失败，请稍后再试", "err");
    }).then(function () {
      loading = false;
    });
  }

  function reloadAll() {
    offset = 0;
    hasMore = true;
    loadMore();
    updateStats();
  }

  function updateStats() {
    fetchCount().then(function (n) {
      if (n < 0) return;
      el("stat-total").textContent = n;
      // 今日 / 近 7 天
      var now = new Date();
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      var weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
      return fetchCountSince(todayStart).then(function (t) {
        el("stat-today").textContent = t;
        return fetchCountSince(weekStart);
      }).then(function (w) {
        el("stat-week").textContent = w;
      });
    }).catch(function () { /* 静默 */ });
  }

  function fetchCountSince(iso) {
    return fetch(SUPABASE_URL + "/rest/v1/messages?select=id&created_at=gte." + encodeURIComponent(iso), {
      headers: sbHeaders({ "Prefer": "count=exact", "Range": "0-0" })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      var range = res.headers.get("content-range");
      if (range && range.indexOf("/") > -1) {
        var n = parseInt(range.split("/")[1], 10);
        if (!isNaN(n)) return n;
      }
      return 0;
    });
  }

  if (moreBtn) moreBtn.addEventListener("click", loadMore);
  if (el("admin-reload")) el("admin-reload").addEventListener("click", reloadAll);

  /* ---------- 删除 ---------- */
  listEl.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-del]") : null;
    if (!btn) return;
    var id = btn.getAttribute("data-del");
    if (!window.confirm("确定删除这条留言吗？此操作不可撤销。")) return;
    btn.disabled = true;
    rpc("delete_message", { msg_id: id, pass_hash: passHash }).then(function (ok) {
      if (ok === true) {
        var card = listEl.querySelector('.admin-message[data-id="' + id + '"]');
        if (card) card.remove();
        setListStatus("已删除 ✓", "ok");
        updateStats();
      } else {
        btn.disabled = false;
        setListStatus("删除失败：密码校验未通过", "err");
      }
    }).catch(function () {
      btn.disabled = false;
      setListStatus("删除失败，请稍后再试", "err");
    });
  });

  /* ---------- 导出 ---------- */
  function fetchAll() {
    var all = [];
    function page(off) {
      return fetchPage(500, off).then(function (rows) {
        all = all.concat(rows);
        if (rows.length === 500) return page(off + 500);
        return all;
      });
    }
    return page(0);
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 100);
  }

  function csvCell(v) {
    var s = String(v == null ? "" : v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function stamp() {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes());
  }

  if (el("admin-export-json")) {
    el("admin-export-json").addEventListener("click", function () {
      setListStatus("正在导出…", "");
      fetchAll().then(function (rows) {
        download("guestbook-" + stamp() + ".json", JSON.stringify(rows, null, 2), "application/json");
        setListStatus("已导出 " + rows.length + " 条（JSON）✓", "ok");
      }).catch(function () {
        setListStatus("导出失败", "err");
      });
    });
  }

  if (el("admin-export-csv")) {
    el("admin-export-csv").addEventListener("click", function () {
      setListStatus("正在导出…", "");
      fetchAll().then(function (rows) {
        var lines = ["name,text,created_at"];
        rows.forEach(function (r) {
          lines.push([csvCell(r.name), csvCell(r.text), csvCell(r.created_at)].join(","));
        });
        // BOM 保证 Excel 正确识别 UTF-8
        download("guestbook-" + stamp() + ".csv", "\ufeff" + lines.join("\r\n"), "text/csv;charset=utf-8");
        setListStatus("已导出 " + rows.length + " 条（CSV）✓", "ok");
      }).catch(function () {
        setListStatus("导出失败", "err");
      });
    });
  }

  /* ---------- 迁移本机旧留言 ---------- */
  if (migrateBtn) {
    migrateBtn.addEventListener("click", function () {
      var raw;
      try { raw = localStorage.getItem(LOCAL_GUESTBOOK_KEY); } catch (e) { raw = null; }
      if (!raw) return;
      var arr;
      try { arr = JSON.parse(raw); } catch (e) { arr = []; }
      if (!Array.isArray(arr) || !arr.length) return;
      if (!window.confirm("将把本机保存的 " + arr.length + " 条旧留言上传到云端（保留原时间）。继续吗？")) return;

      var payload = arr.map(function (m) {
        return {
          name: String(m.name || "匿名").slice(0, 20),
          text: String(m.text || "").slice(0, 200),
          created_at: m.time || new Date().toISOString()
        };
      }).filter(function (p) { return p.text; });

      fetch(SUPABASE_URL + "/rest/v1/messages", {
        method: "POST",
        headers: sbHeaders(),
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        setListStatus("已迁移 " + payload.length + " 条旧留言 ✓", "ok");
        if (window.confirm("迁移完成。是否清空本机旧数据？（云端已有备份）")) {
          try { localStorage.removeItem(LOCAL_GUESTBOOK_KEY); } catch (e) { /* ignore */ }
          migrateBtn.hidden = true;
        }
        reloadAll();
      }).catch(function () {
        setListStatus("迁移失败，请稍后再试", "err");
      });
    });
  }

  init();
})();
