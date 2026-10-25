/* 无头验证世界生成（地面层 + 物件层） */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const dir = path.join(__dirname, 'js');

function stubCtx() {
  /* 方法必须返回 ctx 自己，否则 createRadialGradient().addColorStop() 会炸 */
  const ctx = new Proxy({}, {
    get(t, k) { return () => ctx; },
    set() { return true; }
  });
  return ctx;
}
const sandbox = {
  console, Math, Uint8Array, Float32Array, Array, Object, JSON, Number, String, Proxy,
  document: { createElement: () => ({ width: 0, height: 0, getContext: stubCtx }) }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, 'util.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, 'world.js'), 'utf8'), sandbox);
const { World, F, O, FDEF, ODEF, SKY_HOLES } = sandbox;

let bad = [];
const ok = (c, m) => { if (!c) bad.push(m); };

/* 1. 出生点：地面是草地、物件为空（可以站） */
const spawnF = World.getFloor(0, 0, 0), spawnO = World.getObj(0, 0, 0);
ok(spawnF === F.GRASS, '出生地面不是草地: ' + spawnF);
ok(spawnO === O.NONE, '出生点被物件挡住了: ' + spawnO);
ok(!World.solid(0, 0, 0), '出生点是实心的');

/* 2. 天空岛：有草、有树、有石头/煤，远处是云海 */
let grass = 0, tree = 0, rock = 0, coal = 0, water = 0;
for (let y = -20; y <= 20; y++) {
  for (let x = -20; x <= 20; x++) {
    const f = World.getFloor(0, x, y), o = World.getObj(0, x, y);
    if (f === F.GRASS) grass++;
    if (f === F.WATER) water++;
    if (o === O.LOG) tree++;
    if (o === O.ROCK) rock++;
    if (o === O.COAL) coal++;
  }
}
ok(grass > 800, '岛上草地太少: ' + grass);
ok(tree >= 6, '岛上树太少（做不出木板）: ' + tree);
ok(rock + coal >= 5, '岛上石头太少（做不出石镐）: rock=' + rock + ' coal=' + coal);

let farCloud = 0;
for (let a = 0; a < 32; a++) {
  const ang = a / 32 * Math.PI * 2;
  if (World.getFloor(0, Math.round(Math.cos(ang) * 60), Math.round(Math.sin(ang) * 60)) === F.CLOUD) farCloud++;
}
ok(farCloud >= 30, '远处没有形成云海: ' + farCloud + '/32');

/* 3. 云洞能触发下降 */
let holes = 0;
for (const [hx, hy] of SKY_HOLES) if (World.getFloor(0, hx, hy) === F.HOLE) holes++;
ok(holes === SKY_HOLES.length, '云洞数量不对: ' + holes);

/* 4. 地面大陆：可走比例、地形与资源 */
const fc = {}, oc = {};
let rune = 0, chest = 0, updraft = 0, walkable = 0;
const t0 = Date.now();
for (let cy = -6; cy <= 6; cy++) {
  for (let cx = -6; cx <= 6; cx++) {
    const c = World.chunk(1, cx, cy);
    for (let i = 0; i < c.floor.length; i++) {
      const f = c.floor[i], o = c.obj[i];
      fc[f] = (fc[f] || 0) + 1; oc[o] = (oc[o] || 0) + 1;
      if (o === O.RUNE) rune++;
      if (o === O.CHEST) chest++;
      if (f === F.UPDRAFT) updraft++;
      const fd = FDEF[f] || {};
      if (!fd.void_ && !(ODEF[o] && ODEF[o].solid)) walkable++;
    }
  }
}
const ms = Date.now() - t0;
const total = 13 * 13 * 256;
const pct = n => (n / total * 100).toFixed(2) + '%';
ok(walkable / total > 0.6, '可走地面比例过低: ' + pct(walkable));
ok((fc[F.WATER] || 0) > total * 0.03, '水太少: ' + pct(fc[F.WATER] || 0));
ok((oc[O.ROCK] || 0) + (oc[O.COAL] || 0) > total * 0.005, '可挖的石头太少: ' + pct((oc[O.ROCK] || 0) + (oc[O.COAL] || 0)));
/* 木头来源：平原的树 + 丛林的巨木 */
const woodAll = (oc[O.LOG] || 0) + (oc[O.JTREE] || 0) + (oc[O.PALM] || 0);
ok(woodAll > total * 0.002, '树太少（做不出木板）: ' + pct(woodAll));
ok(rune > 0, '没有符文石 → 永远进不了迷宫');
ok(chest > 0, '没有宝箱');
ok((oc[O.IRON] || 0) > 0 && (oc[O.GOLD] || 0) > 0, '铁/金矿缺失');

/* 5. 生物群系：四种地貌都得能生成出来（不然地图太单调） */
const seen = {};
for (let y = -340; y <= 340; y += 12) {
  for (let x = -340; x <= 340; x += 12) seen[sandbox.biomeAt(x, y, World.seed)] = (seen[sandbox.biomeAt(x, y, World.seed)] || 0) + 1;
}
const bkeys = Object.keys(seen);
ok(bkeys.length >= 3, '生物群系种类太少，只生成了: ' + bkeys.join('/'));
ok(seen.plain > 0, '没有平原');

/* 6. 冰封迷宫：冰原上能生成冰宫，而且一定有出口和宝箱，从入口 BFS 能走到宝箱 */
let palace = null;
for (let cy = -18; cy <= 18 && !palace; cy++) {
  for (let cx = -18; cx <= 18 && !palace; cx++) {
    if (sandbox.biomeAt(cx * 16 + 8, cy * 16 + 8, World.seed) !== 'ice') continue;
    if (sandbox.hash2(cx, cy, World.seed + 777) >= 0.20) continue;
    palace = { cx, cy };
  }
}
ok(!!palace, '冰原上找不到冰宫');
if (palace) {
  const bx = palace.cx * 16, by = palace.cy * 16;
  let walls = 0, chestIn = 0, doorOpen = 0;
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      const o = World.getObj(1, bx + x, by + y);
      if (o === O.ICEWALL) walls++;
      if (o === O.CHEST) chestIn++;
    }
  }
  if (World.getObj(1, bx + 7, by + 14) === O.NONE) doorOpen = 1;
  ok(walls > 40, '冰宫的墙太少: ' + walls);
  ok(chestIn === 1, '冰宫中心应该有一个宝箱，实际: ' + chestIn);
  ok(doorOpen === 1, '冰宫南边没有开口（进不去）');
  /* 从入口 BFS，检查能不能走到中心宝箱 */
  const key = (x, y) => y * 15 + x;
  const q = [[7, 14]], vis = new Set([key(7, 14)]);
  let reachChest = false;
  while (q.length) {
    const [x, y] = q.shift();
    if (x === 7 && y === 7) { reachChest = true; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 14 || ny > 14) continue;
      if (vis.has(key(nx, ny))) continue;
      if (World.getObj(1, bx + nx, by + ny) === O.ICEWALL) continue;
      vis.add(key(nx, ny)); q.push([nx, ny]);
    }
  }
  ok(reachChest, '冰宫的宝箱走不到（迷宫无解）');
}

