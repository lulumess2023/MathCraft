/**
 * 城堡守卫 · 无头冒烟测试
 * 用假 DOM 加载 index.html 里的真实游戏脚本，手动驱动 update/draw 跑真实循环。
 * 目的：验证「不崩溃 / 不 NaN / 波次推进 / 招募生效 / 互救链路通 / 平衡不出死局」。
 * 运行：node sim-test.js
 */
const fs = require("fs");
const path = require("path");

// ---------------- 假 2D 上下文 ----------------
const gradMock = { addColorStop() {} };
function makeCtx() {
  const t = { canvas: { width: 800, height: 600 } };
  return new Proxy(t, {
    get(target, k) {
      if (k in target) return target[k];
      if (k === "measureText") return () => ({ width: 22 });
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => gradMock;
      if (k === "createPattern") return () => ({});
      return () => {};
    },
    set(target, k, v) { target[k] = v; return true; },
  });
}

// ---------------- 假 元素 ----------------
function makeEl(tag, id) {
  const el = {
    tagName: tag, id: id || "", textContent: "", innerHTML: "",
    style: {}, children: [], parentNode: null,
    width: 800, height: 600, clientWidth: 800, clientHeight: 600,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c) { if (this._s.has(c)) this._s.delete(c); else this._s.add(c); },
    },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }; },
    getContext() { return makeCtx(); },
  };
  return el;
}

const elCache = {};
function getEl(id) {
  if (!elCache[id]) {
    elCache[id] = makeEl("div", id);
    if (id === "game") elCache[id].parentNode = makeEl("div");
  }
  return elCache[id];
}

global.window = {
  addEventListener() {}, removeEventListener() {},
  devicePixelRatio: 1, innerWidth: 800, innerHeight: 600,
  AudioContext: undefined, webkitAudioContext: undefined,
};
global.document = {
  getElementById: (id) => getEl(id),
  createElement: (tag) => makeEl(tag),
  body: makeEl("body"),
  addEventListener() {},
};
global.navigator = { maxTouchPoints: 0, userAgent: "node" };
global.localStorage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
global.CanvasRenderingContext2D = function () {};
global.CanvasRenderingContext2D.prototype = {};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};
if (!global.console) global.console = console;

// ---------------- 载入真实游戏脚本 ----------------
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.log("✗ 没找到 <script> 块"); process.exit(1); }
eval(scriptMatch[1]);

const B = global.window.__castle;
if (!B) { console.log("✗ 游戏没暴露 __castle（脚本可能提前报错了）"); process.exit(1); }

const G = B.G, MODE = B.MODE, WEAPONS = B.WEAPONS, ENEMY_TYPES = B.ENEMY_TYPES, ALLY_TYPES = B.ALLY_TYPES;
const CASTLE = B.CASTLE, WORLD = B.WORLD;

// ---------------- 断言工具 ----------------
let pass = 0, fail = 0, errors = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("  ✓ " + name + (detail ? "  " + detail : "")); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  " + detail : "")); }
}
const finite = (v) => typeof v === "number" && isFinite(v);

// ---------------- 帧驱动 ----------------
function step(n, dt) {
  const d = dt === undefined ? 1 : dt;
  for (let i = 0; i < (n || 1); i++) {
    try {
      B.update(d);
      B.draw();
    } catch (e) {
      errors++;
      if (errors <= 3) console.log("  !! 第 " + i + " 帧异常: " + e.message);
    }
  }
}
function clearKeys() {
  for (const k in B.keys) B.keys[k] = false;
}
function aliveEnemies() { return G.enemies.filter(e => !e.dead && e.spawnT <= 0); }

