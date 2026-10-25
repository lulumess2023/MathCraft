/* 存档：每 20 秒自动存一次，也可以随时手动存 / 退出时存
   存的是「玩家状态 + 玩家改过的区块 + 已捡走的地面物品」，
   没改过的区块不存 —— 读档时按同一个 seed 重新生成即可。 */
var Save = {
  KEY: 'wildcraft.save.v1',
  VER: 1,
  autoEvery: 20,        // 自动存档间隔（秒）
  t: 0,
  flash: 0,             // “已保存”提示还剩多久
  day: 1,               // 上次存档时的天数（给首页显示）
  phaseName: '',

  ok: function () {
    try { return typeof localStorage !== 'undefined' && !!localStorage; } catch (e) { return false; }
  },

  /* ---------- 区块数据的压缩：游程编码成字符串（比 base64 好调试，也省空间） ---------- */
  rle: function (arr) {
    var out = [], v = arr[0] | 0, n = 1;
    for (var i = 1; i < arr.length; i++) {
      var c = arr[i] | 0;
      if (c === v) n++;
      else { out.push(n > 1 ? v + '*' + n : '' + v); v = c; n = 1; }
    }
    out.push(n > 1 ? v + '*' + n : '' + v);
    return out.join(',');
  },
  unrle: function (str, len) {
    var a = new Uint8Array(len), k = 0;
    var parts = String(str).split(',');
    for (var i = 0; i < parts.length && k < len; i++) {
      var p = parts[i], st = p.indexOf('*');
      var v, n;
      if (st >= 0) { v = parseInt(p.slice(0, st), 10); n = parseInt(p.slice(st + 1), 10); }
      else { v = parseInt(p, 10); n = 1; }
      if (!isFinite(v)) v = 0;
      if (!isFinite(n) || n < 1) n = 1;
      for (var j = 0; j < n && k < len; j++) a[k++] = v;
    }
    return a;
  },

  /* ---------- 收集 ---------- */
  collect: function () {
    var g = Game;
    var inRealm0 = (typeof Realm !== 'undefined' && Realm.active && Realm.ret);
    var d = {
      v: this.VER,
      seed: World.seed,
      layer: inRealm0 ? Realm.ret.layer : g.layer, time: g.time, day: g.day,
      solo: g.solo, p1c: g.p1Ctrl, p2c: g.p2Ctrl,
      players: [], chunks: [], taken: []
    };
    /* 在传送门里存的档：异空间不保存，坐标记成「进传送门之前站的地方」，
       免得读档之后人被丢到神殿那套坐标系里 */
    var inRealm = (typeof Realm !== 'undefined' && Realm.active && Realm.ret);
    for (var i = 0; i < g.players.length; i++) {
      var p = g.players[i];
      var back = (inRealm && Realm.ret.pos[i]) ? Realm.ret.pos[i] : null;
      var px = back ? back.x : p.x, py = back ? back.y : p.y;
      var inv = [];
      for (var s = 0; s < p.inv.length; s++) {
        var it = p.inv[s];
        inv.push(it ? [it.id, it.count] : null);
      }
      d.players.push({
        x: Math.round(px * 10) / 10, y: Math.round(py * 10) / 10,
        sx: Math.round(px * 10) / 10, sy: Math.round(py * 10) / 10,
        hp: Math.round(p.hp * 10) / 10, food: Math.round(p.food * 10) / 10,
        sel: p.sel, inv: inv, wlv: p.wlv || {}, pets: p.pets || [],
        charId: p.char ? p.char.id : null,
        alive: p.alive
      });
    }
    /* 宠物在外面打架的话，读档时全部收回栏里 */
    if (d.players.length) {
      for (var pt = 0; pt < d.players.length; pt++) {
        var pets = d.players[pt].pets;
        for (var q = 0; q < pets.length; q++) pets[q].out = false;
      }
    }
    var keys = Object.keys(World.chunks), cnt = 0;
    for (var k = 0; k < keys.length && cnt < 300; k++) {
      var c = World.chunks[keys[k]];
      if (!c.dirty) continue;
      d.chunks.push([c.layer, c.cx, c.cy, this.rle(c.obj)]);
      cnt++;
    }
    var n = 0;
    for (var tk in World.taken) { d.taken.push(tk); if (++n >= 8000) break; }
    return d;
  },

  /* ---------- 还原 ---------- */
  apply: function (d) {
    if (!d || d.v !== this.VER) return false;
    World.seed = d.seed;
    World.chunks = {}; World.stats.chunks = 0; World.taken = {};
    for (var i = 0; i < d.taken.length; i++) World.taken[d.taken[i]] = 1;

    Game.layer = d.layer || 0;
    Game.time = d.time || 0;
    Game.day = d.day || 1;
    Game.mobs = []; Game.drops = []; Game.bullets = []; Game.explosions = [];
    Game.vehicles = []; Game.baits = []; Game.pops = [];
    Game.solo = !!d.solo;
    Game.p1Ctrl = d.p1c || 'kb'; Game.p2Ctrl = d.p2c || 'kb';
    if (typeof Maze !== 'undefined' && Maze.active) Maze.end();
    if (typeof Realm !== 'undefined' && Realm.active) Realm.active = false;
    if (typeof Challenges !== 'undefined') Challenges.active = null;
    Game.dragonWish = null; Game.questOffer = null;
    Game.panel = -1; Game.questPanel = -1; Game.invHold = null;
    Game.nightDeaths = 0;

    for (var c = 0; c < d.chunks.length; c++) {
      var e = d.chunks[c];
      var ch = World.chunk(e[0], e[1], e[2]);
      ch.obj = this.unrle(e[3], CHUNK * CHUNK);
      ch.dirty = true;
      World.rebuildLights(e[0], e[1], e[2]);
      ch.pickups.length = 0;
      World.genPickups(ch);
    }
    for (var pi = 0; pi < Game.players.length; pi++) {
      var p = Game.players[pi], sp = d.players[pi];
      if (!sp) continue;
      p.inv = makeInv(20);
      for (var s = 0; s < sp.inv.length && s < p.inv.length; s++) {
        var it = sp.inv[s];
        if (it && ITEMS[it[0]]) p.inv[s] = { id: it[0], count: it[1] };
      }
      /* 角色（拳皇式选人）：先换角色（会改 maxhp/maxfood），再还原血量 */
      if (sp.charId && Game.applyChar) Game.applyChar(p, sp.charId);
      p.x = sp.x; p.y = sp.y;
      p.safeX = sp.sx || sp.x; p.safeY = sp.sy || sp.y;
      p.hp = clamp(sp.hp, 1, p.maxhp); p.food = clamp(sp.food, 0, p.maxfood);
      p.sel = sp.sel || 0;
      p.wlv = sp.wlv || {};
      p.pets = sp.pets || [];
      p.alive = sp.alive !== false;
      if (!p.alive) p.respawn = 1;
      p.burn = 0; p.riding = null; p.fused = null; p.following = null;
      p.vx = 0; p.vy = 0; p.pushCd = 0;
      p.inWater = false; p.onSlip = false; p.inVine = false; p.onLava = false;
      /* 万一存档点被埋了（版本变了地形也变了），挪到旁边能站的地方 */
      if (World.solid(Game.layer, Math.floor(p.x / TILE), Math.floor(p.y / TILE))) {
        var spot = World.findSpot(Game.layer, Math.floor(p.x / TILE), Math.floor(p.y / TILE), 10);
        p.x = spot.x * TILE + 16; p.y = spot.y * TILE + 16;
        p.safeX = p.x; p.safeY = p.y;
      }
    }
    return true;
  },

  /* ---------- 存 / 读 / 清 ---------- */
  save: function (quiet) {
    if (!this.ok()) return false;
    try {
      var d = this.collect();
      localStorage.setItem(this.KEY, JSON.stringify(d));
      this.flash = 2.4;
      this.day = d.day;
      this.phaseName = Game.phase().name;
      if (!quiet) Game.say('💾 已保存（第 ' + d.day + ' 天 · ' + Game.phase().name + '）');
      return true;
    } catch (e) {
      if (!quiet && typeof Game !== 'undefined') Game.say('💾 保存失败：存储空间可能满了');
      return false;
    }
  },

  read: function () {
    if (!this.ok()) return null;
    try {
      var s = localStorage.getItem(this.KEY);
      if (!s) return null;
      var d = JSON.parse(s);
      return (d && d.v === this.VER) ? d : null;
    } catch (e) { return null; }
  },
  has: function () { return !!this.read(); },
  clear: function () {
    if (!this.ok()) return;
    try { localStorage.removeItem(this.KEY); } catch (e) { }
  },

  /* 给首页「继续冒险」按钮用的说明文字 */
  summary: function () {
    var d = this.read();
    if (!d) return '';
    var where = d.layer === 0 ? '天空岛' : '地面大陆';
    return '第 ' + d.day + ' 天 · ' + where + ' · ' + (d.solo ? '单人' : '双人');
  },

  load: function () {
    var d = this.read();
    if (!d) { Game.say('没有找到存档'); return false; }
    if (!this.apply(d)) { Game.say('存档读不出来（可能是旧版本）'); return false; }
    Game.say('📂 读档成功：第 ' + d.day + ' 天，' + (d.layer === 0 ? '天空岛' : '地面大陆'));
    return true;
  },

  /* 每帧调用：到了时间就自动存一次 */
  tick: function (dt) {
    if (this.flash > 0) this.flash -= dt;
    if (typeof Game === 'undefined' || !Game.started) return;
    this.t += dt;
    if (this.t >= this.autoEvery) { this.t = 0; this.save(true); }
  }
};
