/* 无头模拟：用假的 DOM/Canvas 跑真实游戏循环，抓运行时错误 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const dir = path.join(__dirname, 'js');

const noop = () => {};
function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'canvas') return { width: 1280, height: 720 };
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
const fakeEl = () => ({
  addEventListener: noop, removeEventListener: noop,
  innerHTML: '', textContent: '', style: {},
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  getContext: makeCtx, width: 0, height: 0,
  children: [], appendChild: noop, querySelector: () => null
});
/* 一个够用的 localStorage（存档测试要用） */
function makeStore() {
  const m = {};
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    clear: () => { for (const k in m) delete m[k]; }
  };
}
const sandbox = {
  console, Math, Uint8Array, Float32Array, Array, Object, JSON, Number, String, Boolean, Proxy, Date,
  isNaN, isFinite, parseInt, parseFloat,
  localStorage: makeStore(),
  document: { createElement: fakeEl, getElementById: fakeEl, addEventListener: noop, querySelectorAll: () => [], querySelector: () => null },
  window: { addEventListener: noop, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 },
  requestAnimationFrame: noop,
  navigator: { getGamepads: () => [] },
  setInterval: noop,
  performance: { now: () => Date.now() }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = ['util.js', 'world.js', 'items.js', 'quests.js', 'maze.js', 'vehicles.js', 'challenges.js',
  'chars.js', 'entities.js', 'realm.js', 'save.js', 'gamepad.js', 'game.js'];
for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });

const { Game, Input, Maze, World, F, O, FDEF, ODEF, Inv, ITEMS, Challenges, Quest, Vehicle, Mob, dist,
  Realm, Save, wLv, wDmg, wGun, TILE, CHUNK, CHARS, charById, drawHeroSprite
} = sandbox;
let errors = [];
const ok2 = (c, msg) => { if (!c) errors.push(msg); else console.log('  ✓ ' + msg); };
function clearInv(p) { for (let i = 0; i < p.inv.length; i++) p.inv[i] = null; p.wlv = {}; p.pets = []; }
/* 把一块地清干净（测试专用，免得大块头的怪被树卡住） */
function clearArea(cx, cy, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) Game.setObj(cx + dx, cy + dy, O.NONE);
}

const step = (n, label) => {
  for (let i = 0; i < (n || 1); i++) {
    try { Game.update(0.016); Game.render(); Input.endFrame(); }
    catch (e) { errors.push(label + ': ' + e.message + '\n' + (e.stack || '').split('\n')[1]); return false; }
    if (Game.panel >= 0 || Game.questPanel >= 0 || Game.questOffer || Game.dragonWish || Game.lottery || Challenges.active) {
      console.log('  [暂停状态] ' + label + ' → panel=' + Game.panel + ' questPanel=' + Game.questPanel +
        ' offer=' + !!Game.questOffer + ' maze=' + Maze.active + ' dragon=' + !!Game.dragonWish +
        ' challenge=' + (Challenges.active ? Challenges.active.type : '-'));
      return true;
    }
  }
  return true;
};

/* 剧本化的用例需要确定性：先把「白天刷小精灵」关掉，等到专门测它的时候再打开 */
Game.started = true;
Game.critterTimer = 1e9;

/* 1. 白天：两个玩家四处走动 + 挖东西 */
step(2, '启动');
Input.keys['KeyD'] = true; Input.keys['ArrowLeft'] = true;
step(180, 'P1 向右 / P2 向左走动');
Input.keys['KeyD'] = false; Input.keys['ArrowLeft'] = false;
Input.keys['KeyS'] = true; Input.keys['ArrowDown'] = true;
step(180, '两人向下走动');
Input.keys['KeyS'] = false; Input.keys['ArrowDown'] = false;

/* 2. 挖树：把 P1 挪到树边，按住空格 */
let treeSpot = null;
for (let r = 0; r < 40 && !treeSpot; r++) {
  for (let a = 0; a < 24; a++) {
    const tx = Math.round(Math.cos(a) * r), ty = Math.round(Math.sin(a) * r);
    if (World.getObj(0, tx, ty) === O.LOG) { treeSpot = { tx, ty }; break; }
  }
}
if (!treeSpot) errors.push('天空岛找不到树');
else {
  const p1 = Game.players[0];
  p1.x = (treeSpot.tx - 1) * 32 + 16; p1.y = treeSpot.ty * 32 + 16;
  p1.facing = { x: 1, y: 0 };
  Input.keys['Space'] = true;
  step(400, 'P1 砍树');
  Input.keys['Space'] = false;
  const gotLog = Inv.count(p1.inv, 'log') + Inv.count(p1.inv, 'plank');
  if (gotLog === 0) errors.push('砍了 6 秒树，却没拿到木头（挖掘逻辑可能坏了）');
  else console.log('  ✓ 挖树掉落: 木头/木板 ' + gotLog + ' 个');
}

/* 3. 合成：给足材料，开面板按 1 */
const p1 = Game.players[0];
Inv.add(p1.inv, 'log', 10);
Game.panel = 0;
Input.pressedSet['Digit1'] = true;
step(1, '合成木板');
Input.pressedSet = {};
const planks = Inv.count(p1.inv, 'plank');
if (planks < 4) errors.push('合成失败，木板数=' + planks);
else console.log('  ✓ 合成木板 ×' + planks);
Game.panel = -1;

/* 4. 放置 + 吃东西（先找到苹果所在的快捷栏格子） */
Inv.add(p1.inv, 'apple', 2);
Inv.add(p1.inv, 'plank', 8);
p1.sel = p1.inv.findIndex(s => s && s.id === 'apple');
if (p1.sel < 0 || p1.sel >= 5) { Inv.remove(p1.inv, 'apple', 2); Inv.add(p1.inv, 'apple', 2); p1.sel = p1.inv.findIndex(s => s && s.id === 'apple'); }
p1.food = 5;
Input.pressedSet['KeyE'] = true; step(1, '吃苹果'); Input.pressedSet = {};
if (p1.food <= 5) errors.push('吃苹果没回饱食度');
else console.log('  ✓ 吃苹果回饱食度 5 → ' + p1.food.toFixed(1));

/* 5. 夜晚：刷怪 + 战斗 + 光照 */
Game.time = Game.dayLen * 0.6;   // 夜里
step(400, '夜晚刷怪并移动');
const mobs = Game.mobs.length;
if (mobs === 0) errors.push('夜里一只怪都没刷出来');
else console.log('  ✓ 夜晚刷出 ' + mobs + ' 只怪（僵尸/末影人）');
// 打死它们
for (const m of Game.mobs) m.hp = 1;
const near = Game.mobs[0];
if (near) {
  p1.x = near.x - 20; p1.y = near.y; p1.facing = { x: 1, y: 0 };
  Input.keys['Space'] = true;
  step(60, '攻击怪物');
  Input.keys['Space'] = false;
}
console.log('  ✓ 战斗后剩余怪物 ' + Game.mobs.length + ' 只');

/* 6. 云洞下降 → 地面大陆 */
const hole = sandbox.SKY_HOLES[0];
p1.x = hole[0] * 32 + 16; p1.y = hole[1] * 32 + 16;
Game.players[1].x = p1.x; Game.players[1].y = p1.y;
step(3, '踩云洞下降');
if (Game.layer !== 1) errors.push('踩到云洞没有降到地面层');
else console.log('  ✓ 云洞下降到地面大陆，坐标 ' + Math.floor(p1.x / 32) + ',' + Math.floor(p1.y / 32));

/* 7. 掉云海 → 回到安全点（云海只在天空层有） */
Game.ascend();
step(2, '回到天空岛');
p1.safeX = p1.x; p1.safeY = p1.y;
const hpBefore = p1.hp;
p1.x = 60 * 32; p1.y = 0;                     // 岛外的云海
step(3, '掉进云海');
if (Math.abs(p1.x - 60 * 32) < 1) errors.push('掉进云海没有传送回安全点');
else console.log('  ✓ 掉云海被托回，扣血 ' + (hpBefore - p1.hp).toFixed(0));

/* 8. 迷宫：进入 → 踩板 → 出门 */
Game.enterMaze();
if (!Maze.active) errors.push('enterMaze 没有激活迷宫');
step(120, '在迷宫里乱走（会踩到尖刺/滚石）');
console.log('  ✓ 迷宫尺寸 ' + Maze.w + 'x' + Maze.h + '，门 ' + Maze.doors.length +
  ' 扇（合作门 ' + Maze.doors.filter(d => Maze.plates.filter(p => p.group === d.group).length >= 2).length +
  ' 扇），尖刺 ' + Maze.spikes.length + '，滚石 ' + Maze.rollers.length);
// 两人同时站上出口踏板
for (let i = 0; i < Game.players.length; i++) {
  const p = Game.players[i];
  p.alive = true; p.hp = p.maxhp;
  p.x = Maze.pads[i].x * 32 + 16; p.y = Maze.pads[i].y * 32 + 16;
}
step(60, '两人同时踩出口踏板');
if (Maze.active) errors.push('两人踩住踏板却没有通关');
else console.log('  ✓ 双人配合通关，回到世界层 ' + (Game.layer === 0 ? '天空岛' : '地面大陆'));

/* 9. 地面随机拾取物 */
Game.layer = 0;
for (const pl of Game.players) { pl.x = 16; pl.y = 16; pl.safeX = pl.x; pl.safeY = pl.y; }
step(2, '回到出生点');
let found = null;
for (let r = 2; r < 30 && !found; r++) {
  for (let a = 0; a < 40 && !found; a++) {
    const tx = Math.round(Math.cos(a / 40 * 6.283) * r), ty = Math.round(Math.sin(a / 40 * 6.283) * r);
    const list = [];
    World.pickupsNear(0, tx, ty, tx, ty, list);
    if (list.length) found = list[0];
  }
}
if (!found) errors.push('天空岛附近找不到地面拾取物');
else {
  const p = Game.players[0];
  p.x = found.x * 32 + 16; p.y = found.y * 32 + 16;
  const before = Inv.count(p.inv, found.id);
  step(2, '走过去捡东西');
  if (Inv.count(p.inv, found.id) <= before) errors.push('走到拾取物上没有捡起来');
  else console.log('  ✓ 地面捡到 ' + sandbox.ITEMS[found.id].name + ' ×' + found.n);
}