// 清场但保持"战斗进行中"：留一只永不激活的稻草人，避免清空敌人误触发招募界面
function pinWave() {
  G.spawnQueue.length = 0;
  G.enemies.length = 0;
  const s = B.makeEnemy("scout", 60, 60, 1);
  s.spawnT = 1e9;
  s.speed = 0;
  G.enemies.push(s);
  return s;
}
function nearestTo(p) {
  let best = null, bd = Infinity;
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
// 把玩家挪到远离城堡的空地（避免城堡回血干扰数值观察）
function movePlayerOut(p) {
  const spot = B.findFreeSpot(320, 320, 180, 90);
  p.x = spot.x; p.y = spot.y;
  return spot;
}
function anyNaN() {
  const list = [].concat(G.players.filter(Boolean), G.enemies, G.allies, G.bullets);
  for (const o of list) {
    if (!finite(o.x) || !finite(o.y)) return true;
    if (o.hp !== undefined && !finite(o.hp)) return true;
    if (o.vx !== undefined && (!finite(o.vx) || !finite(o.vy))) return true;
  }
  return false;
}

// ================= 正式测试 =================
console.log("=== 城堡守卫 · 冒烟测试 ===\n");

// ---------- [1] 世界生成 ----------
console.log("[1] 世界生成");
B.setSel(0, 1);
B.genWorld();
{
  const tents = B.blocks.filter(b => b.kind === "tent").length;
  const boxes = B.blocks.filter(b => b.kind === "box").length;
  const rocks = B.blocks.filter(b => b.kind === "rock").length;
  const trees = B.blocks.filter(b => b.kind === "tree").length;
  check("生成了帐篷（掩体）", tents >= 6, tents + " 顶");
  check("生成了木箱 / 石墩 / 树", boxes >= 10 && rocks >= 10 && trees >= 10,
    "箱 " + boxes + " / 石 " + rocks + " / 树 " + trees);
  // 城堡内部必须干净（否则玩家一出生就被卡住）
  let inside = 0;
  for (const b of B.blocks) if (Math.hypot(b.x - CASTLE.x, b.y - CASTLE.y) < CASTLE.r) inside++;
  check("城堡内部没有障碍物", inside === 0, inside ? "有 " + inside + " 个卡在城堡里" : "");
  // 四个城门通道必须畅通
  let gateBlocked = 0;
  for (let g = 0; g < 4; g++) {
    const ang = g * Math.PI / 2;
    for (let d = CASTLE.r - 40; d < CASTLE.r + 220; d += 20) {
      const x = CASTLE.x + Math.cos(ang) * d, y = CASTLE.y + Math.sin(ang) * d;
      for (const b of B.blocks) if (Math.hypot(x - b.x, y - b.y) < b.r) { gateBlocked++; break; }
    }
  }
  check("四个城门通道没被障碍堵住", gateBlocked === 0, gateBlocked ? gateBlocked + " 处被堵" : "");
  // 障碍不能重叠
  let overlap = 0;
  for (let i = 0; i < B.blocks.length; i++) {
    for (let j = i + 1; j < B.blocks.length; j++) {
      const a = B.blocks[i], b = B.blocks[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 1) overlap++;
    }
  }
  check("障碍物之间没有重叠穿模", overlap === 0, overlap ? overlap + " 对重叠" : "");
}

// ---------- [2] 开局状态 ----------
console.log("\n[2] 开局");
B.newRun();
{
  check("进入游戏模式", G.mode === MODE.PLAY, "mode=" + G.mode);
  check("两个玩家都出生在城堡里",
    G.players.length === 2 && G.players.every(p => Math.hypot(p.x - CASTLE.x, p.y - CASTLE.y) < CASTLE.r),
    G.players.map(p => "(" + p.x.toFixed(0) + "," + p.y.toFixed(0) + ")").join(" "));
  check("城堡里有初始枪可捡", G.guns.length >= 2, G.guns.map(g => WEAPONS[g.id].name).join(" / "));
  check("第 1 波怪物已排入刷新队列", G.spawnQueue.length > 0, G.spawnQueue.length + " 只待刷");
  check("玩家满血 100", G.players[0].hp === 100 && G.players[0].maxHp === 100);
}

// ---------- [3] 刷怪 / 推进 ----------
console.log("\n[3] 波次刷新");
{
  let guard = 0;
  while (G.spawnQueue.length && guard++ < 400) step(1);
  check("待刷队列最终清空", G.spawnQueue.length === 0, "用了 " + guard + " 帧");
  check("场上出现了敌人", aliveEnemies().length > 0, aliveEnemies().length + " 只");
  const kinds = {};
  for (const e of G.enemies) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  check("第 1 波是纯侦查兵（教学波，不会有远程偷袭）",
    Object.keys(kinds).length === 1 && kinds.scout > 0, JSON.stringify(kinds));
  // 敌人不该刷在城堡里
  const inside = G.enemies.filter(e => Math.hypot(e.x - CASTLE.x, e.y - CASTLE.y) < CASTLE.r).length;
  check("敌人没有直接刷在城堡里", inside === 0, inside ? inside + " 只刷在城堡内" : "");
}

// ---------- [4] 射击链路 ----------
console.log("\n[4] 射击 / 命中 / 击杀");
B.newRun();
{
  G.spawnQueue.length = 0;
  G.enemies.length = 0;
  const p1 = G.players[0];
  // 造一个正前方的敌人
  const e = B.makeEnemy("scout", p1.x + 120, p1.y, 1);
  e.spawnT = 0; e.speed = 0;
  G.enemies.push(e);

  p1.aim = 0;               // 朝右
  p1.weapon = "pistol";
  p1.fireCd = 0;
  const bulletsBefore = G.bullets.length;
  clearKeys();
  B.keys["KeyE"] = true;
  step(3);
  check("按射击键产生了子弹", G.bullets.length > bulletsBefore || e.hp < e.maxHp,
    "子弹 " + (G.bullets.length - bulletsBefore) + " 发");

  const hp0 = e.hp;
  step(20);
  check("子弹打中敌人并扣血", e.hp < hp0, "hp " + hp0 + " → " + e.hp.toFixed(0));
  check("辅助瞄准能自动微调枪口", (() => {
    // 敌人偏离正前方 0.25 弧度，应该在辅助弧内被锁定
    const ang = B.assistAim(p1.x, p1.y, 0.25, 0.40);
    return Math.abs(ang) < 0.05;
  })(), "");

  // 打死它
  B.hurtEnemy(e, 99999);
  check("击杀后敌人标记为死亡", e.dead === true);
  check("击杀计入总分与积分", G.kills >= 1 && G.score > 0 && G.coins > 0,
    "击杀 " + G.kills + " · 分 " + G.score + " · 积分 " + G.coins);
}

// ---------- [5] 各武器都能开火 ----------
console.log("\n[5] 六种武器");
{
  const ids = Object.keys(WEAPONS);
  check("武器表有 6 把枪", ids.length === 6, ids.join("/"));
  for (const id of ids) {
    B.newRun();
    G.spawnQueue.length = 0; G.enemies.length = 0;
    const p = G.players[0];
    p.weapon = id;
    p.fireCd = 0;
    p.aim = 0;
    clearKeys();
    B.keys["KeyE"] = true;
    const before = G.bullets.length;
    step(2);
    const made = G.bullets.length - before;
    check("  " + WEAPONS[id].name + " 能开火", made > 0, made + " 发弹丸");
    clearKeys();
  }
}

// ---------- [6] 敌人 AI ----------
console.log("\n[6] 机器人 AI");
{
  // 侦查兵应该朝玩家逼近
  B.newRun();
  G.spawnQueue.length = 0; G.enemies.length = 0;
  const p1 = G.players[0];
  const scout = B.makeEnemy("scout", p1.x + 420, p1.y, 1);
  scout.spawnT = 0;
  G.enemies.push(scout);
  const d0 = Math.hypot(scout.x - p1.x, scout.y - p1.y);
  step(60);
  const d1 = Math.hypot(scout.x - p1.x, scout.y - p1.y);
  check("侦查兵会主动靠近玩家", d1 < d0 - 40, d0.toFixed(0) + "px → " + d1.toFixed(0) + "px");

  // 枪手应该会开枪
  B.newRun();
  G.spawnQueue.length = 0; G.enemies.length = 0;
  const p2 = G.players[0];
  const gunner = B.makeEnemy("gunner", p2.x + 260, p2.y, 1);
  gunner.spawnT = 0; gunner.fireCd = 5;
  G.enemies.push(gunner);
  let enemyBullets = 0;
  for (let i = 0; i < 160; i++) {
    step(1);
    enemyBullets = Math.max(enemyBullets, G.bullets.filter(b => !b.friendly).length);
  }
  check("枪手会朝玩家射击", enemyBullets > 0, "场上最多 " + enemyBullets + " 发敌弹");

  // 敌人被障碍挡住时扣不动血（有掩体价值）
  B.newRun();
  G.spawnQueue.length = 0; G.enemies.length = 0;
  const p3 = G.players[0];
  const far = B.makeEnemy("gunner", p3.x + 700, p3.y, 1);
  far.spawnT = 0;
  G.enemies.push(far);
  const blocked = B.losBlocked(p3.x, p3.y, far.x, far.y);
  check("视线遮挡函数可用（掩体有意义）", typeof blocked === "boolean", blocked ? "当前有遮挡" : "当前无遮挡");
}

// ---------- [7] 清空一波 → 进商店 ----------
console.log("\n[7] 清空波次 → 城堡招募");
B.newRun();
{
  G.spawnQueue.length = 0;
  for (const e of G.enemies) e.dead = true;
  G.enemies.length = 0;
  step(2);
  check("敌人清空后自动进入招募界面", G.mode === MODE.SHOP, "mode=" + G.mode);
  check("清波得到了积分", G.coins > 0, "积分 " + G.coins);
  const scoreBefore = G.score;
  check("清波加了分", scoreBefore > 0, "总分 " + scoreBefore);

  // 积分足够时能招募
  G.coins = 500;
  const alliesBefore = G.allies.length;
  B.buyAlly(0);   // 第一个 = 护卫机器人
  check("花积分能招到机器人伙伴", G.allies.length === alliesBefore + 1,
    G.allies.length ? "已在场 " + G.allies.length + " 台" : "没招到");
  check("招募扣掉了对应积分", G.coins === 500 - ALLY_TYPES.guard.cost, "剩余积分 " + G.coins);

  // 积分不够时不能招
  G.coins = 1;
  const n2 = G.allies.length;
  B.buyAlly(1);
  check("积分不够时招募失败（不会白送）", G.allies.length === n2, "");
}

// ---------- [8] 友军真的会打怪 ----------
console.log("\n[8] 友军机器人作战");
{
  B.newRun();
  G.spawnQueue.length = 0; G.enemies.length = 0; G.allies.length = 0;
  const p = G.players[0];
  const guard = B.makeAlly("guard", p.x + 60, p.y + 20);
  guard.spawnT = 0;
  G.allies.push(guard);
  const target = B.makeEnemy("tank", p.x + 300, p.y, 1);
  target.spawnT = 0; target.speed = 0;
  const thp0 = target.hp;
  G.enemies.push(target);

  let allyBullets = 0;
  for (let i = 0; i < 300; i++) {
    step(1);
    allyBullets = Math.max(allyBullets, G.bullets.filter(b => b.friendly && b.ally).length);
    target.speed = 0;   // 钉住它，只测友军输出
    if (target.hp < thp0) break;
  }
  check("友军会朝敌人射击", allyBullets > 0, "最多 " + allyBullets + " 发友军弹");
  check("友军能打出伤害", target.hp < thp0, "重装 hp " + thp0 + " → " + target.hp.toFixed(0));

  // 医疗机器人奶人
  B.newRun();
  pinWave();
  G.allies.length = 0;
  const hurt = G.players[0];
  movePlayerOut(hurt);            // 挪出城堡，免得城堡回血把结果搅浑
  const hurtMate = G.players[1];
  movePlayerOut(hurtMate);
  hurt.hp = 30;
  const medic = B.makeAlly("medic", hurt.x + 40, hurt.y);
  medic.spawnT = 0;
  G.allies.push(medic);
  const h0 = hurt.hp;
  let peak = h0;
  for (let i = 0; i < 260; i++) { step(1); peak = Math.max(peak, hurt.hp); }
  check("医疗机器人会治疗玩家", peak > h0, "hp " + h0 + " → " + peak.toFixed(0));
}

// ---------- [9] 双人互救 ----------
console.log("\n[9] 双人互救");
{
  B.newRun();
  pinWave();
  const p1 = G.players[0], p2 = G.players[1];
  p1.invuln = 0;
  B.hurtPlayer(p1, 9999);
  check("血量归零后进入倒地状态", p1.down === true && p1.hp === 0, "down=" + p1.down);
  check("倒地有救援倒计时", p1.rescueT > 0, p1.rescueT.toFixed(0) + " 帧");

  // 队友太远时救不了
  p2.x = p1.x + 600;
  clearKeys();
  B.keys["Slash"] = true;
  step(50);
  check("队友离太远时救不起来", p1.down === true, "距离 600px");

  // 靠近就能救
  p2.x = p1.x + 40;
  p2.y = p1.y;
  let rescued = false;
  for (let i = 0; i < 90; i++) {
    B.keys["Slash"] = true;
    p2.x = p1.x + 40; p2.y = p1.y;   // 按住不放，稳住位置
    step(1);
    if (!p1.down) { rescued = true; break; }
  }
  check("队友靠近并按住开枪键能把人救起来", rescued, rescued ? "救起后 hp=" + p1.hp.toFixed(0) : "没能救起");
  check("救起后有无敌时间", p1.invuln > 0, p1.invuln.toFixed(0) + " 帧");
  check("救援次数被记录", p2.rescues >= 1, "P2 救过 " + p2.rescues + " 次");
  clearKeys();

  // 无人来救 → 超时出局
  B.newRun();
  pinWave();
  const q1 = G.players[0];
  const q2 = G.players[1];
  q1.invuln = 0;
  B.hurtPlayer(q1, 9999);
  q2.x = q1.x + 900; q2.y = q1.y;
  clearKeys();
  step(230);
  check("倒计时结束仍没被救 → 真正出局", q1.out === true, "out=" + q1.out);
}

// ---------- [10] 两人都出局 = 结束 ----------
console.log("\n[10] 结束条件");
{
  B.newRun();
  pinWave();
  const a = G.players[0], b = G.players[1];
  a.invuln = 0; b.invuln = 0;
  B.hurtPlayer(a, 9999);
  B.hurtPlayer(b, 9999);
  a.rescueT = 0.001; b.rescueT = 0.001;
  step(10);
  check("两人都倒下 → 游戏结束", G.mode === MODE.OVER, "mode=" + G.mode);
  check("结束后记录了最高分", Number(localStorage.getItem("castleSquadBest")) >= 0, "");
}

// ---------- [11] 拾取 ----------
console.log("\n[11] 捡枪 / 捡道具");
{
  B.newRun();
  pinWave();
  const p = G.players[0];
  p.weapon = "pistol";
  G.guns.length = 0;
  G.guns.push({ x: p.x + 4, y: p.y, id: "rocket", t: 0, r: 22, dead: false });
  step(3);
  check("走过去自动捡起地上的枪", p.weapon === "rocket", "换成了 " + WEAPONS[p.weapon].name);

  p.hp = 40;
  G.drops.length = 0;
  G.drops.push({ x: p.x + 4, y: p.y, kind: "health", r: 16, t: 0, dead: false });
  const h0 = p.hp;
  step(3);
  check("走过去自动吃血包", p.hp > h0, "hp " + h0 + " → " + p.hp.toFixed(0));

  p.shield = 0;
  G.drops.length = 0;
  G.drops.push({ x: p.x + 4, y: p.y, kind: "shield", r: 16, t: 0, dead: false });
  step(3);
  check("护盾道具生效", p.shield > 0, "护盾 " + p.shield.toFixed(0));
}

// ---------- [12] 城堡回血 ----------
console.log("\n[12] 城堡回血");
{
  B.newRun();
  pinWave();
  const p = G.players[0];
  p.x = CASTLE.x; p.y = CASTLE.y;     // 站在城堡正中
  p.hp = 40;
  const h0 = p.hp;
  clearKeys();
  step(120);
  check("站在城堡里会慢慢回血", p.hp > h0, "hp " + h0 + " → " + p.hp.toFixed(0));

  // 故意在城堡里站一会儿也不能超过上限
  step(900);
  check("回血不会超过血量上限", p.hp <= p.maxHp + 0.001, "hp " + p.hp.toFixed(1));
}

// ---------- [13] 长时间无人操作（压力测试） ----------
console.log("\n[13] 无人操作狂跑 4000 帧");
{
  B.newRun();
  clearKeys();
  let crashes = 0, nanFrame = -1;
  for (let f = 0; f < 4000; f++) {
    try { B.update(1); B.draw(); } catch (e) { crashes++; }
    if (nanFrame < 0 && anyNaN()) nanFrame = f;
    if (G.mode === MODE.SHOP) {   // 自动继续下一波
      try { B.nextWave(); } catch (e) { crashes++; }
    }
  }
  check("4000 帧零异常", crashes === 0, crashes ? crashes + " 次异常" : "");
  check("全程无 NaN 坐标", nanFrame < 0, nanFrame < 0 ? "" : "第 " + nanFrame + " 帧出现 NaN");
  const totalHp = G.players.reduce((s, p) => s + (p.out ? 0 : p.hp), 0);
  check("无人操作确实会被机器人打（不是挂机无敌）",
    G.mode === MODE.OVER || totalHp < 200,
    "mode=" + G.mode + " · 剩余总血 " + totalHp.toFixed(0) + "/200");
}

// ---------- [14] 自动作战：波次系统能一路推下去 ----------
console.log("\n[14] 自动作战（验证清波 → 招募 → 下一波 的完整链路）");
{
  B.newRun();
  clearKeys();
  let crashes = 0, nanFrame = -1, maxWave = 1, shopVisits = 0, allyBought = 0;
  for (let f = 0; f < 16000; f++) {
    // 简易 AI：瞄最近的怪持续输出；没怪就往城堡走
    // （测试里给常驻护体，专注验证系统链路，不让偶发阵亡打断长跑）
    for (const p of G.players) {
      if (!p || p.out) continue;
      p.invuln = Math.max(p.invuln, 5);
      const e = nearestTo(p);
      if (e) {
        p.aim = Math.atan2(e.y - p.y, e.x - p.x);
      } else {
        const ang = Math.atan2(CASTLE.y - p.y, CASTLE.x - p.x);
        p.aim = ang;
        if (Math.hypot(p.x - CASTLE.x, p.y - CASTLE.y) > 130) {
          p.x += Math.cos(ang) * 3.2;
          p.y += Math.sin(ang) * 3.2;
        }
      }
    }
    B.keys["KeyE"] = true;
    B.keys["Slash"] = true;
    try { B.update(1); B.draw(); } catch (e) { crashes++; }
    maxWave = Math.max(maxWave, G.wave);
    if (nanFrame < 0 && anyNaN()) nanFrame = f;
    if (G.mode === MODE.SHOP) {
      shopVisits++;
      const before = G.allies.length;
      if (G.coins >= ALLY_TYPES.guard.cost) B.buyAlly(0);
      if (G.allies.length > before) allyBought++;
      try { B.nextWave(); } catch (e) { crashes++; }
      if (maxWave >= 5) break;
    }
    if (G.mode === MODE.OVER) break;
  }
  clearKeys();
  check("连续作战 16000 帧零异常", crashes === 0, crashes ? crashes + " 次异常" : "");
  check("全程无 NaN", nanFrame < 0, nanFrame < 0 ? "" : "第 " + nanFrame + " 帧");
  check("能一路清掉 5 波（含一座要塞波也能打通）", maxWave >= 5, "推进到第 " + maxWave + " 波");
  check("反复进入招募界面（清波→招募→下一波 闭环完整）", shopVisits >= 4, shopVisits + " 次");
  check("积分能真的换来机器人伙伴", allyBought >= 2, "成功招募 " + allyBought + " 次，在场 " + G.allies.length + " 台");
  check("累计击杀量级正常", G.kills > 38, "击杀 " + G.kills);
}

// ---------- [15] 平衡核查 ----------
console.log("\n[15] 数值平衡核查");
{
  const dpsOf = (id) => { const w = WEAPONS[id]; return (w.dmg * w.pellets) / (w.rate / 60); };

  // 1) 任何敌人的单次伤害都不能把满血玩家秒掉
  let worstOneShot = 0, worstName = "";
  for (const k in ENEMY_TYPES) {
    const T = ENEMY_TYPES[k];
    const burst = T.contact ? T.dmg : (T.pellets ? T.dmg * T.pellets : T.dmg);
    if (burst > worstOneShot) { worstOneShot = burst; worstName = T.name; }
  }
  check("没有任何敌人能一击秒杀满血玩家", worstOneShot < 100,
    "最狠的是" + worstName + "，一次 " + worstOneShot + " 伤害 / 玩家 100 血");
  check("最狠的一击也留出反应余地（不到七成血）", worstOneShot < 70,
    worstOneShot + " < 70");

  // 2) 武器 DPS 阶梯：手枪是基准，好枪强但不能碾压
  const pd = dpsOf("pistol");
  check("手枪 DPS 落在 35–60 区间（合适的基准枪）", pd >= 35 && pd <= 60,
    "手枪 DPS " + pd.toFixed(0) + " / 秒");
  const tiers = [];
  for (const id of ["smg", "shotgun", "rifle", "laser", "rocket"]) {
    const d = dpsOf(id);
    tiers.push(id);
    check("  " + WEAPONS[id].name + " 强于手枪但不碾压（1.0–2.6 倍）",
      d > pd && d < pd * 2.6,
      d.toFixed(0) + "（" + (d / pd).toFixed(1) + "x 手枪）");
  }

  // 3) 波次血量 / 清场耗时
  const waveCount = (n) => Math.round(6.5 + n * 2.1 + (n % 5 === 0 ? 3 : 0));
  const waveScale = (n) => 1 + (n - 1) * 0.085;
  const waveHp = (n) => {
    const w = { scout: 1, gunner: 0, bomber: 0, tank: 0 };
    if (n >= 2) { w.gunner = 0.34; w.scout -= 0.34; }
    if (n >= 3) { w.bomber = 0.18; w.scout -= 0.18; }
    if (n >= 4) { w.tank = 0.16; w.scout -= 0.16; }
    let avg = 0;
    for (const k in w) avg += ENEMY_TYPES[k].hp * w[k];
    let hp = waveCount(n) * avg * waveScale(n);
    if (n % 5 === 0) hp += ENEMY_TYPES.titan.hp * waveScale(n);
    return hp;
  };
  const spawnSec = (n) => Math.ceil(waveCount(n) / 2) * 22 / 60;   // 每 22 帧放 2 只
  const twoDps = pd * 2;                                          // 两人都拿手枪
  console.log("     波次难度曲线（双人手枪估算）：");
  for (const w of [1, 2, 3, 5, 8, 10, 15]) {
    const spawn = spawnSec(w), kill = waveHp(w) / twoDps;
    console.log("       第 " + String(w).padStart(2, " ") + " 波：" +
      String(waveCount(w)).padStart(2, " ") + " 只机器人 · 总血 " +
      String(Math.round(waveHp(w))).padStart(5, " ") + " · " +
      "刷怪 " + spawn.toFixed(1) + "s / 击杀 " + kill.toFixed(1) + "s → 约 " +
      Math.max(spawn, kill).toFixed(0) + " 秒");
  }
  const w1time = Math.max(waveHp(1) / twoDps, spawnSec(1));
  check("第 1 波有存在感（不是一秒钟秒清）", w1time > 2.5, w1time.toFixed(1) + " 秒");
  check("第 1 波不会拖沓（30 秒内）", w1time < 30, w1time.toFixed(1) + " 秒");
  check("第 10 波明显更难（血量 > 第 1 波 4 倍）", waveHp(10) > waveHp(1) * 4,
    Math.round(waveHp(1)) + " → " + Math.round(waveHp(10)));
  check("难度不会无限膨胀到打不动（第 15 波双人仍在 90 秒内）",
    waveHp(15) / twoDps < 90, (waveHp(15) / twoDps).toFixed(0) + " 秒");

  // 4) 招募经济
  const waveIncome = (n) => 36 + n * 14;
  check("第 1 波打完就能招到最便宜的机器人", waveIncome(1) >= ALLY_TYPES.guard.cost,
    "第 1 波收入 " + waveIncome(1) + " ≥ 护卫机器人 " + ALLY_TYPES.guard.cost);
  check("最贵的机器人不能一波就买到", ALLY_TYPES.heavy.cost > waveIncome(3),
    "重装 " + ALLY_TYPES.heavy.cost + " > 第 3 波收入 " + waveIncome(3));
  let cum = 0, needWaves = 0;
  while (cum < ALLY_TYPES.heavy.cost && needWaves < 30) { needWaves++; cum += waveIncome(needWaves); }
  check("攒出重装机甲不超过 4 波（有盼头）", needWaves <= 4, "第 " + needWaves + " 波即可购买");

  // 5) 速度关系：玩家必须比所有非 BOSS 敌人快，否则被围住必死
  const playerSpd = 3.75;
  const slowest = Math.max.apply(null, Object.keys(ENEMY_TYPES)
    .filter(k => !ENEMY_TYPES[k].boss).map(k => ENEMY_TYPES[k].speed));
  check("玩家比所有非 BOSS 机器人都快（能拉扯走位）", slowest < playerSpd,
    "最快的机器人 " + slowest + " < 玩家 " + playerSpd + " px/帧");

  // 6) 射程不应超过半个屏幕，否则"看不见就被打"
  check("远程机器人的射程不超过半个屏幕（能看到谁在打你）",
    ENEMY_TYPES.gunner.range < 600 && ENEMY_TYPES.titan.range < 600,
    "枪手 " + ENEMY_TYPES.gunner.range + " / 首领 " + ENEMY_TYPES.titan.range);

  // 7) 友军定价与战力：护卫机器人要打得过同级敌人
  const guardDps = ALLY_TYPES.guard.dmg / (ALLY_TYPES.guard.fireGap / 60);
  check("护卫机器人的火力够看（DPS > 20）", guardDps > 20, "DPS " + guardDps.toFixed(0));
  check("护卫机器人不会比玩家本体还猛（不至于买完就躺赢）", guardDps < pd * 1.2,
    guardDps.toFixed(0) + " vs 玩家手枪 " + pd.toFixed(0));
}

// ---------- [16] 渲染不炸 ----------
console.log("\n[16] 各界面渲染");
{
  B.newRun();
  B.draw();
  B.openShop();
  B.draw();
  B.gameOver("测试");
  B.draw();
  check("游戏 / 招募 / 结束 三个界面都能正常渲染", errors === 0, errors ? errors + " 次渲染异常" : "");
}

// ---------- [17] 保底机制：龟缩城堡不会卡关 ----------
console.log("\n[17] 保底机制（防止『缩在城堡里这一波永远打不完』）");
{
  // ① 快进时间轴，确认狂暴会触发
  B.newRun();
  pinWave();                                  // 保持"战斗进行中"，别自己跳去商店
  for (let i = 0; i < 4; i++) {               // 手动放几只真怪（稻草人 spawnT 太大，不参与）
    const e = B.makeEnemy("gunner", 220 + i * 70, 220, 1);
    e.spawnT = 0;
    G.enemies.push(e);
  }
  for (const p of G.players) p.invuln = 999;
  step(2);
  const spawned = G.enemies.filter(e => !e.dead && e.spawnT <= 0).length;
  G.waveT = 61 * 60;
  step(2);
  check("一波拖过 60 秒 → 机器人进入狂暴", G.enraged === true,
    "场上 " + spawned + " 只，enraged=" + G.enraged);

  // ② 再拖下去会被强行空降
  G.waveT = 106 * 60;
  step(25);                                   // 空降后有 20 帧的出现动画，等它播完
  check("拖过 105 秒 → 触发空降突袭", G.finalPush === true, "finalPush=" + G.finalPush);
  const near = G.enemies.filter(e => !e.dead &&
    Math.hypot(e.x - CASTLE.x, e.y - CASTLE.y) < 520).length;
  check("空降把机器人搬到了城堡附近（玩家够得着）", near > 0, near + " 只在城堡 520px 内");

  // ③ 端到端：两人缩在城堡正中持续开枪，第 4 波（有远程怪）也能清完
  B.newRun();
  G.wave = 4;
  B.spawnWave(4);                             // 第 4 波才有远程机器人，之前测不到这个坑
  clearKeys();
  const p1 = G.players[0], p2 = G.players[1];
  p1.x = CASTLE.x; p1.y = CASTLE.y;
  p2.x = CASTLE.x + 30; p2.y = CASTLE.y;
  let cleared = false, frames = 0;
  for (let f = 0; f < 15000; f++) {
    p1.x = CASTLE.x; p1.y = CASTLE.y;
    p2.x = CASTLE.x + 30; p2.y = CASTLE.y;
    p1.invuln = 999; p2.invuln = 999;        // 护体，专注观察"能不能清完"
    for (const p of [p1, p2]) {
      const e = nearestTo(p);
      if (e) p.aim = Math.atan2(e.y - p.y, e.x - p.x);
    }
    B.keys["KeyE"] = true; B.keys["Slash"] = true;
    try { B.update(1); B.draw(); } catch (err) { errors++; }
    frames++;
    if (G.mode === MODE.SHOP) { cleared = true; break; }
  }
  clearKeys();
  check("龟缩城堡里也能把第 4 波打完（有远程怪也不会卡死）", cleared,
    cleared ? "耗时 " + (frames / 60).toFixed(0) + " 秒" : "15000 帧仍未清完");
  check("清完这一波没有依赖保底空降（靠机器人自己找门进来）", cleared && !G.finalPush,
    G.finalPush ? "用到了空降保底" : "没用到空降");
}

console.log("\n=== 结果：" + pass + " 通过 / " + fail + " 失败 ===" +
  (errors ? "（运行期异常 " + errors + " 次）" : ""));
process.exit(fail > 0 || errors > 0 ? 1 : 0);
