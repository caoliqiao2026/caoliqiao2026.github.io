/* ============================================================
   game.js · 坦克大战 Battle City
   纯 Canvas 实现：无第三方库
   - 13×13 网格地图（砖墙 / 钢墙 / 基地）
   - 玩家 WASD / 方向键移动，Space 开火
   - 敌方 AI（3 出生点、波次生成、随机决策）
   - 子弹 AABB 碰撞、爆炸粒子、帧率无关运动（dt 归一化）
   - 状态机：READY → PLAYING ⇄ PAUSED → WIN / OVER
   - 触屏按键：不依赖键盘，iframe / 预览面板可用
   ============================================================ */
(function () {
  "use strict";

  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  /* ---------- 常量 ---------- */
  const CELL = 40;            // 每格像素
  const COLS = 13, ROWS = 13; // 网格
  const TANK_SIZE = 34;       // 坦克视觉尺寸
  const HIT_SIZE = 30;        // 坦克命中盒

  // 地图（.空地 B砖墙 S钢墙 E基地）
  const MAP_SRC = [
    ".............",
    ".BB...BB...BB.",
    ".BB...BB...BB.",
    ".............",
    "...SS...SS...",
    "...SS...SS...",
    ".............",
    ".....BBB.....",
    ".....BBB.....",
    ".............",
    ".............",
    ".....BBB.....",
    ".....BEB....."
  ];

  const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  const ENEMY_TOTAL = 20;          // 敌军总数
  const ENEMY_MAX_ALIVE = 4;       // 场上同时最多 4 辆
  const ENEMY_SPAWNS = [0, 6, 12]; // 三个出生点列
  const PLAYER_SPAWN = { x: 1, y: 12, dir: "up" };
  const BASE_POS = { x: 6, y: 12 };
  const PLAYER_LIVES = 3;

  /* ---------- 状态 ---------- */
  let map = [];            // 二维字符数组
  let state = "READY";     // READY | PLAYING | PAUSED | WIN | OVER
  let player = null;
  let enemies = [];        // 在场敌人
  let bullets = [];        // 子弹（含我方/敌方，含 owner）
  let particles = [];      // 爆炸粒子
  let score = 0;
  let lives = PLAYER_LIVES;
  let spawnQueue = [];     // 待生成敌人类型
  let spawnTimer = 0;
  let rafId = null;
  let lastTime = 0;
  let running = false;

  /* ---------- 键盘 / 触屏输入 ---------- */
  const keys = {};
  let touchDir = null;     // 触屏方向（up/down/left/right/null）
  let touchFire = false;

  /* ---------- 画布上方 HUD ---------- */
  const box = canvas.parentElement;
  const hud = document.createElement("div");
  hud.style.cssText = "position:absolute;top:8px;left:12px;right:12px;z-index:3;display:flex;justify-content:space-between;gap:10px;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.05em;color:rgba(255,255,255,.75);pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.5);";
  box.appendChild(hud);

  function renderHud() {
    hud.innerHTML = "<span>SCORE " + String(score).padStart(5, "0") + "</span>"
      + "<span>LIVES " + lives + "</span>"
      + "<span>ENEMY " + spawnQueue.length + "</span>";
  }

  /* ---------- 地图 ---------- */
  function buildMap() {
    map = MAP_SRC.map(function (row) { return row.split(""); });
  }

  function cellAt(cx, cy) {
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return "X"; // 边界视为实心
    return map[cy][cx];
  }

  function isSolidChar(c) {
    return c === "B" || c === "S" || c === "E" || c === "X";
  }

  /* ---------- 实体工具 ---------- */
  function tankRect(t) {
    const inset = (TANK_SIZE - HIT_SIZE) / 2;
    return { x: t.x + inset, y: t.y + inset, w: HIT_SIZE, h: HIT_SIZE };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* 检测坦克在给定位置的矩形与地图是否碰撞 */
  function tankHitsMap(r) {
    const x0 = Math.floor(r.x / CELL), x1 = Math.floor((r.x + r.w - 1) / CELL);
    const y0 = Math.floor(r.y / CELL), y1 = Math.floor((r.y + r.h - 1) / CELL);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (isSolidChar(cellAt(cx, cy))) return true;
      }
    }
    return false;
  }

  /* 坦克是否与其他坦克重叠（可选忽略项） */
  function tankHitsTank(t, ignore) {
    const r = tankRect(t);
    const all = [player].concat(enemies).filter(function (o) { return o && o !== ignore && o.alive; });
    for (let i = 0; i < all.length; i++) {
      if (rectsOverlap(r, tankRect(all[i]))) return true;
    }
    return false;
  }

  /* ---------- 生成坦克 ---------- */
  function makeTank(cx, cy, dir, type) {
    return {
      x: cx * CELL + (CELL - TANK_SIZE) / 2,
      y: cy * CELL + (CELL - TANK_SIZE) / 2,
      dir: dir,
      type: type,                 // 'player' | 'basic' | 'fast'
      alive: true,
      invuln: 0,                  // 无敌剩余秒数
      fireCd: 0,
      aiTimer: rand(1.0, 2.2),    // AI 决策计时
      aiFireCd: rand(1.2, 2.6),
      speed: type === "player" ? 92 : (type === "fast" ? 64 : 46)
    };
  }

  /* ---------- 子弹 ---------- */
  function fireBullet(t) {
    const d = DIRS[t.dir];
    const cx = t.x + TANK_SIZE / 2 + d[0] * (TANK_SIZE / 2 + 6);
    const cy = t.y + TANK_SIZE / 2 + d[1] * (TANK_SIZE / 2 + 6);
    bullets.push({
      x: cx, y: cy,
      dir: t.dir,
      owner: t.type === "player" ? "player" : "enemy",
      speed: t.type === "player" ? 240 : 170,
      dead: false
    });
  }

  /* ---------- 粒子 ---------- */
  function explode(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = rand(40, 180);
      particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        r: rand(2, 6),
        life: rand(0.3, 0.7),
        maxLife: 0.7,
        color: color || (Math.random() < 0.5 ? "#f2b134" : "#e2692e")
      });
    }
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ---------- 重置 / 开始 ---------- */
  function reset() {
    buildMap();
    score = 0;
    lives = PLAYER_LIVES;
    bullets = [];
    particles = [];
    enemies = [];
    spawnQueue = [];
    // 敌人队列：5 辆快速 + 15 辆普通，随机混排
    for (let i = 0; i < ENEMY_TOTAL; i++) spawnQueue.push(i < 15 ? "basic" : "fast");
    for (let i = spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = spawnQueue[i]; spawnQueue[i] = spawnQueue[j]; spawnQueue[j] = tmp;
    }
    spawnTimer = 0;
    player = makeTank(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.dir, "player");
    player.invuln = 2;
    renderHud();
  }

  function start() {
    reset();
    setState("PLAYING");
  }

  function setState(s) {
    state = s;
    updateOverlay();
    if (s === "PLAYING") startLoop();
    else stopLoop();
  }

  function gameOver(reason) {
    explode(BASE_POS.x * CELL + CELL / 2, BASE_POS.y * CELL + CELL / 2, "#ff6b35", 26);
    // 大爆炸视觉：基地消失
    map[BASE_POS.y][BASE_POS.x] = ".";
    setState(reason === "base" ? "OVER" : "OVER");
    // 记录失败原因供 overlay 显示
    window.__tankOverReason = reason;
    updateOverlay();
  }

  function win() {
    setState("WIN");
  }

  /* ---------- 循环控制 ---------- */
  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    update(dt);
    render();
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ---------- 更新 ---------- */
  function update(dt) {
    if (state !== "PLAYING") return;

    updatePlayer(dt);
    updateEnemies(dt);
    updateSpawning(dt);
    updateBullets(dt);
    updateParticles(dt);

    // 胜利判定
    if (spawnQueue.length === 0 && enemies.length === 0) win();
  }

  function updatePlayer(dt) {
    if (!player || !player.alive) return;
    if (player.invuln > 0) player.invuln -= dt;

    // 键盘方向
    let dir = null;
    if (keys["ArrowUp"] || keys["KeyW"]) dir = "up";
    else if (keys["ArrowDown"] || keys["KeyS"]) dir = "down";
    else if (keys["ArrowLeft"] || keys["KeyA"]) dir = "left";
    else if (keys["ArrowRight"] || keys["KeyD"]) dir = "right";
    // 触屏方向优先
    if (touchDir) dir = touchDir;

    if (dir) moveTank(player, dir, dt);

    // 开火
    if (keys["Space"] || touchFire) {
      if (player.fireCd <= 0) {
        fireBullet(player);
        player.fireCd = 0.34;
      }
    }
    if (player.fireCd > 0) player.fireCd -= dt;
  }

  /* 通用坦克移动：换道对齐 + 碰撞检测 */
  function moveTank(t, dir, dt) {
    const d = DIRS[dir];
    t.dir = dir;

    // 换向时对齐到格线，保证走直线
    if (d[0] !== 0) t.y = Math.round(t.y / CELL) * CELL;
    if (d[1] !== 0) t.x = Math.round(t.x / CELL) * CELL;

    const step = t.speed * dt;
    let nx = t.x + d[0] * step;
    let ny = t.y + d[1] * step;

    // 若新位置撞地图，贴边回退
    const probe = { x: nx, y: ny };
    if (tankHitsMap(tankRect(probe))) {
      if (d[0] !== 0) nx = (d[0] > 0 ? Math.floor((t.x + TANK_SIZE) / CELL) * CELL - TANK_SIZE : Math.ceil(t.x / CELL) * CELL);
      if (d[1] !== 0) ny = (d[1] > 0 ? Math.floor((t.y + TANK_SIZE) / CELL) * CELL - TANK_SIZE : Math.ceil(t.y / CELL) * CELL);
    }

    // 边界限制
    nx = Math.max(0, Math.min(COLS * CELL - TANK_SIZE, nx));
    ny = Math.max(0, Math.min(ROWS * CELL - TANK_SIZE, ny));

    // 与其它坦克碰撞则不移动
    const probe2 = { x: nx, y: ny };
    if (!tankHitsMap(tankRect(probe2)) && !tankHitsTank(probe2, t)) {
      t.x = nx;
      t.y = ny;
    }
  }

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e.alive) { enemies.splice(i, 1); continue; }

      // AI：定期重新决策
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        e.aiTimer = rand(0.8, 2.2);
        const r = Math.random();
        if (r < 0.55) {
          // 转向
          const dirs = ["up", "down", "left", "right"];
          e.dir = dirs[Math.floor(Math.random() * 4)];
        } else if (r < 0.85) {
          // 开火
          if (e.aiFireCd <= 0) {
            fireBullet(e);
            e.aiFireCd = rand(1.4, 2.8);
          }
        } else {
          // 保持当前方向继续走
        }
      }
      if (e.aiFireCd > 0) e.aiFireCd -= dt;

      // 若当前方向被堵（撞墙），立即换向
      const d = DIRS[e.dir];
      const probe = { x: e.x + d[0] * 2, y: e.y + d[1] * 2 };
      if (tankHitsMap(tankRect(probe)) || tankHitsTank(probe, e)) {
        const dirs = ["up", "down", "left", "right"];
        e.dir = dirs[Math.floor(Math.random() * 4)];
      } else {
        moveTank(e, e.dir, dt);
      }
    }
  }

  function updateSpawning(dt) {
    if (spawnQueue.length === 0 || enemies.length >= ENEMY_MAX_ALIVE) return;
    spawnTimer -= dt;
    if (spawnTimer > 0) return;

    const type = spawnQueue.shift();
    // 找空闲出生点
    const spots = ENEMY_SPAWNS.slice();
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = spots[i]; spots[i] = spots[j]; spots[j] = t;
    }
    for (let k = 0; k < spots.length; k++) {
      const cx = spots[k];
      const e = makeTank(cx, 0, "down", type);
      if (!tankHitsTank(e, null)) {
        e.invuln = 1.2;
        enemies.push(e);
        break;
      }
    }
    spawnTimer = 1.1;
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (b.dead) { bullets.splice(i, 1); continue; }

      const d = DIRS[b.dir];
      b.x += d[0] * b.speed * dt;
      b.y += d[1] * b.speed * dt;

      // 出界
      if (b.x < -6 || b.x > COLS * CELL + 6 || b.y < -6 || b.y > ROWS * CELL + 6) {
        b.dead = true;
        continue;
      }

      // 撞地图
      const cx = Math.floor(b.x / CELL);
      const cy = Math.floor(b.y / CELL);
      const cell = cellAt(cx, cy);
      if (cell === "B") {
        map[cy][cx] = ".";
        explode(b.x, b.y, "#c1703a", 6);
        b.dead = true;
        continue;
      }
      if (cell === "S") {
        if (b.owner === "player") {
          // 我方子弹两发击穿钢墙
          map[cy][cx] = "s"; // 半损标记
        }
        explode(b.x, b.y, "#cfd8e3", 5);
        b.dead = true;
        continue;
      }
      if (cell === "s") {
        map[cy][cx] = ".";
        explode(b.x, b.y, "#cfd8e3", 8);
        b.dead = true;
        continue;
      }
      if (cell === "E") {
        // 基地被毁
        explode(b.x, b.y, "#ff6b35", 14);
        b.dead = true;
        gameOver("base");
        continue;
      }

      // 撞坦克
      if (b.owner === "player") {
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          if (!e.alive) continue;
          const r = tankRect(e);
          if (b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h) {
            e.alive = false;
            score += e.type === "fast" ? 200 : 100;
            explode(b.x, b.y, null, 16);
            b.dead = true;
            enemies.splice(j, 1);
            renderHud();
            break;
          }
        }
      } else {
        // 敌方子弹打我
        if (player && player.alive && player.invuln <= 0) {
          const r = tankRect(player);
          if (b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h) {
            b.dead = true;
            explode(b.x, b.y, null, 14);
            playerLoseLife();
          }
        }
      }

      // 子弹互撞（我方 vs 敌方）
      if (!b.dead && b.owner === "player") {
        for (let j = 0; j < bullets.length; j++) {
          const o = bullets[j];
          if (o === b || o.dead || o.owner !== "enemy") continue;
          if (Math.abs(o.x - b.x) < 8 && Math.abs(o.y - b.y) < 8) {
            b.dead = true;
            o.dead = true;
            explode(b.x, b.y, "#f2b134", 8);
            break;
          }
        }
      }
    }
  }

  function playerLoseLife() {
    if (player) {
      player.alive = false;
      explode(player.x + TANK_SIZE / 2, player.y + TANK_SIZE / 2, null, 18);
    }
    lives--;
    renderHud();
    if (lives < 0) {
      gameOver("lives");
      return;
    }
    // 重生
    setTimeout(function () {
      if (state === "PLAYING") {
        player = makeTank(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.dir, "player");
        player.invuln = 2;
      }
    }, 900);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  /* ---------- 渲染 ---------- */
  function render() {
    // 背景
    ctx.fillStyle = "#10141c";
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

    renderMap();
    renderTanks();
    renderBullets();
    renderParticles();
  }

  function renderMap() {
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const c = map[cy][cx];
        const px = cx * CELL, py = cy * CELL;
        if (c === "B") {
          // 砖墙：橙色砖块 + 砖缝
          ctx.fillStyle = "#b5552a";
          ctx.fillRect(px, py, CELL, CELL);
          ctx.fillStyle = "#c9703f";
          for (let r = 0; r < 2; r++) {
            for (let b = 0; b < 2; b++) {
              ctx.fillRect(px + 1 + b * 20, py + 1 + r * 20, 18, 18);
            }
          }
          ctx.strokeStyle = "rgba(0,0,0,.25)";
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, CELL, CELL);
        } else if (c === "S") {
          // 钢墙：银灰 + 斜向高光
          ctx.fillStyle = "#7d8b99";
          ctx.fillRect(px, py, CELL, CELL);
          ctx.fillStyle = "#aab6c2";
          ctx.fillRect(px + 3, py + 3, CELL - 6, CELL - 6);
          ctx.fillStyle = "#d3dce5";
          ctx.fillRect(px + 3, py + 3, CELL - 6, 4);
          ctx.fillRect(px + 3, py + 3, 4, CELL - 6);
        } else if (c === "s") {
          // 钢墙（半损）
          ctx.fillStyle = "#5b6774";
          ctx.fillRect(px, py, CELL, CELL);
          ctx.strokeStyle = "#8492a0";
          ctx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
        } else if (c === "E") {
          // 基地：金色徽章
          ctx.fillStyle = "#ffd75e";
          ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
          ctx.fillStyle = "#b8860b";
          ctx.beginPath();
          ctx.arc(px + CELL / 2, py + CELL / 2, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff3c4";
          ctx.font = "bold 14px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("★", px + CELL / 2, py + CELL / 2 + 1);
        }
      }
    }
  }

  function drawTank(t) {
    const px = t.x, py = t.y;
    const bodyColor = t.type === "player" ? "#4a7ed1" : (t.type === "fast" ? "#e2692e" : "#c2503a");
    const dark = t.type === "player" ? "#2c5091" : "#8e3424";

    // 无敌闪烁
    if (t.invuln > 0 && Math.floor(t.invuln * 8) % 2 === 0) return;

    // 履带
    ctx.fillStyle = dark;
    ctx.fillRect(px + 2, py, 7, TANK_SIZE);
    ctx.fillRect(px + TANK_SIZE - 9, py, 7, TANK_SIZE);
    // 车身
    ctx.fillStyle = bodyColor;
    ctx.fillRect(px + 8, py + 4, TANK_SIZE - 16, TANK_SIZE - 8);
    // 炮塔
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(px + TANK_SIZE / 2, py + TANK_SIZE / 2, 7, 0, Math.PI * 2);
    ctx.fill();
    // 炮管：从炮塔中心向当前方向延伸（水平 16×4 / 垂直 4×16）
    ctx.fillStyle = bodyColor;
    const d = DIRS[t.dir];
    const bx = px + TANK_SIZE / 2;
    const by = py + TANK_SIZE / 2;
    if (d[0] !== 0) {
      ctx.fillRect(d[0] > 0 ? bx : bx - 16, by - 2, 16, 4);
    } else {
      ctx.fillRect(bx - 2, d[1] > 0 ? by : by - 16, 4, 16);
    }
  }

  function renderTanks() {
    for (let i = 0; i < enemies.length; i++) drawTank(enemies[i]);
    if (player && player.alive) drawTank(player);
  }

  function renderBullets() {
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      ctx.fillStyle = b.owner === "player" ? "#ffd75e" : "#ff8a5c";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function renderParticles() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 遮罩层 ---------- */
  const overlay = document.getElementById("game-overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySub = document.getElementById("overlay-sub");
  const overlayBtn = document.getElementById("overlay-btn");

  function updateOverlay() {
    if (!overlay) return;
    overlay.classList.remove("hidden");
    if (state === "PLAYING") {
      overlay.classList.add("hidden");
      return;
    }
    if (state === "READY") {
      overlayTitle.textContent = "TANK BATTLE";
      overlaySub.textContent = "保护基地 · 消灭敌军";
      overlayBtn.textContent = "开始游戏";
    } else if (state === "PAUSED") {
      overlayTitle.textContent = "PAUSED";
      overlaySub.textContent = "按 P 或点击继续";
      overlayBtn.textContent = "继续";
    } else if (state === "WIN") {
      overlayTitle.textContent = "VICTORY!";
      overlaySub.textContent = "基地安全 · 敌军全灭 · 得分 " + score;
      overlayBtn.textContent = "再来一局";
    } else if (state === "OVER") {
      overlayTitle.textContent = window.__tankOverReason === "base" ? "基地被毁" : "GAME OVER";
      overlaySub.textContent = window.__tankOverReason === "base" ? "基地失守 · 得分 " + score : "坦克耗尽 · 得分 " + score;
      overlayBtn.textContent = "重新开始";
    }
  }

  function startFromOverlay() {
    if (state === "PLAYING") return;
    if (state === "PAUSED") { setState("PLAYING"); return; }
    start();
  }

  if (overlayBtn) overlayBtn.addEventListener("click", startFromOverlay);
  const startBtn = document.getElementById("game-start");
  if (startBtn) startBtn.addEventListener("click", function () { startFromOverlay(); });

  /* ---------- 键盘控制 ---------- */
  window.addEventListener("keydown", function (e) {
    const code = e.code;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyW", "KeyA", "KeyS", "KeyD"].indexOf(code) >= 0) {
      keys[code] = true;
      // 游戏进行中才拦截，避免影响页面滚动
      if (state === "PLAYING") e.preventDefault();
    }
    if (code === "KeyP" && (state === "PLAYING" || state === "PAUSED")) {
      setState(state === "PLAYING" ? "PAUSED" : "PLAYING");
    }
  });
  window.addEventListener("keyup", function (e) {
    keys[e.code] = false;
  });
  // 失焦清空按键，防止"卡键"
  window.addEventListener("blur", function () {
    for (const k in keys) keys[k] = false;
    if (state === "PLAYING") setState("PAUSED");
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && state === "PLAYING") setState("PAUSED");
  });

  /* ---------- 触屏按键（TouchBtn 模式：鼠标/触屏/防右键菜单全兼容） ---------- */
  const dirBtns = document.querySelectorAll(".touch-btn[data-dir]");
  const fireBtn = document.getElementById("touch-fire");

  function bindHold(el, onStart, onEnd) {
    if (!el) return;
    const start = function (e) {
      e.preventDefault();
      onStart();
    };
    const end = function () { onEnd(); };
    // Pointer Events 统一覆盖鼠标与触屏
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("pointerleave", end);
    // 无 Pointer 支持的兜底
    if (!window.PointerEvent) {
      el.addEventListener("mousedown", start);
      el.addEventListener("mouseup", end);
      el.addEventListener("mouseleave", end);
      el.addEventListener("touchstart", start, { passive: false });
      el.addEventListener("touchend", end);
      el.addEventListener("touchcancel", end);
    }
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  dirBtns.forEach(function (btn) {
    const dir = btn.getAttribute("data-dir");
    bindHold(btn,
      function () { touchDir = dir; },
      function () { if (touchDir === dir) touchDir = null; }
    );
  });
  bindHold(fireBtn,
    function () { touchFire = true; },
    function () { touchFire = false; }
  );

  /* ---------- 初始化 ---------- */
  reset();
  render();
  updateOverlay();

  window.TankGame = {
    start: start,
    pause: function () { if (state === "PLAYING") setState("PAUSED"); },
    resume: function () { if (state === "PAUSED") setState("PLAYING"); },
    getState: function () { return state; }
  };
})();
