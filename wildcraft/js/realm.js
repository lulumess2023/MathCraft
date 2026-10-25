/* 传送门后面的异空间：益智神殿（推箱子） / 试炼竞技场（守关打怪）
   做法：自己维护一张小网格，然后接管 Game.solidAt / objAt / floorAt / setObj，
   这样玩家的移动、怪物的寻路、渲染、光照全都能直接复用主世界那一套。 */
var Realm = {
  active: false,
  kind: '',            // 'puzzle' | 'arena'
  w: 0, h: 0,
  grid: null,          // 物件层（O.* 的 id）
  fl: null,            // 地面层（F.* 的 id）
  lights: [],
  t: 0,
  entry: { x: 1, y: 1 },
  exit: { x: 1, y: 1 },
  ret: null,           // { layer, pos:[{x,y}] } 回去时用
  seed: 1,

  /* 益智神殿 */
  pads: [],            // 目标点 [{x,y}]
  boxes: [],           // 箱子当前位置 [{x,y}]
  boxes0: [],          // 箱子初始位置（按重置键时用）
  revMoves: [],        // 反向生成时记下的步子（倒过来重放就是解法，测试用它验证一定有解）
  solved: false,
  moves: 0,

  /* 竞技场 */
  wave: 0, waveT: 0, waveTotal: 3, cleared: false, mobsLeft: 0,

  inb: function (tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; },
  get: function (tx, ty) { return this.inb(tx, ty) ? this.grid[ty * this.w + tx] : O.BEDROCK; },
  set: function (tx, ty, v) { if (this.inb(tx, ty)) this.grid[ty * this.w + tx] = v; },
  floorv: function (tx, ty) { return this.inb(tx, ty) ? this.fl[ty * this.w + tx] : F.STONE; },

  /* ---------- 对外接口（Game 通过这几个函数访问世界） ---------- */
  solid: function (tx, ty) {
    var o = this.get(tx, ty);
    return !!(ODEF[o] && ODEF[o].solid);
  },
  objAt: function (tx, ty) { return this.inb(tx, ty) ? this.get(tx, ty) : O.BEDROCK; },
  floorAt: function (tx, ty) { return this.floorv(tx, ty); },
  setObjAt: function (tx, ty, v) { this.set(tx, ty, v); this.rebuildLights(); },

  rebuildLights: function () {
    this.lights.length = 0;
    for (var y = 0; y < this.h; y++) {
      for (var x = 0; x < this.w; x++) {
        var o = this.get(x, y);
        if (ODEF[o] && ODEF[o].light) this.lights.push([x, y, ODEF[o].light]);
      }
    }
  },

  /* ---------- 进入 / 离开 ---------- */
  start: function (kind, ret) {
    this.kind = kind;
    this.ret = ret;
    this.seed = Math.floor(Math.random() * 100000) + 1;
    this.t = 0; this.solved = false; this.cleared = false; this.moves = 0;
    this.wave = 0; this.waveT = 2.0;
    if (kind === 'puzzle') this.buildPuzzle();
    else this.buildArena();
    this.rebuildLights();
    this.active = true;
    /* 把两个玩家挪进来 */
    var ps = Game.players;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      p.x = this.entry.x * TILE + TILE / 2 + (i === 0 ? -10 : 10);
      p.y = this.entry.y * TILE + TILE / 2;
      p.safeX = p.x; p.safeY = p.y;
      p.vx = p.vy = 0; p.burn = 0;
      if (p.riding) { p.riding.driver = null; p.riding = null; }
      if (p.fused) Game.unfuse(p);
      p.following = null;
    }
    Game.bullets.length = 0;
  },

  leave: function (silent) {
    if (!this.active) return;
    this.active = false;
    var ret = this.ret;
    /* 竞技场里剩下的怪不带回主世界 */
    for (var i = Game.mobs.length - 1; i >= 0; i--) {
      if (Game.mobs[i].realm) Game.mobs.splice(i, 1);
    }
    Game.bullets.length = 0;
    if (ret) {
      Game.layer = ret.layer;
      for (var j = 0; j < Game.players.length; j++) {
        var p = Game.players[j];
        var o = ret.pos[j] || { x: p.x, y: p.y };
        p.x = o.x; p.y = o.y; p.safeX = o.x; p.safeY = o.y;
        p.vx = p.vy = 0; unstick(p);
      }
      Game.bringAllies();
    }
    if (!silent) Game.say('🌀 回到了原来的世界');
    this.ret = null;
  },

  /* 站在出口上按交互键 → 开抽奖转盘，抽完领奖离开 */
  tryExit: function (p) {
    if (!this.active) return false;
    var tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (tx !== this.exit.x || ty !== this.exit.y) return false;
    if (!this.open()) { Game.say(this.kind === 'puzzle' ? '还有箱子没推到发光点上' : '先把场上所有的怪清干净'); return true; }
    Game.openLottery(p, this.kind);
    return true;
  },

  open: function () {
    return this.kind === 'puzzle' ? this.solved : this.cleared;
  },

  /* ---------- 益智神殿 ---------- */
  buildPuzzle: function () {
    var w = 17, h = 13, i, x, y;
    this.w = w; this.h = h;
    this.grid = new Uint8Array(w * h);
    this.fl = new Uint8Array(w * h);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var i0 = y * w + x;
        this.fl[i0] = F_TEMPLE;
        this.grid[i0] = (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? O.STONEB : O.NONE;
      }
    }
    /* 四组对称柱子，让场地不至于空荡荡（也给推箱制造一点难度） */
    var pil = [[4, 3], [12, 3], [4, 9], [12, 9], [8, 6]];
    for (i = 0; i < pil.length; i++) this.set(pil[i][0], pil[i][1], O.STONEB);
    /* 四角火把，照亮场地 */
    var tor = [[1, 1], [15, 1], [1, 11], [15, 11], [8, 1], [8, 11]];
    for (i = 0; i < tor.length; i++) this.set(tor[i][0], tor[i][1], O.TORCH);

    var rng = mulberry32(this.seed);
    var free = [];
    for (y = 2; y < h - 2; y++) {
      for (x = 2; x < w - 2; x++) if (this.get(x, y) === O.NONE) free.push([x, y]);
    }
    /* 出口固定在左下角内侧，别让箱子把它压住 */
    this.exit = { x: 1, y: h - 2 };
    this.set(this.exit.x, this.exit.y, O.REXIT);

    /* 反向生成：先让箱子全部落在目标点上，再随机“倒着拉”若干步 ——
       这样一定存在解法（把拉动序列反过来就是解法），不会出现死局 */
    var N = 4, tries = 0, okConf = false;
    while (!okConf && tries < 40) {
      tries++;
      var cand = free.slice();
      for (i = cand.length - 1; i > 0; i--) {                 // 洗牌
        var j = Math.floor(rng() * (i + 1));
        var tmp = cand[i]; cand[i] = cand[j]; cand[j] = tmp;
      }
      this.pads = []; this.boxes = [];
      for (i = 0; i < cand.length && this.pads.length < N; i++) {
        var c = cand[i];
        if (c[0] === this.exit.x && c[1] === this.exit.y) continue;
        if (this.tooClose(c)) continue;
        this.pads.push({ x: c[0], y: c[1] });
      }
      if (this.pads.length < N) continue;
      for (i = 0; i < N; i++) this.boxes.push({ x: this.pads[i].x, y: this.pads[i].y });

      /* 倒着拉：箱子 c 移到 c-d，同时玩家回到 c-2d —— 记下来，正向重放就是解法 */
      this.revMoves = [];
      var px = this.exit.x + 1, py = this.exit.y - 1;
      for (var s = 0; s < 120; s++) {
        var bi = Math.floor(rng() * N);
        var d = DIRS[Math.floor(rng() * 4)];
        var b = this.boxes[bi];
        var to = { x: b.x - d[0], y: b.y - d[1] };
        var pl = { x: b.x - d[0] * 2, y: b.y - d[1] * 2 };
        if (!this.freeForBox(to.x, to.y)) continue;
        if (!this.freeForBox(pl.x, pl.y)) continue;
        this.boxes[bi] = to;
        px = pl.x; py = pl.y;
        this.revMoves.push({ b: bi, dx: d[0], dy: d[1], px: px, py: py });
      }
      /* 至少有一个箱子不在目标点上，否则一进门就通关了 */
      if (this.onPads() === N) continue;
      /* 起点不能正好压在箱子上 */
      if (this.boxIndexAt(px, py) >= 0) continue;
      okConf = true;
      this.entry = { x: px, y: py };
    }
    if (!okConf) {   // 兜底：极少数情况下退化成随手摆（仍然可以重置重来）
      this.entry = { x: 2, y: h - 2 };
    }
    this.boxes0 = this.boxes.map(function (b) { return { x: b.x, y: b.y }; });
    for (i = 0; i < this.pads.length; i++) this.set(this.pads[i].x, this.pads[i].y, O.RPAD);
    for (i = 0; i < this.boxes.length; i++) this.set(this.boxes[i].x, this.boxes[i].y, O.PBOX);
  },

  tooClose: function (c) {
    for (var i = 0; i < this.pads.length; i++) {
      if (Math.abs(this.pads[i].x - c[0]) + Math.abs(this.pads[i].y - c[1]) < 3) return true;
    }
    return false;
  },
  boxIndexAt: function (x, y) {
    for (var i = 0; i < this.boxes.length; i++) if (this.boxes[i].x === x && this.boxes[i].y === y) return i;
    return -1;
  },
  padAt: function (x, y) {
    for (var i = 0; i < this.pads.length; i++) if (this.pads[i].x === x && this.pads[i].y === y) return true;
    return false;
  },
  freeForBox: function (x, y) {
    if (!this.inb(x, y)) return false;
    var o = this.get(x, y);
    if (o === O.STONEB || o === O.PBOX || o === O.REXIT) return false;
    if (this.boxIndexAt(x, y) >= 0) return false;      // 别和别的箱子叠在一起
    return true;
  },
  blocked: function (x, y) {
    if (!this.inb(x, y)) return true;
    var o = this.get(x, y);
    if (o === O.STONEB || o === O.PBOX || o === O.REXIT) return true;
    return false;
  },
  onPads: function () {
    var n = 0;
    for (var i = 0; i < this.boxes.length; i++) if (this.padAt(this.boxes[i].x, this.boxes[i].y)) n++;
    return n;
  },

  /* 把箱子摆回初始位置（卡住了就重来） */
  resetBoxes: function () {
    for (var i = 0; i < this.boxes.length; i++) {
      var old = this.boxes[i];
      if (this.get(old.x, old.y) === O.PBOX) this.set(old.x, old.y, this.padAt(old.x, old.y) ? O.RPAD : O.NONE);
    }
    this.boxes = this.boxes0.map(function (b) { return { x: b.x, y: b.y }; });
    for (var j = 0; j < this.boxes.length; j++) this.set(this.boxes[j].x, this.boxes[j].y, O.PBOX);
    for (var k = 0; k < this.pads.length; k++) {
      if (this.get(this.pads[k].x, this.pads[k].y) === O.NONE) this.set(this.pads[k].x, this.pads[k].y, O.RPAD);
    }
    this.moves = 0;
    this.rebuildLights();
    Game.say('🔄 箱子已经摆回原位');
  },

  /* 玩家顶着箱子走 → 把箱子推一格 */
  tryPush: function (p) {
    if (!this.active || this.kind !== 'puzzle') return;
    if (p.pushCd > 0) return;
    var fx = p.facing.x, fy = p.facing.y;
    var dx = 0, dy = 0;
    if (Math.abs(fx) >= Math.abs(fy)) dx = fx > 0 ? 1 : -1;
    else dy = fy > 0 ? 1 : -1;
    if (!dx && !dy) return;
    var c = p.ctl;
    var pressing = (dx > 0 && Input.down(c.right)) || (dx < 0 && Input.down(c.left)) ||
                   (dy > 0 && Input.down(c.down)) || (dy < 0 && Input.down(c.up));
    if (!pressing) return;
    var ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
    var bx = ptx + dx, by = pty + dy;
    if (this.get(bx, by) !== O.PBOX) return;
    var tx2 = bx + dx, ty2 = by + dy;
    if (this.blocked(tx2, ty2)) return;
    /* 箱子挪走，人也跟着进一格（手感跟得上，不会卡在原地） */
    this.set(bx, by, this.padAt(bx, by) ? O.RPAD : O.NONE);
    this.set(tx2, ty2, O.PBOX);
    var idx = this.boxIndexAt(bx, by);
    if (idx >= 0) { this.boxes[idx].x = tx2; this.boxes[idx].y = ty2; }
    var nx = p.x + dx * TILE, ny = p.y + dy * TILE;
    if (!p.hits(nx, ny)) { p.x = nx; p.y = ny; }
    p.pushCd = 0.18;
    this.moves++;
    var on = this.onPads();
    if (!this.solved && on === this.boxes.length) {
      this.solved = true;
      Game.say('✨ 全部归位！出口传送门打开了 —— 走过去按交互键');
      for (var i = 0; i < this.boxes.length; i++) {
        Game.pops.push({ x: this.boxes[i].x * TILE + 16, y: this.boxes[i].y * TILE + 16, t: 0 });
      }
    }
    this.rebuildLights();
  },

  /* ---------- 试炼竞技场 ---------- */
  buildArena: function () {
    var w = 21, h = 15, x, y, i;
    this.w = w; this.h = h;
    this.grid = new Uint8Array(w * h);
    this.fl = new Uint8Array(w * h);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var i0 = y * w + x;
        this.fl[i0] = F_ARENA;
        this.grid[i0] = (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? O.STONEB : O.NONE;
      }
    }
    /* 四角火盆 + 几根柱子当掩体 */
    var tor = [[1, 1], [19, 1], [1, 13], [19, 13], [10, 1], [10, 13], [1, 7], [19, 7]];
    for (i = 0; i < tor.length; i++) this.set(tor[i][0], tor[i][1], O.TORCH);
    var pil = [[5, 4], [15, 4], [5, 10], [15, 10], [10, 7]];
    for (i = 0; i < pil.length; i++) this.set(pil[i][0], pil[i][1], O.STONEB);
    this.entry = { x: 10, y: 12 };
    this.exit = { x: 10, y: 2 };
    this.set(this.exit.x, this.exit.y, O.REXIT);
    this.wave = 0; this.waveT = 2.2; this.cleared = false;
  },

  spawnWave: function () {
    this.wave++;
    var list = this.wave === 1 ? ['zombie', 'zombie', 'zombie', 'ender']
      : this.wave === 2 ? ['zombie', 'zombie', 'brute', 'brute', 'ender', 'ender']
      : ['boss', 'zombie', 'zombie', 'brute', 'brute', 'ender', 'ender', 'zombie'];
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var spot = this.randSpot();
      if (!spot) continue;
      var m = new Mob(list[i], spot.x * TILE + 16, spot.y * TILE + 16);
      m.realm = true;
      Game.mobs.push(m);
      n++;
    }
    this.mobsLeft = n;
    if (this.wave >= this.waveTotal) Game.say('💀 最后一波！打完就开门');
    else Game.say('⚔️ 第 ' + this.wave + ' / ' + this.waveTotal + ' 波：' + n + ' 只怪冲上来了！');
  },

  randSpot: function () {
    for (var a = 0; a < 80; a++) {
      var x = 2 + Math.floor(Math.random() * (this.w - 4));
      var y = 2 + Math.floor(Math.random() * (this.h - 4));
      if (this.get(x, y) !== O.NONE) continue;
      var okfree = true;
      for (var i = 0; i < Game.players.length; i++) {
        var p = Game.players[i];
        if (dist(p.x, p.y, x * TILE + 16, y * TILE + 16) < 120) okfree = false;
      }
      if (!okfree) continue;
      return { x: x, y: y };
    }
    return null;
  },

  /* ---------- 每帧 ---------- */
  update: function (dt, players) {
    if (!this.active) return;
    this.t += dt;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (p.pushCd > 0) p.pushCd -= dt;
      if (p.alive) this.tryPush(p);
    }
    if (this.kind === 'puzzle') return;
    /* 竞技场：一波打完歇两秒再来下一波 */
    var alive = 0;
    for (var m = 0; m < Game.mobs.length; m++) if (Game.mobs[m].realm && Game.mobs[m].alive) alive++;
    this.mobsLeft = alive;
    if (this.wave < this.waveTotal) {
      if (this.wave === 0) { this.waveT -= dt; if (this.waveT <= 0) this.spawnWave(); }
      else if (alive === 0) {
        this.waveT -= dt;
        if (this.waveT <= 0) { this.waveT = 2.2; this.spawnWave(); }
      }
    } else if (alive === 0 && !this.cleared) {
      this.cleared = true;
      Game.say('🏆 全部清光！出口传送门开了 —— 走过去按交互键拿奖励');
    }
  },

  /* ---------- 渲染（瓦片由 Game.drawTiles 画，这里只画叠加层） ---------- */
  draw: function (ctx) {
    if (!this.active) return;
    /* 出口传送门的旋转光环 */
    var ex = this.exit.x * TILE + 16, ey = this.exit.y * TILE + 16;
    var on = this.open();
    var pulse = 0.5 + 0.5 * Math.sin(this.t * (on ? 5 : 2));
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(this.t * (on ? 1.6 : 0.5));
    ctx.strokeStyle = on ? 'rgba(221,214,254,' + (0.55 + pulse * 0.45) + ')' : 'rgba(120,120,150,.35)';
    ctx.lineWidth = 3;
    for (var a = 0; a < 3; a++) {
      ctx.beginPath();
      ctx.arc(0, 0, 8 + a * 4, a * 2.1, a * 2.1 + 2.0);
      ctx.stroke();
    }
    ctx.restore();
    if (on) {
      ctx.fillStyle = 'rgba(167,139,250,' + (0.12 + pulse * 0.12) + ')';
      ctx.beginPath(); ctx.arc(ex, ey, 20, 0, 6.283); ctx.fill();
    }
    /* 益智神殿：目标点上画一个小箭头，提示往哪儿推 */
    if (this.kind === 'puzzle') {
      var n = this.onPads();
      for (var i = 0; i < this.pads.length; i++) {
        var px = this.pads[i].x * TILE + 16, py = this.pads[i].y * TILE + 16;
        ctx.strokeStyle = 'rgba(253,224,71,' + (0.35 + 0.3 * Math.sin(this.t * 3 + i)) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, 11, 0, 6.283); ctx.stroke();
      }
      /* 已归位的箱子打个勾 */
      for (var b = 0; b < this.boxes.length; b++) {
        if (!this.padAt(this.boxes[b].x, this.boxes[b].y)) continue;
        var bx = this.boxes[b].x * TILE + 16, by = this.boxes[b].y * TILE + 16;
        ctx.strokeStyle = '#BEF264'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx - 5, by - 2); ctx.lineTo(bx - 1, by + 4); ctx.lineTo(bx + 6, by - 7);
        ctx.stroke();
      }
    }
  },

  banner: function () {
    if (this.kind === 'puzzle') {
      return '🧩 益智神殿 · 把 ' + this.boxes.length + ' 个箱子推到发光点上（已归位 ' + this.onPads() +
        '/' + this.boxes.length + '）· 按' + (Game.players[0].ctl.drop === 'KeyZ' ? ' Z / M ' : ' 丢弃键 ') + '重摆';
    }
    return '⚔️ 试炼竞技场 · 第 ' + Math.max(1, this.wave) + '/' + this.waveTotal + ' 波' +
      (this.cleared ? ' · 已通关' : ' · 剩 ' + this.mobsLeft + ' 只');
  }
};

var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
