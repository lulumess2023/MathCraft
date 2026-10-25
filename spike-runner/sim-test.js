/**
 * spike-runner 无头冒烟测试
 * 用假 DOM / 假 canvas 跑真实游戏循环，验证：
 *   1. 长时间运行不抛异常
 *   2. 玩家会被障碍打倒（待救援状态出现）
 *   3. 队友按救援键能把他救起来
 *   4. 两人都出局后进入结算界面
 *   5. 「再来一次」能正常重置
 * 运行： node sim-test.js
 */
const fs = require("fs");
const path = require("path");

// ---------- 假 DOM ----------
function makeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: (c, force) => { const on = force === undefined ? !set.has(c) : !!force; on ? set.add(c) : set.delete(c); return on; },
    _set: set,
  };
}
function makeCtx() {
  const g = { addColorStop() {} };
  const noop = () => {};
  return {
    globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "", lineJoin: "",
    font: "", textAlign: "",
    setTransform: noop, clearRect: noop, save: noop, restore: noop, translate: noop, rotate: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, quadraticCurveTo: noop,
    closePath: noop, fill: noop, stroke: noop, fillRect: noop, fillText: noop, strokeRect: noop,
    rect: noop, clip: noop, createLinearGradient: () => g, createRadialGradient: () => g,
    measureText: () => ({ width: 20 }), roundRect: noop,
  };
}
function makeEl(tag) {
  return {
    tagName: (tag || "div").toUpperCase(),
    className: "", textContent: "", innerHTML: "",
    width: 300, height: 150, clientWidth: 960, clientHeight: 540,
    style: {}, children: [],
    classList: makeClassList(),
    _handlers: {},
    addEventListener(type, fn) { (this._handlers[type] = this._handlers[type] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    getContext() { if (!this._ctx) this._ctx = makeCtx(); return this._ctx; },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; },
    dispatch(type, ev) { (this._handlers[type] || []).forEach((f) => f(ev || {})); },
  };
}

const els = {};
["game", "hudNote", "rescue1", "rescue2", "menuScreen", "endScreen",
 "grid1", "grid2", "p1name", "p2name", "startBtn", "restartBtn", "menuBtn",
 "endScore", "endSub", "endBest", "s1name", "s2name", "s1rescue", "s2rescue"]
  .forEach((id) => { els[id] = makeEl(id === "game" ? "canvas" : "div"); });

const winHandlers = {};
let rafCb = null, now = 0;

global.window = {
  devicePixelRatio: 1, innerWidth: 960, innerHeight: 540,
  addEventListener(type, fn) { (winHandlers[type] = winHandlers[type] || []).push(fn); },
  removeEventListener() {},
  AudioContext: undefined, webkitAudioContext: undefined,
};
global.document = {
  getElementById: (id) => els[id] || makeEl("div"),
  createElement: (tag) => makeEl(tag),
  addEventListener() {},
};
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); } };
global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => {};
// 让游戏里的 setTimeout（结算界面的延迟显示）同步执行，便于测试
global.setTimeout = (fn) => { try { fn(); } catch (e) {} return 0; };
global.CanvasRenderingContext2D = function () {};
global.CanvasRenderingContext2D.prototype.roundRect = function () {};

// ---------- 加载游戏脚本 ----------
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
eval(code);

// ---------- 工具 ----------
let errors = 0;
const origError = console.error;
console.error = (...a) => { errors++; origError(...a); };
function step(n, dtMs) { for (let i = 0; i < n; i++) { now += (dtMs || 16.7); rafCb(now); } }
function key(type, codeStr) { (winHandlers[type] || []).forEach((f) => f({ code: codeStr, repeat: false, preventDefault() {} })); }
function btnVisible(i) { return !els["rescue" + (i + 1)].classList.contains("hidden"); }
const results = [];
function check(name, ok, extra) { results.push(ok); console.log("    " + (ok ? "✓" : "✗") + " " + name + (extra ? "  " + extra : "")); }

// ---------- 测试 ----------
console.log("=== spike-runner 双人版 冒烟测试 ===\n");

console.log("[1] 菜单构建");
check("P1 有 8 个角色卡", els.grid1.children.length === 8, "(实际 " + els.grid1.children.length + ")");
check("P2 有 8 个角色卡", els.grid2.children.length === 8, "(实际 " + els.grid2.children.length + ")");

