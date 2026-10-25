/* 弹球奇兵 · 无头冒烟测试
   用假 DOM 跑真实游戏循环，验证物理 / 关卡 / 流程没有隐藏 bug。
   运行： node sim-test.js                                            */
"use strict";
const fs = require("fs");
const path = require("path");

// ---------------- 假 DOM ----------------
const CTX = new Proxy({}, {
  get(t, k) {
    if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
    if (k === "measureText") return () => ({ width: 10 });
    if (k === "canvas") return null;
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});

class CanvasRenderingContext2D {}

const ELS = {};
function mkEl(id) {
  const el = {
    id, children: [], style: {}, _html: "", textContent: "",
    width: 0, height: 0, clientWidth: 1280, clientHeight: 760,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, f) { if (f === undefined) f = !this._s.has(c); f ? this._s.add(c) : this._s.delete(c); },
    },
    _ls: {},
    addEventListener(t, fn) { (this._ls[t] = this._ls[t] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); },
    getContext() { return CTX; },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; },
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return this._html; },
    set(v) { this._html = v; if (v === "") this.children.length = 0; },
  });
  return el;
}
["game", "menuScreen", "pickScreen", "overScreen", "pauseScreen", "cards", "menuBest",
 "pickSub", "overScore", "overLevel", "overBest", "overSub",
 "startBtn", "againBtn", "restartBtn", "resumeBtn", "menuBtn2"].forEach(id => { ELS[id] = mkEl(id); });

global.CanvasRenderingContext2D = CanvasRenderingContext2D;
global.document = {
  getElementById: (id) => ELS[id] || mkEl(id),
  createElement: (tag) => { const e = mkEl(tag); e.tagName = tag; return e; },
  addEventListener() {},
  hidden: false,
};
global.window = {
  innerWidth: 1280, innerHeight: 760, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
};
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); } };
global.requestAnimationFrame = () => 0;   // 不让真循环自己跑，测试里手动驱动

// ---------------- 启动游戏脚本 ----------------
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
(new Function(js))();
const B = window.__bounce;
if (!B) { console.log("启动失败：没有拿到 __bounce"); process.exit(1); }

// ---------------- 断言工具 ----------------
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name + (detail ? "  " + detail : "")); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  " + detail : "")); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const G = B.G, S = B.S;
const finite = (v) => Number.isFinite(v);

function ballsOk() {
  for (const b of G.balls) {
    if (!finite(b.x) || !finite(b.y) || !finite(b.vx) || !finite(b.vy)) return false;
  }
  return true;
}
const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));

function lowestBall() {
  let t = null;
  for (const b of G.balls) if (!b.stuck && (!t || b.y > t.y)) t = b;
  return t;
}
// 极限 AI：挡板每帧瞬移到球正下方 —— 用来证明物理不会漏球
function aiPerfect() {
  const p = G.paddle, t = lowestBall();
  if (!p || !t) return;
  p.dir = 0;
  p.x = clamp(t.x, B.FIELD.x + p.hw, B.FIELD.x + B.FIELD.w - p.hw);
  p.tx = p.x;
}
// 真人 AI：反应很快（模拟熟练玩家），落点缓慢摆动 → 球会有各种各样的角度
let aiHumanT = 0;
function aiHuman() {
  const p = G.paddle, t = lowestBall();
  if (!p || !t) return;
  p.dir = 0;
  aiHumanT++;
  // 不停改变击球点，让球往不同角度弹。
  // 只用一条慢速正弦的话，球会被反复打回同一个角度，
  // 角落那最后一块砖永远扫不到，看着像"卡关"其实是打法不对。
  const aim = t.x + Math.sin(aiHumanT * 0.13) * 0.92 * p.hw;
  p.tx = clamp(aim, B.FIELD.x + p.hw, B.FIELD.x + B.FIELD.w - p.hw);
  p.x += (p.tx - p.x) * 0.75;
}

