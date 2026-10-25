const fs = require('fs');
const vm = require('vm');
const path = require('path');
const dir = path.join(__dirname, 'js');

const sandbox = { console, Math, Uint8Array, Float32Array, Array, Object, JSON, Number, String };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, 'util.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, 'maze.js'), 'utf8'), sandbox);
const Maze = sandbox.Maze;
const MT = sandbox.MT;

let fails = [];
let stats = { doors: 0, coopDoors: 0, spikes: 0, rollers: 0, lights: 0, sizes: [] };

for (let s = 1; s <= 300; s++) {
  Maze.start(s, null);
  const res = { seed: s, w: Maze.w, h: Maze.h };
  stats.sizes.push(Maze.w + 'x' + Maze.h);

  // 1. 入口必须是地板
  if (Maze.at(1, 1) !== MT.FLOOR) fails.push({ seed: s, why: '入口不是地板' });

  // 2. 每扇门都要有同组压力板，且板子在门的“前面”（BFS 距离更小）
  for (const d of Maze.doors) {
    const plates = Maze.plates.filter(p => p.group === d.group);
    if (plates.length === 0) { fails.push({ seed: s, why: '门没有压力板 group=' + d.group }); continue; }
    const dd = Maze.dist[Maze.idx(d.x, d.y)];
    for (const p of plates) {
      if (Maze.dist[Maze.idx(p.x, p.y)] > dd - 3) fails.push({ seed: s, why: '压力板在门后面，无解' });
    }
    if (plates.length >= 2) stats.coopDoors++;
  }
  stats.doors += Maze.doors.length;

  // 3. 可达性：把门当作可通行，从入口 BFS，出口踏板/传送门必须可达
  const seen = new Uint8Array(Maze.w * Maze.h);
  const q = [[1, 1]];
  seen[Maze.idx(1, 1)] = 1;
  while (q.length) {
    const [cx, cy] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= Maze.w || ny >= Maze.h) continue;
      if (seen[Maze.idx(nx, ny)]) continue;
      if (Maze.at(nx, ny) === MT.WALL) continue;
      seen[Maze.idx(nx, ny)] = 1;
      q.push([nx, ny]);
    }
  }
  for (const p of Maze.pads) {
    if (!seen[Maze.idx(p.x, p.y)]) fails.push({ seed: s, why: '出口踏板不可达' });
  }
  if (!seen[Maze.idx(Maze.portal.x, Maze.portal.y)]) fails.push({ seed: s, why: '传送门不可达' });
  for (const p of Maze.plates) {
    if (!seen[Maze.idx(p.x, p.y)]) fails.push({ seed: s, why: '压力板不可达' });
  }
  // 4. 两块出口踏板必须分得开（需要两个人分别站）
  const dpad = Math.abs(Maze.pads[0].x - Maze.pads[1].x) + Math.abs(Maze.pads[0].y - Maze.pads[1].y);
  if (dpad < 2) fails.push({ seed: s, why: '两块出口踏板重叠' });

  // 5. 滚石区间合法
  for (const r of Maze.rollers) {
    if (r.max <= r.min) fails.push({ seed: s, why: '滚石区间非法' });
  }
  stats.spikes += Maze.spikes.length;
  stats.rollers += Maze.rollers.length;
  stats.lights += Maze.lights.length;
}

console.log('测试种子数: 300');
console.log('平均门数/局:', (stats.doors / 300).toFixed(2), ' 其中需要两人合作的门:', stats.coopDoors);
console.log('平均尖刺/局:', (stats.spikes / 300).toFixed(1), ' 滚石:', (stats.rollers / 300).toFixed(1), ' 灯光:', (stats.lights / 300).toFixed(1));
console.log('尺寸样例:', stats.sizes.slice(0, 3).join(', '));
if (fails.length) {
  console.log('❌ 失败 ' + fails.length + ' 项，前 10 条:');
  console.log(JSON.stringify(fails.slice(0, 10), null, 1));
  process.exit(1);
} else {
  console.log('✅ 全部通过：迷宫均可解，无死门');
}