console.log("[1b] 一条线 / 只跳 —— 可玩性数值校验");
{
  const T = window.__spikeTuning;
  const airtime = 2 * T.JUMP_V / T.GRAV;           // 滞空帧数
  let vy = T.JUMP_V, apex = 0;
  while (vy > 0) { apex += vy; vy -= T.GRAV; }
  check("跳跃高度能越过最高障碍（木箱堆 " + T.MAX_OBSTACLE + "px）", apex > T.MAX_OBSTACLE,
    "跳高 " + apex.toFixed(0) + "px（余量 " + (apex - T.MAX_OBSTACLE).toFixed(0) + "px）");

  // 关键：最快速度下，两个障碍之间的最小间隔时间，必须大于一次跳跃的滞空时间
  const minGapSec = T.gapSecAt(1e9) * 0.92;        // 0.92 = 最小抖动系数
  check("最快时障碍间隔 > 一次跳跃滞空 + 0.15s", minGapSec > airtime * 0.01667 + 0.15,
    "间隔 " + minGapSec.toFixed(2) + "s vs 滞空 " + (airtime * 0.01667).toFixed(2) + "s");

  const src = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  check("已无「蹲」的操作提示", !/蹲/.test(src));
  check("障碍只剩木箱/石墩（无尖刺绘制）", !/drawSpike|airSpike|hedgehog/.test(src));
}

console.log("[1c] 节奏平衡模拟：完美玩家能不能一直跑下去？");
{
  const T = window.__spikeTuning;
  const VW = 960, GROUND = 420, PX = VW * 0.20, PW = 32, PH = 52, S = 4;
  function sim(leadFrames, maxFrames) {
    let speed = T.speedAt(0), distance = 0, spawnTimer = 1.2;
    let p = { y: GROUND, vy: 0, grounded: true };
    let obs = [], died = -1;
    for (let f = 0; f < maxFrames; f++) {
      spawnTimer -= 0.01667;
      if (spawnTimer <= 0) {
        const roll = Math.random();
        let w, h;
        if (roll < 0.45) { w = 40; h = 40; }
        else if (roll < 0.75) { w = 58; h = 32; }
        else { w = 34; h = T.MAX_OBSTACLE; }
        obs.push({ x: VW + 40, w, h });
        spawnTimer = T.gapSecAt(distance) * (0.92 + Math.random() * 0.3);
      }
      p.grounded = false; p.vy += T.GRAV; p.y += p.vy;
      if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.grounded = true; }
      for (const o of obs) o.x -= speed;
      obs = obs.filter(o => o.x + o.w / 2 > -60);

      const near = obs.find(o => (o.x - o.w / 2) > PX + PW / 2 - 4);
      if (p.grounded && near && (near.x - near.w / 2) - (PX + PW / 2) < speed * leadFrames) {
        p.vy = -T.JUMP_V; p.grounded = false;
      }

      const pb = { x: PX - PW / 2 + S, y: p.y - PH + S, w: PW - 2 * S, h: PH - 2 * S };
      for (const o of obs) {
        const b = { x: o.x - o.w / 2 + S, y: GROUND - o.h + S, w: o.w - 2 * S, h: o.h - 2 * S };
        if (pb.x < b.x + b.w && pb.x + pb.w > b.x && pb.y < b.y + b.h && pb.y + pb.h > b.y) { died = f; break; }
      }
      if (died >= 0) break;
      speed = T.speedAt(distance); distance += speed;
    }
    return { died, distance };
  }
  // 用几种「起跳提前量」各跑 60 局，看有没有哪种能做到 100% 存活
  let bestLead = null, bestRate = -1, bestDist = 0;
  for (const lead of [6, 8, 10, 12, 14, 16, 20]) {
    let alive = 0, maxD = 0;
    for (let k = 0; k < 60; k++) {
      const r = sim(lead, 90000);            // 90000 帧 ≈ 25 分钟
      if (r.died < 0) alive++;
      maxD = Math.max(maxD, r.distance);
    }
    const rate = alive / 60;
    if (rate > bestRate) { bestRate = rate; bestLead = lead; bestDist = maxD; }
    console.log("    提前 " + String(lead).padStart(2) + " 帧起跳 -> 存活 " + alive + "/60 局（最远 " + Math.floor(maxD / 8) + " 米）");
  }
  check("存在能长期存活的跳法（完美玩家 100% 存活）", bestRate === 1,
    "最佳提前量 " + bestLead + " 帧，最远跑到 " + Math.floor(bestDist / 8) + " 米");

  // 反向验证：完全不跳会很快撞死（说明障碍真的挡路）
  let noJumpDist = 0; { const r = sim(0, 20000); noJumpDist = r.distance; }
  // lead=0 时几乎贴脸才跳，作为「不太会玩」的下限参考
  check("障碍确实构成威胁（不跳会撞）", sim(-999, 3000).died >= 0, "不跳在 " + sim(-999, 3000).died + " 帧撞到");
}