/* 10. 任务：弹窗说明 → 接受 → 完成 → 交付 */
const qp = Game.players[0];
qp.quest = null; qp.questDone = 0;
qp.x = sandbox.QUEST_NPC[0].x * 32 + 16; qp.y = sandbox.QUEST_NPC[0].y * 32 + 16;
Game.layer = 0;
Input.pressedSet['KeyF'] = true; step(1, '在长老处按 F'); Input.pressedSet = {};
if (!Game.questOffer) errors.push('在任务长老处按 F 没有弹出任务说明');
else {
  console.log('  ✓ 弹出任务说明：「' + Game.questOffer.q.d.text.replace('{n}', Game.questOffer.q.target) + '」');
  Input.pressedSet['Digit2'] = true; step(1, '换一个任务'); Input.pressedSet = {};
  if (!Game.questOffer) errors.push('按 2 换任务后弹窗消失了');
  Input.pressedSet['Digit1'] = true; step(1, '按 1 接受任务'); Input.pressedSet = {};
  if (!qp.quest) errors.push('按 1 之后任务没有进任务本');
  else {
    console.log('  ✓ 接受后进入任务本：' + sandbox.Quest.label(qp.quest));
    // 任务本面板
    Input.pressedSet['KeyQ'] = true; step(1, '打开任务本'); Input.pressedSet = {};
    if (Game.questPanel !== 0) errors.push('按 Q 没有打开任务本');
    else { step(1, '渲染任务本'); console.log('  ✓ 任务本可以打开（按 Q / L）'); }
    Input.pressedSet['Escape'] = true; step(1, '关闭任务本'); Input.pressedSet = {};
    if (Game.questPanel !== -1) errors.push('Esc 没关掉任务本');

    qp.quest.prog = qp.quest.target; qp.quest.done = true;
    Input.pressedSet['KeyF'] = true; step(1, '交付任务'); Input.pressedSet = {};
    if (qp.questDone !== 1) errors.push('交付后没有计入已完成任务数（' + qp.questDone + '）');
    else console.log('  ✓ 交付成功，已完成任务数 = ' + qp.questDone);
    Input.pressedSet['Escape'] = true; step(1, '关掉新弹窗'); Input.pressedSet = {};
  }
}

/* 10b. 打怪要能记进任务进度 */
const hunter = Game.players[0];
sandbox.Quest.give(hunter);
hunter.quest = { d: sandbox.Quest.defs.filter(d => d.kind === 'hunt' && d.mob === 'zombie')[0], target: 3, prog: 0, done: false };
const dummy = new sandbox.Mob('zombie', hunter.x + 18, hunter.y);
dummy.hp = 1;
Game.mobs.push(dummy);
hunter.facing = { x: 1, y: 0 };
hunter.atkCd = 0;
Input.keys['Space'] = true; step(6, '打死一只僵尸'); Input.keys['Space'] = false;
if (hunter.quest.prog < 1) errors.push('打死僵尸没有记进任务进度');
else console.log('  ✓ 击杀计入任务进度：' + sandbox.Quest.label(hunter.quest));
hunter.quest = null;

/* 11. 载具：召唤 → 上车 → 开 → 撞怪 */
sandbox.Inv.add(qp.inv, 'tank', 1);
let vslot = qp.inv.findIndex(s => s && s.id === 'tank');
qp.sel = vslot >= 0 && vslot < 5 ? vslot : qp.sel;
if (vslot >= 5) { /* 不在快捷栏就手动召唤 */ Game.summonVehicle(qp, 'tank'); }
else { Input.pressedSet['KeyE'] = true; step(1, '召唤坦克'); Input.pressedSet = {}; }
if (!Game.vehicles.length) errors.push('召唤载具失败');
else {
  const v = Game.vehicles[Game.vehicles.length - 1];
  qp.x = v.x; qp.y = v.y;
  Input.pressedSet['KeyF'] = true; step(1, '上车'); Input.pressedSet = {};
  if (!qp.riding) errors.push('走到载具旁按 F 没上车');
  else {
    const startX = qp.x;
    Input.keys['KeyD'] = true; step(40, '开车前进'); Input.keys['KeyD'] = false;
    if (Math.abs(qp.x - startX) < 10) errors.push('上车后按方向键没有开动');
    else console.log('  ✓ 开' + v.name + '前进了 ' + Math.round(qp.x - startX) + 'px，车随人动');
    Input.pressedSet['KeyF'] = true; step(1, '下车'); Input.pressedSet = {};
    if (qp.riding) errors.push('按 F 没能下车');
  }
}

/* 12. 三种怪的血量不同（需要打的次数不同） */
const hitsFor = (type, weaponDmg) => {
  const m = new sandbox.Mob(type, 0, 0);
  return Math.ceil(m.maxhp / (3 + weaponDmg));
};
const hz = hitsFor('zombie', 5), he = hitsFor('ender', 5), hb = hitsFor('brute', 5);
if (!(hz < he && he < hb)) errors.push('三种怪的击打次数没有区分开: ' + [hz, he, hb]);
else console.log('  ✓ 木剑击打次数：小僵尸 ' + hz + ' 下 / 末影人 ' + he + ' 下 / 大块头 ' + hb + ' 下');
if (Game.players[0].maxhp < 30) errors.push('玩家血量没有提高');
else console.log('  ✓ 玩家血量上限 ' + Game.players[0].maxhp);

/* 13. 世界边界 + 老区块回收 */
if (World.getObj(1, 9999, 0) !== sandbox.O.BEDROCK) errors.push('世界边界没有挡住玩家');
else console.log('  ✓ 500×500 之外是不可破坏的边界');
const before = Object.keys(World.chunks).length;
// 强制把上限调低，逼出回收
World.maxChunks = 20;
const dropped = World.gc(Game.players, Game.layer);
const after = Object.keys(World.chunks).length;
if (dropped <= 0) errors.push('区块超过上限却没有被回收');
else console.log('  ✓ 回收老区块 ' + dropped + ' 个（' + before + ' → ' + after + '），玩家改过的区块保留');
World.maxChunks = 220;
step(30, '回收后继续跑');

/* 15. 远程武器自动开火 */
{
  const p = Game.players[0];
  p.riding = null; p.alive = true; p.hp = p.maxhp;
  sandbox.Inv.add(p.inv, 'pistol', 1);
  const slot = p.inv.findIndex(s => s && s.id === 'pistol');
  if (slot >= 0 && slot < sandbox.HOTBAR) p.sel = slot;
  else { p.inv[p.sel] = { id: 'pistol', count: 1 }; }
  Game.mobs.length = 0;                            // 只留这一只，别让别的怪抢走子弹
  const z = new sandbox.Mob('zombie', p.x + 90, p.y);
  const hpBefore = z.hp;
  Game.mobs.push(z);
  Game.time = Game.dayLen * 0.6;                 // 夜里，怪不会被晒死
  step(40, '拿枪站着不动，怪在射程内');
  const idx = Game.mobs.indexOf(z);
  const stillAlive = idx >= 0 && z.alive;
  if (stillAlive && z.hp >= hpBefore) {
    errors.push('拿着枪、怪在射程内，却没有自动开火（手上=' + (p.inv[p.sel] && p.inv[p.sel].id) +
      ' 怪数=' + Game.mobs.length + ' 距离=' + Math.round(Math.hypot(z.x - p.x, z.y - p.y)) +
      ' alive=' + p.alive + ' riding=' + !!p.riding + '）');
  } else console.log('  ✓ 手枪自动开火：僵尸 ' + hpBefore + ' → ' + (z.alive ? z.hp : '被打倒') + '，子弹 ' + Game.bullets.length + ' 发在飞');
  if (idx >= 0) Game.mobs.splice(idx, 1);
  p.inv[p.sel] = null;
}

/* 16. 大怪 */
{
  const boss = new sandbox.Mob('boss', 0, 0);
  const zombie = new sandbox.Mob('zombie', 0, 0);
  if (!boss.boss || boss.maxhp <= zombie.maxhp * 5) errors.push('大怪血量/标记不对');
  else console.log('  ✓ 大怪：' + boss.maxhp + ' 血 / ' + boss.dmg + ' 伤（小僵尸只有 ' + zombie.maxhp + ' 血）');
}

/* 17. 石头围一圈 → 僵尸进不来 */
{
  Game.layer = 1;
  const cx = 60, cy = 60;                        // 找块空地围个 5x5 的石头屋
  const R = 3;
  for (let i = -R; i <= R; i++) {
    for (const [x, y] of [[cx + i, cy - R], [cx + i, cy + R], [cx - R, cy + i], [cx + R, cy + i]]) {
      World.setObj(1, x, y, sandbox.O.STONEB);
    }
  }
  let holes = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) === R && !World.solid(1, cx + dx, cy + dy)) holes++;
  }
  if (holes) errors.push('测试用的墙没砌严，有 ' + holes + ' 个洞');
  const inside = { x: cx * 32 + 16, y: cy * 32 + 16 };
  const p = Game.players[0];
  p.x = inside.x; p.y = inside.y; p.alive = true;
  const z = new sandbox.Mob('zombie', (cx + 8) * 32 + 16, cy * 32 + 16);
  Game.mobs.push(z);
  Game.time = Game.dayLen * 0.6;
  step(600, '僵尸试图进屋（10 秒）');
  const din = Math.max(Math.abs(z.x - inside.x), Math.abs(z.y - inside.y));
  const gotIn = din < (R - 0.5) * 32;
  if (gotIn) errors.push('石头围死的房子，僵尸还是进来了（距离中心 ' + Math.round(din / 32) + ' 格）');
  else console.log('  ✓ 石头屋防住了僵尸：10 秒后仍在 ' + Math.round(din / 32) + ' 格外进不来');
  const zi = Game.mobs.indexOf(z); if (zi >= 0) Game.mobs.splice(zi, 1);
}

/* 18. 卡住自救 */
{
  const p = Game.players[0];
  const wx = 80, wy = 80;
  Game.setObj(1, wx, wy, sandbox.O.STONEB);       // 把人埋进方块里
  p.x = wx * 32 + 16; p.y = wy * 32 + 16;
  step(2, '被方块埋住');
  const stuckTile = Math.floor(p.x / 32) + ',' + Math.floor(p.y / 32);
  if (Game.solidAt(Math.floor(p.x / 32), Math.floor(p.y / 32))) errors.push('玩家被方块埋住后没能自救，仍卡在 ' + stuckTile);
  else console.log('  ✓ 卡进方块会自动挪出来（现在在 ' + stuckTile + '）');
}

/* 19. 复活爆炸：周围炸光 */
{
  const p = Game.players[0];
  const bx = 90, by = 90;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) World.setObj(Game.layer, bx + i, by + j, sandbox.O.STONEB);
  const before = World.getObj(Game.layer, bx, by);
  p.x = bx * 32 + 16; p.y = by * 32 + 16; p.safeX = p.x; p.safeY = p.y;
  p.alive = true; p.hp = 1; p.hurtCd = 0;
  p.hurt(99, p.x, p.y);                            // 打死
  step(240, '等待复活');                            // 3.5 秒后复活并爆炸
  const after = World.getObj(Game.layer, bx, by);
  if (!p.alive) errors.push('死亡后没有复活');
  else if (before !== sandbox.O.NONE && after !== sandbox.O.NONE) errors.push('复活爆炸没有炸掉周围的方块');
  else console.log('  ✓ 复活冲击波：周围 3 格内的方块被炸光（' + before + ' → ' + after + '）');
}