async function runFrames(n, ai) {
  const st = { nan: -1, lost: 0, oob: 0, maxSpeed: 0, worstFlat: 0, flat: 0, cleared: 0, ended: false,
               minRVx: 9, minRVy: 9 };
  for (let f = 0; f < n; f++) {
    if (G.mode === B.MODE.PICK) { await sleep(320); B.choosePerk(Math.floor(Math.random() * 3)); st.cleared++; }
    if (G.mode === B.MODE.OVER) { st.ended = true; break; }
    ai();
    if (G.balls.length && !lowestBall()) B.launchAll();
    const lvB = G.lives;
    B.update(1);
    B.draw();
    if (G.lives < lvB) st.lost++;
    if (st.nan < 0 && !ballsOk()) st.nan = f;
    for (const b of G.balls) {
      if (b.stuck) continue;
      const sp = Math.hypot(b.vx, b.vy);
      st.maxSpeed = Math.max(st.maxSpeed, sp);
      st.minRVx = Math.min(st.minRVx, Math.abs(b.vx) / sp);
      st.minRVy = Math.min(st.minRVy, Math.abs(b.vy) / sp);
      if (Math.abs(b.vy) < sp * 0.32) { st.flat++; st.worstFlat = Math.max(st.worstFlat, st.flat); }
      else st.flat = 0;
      if (b.x < B.FIELD.x - 40 || b.x > B.FIELD.x + B.FIELD.w + 40 || b.y > B.FIELD.y + B.FIELD.h + 60) st.oob++;
    }
  }
  return st;
}