/* 7. 降落点可站（而且不能是岩浆） */
const spot = World.findSpot(1, 0, 8, 10);
ok(!World.solid(1, spot.x, spot.y), '降落点是实心的');
const spotF = FDEF[World.getFloor(1, spot.x, spot.y)] || {};
ok(!spotF.void_, '降落点在云海上');
ok(!spotF.lava, '降落点在岩浆里');

/* 8. 城堡与传送门祭坛：地面上要能遇到，而且进得去、传送门站得住 */
let castle = null, altar = null;
for (let cy = -24; cy <= 24 && !(castle && altar); cy++) {
  for (let cx = -24; cx <= 24 && !(castle && altar); cx++) {
    const s = sandbox.structAt(cx, cy, World.seed);
    if (!s) continue;
    const bi = sandbox.biomeAt(cx * 16 + 8, cy * 16 + 8, World.seed);
    if (s.kind === 'castle' && !castle && bi !== 'ice' && bi !== 'volcano') castle = s;
    if (s.kind === 'altar' && !altar) altar = s;
  }
}
ok(!!castle, '地面上找不到城堡');
ok(!!altar, '地面上找不到传送门祭坛');
ok(!(ODEF[O.PORTAL] && ODEF[O.PORTAL].solid), '传送门是实心的（站不上去）');
ok(!!ODEF[O.PORTAL].unbreakable && !!ODEF[O.CPORTAL].unbreakable, '传送门必须挖不掉（不然会被拆了）');

