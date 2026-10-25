/* 无头验证：把 index.html 的世界生成 + 物理逻辑抽出来跑断言 */
const fs = require('fs');
const src = fs.readFileSync('D:/WS/Games/voxelcraft/index.html', 'utf8');
const body = src.split('<script>')[1].split('</script>')[0];

/* 剥掉 DOM 相关段，只保留世界/物理核心 */
let code = body;
code = code.replace(/const \$ =[\s\S]*?function toast[\s\S]*?\n}/, 'function $(i){return null}\nfunction toast(){}');
code = code.split('/* ---------------- 11. HUD ---------------- */')[0];
code = code.split('/* ---------------- 10. 渲染 ---------------- */')[0];

/* 伪 DOM：canvas 全部退化成空对象 */
const noop = new Proxy({}, {get:()=>noop, set:()=>true, apply:()=>noop});
global.document = { getElementById:()=>noop, createElement:()=>noop, addEventListener:()=>{}, exitPointerLock:()=>{} };
global.window = { devicePixelRatio:1, innerWidth:1280, innerHeight:720, addEventListener:()=>{} };
global.localStorage = { getItem:()=>null, setItem:()=>{}, removeItem:()=>{} };
global.performance = { now:()=>0 };
global.requestAnimationFrame = ()=>{};
global.setInterval = ()=>{};
global.setTimeout = ()=>{};
global.clearTimeout = ()=>{};
global.innerWidth = 1280; global.innerHeight = 720;

const mod = new Function('stickX','stickY', code + `
  return { getV, setV, topH, genWorld, P, collide, updatePlayer, inWater, solidAt,
           SY,SX,SZ,SEA,BLOCKS, AIR,WATER,GRASS,DIRT,STONE,SAND,WOOD,LEAF,
           buildAllChunks, chunks, NCX,NCZ,CH, raycast, get target(){return target},
           spawnPoint, fbm2, hsh };
`);
const G = mod(0, 0);