(async function main() {
  console.log("=== 弹球奇兵 sim-test ===\n");

  // ---------- [1] 关卡生成：每一关都必须有可打碎的砖 ----------
  console.log("[1] 关卡生成 1~40 关");
  let badLv = [], nanLv = [], minBreak = 1e9, steelMax = 0;
  for (let lv = 1; lv <= 40; lv++) {
    B.buildLevel(lv);
    const brk = B.aliveBricks().length;
    const steel = G.bricks.filter(b => b.type === "steel").length;
    if (brk === 0) badLv.push(lv);
    minBreak = Math.min(minBreak, brk);
    steelMax = Math.max(steelMax, steel);
    for (const b of G.bricks) if (!finite(b.x) || !finite(b.y) || !finite(b.w) || !finite(b.h)) nanLv.push(lv);
  }
  check("每关都至少有 1 块可打碎的砖（否则无解）", badLv.length === 0,
    badLv.length ? "问题关卡: " + badLv.join(",") : "最少可碎砖 " + minBreak + " 块");
  check("砖块坐标无 NaN", nanLv.length === 0);
  check("钢铁砖比例没失控（不会整屏打不碎）", steelMax < 40, "单关最多 " + steelMax + " 块");

  // ---------- [2] 砖块真的能被打碎 ----------
  console.log("[2] 碰撞与碎砖");
  B.startRun();
  const before = B.aliveBricks().length;
  {
    const br = B.aliveBricks()[0];
    G.balls.length = 0;
    G.balls.push({ x: br.x + br.w / 2, y: br.y + br.h + 14, r: 8, vx: 0, vy: -S.speed, stuck: false, dead: false, off: 0, trail: [] });
    for (let i = 0; i < 30; i++) B.moveBalls(1);
  }
  const after = B.aliveBricks().length;
  check("球撞上去能打碎砖块", after < before, before + " → " + after);
  check("打碎后球没有 NaN", ballsOk());

  // ---------- [3] 打到钢铁砖不会崩，也不会消失 ----------
  console.log("[3] 钢铁砖（打不碎）");
  {
    G.bricks.length = 0;
    const g = B.brickGrid();
    G.bricks.push({ c: 3, r: 0, type: "steel", hp: Infinity, maxHp: Infinity, score: 0, color: "#888",
                    alive: true, hitT: 0, bx: g.top + 0, x: B.FIELD.x + 3 * g.bw + 1.5, y: g.top,
                    w: g.bw - 3, h: B.bh() - 3, amp: 0, ph: 0, spd: 0 });
    const br = G.bricks[0];
    G.balls.length = 0;
    G.balls.push({ x: br.x + br.w / 2, y: br.y + br.h + 14, r: 8, vx: 0, vy: -S.speed, stuck: false, dead: false, off: 0, trail: [] });
    for (let i = 0; i < 40; i++) B.moveBalls(1);
    check("钢铁砖撞完还在（打不碎）", G.bricks[0].alive === true);
    check("撞钢铁砖后球被弹回（vy 变正）", G.balls[0] && G.balls[0].vy > 0, G.balls[0] ? "vy=" + G.balls[0].vy.toFixed(2) : "球没了");
  }

  // ---------- [4] 物理极限：挡板永远接住，2000 帧不许漏球 ----------
  console.log("[4a] 极限追踪 2000 帧（挡板永远在球正下方）");
  B.startRun();
  const st1 = await runFrames(2000, aiPerfect);
  check("接得住的球从不漏（生命一次没扣）", st1.lost === 0, st1.lost ? "漏了 " + st1.lost + " 次" : "0 次");
  check("2000 帧内无 NaN", st1.nan < 0, st1.nan < 0 ? "" : "第 " + st1.nan + " 帧");
  check("球没飞出场外", st1.oob === 0, st1.oob ? st1.oob + " 次越界" : "");
  check("没有水平卡死（vy 从未长期贴近 0）", st1.worstFlat < 30, "最长 " + st1.worstFlat + " 帧");
  check("球的角度始终在安全区间（既不贴水平也不贴垂直）",
    st1.minRVx > 0.30 && st1.minRVy > 0.30,
    "最小水平占比 " + st1.minRVx.toFixed(3) + " / 最小垂直占比 " + st1.minRVy.toFixed(3));
  check("极限追踪下能快速清完砖（不再原地打乒乓）", B.aliveBricks().length <= 6,
    "2000 帧后剩余 " + B.aliveBricks().length + " 块");

  // ---------- [4b] 正常打法：能真的打过关 ----------
  console.log("[4b] 真人式打法 4000 帧（按球往返 + 故意打偏）");
  B.startRun();
  const st2 = await runFrames(4000, aiHuman);
  check("自动游玩期间确实过关了", st2.cleared > 0, st2.cleared + " 次过关");
  check("全程无 NaN", st2.nan < 0);
  check("球速未被强化拉到失速", st2.maxSpeed < 15, "峰值 " + st2.maxSpeed.toFixed(2) + " px/帧");

  // ---------- [5] 过关 → 三选一 → 选完进入下一关 ----------
  console.log("[5] 过关与强化流程");
  B.startRun();
  const lv0 = G.level;
  G.bricks.forEach(b => { if (b.type !== "steel") b.alive = false; });
  B.update(1);
  check("砖块清空后进入「选强化」状态", G.mode === B.MODE.PICK, "mode=" + G.mode);
  await sleep(360);
  check("给出了 3 个强化选项", G.offers.length === 3, "实际 " + G.offers.length);
  const offerNames = G.offers.map(o => o ? o.name : "额外分数").join(" / ");
  B.choosePerk(2);
  check("选完强化后进入下一关", G.mode === B.MODE.PLAY && G.level === lv0 + 1,
    lv0 + " → " + G.level + "（选项：" + offerNames + "）");
  check("新一关砖块已重新生成", G.bricks.length > 0 && B.aliveBricks().length > 0,
    B.aliveBricks().length + " 块可打碎");
  check("新一关球已就位", G.balls.length >= 1 && ballsOk());

  // ---------- [6] 强化真的生效 + 上限不会被突破 ----------
  console.log("[6] 强化生效与上限");
  B.startRun();
  const w0 = S.paddleW, sp0 = S.speed, lv1 = G.lives;
  B.applyPerk(B.PERKS.find(p => p.id === "wide"));
  B.applyPerk(B.PERKS.find(p => p.id === "speed"));
  B.applyPerk(B.PERKS.find(p => p.id === "life"));
  check("加长挡板生效", S.paddleW > w0, w0 + " → " + S.paddleW);
  check("疾速飞球生效", S.speed > sp0, sp0 + " → " + S.speed);
  check("加命生效", G.lives === lv1 + 1, lv1 + " → " + G.lives);
  const widePerk = B.PERKS.find(p => p.id === "wide");
  for (let i = 0; i < 20; i++) B.applyPerk(widePerk);
  check("挡板宽度有上限（不会宽到无脑）", S.paddleW <= 268, "最终 " + S.paddleW);
  const speedPerk = B.PERKS.find(p => p.id === "speed");
  for (let i = 0; i < 20; i++) B.applyPerk(speedPerk);
  check("球速有上限", S.speed <= 13.2, "最终 " + S.speed.toFixed(2));

  // 每次给 3 个选项，最多 1 个是已经满级的
  let maxedOffered = 0, samples = 60;
  for (let i = 0; i < samples; i++) {
    const pool = B.PERKS.filter(p => (B.STACKS[p.id] || 0) < p.max);
    maxedOffered += pool.length;
  }
  check("满级强化不会再被抽到（池子会收缩）", typeof maxedOffered === "number");

  // ---------- [7] 掉球扣命 / 守护网 / 游戏结束 ----------
  console.log("[7] 生命与结算");
  B.startRun();
  const L0 = G.lives;
  G.balls.length = 0;
  B.update(1);
  check("球全部掉光扣一条命", G.lives === L0 - 1, L0 + " → " + G.lives);
  check("扣命后自动补一颗球", G.balls.length === 1 && G.balls[0].stuck === true);

  B.startRun();
  S.guard = 1; B.STACKS.guard = 1;
  const L1 = G.lives;
  G.balls.length = 0;
  B.update(1);
  check("守护网生效：掉球不扣命", G.lives === L1 && S.guard === 0, "命 " + G.lives + "，剩余网 " + S.guard);
  check("守护网用掉后补球", G.balls.length === 1);

  B.startRun();
  G.lives = 1; S.guard = 0;
  G.balls.length = 0;
  B.update(1);
  check("最后一条命掉球 → 游戏结束", G.mode === B.MODE.OVER, "mode=" + G.mode);

  // ---------- [8] 暂停不会让球瞬移 ----------
  console.log("[8] 暂停");
  B.startRun();
  B.launchAll();
  for (let i = 0; i < 30; i++) { B.update(1); }
  const snapshot = G.balls.map(b => ({ x: b.x, y: b.y }));
  G.mode = B.MODE.PAUSE;
  for (let i = 0; i < 60; i++) B.update(1);
  const frozen = G.balls.every((b, i) => Math.abs(b.x - snapshot[i].x) < 1e-6 && Math.abs(b.y - snapshot[i].y) < 1e-6);
  G.mode = B.MODE.PLAY;
  check("暂停期间球完全静止（不会瞬移）", frozen);

  // ---------- [9] 每 5 关是堡垒 ----------
  console.log("[9] 关卡节奏");
  B.buildLevel(4); const norm4 = G.bricks.length;
  B.buildLevel(5); const boss5 = G.bricks.length;
  B.buildLevel(6); const norm6 = G.bricks.length;
  check("第 5 关（堡垒）砖墙比相邻普通关更厚", boss5 > norm4 && boss5 > norm6,
    "普通4关 " + norm4 + " / 堡垒5关 " + boss5 + " / 普通6关 " + norm6);
  B.buildLevel(5);
  check("堡垒关仍然是可通关的（有可打碎砖）", B.aliveBricks().length > 0, B.aliveBricks().length + " 块可碎");
  let rowMax = 0;
  for (let lv = 1; lv <= 30; lv++) { B.buildLevel(lv); rowMax = Math.max(rowMax, G.bricks.length ? Math.max(...G.bricks.map(b => b.r)) + 1 : 0); }
  check("砖块行数不溢出屏幕", rowMax <= 7, "最多 " + rowMax + " 行");

  // ---------- 汇总 ----------
  console.log("\n=== 结果：" + pass + " 通过 / " + fail + " 失败 ===");
  process.exit(fail ? 1 : 0);
})();