/* 20. 不能把方块放在伙伴/自己身上 */
{
  const [a, b] = Game.players;
  World.setObj(Game.layer, 101, 100, sandbox.O.NONE);   // 先清干净，免得地上本来就有石头
  World.setObj(Game.layer, 101, 100, sandbox.O.NONE);
  a.x = 100 * 32 + 16; a.y = 100 * 32 + 16;
  b.x = 101 * 32 + 16; b.y = 100 * 32 + 16;        // 就在 A 的正右方
  a.facing = { x: 1, y: 0 };
  a.inv[a.sel] = { id: 'stone', count: 5 };
  if (Game.solidAt(101, 100)) errors.push('测试前置条件失败：目标格本来就是实心的');
  Input.pressedSet['KeyE'] = true; step(1, '朝着伙伴放方块'); Input.pressedSet = {};
  if (Game.solidAt(101, 100)) errors.push('方块被放在了伙伴身上（这正是卡住的元凶）');
  else console.log('  ✓ 方块放不到人身上，不会被自己埋住');
}

/* 21. R 键回到白天 */
{
  Game.time = Game.dayLen * 0.7;                   // 深夜
  Game.mobs.push(new sandbox.Mob('zombie', Game.players[0].x + 200, Game.players[0].y));
  Game.players[0].hp = 5;
  Input.pressedSet['KeyR'] = true; step(1, '按 R'); Input.pressedSet = {};
  const ph = Game.phase();
  if (ph.name !== '白天') errors.push('按 R 之后不是白天（现在是 ' + ph.name + '）');
  else if (Game.mobs.length !== 0) errors.push('按 R 之后怪物没清干净');
  else console.log('  ✓ 按 R 回到白天：怪物清空，血量回到 ' + Game.players[0].hp + '/' + Game.players[0].maxhp);
}

/* 22. 背包整理：键盘移动物品到快捷栏 */
{
  const p = Game.players[0];
  for (let i = 0; i < p.inv.length; i++) p.inv[i] = null;
  p.inv[15] = { id: 'pistol', count: 1 };          // 手枪躺在后半段背包里
  Game.panel = 0;
  Game.invCursor.i = 15;
  Game.invHold = null;
  Input.pressedSet['Space'] = true; step(1, '拿起手枪'); Input.pressedSet = {};
  if (!Game.invHold || Game.invHold.id !== 'pistol') errors.push('空格没能从背包里拿起物品');
  else {
    // 光标往左移 6 格 → 第 9 格（快捷栏最后一格）
    for (let k = 0; k < 6; k++) { Input.pressedSet['ArrowLeft'] = true; step(1, '光标左移'); Input.pressedSet = {}; }
    Input.pressedSet['Space'] = true; step(1, '放下到快捷栏'); Input.pressedSet = {};
    if (Game.invHold) errors.push('放下之后物品还拿在手上');
    else if (!p.inv[9] || p.inv[9].id !== 'pistol') errors.push('物品没有落到目标格子（inv[9]=' + JSON.stringify(p.inv[9]) + '）');
    else console.log('  ✓ 键盘整理：手枪从第 16 格挪到了第 10 格');
  }
  // 同种合并 + 不同种交换
  p.inv[0] = { id: 'torch', count: 3 };
  p.inv[1] = { id: 'torch', count: 2 };
  Game.invCursor.i = 0;
  Input.pressedSet['Space'] = true; step(1, '拿起火把'); Input.pressedSet = {};
  Input.pressedSet['ArrowRight'] = true; step(1, '右移'); Input.pressedSet = {};
  Input.pressedSet['Space'] = true; step(1, '放到同种上'); Input.pressedSet = {};
  if (!p.inv[1] || p.inv[1].count !== 5) errors.push('同种物品没有合并（' + JSON.stringify(p.inv[1]) + '）');
  else console.log('  ✓ 同种自动合并：3 + 2 = ' + p.inv[1].count);

  Game.invCursor.i = 1;
  Input.pressedSet['Space'] = true; step(1, '拿起火把'); Input.pressedSet = {};
  Game.invCursor.i = 9;
  Input.pressedSet['Space'] = true; step(1, '跟手枪交换'); Input.pressedSet = {};
  if (!p.inv[9] || p.inv[9].id !== 'torch' || !p.inv[1] || p.inv[1].id !== 'pistol') errors.push('不同种物品没有交换');
  else console.log('  ✓ 不同种自动交换：火把 ↔ 手枪');
  Game.panel = -1;
}

/* 23. 鼠标拖拽整理 */
{
  const p = Game.players[0];
  for (let i = 0; i < p.inv.length; i++) p.inv[i] = null;
  p.inv[3] = { id: 'tank', count: 1 };
  Game.panel = 0; Game.invHold = null;
  const L = Game.invLayout();
  const cellCenter = idx => ({ x: L.gx + (idx % L.cols) * L.cell + 19, y: L.gy + Math.floor(idx / L.cols) * L.cell + 19 });
  if (Game.invHit(cellCenter(3).x, cellCenter(3).y) !== 3) errors.push('背包格子的鼠标命中测试不对');
  else {
    const from = cellCenter(3), to = cellCenter(0);
    Game.pointerDown(from.x, from.y);
    if (!Game.invHold) errors.push('鼠标按下没有拿起物品');
    Game.pointerMove(to.x, to.y);
    Game.pointerUp(to.x, to.y);
    if (Game.invHold) errors.push('鼠标拖到目标格后物品还在手上');
    else if (!p.inv[0] || p.inv[0].id !== 'tank') errors.push('鼠标拖拽没有把物品放到目标格');
    else console.log('  ✓ 鼠标拖拽：坦克从第 4 格拖到了快捷栏第 1 格');
  }
  Game.panel = -1;
}

/* 24. HUD 不要每帧重写（闪烁的根因） */
{
  let writes = 0;
  const el = { innerHTML: '' };
  const realGet = sandbox.document.getElementById;
  sandbox.document.getElementById = id => (id === 'msg' ? el : realGet(id));
  Object.defineProperty(el, 'innerHTML', {
    set(v) { writes++; this._v = v; },
    get() { return this._v || ''; }
  });
  Game.msgSig = '';                                  // 强制重建一次
  Game.say('闪烁测试');
  for (let i = 0; i < 30; i++) { Game.update(0.016); Game.render(); Input.endFrame(); }
  sandbox.document.getElementById = realGet;
  if (writes > 1) errors.push('提示语在内容没变时被重写了 ' + writes + ' 次（会一直闪）');
  else console.log('  ✓ 提示语不闪了：30 帧内 DOM 只写了 ' + writes + ' 次');
}

/* 25. 夜里死 10 次自动天亮 */
{
  const p = Game.players[0];
  Game.nightDeaths = 0;
  Game.time = Game.dayLen * 0.6;                     // 深夜
  Game.mobs.push(new sandbox.Mob('zombie', p.x + 300, p.y));
  for (let i = 0; i < 10; i++) {
    p.alive = true; p.hp = 5; p.hurtCd = 0;
    p.hurt(99, p.x, p.y);
    step(1, '夜里第 ' + (i + 1) + ' 次倒下');
  }
  if (Game.phase().name !== '白天') errors.push('夜里死满 10 次却没有自动天亮（现在是 ' + Game.phase().name + '）');
  else if (Game.nightDeaths !== 0) errors.push('天亮后夜间死亡计数没有清零');
  else console.log('  ✓ 夜里倒下 10 次 → 自动天亮，计数清零，怪物清空');
}

/* 26. 合体：两人重叠 → 按挖掘键 → 变大变强 → 再按拆开 */
{
  const [a, b] = Game.players;
  a.fused = null; b.fused = null;
  a.alive = true; b.alive = true; a.hp = a.maxhp; b.hp = b.maxhp;
  a.x = 50 * 32 + 16; a.y = 50 * 32 + 16;
  b.x = a.x; b.y = a.y;             // 重叠
  const hpBefore = a.maxhp;
  Input.pressedSet['Space'] = true; step(1, 'P1 按空格合体'); Input.pressedSet = {};
  if (!a.fused && !b.fused) errors.push('两人重叠按挖掘键没有合体');
  else {
    const fused = a.fused ? a : b.fused ? b : null;
    if (fused.maxhp <= hpBefore) errors.push('合体后血量没有增加');
    else console.log('  ✓ 合体成功：血量 ' + hpBefore + ' → ' + fused.maxhp + '，角色变大');
    // 拆开
    Input.pressedSet['Space'] = true; step(1, '再按拆开'); Input.pressedSet = {};
    if (a.fused || b.fused) errors.push('再按挖掘键没有拆开');
    else console.log('  ✓ 拆开成功，各走各的');
  }
}

/* 27. 挑战类型：数学题 */
{
  Challenges.active = null;
  const data = Challenges.generate('math');
  if (!data || !data.q || !data.opts || data.opts.length !== 4) errors.push('数学题生成失败');
  else {
    if (!data.opts.includes(data.ans)) errors.push('数学题答案不在选项里');
    else {
      Challenges.active = { type: 'math', data: data, result: null, returnInfo: {} };
      data.picked = data.ans;
      if (!Challenges.check()) errors.push('数学题答对了却不判定为通关');
      else console.log('  ✓ 数学题：' + data.q + ' 答案=' + data.ans + '，选项里有正确答案');
    }
    Challenges.active = null;
  }
}

/* 28. 挑战类型：数独 */
{
  const data = Challenges.generate('sudoku');
  if (!data || data.grid.length !== 16) errors.push('数独生成失败');
  else {
    // 把所有答案填上，检查是否通关
    for (let i = 0; i < 16; i++) data.grid[i].val = data.grid[i].ans;
    Challenges.active = { type: 'sudoku', data: data, result: null, returnInfo: {} };
    if (!Challenges.check()) errors.push('数独填对了却不判定为通关');
    else console.log('  ✓ 4×4 数独：全部填对后判定通关');
    Challenges.active = null;
  }
}

/* 29. 挑战类型：填字 */
{
  const data = Challenges.generate('wordfill');
  if (!data || !data.part || !data.full) errors.push('填字生成失败');
  else {
    Challenges.active = { type: 'wordfill', data: data, result: null, returnInfo: {} };
    data.picked = data.full;
    if (!Challenges.check()) errors.push('填字答对了却不判定为通关');
    else console.log('  ✓ 填字：部首「' + data.part + '」→ 正确答案「' + data.full + '」');
    Challenges.active = null;
  }
}

/* 30. 挑战类型：五子棋（AI 能走棋、能判定输赢） */
{
  Challenges.active = { type: 'gomoku', data: null, result: null, returnInfo: {} };
  Challenges.update(0.016);  // 初始化棋盘
  const d = Challenges.active.data;
  if (!d || d.board.length !== 81) errors.push('五子棋棋盘初始化失败');
  else {
    // 玩家连五（在第一行放 5 个黑子）
    for (let i = 0; i < 5; i++) d.board[i] = 1;
    d.lastMove = 4;
    if (!Challenges.gomokuWin(d.board, 4, 1)) errors.push('五子棋连五判定失败');
    else {
      d.winner = 1;
      if (!Challenges.check()) errors.push('五子棋赢了却不判定为通关');
      else console.log('  ✓ 五子棋：连五判定成功，AI 可走棋（9×9 棋盘）');
    }
    Challenges.active = null;
  }
}

