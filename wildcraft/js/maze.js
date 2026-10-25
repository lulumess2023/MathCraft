/* 机关迷宫：挖到符文石会掉进来，两个人配合才能出去 */
var MT = { FLOOR: 0, WALL: 1, SPIKE: 2, PLATE: 3, DOOR: 4, PAD: 5, PORTAL: 6 };

var Maze = {
  active: false,
  w: 0, h: 0, tiles: null,
  dist: null,
  spikes: [], rollers: [], plates: [], doors: [], pads: [],
  entry: { x: 1, y: 1 }, portal: { x: 0, y: 0 },
  time: 0, holdTimer: 0, finished: false,
  returnInfo: null,

  idx: function (x, y) { return y * this.w + x; },
  at: function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return MT.WALL;
    return this.tiles[y * this.w + x];
  },
  set: function (x, y, v) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.tiles[y * this.w + x] = v; },

  solid: function (x, y) {
    var t = this.at(x, y);
    if (t === MT.WALL) return true;
    if (t === MT.DOOR) {
      var d = this.doorAt(x, y);
      return d ? !d.open : false;
    }
    return false;
  },
  doorAt: function (x, y) {
    for (var i = 0; i < this.doors.length; i++) if (this.doors[i].x === x && this.doors[i].y === y) return this.doors[i];
    return null;
  },

  /* ---------- 生成 ---------- */
  start: function (seed, returnInfo) {
    var cw = 11 + (seed % 3) * 2, ch = 9 + (seed % 2) * 2;   // 单元格数
    this.w = cw * 2 + 1; this.h = ch * 2 + 1;
    this.tiles = new Uint8Array(this.w * this.h);
    this.tiles.fill(MT.WALL);
    var rnd = mulberry32(seed * 7919 + 13);
    var self = this;

    // 递归回溯挖迷宫
    var vis = new Uint8Array(cw * ch);
    var stack = [[0, 0]];
    vis[0] = 1;
    this.set(1, 1, MT.FLOOR);
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var cx = cur[0], cy = cur[1];
      var opts = [];
      if (cx > 0 && !vis[(cx - 1) + cy * cw]) opts.push([-1, 0]);
      if (cx < cw - 1 && !vis[(cx + 1) + cy * cw]) opts.push([1, 0]);
      if (cy > 0 && !vis[cx + (cy - 1) * cw]) opts.push([0, -1]);
      if (cy < ch - 1 && !vis[cx + (cy + 1) * cw]) opts.push([0, 1]);
      if (!opts.length) { stack.pop(); continue; }
      var o = opts[Math.floor(rnd() * opts.length)];
      var nx = cx + o[0], ny = cy + o[1];
      vis[nx + ny * cw] = 1;
      this.set(nx * 2 + 1, ny * 2 + 1, MT.FLOOR);
      this.set(cx * 2 + 1 + o[0], cy * 2 + 1 + o[1], MT.FLOOR);
      stack.push([nx, ny]);
    }
    // 打通一些环路，避免死路太多
    var loops = Math.floor(cw * ch * 0.14);
    for (var l = 0; l < loops; l++) {
      var lx = 1 + Math.floor(rnd() * (cw - 1)) * 2;
      var ly = 1 + Math.floor(rnd() * (ch - 1)) * 2;
      var horiz = rnd() < 0.5;
      var wx = horiz ? lx + (rnd() < 0.5 ? 1 : -1) : lx;
      var wy = horiz ? ly : ly + (rnd() < 0.5 ? 1 : -1);
      if (wx > 0 && wy > 0 && wx < this.w - 1 && wy < this.h - 1) this.set(wx, wy, MT.FLOOR);
    }

    // 出口房间（右下角 3x3）
    var rx = this.w - 4, ry = this.h - 4;
    for (var oy = 0; oy < 3; oy++) for (var ox = 0; ox < 3; ox++) this.set(rx + ox, ry + oy, MT.FLOOR);
    this.portal = { x: rx + 1, y: ry + 1 };
    // 出口：单人模式 1 块板，双人模式 2 块板
    var npads = solo ? 1 : 2;
    this.pads = [];
    for (var pi2 = 0; pi2 < npads; pi2++) {
      this.pads.push({ x: rx + (pi2 === 0 ? 0 : 2), y: ry + (pi2 === 0 ? 2 : 0), on: false });
    }
    for (var pi3 = 0; pi3 < this.pads.length; pi3++) this.set(this.pads[pi3].x, this.pads[pi3].y, MT.PAD);

    // BFS 距离场（用于安全放置门/板）
    this.dist = this.bfs(1, 1);
    var maxd = 0;
    for (var i = 0; i < this.dist.length; i++) if (this.dist[i] < 1e9 && this.dist[i] > maxd) maxd = this.dist[i];

    // 机关：单人模式全是单板门；双人模式第 2、3 组需要两人同时踩
    this.plates = []; this.doors = [];
    var solo = (typeof Game !== 'undefined' && Game.solo);
    var groups = solo ? [{ n: 1 }, { n: 1 }, { n: 1 }] : [{ n: 1 }, { n: 2 }, { n: 2 }];
    for (var gi = 0; gi < groups.length; gi++) {
      var doorTile = this.pickDoor(rnd, maxd);
      if (!doorTile) continue;
      var dd = this.dist[this.idx(doorTile.x, doorTile.y)];
      if (dd < 10) continue;
      this.set(doorTile.x, doorTile.y, MT.DOOR);
      var door = { x: doorTile.x, y: doorTile.y, group: gi, open: false };
      this.doors.push(door);
      var placed = this.pickPlates(rnd, dd, groups[gi].n, gi);
      if (!placed.length) {         // 板子没放够 → 撤掉这扇门，避免出现打不开的死门
        this.set(doorTile.x, doorTile.y, MT.FLOOR);
        this.doors.pop();
        continue;
      }
      for (var pi = 0; pi < placed.length; pi++) this.set(placed[pi].x, placed[pi].y, MT.PLATE);
    }

    // 尖刺
    this.spikes = [];
    var spikeCount = Math.floor(this.w * this.h / 55);
    for (var s = 0; s < spikeCount; s++) {
      var sx = 1 + Math.floor(rnd() * (this.w - 2));
      var sy = 1 + Math.floor(rnd() * (this.h - 2));
      if (this.at(sx, sy) !== MT.FLOOR) continue;
      if (sx < 3 && sy < 3) continue;
      if (this.nearOther(sx, sy, 1)) continue;      // 别扎在出口踏板和门口上
      this.set(sx, sy, MT.SPIKE);
      this.spikes.push({ x: sx, y: sy, period: 2.2 + rnd() * 1.4, phase: rnd() * 3 });
    }

    // 滚石：找一段直走廊
    this.rollers = [];
    for (var r = 0; r < 3; r++) {
      var found = this.pickRun(rnd);
      if (found) this.rollers.push(found);
    }

    // 迷宫里的火把（照明用）
    this.lights = [];
    for (var ly = 1; ly < this.h - 1; ly++) {
      for (var lx = 1; lx < this.w - 1; lx++) {
        if (this.at(lx, ly) !== MT.FLOOR) continue;
        if (hash2(lx, ly, seed + 5) < 0.06) this.lights.push({ x: lx, y: ly });
      }
    }

    this.entry = { x: 1, y: 1 };
    this.time = 0; this.holdTimer = 0; this.finished = false;
    this.active = true;
    this.returnInfo = returnInfo;
    return this;
  },

  bfs: function (sx, sy) {
    var d = new Float32Array(this.w * this.h);
    d.fill(1e9);
    var q = [[sx, sy]];
    d[this.idx(sx, sy)] = 0;
    while (q.length) {
      var c = q.shift();
      var cx = c[0], cy = c[1], cd = d[this.idx(cx, cy)];
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nx = cx + dirs[i][0], ny = cy + dirs[i][1];
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        if (this.at(nx, ny) === MT.WALL) continue;
        if (d[this.idx(nx, ny)] > cd + 1) { d[this.idx(nx, ny)] = cd + 1; q.push([nx, ny]); }
      }
    }
    return d;
  },

  pickDoor: function (rnd, maxd) {
    for (var tries = 0; tries < 260; tries++) {
      var x = 1 + Math.floor(rnd() * (this.w - 2));
      var y = 1 + Math.floor(rnd() * (this.h - 2));
      if (this.at(x, y) !== MT.FLOOR) continue;
      var d = this.dist[this.idx(x, y)];
      if (d < maxd * 0.18 || d > maxd * 0.85) continue;
      var openH = this.at(x - 1, y) !== MT.WALL && this.at(x + 1, y) !== MT.WALL && this.at(x, y - 1) === MT.WALL && this.at(x, y + 1) === MT.WALL;
      var openV = this.at(x, y - 1) !== MT.WALL && this.at(x, y + 1) !== MT.WALL && this.at(x - 1, y) === MT.WALL && this.at(x + 1, y) === MT.WALL;
      if (!openH && !openV) continue;
      if (this.nearOther(x, y, 3)) continue;
      return { x: x, y: y };
    }
    return null;
  },

  nearOther: function (x, y, r) {
    for (var i = 0; i < this.doors.length; i++) {
      if (Math.abs(this.doors[i].x - x) <= r && Math.abs(this.doors[i].y - y) <= r) return true;
    }
    for (var j = 0; j < this.pads.length; j++) {
      if (Math.abs(this.pads[j].x - x) <= r + 2 && Math.abs(this.pads[j].y - y) <= r + 2) return true;
    }
    return false;
  },

  pickPlates: function (rnd, maxBefore, n, group) {
    var out = [];
    var tries = 0;
    while (out.length < n && tries++ < 900) {
      var x = 1 + Math.floor(rnd() * (this.w - 2));
      var y = 1 + Math.floor(rnd() * (this.h - 2));
      if (this.at(x, y) !== MT.FLOOR) continue;
      var d = this.dist[this.idx(x, y)];
      if (d < 8) continue;                            // 别挡在入口脸上
      if (d > maxBefore - 3) continue;                // 必须在门之前，保证可达
      var ok = true;
      for (var i = 0; i < out.length; i++) {
        if (Math.abs(out[i].x - x) + Math.abs(out[i].y - y) < 6) ok = false;   // 两块板拉远 → 必须分头行动
      }
      if (!ok) continue;
      out.push({ x: x, y: y, group: group, on: false });
    }
    if (out.length < n) return [];
    for (var k = 0; k < out.length; k++) this.plates.push(out[k]);
    return out;
  },

  pickRun: function (rnd) {
    for (var tries = 0; tries < 200; tries++) {
      var x = 1 + Math.floor(rnd() * (this.w - 2));
      var y = 1 + Math.floor(rnd() * (this.h - 2));
      if (this.at(x, y) !== MT.FLOOR) continue;
      var horiz = rnd() < 0.5;
      var a = 0, b = 0;
      if (horiz) {
        while (this.at(x + a - 1, y) !== MT.WALL) a--;
        while (this.at(x + b + 1, y) !== MT.WALL) b++;
        if (b - a < 5) continue;
        if (this.runNearPad(true, x + a, x + b, y, y)) continue;
        return { horiz: true, x: x + a, y: y, min: x + a, max: x + b, px: (x + a) * TILE + TILE / 2, dir: 1, speed: 90 };
      } else {
        while (this.at(x, y + a - 1) !== MT.WALL) a--;
        while (this.at(x, y + b + 1) !== MT.WALL) b++;
        if (b - a < 5) continue;
        if (this.runNearPad(false, x, x, y + a, y + b)) continue;
        return { horiz: false, x: x, y: y + a, min: y + a, max: y + b, py: (y + a) * TILE + TILE / 2, dir: 1, speed: 90 };
      }
    }
    return null;
  },

  /* 这条走廊会不会经过出口踏板附近 —— 否则滚石会把站在踏板上的玩家一直撞下来，永远通不了关 */
  runNearPad: function (horiz, x0, x1, y0, y1) {
    for (var i = 0; i < this.pads.length; i++) {
      var pd = this.pads[i];
      if (horiz) { if (pd.y === y0 && pd.x >= x0 - 2 && pd.x <= x1 + 2) return true; }
      else { if (pd.x === x0 && pd.y >= y0 - 2 && pd.y <= y1 + 2) return true; }
    }
    return false;
  },

  end: function () { this.active = false; },

  /* ---------- 每帧更新 ---------- */
  update: function (dt, players) {
    this.time += dt;
    var i, j;

    // 压力板
    for (i = 0; i < this.plates.length; i++) {
      var p = this.plates[i];
      p.on = false;
      for (j = 0; j < players.length; j++) {
        var pl = players[j];
        if (!pl.alive) continue;
        if (Math.abs(pl.x - (p.x * TILE + TILE / 2)) < 16 && Math.abs(pl.y - (p.y * TILE + TILE / 2)) < 16) { p.on = true; break; }
      }
    }
    // 门：同组所有板都被踩住才开
    for (i = 0; i < this.doors.length; i++) {
      var d = this.doors[i];
      var all = true, found = false;
      for (j = 0; j < this.plates.length; j++) {
        if (this.plates[j].group === d.group) { found = true; if (!this.plates[j].on) all = false; }
      }
      d.open = found && all;
    }
    // 滚石
    for (i = 0; i < this.rollers.length; i++) {
      var r = this.rollers[i];
      if (r.horiz) {
        r.px += r.speed * r.dir * dt;
        if (r.px < r.min * TILE + TILE / 2) { r.px = r.min * TILE + TILE / 2; r.dir = 1; }
        if (r.px > r.max * TILE + TILE / 2) { r.px = r.max * TILE + TILE / 2; r.dir = -1; }
      } else {
        r.py += r.speed * r.dir * dt;
        if (r.py < r.min * TILE + TILE / 2) { r.py = r.min * TILE + TILE / 2; r.dir = 1; }
        if (r.py > r.max * TILE + TILE / 2) { r.py = r.max * TILE + TILE / 2; r.dir = -1; }
      }
    }
    // 伤害判定
    for (j = 0; j < players.length; j++) {
      var pp = players[j];
      if (!pp.alive) continue;
      var tx = Math.floor(pp.x / TILE), ty = Math.floor(pp.y / TILE);
      if (this.at(tx, ty) === MT.SPIKE) {
        var sp = this.spikeAt(tx, ty);
        if (sp && this.spikeOn(sp)) pp.hurt(5, sp.x * TILE + 16, sp.y * TILE + 16);
      }
      for (i = 0; i < this.rollers.length; i++) {
        var rr = this.rollers[i];
        var rx = rr.horiz ? rr.px : rr.x * TILE + TILE / 2;
        var ry = rr.horiz ? rr.y * TILE + TILE / 2 : rr.py;
        if (dist(pp.x, pp.y, rx, ry) < 20) pp.hurt(8, rx, ry);
      }
    }
    // 出口：两块板同时有人
    var both = true;
    for (i = 0; i < this.pads.length; i++) {
      this.pads[i].on = false;
      for (j = 0; j < players.length; j++) {
        var q = players[j];
        if (!q.alive) continue;
        if (Math.abs(q.x - (this.pads[i].x * TILE + TILE / 2)) < 18 &&
            Math.abs(q.y - (this.pads[i].y * TILE + TILE / 2)) < 18) { this.pads[i].on = true; break; }
      }
      if (!this.pads[i].on) both = false;
    }
    if (both) {
      this.holdTimer += dt;
      if (this.holdTimer > 0.7) this.finished = true;
    } else this.holdTimer = 0;
  },

  spikeAt: function (x, y) {
    for (var i = 0; i < this.spikes.length; i++) if (this.spikes[i].x === x && this.spikes[i].y === y) return this.spikes[i];
    return null;
  },
  spikeOn: function (sp) {
    var t = (this.time + sp.phase) % sp.period;
    return t < 0.85;      // 前 0.85 秒是“伸出”状态
  },

  /* ---------- 绘制 ---------- */
  draw: function (ctx, cam) {
    var x0 = Math.max(0, Math.floor(cam.left / TILE)), x1 = Math.min(this.w - 1, Math.ceil(cam.right / TILE));
    var y0 = Math.max(0, Math.floor(cam.top / TILE)), y1 = Math.min(this.h - 1, Math.ceil(cam.bottom / TILE));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var t = this.at(x, y);
        var px = x * TILE, py = y * TILE;
        if (t === MT.WALL) {
          ctx.fillStyle = '#3B3B4A'; ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#4A4A5C'; ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px, py + TILE - 6, TILE, 6);
        } else {
          ctx.fillStyle = '#22222E'; ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = 'rgba(255,255,255,.035)';
          ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
        }
      }
    }
    // 尖刺
    for (var s = 0; s < this.spikes.length; s++) {
      var sp = this.spikes[s];
      var on = this.spikeOn(sp);
      var px2 = sp.x * TILE, py2 = sp.y * TILE;
      ctx.fillStyle = '#1A1A22'; ctx.fillRect(px2 + 2, py2 + 2, TILE - 4, TILE - 4);
      var h = on ? 12 : 3;
      ctx.fillStyle = on ? '#C7CBD6' : '#6B7280';
      for (var k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(px2 + 3 + k * 8, py2 + TILE - 3);
        ctx.lineTo(px2 + 7 + k * 8, py2 + TILE - 3 - h);
        ctx.lineTo(px2 + 11 + k * 8, py2 + TILE - 3);
        ctx.closePath(); ctx.fill();
      }
    }
    // 压力板
    for (var p = 0; p < this.plates.length; p++) {
      var pl = this.plates[p];
      ctx.fillStyle = pl.on ? '#65A30D' : '#8A6B3A';
      ctx.fillRect(pl.x * TILE + 5, pl.y * TILE + 5, TILE - 10, TILE - 10);
      ctx.strokeStyle = pl.on ? '#BEF264' : '#C89B6A'; ctx.lineWidth = 2;
      ctx.strokeRect(pl.x * TILE + 5, pl.y * TILE + 5, TILE - 10, TILE - 10);
    }
    // 门
    for (var d = 0; d < this.doors.length; d++) {
      var dr = this.doors[d];
      if (dr.open) {
        ctx.fillStyle = 'rgba(190,242,100,.25)';
        ctx.fillRect(dr.x * TILE, dr.y * TILE, TILE, TILE);
      } else {
        ctx.fillStyle = '#8B5E3C'; ctx.fillRect(dr.x * TILE + 1, dr.y * TILE + 1, TILE - 2, TILE - 2);
        ctx.fillStyle = '#6B451F';
        for (var b = 0; b < 4; b++) ctx.fillRect(dr.x * TILE + 3, dr.y * TILE + 3 + b * 8, TILE - 6, 3);
      }
    }
    // 出口踏板 + 传送门
    for (var q = 0; q < this.pads.length; q++) {
      var pd = this.pads[q];
      ctx.fillStyle = pd.on ? '#FBBF24' : '#5C4A22';
      ctx.fillRect(pd.x * TILE + 4, pd.y * TILE + 4, TILE - 8, TILE - 8);
    }
    var pr = this.portal;
    var pulse = 0.6 + 0.4 * Math.sin(this.time * 3);
    ctx.fillStyle = 'rgba(169,123,232,' + (0.35 + pulse * 0.4) + ')';
    ctx.fillRect(pr.x * TILE + 2, pr.y * TILE + 2, TILE - 4, TILE - 4);
    // 滚石
    for (var r2 = 0; r2 < this.rollers.length; r2++) {
      var rr = this.rollers[r2];
      var rx = rr.horiz ? rr.px : rr.x * TILE + TILE / 2;
      var ry = rr.horiz ? rr.y * TILE + TILE / 2 : rr.py;
      ctx.fillStyle = '#6B6B78';
      ctx.beginPath(); ctx.arc(rx, ry, 13, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#8A8A99';
      ctx.beginPath(); ctx.arc(rx - 4, ry - 4, 5, 0, 6.283); ctx.fill();
    }
  }
};
