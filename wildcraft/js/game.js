/* 主循环、输入、相机、昼夜、HUD */
var canvas, ctx, lightCanvas, lctx, lightSprite;

function $(s) { return document.querySelector(s); }
function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

var Input = {
  keys: {}, pressedSet: {},
  BLOCK: ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Slash', 'Tab'],
  init: function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      if (!self.keys[e.code]) self.pressedSet[e.code] = true;
      self.keys[e.code] = true;
      if (self.BLOCK.indexOf(e.code) >= 0) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
    window.addEventListener('blur', function () { self.keys = {}; });
  },
  down: function (c) { return !!this.keys[c]; },
  pressed: function (c) { return !!this.pressedSet[c]; },
  endFrame: function () { this.pressedSet = {}; }
};

var Game = {
  W: 0, H: 0, dpr: 1,
  layer: 0,                 // 0 = 天空岛，1 = 地面大陆
  players: [], mobs: [], drops: [], vehicles: [], bullets: [], explosions: [],
  balls: [],                  // 飞在空中的驯灵环
  baits: [],                  // 扔在地上的附魔土豆
  pops: [],                   // 策反成功的彩虹特效
  maxAllies: 8,               // 小队上限（僵尸 + 机器人，机器人最多 4 个）
  BAIT_LURE: 9,               // 诱饵吸引半径（格）
  pickupBuf: [], gcTick: 3,
  panel: -1,                // 合成面板
  questPanel: -1,           // 任务本
  questOffer: null,         // 任务弹窗（先说明再接）
  invCursor: { i: 0 },      // 背包光标
  invHold: null,            // 手上拿着的那一叠（拖拽/移动用）
  invHoldFrom: -1,          // 拿起来自哪格（交换时回填用）
  mouse: { x: -999, y: -999, down: false },
  dragFrom: -1, dragStart: null,
  nightDeaths: 0, maxNightDeaths: 10,
  lastPhase: '',
  hudSig: '', msgSig: '', panelSig: ['', ''],
  time: 0, dayLen: 600, day: 1,
  cam: { x: 0, y: 0, zoom: 1, left: 0, top: 0, right: 0, bottom: 0 },
  messages: [],
  panel: -1,                // -1 无面板，0/1 = 玩家索引
  spawnTimer: 3,
  started: false,
  hudTick: 0,

  solo: false,
  p1Ctrl: 'kb', p2Ctrl: 'kb',

  init: function () {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    lightCanvas = document.createElement('canvas');
    lctx = lightCanvas.getContext('2d');
    lightSprite = document.createElement('canvas');
    lightSprite.width = lightSprite.height = 256;
    var lg = lightSprite.getContext('2d');
    var grad = lg.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.82)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    lg.fillStyle = grad; lg.fillRect(0, 0, 256, 256);

    this.resize();
    var self = this;
    window.addEventListener('resize', function () { self.resize(); });
    Input.init();

    // 背包拖拽：鼠标事件直接喂给 Game
    var cv = document.getElementById('game');
    if (cv && cv.addEventListener) {
      var pos = function (e) {
        var r = cv.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      cv.addEventListener('mousedown', function (e) { var p = pos(e); self.pointerMove(p.x, p.y); self.pointerDown(p.x, p.y); self.mouse.down = true; });
      window.addEventListener('mouseup', function (e) { var p = pos(e); self.pointerUp(p.x, p.y); self.mouse.down = false; });
      cv.addEventListener('mousemove', function (e) { var p = pos(e); self.pointerMove(p.x, p.y); });
      // 触屏也能拖
      cv.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches[0]) return;
        var p = pos(e.touches[0]); self.pointerMove(p.x, p.y); self.pointerDown(p.x, p.y); e.preventDefault();
      }, { passive: false });
      cv.addEventListener('touchend', function (e) {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        var p = pos(e.changedTouches[0]); self.pointerUp(p.x, p.y);
      });
    }

    var p1 = new Player({
      id: 0, name: 'P1', color: '#4FA3D9', accent: '#2E7FB8',
      ctl: {
        up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', mine: 'Space', place: 'KeyE',
        use: 'KeyF', craft: 'KeyC', quest: 'KeyQ', follow: 'KeyG', drop: 'KeyZ', pet: 'KeyB',
        slots: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'],
        slotLabel: ['1', '2', '3', '4', '5', '6', '7', '8', '9']
      }
    });
    var p2 = new Player({
      id: 1, name: 'P2', color: '#F472B6', accent: '#DB2777',
      ctl: {
        up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', mine: 'Enter',
        place: 'ShiftRight', place2: 'Period', use: 'Slash', craft: 'KeyN', quest: 'KeyL',
        follow: 'KeyV', drop: 'KeyM', pet: 'Comma',
        slots: ['KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'KeyX', 'KeyJ', 'KeyK'],
        slotLabel: ['T', 'Y', 'U', 'I', 'O', 'P', 'X', 'J', 'K']
      }
    });
    p1.x = 0 * TILE + TILE / 2 - 22; p1.y = 0 * TILE + TILE / 2;
    p2.x = 0 * TILE + TILE / 2 + 22; p2.y = 0 * TILE + TILE / 2;
    p1.safeX = p1.x; p1.safeY = p1.y; p2.safeX = p2.x; p2.safeY = p2.y;
    this.players = [p1, p2];

    /* 开始页：选择单/双人 + 控制方式 */
    var setupState = { players: '2', p1ctl: 'kb', p2ctl: 'kb' };
    function refreshSetup() {
      $$('.opt').forEach(function (b) {
        var m = b.dataset.mode, v = b.dataset.val;
        b.classList.toggle('active', setupState[m] === v);
      });
    }
    $$('.opt').forEach(function (b) {
      b.addEventListener('click', function () {
        setupState[b.dataset.mode] = b.dataset.val;
        refreshSetup();
      });
    });
    function pollGamepadStatus() {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      var count = 0;
      for (var i = 0; i < pads.length; i++) if (pads[i]) count++;
      var el = document.getElementById('gp-status');
      if (el) el.textContent = count > 0 ? '检测到 ' + count + ' 个手柄' : '未检测到手柄（可以先接上手柄再刷新本页）';
    }
    setInterval(pollGamepadStatus, 1000);
    pollGamepadStatus();

    /* 把 setupState 应用到游戏里，然后开始 */
    function beginGame(fromSave) {
      if (self.solo) document.body.classList.add('solo');
      else document.body.classList.remove('solo');
      document.getElementById('start').classList.add('hide');
      self.started = true;
      self.buildHints();
      if (!fromSave) {
        self.say(self.solo
          ? '单人模式：独自在岛上求生（迷宫挑战会自动调整为单人可解）'
          : '双人模式：两人走到一起重叠后按挖掘键可以合体变强！按 G / V 可以互相跟随保护');
      }
    }
    self._beginGame = beginGame;

    document.getElementById('btn-start').addEventListener('click', function () {
      /* 街机式选人：先挑角色再进游戏 */
      self._setupState = setupState;
      self.openCharSelect();
    });
    /* 选人卡片（头像 + 点击）与返回按钮 */
    self.buildCharCards();
    var bBack = document.getElementById('btn-cs-back');
    if (bBack) bBack.addEventListener('click', function () { self.closeCharSelect(); });

    document.getElementById('btn-continue').addEventListener('click', function () {
      self.newGame();
      if (typeof Save !== 'undefined' && Save.load()) {
        /* 读档里带着单/双人和控制方式 */
        setupState.players = self.solo ? '1' : '2';
        setupState.p1ctl = self.p1Ctrl;
        setupState.p2ctl = self.p2Ctrl;
        refreshSetup();
        beginGame(true);
      } else {
        self.say('存档读不出来，还是开了个新档');
        beginGame(false);
      }
    });

    var bSave = document.getElementById('btn-save');
    if (bSave) bSave.addEventListener('click', function () { if (typeof Save !== 'undefined') Save.save(false); });
    var bQuit = document.getElementById('btn-quit');
    if (bQuit) bQuit.addEventListener('click', function () { self.returnToMenu(true); });

    this.refreshStart();
    this.buildHints();

    /* 外部统一菜单直通：index.html?auto=1&players=2&p1=id&p2=id
       跳过本页的开始界面与选人，直接按参数开局（load=1 时读档续玩） */
    try {
      var qs = new URLSearchParams(location.search);
      if (qs.get('auto') === '1') {
        var players = qs.get('players') === '1' ? '1' : '2';
        setupState.players = players;
        setupState.p1ctl = 'kb';
        setupState.p2ctl = 'kb';
        self.solo = players === '1';
        self.p1Ctrl = 'kb';
        self.p2Ctrl = 'kb';
        self.newGame();
        self.applyChar(self.players[0], qs.get('p1') || 'naruto');
        if (!self.solo) self.applyChar(self.players[1], qs.get('p2') || 'sasuke');
        if (qs.get('load') === '1' && typeof Save !== 'undefined' && Save.load()) {
          setupState.players = self.solo ? '1' : '2';
          refreshSetup();
          beginGame(true);
        } else {
          beginGame(false);
        }
      }
    } catch (eAuto) { }
  },

  /* 按键提示：按各自的控制方式生成，贴在自己那一侧（中间留给视野） */
  buildHints: function () {
    var pad1 = this.p1Ctrl === 'pad', pad2 = this.p2Ctrl === 'pad';
    var h1 = '<span class="t p1c">🎮 P1 ' + (pad1 ? '· 手柄' : '· 键盘') + '</span>' + (pad1
      ? '<b>摇杆</b> 走 · <b>A</b> 挖/打/合体 · <b>B</b> 放/吃/召唤<br><b>X</b> 交互 · <b>Y</b> 合成 · <b>LB</b> 任务本 · <b>RB</b> 换物品<br><b>LT</b> 跟随保护 · <b>RT</b> 丢弃手上的 · <b>Start</b> 回白天'
      : '<b>WASD</b> 走 · <b>空格</b> 挖/打/合体 · <b>E</b> 放/吃/扔驯灵环<br><b>F</b> 交互 · <b>C</b> 合成 · <b>Q</b> 任务本 · <b>1-9</b> 选物品<br><b>G</b> 跟随保护 · <b>B</b> 放出小野灵 · <b>Z</b> 丢弃手上的 · <b>R</b> 回到白天');
    var h2 = '<span class="t p2c">🎮 P2 ' + (pad2 ? '· 手柄' : '· 键盘') + '</span>' + (pad2
      ? '<b>摇杆</b> 走 · <b>A</b> 挖/打/合体 · <b>B</b> 放/吃/召唤<br><b>X</b> 交互 · <b>Y</b> 合成 · <b>LB</b> 任务本 · <b>RB</b> 换物品<br><b>LT</b> 跟随保护 · <b>RT</b> 丢弃手上的 · <b>Start</b> 回白天'
      : '<b>方向键</b> 走 · <b>Enter</b> 挖/打/合体 · <b>右Shift</b> 放/吃<br><b>/</b> 交互 · <b>N</b> 合成 · <b>L</b> 任务本 · <b>T Y U I O P X J K</b> 选物品<br><b>V</b> 跟随保护 · <b>，</b> 放出小野灵 · <b>M</b> 丢弃手上的');
    var e1 = document.getElementById('hint1'), e2 = document.getElementById('hint2'), eh = document.getElementById('hint');
    if (e1) e1.innerHTML = h1;
    if (e2) e2.innerHTML = h2;
    if (eh) {
      eh.innerHTML =
        '<span class="brief">ℹ️ 玩法提示 · 点一下展开</span>' +
        '<div class="full">' +
        '<b>🌀 传送门</b>：地图上蓝色的祭坛（益智神殿）和城堡里的红门（竞技场），站上去按交互键就能进<br>' +
        '<b>驯灵环 🔴</b>：按放置键扔向小野灵 / 豆荚炮手，血越少越好抓 · 收服后按 <b>B / ，</b> 放出来当帮手<br>' +
        '<b>合体</b>：两人走重叠后按挖掘键变强 · <b>🤖 机器人</b>：拿到后按放置键召唤 · <b>🌟 星曜石</b>：集齐 7 颗按交互键许愿<br>' +
        '<b>附魔土豆 🌈</b>：按放置键扔给僵尸，吃了就倒戈进你的小队 · 拿枪/飞刀会自动开火 · 同一把武器多捡几把会<b>升级</b>' +
        '</div>';
      /* 点一下展开 / 收起，不挡视野 */
      eh.classList.remove('open');
      eh.onclick = function (ev) { if (ev) ev.stopPropagation(); eh.classList.toggle('open'); };
    }
  },

  resize: function () {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = window.innerWidth; this.H = window.innerHeight;
    canvas.width = this.W * this.dpr; canvas.height = this.H * this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    lightCanvas.width = this.W; lightCanvas.height = this.H;
  },

  /* ---------- 世界访问（异空间 / 迷宫优先） ---------- */
  solidAt: function (tx, ty) {
    if (typeof Realm !== 'undefined' && Realm.active) return Realm.solid(tx, ty);
    return Maze.active ? Maze.solid(tx, ty) : World.solid(this.layer, tx, ty);
  },
  objAt: function (tx, ty) {
    if (typeof Realm !== 'undefined' && Realm.active) return Realm.objAt(tx, ty);
    if (Maze.active) return 0;
    return World.getObj(this.layer, tx, ty);
  },
  floorAt: function (tx, ty) {
    if (typeof Realm !== 'undefined' && Realm.active) return Realm.floorAt(tx, ty);
    if (Maze.active) return 1;
    return World.getFloor(this.layer, tx, ty);
  },
  setObj: function (tx, ty, v) {
    if (typeof Realm !== 'undefined' && Realm.active) { Realm.setObjAt(tx, ty, v); return; }
    if (Maze.active) return;
    World.setObj(this.layer, tx, ty, v);
  },

  say: function (t) {
    this.messages.push({ t: t, life: 4.5 });
    if (this.messages.length > 4) this.messages.shift();
  },

  /* ---------- 层切换 ---------- */
  descend: function (tx, ty) {
    var s = World.findSpot(1, tx, ty, 10);
    this.layer = 1;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      p.x = s.x * TILE + TILE / 2 + (i === 0 ? -14 : 14);
      p.y = s.y * TILE + TILE / 2;
      p.safeX = p.x; p.safeY = p.y;
    }
    this.bringAllies();
    this.say('落到了下面的大陆 —— 这里没有边界，一直走就一直有新的地图');
  },
  ascend: function () {
    this.layer = 0;
    var s = World.findSpot(0, 0, 0, 6);
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      p.x = s.x * TILE + TILE / 2 + (i === 0 ? -14 : 14);
      p.y = s.y * TILE + TILE / 2;
      p.safeX = p.x; p.safeY = p.y;
    }
    this.bringAllies();
    this.say('乘着上升气流回到了天空岛');
  },
  voidFall: function (p) {
    p.hp -= 4;
    p.flash = 0.3;
    p.x = p.safeX; p.y = p.safeY;
    this.say(p.name + ' 掉进云海了，被云朵托了回来（-4 血）');
    if (p.hp <= 0) p.die();
  },

  /* ---------- 传送门 → 异空间 ---------- */
  enterRealm: function (kind) {
    if (Maze.active || (typeof Realm !== 'undefined' && Realm.active)) return;
    var info = { layer: this.layer, pos: [] };
    for (var i = 0; i < this.players.length; i++) {
      info.pos.push({ x: this.players[i].x, y: this.players[i].y });
    }
    Realm.start(kind, info);
    if (kind === 'puzzle') {
      this.say('🌀 传送门亮了 —— 这里是益智神殿');
      this.say('🧩 把 ' + Realm.boxes.length + ' 个箱子推到发光点上，出口才会开（推错了按丢弃键重摆）');
    } else {
      this.say('🏰 城堡传送门开了 —— 试炼竞技场');
      this.say('⚔️ 撑过三波怪，出口就会开门');
    }
  },

  /* ---------- 驯灵环 ---------- */
  throwBall: function (p) {
    if (Maze.active) { this.say('迷宫里抓不了东西'); return false; }
    if (typeof Realm !== 'undefined' && Realm.active) { this.say('异空间里抓不了东西'); return false; }
    var ang = Math.atan2(p.facing.y, p.facing.x);
    this.balls.push({
      x: p.x + Math.cos(ang) * 16, y: p.y + Math.sin(ang) * 16,
      vx: Math.cos(ang) * 430, vy: Math.sin(ang) * 430,
      life: 1.1, t: 0, p: p
    });
    return true;
  },

  updateBalls: function (dt) {
    for (var i = this.balls.length - 1; i >= 0; i--) {
      var b = this.balls[i];
      b.t += dt; b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || this.solidAt(Math.floor(b.x / TILE), Math.floor(b.y / TILE))) {
        this.balls.splice(i, 1);
        continue;
      }
      var hit = null;
      for (var m = 0; m < this.mobs.length; m++) {
        var mo = this.mobs[m];
        if (!mo.alive || mo.ally || !mo.catchable) continue;
        if (dist(mo.x, mo.y, b.x, b.y) < mo.r + 12) { hit = mo; break; }
      }
      if (!hit) continue;
      this.balls.splice(i, 1);
      this.tryCapture(b.p, hit);
    }
  },

  /* 血越少越好抓：满血约 16%，剩一成血约 82% */
  tryCapture: function (p, m) {
    var frac = clamp(m.hp / m.maxhp, 0, 1);
    var chance = 0.16 + 0.66 * (1 - frac);
    var keyName = p.id === 0 ? 'B' : '，';
    if (Math.random() < chance) {
      p.pets.push({ type: m.type, hp: Math.max(1, Math.round(m.maxhp * 0.55)), maxhp: m.maxhp, out: false });
      m.alive = false;
      var idx = this.mobs.indexOf(m);
      if (idx >= 0) this.mobs.splice(idx, 1);
      this.pops.push({ x: m.x, y: m.y, t: 0 });
      this.say('✨ 收服成功！' + m.label + ' 进了 ' + p.name + ' 的宠物栏（按 ' + keyName + ' 放出来当帮手）');
    } else {
      m.hp = Math.max(1, m.hp - 2);
      m.flash = 0.25;
      this.say('💢 ' + m.label + ' 挣脱了驯灵环！（还剩 ' + Math.round(frac * 100) + '% 血，打得更残才好抓）');
    }
  },

  /* ---------- 挖掘与掉落 ---------- */
  breakTile: function (tx, ty, player) {
    var obj = this.objAt(tx, ty);
    var def = ODEF[obj];
    if (!def || !def.solid || def.unbreakable) return;
    if (obj === O.CHEST) {
      var loot = [['torch', 5], ['iron', 3], ['apple', 2], ['gold', 1], ['plank', 8], ['epotato', 1]];
      var pick = loot[Math.floor(Math.random() * loot.length)];
      Inv.add(player.inv, pick[0], pick[1]);
      this.setObj(tx, ty, O.NONE);
      var dBall = Math.random() < 0.34;                 // 宝箱是星曜石的主要来源
      if (dBall) this.grantDragonBall(player);
      this.say('宝箱！' + player.name + ' 拿到 ' + ITEMS[pick[0]].name + ' ×' + pick[1] + (dBall ? ' 和一颗星曜石 🌟' : ''));
      return;
    }
    this.setObj(tx, ty, O.NONE);
    if (def.drop) {
      if (def.dropChance && Math.random() > def.dropChance) return;
      this.drops.push({ x: tx * TILE + 16, y: ty * TILE + 16, id: def.drop, n: 1, life: 60 });
    }
    if (def.rune) {
      this.enterChallenge(player);
    } else if ((obj === O.IRON || obj === O.GOLD) && Math.random() < 0.12) {
      this.enterChallenge(player);
    }
  },

  enterChallenge: function (player) {
    Challenges.start(player);
    if (Challenges.active && Challenges.active.type === 'maze') {
      Challenges.active = null;
      this.enterMaze();
    }
  },

  enterMaze: function () {
    var info = { layer: this.layer, pos: [] };
    for (var i = 0; i < this.players.length; i++) info.pos.push({ x: this.players[i].x, y: this.players[i].y });
    Maze.start(Math.floor(Math.random() * 100000), info);
    for (var j = 0; j < this.players.length; j++) {
      var p = this.players[j];
      p.x = Maze.entry.x * TILE + TILE / 2 + (j === 0 ? -8 : 8);
      p.y = Maze.entry.y * TILE + TILE / 2;
    }
    this.say('脚下一空 —— 掉进机关迷宫了！');
    this.say('两个人要配合：有的门要同时踩住两块压力板才开');
  },

  exitMaze: function () {
    var info = Maze.returnInfo;
    Maze.end();
    this.layer = info ? info.layer : this.layer;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      var old = info && info.pos[i] ? info.pos[i] : { x: p.x, y: p.y };
      p.x = old.x; p.y = old.y;
      p.safeX = old.x; p.safeY = old.y;
      Inv.add(p.inv, 'iron', 3);
      Inv.add(p.inv, 'gold', 1);
      Inv.add(p.inv, 'torch', 6);
      Inv.add(p.inv, 'apple', 2);
    }
    this.say('逃出迷宫！每人得到 铁×3 金×1 火把×6 苹果×2');
  },

  /* ---------- 昼夜 ---------- */
  phase: function () {
    var f = (this.time % this.dayLen) / this.dayLen;
    if (f < 0.40) return { name: '白天', icon: '☀️', f: f };
    if (f < 0.50) return { name: '黄昏', icon: '🌇', f: f };
    if (f < 0.88) return { name: '夜晚', icon: '🌙', f: f };
    return { name: '黎明', icon: '🌅', f: f };
  },
  isNight: function () {
    var f = (this.time % this.dayLen) / this.dayLen;
    return f >= 0.46 && f < 0.90;
  },
  darkness: function () {
    var f = (this.time % this.dayLen) / this.dayLen;
    if (f < 0.40) return 0;
    if (f < 0.50) return (f - 0.40) / 0.10 * 0.80;
    if (f < 0.88) return 0.80;
    return (1 - (f - 0.88) / 0.12) * 0.80;
  },

  /* ---------- 回到首页 / 开新档 ---------- */
  returnToMenu: function (doSave) {
    if (doSave && typeof Save !== 'undefined') Save.save(true);
    this.started = false;
    this.panel = -1; this.questPanel = -1; this.questOffer = null; this.dragonWish = null;
    this.invHold = null; this.invHoldFrom = -1;
    if (typeof Realm !== 'undefined' && Realm.active) Realm.leave(true);
    if (Maze.active) Maze.end();
    if (typeof Challenges !== 'undefined') Challenges.active = null;
    var st = document.getElementById('start');
    if (st) st.classList.remove('hide');
    this.closeCharSelect();          /* 回首页时把选人界面收起来、设置面板摆回去 */
    this.refreshStart();
  },

  /* ---------- 街机式选人 ---------- */
  select: null,          // { active, turn, cur:[i,i], picked:[角色id, 角色id], repT }

  /* 换角色：属性跟着换，血量体力做钳制（血只多不少截到上限） */
  applyChar: function (p, charId) {
    var ch = (typeof charById === 'function') ? charById(charId) : null;
    if (!ch) return false;
    p.charId = ch.id; p.char = ch;
    p.speed = ch.stats.speed;
    p.maxhp = ch.stats.hp;
    p.hp = Math.min(p.hp, p.maxhp);
    p.maxfood = ch.stats.food || 20;
    p.food = Math.min(p.food, p.maxfood);
    p.dmgMul = ch.stats.dmg;
    return true;
  },

  /* 建选人卡片（init 里调一次；优先用 AI 生成头像 img/char-*.png，无图时用 canvas 兜底） */
  buildCharCards: function () {
    var grid = document.getElementById('cs-grid');
    if (!grid || grid.children.length) return;
    var self = this;
    for (var i = 0; i < CHARS.length; i++) {
      (function (i, ch) {
        var card = document.createElement('div');
        card.className = 'charcard';
        if (ch.avatar) {
          var im = document.createElement('img');
          im.className = 'cc-avatar';
          im.src = ch.avatar;
          im.alt = ch.name;
          im.draggable = false;
          card.appendChild(im);
        } else {
          var cv = document.createElement('canvas');
          cv.width = 84; cv.height = 84;
          card.appendChild(cv);
          if (cv.getContext) {
            try { drawCharPortrait(cv.getContext('2d'), ch, 84, 84, 0); } catch (e) { }
          }
        }
        var nm = document.createElement('div');
        nm.className = 'cc-name';
        nm.textContent = ch.icon + ' ' + ch.name;
        card.appendChild(nm);
        var sc = document.createElement('div');
        sc.className = 'cc-src';
        sc.textContent = ch.tag;
        card.appendChild(sc);
        var badge = document.createElement('span');
        badge.className = 'cc-badge';
        card.appendChild(badge);
        grid.appendChild(card);
        card.addEventListener('click', function () {
          if (!self.select || !self.select.active) return;
          self.select.cur[self.select.turn] = i;
          self.renderCharSelect();
          self.confirmPick();
        });
      })(i, CHARS[i]);
    }
  },

  openCharSelect: function () {
    var s = this._setupState;
    if (s) {
      this.solo = s.players === '1';
      this.p1Ctrl = s.p1ctl;
      this.p2Ctrl = s.p2ctl;
    }
    var box = document.querySelector('#start .setup');
    if (box) box.style.display = 'none';
    var sb = document.querySelector('#start .startbtns');
    if (sb) sb.style.display = 'none';
    var cs = document.getElementById('charsel');
    if (cs) cs.style.display = '';
    this.select = { active: true, turn: 0, cur: [0, 0], picked: [null, null], repT: 0 };
    this.renderCharSelect();
  },

  closeCharSelect: function () {
    this.select = null;
    var cs = document.getElementById('charsel');
    if (cs) cs.style.display = 'none';
    var box = document.querySelector('#start .setup');
    if (box) box.style.display = '';
    var sb = document.querySelector('#start .startbtns');
    if (sb) sb.style.display = '';
  },

  confirmPick: function () {
    var sel = this.select;
    if (!sel || !sel.active) return;
    var ch = CHARS[sel.cur[sel.turn]];
    var other = 1 - sel.turn;
    if (sel.picked[other] === ch.id) {
      var hd = document.getElementById('cs-head');
      if (hd) hd.innerHTML = '<span style="color:#F87171">' + ch.name + ' 已经被对方选走了，换一个吧</span>';
      return;
    }
    sel.picked[sel.turn] = ch.id;
    if (this.solo || sel.turn === 1) this.finishSelect();
    else {
      sel.turn = 1;
      /* P2 的光标别停在被 P1 选走的卡上 */
      if (sel.picked[0] === CHARS[sel.cur[1]].id) {
        for (var ci = 0; ci < CHARS.length; ci++) {
          if (CHARS[ci].id !== sel.picked[0]) { sel.cur[1] = ci; break; }
        }
      }
      this.renderCharSelect();
    }
  },

  finishSelect: function () {
    var sel = this.select;
    if (!sel) return;
    this.applyChar(this.players[0], sel.picked[0] || 'naruto');
    if (!this.solo) this.applyChar(this.players[1], sel.picked[1] || 'sasuke');
    this.select = null;
    var cs = document.getElementById('charsel');
    if (cs) cs.style.display = 'none';
    this.newGame();
    if (this._beginGame) this._beginGame(false);
  },

  /* 选人界面的按键轮询（游戏没开始时由主循环调） */
  updateSelect: function (dt) {
    var sel = this.select;
    if (!sel || !sel.active) return;
    /* 谁在选就听谁的键（手柄自动映射到同一组键码上） */
    var k = sel.turn === 0
      ? { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', oks: ['KeyE', 'Space', 'KeyF'] }
      : { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', oks: ['Enter', 'ShiftRight', 'Period', 'Slash'] };
    sel.repT = Math.max(0, (sel.repT || 0) - dt);
    var cols = 4;
    var i = sel.cur[sel.turn];
    var step = 0;
    if (Input.pressed(k.left)) step = -1;
    else if (Input.pressed(k.right)) step = 1;
    else if (Input.pressed(k.up)) step = -cols;
    else if (Input.pressed(k.down)) step = cols;
    else if (sel.repT <= 0) {                       // 按住连续走（带间隔）
      if (Input.down(k.left)) step = -1;
      else if (Input.down(k.right)) step = 1;
      else if (Input.down(k.up)) step = -cols;
      else if (Input.down(k.down)) step = cols;
      if (step !== 0) sel.repT = 0.16;
    }
    if (step !== 0) {
      var ni = Math.max(0, Math.min(CHARS.length - 1, i + step));
      if (ni !== i) { sel.cur[sel.turn] = ni; this.renderCharSelect(); }
    }
    for (var q = 0; q < k.oks.length; q++) {
      if (Input.pressed(k.oks[q])) { this.confirmPick(); return; }
    }
  },

  renderCharSelect: function () {
    var sel = this.select;
    if (!sel) return;
    var head = document.getElementById('cs-head');
    if (head) {
      head.innerHTML = sel.turn === 0
        ? '<span style="color:#7DD3FC">🎮 P1 ' + (this.solo ? '（单人）' : '') + '选你的英雄</span> —— WASD 移动 · E 确认（也可以直接点卡片）'
        : '<span style="color:#F9A8D4">🎮 P2 选你的英雄</span> —— 方向键移动 · Enter 确认（也可以直接点卡片）';
    }
    var grid = document.getElementById('cs-grid');
    if (!grid) return;
    var cards = grid.children;
    for (var i = 0; i < cards.length && i < CHARS.length; i++) {
      var c = cards[i];
      c.classList.remove('cur-p1', 'cur-p2', 'taken');
      var badge = c.querySelector('.cc-badge');
      if (badge) { badge.className = 'cc-badge'; badge.textContent = ''; }
      if (sel.picked[0] === CHARS[i].id) {
        c.classList.add('taken');
        if (badge) { badge.className = 'cc-badge p1'; badge.textContent = 'P1'; }
      } else if (sel.picked[1] === CHARS[i].id) {
        c.classList.add('taken');
        if (badge) { badge.className = 'cc-badge p2'; badge.textContent = 'P2'; }
      }
      if (sel.cur[sel.turn] === i) c.classList.add(sel.turn === 0 ? 'cur-p1' : 'cur-p2');
    }
    var det = document.getElementById('cs-detail');
    if (det) {
      var ch = CHARS[sel.cur[sel.turn]];
      var bars = [
        ['速度', (ch.stats.speed - 155) / 40, '#4ADE80'],
        ['血量', (ch.stats.hp - 26) / 12, '#F87171'],
        ['攻击', (ch.stats.dmg - 0.85) / 0.4, '#FBBF24']
      ];
      var html = '<b style="color:#FDE68A">' + ch.icon + ' ' + ch.name + '</b>' +
        '<span style="color:#8CA9C8">（' + ch.src + ' · ' + ch.tag + '）</span> —— ' + ch.perk +
        '<div class="cs-bars">';
      for (var b = 0; b < bars.length; b++) {
        var pct = Math.round(Math.max(0.06, Math.min(1, bars[b][1])) * 100);
        html += '<div class="cs-bar"><div class="lbl">' + bars[b][0] + '</div><div class="track"><div class="fill" style="width:' + pct + '%;background:' + bars[b][2] + '"></div></div></div>';
      }
      det.innerHTML = html + '</div>';
    }
  },

  /* 首页：有没有存档，决定「继续冒险」那颗按钮出不出现 */
  refreshStart: function () {
    var cont = document.getElementById('btn-continue');
    var info = document.getElementById('continue-info');
    var has = (typeof Save !== 'undefined') && Save.has();
    if (cont) cont.style.display = has ? '' : 'none';
    if (info) info.textContent = has ? ('上次玩到：' + Save.summary()) : '';
  },

  /* 开新档：世界、背包、任务全部归零 */
  newGame: function () {
    World.chunks = {}; World.stats.chunks = 0; World.taken = {};
    this.layer = 0; this.time = 0; this.day = 1;
    this.mobs = []; this.drops = []; this.bullets = []; this.balls = [];
    this.explosions = []; this.vehicles = []; this.baits = []; this.pops = [];
    this.messages = [];
    this.nightDeaths = 0; this.spawnTimer = 3; this.critterTimer = 8;
    this.panel = -1; this.questPanel = -1; this.questOffer = null; this.dragonWish = null;
    this.invHold = null;
    if (typeof Save !== 'undefined') { Save.t = 0; Save.flash = 0; }
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      p.inv = makeInv(20);
      p.wlv = {}; p.pets = [];
      p.hp = p.maxhp; p.food = p.maxfood;
      p.alive = true; p.respawn = 0;
      p.riding = null; p.fused = null; p.following = null;
      p.burn = 0; p.slow = 0; p.vx = 0; p.vy = 0; p.sel = 0;
      p.x = (i === 0 ? -22 : 22); p.y = TILE / 2;
      p.safeX = p.x; p.safeY = p.y;
      if (typeof Quest !== 'undefined' && Quest.give) Quest.give(p);
    }
  },

  /* 顶部按钮：保存状态（每 4 帧刷一次，和 HUD 同步） */
  updateTopbar: function () {
    var el = document.getElementById('save-tip');
    if (!el) return;
    var t = (typeof Save !== 'undefined' && Save.flash > 0)
      ? '💾 已自动保存'
      : '💾 每 20 秒自动存一次';
    if (t !== this._saveTip) { this._saveTip = t; el.textContent = t; }
  },

  /* ---------- 大扫除自愈：连续多帧出错 / 坐标漂了之后恢复用 ---------- */
  selfHeal: function () {
    function fix(e, sx, sy) {
      if (!isFinite(e.x)) e.x = isFinite(sx) ? sx : 0;
      if (!isFinite(e.y)) e.y = isFinite(sy) ? sy : 0;
      if (isFinite(e.x)) e.vx = 0;
      if (isFinite(e.y)) e.vy = 0;
    }
    for (var i = 0; i < this.players.length; i++) fix(this.players[i], this.players[i].safeX, this.players[i].safeY);
    for (var m = 0; m < this.mobs.length; m++) fix(this.mobs[m], this.players[0] ? this.players[0].x : 0, this.players[0] ? this.players[0].y : 0);
    for (var v = 0; v < this.vehicles.length; v++) fix(this.vehicles[v], 0, 0);
    this.bullets = this.bullets.filter(function (b) { return isFinite(b.x) && isFinite(b.y); });
    this.balls = this.balls.filter(function (b) { return isFinite(b.x) && isFinite(b.y); });
    this.drops = this.drops.filter(function (b) { return isFinite(b.x) && isFinite(b.y); });
    this.baits = this.baits.filter(function (b) { return isFinite(b.x) && isFinite(b.y); });
    this.explosions = [];
    if (!isFinite(this.cam.x) || !isFinite(this.cam.y) || !isFinite(this.cam.zoom)) {
      this.cam.x = 0; this.cam.y = 0; this.cam.zoom = 1;
    }
    if (!isFinite(this.time)) this.time = 0;
    this.say('🔧 做了一次紧急修复，游戏继续');
  },

  /* ---------- 每帧 ---------- */
  update: function (dt) {
    /* 坐标健康检查：万一哪里算出 NaN/Infinity，画面会整体消失（黑屏）。
       每帧只查两个玩家，代价可以忽略；漂了就拉回安全点。 */
    for (var gi = 0; gi < this.players.length; gi++) {
      var gp = this.players[gi];
      if (!isFinite(gp.x) || !isFinite(gp.y)) {
        gp.x = isFinite(gp.safeX) ? gp.safeX : TILE / 2;
        gp.y = isFinite(gp.safeY) ? gp.safeY : TILE / 2;
        gp.vx = 0; gp.vy = 0;
        gp.safeX = gp.x; gp.safeY = gp.y;
        this.say('⚠️ ' + gp.name + ' 的坐标飘了，已拉回安全点');
      }
    }
    if (typeof Gamepad !== 'undefined') Gamepad.poll();
    if (typeof Save !== 'undefined') Save.tick(dt);       // 到点自动存档
    // 挑战面板优先（暂停世界）
    if (Challenges.active) {
      Challenges.update(dt);
      if (Input.pressed('Escape') && !Challenges.check()) Challenges.finish(false);
      this.updateMessages(dt);
      return;
    }
    if (Input.pressed('KeyR') && !(typeof Realm !== 'undefined' && Realm.active)) this.restartDay();

    // 任务弹窗（暂停世界，先看完说明再决定接不接）
    if (this.questOffer) { this.updateQuestOffer(); this.updateMessages(dt); return; }
    // 星龙许愿（暂停世界）
    if (this.dragonWish) { this.updateDragonWish(); this.updateMessages(dt); return; }
    // 通关抽奖（暂停世界）
    if (this.lottery) { this.updateLottery(dt); this.updateMessages(dt); return; }
    if (Input.pressed('KeyH')) document.body.classList.toggle('nohint');   // 收起按键提示

    // 合成面板 / 任务本 切换
    for (var pi = 0; pi < this.players.length; pi++) {
      var pc = this.players[pi].ctl;
      if (Input.pressed(pc.craft)) { this.panel = (this.panel === pi) ? -1 : pi; this.questPanel = -1; }
      if (Input.pressed(pc.quest)) { this.questPanel = (this.questPanel === pi) ? -1 : pi; this.panel = -1; }
    }
    if (Input.pressed('Escape') && !this.invHold) { this.panel = -1; this.questPanel = -1; }

    if (this.panel >= 0) { this.handleCraftKeys(); this.updateMessages(dt); return; }
    if (this.questPanel >= 0) { this.updateMessages(dt); return; }

    this.time += dt;
    if (Math.floor(this.time / this.dayLen) + 1 !== this.day) {
      this.day = Math.floor(this.time / this.dayLen) + 1;
      this.say('第 ' + this.day + ' 天开始了');
    }
    // 天一亮，夜里的死亡计数清零
    if (this.phase().name === '白天' && this.lastPhase !== '白天') this.nightDeaths = 0;
    this.lastPhase = this.phase().name;

    for (var i = 0; i < this.players.length; i++) {
      this.players[i].update(dt);
      this.hotbarKeys(this.players[i]);
    }

    var inRealm = (typeof Realm !== 'undefined' && Realm.active);
    if (inRealm) {
      /* 异空间：不刷野怪、不刷地面拾取物，只跑场上这些东西 */
      Realm.update(dt, this.players);
      this.updateMobs(dt);
      this.updateDrops(dt);
      this.updateBullets(dt);
      this.updateBalls(dt);
      this.updateExplosions(dt);
    } else if (Maze.active) {
      Maze.update(dt, this.players);
      if (Maze.finished) this.exitMaze();
    } else {
      this.updateMobs(dt);
      this.updateDrops(dt);
      this.updateBaits(dt);
      this.updateVehicles(dt);
      this.updatePickups(dt);
      this.updateBullets(dt);
      this.updateBalls(dt);
      this.updateExplosions(dt);
      for (var q = 0; q < this.players.length; q++) {
        Quest.onExplore(this.players[q], Math.hypot(this.players[q].x, this.players[q].y) / TILE);
      }
      this.gcTick -= dt;
      if (this.gcTick <= 0) { this.gcTick = 3; World.gc(this.players, this.layer); }
    }

    /* 地上的星曜石画几颗星？按“最近玩家还缺哪颗”来定（0.5 秒算一次，别每帧扫背包） */
    this._ballTick = (this._ballTick || 0) - dt;
    if (this._ballTick <= 0) {
      this._ballTick = 0.5;
      this.missBall = (typeof missingBalls === 'function' ? (missingBalls(this.players[0])[0] || 1) : 1);
    }
    this.updateCam();
    this.updateMessages(dt);
  },

  hotbarKeys: function (p) {
    if (!p.ctl.slots) return;
    for (var i = 0; i < p.ctl.slots.length; i++) {
      if (Input.pressed(p.ctl.slots[i])) p.sel = i;
    }
  },

  /* ---------- 子弹 / 爆炸 ---------- */
  updateBullets: function (dt) {
    for (var i = this.bullets.length - 1; i >= 0; i--) {
      var b = this.bullets[i];
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0) { this.bullets.splice(i, 1); continue; }
      var tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
      if (this.solidAt(tx, ty)) {
        if (b.shell) this.explode(b.x, b.y, 1.7, b.owner, true);   // 炮弹撞墙也炸
        this.bullets.splice(i, 1); continue;
      }
      /* 敌方子弹（炎魔的火球）：打玩家 / 打车 */
      if (b.hostile) {
        var got = false;
        for (var pi = 0; pi < this.players.length && !got; pi++) {
          var pl = this.players[pi];
          if (!pl.alive) continue;
          if (dist(pl.x, pl.y, b.x, b.y) < 16) {
            if (pl.riding && !pl.riding.dead) pl.riding.hurt(b.dmg);
            else pl.hurt(b.dmg, b.x, b.y);
            if (b.burn && pl.alive) pl.burn = Math.max(pl.burn || 0, 1.8);
            got = true;
          }
        }
        if (got) { this.bullets.splice(i, 1); continue; }
      }
      var hit = false;
      for (var m = 0; m < this.mobs.length; m++) {
        var mo = this.mobs[m];
        if (!mo.alive) continue;
        if (b.hostile) { if (!mo.ally) continue; }       // 火球只打自己人
        else if (mo.ally) continue;                      // 自己人不打
        if (dist(mo.x, mo.y, b.x, b.y) < mo.r + b.size + 3) {
          mo.hurt(b.dmg, b.x, b.y, b.owner);
          if (b.shell) this.explode(b.x, b.y, 1.7, b.owner, true);
          hit = true; break;
        }
      }
      if (hit) this.bullets.splice(i, 1);
    }
  },

  /* 爆炸：炸光周围物件、伤害怪物、留下掉落（quiet = 不弹提示，炮弹用） */
  explode: function (x, y, radiusTiles, owner, quiet) {
    var r = Math.ceil(radiusTiles);
    var cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (var ty = cy - r; ty <= cy + r; ty++) {
      for (var tx = cx - r; tx <= cx + r; tx++) {
        if (dist(tx * TILE + 16, ty * TILE + 16, x, y) > radiusTiles * TILE) continue;
        var o = this.objAt(tx, ty);
        if (!o || o === O.NONE || o === O.BEDROCK) continue;
        var def = ODEF[o];
        this.setObj(tx, ty, O.NONE);
        if (def.drop && Math.random() < 0.5) {
          this.drops.push({ x: tx * TILE + 16, y: ty * TILE + 16, id: def.drop, n: 1, life: 40 });
        }
      }
    }
    for (var i = 0; i < this.mobs.length; i++) {
      var m = this.mobs[i];
      if (!m.alive || m.ally) continue;          // 别炸到自己人
      var d = dist(m.x, m.y, x, y);
      if (d < radiusTiles * TILE) m.hurt(60, x, y, owner || null);
    }
    this.explosions.push({ x: x, y: y, r: radiusTiles * TILE, t: 0 });
    if (!quiet) this.say('💥 复活冲击波：周围的东西被炸光了');
  },

  /* ---------- 附魔土豆 / 僵尸小队 ---------- */
  throwBait: function (p, id) {
    if (Maze.active) { this.say('迷宫里先留着土豆，出去再用'); return false; }
    var ft = p.frontTile();
    var bx = ft.tx * TILE + 16, by = ft.ty * TILE + 16;
    if (this.solidAt(ft.tx, ft.ty)) { bx = p.x; by = p.y; }
    this.baits.push({ x: bx, y: by, life: 50, owner: p });
    while (this.baits.length > 8) this.baits.shift();
    this.say(p.name + ' 扔出一颗' + ITEMS[id].name + ' 🌈 —— 附近的僵尸会过来吃');
    return true;
  },

  /* 换层的时候把僵尸小队一起带过去（不然它们会留在另一层的坐标上） */
  bringAllies: function () {
    var p = this.players[0];
    for (var i = 0; i < this.mobs.length; i++) {
      var m = this.mobs[i];
      if (!m.ally || !m.alive) continue;
      m.x = p.x + (Math.random() - 0.5) * 90;
      m.y = p.y + (Math.random() - 0.5) * 90;
      unstick(m);
      m.patrolTo = null;
    }
  },

  baitNear: function (x, y) {
    var best = null, bd = this.BAIT_LURE * TILE;
    for (var i = 0; i < this.baits.length; i++) {
      var d = dist(this.baits[i].x, this.baits[i].y, x, y);
      if (d < bd) { bd = d; best = this.baits[i]; }
    }
    return best;
  },

  allyCount: function () {
    var n = 0;
    for (var i = 0; i < this.mobs.length; i++) if (this.mobs[i].ally && this.mobs[i].alive) n++;
    return n;
  },
  robotCount: function () {
    var n = 0;
    for (var i = 0; i < this.mobs.length; i++) if (this.mobs[i].robot && this.mobs[i].alive) n++;
    return n;
  },

  /* ---------- 机器人守护者 ---------- */
  summonGuardian: function (p, type) {
    if (Maze.active) { this.say('迷宫里召唤不了守护者'); return false; }
    if (this.allyCount() >= this.maxAllies) { this.say('守护者太多了（上限 ' + this.maxAllies + ' 个）'); return false; }
    if (this.robotCount() >= 4) { this.say('机器人最多只能有 4 个'); return false; }
    var spot = null;
    for (var rad = 1; rad <= 3 && !spot; rad++) {
      for (var a = 0; a < 12; a++) {
        var ang = a / 12 * 6.283;
        var sx = Math.floor(p.x / TILE) + Math.round(Math.cos(ang) * rad);
        var sy = Math.floor(p.y / TILE) + Math.round(Math.sin(ang) * rad);
        if (this.solidAt(sx, sy)) continue;
        var fd = FDEF[this.floorAt(sx, sy)];
        if (fd && (fd.void_ || fd.hole || fd.lava)) continue;
        spot = { x: sx * TILE + 16, y: sy * TILE + 16 };
        break;
      }
    }
    if (!spot) { this.say('这里太挤了，换个空地召唤'); return false; }
    var m = new Mob('robot', spot.x, spot.y);
    m.ally = true; m.leader = p; m.recruiter = p; m.robot = true;
    this.mobs.push(m);
    this.pops.push({ x: spot.x, y: spot.y, t: 0 });
    this.say('🤖 ' + p.name + ' 召唤了机器人守护者！它会跟着你、替你远程打怪');
    return true;
  },

  /* ---------- 七星曜石 ---------- */
  /* 捡到/开箱时给一颗“还缺的”星曜石（已经有的就不再给重复的） */
  grantDragonBall: function (p) {
    var miss = missingBalls(p);
    if (!miss.length) { this.say(p.name + ' 已经有全套星曜石了'); return false; }
    var n = miss[Math.floor(Math.random() * miss.length)];
    Inv.add(p.inv, 'db' + n, 1);
    var left = missingBalls(p).length;
    if (left === 0) this.say('🌟 ' + p.name + ' 集齐了七颗星曜石！按使用键（' + (p.ctl.use === 'KeyF' ? 'F' : '/') + '）召唤星龙许愿！');
    else this.say('🌟 ' + p.name + ' 找到 ' + ITEMS['db' + n].name + '（还差 ' + left + ' 颗）');
    return true;
  },

  dragonWish: null,             // 星龙许愿面板
  summonDragon: function (p) {
    if (this.dragonWish) return;
    if (!hasAllBalls(p)) return;
    this.dragonWish = { p: p, sel: 0 };
    this.say('🐉 星龙出现了！' + p.name + '，许一个愿吧（1-5 或鼠标点）');
  },

  WISHES: [
    {
      name: '两个机器人守护者',
      desc: '立刻召唤 2 个机器人，永久替你打架',
      run: function (p) {
        Game.summonGuardian(p, 'robot');
        Game.summonGuardian(p, 'robot');
      }
    },
    {
      name: '满血 + 一堆补给',
      desc: '两人回满血饱食度，再给药箱 ×5、火把 ×20',
      run: function (p) {
        for (var i = 0; i < Game.players.length; i++) {
          Game.players[i].hp = Game.players[i].maxhp;
          Game.players[i].food = Game.players[i].maxfood;
          Game.players[i].burn = 0;
        }
        Inv.add(p.inv, 'kit', 5);
        Inv.add(p.inv, 'torch', 20);
      }
    },
    {
      name: '一辆坦克 + 一辆挖掘机',
      desc: '还能再送一挺机枪',
      run: function (p) { Inv.add(p.inv, 'tank', 1); Inv.add(p.inv, 'excavator', 1); Inv.add(p.inv, 'mgun', 1); }
    },
    {
      name: '清空敌人 + 立刻天亮',
      desc: '周围所有怪物消失，时间跳到白天',
      run: function (p) { Game.restartDay(true, true); }
    },
    {
      name: '一箱财宝',
      desc: '铁 ×20、金 ×12、木板 ×40、附魔土豆 ×2',
      run: function (p) {
        Inv.add(p.inv, 'iron', 20); Inv.add(p.inv, 'gold', 12);
        Inv.add(p.inv, 'plank', 40); Inv.add(p.inv, 'epotato', 2);
      }
    }
  ],

  updateDragonWish: function () {
    var w = this.dragonWish;
    if (!w) return;
    for (var i = 0; i < this.WISHES.length && i < 9; i++) {
      if (Input.pressed('Digit' + (i + 1))) { this.doWish(i); return; }
    }
    if (Input.pressed('Escape')) { this.dragonWish = null; this.say('星龙先回去了（星曜石还在你身上）'); }
  },

  doWish: function (i) {
    var w = this.dragonWish;
    if (!w || !this.WISHES[i]) return;
    var p = w.p;
    consumeBalls(p);
    this.WISHES[i].run(p);
    this.dragonWish = null;
    this.say('🐉 星龙实现了「' + this.WISHES[i].name + '」，星曜石散落回世界各地…');
    for (var k = 0; k < 3; k++) this.pops.push({ x: p.x, y: p.y, t: 0 });
  },

  drawDragonWish: function () {
    var w = this.dragonWish;
    if (!w) return;
    var p = w.p;
    var W2 = 520, H2 = 400;
    var x = (this.W - W2) / 2, y = (this.H - H2) / 2;
    ctx.fillStyle = 'rgba(8,16,28,.95)';
    rrect(ctx, x, y, W2, H2, 20); ctx.fill();
    ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 3;
    rrect(ctx, x, y, W2, H2, 20); ctx.stroke();
    /* 顶上一条星龙（简笔画） */
    ctx.save();
    ctx.translate(x + W2 / 2, y + 54);
    var sway = Math.sin(this.time * 2) * 6;
    ctx.fillStyle = '#22C55E';
    ctx.fillRect(-90 + sway, -6, 26, 12);
    for (var s = 0; s < 7; s++) {
      var sx2 = -70 + s * 24, sy2 = Math.sin(this.time * 3 + s * 0.7) * 7;
      ctx.fillStyle = s % 2 ? '#16A34A' : '#22C55E';
      ctx.beginPath(); ctx.ellipse(sx2, sy2, 13, 9, 0, 0, 6.283); ctx.fill();
    }
    ctx.fillStyle = '#15803D';
    ctx.beginPath(); ctx.arc(96 + sway, 0, 15, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#FDE047';
    ctx.beginPath(); ctx.arc(101 + sway, -4, 3.4, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.moveTo(94 + sway, -14); ctx.lineTo(88 + sway, -26); ctx.lineTo(100 + sway, -18);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🐉 星龙：说出你的愿望', x + W2 / 2, y + 108);
    ctx.font = '13px sans-serif'; ctx.fillStyle = '#8CA9C8';
    ctx.fillText(p.name + ' 集齐了七颗星曜石 · 按 1-5 或点击选择（Esc 先不要）', x + W2 / 2, y + 130);
    ctx.textAlign = 'left';
    for (var i = 0; i < this.WISHES.length; i++) {
      var wy = y + 150 + i * 48;
      var hover = this.mouse.x >= x + 18 && this.mouse.x <= x + W2 - 18 && this.mouse.y >= wy && this.mouse.y <= wy + 40;
      ctx.fillStyle = hover ? 'rgba(251,191,36,.20)' : 'rgba(30,48,74,.75)';
      rrect(ctx, x + 18, wy, W2 - 36, 40, 10); ctx.fill();
      ctx.strokeStyle = hover ? '#FBBF24' : '#35618F'; ctx.lineWidth = 2;
      rrect(ctx, x + 18, wy, W2 - 36, 40, 10); ctx.stroke();
      ctx.fillStyle = '#FDE68A'; ctx.font = 'bold 15px sans-serif';
      ctx.fillText((i + 1) + '. ' + this.WISHES[i].name, x + 34, wy + 17);
      ctx.fillStyle = '#8CA9C8'; ctx.font = '12px sans-serif';
      ctx.fillText(this.WISHES[i].desc, x + 34, wy + 33);
    }
  },

  wishHit: function (mx, my) {
    var W2 = 520, H2 = 400;
    var x = (this.W - W2) / 2, y = (this.H - H2) / 2;
    for (var i = 0; i < this.WISHES.length; i++) {
      var wy = y + 150 + i * 48;
      if (mx >= x + 18 && mx <= x + W2 - 18 && my >= wy && my <= wy + 40) return i;
    }
    return -1;
  },

  /* ---------- 通关抽奖（益智神殿 / 竞技场走出口时开） ---------- */
  lottery: null,                  // { p, kind, cells, target, t, dur, steps, phase, fx }
  openLottery: function (p, kind) {
    if (this.lottery) return;
    var self = this;
    var wpool = (kind === 'arena') ? ['dagger', 'pistol', 'ssword', 'mgun', 'tank'] : ['dagger', 'pistol', 'ssword', 'waxe', 'spick'];
    var wid = wpool[Math.floor(Math.random() * wpool.length)];
    var cells = [
      { icon: 'dball',  label: '星曜石 ×1',   w: 12, run: function () { if (!Game.grantDragonBall(p)) Inv.give(p, 'gold', 8); } },
      { icon: 'gold',   label: '金子 ×10',  w: 14, run: function () { Inv.give(p, 'gold', 10); } },
      { icon: 'kit',    label: '药箱 ×4',   w: 14, run: function () { Inv.give(p, 'kit', 4); } },
      { icon: 'iron',   label: '铁 ×8',     w: 14, run: function () { Inv.give(p, 'iron', 8); } },
      { icon: 'cball',  label: '驯灵环 ×3', w: 12, run: function () { Inv.give(p, 'cball', 3); } },
      { icon: 'epotato',label: '附魔土豆 ×2',w: 10, run: function () { Inv.give(p, 'epotato', 2); } },
      { icon: wid,      label: '神秘装备',   w: 14, run: function () { Inv.give(p, wid, 1); } },
      { icon: 'robot',  label: '机器人 ×1',  w: 8,  run: function () { Inv.give(p, 'robot', 1); } }
    ];
    /* 加权抽一个，转盘转过去正好停在上面 */
    var sum = 0;
    for (var i = 0; i < cells.length; i++) sum += cells[i].w;
    var roll = Math.random() * sum, target = 0;
    for (var j = 0; j < cells.length; j++) { roll -= cells[j].w; if (roll <= 0) { target = j; break; } }
    this.lottery = {
      p: p, kind: kind, cells: cells,
      target: target,
      t: 0, dur: 3.0,
      steps: cells.length * 2 + target + 3,   // 至少转两圈多一点，正好落在 target
      phase: 'spin', fx: 0
    };
    this.say('🎰 通关了！转盘抽奖 —— 稍等它停下来…');
  },

  updateLottery: function (dt) {
    var L = this.lottery;
    if (!L) return;
    if (L.phase === 'spin') {
      L.t += dt;
      if (L.t >= L.dur) {
        L.t = L.dur; L.phase = 'done'; L.fx = 0;
        this.say('🎉 抽到了「' + L.cells[L.target].label + '」！');
      }
      return;
    }
    /* 停稳了：按交互键 / 攻击键 / 鼠标点 收下走人 */
    L.fx += dt;
    if (Input.pressed(L.p.ctl.use) || Input.pressed(L.p.ctl.mine) ||
        Input.pressed('Space') || Input.pressed('Enter')) { this.finishLottery(); }
  },

  finishLottery: function () {
    var L = this.lottery;
    if (!L || L.phase !== 'done') return;
    var cell = L.cells[L.target];
    cell.run();
    this.lottery = null;
    if (typeof Realm !== 'undefined' && Realm.active) Realm.leave();
    for (var k = 0; k < 6; k++) this.pops.push({ x: L.p.x, y: L.p.y, t: -k * 0.08 });
  },

  /* 转盘当前高亮到哪一格 */
  lotteryIdx: function () {
    var L = this.lottery;
    if (L.phase === 'done') return L.target;
    var k = L.t / L.dur;
    var e = 1 - Math.pow(1 - k, 3);            // easeOutCubic：先快后慢
    return Math.floor(e * L.steps) % L.cells.length;
  },

  drawLottery: function () {
    var L = this.lottery;
    if (!L) return;
    var W2 = 480, H2 = 330;
    var x = (this.W - W2) / 2, y = (this.H - H2) / 2;
    ctx.fillStyle = 'rgba(8,16,28,.95)';
    rrect(ctx, x, y, W2, H2, 20); ctx.fill();
    ctx.strokeStyle = L.phase === 'done' ? '#FBBF24' : '#A78BFA';
    ctx.lineWidth = 3;
    rrect(ctx, x, y, W2, H2, 20); ctx.stroke();
    ctx.fillStyle = '#FDE68A'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(L.phase === 'spin' ? '🎰 幸运转盘 · 转动中…' : '🎰 抽到了！', x + W2 / 2, y + 40);
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#8CA9C8';
    ctx.fillText(L.kind === 'puzzle' ? '益智神殿通关奖励' : '试炼竞技场通关奖励', x + W2 / 2, y + 60);
    ctx.textAlign = 'left';
    /* 4×2 奖品格 */
    var cols = 4, cw = 100, ch = 92, gx = x + (W2 - cols * cw) / 2, gy = y + 78;
    var hi = this.lotteryIdx();
    for (var i = 0; i < L.cells.length; i++) {
      var cx = gx + (i % cols) * cw, cy = gy + Math.floor(i / cols) * ch;
      var on = (i === hi);
      var win = (L.phase === 'done' && i === L.target);
      ctx.fillStyle = win ? 'rgba(251,191,36,.30)' : (on ? 'rgba(167,139,250,.25)' : 'rgba(30,48,74,.75)');
      rrect(ctx, cx + 4, cy + 4, cw - 8, ch - 8, 12); ctx.fill();
      ctx.strokeStyle = win ? '#FBBF24' : (on ? '#C4B5FD' : '#35618F');
      ctx.lineWidth = win || on ? 3 : 1.5;
      rrect(ctx, cx + 4, cy + 4, cw - 8, ch - 8, 12); ctx.stroke();
      drawItemIcon(ctx, L.cells[i].icon === 'dball' ? ('db' + (this.missBall || 1)) : L.cells[i].icon, cx + cw / 2 - 18, cy + 14, 36);
      ctx.fillStyle = '#DCE9F7'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(L.cells[i].label, cx + cw / 2, cy + ch - 14);
      ctx.textAlign = 'left';
      if (win) {                                 /* 中奖格上的星星 */
        ctx.fillStyle = '#FDE047'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('★', cx + cw / 2, cy + 16 + Math.sin(this.time * 5) * 3);
        ctx.textAlign = 'left';
      }
    }
    if (L.phase === 'done') {
      var a = 0.6 + 0.4 * Math.sin(this.time * 4);
      ctx.fillStyle = 'rgba(190,242,100,' + a + ')'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
      var useName = L.p.ctl.use === 'KeyF' ? 'F' : '/';
      ctx.fillText('按 ' + useName + ' / 空格 收下奖励回家', x + W2 / 2, y + H2 - 18);
      ctx.textAlign = 'left';
    }
  },

  lotteryHit: function (mx, my) {
    var L = this.lottery;
    if (!L) return false;
    var W2 = 480, H2 = 330;
    var x = (this.W - W2) / 2, y = (this.H - H2) / 2;
    if (mx < x || mx > x + W2 || my < y || my > y + H2) return true;   // 面板开着时鼠标事件都吞掉
    if (L.phase === 'done') this.finishLottery();
    return true;
  },

  /* 僵尸吃到土豆 → 倒戈进小队 */
  feedBait: function (mob, bait) {
    var idx = this.baits.indexOf(bait);
    if (idx < 0) return;                         // 已经被别的僵尸吃了
    this.baits.splice(idx, 1);
    if (!mob.alive || mob.ally) return;
    var n = this.allyCount();
    if (n >= this.maxAllies) {
      this.say('僵尸小队满了（' + this.maxAllies + ' 个），这颗土豆白扔了');
      return;
    }
    mob.ally = true;
    mob.recruiter = bait.owner || null;
    mob.hp = mob.maxhp;
    mob.atkCd = 0.4;
    mob.patrolTo = null;
    this.pops.push({ x: mob.x, y: mob.y, t: 0 });
    this.say('🌈 ' + mob.label + ' 吃了附魔土豆，加入你的僵尸小队！（' + (n + 1) + '/' + this.maxAllies + '）');
  },

  updateBaits: function (dt) {
    for (var i = this.baits.length - 1; i >= 0; i--) {
      this.baits[i].life -= dt;
      if (this.baits[i].life <= 0) this.baits.splice(i, 1);
    }
    for (var k = this.pops.length - 1; k >= 0; k--) {
      this.pops[k].t += dt;
      if (this.pops[k].t > 0.9) this.pops.splice(k, 1);
    }
  },

  drawBaits: function () {
    for (var i = 0; i < this.baits.length; i++) {
      var b = this.baits[i];
      var hue = (this.time * 90) % 360;
      var pulse = 0.5 + 0.5 * Math.sin(this.time * 3 + i);
      ctx.save();
      ctx.strokeStyle = 'hsla(' + hue + ',90%,66%,' + (0.09 + pulse * 0.11) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, this.BAIT_LURE * TILE, 0, 6.283); ctx.stroke();
      ctx.restore();
      var bob = Math.sin(this.time * 4 + i) * 3;
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.ellipse(b.x, b.y + 11, 9, 4, 0, 0, 6.283); ctx.fill();
      var g = ctx.createRadialGradient(b.x, b.y + bob, 1, b.x, b.y + bob, 19);
      g.addColorStop(0, 'rgba(255,255,255,.9)');
      g.addColorStop(0.45, 'hsla(' + hue + ',92%,66%,.5)');
      g.addColorStop(1, 'rgba(168,85,247,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y + bob, 19, 0, 6.283); ctx.fill();
      drawItemIcon(ctx, 'epotato', b.x - 11, b.y - 11 + bob, 22);
      if (b.life < 10) {                       // 快消失了会闪
        ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(this.time * 8));
        drawItemIcon(ctx, 'epotato', b.x - 11, b.y - 11 + bob, 22);
        ctx.globalAlpha = 1;
      }
    }
  },

  drawPops: function () {
    for (var i = 0; i < this.pops.length; i++) {
      var p = this.pops[i];
      var t = p.t / 0.9;
      if (p.kind === 'muzzle') {                  // 坦克炮口火焰
        var life = 1 - t;
        var len = 20 + life * 22;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = 'rgba(251,191,36,' + (life * 0.9) + ')';
        ctx.beginPath(); ctx.moveTo(0, -6 * life - 1); ctx.lineTo(len, 0); ctx.lineTo(0, 6 * life + 1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,237,160,' + (life * 0.85) + ')';
        ctx.beginPath(); ctx.arc(len * 0.55, 0, 5.5 * life + 1.5, 0, 6.283); ctx.fill();
        ctx.restore();
        continue;
      }
      for (var k = 0; k < 8; k++) {
        var a = k / 8 * 6.283 + p.t * 4;
        var r = 8 + t * 46;
        ctx.fillStyle = 'hsla(' + ((k * 45 + p.t * 220) % 360) + ',95%,68%,' + (1 - t) + ')';
        sparkle(ctx, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r - t * 20, 4 * (1 - t) + 1.5);
      }
    }
  },

  /* 这个格子上有没有人/怪/车（防止把方块放在实体身上） */
  tileOccupied: function (tx, ty) {
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (Math.floor(p.x / TILE) === tx && Math.floor(p.y / TILE) === ty) return true;
    }
    for (var m = 0; m < this.mobs.length; m++) {
      if (Math.floor(this.mobs[m].x / TILE) === tx && Math.floor(this.mobs[m].y / TILE) === ty) return true;
    }
    for (var v = 0; v < this.vehicles.length; v++) {
      if (Math.floor(this.vehicles[v].x / TILE) === tx && Math.floor(this.vehicles[v].y / TILE) === ty) return true;
    }
    return false;
  },

  /* ---------- 任务弹窗 ---------- */
  offerQuest: function (p) {
    this.questOffer = { p: p, q: Quest.make(), reroll: 0 };
  },

  updateQuestOffer: function () {
    var o = this.questOffer;
    if (!o) return;
    var p = o.p;
    if (Input.pressed('Digit1') || Input.pressed('Numpad1')) {    // 接受
      p.quest = o.q; p.quest.prog = 0; p.quest.done = false;
      this.questOffer = null;
      this.say(p.name + ' 接受了任务：' + Quest.label(p.quest));
      return;
    }
    if (Input.pressed('Digit2') || Input.pressed('Numpad2')) {    // 换一个
      o.reroll++;
      o.q = Quest.make();
      if (o.reroll >= 8) { this.questOffer = null; this.say('今天没有别的活儿了，下次再来'); }
      return;
    }
    if (Input.pressed('Escape')) { this.questOffer = null; return; }
    if (Input.pressed(p.ctl.use)) { p.quest = o.q; p.quest.prog = 0; p.quest.done = false; this.questOffer = null; return; }
  },

  drawQuestOffer: function () {
    var o = this.questOffer;
    if (!o) return;
    var p = o.p, q = o.q;
    var w = 460, h = 300, x = (this.W - w) / 2, y = (this.H - h) / 2;
    ctx.fillStyle = 'rgba(8,16,28,.95)';
    rrect(ctx, x, y, w, h, 18); ctx.fill();
    ctx.strokeStyle = p.color; ctx.lineWidth = 3;
    rrect(ctx, x, y, w, h, 18); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = p.color; ctx.font = 'bold 20px sans-serif';
    ctx.fillText('📜 新任务', x + 24, y + 38);
    ctx.fillStyle = '#E8F1FF'; ctx.font = 'bold 17px sans-serif';
    ctx.fillText(q.d.text.replace('{n}', q.target), x + 24, y + 78);
    ctx.font = '14px sans-serif'; ctx.fillStyle = '#9BB4D0';
    var desc = {
      collect: '去地上挖 / 捡，捡够了回来交。',
      hunt: '夜里怪物多，拿上武器去打（有枪会自动开火）。',
      explore: '一直往一个方向走，走得越远越好。',
      build: '按 E（P2 是右Shift）把木板放在身前，搭够数量。',
      maze: '去挖紫色的符文石，掉进迷宫后两个人配合通关。'
    }[q.d.kind] || '';
    ctx.fillText(desc, x + 24, y + 108);
    ctx.fillStyle = '#FBBF24'; ctx.font = '14px sans-serif';
    ctx.fillText('完成后奖励：', x + 24, y + 146);
    var rtxt = q.d.rew.map(function (r) { return ITEMS[r.id].name + '×' + r.n; }).join('、');
    if (q.d.kind === 'hunt' || q.d.kind === 'maze') rtxt += '（还有机会抽到载具）';
    ctx.fillStyle = '#FDE68A';
    ctx.fillText(rtxt, x + 24, y + 170);
    ctx.fillStyle = '#BFD6F0'; ctx.font = '15px sans-serif';
    ctx.fillText('按 1 接受任务    按 2 换一个    Esc 不要', x + 24, y + 222);
    ctx.fillStyle = '#6E8CA8'; ctx.font = '13px sans-serif';
    ctx.fillText('（已换 ' + o.reroll + ' 次）', x + 24, y + 250);
  },

  drawQuestList: function (p) {
    var w = 420, h = 260, x = (this.W - w) / 2, y = (this.H - h) / 2;
    ctx.fillStyle = 'rgba(8,16,28,.95)';
    rrect(ctx, x, y, w, h, 18); ctx.fill();
    ctx.strokeStyle = '#FBBF24'; ctx.lineWidth = 3;
    rrect(ctx, x, y, w, h, 18); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = p.color; ctx.font = 'bold 20px sans-serif';
    ctx.fillText(p.name + ' 的任务本', x + 22, y + 36);
    if (!p.quest) {
      ctx.fillStyle = '#9BB4D0'; ctx.font = '15px sans-serif';
      ctx.fillText('目前没有任务。去任务长老（紫袍小人）那儿按 F / 领一个。', x + 22, y + 76);
    } else {
      var q = p.quest;
      ctx.fillStyle = '#E8F1FF'; ctx.font = 'bold 17px sans-serif';
      ctx.fillText(q.d.text.replace('{n}', q.target), x + 22, y + 76);
      ctx.fillStyle = '#86EFAC'; ctx.font = '15px sans-serif';
      ctx.fillText('进度：' + Math.min(q.prog, q.target) + ' / ' + q.target + (q.done ? '  ✅ 可以回去交付了' : ''), x + 22, y + 106);
      // 进度条
      ctx.fillStyle = '#223'; ctx.fillRect(x + 22, y + 118, w - 44, 12);
      ctx.fillStyle = '#65A30D';
      ctx.fillRect(x + 22, y + 118, (w - 44) * Math.min(1, q.prog / q.target), 12);
      ctx.fillStyle = '#FBBF24'; ctx.font = '14px sans-serif';
      var rtxt = q.d.rew.map(function (r) { return ITEMS[r.id].name + '×' + r.n; }).join('、');
      ctx.fillText('奖励：' + rtxt, x + 22, y + 164);
    }
    ctx.fillStyle = '#9BB4D0'; ctx.font = '13px sans-serif';
    ctx.fillText('已完成任务：' + (p.questDone || 0) + ' 个', x + 22, y + 200);
    ctx.fillStyle = '#6E8CA8';
    ctx.fillText('按 ' + (p.id === 0 ? 'Q' : 'L') + ' 或 Esc 关闭', x + 22, y + 228);
  },

  /* ---------- 回到白天 ---------- */
  restartDay: function (auto, silent) {
    this.time = Math.floor(this.time / this.dayLen) * this.dayLen + 12;
    /* 僵尸小队是自己人，天亮不清走；顺手给他们回满血 */
    var keep = [];
    for (var k = 0; k < this.mobs.length; k++) {
      var m = this.mobs[k];
      if (m.ally && m.alive) { m.hp = m.maxhp; keep.push(m); }
    }
    this.mobs = keep;
    this.bullets.length = 0;
    this.nightDeaths = 0;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      p.hp = p.maxhp; p.food = p.maxfood;
      p.alive = true; p.respawn = 0; p.hurtCd = 1;
      if (p.riding) { p.riding.driver = null; p.riding = null; }
    }
    if (!silent) this.say(auto
      ? '🌤️ 夜里摔了太多次 —— 天亮了，怪物清干净，两人都活过来了'
      : '🌤️ 天亮了：怪物清干净，两人满血（背包和房子都留着）');
  },

  handleCraftKeys: function () {
    var p = this.players[this.panel];
    var i;
    // 合成（1-9 / 0，第 11 个往后用鼠标点）
    for (i = 0; i < RECIPES.length && i < 10; i++) {
      var code = i < 9 ? 'Digit' + (i + 1) : 'Digit0';
      if (Input.pressed(code) || Input.pressed('Numpad' + ((i + 1) % 10))) this.tryCraft(p, i);
    }
    this.handleInvKeys(p);
  },

  tryCraft: function (p, i) {
    var r = RECIPES[i];
    if (!r) return;
    if (Inv.canCraft(p.inv, r)) {
      Inv.craft(p.inv, r);
      this.say(p.name + ' 合成了 ' + ITEMS[r.out.id].name + ' ×' + r.out.n);
    } else {
      this.say('材料不够：' + r.tip);
    }
  },

  /* 配方行的点击热区（超过 10 个配方时只能靠点） */
  recipeHit: function (mx, my) {
    if (this.panel < 0) return -1;
    var w = 480, h = 560;
    var x = (this.W - w) / 2, y = Math.max(10, (this.H - h) / 2);
    if (mx < x || mx > x + w || my < y || my > y + h) return -1;
    for (var i = 0; i < RECIPES.length; i++) {
      var ry = y + 84 + i * 26;
      if (my >= ry - 18 && my <= ry + 7) return i;
    }
    return -1;
  },

  /* ---------- 背包整理：方向键选格子，空格/回车拿起放下，鼠标也能拖 ---------- */
  handleInvKeys: function (p) {
    var c = this.invCursor, cols = 10;
    var n = p.inv.length;
    if (c.i >= n) c.i = n - 1;
    if (Input.pressed('Escape')) {
      if (this.invHold) { this.dropHold(p); }        // 先把东西放回去，再按一次才关面板
      else { this.panel = -1; }
      return;
    }
    if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) c.i = Math.max(0, c.i - 1);
    if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) c.i = Math.min(n - 1, c.i + 1);
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) c.i = Math.max(0, c.i - cols);
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) c.i = Math.min(n - 1, c.i + cols);
    if (Input.pressed('Space') || Input.pressed('Enter')) this.invTake(p, c.i);
  },

  /* 拿起 / 放下 / 交换（交换时被换出的自动回原位） */
  invTake: function (p, idx) {
    if (idx < 0 || idx >= p.inv.length) return;
    if (!this.invHold) {
      if (p.inv[idx]) { this.invHold = p.inv[idx]; this.invHoldFrom = idx; p.inv[idx] = null; }
      return;
    }
    var cur = p.inv[idx];
    if (!cur) { p.inv[idx] = this.invHold; this.invHold = null; this.invHoldFrom = -1; return; }
    if (cur.id === this.invHold.id) { cur.count += this.invHold.count; this.invHold = null; this.invHoldFrom = -1; return; }
    p.inv[idx] = this.invHold;
    if (this.invHoldFrom >= 0 && this.invHoldFrom !== idx && !p.inv[this.invHoldFrom]) {
      p.inv[this.invHoldFrom] = cur;
      this.invHold = null;
    } else {
      this.invHold = cur;
    }
    this.invHoldFrom = -1;
  },

  dropHold: function (p) {
    if (!this.invHold) return;
    for (var i = 0; i < p.inv.length; i++) {
      if (!p.inv[i]) { p.inv[i] = this.invHold; this.invHold = null; return; }
    }
    // 背包满了就塞在光标处
    var idx = clamp(this.invCursor.i, 0, p.inv.length - 1);
    var out = Inv.put(p.inv, idx, this.invHold);
    this.invHold = out;
  },

  invLayout: function () {
    var w = 480, h = 560;
    var x = (this.W - w) / 2, y = Math.max(10, (this.H - h) / 2);
    var gy = y + 84 + RECIPES.length * 26 + 38;
    return { x: x, y: y, w: w, h: h, gx: x + 24, gy: gy, cell: 43, size: 38, cols: 10 };
  },

  invHit: function (mx, my) {
    if (this.panel < 0) return -1;
    var L = this.invLayout();
    var col = Math.floor((mx - L.gx) / L.cell), row = Math.floor((my - L.gy) / L.cell);
    if (col < 0 || row < 0 || col >= L.cols || row >= 2) return -1;
    var lx = mx - (L.gx + col * L.cell), ly = my - (L.gy + row * L.cell);
    if (lx > L.size || ly > L.size) return -1;
    var idx = row * L.cols + col;
    var p = this.players[this.panel];
    return (idx >= 0 && idx < p.inv.length) ? idx : -1;
  },

  pointerDown: function (mx, my) {
    this.pointerMove(mx, my);
    /* 星龙许愿：点选愿望 */
    if (this.dragonWish) {
      var wi = this.wishHit(mx, my);
      if (wi >= 0) this.doWish(wi);
      return;
    }
    /* 通关抽奖：点面板收下 */
    if (this.lottery) { this.lotteryHit(mx, my); return; }
    if (this.panel < 0) return;
    var ri = this.recipeHit(mx, my);
    if (ri >= 0) { this.tryCraft(this.players[this.panel], ri); return; }
    var idx = this.invHit(mx, my);
    if (idx < 0) return;
    this.invCursor.i = idx;
    this.invTake(this.players[this.panel], idx);
    this.dragFrom = idx;
    this.dragStart = { x: mx, y: my };
  },

  pointerUp: function (mx, my) {
    if (this.panel < 0 || !this.invHold) { this.dragFrom = -1; return; }
    var idx = this.invHit(mx, my);
    var movedPix = this.dragStart ? Math.hypot(mx - this.dragStart.x, my - this.dragStart.y) : 0;
    if (movedPix > 10 && idx >= 0 && idx !== this.dragFrom) {
      this.invCursor.i = idx;
      this.invTake(this.players[this.panel], idx);   // 拖到另一格 → 放下/交换
    }
    this.dragFrom = -1;                              // 只是点一下 → 东西留在手上，等下一次点击
  },

  pointerMove: function (mx, my) { this.mouse.x = mx; this.mouse.y = my; },
  pointerClick: function (mx, my) { this.mouseDown = true; setTimeout(function () { Game.mouseDown = false; }, 100); },

  /* ---------- 合体 ---------- */
  fuse: function (a, b) {
    a.fused = b; b.fused = a;
    /* 合体加成：两人都变强，但领头人控制 */
    a.maxhp += 10; a.hp = Math.min(a.maxhp, a.hp + 10);
    b.maxhp += 10; b.hp = Math.min(b.maxhp, b.hp + 10);
    this.say('🔮 ' + a.name + ' 和 ' + b.name + ' 合体了！血更厚、跑更快（再按挖掘键拆开）');
  },
  unfuse: function (a) {
    var b = a.fused;
    if (!b) return;
    a.fused = null; b.fused = null;
    /* 拆开时往两侧弹开 */
    var ang = Math.random() * 6.283;
    var kx = a.x + Math.cos(ang) * 30, ky = a.y + Math.sin(ang) * 30;
    if (!a.hits(kx, a.y)) a.x = kx;
    if (!a.hits(a.x, ky)) a.y = ky;
    b.x = a.x - Math.cos(ang) * 30; b.y = a.y - Math.sin(ang) * 30;
    if (b.hits(b.x, b.y)) { b.x = a.x; b.y = a.y; }
    a.maxhp -= 10; b.maxhp -= 10;
    a.hp = Math.min(a.maxhp, a.hp); b.hp = Math.min(b.maxhp, b.hp);
    this.say('✨ 拆开了，各走各的');
  },

  /* ---------- 载具 / 地面拾取 / 任务 ---------- */
  nearestVehicle: function (p, r) {
    var best = null, bd = r || 46;
    for (var i = 0; i < this.vehicles.length; i++) {
      var v = this.vehicles[i];
      if (v.dead || v.driver) continue;
      var d = dist(v.x, v.y, p.x, p.y);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  },

  summonVehicle: function (p, type) {
    var tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE), spot = null;
    for (var rad = 1; rad <= 3 && !spot; rad++) {
      for (var a = 0; a < 12; a++) {
        var ang = a / 12 * 6.283;
        var sx = tx + Math.round(Math.cos(ang) * rad), sy = ty + Math.round(Math.sin(ang) * rad);
        if (this.solidAt(sx, sy)) continue;
        var fd = FDEF[this.floorAt(sx, sy)];
        if (fd && (fd.void_ || fd.hole)) continue;
        spot = { x: sx * TILE + 16, y: sy * TILE + 16 };
        break;
      }
    }
    if (!spot) { this.say('这里太挤了，换个空地召唤'); return; }
    var v = new Vehicle(type, spot.x, spot.y);
    this.vehicles.push(v);
    this.say(p.name + ' 召唤了' + v.name + '，走近按 F / 上车');
  },

  objBreakFast: function (tx, ty, def, player) {
    this.setObj(tx, ty, O.NONE);
    if (def.drop && !(def.dropChance && Math.random() > def.dropChance)) {
      this.drops.push({ x: tx * TILE + 16, y: ty * TILE + 16, id: def.drop, n: 1, life: 60 });
    }
  },

  nearQuestNPC: function (p) {
    for (var i = 0; i < QUEST_NPC.length; i++) {
      var n = QUEST_NPC[i];
      if (n.layer !== this.layer || Maze.active) continue;
      if (dist(p.x, p.y, n.x * TILE + 16, n.y * TILE + 16) < 62) return n;
    }
    return null;
  },

  questInteract: function (p) {
    if (!p.quest) { this.offerQuest(p); return; }
    if (p.quest.done) {
      if (Quest.turnIn(p)) { p.questDone = (p.questDone || 0) + 1; this.offerQuest(p); }
      return;
    }
    this.say(p.name + ' 的任务还没完成：' + Quest.label(p.quest));
  },

  updatePickups: function (dt) {
    var list = this.pickupBuf; list.length = 0;
    World.pickupsNear(this.layer,
      Math.floor(this.cam.left / TILE), Math.floor(this.cam.top / TILE),
      Math.ceil(this.cam.right / TILE), Math.ceil(this.cam.bottom / TILE), list);
    for (var i = 0; i < list.length; i++) {
      var pk = list[i];
      for (var j = 0; j < this.players.length; j++) {
        var p = this.players[j];
        if (!p.alive) continue;
        if (dist(p.x, p.y, pk.x * TILE + 16, pk.y * TILE + 16) > 26) continue;
        if (pk.id === 'dball') {                 // 星曜石：自动补“还缺的那颗”
          if (missingBalls(p).length === 0) break;
          World.takePickup(this.layer, pk.x, pk.y);
          this.grantDragonBall(p);
          break;
        }
        if (Inv.add(p.inv, pk.id, pk.n) === 0) {
          World.takePickup(this.layer, pk.x, pk.y);
          Quest.onCollect(p, pk.id, pk.n);
          var extra = ITEMS[pk.id].vehicle ? '（按 E 召唤，走近按 F 上车）' : '';
          this.say(p.name + ' 在地上捡到 ' + ITEMS[pk.id].name + ' ×' + pk.n + extra);
        }
        break;
      }
    }
  },

  updateVehicles: function (dt) {
    for (var i = this.vehicles.length - 1; i >= 0; i--) {
      var v = this.vehicles[i];
      v.update(dt);
      if (v.dead) {
        for (var j = 0; j < this.players.length; j++) if (this.players[j].riding === v) this.players[j].riding = null;
        this.vehicles.splice(i, 1);
      }
    }
    while (this.vehicles.length > 10) this.vehicles.shift();
  },

  updateMobs: function (dt) {
    for (var i = this.mobs.length - 1; i >= 0; i--) {
      var m = this.mobs[i];
      m.update(dt);
      var far = true;
      for (var j = 0; j < this.players.length; j++) {
        if (dist(m.x, m.y, this.players[j].x, this.players[j].y) < 1400) far = false;
      }
      if (!m.alive || far) this.mobs.splice(i, 1);
    }
    /* 白天也刷「可以收服的小家伙」：小野灵和植物不怕太阳 */
    this.critterTimer = (this.critterTimer || 5) - dt;
    if (this.critterTimer <= 0) {
      this.critterTimer = 8 + Math.random() * 9;
      var critters = 0;
      for (var c2 = 0; c2 < this.mobs.length; c2++) if (this.mobs[c2].catchable) critters++;
      if (critters < 5) this.spawnCritter();
    }
    if (!this.isNight() || (typeof Realm !== 'undefined' && Realm.active)) return;
    this.spawnTimer -= dt;
    /* 小队里的自己人不占用刷怪名额 */
    var enemies = 0;
    for (var e = 0; e < this.mobs.length; e++) if (!this.mobs[e].ally) enemies++;
    if (this.spawnTimer > 0 || enemies >= 20) return;
    this.spawnTimer = 2.0;
    /* 找一个能站的落点：玩家旁边随机撒一圈，最多试 24 次
       （天空岛四周全是云海，单点尝试会整晚刷不出怪） */
    var p = null, tx = 0, ty = 0;
    for (var att = 0; att < 24 && !p; att++) {
      var cand = this.players[Math.floor(Math.random() * this.players.length)];
      var ang = Math.random() * 6.283;
      var rad = (9 + Math.random() * 6) * TILE;
      var mx = cand.x + Math.cos(ang) * rad, my = cand.y + Math.sin(ang) * rad;
      var ctx_ = Math.floor(mx / TILE), cty_ = Math.floor(my / TILE);
      var fd = World.getFloor(this.layer, ctx_, cty_);
      if (FDEF[fd] && (FDEF[fd].void_ || FDEF[fd].hole)) continue;
      if (World.solid(this.layer, ctx_, cty_)) continue;
      p = cand; tx = ctx_; ty = cty_;
    }
    if (!p) return;
    var typeRoll = Math.random();
    var type;
    if (typeRoll < 0.012) {
      // 霸王龙：大陆上的终极反派，全场同时只放一只
      var hasDino = false;
      for (var dn = 0; dn < this.mobs.length; dn++) if (this.mobs[dn].dino) hasDino = true;
      type = hasDino ? 'brute' : 'trex';
      if (type === 'trex') this.say('🦖 大地震动 —— 霸王龙来了！会咆哮会冲锋，最好开车或者两个人一起上');
    } else if (typeRoll < 0.03) {
      // 巨人僵尸：血厚得离谱，场上同时只放一只，打倒掉附魔土豆
      var hasGiant = false;
      for (var g2 = 0; g2 < this.mobs.length; g2++) if (this.mobs[g2].giant) hasGiant = true;
      type = hasGiant ? 'zombie' : 'giant';
      if (type === 'giant') this.say('🚨 巨人僵尸出现了！血厚得离谱，打倒它会掉附魔土豆');
    } else     if (typeRoll < 0.075) {
      // 大怪很稀有，而且场上同时只放一只
      var hasBoss = false;
      for (var b = 0; b < this.mobs.length; b++) if (this.mobs[b].boss) hasBoss = true;
      type = hasBoss ? 'zombie' : 'boss';
      if (type === 'boss') this.say('⚠️ 巨怪出现了！血很厚，最好用车撞或者枪扫');
    } else if (typeRoll < 0.58) type = 'zombie';
    else if (typeRoll < 0.86) type = 'ender';
    else type = 'brute';
    /* 站在烈焰山上：小怪少一点，但会招来炎魔 */
    var bhere = (typeof biomeAt === 'function' && this.layer === 1) ? biomeAt(tx, ty, World.seed) : 'plain';
    if (type === 'trex' && bhere === 'volcano') type = 'brute';      // 火山是炎魔的地盘
    if (bhere === 'volcano' && type === 'zombie' && Math.random() < 0.55) type = 'brute';
    if (bhere === 'volcano' && Math.random() < 0.05) {
      var hasFlame = false;
      for (var fl = 0; fl < this.mobs.length; fl++) if (this.mobs[fl].flame) hasFlame = true;
      if (!hasFlame) {
        type = 'flamelord';
        this.say('🔥 烈焰山的主人——炎魔现身了！它会喷火球，打中还会被点燃');
      }
    }
    this.mobs.push(new Mob(type, tx * TILE + 16, ty * TILE + 16));
  },

  /* 白天在附近刷一只可以收服的小家伙（小野灵 / 豆荚炮手 / 日光花 / 岩壳仔） */
  spawnCritter: function () {
    var p = this.players[Math.floor(Math.random() * this.players.length)];
    if (!p || !p.alive) return;
    var roll = Math.random();
    var type = roll < 0.34 ? 'fairy' : (roll < 0.64 ? 'peashooter' : (roll < 0.86 ? 'sunflower' : 'wallnut'));
    for (var a = 0; a < 24; a++) {
      var ang = Math.random() * 6.283;
      var rad = (10 + Math.random() * 8) * TILE;      // 离玩家远一点，别一转身就撞上
      var mx = p.x + Math.cos(ang) * rad, my = p.y + Math.sin(ang) * rad;
      var tx = Math.floor(mx / TILE), ty = Math.floor(my / TILE);
      if (dist(p.x, p.y, tx * TILE + 16, ty * TILE + 16) < 7 * TILE) continue;
      var f = World.getFloor(this.layer, tx, ty);
      if (FDEF[f] && (FDEF[f].void_ || FDEF[f].hole || FDEF[f].lava || FDEF[f].water)) continue;
      if (World.solid(this.layer, tx, ty)) continue;
      var m = new Mob(type, tx * TILE + 16, ty * TILE + 16);
      this.mobs.push(m);
      return;
    }
  },

  updateExplosions: function (dt) {
    for (var i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].t += dt;
      if (this.explosions[i].t > 0.7) this.explosions.splice(i, 1);
    }
  },

  updateDrops: function (dt) {
    for (var i = this.drops.length - 1; i >= 0; i--) {
      var d = this.drops[i];
      if (d.cool > 0) d.cool -= dt;             // 刚丢下的东西，短时间内别被自己捡回去
      d.life -= dt;
      if (d.life <= 0) this.drops.splice(i, 1);
    }
  },

  updateMessages: function (dt) {
    for (var i = this.messages.length - 1; i >= 0; i--) {
      this.messages[i].life -= dt;
      if (this.messages[i].life <= 0) this.messages.splice(i, 1);
    }
  },

  updateCam: function () {
    var p1 = this.players[0], p2 = this.players[1];
    var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    var dx = Math.abs(p1.x - p2.x), dy = Math.abs(p1.y - p2.y);
    var spanX = Math.max(dx + 480, 1020), spanY = Math.max(dy + 380, 720);
    var z = Math.min(this.W / spanX, this.H / spanY);
    this.cam.zoom = clamp(z, 0.40, 1.45);
    this.cam.x = mx; this.cam.y = my;
    this.cam.left = mx - this.W / (2 * this.cam.zoom);
    this.cam.right = mx + this.W / (2 * this.cam.zoom);
    this.cam.top = my - this.H / (2 * this.cam.zoom);
    this.cam.bottom = my + this.H / (2 * this.cam.zoom);
  },

  /* ---------- 渲染 ---------- */
  render: function () {
    var cam = this.cam;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    var inRealm = (typeof Realm !== 'undefined' && Realm.active);
    // 天空色随昼夜变化
    var ph = this.phase();
    var sky = inRealm ? '#080B14'
      : Maze.active ? '#151520'
      : (this.layer === 0 ? (ph.name === '夜晚' ? '#16203A' : '#8FC7E8')
        : (ph.name === '夜晚' ? '#0E1526' : '#6FB3E0'));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.W, this.H);

    var z = cam.zoom;
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z,
      this.dpr * (this.W / 2 - cam.x * z), this.dpr * (this.H / 2 - cam.y * z));

    if (Maze.active) Maze.draw(ctx, cam);
    else {
      this.drawTiles();
      if (inRealm) Realm.draw(ctx);       // 出口传送门的光环、目标点的提示
    }

    // 掉落物（迷宫里不显示世界上的东西）
    if (!Maze.active) {
      for (var i = 0; i < this.drops.length; i++) {
        var d = this.drops[i];
        var bob = Math.sin(this.time * 4 + i) * 2.5;
        var s = 17 + Math.sin(this.time * 4 + i) * 1.4;
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.ellipse(d.x, d.y + 9, 7, 3, 0, 0, 6.283); ctx.fill();
        drawItemIcon(ctx, d.id, d.x - s / 2, d.y - s / 2 + bob, s);
        if (d.n > 1) {
          ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
          ctx.fillStyle = '#fff';
          ctx.fillText('×' + d.n, d.x + 13, d.y + 10);
          ctx.textAlign = 'left';
        }
      }
      this.drawBaits();
    }
    // 地面拾取物（迷宫和异空间里都没有主世界的地面物品）
    if (!Maze.active && !inRealm) {
      var plist = [];
      World.pickupsNear(this.layer,
        Math.floor(this.cam.left / TILE) - 1, Math.floor(this.cam.top / TILE) - 1,
        Math.ceil(this.cam.right / TILE) + 1, Math.ceil(this.cam.bottom / TILE) + 1, plist);
      for (var pi2 = 0; pi2 < plist.length; pi2++) this.drawPickup(plist[pi2]);
      this.drawQuestNPC();
    }
    // 怪物与玩家
    if (!Maze.active) for (var m = 0; m < this.mobs.length; m++) this.mobs[m].draw(ctx);
    for (var p = 0; p < this.players.length; p++) this.players[p].draw(ctx);
    if (!Maze.active) for (var v = 0; v < this.vehicles.length; v++) this.vehicles[v].draw(ctx);
    this.drawPops();

    // 子弹与爆炸
    for (var bi = 0; bi < this.bullets.length; bi++) {
      var b = this.bullets[bi];
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.stroke();
    }
    /* 飞在空中的驯灵环（画成一颗红白的小球，边飞边转） */
    for (var bi2 = 0; bi2 < this.balls.length; bi2++) {
      var cb = this.balls[bi2];
      var spin = cb.t * 12;
      ctx.save();
      ctx.translate(cb.x, cb.y);
      ctx.rotate(spin);
      ctx.fillStyle = '#EF4444';
      ctx.beginPath(); ctx.arc(0, 0, 8, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.283); ctx.stroke();
      ctx.fillStyle = '#1F2937'; ctx.fillRect(-8, -1.5, 16, 3);
      ctx.fillStyle = '#F8FAFC'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    for (var ei = 0; ei < this.explosions.length; ei++) {
      var ex = this.explosions[ei];
      var k = ex.t / 0.7;
      ctx.fillStyle = 'rgba(251,146,60,' + (1 - k) * 0.75 + ')';
      ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r * (0.3 + k * 0.9), 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(254,240,138,' + (1 - k) * 0.6 + ')';
      ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r * (0.15 + k * 0.55), 0, 6.283); ctx.fill();
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawLighting();
    if (Challenges.active) Challenges.draw(ctx);
    else if (this.dragonWish) this.drawDragonWish();
    else if (this.lottery) this.drawLottery();
    else if (this.questOffer) this.drawQuestOffer();
    else if (this.questPanel >= 0) this.drawQuestList(this.players[this.questPanel]);
    else if (this.panel >= 0) this.drawPanel(this.players[this.panel]);
    if (Maze.active) this.drawMazeBanner();
    else if (typeof Realm !== 'undefined' && Realm.active) this.drawRealmBanner();
    this.updateHUD();
  },

  drawTiles: function () {
    var cam = this.cam;
    var x0 = Math.floor(cam.left / TILE) - 1, x1 = Math.ceil(cam.right / TILE) + 1;
    var y0 = Math.floor(cam.top / TILE) - 1, y1 = Math.ceil(cam.bottom / TILE) + 1;
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        var f = this.floorAt(tx, ty);
        var fimg = FLOOR_IMG[f];
        if (fimg) {
          var fv = Math.floor(hash2(tx, ty, 7) * 3);
          ctx.drawImage(fimg[fv], tx * TILE, ty * TILE);
        }
        var o = this.objAt(tx, ty);
        if (o === O.NONE) continue;
        var oimg = OBJ_IMG[o];
        if (oimg) {
          var ov = Math.floor(hash2(tx + 91, ty + 17, 7) * 3);
          ctx.drawImage(oimg[ov], tx * TILE, ty * TILE);
        }
      }
    }
  },

  drawLighting: function () {
    var inR = (typeof Realm !== 'undefined' && Realm.active);
    var a = inR ? 0.40 : (Maze.active ? 0.62 : this.darkness());
    if (a < 0.02) return;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, this.W, this.H);
    lctx.fillStyle = 'rgba(4,8,18,' + a + ')';
    lctx.fillRect(0, 0, this.W, this.H);
    lctx.globalCompositeOperation = 'destination-out';
    var z = this.cam.zoom;
    function punch(wx, wy, tiles) {
      var r = tiles * TILE * z;
      var sx = (wx - Game.cam.x) * z + Game.W / 2;
      var sy = (wy - Game.cam.y) * z + Game.H / 2;
      if (sx + r < 0 || sy + r < 0 || sx - r > Game.W || sy - r > Game.H) return;
      lctx.drawImage(lightSprite, sx - r, sy - r, r * 2, r * 2);
    }
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.alive) punch(p.x, p.y, 5.0);
    }
    if (inR) {
      for (var r = 0; r < Realm.lights.length; r++) {
        punch(Realm.lights[r][0] * TILE + 16, Realm.lights[r][1] * TILE + 16, Realm.lights[r][2]);
      }
    } else if (!Maze.active) {
      var list = [];
      World.lightsNear(this.layer,
        Math.floor(this.cam.left / TILE), Math.floor(this.cam.top / TILE),
        Math.ceil(this.cam.right / TILE), Math.ceil(this.cam.bottom / TILE), list);
      for (var t = 0; t < list.length; t++) punch(list[t][0] * TILE + 16, list[t][1] * TILE + 16, list[t][2]);
    } else if (Maze.lights) {
      for (var k = 0; k < Maze.lights.length; k++) punch(Maze.lights[k].x * TILE + 16, Maze.lights[k].y * TILE + 16, 3.6);
    }
    for (var d = 0; d < this.drops.length; d++) {
      if (this.drops[d].id === 'torch') punch(this.drops[d].x, this.drops[d].y, 2.4);
    }
    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCanvas, 0, 0);
  },

  /* ---------- 合成面板 ---------- */
  drawPanel: function (p) {
    var w = 480, h = 560;
    var x = (this.W - w) / 2, y = Math.max(10, (this.H - h) / 2);
    ctx.fillStyle = 'rgba(8,16,28,.95)';
    rrect(ctx, x, y, w, h, 18); ctx.fill();
    ctx.strokeStyle = '#35618F'; ctx.lineWidth = 3;
    rrect(ctx, x, y, w, h, 18); ctx.stroke();
    ctx.fillStyle = p.color;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(p.name + ' 的合成台', x + 22, y + 34);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#8CA9C8';
    ctx.fillText('按 1-9 / 0 合成，或者直接用鼠标点配方 · Esc 关闭', x + 22, y + 56);

    var hover = this.recipeHit(this.mouse.x, this.mouse.y);
    ctx.font = '14px sans-serif';
    for (var i = 0; i < RECIPES.length; i++) {
      var r = RECIPES[i];
      var ok = Inv.canCraft(p.inv, r);
      var ry = y + 84 + i * 26;
      if (i === hover) {
        ctx.fillStyle = ok ? 'rgba(190,242,100,.16)' : 'rgba(148,163,184,.12)';
        rrect(ctx, x + 16, ry - 17, w - 32, 24, 6); ctx.fill();
      }
      ctx.fillStyle = ok ? '#BEF264' : '#5F7A96';
      ctx.fillText((i < 9 ? (i + 1) : (i === 9 ? 0 : '🖱')) + '. ' + r.tip, x + 24, ry);
      var needTxt = [];
      for (var k in r.need) needTxt.push(ITEMS[k].name + ' ' + Inv.count(p.inv, k) + '/' + r.need[k]);
      ctx.fillStyle = ok ? '#86EFAC' : '#7A90A8';
      ctx.textAlign = 'right';
      ctx.fillText(needTxt.join('  '), x + w - 24, ry);
      ctx.textAlign = 'left';
    }
    // 背包网格（10 x 2）：方向键 / WASD 选格，空格或回车拿起，鼠标也能拖
    var L = this.invLayout();
    ctx.fillStyle = '#9BB4D0';
    ctx.font = '13px sans-serif';
    ctx.fillText('背包（方向键选格 · 空格/回车拿起放下 · 也可以直接用鼠标拖）', L.gx, L.gy - 12);
    ctx.fillStyle = '#64748B';
    ctx.fillText('前 9 格 = 快捷栏', L.gx + L.cols * L.cell - 10, L.gy - 12);
    for (var s = 0; s < p.inv.length; s++) {
      var col = s % L.cols, row = Math.floor(s / L.cols);
      var sx = L.gx + col * L.cell, sy = L.gy + row * L.cell;
      ctx.fillStyle = s < HOTBAR ? '#1C3348' : '#16283F';
      rrect(ctx, sx, sy, L.size, L.size, 8); ctx.fill();
      ctx.strokeStyle = s === this.invCursor.i ? '#FFFFFF' : (s < HOTBAR ? '#FBBF24' : '#2E5480');
      ctx.lineWidth = s === this.invCursor.i ? 3 : 2;
      rrect(ctx, sx, sy, L.size, L.size, 8); ctx.stroke();
      var it = p.inv[s];
      if (it) {
        drawItemIcon(ctx, it.id, sx + 4, sy + 4, 30);
        if (it.count > 1) {
          ctx.fillStyle = '#fff';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(String(it.count), sx + 34, sy + 35);
          ctx.textAlign = 'left';
        }
      }
    }
    // 拿在手上的那一叠跟着鼠标走
    if (this.invHold) {
      var hx = this.mouse.x, hy = this.mouse.y;
      if (hx < -100) {   // 没动过鼠标就跟在光标格子上
        var cc = this.invCursor.i;
        hx = L.gx + (cc % L.cols) * L.cell + 19;
        hy = L.gy + Math.floor(cc / L.cols) * L.cell + 19;
      }
      ctx.globalAlpha = 0.9;
      drawItemIcon(ctx, this.invHold.id, hx - 15, hy - 15, 30);
      ctx.globalAlpha = 1;
      if (this.invHold.count > 1) {
        ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(String(this.invHold.count), hx + 15, hy + 15);
        ctx.textAlign = 'left';
      }
    }
  },

  drawPickup: function (pk) {
    var x = pk.x * TILE + 16, y = pk.y * TILE + 16;
    var bob = Math.sin(this.time * 3 + pk.x + pk.y) * 3;
    /* 地上的星曜石：画成一个会转的金色球（星号按“最近玩家还缺哪颗”来画） */
    if (pk.id === 'dball') {
      var star = this.missBall || 1;
      var pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
      ctx.fillStyle = 'rgba(251,191,36,' + (0.20 + pulse * 0.22) + ')';
      ctx.beginPath(); ctx.arc(x, y + bob, 17 + pulse * 4, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.ellipse(x, y + 10, 9, 4, 0, 0, 6.283); ctx.fill();
      drawItemIcon(ctx, 'db' + star, x - 12, y - 12 + bob, 24);
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#FDE68A';
      ctx.fillText('星曜石', x, y - 18 + bob);
      ctx.textAlign = 'left';
      return;
    }
    var it = ITEMS[pk.id];
    if (!it) return;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(x, y + 10, 9, 4, 0, 0, 6.283); ctx.fill();
    var glow = it.vehicle ? 0.55 : 0.28;
    ctx.fillStyle = 'rgba(251,191,36,' + glow + ')';
    ctx.beginPath(); ctx.arc(x, y + bob, it.vehicle ? 16 : 13, 0, 6.283); ctx.fill();
    drawItemIcon(ctx, pk.id, x - 11, y - 11 + bob, 22);
    if (pk.n > 1) {
      ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.fillText('×' + pk.n, x + 14, y + 12 + bob);
      ctx.textAlign = 'left';
    }
  },

  drawQuestNPC: function () {
    for (var i = 0; i < QUEST_NPC.length; i++) {
      var n = QUEST_NPC[i];
      if (n.layer !== this.layer) continue;
      var x = n.x * TILE + 16, y = n.y * TILE + 16;
      var bob = Math.sin(this.time * 2) * 2;
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.ellipse(x, y + 11, 11, 4, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#7C5CD6';                 // 紫袍长老
      rrect(ctx, x - 9, y - 6 + bob, 18, 18, 5); ctx.fill();
      ctx.fillStyle = '#F2C9A0';
      ctx.beginPath(); ctx.arc(x, y - 7 + bob, 8, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#FBBF24';                 // 帽子
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 12 + bob); ctx.lineTo(x, y - 24 + bob); ctx.lineTo(x + 10, y - 12 + bob);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#22303F';
      ctx.fillRect(x - 4, y - 8 + bob, 2.6, 3); ctx.fillRect(x + 1.5, y - 8 + bob, 2.6, 3);
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#FDE68A';
      ctx.fillText('任务长老 · F', x, y - 30 + bob);
      ctx.textAlign = 'left';
    }
  },

  drawMazeBanner: function () {
    /* 横幅放在时钟下面（时钟占 top:56 ~ 126），别叠在一起 */
    ctx.fillStyle = 'rgba(8,16,28,.75)';
    rrect(ctx, this.W / 2 - 230, 134, 460, 40, 12); ctx.fill();
    ctx.fillStyle = '#FDE68A';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('机关迷宫 · 找到右下角的传送门，两人同时踩住两块金色踏板', this.W / 2, 160);
    ctx.textAlign = 'left';
  },

  drawRealmBanner: function () {
    var txt = Realm.banner();
    ctx.font = 'bold 16px sans-serif';
    var w = Math.max(420, ctx.measureText(txt).width + 46);
    ctx.fillStyle = 'rgba(8,16,28,.78)';
    rrect(ctx, this.W / 2 - w / 2, 134, w, 40, 12); ctx.fill();
    ctx.strokeStyle = Realm.open() ? '#A78BFA' : '#35618F';
    ctx.lineWidth = 2;
    rrect(ctx, this.W / 2 - w / 2, 134, w, 40, 12); ctx.stroke();
    ctx.fillStyle = Realm.open() ? '#DDD6FE' : '#FDE68A';
    ctx.textAlign = 'center';
    ctx.fillText(txt, this.W / 2, 160);
    ctx.textAlign = 'left';
  },

  /* ---------- HUD ---------- */
  /* 玩家脚下的生物群系（HUD 显示用） */
  biomeName: function () {
    if (this.layer === 0) return '🏝️ 天空岛';
    if (typeof biomeAt !== 'function') return '';
    var p = this.players[0];
    var b = biomeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE), World.seed);
    return { ice: '❄️ 冰封雪原', jungle: '🌴 神秘丛林', volcano: '🌋 烈焰山', plain: '🌾 平原' }[b] || '';
  },

  updateHUD: function () {
    this.hudTick++;
    if (this.hudTick % 4 !== 0) return;
    var ph = this.phase();
    var left = Math.max(0, this.dayLen - (this.time % this.dayLen));
    var mm = Math.floor(left / 60), ss = Math.floor(left % 60);
    var frac = (this.time % this.dayLen) / this.dayLen;
    var inRealm = (typeof Realm !== 'undefined' && Realm.active);
    var extra = (inRealm ? (Realm.kind === 'puzzle' ? '🧩 益智神殿' : '⚔️ 试炼竞技场')
      : (Maze.active ? '迷宫中' : (this.layer === 0 ? '天空岛' : (this.biomeName() + ' · 地面大陆')))) +
      ' · 本阶段剩 ' + mm + ':' + (ss < 10 ? '0' : '') + ss;
    if (this.nightDeaths > 0) extra += ' · 夜倒 ' + this.nightDeaths + '/' + this.maxNightDeaths;
    document.getElementById('clock').innerHTML =
      '<div class="phase">' + ph.icon + ' ' + ph.name + ' · 第 ' + this.day + ' 天</div>' +
      '<div class="bar"><i style="width:' + (frac * 100).toFixed(1) + '%;background:linear-gradient(90deg,#FBBF24,#38BDF8,#3B4A6B)"></i></div>' +
      '<div style="font-size:12px;color:#9BB4D0">' + extra + '</div>';

    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      var h = '';
      h += '<div class="who" style="color:' + p.color + '">' + p.name + (p.char ? ' · ' + p.char.name : '') + (p.alive ? '' : ' 💀') + '</div>';
      h += '<div class="bar hp"><i style="width:' + (p.hp / p.maxhp * 100).toFixed(1) + '%"></i></div>';
      h += '<div class="bar food"><i style="width:' + (p.food / p.maxfood * 100).toFixed(1) + '%"></i></div>';
      h += '<div class="quest">' + (p.quest
        ? ('🎯 ' + Quest.label(p.quest) + (p.quest.done ? ' <b style="color:#BEF264">可交付</b>' : ''))
        : '🎯 无任务 · 去任务长老按 F') + '</div>';
      if (p.riding) h += '<div class="veh">🚜 ' + p.riding.name + ' ' + p.riding.hp + '/' + p.riding.maxhp +
        (p.riding.type === 'tank' ? ' · 挖掘键开炮' : '') + ' · 按 F 下车</div>';
      if (p.following) h += '<div class="veh" style="color:#7DD3FC">🛡️ 跟随保护 ' + p.following.name + ' 中</div>';
      var squad = this.allyCount();
      if (squad > 0) {
        var bots = this.robotCount();
        h += '<div class="veh" style="color:#BEF264">🧟 小队 ' + squad + '/' + this.maxAllies +
          (bots > 0 ? '（🤖 ' + bots + '）' : '') + '</div>';
      }
      if (typeof missingBalls === 'function') {
        var got = 7 - missingBalls(p).length;
        if (got > 0) {
          h += '<div class="veh" style="color:#FBBF24">🌟 星曜石 ' + got + '/7' +
            (got === 7 ? ' · 按' + (p.id === 0 ? ' F ' : ' / ') + '召唤星龙！' : '') + '</div>';
        }
      }
      if (p.pets && p.pets.length) {
        var out = 0;
        for (var pt = 0; pt < p.pets.length; pt++) if (p.pets[pt].out) out++;
        h += '<div class="veh" style="color:#C4B5FD">🐾 小野灵 ' + p.pets.length + ' 只（在外面 ' + out +
          '）· 按 ' + (p.id === 0 ? 'B' : '，') + ' 放出</div>';
      }
      var held = Inv.held(p);
      if (held) {
        h += '<div class="held">' + (held.def.gun
          ? '🎯 ' + held.def.name + wTag(p, held.id) + ' · 自动开火 ' + wGun(p, held).rate + ' 发/秒 · 伤害 ' + wGun(p, held).dmg
          : '✋ ' + held.def.name + wTag(p, held.id) + (held.def.dmg ? ' · 伤害 +' + wDmg(p, held) : '')) + '</div>';
      }
      h += '<div class="hotbar">';
      for (var s = 0; s < HOTBAR; s++) {
        var it = p.inv[s];
        var key = p.ctl.slotLabel ? p.ctl.slotLabel[s] : String(s + 1);
        var lvTag = it && ITEMS[it.id].up ? wTag(p, it.id) : '';
        h += '<div class="slot' + (s === p.sel ? ' sel' : '') + '">' +
          (it ? '<img class="ic" src="' + (ITEMS[it.id].icon || '') + '" alt=""><span class="cnt">' + it.count + '</span>' : '') +
          '<span class="key">' + key + '</span>' +
          (lvTag ? '<span class="lv">' + lvTag.trim() + '</span>' : '') + '</div>';
      }
      h += '</div>';
      /* 内容没变就不重写 DOM（否则图标每帧重建，看起来一直在闪） */
      if (h !== this.panelSig[i]) {
        this.panelSig[i] = h;
        document.getElementById('panel' + (i + 1)).innerHTML = h;
      }
    }

    /* 提示语：内容没变就不重写 DOM，否则 CSS 动画每帧重播 → 看起来一直在闪 */
    var msig = '';
    for (var k = 0; k < this.messages.length; k++) msig += this.messages[k].t + '|';
    if (msig !== this.msgSig) {
      this.msgSig = msig;
      var mh = '';
      for (var k2 = 0; k2 < this.messages.length; k2++) mh += '<div>' + this.messages[k2].t + '</div>';
      document.getElementById('msg').innerHTML = mh;
    }
    this.updateTopbar();
  }
};