/* 31. 巨人僵尸：血最厚，打倒掉附魔土豆 */
{
  const g = new Mob('giant', Game.players[0].x + 200, Game.players[0].y);
  const z = new Mob('zombie', 0, 0);
  const boss = new Mob('boss', 0, 0);
  if (!g.giant || g.maxhp <= boss.maxhp) errors.push('巨人僵尸血量/标记不对：' + g.maxhp);
  else {
    Game.mobs.push(g);
    Game.time = Game.dayLen * 0.6;
    Game.drops.length = 0;
    g.hurt(99999, g.x + 10, g.y, null);
    const pot = Game.drops.filter(d => d.id === 'epotato').reduce((s, d) => s + d.n, 0);
    if (pot < 1) errors.push('打倒巨人僵尸没掉附魔土豆');
    else console.log('  ✓ 巨人僵尸：' + g.maxhp + ' 血（小僵尸 ' + z.maxhp + ' / 巨怪 ' + boss.maxhp +
      '），打倒掉 ' + pot + ' 颗附魔土豆');
    const gi = Game.mobs.indexOf(g); if (gi >= 0) Game.mobs.splice(gi, 1);
    Game.drops.length = 0;
  }
}

/* 32. 附魔土豆：扔出去 → 僵尸跑过来吃 → 倒戈加入小队 */
{
  Game.layer = 1;
  Game.spawnTimer = 9999;                          // 别让随机刷的怪抢走土豆
  const p = Game.players[0];
  p.riding = null; p.alive = true; p.hp = p.maxhp; p.fused = null;
  Game.players[1].fused = null;
  const fx = 130, fy = 130;
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) Game.setObj(fx + dx, fy + dy, sandbox.O.NONE);
  p.x = fx * 32 + 16; p.y = fy * 32 + 16; p.safeX = p.x; p.safeY = p.y;
  p.facing = { x: 1, y: 0 };
  Game.mobs.length = 0; Game.baits.length = 0;
  Game.time = Game.dayLen * 0.6;                   // 夜里，僵尸不会被晒死
  const z = new Mob('zombie', p.x + 150, p.y);     // 4 格开外，在诱饵吸引范围内
  Game.mobs.push(z);
  p.inv[p.sel] = { id: 'epotato', count: 1 };
  Input.pressedSet['KeyE'] = true; step(1, '扔出附魔土豆'); Input.pressedSet = {};
  if (Game.baits.length !== 1) errors.push('拿着附魔土豆按放置键，没有扔出诱饵');
  else {
    step(400, '僵尸跑向土豆');
    if (!z.ally) errors.push('僵尸没去吃诱饵（离玩家 ' + Math.round(Math.hypot(z.x - p.x, z.y - p.y)) +
      'px，诱饵还剩 ' + Game.baits.length + ' 个）');
    else if (Game.baits.length !== 0) errors.push('土豆被吃了却还留在地上');
    else console.log('  ✓ 附魔土豆：僵尸从 4 格外跑过来吃掉，倒戈加入小队（' + Game.allyCount() + '/' + Game.maxAllies + '）');
  }
}

/* 33. 僵尸小队会替你打敌人 */
{
  const ally = Game.mobs.find(m => m.ally);
  if (!ally) errors.push('前置失败：上一步没招到小队成员');
  else {
    Game.time = Game.dayLen * 0.6;
    const foe = new Mob('zombie', ally.x + 26, ally.y);
    Game.mobs.push(foe);
    const hpBefore = foe.hp;
    step(150, '小队僵尸扑向敌人');
    if (foe.hp >= hpBefore) errors.push('友军僵尸没有攻击敌方僵尸（距离 ' +
      Math.round(Math.hypot(foe.x - ally.x, foe.y - ally.y)) + 'px）');
    else console.log('  ✓ 僵尸小队会打敌人：敌方僵尸 ' + hpBefore + ' → ' + foe.hp);
    const fi = Game.mobs.indexOf(foe); if (fi >= 0) Game.mobs.splice(fi, 1);
  }
}

/* 34. 自己人不挨打：爆炸和近战都伤不到小队成员 */
{
  const p = Game.players[0];
  const ally = Game.mobs.find(m => m.ally);
  if (!ally) errors.push('前置失败：没有小队成员');
  else {
    const hp0 = ally.hp;
    Game.explode(ally.x, ally.y, 4, p);
    if (ally.hp < hp0) errors.push('爆炸伤到了自己人');
    p.x = ally.x - 20; p.y = ally.y; p.facing = { x: 1, y: 0 }; p.atkCd = 0; p.alive = true;
    p.inv[p.sel] = { id: 'ssword', count: 1 };
    Input.keys['Space'] = true; step(20, '对着自己人挥剑'); Input.keys['Space'] = false;
    if (ally.hp < hp0) errors.push('近战砍到了自己人');
    else console.log('  ✓ 自己人不挨打：爆炸 / 挥剑都伤不到小队成员（血 ' + hp0 + ' → ' + ally.hp + '）');
    p.inv[p.sel] = null;
  }
}

/* 35. 小队有上限；按 R 天亮不会把自己的小队清走 */
{
  Game.time = Game.dayLen * 0.6;
  Game.mobs.length = 0;
  for (let i = 0; i < Game.maxAllies; i++) {
    const m = new Mob('zombie', Game.players[0].x + 24 + i * 2, Game.players[0].y);
    m.ally = true; Game.mobs.push(m);
  }
  const extra = new Mob('zombie', Game.players[0].x + 70, Game.players[0].y);
  Game.mobs.push(extra);
  const bait = { x: extra.x, y: extra.y, life: 20, owner: Game.players[0] };
  Game.baits.push(bait);
  Game.feedBait(extra, bait);
  if (extra.ally) errors.push('小队满了还能继续塞人（' + Game.allyCount() + '/' + Game.maxAllies + '）');
  else console.log('  ✓ 僵尸小队有上限：满 ' + Game.maxAllies + ' 只以后，再喂土豆也不收');
  const before = Game.allyCount();
  Game.restartDay();
  const after = Game.allyCount();
  if (after !== before) errors.push('按 R 回到白天把自己的僵尸小队也清掉了（' + before + ' → ' + after + '）');
  else console.log('  ✓ 天亮不清走自己人：' + after + ' 只小队成员一起进入新的一天');
  Game.mobs.length = 0;
  Game.spawnTimer = 2;
}

/* 36. 附魔土豆：能合成、也能在地图上捡到 */
{
  const item = ITEMS['epotato'];
  const r = sandbox.RECIPES.filter(x => x.out.id === 'epotato')[0];
  const onGround = World.PICKUP_TABLE ? true : (sandbox.PICKUP_TABLE || []).some(t => t.id === 'epotato');
  if (!item || !item.bait) errors.push('附魔土豆物品定义不对');
  else if (!r) errors.push('附魔土豆没有合成配方');
  else if (!onGround) errors.push('地图上捡不到附魔土豆');
  else {
    const inv = sandbox.makeInv(20);
    sandbox.Inv.add(inv, 'apple', 2); sandbox.Inv.add(inv, 'gold', 2);
    if (!sandbox.Inv.craft(inv, r)) errors.push('材料够了却合成不出附魔土豆');
    else console.log('  ✓ 附魔土豆：苹果×2 + 金×2 可合成，地上也能捡到，打巨人僵尸必掉');
  }
}

/* 37. 跟随保护：按跟随键 → 自动跟过去，还替伙伴打怪 */
{
  Game.layer = 1; Game.mobs.length = 0; Game.spawnTimer = 9999;
  Game.panel = -1; Game.questPanel = -1; Game.dragonWish = null; Game.questOffer = null;
  const a = Game.players[0], b = Game.players[1];
  a.alive = true; b.alive = true; a.fused = null; b.fused = null;
  a.following = null; b.following = null;
  a.safeX = a.x = 60 * 32; a.safeY = a.y = 60 * 32;
  b.x = a.x + 320; b.y = a.y;                    // 把两人拉开
  b.safeX = b.x; b.safeY = b.y;
  const gap0 = dist(a.x, a.y, b.x, b.y);
  Input.pressedSet[a.ctl.follow] = true; step(1, 'P1 按跟随键'); Input.pressedSet = {};
  if (!a.following) errors.push('按了跟随键却没有进入跟随状态');
  else {
    step(240, '跟随中（不碰方向键）');
    const gap1 = dist(a.x, a.y, b.x, b.y);
    if (gap1 >= gap0) errors.push('跟随没跟过去：距离 ' + gap0.toFixed(0) + ' → ' + gap1.toFixed(0));
    else console.log('  ✓ 跟随保护：P1 自动跟到 P2 身边（' + gap0.toFixed(0) + ' → ' + gap1.toFixed(0) + ' 像素）');
    /* 护驾：身边有怪会自动打 */
    const z = new Mob('zombie', a.x + 30, a.y);
    Game.time = Game.dayLen * 0.6;
    Game.mobs.push(z);
    a.atkCd = 0;
    const zhp = z.hp;
    step(30, '怪靠近被保护者');
    if (z.hp >= zhp) errors.push('跟随状态下怪贴脸了也不还手');
    else console.log('  ✓ 护驾：跟着的时候会自动打靠近的怪（僵尸 ' + zhp + ' → ' + z.hp + '）');
    Game.mobs.length = 0;
    Input.pressedSet[a.ctl.follow] = true; step(1, '再按一次取消跟随'); Input.pressedSet = {};
    if (a.following) errors.push('再按一次跟随键没有取消跟随');
    else console.log('  ✓ 再按一次跟随键 → 取消跟随');
  }
  Game.spawnTimer = 2;
}

/* 38. 丢弃键：东西落到地上，而且不会立刻被自己捡回来 */
{
  const p = Game.players[0];
  p.inv[p.sel] = { id: 'stone', count: 5 };
  p.facing = { x: 1, y: 0 };
  Game.drops.length = 0;
  Input.pressedSet[p.ctl.drop] = true; step(1, '按丢弃键'); Input.pressedSet = {};
  const dropped = Game.drops.filter(d => d.id === 'stone');
  if (!dropped.length) errors.push('按了丢弃键地上却没有东西');
  else if (sandbox.Inv.count(p.inv, 'stone') !== 4) errors.push('丢弃后背包数量不对');
  else {
    const d0 = dropped[0];
    step(20, '丢下后原地站一会儿（约 0.3 秒）');
    if (!Game.drops.length) errors.push('丢下的东西立刻被自己捡回来了（应该有 1 秒冷却）');
    else console.log('  ✓ 丢弃：石头 ×1 落到地上，1 秒内不会被自己立刻捡回（剩 ' +
      sandbox.Inv.count(p.inv, 'stone') + ' 个）');
    /* 冷却过了能捡回来 */
    step(90, '等冷却过去');
    if (sandbox.Inv.count(p.inv, 'stone') !== 5) errors.push('冷却过后也没把丢下的东西捡回来');
    else console.log('  ✓ 冷却过后走过去能捡回来（5 个）');
  }
  p.inv[p.sel] = null;
  Game.drops.length = 0;
}