console.log("[2] 选择角色");
els.grid2.children[6] && els.grid2.children[6].dispatch("click"); // P2 选第 7 个（白忍者）
els.grid1.children[2] && els.grid1.children[2].dispatch("click");
check("P1 名字已更新", !!els.p1name.textContent, "-> " + els.p1name.textContent);
check("P2 名字已更新", !!els.p2name.textContent, "-> " + els.p2name.textContent);

console.log("[3] 开始游戏");
els.startBtn.dispatch("click");
step(2);
check("菜单已隐藏", els.menuScreen.classList.contains("hidden"));

console.log("[4] 裸跑直到第一次有人被打倒（上限 1200 帧）");
let firstDown = -1, framesRun = 0;
for (let f = 0; f < 1200; f++) {
  step(1); framesRun++;
  if (btnVisible(0) || btnVisible(1)) { firstDown = f; break; }
}
check("运行无异常", errors === 0, "(" + errors + " 个错误，跑了 " + framesRun + " 帧)");
check("出现「待救援」状态", firstDown >= 0, firstDown >= 0 ? "(第 " + firstDown + " 帧)" : "1200 帧内无人被打倒");

console.log("[5] 救助机制：队友按键救人");
// 判定标准：按下救援键后，救援按钮应在几帧内消失（而不是等到 3 秒超时自动出局）
let rescueOk = false, rescueTried = 0, appearedFrames = 0, goneAfterPress = -1;
let pressedAt = -1;
for (let f = 0; f < 600; f++) {
  const shown = btnVisible(0) || btnVisible(1);
  if (shown) {
    appearedFrames++;
    if (pressedAt < 0) {
      if (btnVisible(0)) key("keydown", "KeyE");
      else key("keydown", "Slash");
      rescueTried++; pressedAt = f;
    }
  } else if (pressedAt >= 0 && goneAfterPress < 0) {
    goneAfterPress = f - pressedAt;   // 从按键到按钮消失的帧数
  }
  step(1);
  if (goneAfterPress >= 0 && goneAfterPress <= 10) { rescueOk = true; break; }
  if (appearedFrames > 0 && f - pressedAt > 200) break; // 等到超时说明没救活
}
check("队友能救起倒地者（键位 E / /）", rescueOk,
  "(按键 " + rescueTried + " 次，按键后 " + goneAfterPress + " 帧恢复" +
  (rescueOk ? "" : "，>10 帧说明是超时自动出局而非被救") + ")");

console.log("[6] 一路跑到两人都出局");
let over = false;
for (let f = 0; f < 8000; f++) {
  step(1);
  if (!els.endScreen.classList.contains("hidden")) { over = true; break; }
}
check("结算界面弹出", !els.endScreen.classList.contains("hidden"));
check("结算分数有值", els.endScore.textContent !== "" && !isNaN(+els.endScore.textContent), "分数=" + els.endScore.textContent);
check("最高分已记录", /最高分/.test(els.endBest.textContent), els.endBest.textContent);
check("统计了救人次数", els.s1rescue.textContent !== "" && els.s2rescue.textContent !== "",
  "P1 救 " + els.s1rescue.textContent + " 次 / P2 救 " + els.s2rescue.textContent + " 次");

console.log("[7] 再来一次");
els.restartBtn.dispatch("click");
step(3);
check("结算界面关闭", els.endScreen.classList.contains("hidden"));
check("重新开始后仍无异常", errors === 0);

console.log("\n=== " + (results.every(Boolean) ? "全部通过 PASS" : "存在失败 FAIL") +
  " | 通过 " + results.filter(Boolean).length + "/" + results.length + " | 异常 " + errors + " ===");
process.exit(results.every(Boolean) && errors === 0 ? 0 : 1);