/* ---------- 启动 ---------- */
Game.init();
var lastTs = 0;
var frameErr = 0;                 // 连续出错计数（用于自动自愈）
function frame(ts) {
  try {
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    if (Game.started) { Game.update(dt); Game.render(); }
    else {
      /* 没开局：选人界面也在主循环里轮询（手柄自动映射到键码，P1 的 A=空格、P2 的 A=回车） */
      if (typeof Gamepad !== 'undefined') Gamepad.poll();
      if (Game.select && Game.select.active) Game.updateSelect(dt);
    }
  } catch (e) {
    /* 任何一帧出错都不能杀死循环 —— 否则就是黑屏卡死。
       记下错误、提示玩家、必要时做一次大扫除自愈，然后继续下一帧。 */
    frameErr++;
    if (typeof console !== 'undefined' && console.error) console.error('[wildcraft] 帧错误（已自动恢复）', e);
    if (frameErr === 1) { try { Game.say('⚠️ 出了个小故障，已自动恢复'); } catch (e2) { } }
    if (frameErr >= 30) { try { Game.selfHeal(); } catch (e3) { } frameErr = 0; }
  } finally {
    lastTs = ts;
    Input.endFrame();
    Game._mouseConsumed = false;
    requestAnimationFrame(frame);
  }
}
requestAnimationFrame(frame);