let fails = 0, total = 0;
function ok(c, msg, extra) {
  total++;
  if (!c) { fails++; console.log('  FAIL: ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

/* ---- 1. 世界生成完整性 ---- */
console.log('\n[1] 世界生成');
G.genWorld(20261007);

let nAir=0, nSolid=0, nWater=0, nGrass=0, nWood=0, nLeaf=0;
for (let y=0;y<G.SY;y++) for (let z=0;z<G.SZ;z++) for (let x=0;x<G.SX;x++) {
  const v = G.getV(x,y,z);
  if (v===G.AIR) nAir++; else nSolid++;
  if (v===G.WATER) nWater++;
  if (v===G.GRASS) nGrass++;
  if (v===G.WOOD) nWood++;
  if (v===G.LEAF) nLeaf++;
}
console.log(`  空气${nAir} 实心${nSolid} 水${nWater} 草${nGrass} 木${nWood} 叶${nLeaf}`);
ok(nSolid > 20000, '实心方块太少', nSolid);
ok(nGrass > 100, '草方块太少（地形没生成）', nGrass);
ok(nWood > 20, '树太少', nWood);
ok(nLeaf > 100, '树叶太少', nLeaf);

/* ---- 2. 洞穴是否真的挖穿了 ---- */
console.log('[2] 洞穴');
let cavePockets = 0;
for (let z=2;z<G.SZ-2;z++) for (let x=2;x<G.SX-2;x++){
  const h = G.topH(x,z);
  if (h < 14) continue;
  for (let y=6;y<h-5;y++) if (G.getV(x,y,z)===G.AIR) { cavePockets++; break; }
}
console.log(`  地表下有洞穴的柱子: ${cavePockets}`);
ok(cavePockets > 20, '几乎没有洞穴', cavePockets);

/* ---- 3. 出生点合法性 ---- */
console.log('[3] 出生点');
G.spawnPoint();
const P = G.P;
console.log(`  出生: (${P.x.toFixed(2)}, ${P.y.toFixed(2)}, ${P.z.toFixed(2)})`);
ok(P.y > 1 && P.y < G.SY, '出生高度非法', P.y);
ok(!G.solidAt(P.x, P.y, P.z), '出生点在实心方块里');
ok(!G.solidAt(P.x, P.y + 1.7, P.z), '出生点头部卡在方块里');
let groundOK = false;
for (let dy=0; dy<=2; dy++) if (G.solidAt(P.x, P.y - 0.5 - dy, P.z)) groundOK = true;
ok(groundOK, '脚下没有地面（会一直掉）');
/* 出生点视野：朝向前方 30 格内应该能看到水面，不能是死墙 */
let seesWater = false, blocked = 0;
for (let d=2; d<=30; d++){
  const hx = Math.floor(P.x + Math.sin(P.yaw)*d);
  const hz = Math.floor(P.z - Math.cos(P.yaw)*d);
  /* 沿垂直方向找水面：出生点高于海平面时，视线是斜向下的 */
  for (let y=G.SY-1; y>=0; y--){
    const v = G.getV(hx,y,hz);
    if (v === G.WATER || v === 14) { seesWater = true; break; }
    if (G.solidAt(hx + 0.5, y + 0.5, hz + 0.5) && y >= Math.floor(P.y)) { blocked++; break; }
  }
}
console.log(`  朝向前方: 看到水=${seesWater}, 视线被挡格数=${blocked}`);
ok(seesWater, '出生点看不到海', {seesWater, blocked});
ok(blocked <= 12, '出生点前方被山墙挡死', blocked);
ok(!G.inWater(), '出生在水里');

/* ---- 4. 物理：重力落地 ---- */
console.log('[4] 物理');
G.spawnPoint();
const y0 = P.y;
P.vy = 0;
for (let i=0;i<200;i++) G.updatePlayer(1/60);
console.log(`  自由落体 200 帧后 y: ${y0.toFixed(2)} → ${P.y.toFixed(2)}, onGround=${P.onGround}`);
ok(P.onGround === true, '落地后 onGround 仍为 false（会穿地）');
ok(P.y < y0, '重力没起作用，y 没下降');

/* ---- 5. 跳跃高度应约 1 格 ---- */
console.log('[5] 跳跃');
G.spawnPoint();
for (let i=0;i<30;i++) G.updatePlayer(1/60);   // 站稳
const yb = P.y; let peak = P.y;

P.vy = 8.1;                                   // 手动给一个跳跃初速
for (let i=0;i<80;i++){ G.updatePlayer(1/60); if (P.y>peak) peak=P.y; }
console.log(`  跳跃高度: ${(peak-yb).toFixed(2)} 格`);
ok(peak - yb > 0.9, '跳不高（连 1 格都上不去）', peak-yb);
ok(peak - yb < 2.2, '跳太高', peak-yb);

/* ---- 6. 撞墙不能穿墙 ---- */
console.log('[6] 碰撞');
G.spawnPoint();
/* 找一堵墙：玩家前方 1 格放一列实心 */
const wx = Math.floor(P.x)+1, wz = Math.floor(P.z), wy = Math.floor(P.y);
for (let dy=0; dy<3; dy++) G.setV(wx, wy+dy, wz, G.STONE);
G.buildAllChunks();
const beforeX = P.x;
for (let i=0;i<180;i++){ P.vx = 6; G.updatePlayer(1/60); }
console.log(`  撞墙前x=${beforeX.toFixed(2)} 撞墙后x=${P.x.toFixed(2)} 墙x=${wx}`);
ok(P.x < wx, '穿墙了！x 越过了墙面', {p:P.x, wall:wx});
ok(P.x > wx - 1.2, '被墙弹回太远（卡住）', P.x);

/* ---- 7. 挖/放方块 ---- */
console.log('[7] 编辑');
G.genWorld(20261007);
G.spawnPoint();
const px = Math.floor(P.x)+2, pz = Math.floor(P.z), py = Math.floor(P.y);
G.setV(px, py, pz, G.STONE);
ok(G.getV(px,py,pz)===G.STONE, '放置失败');
G.setV(px, py, pz, G.AIR);
ok(G.getV(px,py,pz)===G.AIR, '破坏失败');

/* ---- 8. 区块网格 ---- */
console.log('[8] 区块网格');
let totalFaces = 0, emptyChunks = 0;
for (const ch of G.chunks){
  const a = ch.op ? ch.op.length/27 : 0;
  const b = ch.tr ? ch.tr.length/27 : 0;
  totalFaces += a + b;
  if (a+b === 0) emptyChunks++;
}
console.log(`  总面数 ${totalFaces}, 空区块 ${emptyChunks}/${G.chunks.length}`);
ok(totalFaces > 2000, '面数太少，网格生成有问题', totalFaces);
ok(emptyChunks === 0, '存在完全空的区块', emptyChunks);

/* ---- 9. 边界安全 ---- */
console.log('[9] 边界');
ok(G.getV(-5, -5, -5) === G.AIR, '负坐标越界未返回空气');
ok(G.getV(999, 999, 999) === G.AIR, '超大坐标越界未返回空气');
G.P.x = -100; G.P.z = -100;
for (let i=0;i<60;i++) G.updatePlayer(1/60);
ok(G.P.x >= 0, '玩家跑出世界负边界未拦住', G.P.x);

/* ---- 10. 射线拾取 ---- */
console.log('[10] 射线');
G.genWorld(20261007);
G.spawnPoint();
/* 按当前朝向，在正前方 3 格放一块石头，射线必须命中它 */
P.pitch = 0;
const dx = Math.sin(P.yaw), dz = -Math.cos(P.yaw);
const tx = Math.floor(P.x + dx*3), tz = Math.floor(P.z + dz*3), ty = Math.floor(P.y + 1.62);
G.setV(tx, ty, tz, G.STONE);
G.buildAllChunks();
const hit = G.raycast();
console.log(`  朝向 ${(P.yaw*180/Math.PI).toFixed(0)}° 前方石头 @(${tx},${ty},${tz}) → 命中:`, hit ? `(${hit.x},${hit.y},${hit.z})` : 'null');
ok(!!hit, '射线没命中正前方的方块');
if (hit) ok(hit.x===tx && hit.y===ty && hit.z===tz, '射线命中的方块位置不对', {hit, want:{x:tx,y:ty,z:tz}});
/* 命中的那一面法线应指向玩家 */
if (hit){
  const dot = (tx+0.5-hit.x)*hit.nx + (ty+0.5-hit.y)*hit.ny + (tz+0.5-hit.z)*hit.nz;
  ok(dot < 0, '命中面的法线方向反了（该指向玩家所在侧）', dot);
}

/* ---- 汇总 ---- */
console.log(`\n========== ${total-fails}/${total} 项通过 ==========`);
process.exit(fails ? 1 : 0);