/* 39. 机器人守护者：召唤 → 远程打怪 */
{
  Game.layer = 1; Game.mobs.length = 0; Game.spawnTimer = 9999;
  Game.panel = -1; Game.questPanel = -1; Game.dragonWish = null; Game.questOffer = null;
  Challenges.active = null;
  const p = Game.players[0];
  p.alive = true; p.hp = p.maxhp; p.riding = null;
  clearArea(Math.floor(p.x / 32), Math.floor(p.y / 32), 8);      // 清一块空地，免得被树挡住
  const before = Game.robotCount();
  if (!Game.summonGuardian(p, 'robot')) errors.push('召唤机器人守护者失败');
  else {
    const bot = Game.mobs.filter(m => m.robot)[0];
    if (!bot || !bot.ally) errors.push('机器人不是友军');
    else {
      const z = new Mob('zombie', p.x + 150, p.y);
      Game.time = Game.dayLen * 0.6;
      const zhp = z.hp;
      Game.mobs.push(z);
      step(90, '机器人发现敌人');
      if (z.hp >= zhp && !Game.bullets.some(b => b.bot)) errors.push('机器人既没近战也没射击');
      else console.log('  ✓ 机器人守护者：召唤成功（' + before + ' → ' + Game.robotCount() +
        '），会远程射击敌人（僵尸 ' + zhp + ' → ' + z.hp + '）');
    }
  }
  Game.mobs.length = 0; Game.bullets.length = 0;
  Game.spawnTimer = 2;
}

/* 40. 坦克开炮：炮弹飞出去，命中会小范围爆炸 */
{
  Game.layer = 1; Game.mobs.length = 0; Game.spawnTimer = 9999;
  Game.panel = -1; Game.questPanel = -1; Game.dragonWish = null; Game.questOffer = null;
  Challenges.active = null;
  const p = Game.players[0];
  p.alive = true; p.hp = p.maxhp; p.riding = null;
  clearArea(Math.floor(p.x / 32), Math.floor(p.y / 32), 8);
  Game.summonVehicle(p, 'tank');
  const tank = Game.vehicles[Game.vehicles.length - 1];
  if (!tank || tank.type !== 'tank') errors.push('召唤坦克失败');
  else {
    tank.x = p.x; tank.y = p.y;
    tank.driver = p; p.riding = tank; tank.angle = 0; tank.cd = 0;
    clearArea(Math.floor(p.x / 32) + 3, Math.floor(p.y / 32), 3);   // 炮口前方清空
    const z = new Mob('zombie', p.x + 120, p.y);
    Game.time = Game.dayLen * 0.6;
    Game.mobs.push(z);
    const zhp = z.hp;
    Game.bullets.length = 0;
    Input.pressedSet[p.ctl.mine] = true; step(1, '按挖掘键开炮'); Input.pressedSet = {};
    const shell = Game.bullets.filter(b => b.shell);
    if (!shell.length) errors.push('坦克按挖掘键没有打出炮弹');
    else {
      step(20, '炮弹飞过去');
      if (z.hp >= zhp) errors.push('炮弹没有打中怪（僵尸血 ' + z.hp + '）');
      else console.log('  ✓ 坦克开炮：打出 ' + shell.length + ' 发炮弹，命中爆炸（僵尸 ' + zhp + ' → ' + z.hp + '）');
    }
    p.riding = null; tank.driver = null;
  }
  Game.mobs.length = 0; Game.bullets.length = 0;
  while (Game.vehicles.length) Game.vehicles.pop();
  Game.spawnTimer = 2;
}

/* 41. 炎魔：血最厚、会喷火球、打中会点燃 */
{
  const fl = new Mob('flamelord', 0, 0);
  const g = new Mob('giant', 0, 0), z = new Mob('zombie', 0, 0);
  if (!fl.flame || fl.maxhp <= g.maxhp) errors.push('炎魔血量不对：' + fl.maxhp + '（应该比巨人 ' + g.maxhp + ' 厚）');
  else {
    Game.layer = 1; Game.mobs.length = 0; Game.spawnTimer = 9999;
    Game.panel = -1; Game.questPanel = -1; Game.dragonWish = null; Game.questOffer = null;
    Challenges.active = null;
    const p = Game.players[0];
    p.alive = true; p.hp = p.maxhp; p.riding = null; p.burn = 0;
    clearArea(Math.floor(p.x / 32), Math.floor(p.y / 32), 10);
    fl.x = p.x + 200; fl.y = p.y;
    Game.time = Game.dayLen * 0.6;
    Game.mobs.push(fl);
    Game.bullets.length = 0;
    /* 逐帧看有没有火球（火球飞得快，等 200 帧再看早就命中消失了） */
    let sawFire = false;
    for (let k = 0; k < 220 && !sawFire; k++) {
      step(1, '炎魔靠近并喷火球');
      if (Game.bullets.some(b => b.hostile)) sawFire = true;
    }
    if (!sawFire) errors.push('炎魔没有喷出火球（距离 ' + dist(fl.x, fl.y, p.x, p.y).toFixed(0) + '）');
    else console.log('  ✓ 炎魔：' + fl.maxhp + ' 血（巨人 ' + g.maxhp + ' / 僵尸 ' + z.maxhp + '），会喷火球');
    /* 点燃：直接打一下看会不会 burn */
    p.hurtCd = 0; p.burn = 0;
    fl.atkCd = 0; fl.x = p.x + 20; fl.y = p.y;
    step(6, '炎魔贴脸打一下');
    if (p.burn <= 0) errors.push('被炎魔打中却没有被点燃');
    else {
      const hp0 = p.hp;
      step(30, '灼烧持续掉血');
      if (p.hp >= hp0) errors.push('点燃了却不会持续掉血');
      else console.log('  ✓ 灼烧：被炎魔打中会被点燃，之后持续掉血（' + hp0.toFixed(0) + ' → ' + p.hp.toFixed(0) + '）');
    }
    /* 打倒炎魔掉金子 + 大概率给龙珠 */
    p.inv.forEach((s, i) => { p.inv[i] = null; });
    p.burn = 0;
    Game.drops.length = 0;
    let gaveBall = false;
    for (let i = 0; i < 12 && !gaveBall; i++) {
      const f2 = new Mob('flamelord', p.x + 60, p.y);
      f2.hurt(99999, f2.x + 10, f2.y, p);
      if (sandbox.missingBalls(p).length < 7) gaveBall = true;
    }
    if (!gaveBall) errors.push('打倒 12 次炎魔一次龙珠都没给');
    else console.log('  ✓ 打倒炎魔：掉金子/药箱/土豆，还会给龙珠（已收到 ' + (7 - sandbox.missingBalls(p).length) + ' 颗）');
    Game.drops.length = 0;
  }
  Game.mobs.length = 0; Game.bullets.length = 0;
  Game.players[0].burn = 0;
  Game.spawnTimer = 2;
}

/* 42. 七龙珠：集齐 7 颗 → 召唤神龙 → 许愿 → 龙珠消耗掉 */
{
  const p = Game.players[0];
  p.inv.forEach((s, i) => { p.inv[i] = null; });
  /* 先测“只给还缺的那颗”，不会重复 */
  Game.grantDragonBall(p);
  const got1 = 7 - sandbox.missingBalls(p).length;
  Game.grantDragonBall(p);
  const got2 = 7 - sandbox.missingBalls(p).length;
  if (got1 !== 1 || got2 !== 2) errors.push('龙珠给重复了（' + got1 + ' → ' + got2 + '）');
  else console.log('  ✓ 龙珠：捡到的永远是“还缺的那颗”（' + got1 + ' → ' + got2 + '）');
  /* 补齐 */
  while (sandbox.missingBalls(p).length) Game.grantDragonBall(p);
  if (!sandbox.hasAllBalls(p)) errors.push('补齐后 hasAllBalls 仍然是 false');
  else {
    Game.dragonWish = null;
    Game.summonDragon(p);
    if (!Game.dragonWish) errors.push('集齐七颗龙珠却召唤不出神龙');
    else {
      const wishIdx = 1;                       // “满血 + 补给”
      p.hp = 3; p.food = 1;
      Game.doWish(wishIdx);
      if (p.hp !== p.maxhp) errors.push('许愿“满血”之后没有回满血');
      else if (sandbox.hasAllBalls(p)) errors.push('许愿之后龙珠没有消耗掉');
      else if (Game.dragonWish) errors.push('许愿之后许愿面板没有关掉');
      else console.log('  ✓ 神龙许愿：集齐 7 颗 → 召唤 → 选「' + Game.WISHES[wishIdx].name +
        '」→ 愿望生效，龙珠消耗并散落回世界');
    }
  }
  p.inv.forEach((s, i) => { p.inv[i] = null; });
}

