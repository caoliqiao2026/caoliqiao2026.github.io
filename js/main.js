/* ============================================================
   main.js · 全局交互
   滚动进度条 / 自定义光标 / 滚动显示动画 / 导航高亮
   复制邮箱 / 奖状弹窗 / 数据条动画
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 工具：节流 ---------- */
  function throttle(fn, wait) {
    let last = 0;
    return function (...args) {
      const now = performance.now();
      if (now - last >= wait) {
        last = now;
        fn.apply(this, args);
      }
    };
  }

  /* ---------- 1. 顶部滚动进度条 ----------
     直接写 transform: scaleX()，走 GPU；值未变化不写 DOM */
  const progressBar = document.getElementById("progress-bar");
  let lastProgress = -1;
  function updateProgress() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const ratio = max > 0 ? doc.scrollTop / max : 0;
    if (Math.abs(ratio - lastProgress) > 0.002) {
      lastProgress = ratio;
      progressBar.style.transform = "scaleX(" + ratio + ")";
    }
  }
  window.addEventListener("scroll", updateProgress, { passive: true });
  updateProgress();

  /* ---------- 2. 自定义光标（idle-stop：移动才激活，静止即停） ---------- */
  const dot = document.querySelector(".cursor-dot");
  const ring = document.querySelector(".cursor-ring");
  if (dot && ring && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    let mx = 0, my = 0, rx = 0, ry = 0;
    let active = false, rafId = null;
    let lastMove = 0;

    function render() {
      // 点：即时跟随
      dot.style.transform = "translate(" + (mx - 4) + "px," + (my - 4) + "px)";
      // 环：缓动跟随
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = "translate(" + (rx - 17) + "px," + (ry - 17) + "px)";
      // 静止 160ms 后停止 rAF
      if (performance.now() - lastMove > 160) {
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(render);
    }

    function wake() {
      dot.style.opacity = "1";
      ring.style.opacity = "1";
      lastMove = performance.now();
      if (!rafId) rafId = requestAnimationFrame(render);
    }

    document.addEventListener("mousemove", function (e) {
      mx = e.clientX;
      my = e.clientY;
      wake();
    }, { passive: true });

    document.addEventListener("mouseleave", function () {
      dot.style.opacity = "0";
      ring.style.opacity = "0";
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    });

    // 悬停可交互元素时环放大
    document.addEventListener("mouseover", function (e) {
      const t = e.target.closest("a, button, .award-btn, input, textarea, .touch-btn");
      ring.style.width = t ? "48px" : "34px";
      ring.style.height = t ? "48px" : "34px";
    }, { passive: true });
  }

  /* ---------- 3. 滚动显示动画（IntersectionObserver） ---------- */
  const revealEls = document.querySelectorAll("[data-reveal]");
  // Hero 首屏元素直接显示，不依赖 IO
  document.querySelectorAll(".hero-char, .hero-visual, .hero-tags, .hero-quote, .hero-role-switcher, .hero-badges, .hero-actions").forEach(function (el) {
    el.classList.add("revealed");
  });

  // 错峰进场：同一父容器内的元素按索引设置递增 delay（上限 5 档）
  revealEls.forEach(function (el) {
    if (el.classList.contains("hero-char")) return; // 名字逐字 delay 已由 CSS 处理
    const parent = el.parentElement;
    if (!parent) return;
    const siblings = Array.prototype.filter.call(parent.children, function (c) {
      return c.hasAttribute && c.hasAttribute("data-reveal");
    });
    const idx = siblings.indexOf(el);
    if (idx > 0) {
      el.style.setProperty("--reveal-delay", (Math.min(idx, 5) * 0.09).toFixed(2) + "s");
    }
  });

  const nonHeroRevealEls = document.querySelectorAll("[data-reveal]:not(.hero-char):not(.hero-visual):not(.hero-tags):not(.hero-quote):not(.hero-role-switcher):not(.hero-badges):not(.hero-actions)");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    nonHeroRevealEls.forEach(function (el) { io.observe(el); });
  } else {
    nonHeroRevealEls.forEach(function (el) { el.classList.add("revealed"); });
  }

  /* ---------- 4. 数据条填充动画（进入视口才展开） ---------- */
  function fillBars() {
    document.querySelectorAll(".statbar-fill, .skillbar-fill").forEach(function (bar) {
      const w = bar.getAttribute("data-width");
      if (w && !bar.dataset.done) {
        bar.dataset.done = "1";
        // 延迟一帧让 width:0 先渲染，再过渡到目标值
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { bar.style.width = w; });
        });
      }
    });
  }
  if ("IntersectionObserver" in window) {
    const ioBars = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          fillBars();
          ioBars.disconnect();
        }
      });
    }, { threshold: 0.3 });
    const heroStats = document.querySelector(".hero-stats");
    if (heroStats) ioBars.observe(heroStats);
    const dataPanel = document.querySelector(".panel .skillbar");
    if (dataPanel) ioBars.observe(dataPanel.closest(".panel"));
  } else {
    fillBars();
  }

  /* ---------- 5. 导航高亮 + 移动端抽屉 ---------- */
  const navLinks = document.querySelectorAll(".nav-links a");
  const sections = document.querySelectorAll("section[id], main section[id]");
  const burger = document.querySelector(".nav-burger");

  // 移动端抽屉
  if (burger) {
    let drawer = document.querySelector(".nav-drawer");
    if (!drawer) {
      drawer = document.createElement("div");
      drawer.className = "nav-drawer";
      navLinks.forEach(function (a) {
        const copy = a.cloneNode(true);
        drawer.appendChild(copy);
      });
      document.body.appendChild(drawer);
    }
    burger.addEventListener("click", function () {
      drawer.classList.toggle("open");
      const icon = burger.querySelector("i");
      if (icon) {
        icon.className = drawer.classList.contains("open")
          ? "fa-solid fa-xmark"
          : "fa-solid fa-bars";
      }
    });
    drawer.addEventListener("click", function (e) {
      if (e.target.tagName === "A") drawer.classList.remove("open");
    });
  }

  // 滚动高亮当前区块（值变化才更新）
  let lastActive = null;
  function highlightNav() {
    const pos = window.scrollY + window.innerHeight * 0.35;
    let current = null;
    sections.forEach(function (sec) {
      if (pos >= sec.offsetTop) current = sec.id;
    });
    if (current !== lastActive) {
      lastActive = current;
      navLinks.forEach(function (a) {
        const on = a.getAttribute("href") === "#" + current;
        a.classList.toggle("active", on);
      });
    }
  }
  window.addEventListener("scroll", throttle(highlightNav, 100), { passive: true });
  highlightNav();

  /* ---------- 6. 复制邮箱 ---------- */
  const copyBtn = document.getElementById("copy-email");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      const email = "3813271225@qq.com";
      const done = function () {
        const icon = copyBtn.querySelector("i");
        const old = copyBtn.innerHTML;
        copyBtn.innerHTML = "已复制 <i class=\"fa-solid fa-check\"></i>";
        setTimeout(function () { copyBtn.innerHTML = old; }, 1600);
        void icon;
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(done).catch(function () { fallbackCopy(email); done(); });
      } else {
        fallbackCopy(email);
        done();
      }
    });
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  /* ---------- 6.1 通用复制 + Toast ---------- */
  let toastTimer = null;
  function showToast(msg) {
    let t = document.getElementById("clip-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "clip-toast";
      t.className = "clip-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1600);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    fallbackCopy(text);
    return Promise.resolve();
  }

  // 联系栏一键复制（手机号 / 邮箱 / QQ / 所在地）
  document.querySelectorAll(".contact-copy").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      const val = btn.getAttribute("data-copy") || "";
      if (!val) return;
      copyText(val).then(function () {
        showToast("已复制：" + val);
        const icon = btn.querySelector("i");
        if (icon) {
          const old = icon.className;
          icon.className = "fa-solid fa-check";
          setTimeout(function () { icon.className = old; }, 1400);
        }
      }).catch(function () {
        showToast("复制失败，请手动选择");
      });
    });
  });

  /* ---------- 7. Hero 角色标签切换器（打字机 + 自动轮播） ---------- */
  (function initRoleSwitcher() {
    const switcher = document.getElementById("hero-role-switcher");
    if (!switcher) return;
    const tabs = switcher.querySelectorAll(".role-tab");
    const textEl = document.getElementById("role-text");
    const cursor = switcher.querySelector(".role-cursor");
    const roles = Array.from(tabs).map(function (btn) { return btn.textContent.trim(); });
    let current = 0;
    let autoTimer = null;
    let typeTimer = null;
    let isHovering = false;

    function setActive(index) {
      tabs.forEach(function (tab, i) {
        tab.classList.toggle("active", i === index);
        tab.setAttribute("aria-selected", i === index ? "true" : "false");
      });
      current = index;
    }

    function typeText(fullText) {
      if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
      if (cursor) cursor.style.animation = "none";
      textEl.textContent = "";
      let i = 0;
      function step() {
        if (i <= fullText.length) {
          textEl.textContent = fullText.slice(0, i);
          i++;
          typeTimer = setTimeout(step, 75);
        } else {
          if (cursor) cursor.style.animation = "cursor-blink 0.9s infinite";
        }
      }
      step();
    }

    function switchTo(index) {
      if (index === current && textEl.textContent) return;
      setActive(index);
      typeText(roles[index]);
    }

    function next() {
      switchTo((current + 1) % roles.length);
    }

    function startAuto() {
      stopAuto();
      autoTimer = setInterval(function () { if (!isHovering) next(); }, 4200);
    }
    function stopAuto() {
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () {
        switchTo(index);
        startAuto();
      });
    });

    switcher.addEventListener("mouseenter", function () { isHovering = true; });
    switcher.addEventListener("mouseleave", function () { isHovering = false; });

    // 键盘左右切换
    switcher.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        switchTo((current + 1) % roles.length);
        startAuto();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        switchTo((current - 1 + roles.length) % roles.length);
        startAuto();
      }
    });

    // 初始播放
    typeText(roles[current]);
    startAuto();
  })();

  /* ---------- 8. 技能卡片弹窗 ---------- */
  const skillModal = document.getElementById("skill-modal");
  const skillModalTitle = document.getElementById("skill-modal-title");
  const skillModalBody = document.getElementById("skill-modal-body");
  const skillCards = document.querySelectorAll(".skill-card[data-skill]");

  const skillDetails = {
    innovation: {
      title: "创新与实践",
      body: "<p><strong>核心特质：</strong>保持好奇，动手验证，让想法落地。</p>"
        + "<h5>代表成果</h5><ul><li>物理创新实验制作竞赛 · 一等奖</li><li>数学立体模型制作比赛 · 一等奖</li></ul>"
        + "<h5>我的方法</h5><p>从问题出发，先做出最小可行版本，再迭代优化。AI 是加速器，但判断力和执行力才是根本。</p>"
        + "<div class=\"skill-tags\"><span>物理实验</span><span>数学建模</span><span>快速原型</span><span>动手实践</span></div>"
    },
    writing: {
      title: "文字表达与创作",
      body: "<p><strong>核心特质：</strong>把复杂的想法，用清晰、有温度的文字表达出来。</p>"
        + "<h5>获奖经历</h5><ul><li>广东省少年儿童践行社会主义核心价值观主题征文 · 湛江市高中组优秀作品奖</li><li>《奔跑人生》· 市三等奖 / 校高中组一等奖</li><li>《扣紧诚信扣，点亮人生路》· 高中组一等奖</li></ul>"
        + "<h5>我的理解</h5><p>写作是思维的打磨。每一次获奖都不是终点，而是把「想表达」变成「能打动人」的练习。</p>"
        + "<div class=\"skill-tags\"><span>征文比赛</span><span>逻辑表达</span><span>故事化写作</span><span>持续输出</span></div>"
    },
    leadership: {
      title: "组织管理与领导力",
      body: "<p><strong>核心特质：</strong>以责任心为先，把每一件事落到实处。</p>"
        + "<h5>主要经历</h5><ul><li>十年班干经验</li><li>2023-2024、2024-2025 学年度优秀团干</li><li>班级事务、校级活动的策划与协调</li></ul>"
        + "<h5>我的信念</h5><p>领导力不是头衔，而是「让人放心托付」。把事情做好，比说得漂亮更重要。</p>"
        + "<div class=\"skill-tags\"><span>优秀团干</span><span>活动策划</span><span>团队协调</span><span>责任心</span></div>"
    }
  };

  function openSkillModal(key) {
    const detail = skillDetails[key];
    if (!detail || !skillModal) return;
    skillModalTitle.textContent = detail.title;
    skillModalBody.innerHTML = detail.body;
    skillModal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeSkillModal() {
    if (skillModal) skillModal.classList.remove("open");
    document.body.style.overflow = "";
  }

  skillCards.forEach(function (card) {
    card.addEventListener("click", function () { openSkillModal(card.getAttribute("data-skill")); });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openSkillModal(card.getAttribute("data-skill"));
      }
    });
  });

  if (skillModal) {
    skillModal.querySelectorAll("[data-close=\"skill-modal\"]").forEach(function (el) {
      el.addEventListener("click", closeSkillModal);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && skillModal.classList.contains("open")) closeSkillModal();
    });
  }

  /* ---------- 8. 奖状弹窗 ---------- */
  const modal = document.getElementById("award-modal");
  const modalTitle = document.getElementById("award-modal-title");
  const modalBody = document.getElementById("award-modal-body");
  const awardBtns = document.querySelectorAll(".award-btn");

  function closeModal() {
    if (modal) modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  if (modal && awardBtns.length) {
    awardBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const title = btn.getAttribute("data-title") || "奖状";
        // 支持 data-slugs（逗号分隔的多张独立奖状）或 data-slug + data-multi（一组编号图片）
        const slugsAttr = btn.getAttribute("data-slugs");
        const slugList = slugsAttr
          ? slugsAttr.split(",").map(function (s) { return s.trim(); }).filter(Boolean)
          : null;
        const count = slugList ? slugList.length : parseInt(btn.getAttribute("data-multi") || "1", 10);
        modalTitle.textContent = title;
        modalBody.innerHTML = "";
        for (let i = 0; i < count; i++) {
          const img = document.createElement("img");
          let src;
          if (slugList) {
            src = "assets/awards/" + slugList[i] + ".jpg";
          } else {
            const slug = btn.getAttribute("data-slug");
            if (!slug) break;
            // 奖状图片约定：assets/awards/<slug>.jpg，多张加 -2、-3…
            src = "assets/awards/" + slug + (count > 1 ? "-" + (i + 1) : "") + ".jpg";
          }
          img.className = "award-img";
          img.loading = "lazy";
          img.decoding = "async";
          img.alt = title + (count > 1 ? " " + (i + 1) : "");
          img.onload = function () { img.classList.add("loaded"); };
          img.onerror = function () { img.style.display = "none"; };
          modalBody.appendChild(img);
        }
        // 若没有任何可显示图片，展示占位提示
        if (!modalBody.childElementCount) {
          const ph = document.createElement("div");
          ph.className = "award-placeholder";
          ph.innerHTML = "<i class=\"fa-regular fa-image\"></i><p>奖状图片待补充</p>"
            + "<p class=\"award-tip\">把奖状照片放进 <code>assets/awards/</code> 目录，"
            + "并在按钮上添加 <code>data-slug</code>（如 <code>data-slug=\"province-chengxin\"</code>）即可显示</p>";
          modalBody.appendChild(ph);
        }
        modal.classList.add("open");
        document.body.style.overflow = "hidden";
      });
    });

    modal.querySelectorAll("[data-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }
})();