/* 城堡：墙、正门、中央传送门，而且从正门能走到传送门 */
if (castle) {
  let walls = 0, torches = 0;
  for (let y = 0; y < castle.size; y++) {
    for (let x = 0; x < castle.size; x++) {
      const o = World.getObj(1, castle.ox + x, castle.oy + y);
      if (o === O.STONEB) walls++;
      if (o === O.TORCH) torches++;
    }
  }
  ok(walls > 30, '城堡的墙太少: ' + walls);
  ok(torches >= 4, '城堡里没有火把（黑漆漆的）: ' + torches);
  ok(World.getObj(1, castle.ox + 5, castle.oy + 5) === O.CPORTAL, '城堡正中央不是竞技场传送门');
  ok(World.getObj(1, castle.ox + 5, castle.oy + 10) === O.NONE, '城堡南边正门被堵死了');
  const ckey = (x, y) => y * castle.size + x;
  const cq = [[5, 10]], cvis = new Set([ckey(5, 10)]);
  let reach = false;
  while (cq.length) {
    const [x, y] = cq.shift();
    if (x === 5 && y === 5) { reach = true; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= castle.size || ny >= castle.size) continue;
      if (cvis.has(ckey(nx, ny))) continue;
      if (World.solid(1, castle.ox + nx, castle.oy + ny)) continue;
      cvis.add(ckey(nx, ny)); cq.push([nx, ny]);
    }
  }
  ok(reach, '城堡的传送门走不到（被封死了）');
}
/* 祭坛：正中央是益智神殿传送门 */
if (altar) {
  ok(World.getObj(1, altar.ox + 2, altar.oy + 2) === O.PORTAL, '祭坛正中央不是益智神殿传送门');
  ok(World.getObj(1, altar.ox + 2, altar.oy + 4) === O.NONE, '祭坛南边没留口子（进不去）');
}

console.log('169 区块生成 ' + ms + 'ms');
console.log('群系 → ' + bkeys.map(k => k + ' ' + (seen[k] / 3364 * 100).toFixed(0) + '%').join(' · '));
console.log('地面 → 草 ' + pct(fc[F.GRASS] || 0) + ' 泥 ' + pct(fc[F.DIRT] || 0) + ' 沙 ' + pct(fc[F.SAND] || 0) +
  ' 岩地 ' + pct(fc[F.STONE] || 0) + ' 水 ' + pct(fc[F.WATER] || 0) +
  ' 冰/雪 ' + pct((fc[F.ICE] || 0) + (fc[F.SNOW] || 0)) +
  ' 丛林 ' + pct(fc[F.JUNGLE] || 0) + ' 灰/岩浆 ' + pct((fc[F.ASH] || 0) + (fc[F.LAVA] || 0)));
console.log('物件 → 树 ' + pct(oc[O.LOG] || 0) + ' 巨木 ' + pct(oc[O.JTREE] || 0) + ' 岩 ' + pct(oc[O.ROCK] || 0) +
  ' 煤 ' + pct(oc[O.COAL] || 0) + ' 铁 ' + pct(oc[O.IRON] || 0) + ' 金 ' + pct(oc[O.GOLD] || 0) +
  ' 冰墙 ' + pct(oc[O.ICEWALL] || 0) + ' 火山岩 ' + pct(oc[O.LAVAROCK] || 0));
console.log('稀有 → 符文石 ' + rune + ' 宝箱 ' + chest + ' 上升气流 ' + updraft + ' | 可走比例 ' + pct(walkable));
console.log('天空岛 → 草 ' + grass + ' 水 ' + water + ' 树 ' + tree + ' 岩 ' + rock + ' 煤 ' + coal);

if (bad.length) { console.log('❌ ' + bad.join('\n❌ ')); process.exit(1); }
console.log('✅ 世界生成检查通过');