/* 43. 生物群系地形效果：冰面会滑、岩浆会烧、藤蔓变慢 */
{
  Game.layer = 1; Game.mobs.length = 0; Game.spawnTimer = 9999;
  Game.panel = -1; Game.questPanel = -1; Game.dragonWish = null; Game.questOffer = null;
  Challenges.active = null;
  const p = Game.players[0];
  p.alive = true; p.hp = p.maxhp; p.riding = null; p.burn = 0;
  p.following = null; p.fused = null;
  /* 测试跑道：一条 21 格长的空走廊，方便测滑行/减速 */
  const LX = 200, LY = 200, HALF = 10;
  const paintFloor = (f) => {
    for (let dx = -HALF; dx <= HALF; dx++) {
      for (let dy = -1; dy <= 1; dy++) { Game.setObj(LX + dx, LY + dy, O.NONE); World.setFloor(1, LX + dx, LY + dy, f); }
    }
  };
  const run = (frames) => {                    // 往右跑若干帧，返回稳态速度
    Input.keys[p.ctl.right] = true;
    step(frames, '跑');
    const v = Math.abs(p.vx);
    Input.keys[p.ctl.right] = false;
    return v;
  };
  const reset = () => {
    p.x = (LX - HALF + 2) * 32 + 16; p.y = LY * 32 + 16;
    p.vx = 0; p.vy = 0; p.onSlip = false; p.inVine = false; p.safeX = p.x; p.safeY = p.y;
  };

  /* 岩浆 */
  paintFloor(F.LAVA);
  reset();
  const hp0 = p.hp;
  step(20, '站在岩浆上');
  if (p.hp >= hp0) errors.push('站在岩浆上不掉血');
  else console.log('  ✓ 岩浆：站上去持续掉血（' + hp0.toFixed(0) + ' → ' + p.hp.toFixed(0) + '）');
  p.hp = p.maxhp;
  Input.keys[p.ctl.right] = false;

  /* 藤蔓减速：和同一条跑道上的普通地面比 */
  paintFloor(F.GRASS);
  for (let dx = -HALF; dx <= HALF; dx++) Game.setObj(LX + dx, LY, O.VINE);
  reset();
  const vineSpd = run(25);
  p.vx = 0; p.vy = 0;
  paintFloor(F.GRASS);
  reset();
  const plainSpd = run(25);
  p.vx = 0; p.vy = 0;
  if (!(vineSpd < plainSpd * 0.8)) errors.push('藤蔓没有减速（藤蔓 ' + vineSpd.toFixed(0) + ' vs 平地 ' + plainSpd.toFixed(0) + '）');
  else console.log('  ✓ 藤蔓：踩上去明显变慢（' + vineSpd.toFixed(0) + ' vs 平地 ' + plainSpd.toFixed(0) + '）');

  /* 冰面：松手后还会滑一段 */
  paintFloor(F.ICE);
  reset();
  step(2, '踩一下冰面，让状态生效');
  run(20);
  const xBefore = p.x;
  step(6, '松手');
  const slide = p.x - xBefore;
  /* 对照：同样的跑法，在平地上滑多少 */
  paintFloor(F.GRASS);
  reset();
  step(2, '踩一下普通地面');
  run(20);
  const xBefore2 = p.x;
  step(6, '松手');
  const slide2 = p.x - xBefore2;
  if (!(slide > slide2 + 2)) errors.push('冰面上松手没有滑行（冰面 ' + slide.toFixed(1) + ' vs 平地 ' + slide2.toFixed(1) + '）');
  else console.log('  ✓ 冰面：松手之后还会往前滑 ' + slide.toFixed(1) + ' 像素（平地只滑 ' + slide2.toFixed(1) + '）');
  p.vx = 0; p.vy = 0;
  Game.spawnTimer = 2;
}

/* ==================== 本批新功能 ==================== */
console.log('\n【武器升级】');
{
  const p = Game.players[0];
  clearInv(p);
  Inv.add(p.inv, 'ssword', 1);
  const held = () => ({ id: 'ssword', def: ITEMS.ssword });
  const d0 = wDmg(p, held());
  Inv.give(p, 'ssword', 1);
  ok2(wLv(p, 'ssword') === 1, '再捡到一把石剑 → 升到 Lv1');
  ok2(wDmg(p, held()) > d0, '升级后伤害涨了：' + d0 + ' → ' + wDmg(p, held()));
  ok2(Inv.count(p.inv, 'ssword') === 1, '升级不会多塞一把进背包（还是 1 把）');
  for (let i = 0; i < 10; i++) Inv.give(p, 'ssword', 1);
  ok2(wLv(p, 'ssword') === 5, '最多 5 级（现在 Lv' + wLv(p, 'ssword') + '）');
  /* 10 次里前 4 次升级，剩下 6 次才变成第二把、第三把…… */
  ok2(Inv.count(p.inv, 'ssword') === 7, '满级之后再捡才变成第二把（' + Inv.count(p.inv, 'ssword') + ' 把）');
  clearInv(p);
  Inv.give(p, 'mgun', 1);
  ok2(wLv(p, 'mgun') === 0, '第一次拿到的是 Lv0 的新武器');
  const g0 = wGun(p, { id: 'mgun', def: ITEMS.mgun }).dmg;
  Inv.give(p, 'mgun', 1);
  ok2(wGun(p, { id: 'mgun', def: ITEMS.mgun }).dmg > g0,
    '机枪升级：子弹伤害 ' + g0 + ' → ' + wGun(p, { id: 'mgun', def: ITEMS.mgun }).dmg);
  clearInv(p);
  Inv.give(p, 'stone', 3);
  ok2(Inv.count(p.inv, 'stone') === 3 && wLv(p, 'stone') === 0, '不是武器的东西不会升级（石头照常堆叠）');
}

console.log('\n【自动存档 / 读档 / 首页继续】');
{
  const p = Game.players[0];
  Game.started = true;
  sandbox.localStorage.removeItem(Save.KEY);
  clearInv(p);
  Inv.add(p.inv, 'gold', 7);
  Inv.add(p.inv, 'ssword', 1);
  p.wlv = { ssword: 2 };
  p.hp = 21;
  Game.day = 3;
  ok2(Save.save(true), '存档写进 localStorage 成功');
  ok2(Save.has(), '能查到存档');
  ok2(/第 3 天/.test(Save.summary()), '首页摘要里带着天数：「' + Save.summary() + '」');
  p.hp = 4; clearInv(p); Game.day = 99;
  ok2(Save.load(), '读档成功');
  ok2(Game.day === 3, '读档：天数还原成 ' + Game.day);
  ok2(Inv.count(p.inv, 'gold') === 7, '读档：背包还原（金子 ' + Inv.count(p.inv, 'gold') + '）');
  ok2(p.hp === 21, '读档：血量还原成 ' + p.hp);
  ok2(wLv(p, 'ssword') === 2, '读档：武器等级也留着（石剑 Lv' + wLv(p, 'ssword') + '）');
  /* 自动存档：跑满 20 秒应当自动存一次 */
  sandbox.localStorage.removeItem(Save.KEY);
  Save.t = 0; Game.started = true;
  for (let i = 0; i < 1200; i++) Save.tick(0.016);       // 19.2 秒 → 还不该存
  ok2(!Save.has(), '自动存档：不到 20 秒不存');
  for (let i = 0; i < 100; i++) Save.tick(0.016);        // 跨过 20 秒
  ok2(Save.has(), '自动存档：跑满 20 秒自动存了一次');
  Game.started = true;
}

console.log('\n【益智神殿：一定有解】');
{
  const isWall = (x, y) => !Realm.inb(x, y) || Realm.get(x, y) === O.STONEB || Realm.get(x, y) === O.REXIT;
  let bad = 0;
  for (let k = 0; k < 80; k++) {
    Realm.seed = 3000 + k * 137;
    Realm.buildPuzzle();
    if (Realm.boxes.length !== 4 || Realm.pads.length !== 4) { bad++; continue; }
    if (Realm.onPads() === 4) { bad++; continue; }                 // 一进门就通关 = 没谜题
    /* 把记录下来的反向步子倒过来重放，就是一套完整解法 */
    const boxes = Realm.boxes.map(b => ({ x: b.x, y: b.y }));
    let legal = true;
    for (let i = Realm.revMoves.length - 1; i >= 0; i--) {
      const mv = Realm.revMoves[i], b = boxes[mv.b];
      const nx = b.x + mv.dx, ny = b.y + mv.dy;
      if (isWall(nx, ny)) { legal = false; break; }
      if (boxes.some(o => o !== b && o.x === nx && o.y === ny)) { legal = false; break; }
      b.x = nx; b.y = ny;
    }
    let on = 0;
    if (legal) for (const b of boxes) if (Realm.padAt(b.x, b.y)) on++;
    if (!legal || on !== 4) bad++;
  }
  ok2(bad === 0, '80 次随机生成全部有解（无解 ' + bad + ' 次）');
}

console.log('\n【益智神殿：推箱 / 复位 / 回家】');
{
  Game.layer = 1;
  const home = { x: Game.players[0].x, y: Game.players[0].y };
  Game.enterRealm('puzzle');
  ok2(Realm.active && Realm.kind === 'puzzle', '传送门 → 进入益智神殿');
  ok2(Realm.floorAt(2, 2) === 14, '神殿里铺的是自己的地砖（不是野外的草）');
  ok2(Realm.solid(0, 0) && !Realm.solid(Realm.entry.x, Realm.entry.y), '神殿有墙，出生点能站人');
  ok2(!Realm.open(), '一开始出口是关着的');
  /* 找一个左右都空着的箱子，站在它左边朝右推 */
  const isWall = (x, y) => !Realm.inb(x, y) || Realm.get(x, y) === O.STONEB || Realm.get(x, y) === O.REXIT;
  let tgt = null;
  for (const b of Realm.boxes) {
    if (isWall(b.x - 1, b.y) || isWall(b.x + 1, b.y)) continue;
    if (Realm.boxIndexAt(b.x - 1, b.y) >= 0 || Realm.boxIndexAt(b.x + 1, b.y) >= 0) continue;
    tgt = b; break;
  }
  if (!tgt) errors.push('益智神殿：找不到可以推的箱子');
  else {
    const bx0 = tgt.x, idx = Realm.boxIndexAt(bx0, tgt.y);
    const p = Game.players[0];
    p.x = (bx0 - 1) * TILE + TILE / 2; p.y = tgt.y * TILE + TILE / 2;
    p.facing.x = 1; p.facing.y = 0; p.pushCd = 0;
    Input.keys['KeyD'] = true;
    step(4, '推箱');
    Input.keys['KeyD'] = false;
    ok2(Realm.boxes[idx].x === bx0 + 1, '顶着箱子走 → 箱子被推走了一格（' + bx0 + ' → ' + Realm.boxes[idx].x + '）');
    Realm.resetBoxes();
    ok2(Realm.boxes[idx].x === bx0, '按重置键 → 箱子回到原位');
  }
  /* 直接摆成通关，验证出口会开 */
  Realm.boxes = Realm.pads.map(p2 => ({ x: p2.x, y: p2.y }));
  ok2(Realm.onPads() === Realm.boxes.length, '全部归位：' + Realm.onPads() + '/' + Realm.boxes.length);
  Realm.solved = true;
  ok2(Realm.open(), '全部归位之后出口开了');
  const p1 = Game.players[0];
  clearInv(p1);
  p1.x = Realm.exit.x * TILE + TILE / 2; p1.y = Realm.exit.y * TILE + TILE / 2;
  Realm.tryExit(p1);
  ok2(Game.lottery && Realm.active, '站上出口按交互键 → 先开出抽奖转盘（还没离开）');
  ok2(Game.lottery.cells.length === 8, '转盘上有 8 个奖品格');
  ok2(Game.lottery.cells.some(c => c.icon === 'dball'), '奖池里有龙珠');
  ok2(Game.lottery.phase === 'spin', '转盘在转');
  /* 转盘是暂停态，绕过 step() 的暂停检测直接跑帧 */
  for (let f = 0; f < 210; f++) { Game.update(0.016); Game.render(); Input.endFrame(); }
  ok2(Game.lottery && Game.lottery.phase === 'done', '转盘停稳了（3 秒左右）');
  ok2(Game.lotteryIdx() === Game.lottery.target, '高亮停在抽中的那一格上');
  const prizeCell = Game.lottery.cells[Game.lottery.target];
  const invBefore = {};
  for (const c of Game.lottery.cells) { if (c.icon && ITEMS[c.icon] && c.icon !== 'dball') invBefore[c.icon] = Inv.count(p1.inv, c.icon); }
  Input.pressedSet['KeyF'] = true; step(1, '收下奖励'); Input.pressedSet = {};
  ok2(!Game.lottery, '按交互键 → 收下奖励，转盘关了');
  ok2(!Realm.active, '抽奖结束自动回到原来的世界');
  ok2(Math.abs(p1.x - home.x) < 2 && Math.abs(p1.y - home.y) < 2, '回到进传送门之前站的地方');
  /* 到底发奖没有：总有一格的东西进了背包（龙珠走 grantDragonBall，其余直接给） */
  const gotSomething = Object.keys(invBefore).some(id => Inv.count(p1.inv, id) > (invBefore[id] || 0)) ||
    p1.inv.some(s => s && /^db\d$/.test(s.id));
  ok2(gotSomething, '抽到的「' + prizeCell.label + '」真的进了背包');
}

