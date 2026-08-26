/* ============================================================
   particles.js · 背景粒子画布
   粒子连线 + 鼠标牵引；idle-stop 节能：无交互即停，交互唤醒
   ============================================================ */
(function () {
  "use strict";

  const canvas = document.getElementById("particle-canvas");
  if (!canvas) return;
  // 移动端 / 低性能设备直接关闭粒子背景
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.innerWidth < 640 && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return;

  const ctx = canvas.getContext("2d");
  const COLORS = [
    [34, 93, 171],   // 蓝 #225DAB
    [123, 163, 114], // 绿 #7BA372
    [203, 175, 152]  // 棕 #CBAF98
  ];
  const COUNT = Math.min(48, Math.floor(window.innerWidth / 26));

  let W = 0, H = 0, dpr = 1;
  let particles = [];
  let rafId = null;
  let idleTimer = null;
  let mouse = { x: -9999, y: -9999, active: false };
  let running = false;

  /* ---------- 初始化粒子 ---------- */
  function rand(a, b) { return a + Math.random() * (b - a); }

  function spawnParticle() {
    return {
      x: rand(0, W),
      y: rand(0, H),
      vx: rand(-0.22, 0.22),
      vy: rand(-0.22, 0.22),
      r: rand(1, 2.4),
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
      a: rand(0.25, 0.6)
    };
  }

  function init() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles = [];
    for (let i = 0; i < COUNT; i++) particles.push(spawnParticle());
  }

  /* ---------- 单帧绘制 ---------- */
  function frame() {
    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // 缓慢漂移
      p.x += p.vx;
      p.y += p.vy;

      // 边界回弹
      if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;

      // 与鼠标的牵引
      if (mouse.active) {
        const dxm = p.x - mouse.x, dym = p.y - mouse.y;
        const dm2 = dxm * dxm + dym * dym;
        if (dm2 < 200 * 200 && dm2 > 0.01) {
          const dm = Math.sqrt(dm2);
          p.x -= (dxm / dm) * 0.4;
          p.y -= (dym / dm) * 0.4;
        }
      }

      // 画粒子
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + p.c[0] + "," + p.c[1] + "," + p.c[2] + "," + p.a + ")";
      ctx.fill();
    }

    // 粒子连线（近距离才连，量少成本低）
    const linkDist = 110;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkDist * linkDist) {
          const alpha = (1 - Math.sqrt(d2) / linkDist) * 0.16;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = "rgba(34,93,171," + alpha.toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      // 与鼠标连线
      if (mouse.active) {
        const dxm = a.x - mouse.x, dym = a.y - mouse.y;
        const d2m = dxm * dxm + dym * dym;
        if (d2m < 150 * 150) {
          const alpha = (1 - Math.sqrt(d2m) / 150) * 0.22;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = "rgba(123,163,114," + alpha.toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  /* ---------- 循环控制（idle-stop） ---------- */
  function loop() {
    frame();
    rafId = requestAnimationFrame(loop);
  }

  function wake() {
    if (running) return;
    running = true;
    mouse.active = true;
    loop();
    resetIdle();
  }

  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      // 静止 3 秒后休眠，省 CPU
      running = false;
      mouse.active = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      frame(); // 补最后一帧
    }, 3000);
  }

  /* ---------- 事件 ---------- */
  window.addEventListener("mousemove", function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    wake();
  }, { passive: true });

  window.addEventListener("scroll", function () {
    wake();
  }, { passive: true });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      running = false;
      mouse.active = false;
      clearTimeout(idleTimer);
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else {
      wake();
    }
  });

  window.addEventListener("resize", function () {
    init();
    frame();
  });

  /* ---------- 启动 ---------- */
  init();
  frame();
  resetIdle();
})();