console.log('\n【试炼竞技场】');
{
  Game.enterRealm('arena');
  ok2(Realm.active && Realm.kind === 'arena', '城堡传送门 → 进入试炼竞技场');
  ok2(Realm.floorAt(2, 2) === 15, '竞技场铺的是沙地');
  ok2(!Realm.open(), '怪还没清完，出口是关的');
  step(180, '等第一波');
  ok2(Realm.wave === 1, '约 2 秒后刷出第一波（wave=' + Realm.wave + '）');
  const n1 = Game.mobs.filter(m => m.realm).length;
  ok2(n1 > 0, '场上出现 ' + n1 + ' 只怪');
  for (let w = 0; w < 3; w++) {
    Game.mobs = Game.mobs.filter(m => !m.realm);          // 一键清场
    step(200, '清完第 ' + (w + 1) + ' 波');
  }
  ok2(Realm.cleared, '三波清完 → 通关，出口开了');
  const p1 = Game.players[0];
  p1.x = Realm.exit.x * TILE + TILE / 2; p1.y = Realm.exit.y * TILE + TILE / 2;
  Realm.tryExit(p1);
  ok2(Game.lottery && Realm.active, '站上出口按交互键 → 竞技场也开抽奖转盘');
  for (let f = 0; f < 220; f++) { Game.update(0.016); Game.render(); Input.endFrame(); }
  ok2(Game.lottery && Game.lottery.phase === 'done', '转盘停稳了');
  Input.pressedSet['KeyF'] = true; step(1, '收下奖励'); Input.pressedSet = {};
  ok2(!Realm.active && !Game.lottery, '抽完奖拿完奖励回主世界');
  ok2(Game.mobs.filter(m => m.realm).length === 0, '竞技场的怪不会跟着回到主世界');
}

console.log('\n【霸王龙】');
{
  Game.layer = 1;
  const p = Game.players[0];
  const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
  clearArea(ptx, pty, 6);
  const m = new Mob('trex', p.x + 70, p.y);
  Game.mobs.push(m);
  ok2(m.maxhp === 1500, '霸王龙 1500 血（小僵尸才 24）');
  ok2(m.dmg <= 28 && 28 < p.maxhp, '咬击 ' + m.dmg + ' 伤害 —— 满血 ' + p.maxhp + ' 能挨一下，不至于秒杀');
  /* 咆哮：范围减速 */
  p.hp = p.maxhp; p.slow = 0;
  p.x = m.x + 60; p.y = m.y;
  m.roarCd = 0; m.chargeCd = 99;
  step(6, '霸王龙咆哮');
  ok2(p.slow > 0, '咆哮之后被吓慢（slow 剩 ' + p.slow.toFixed(1) + ' 秒）');
  /* 冲锋 */
  p.hp = p.maxhp; p.x = m.x + 200; p.y = m.y;
  m.roarCd = 99; m.chargeCd = 0; m.charge = 0;
  step(3, '霸王龙冲锋');
  ok2(m.charge > 0, '拉开距离之后会低头冲锋');
  /* 打倒之后的奖励 */
  m.hp = 1;
  m.hurt(50, m.x + 20, m.y, p);
  ok2(!m.alive, '霸王龙被打倒');
  ok2(Game.drops.some(d => d.id === 'cball'), '打倒霸王龙会掉收服球');
  ok2(Game.drops.length >= 4, '掉落很丰盛（' + Game.drops.length + ' 堆）');
  Game.mobs = Game.mobs.filter(x => x !== m);
}

console.log('\n【收服小精灵 / 放出来当帮手】');
{
  const p = Game.players[0];
  const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
  clearArea(ptx, pty, 7);
  const m = new Mob('fairy', p.x + 46, p.y);
  Game.mobs.push(m);
  ok2(m.catchable, '小精灵是可收服的野怪');
  clearInv(p);
  p.inv[0] = { id: 'cball', count: 30 }; p.sel = 0;
  p.hp = p.maxhp;
  m.hurt(m.hp - 3, p.x, p.y, p);                  // 打到只剩 3 血（顺便把它惹毛）
  let tries2 = 0;
  while (p.pets.length === 0 && tries2 < 25) {
    tries2++;
    const dx = m.x - p.x, dy = m.y - p.y, l = Math.hypot(dx, dy) || 1;
    p.facing.x = dx / l; p.facing.y = dy / l;
    Game.throwBall(p);
    for (let f = 0; f < 14; f++) { Game.update(0.016); Game.render(); Input.endFrame(); }
  }
  ok2(p.pets.length === 1, '扔了 ' + tries2 + ' 次收服球，抓住了小精灵');
  ok2(p.pets[0] && p.pets[0].type === 'fairy', '进了 ' + p.name + ' 的宠物栏');
  p.petCd = 0;
  const before = Game.allyCount();
  ok2(p.releasePet(), '按放生键 → 派出来了');
  const pet = Game.mobs.filter(mm => mm.pet)[0];
  ok2(!!pet && pet.ally, '放出来的小精灵是自己人（ally=' + (pet && pet.ally) + '）');
  ok2(Game.allyCount() === before + 1, '友军数量 +1（' + before + ' → ' + Game.allyCount() + '）');
  /* 打倒它 → 回栏里养伤，还能再放 */
  if (pet) { pet.hurt(9999, pet.x + 10, pet.y, p); }
  ok2(p.pets[0].out === false, '倒下之后回宠物栏养伤（还能再放出来）');
  ok2(p.pets[0].hp > 0 && p.pets[0].hp <= p.pets[0].maxhp, '回栏时留了 ' + p.pets[0].hp + ' 血');
}

console.log('\n【小精灵与植物：白天也会出现】');
{
  Game.mobs = Game.mobs.filter(mm => !mm.catchable);
  Game.critterTimer = 0;                 // 打开「白天刷小家伙」
  Game.spawnCritter();
  Game.critterTimer = 1e9;
  const c = Game.mobs.filter(mm => mm.catchable)[0];
  ok2(!!c, '白天也能刷出可以收服的小家伙（' + (c ? c.label : '没刷出来') + '）');
  if (c) {
    ok2(['fairy', 'peashooter', 'sunflower', 'wallnut'].indexOf(c.type) >= 0, '刷出来的是小精灵或植物：' + c.label);
    ok2(c.passive && !c.aggro, '刷出来是中性的 —— 不会主动打人（' + c.label + '）');
    if (c.plant) ok2(c.speed === 0, '植物是扎在土里不动的（' + c.label + ' speed=' + c.speed + '）');
    else ok2(c.speed > 0, '小精灵是会飞的（' + c.label + ' speed=' + c.speed + '）');
    /* 豌豆射手：不惹它就不打人，打了才还手 */
    Game.mobs = Game.mobs.filter(mm => !mm.catchable);
    const pp = Game.players[0];
    pp.alive = true; pp.hp = pp.maxhp; pp.food = pp.maxfood; pp.respawn = 0;
    const ps = new Mob('peashooter', pp.x + 150, pp.y);
    Game.mobs.push(ps);
    const peaThere = () => Game.bullets.some(b => b.hostile && b.color === '#86EFAC');
    let passiveFire = false;
    Game.bullets.length = 0;
    for (let f = 0; f < 100 && !passiveFire; f++) { step(1, '豌豆射手待机'); if (peaThere()) passiveFire = true; }
    ok2(!passiveFire, '不惹豌豆射手，它就不会放冷枪（可以从旁边安心走过）');
    ps.hurt(3, pp.x, pp.y, pp);                     // 惹毛它
    ok2(ps.aggro, '打它一下 → 它记仇了');
    let angry = false;
    Game.bullets.length = 0;
    for (let f = 0; f < 150 && !angry; f++) { step(1, '豌豆射手还手'); if (peaThere()) angry = true; }
    ok2(angry, '被惹毛之后开始隔着老远吐豌豆');
    Game.mobs = Game.mobs.filter(mm => mm !== ps);
  }
  /* 向日葵：被收服之后给主人回血 */
  Game.mobs = Game.mobs.filter(mm => !mm.catchable);
  const p = Game.players[0];
  p.alive = true; p.respawn = 0;
  p.hp = 10;
  const sf = new Mob('sunflower', p.x + 40, p.y);
  sf.ally = true; sf.leader = p; sf.recruiter = p;
  Game.mobs.push(sf);
  step(260, '向日葵回血');
  ok2(p.hp > 10, '向日葵给主人回了血（10 → ' + p.hp.toFixed(1) + '）');
  Game.mobs = Game.mobs.filter(mm => mm !== sf);
}

/* 14. 长时间空转（内存/数组不会爆，顺便让白天的小精灵也刷起来一起跑） */
Game.critterTimer = 2;
const t0 = Date.now();
step(1200, '空转 20 秒游戏时间');
console.log('  ✓ 1200 帧耗时 ' + (Date.now() - t0) + 'ms，区块数 ' + World.stats.chunks +
  '，怪物 ' + Game.mobs.length + '，掉落 ' + Game.drops.length);

/* 15. 黑屏自愈：坐标飘成 NaN / 渲染抛异常都不能把游戏搞死 */
console.log('\n【黑屏自愈】');
{
  const p = Game.players[0];
  const sx = p.safeX, sy = p.safeY;
  p.x = NaN; p.y = Infinity;
  p.vx = NaN;
  step(2, '坐标漂成 NaN');
  ok2(isFinite(p.x) && isFinite(p.y), '每帧的看门狗把 NaN 坐标拉回了安全点（' + p.x.toFixed(0) + ', ' + p.y.toFixed(0) + '）');
  ok2(Math.abs(p.x - sx) < 1 && Math.abs(p.y - sy) < 1, '拉回的正是存档安全点');
  /* 主循环保护：某帧抛了异常，下一帧照样能跑 */
  Game.started = true;
  let threw = false;
  const origRender = Game.render;
  Game.render = function () { throw new Error('boom'); };
  try { for (let f = 0; f < 3; f++) { try { Game.update(0.016); Game.render(); } catch (e) { threw = true; } Input.endFrame(); } } finally { Game.render = origRender; }
  ok2(threw, '异常真的抛出来了（模拟坏帧）');
  let ranAfter = false;
  try { Game.update(0.016); ranAfter = true; } catch (e) { }
  ok2(ranAfter, '坏帧之后游戏还能继续跑（主循环有保护，不会黑屏卡死）');
  Game.render = origRender;
  /* selfHeal：全场大扫除把所有坏数据清干净 */
  Game.mobs.push(new Mob('zombie', NaN, NaN));
  Game.bullets.push({ x: NaN, y: 1, vx: 0, vy: 0, life: 1 });
  Game.balls.push({ x: 1, y: Infinity, vx: 0, vy: 0, life: 1, t: 0, p: p });
  Game.cam.x = NaN; Game.cam.zoom = NaN;
  Game.selfHeal();
  ok2(Game.mobs.every(m => isFinite(m.x) && isFinite(m.y)), 'selfHeal 之后所有怪坐标正常');
  ok2(Game.bullets.length === 0 && Game.balls.length === 0, '带 NaN 的子弹/收服球被清掉');
  ok2(isFinite(Game.cam.x) && isFinite(Game.cam.zoom), '相机恢复正常');
  step(30, '自愈后再跑半秒');
  ok2(true, '自愈后世界继续运转');
  /* rrect 负半径不会抛异常（窄窗口下的保护） */
  const fakeCtx = { beginPath: noop, moveTo: noop, arcTo: noop, closePath: noop };
  let rrectOk = true;
  try { sandbox.rrect(fakeCtx, 0, 0, -50, 20, 12); } catch (e) { rrectOk = false; }
  ok2(rrectOk, 'rrect 拿到负宽高也不会抛异常');
  /* P2 换佐助套装：画一遍不炸 */
  let drawOk = true;
  try { Game.players[1].draw(makeCtx()); } catch (e) { drawOk = false; }
  ok2(drawOk, 'P2 佐助形象渲染正常');
}

/* 16. 拳皇式选人：角色库 / 属性应用 / 选人状态机 / 存档带角色 */
console.log('\n【拳皇式选人】');
{
  /* 16.1 角色库本身 */
  ok2(CHARS.length === 8, '角色库有 8 位英雄（实际 ' + CHARS.length + ' 位）');
  const ids = new Set(CHARS.map(c => c.id));
  ok2(ids.size === CHARS.length, '角色 id 没有重复');
  ok2(CHARS.every(c => c.name && c.src && c.tag && c.kit && c.stats), '每个角色都有名字/出处/定位/配色/属性');
  ok2(CHARS.every(c => c.stats.speed >= 150 && c.stats.speed <= 195), '速度都在 150–195 之间（不破坏平衡）');
  ok2(CHARS.every(c => c.stats.hp >= 28 && c.stats.hp <= 38), '血量都在 28–38 之间（避免满血被一击秒杀）');
  ok2(CHARS.every(c => c.stats.dmg >= 0.85 && c.stats.dmg <= 1.25), '攻击倍率都在 0.85–1.25 之间');
  ok2(CHARS.some(c => c.src === '漫威'), '有漫威阵营的角色');
  ok2(CHARS.filter(c => c.src === '火影忍者').length === 2, '火影有鸣人 + 佐助');
  ok2(charById('spider').name === '蜘蛛侠', 'charById 能按 id 找到角色');
  ok2(charById('不存在的') === null, 'charById 找不到时返回 null');
  /* 8 种头型全部画得出来（不抛异常） */
  let allDraw = true;
  for (const c of CHARS) {
    try { drawHeroSprite(makeCtx(), { x: 50, y: 50, s: 1, ch: c, bob2: 1, facing: { x: 1, y: 0 }, fused: false, time: 1 }); }
    catch (e) { allDraw = false; console.log('    ' + c.name + ' 画挂了: ' + e.message); }
  }
  ok2(allDraw, '8 位英雄的形象都渲染得出来');

  /* 16.2 换角色 = 换属性 */
  const p1 = Game.players[0], p2 = Game.players[1];
  ok2(Game.applyChar(p1, 'ironman'), 'P1 换钢铁侠');
  ok2(p1.speed === 160 && p1.maxhp === 36 && p1.dmgMul === 1.05, '属性跟着换成钢铁侠的（速度 ' + p1.speed + ' 血 ' + p1.maxhp + ' 倍率 ' + p1.dmgMul + '）');
  p1.hp = 99;
  Game.applyChar(p1, 'spider');
  ok2(p1.hp === p1.maxhp, '换角色时多出来的血被钳到新上限（' + p1.hp + '/' + p1.maxhp + '）');
  ok2(!Game.applyChar(p1, 'nope-nope'), '换不存在的角色会失败');
  ok2(p1.char.id === 'spider', '换失败的请求不生效，还是蜘蛛侠');
  /* 恢复默认，别影响后面的用例 */
  Game.applyChar(p1, 'naruto'); Game.applyChar(p2, 'sasuke');
  p1.hp = p1.maxhp; p2.hp = p2.maxhp;

  /* 16.3 伤害乘算：同一把武器，奥特曼打得比皮卡丘疼 */
  {
    const gk = Game.players[0];
    clearInv(gk);
    Inv.give(gk, 'ssword', 1);
    Game.applyChar(gk, 'ultra');
    const dmgU = Math.max(1, Math.round((3 + wDmg(gk, Inv.held(gk))) * gk.dmgMul));
    Game.applyChar(gk, 'pika');
    const dmgP = Math.max(1, Math.round((3 + wDmg(gk, Inv.held(gk))) * gk.dmgMul));
    ok2(dmgU > dmgP, '同一把石剑：奥特曼 ' + dmgU + ' 伤 > 皮卡丘 ' + dmgP + ' 伤（角色攻击倍率生效）');
    Game.applyChar(gk, 'naruto');
    gk.hp = gk.maxhp;
  }

  /* 16.4 选人状态机：P1 键盘选 → 轮到 P2 → 都选完开游戏 */
  const savedStarted = Game.started;
  const savedSolo = Game.solo;
  Game.started = false;                       // 选人发生在开局前
  Game.solo = false;
  Game._setupState = { players: '2', p1ctl: 'kb', p2ctl: 'kb' };
  Game._beginGame = function () { Game.started = true; };   // 测试里替换掉真开始
  Game.openCharSelect();
  ok2(Game.select && Game.select.active && Game.select.turn === 0, '打开选人：轮到 P1（' + (CHARS[Game.select.cur[0]].name) + ' 待选）');
  /* 模拟一帧 = 设置按键 → updateSelect → 清帧（endFrame），保证确定性 */
  const selFrame = (dt, presses, holds) => {
    for (const k in (presses || {})) Input.pressedSet[k] = presses[k];
    for (const k in (holds || {})) Input.keys[k] = holds[k];
    Game.updateSelect(dt);
    Input.endFrame();
  };
  /* P1 的键不该在 P2 回合生效：先按 P2 的右键，应该没反应（还没轮到 P2） */
  selFrame(0.016, { ArrowRight: true });
  ok2(Game.select.cur[0] === 0 && Game.select.turn === 0, 'P2 的方向键在 P1 回合不起作用');
  selFrame(0.016, { KeyD: true });
  ok2(Game.select.cur[0] === 1, 'P1 按 D 光标右移到 ' + CHARS[1].name);
  selFrame(0.016, { KeyD: true });
  ok2(Game.select.cur[0] === 2, '再按 D 移到 ' + CHARS[2].name);
  /* 按住连续走（带间隔的 repeat） */
  selFrame(1.0, {}, { KeyD: true });
  ok2(Game.select.cur[0] > 2, '按住 D 连续向右滑（到 ' + CHARS[Game.select.cur[0]].name + '）');
  Input.keys['KeyD'] = false;
  /* P1 确认 */
  const p1Pick = CHARS[Game.select.cur[0]].id;
  selFrame(0.016, { KeyE: true });
  ok2(Game.select.turn === 1 && Game.select.picked[0] === p1Pick, 'P1 选定 ' + CHARS.find(c => c.id === p1Pick).name + '，轮到 P2');
  ok2(Game.select.cur[1] !== CHARS.findIndex(c => c.id === p1Pick), 'P2 的光标没有停在被选走的卡上');
  /* P2 试图选同一个：光标移回去再确认，应当被拒绝 */
  const p1Idx = CHARS.findIndex(c => c.id === p1Pick);
  Game.select.cur[1] = p1Idx;
  selFrame(0.016, { Enter: true });
  ok2(Game.select && Game.select.turn === 1 && Game.select.picked[1] === null, 'P2 选同一个英雄会被拒绝');
  /* P2 换一个（避开被选走的） */
  let ni = p1Idx;
  do { ni = (ni + 1) % CHARS.length; } while (CHARS[ni].id === Game.select.picked[0]);
  Game.select.cur[1] = ni;
  selFrame(0.016, { Enter: true });
  ok2(Game.started === true, '两人都选完 → 开始游戏');
  ok2(Game.players[0].char.id === p1Pick, 'P1 的形象换成了 ' + Game.players[0].char.name);
  ok2(Game.players[1].char.id === CHARS[ni].id, 'P2 的形象换成了 ' + Game.players[1].char.name);
  ok2(Game.players[0].speed === CHARS.find(c => c.id === p1Pick).stats.speed, 'P1 的速度用的是新角色的');
  Game.solo = savedSolo;
  Game.started = savedStarted;

  /* 16.5 存档带角色 */
  {
    sandbox.localStorage.removeItem(Save.KEY);
    Game.applyChar(Game.players[0], 'captain');
    Game.applyChar(Game.players[1], 'pika');
    ok2(Save.save(true), '带着角色存档成功');
    const raw = JSON.parse(sandbox.localStorage.getItem(Save.KEY));
    ok2(raw.players[0].charId === 'captain' && raw.players[1].charId === 'pika', '存档里记着两人选的角色');
    /* 读回来 */
    Game.applyChar(Game.players[0], 'naruto');
    Game.applyChar(Game.players[1], 'sasuke');
    Game.players[0].hp = 30;
    ok2(Save.load(), '读档成功');
    ok2(Game.players[0].char.id === 'captain' && Game.players[1].char.id === 'pika', '读档后角色恢复成美国队长 + 皮卡丘');
    ok2(Game.players[1].maxfood === 24, '皮卡丘的大胃王属性也回来了（体力上限 ' + Game.players[1].maxfood + '）');
    ok2(Game.players[0].hp <= Game.players[0].maxhp, '血量没超过新角色上限');
    sandbox.localStorage.removeItem(Save.KEY);
  }

  /* 恢复默认角色，避免影响后续/重复跑 */
  Game.applyChar(Game.players[0], 'naruto'); Game.applyChar(Game.players[1], 'sasuke');
  Game.players[0].hp = Game.players[0].maxhp;
  Game.players[1].hp = Game.players[1].maxhp;
  Game.select = null;
}

if (errors.length) {
  console.log('\n❌ 发现 ' + errors.length + ' 个问题:');
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
}
console.log('\n✅ 模拟测试全部通过');
