/* 玩家、怪物、掉落物 */
function Player(cfg) {
  this.id = cfg.id;
  this.name = cfg.name;
  this.ctl = cfg.ctl;
  this.color = cfg.color;
  this.accent = cfg.accent;
  /* 角色：街机式选人。没给 charId 时按老默认（P1 疾风 / P2 影刃），老存档也走这里 */
  this.charId = cfg.charId || (cfg.id === 0 ? 'naruto' : 'sasuke');
  this.char = charById(this.charId) || CHARS[cfg.id === 0 ? 0 : 1];
  this.x = 0; this.y = 0;
  this.r = 9;
  this.speed = this.char.stats.speed;
  this.maxhp = this.char.stats.hp; this.hp = this.maxhp;
  this.dmgMul = this.char.stats.dmg;        // 攻击倍率（角色差异）
  this.maxfood = this.char.stats.food || 20; this.food = this.maxfood;
  this.inv = makeInv(20);
  this.sel = 0;
  this.wlv = {};                          // 武器等级：{ 石剑: 2 } 重复捡到就升级
  this.pets = [];                         // 收服来的小野灵 / 植物（按放生键派出来当帮手）
  this.petCd = 0;                         // 放生冷却
  this.pushCd = 0;                        // 推箱冷却（益智神殿里用）
  this.slow = 0;                          // 被霸王龙吼过之后的减速
  this.riding = null;                     // 正在开的载具
  this.fused = null;                      // 合体伙伴（不为 null 表示已合体，指向另一人）
  this.following = null;                  // 跟随保护的伙伴（自动跟着走、替他打怪）
  this.manualT = 0;                       // 手动操作后多久恢复自动跟随
  this.vx = 0; this.vy = 0;               // 速度（冰面上会滑）
  this.onSlip = false; this.inVine = false; this.onLava = false;
  this.facing = { x: 0, y: 1 };
  this.walk = 0; this.swing = 0; this.atkCd = 0; this.hurtCd = 0;
  this.burn = 0;                          // 被炎魔点燃后的持续灼烧
  this.mine = { tx: 0, ty: 0, prog: 0, active: false };
  this.alive = true; this.respawn = 0;
  this.inWater = false; this.onUpdraft = false;
  this.safeX = 0; this.safeY = 0;
  this.flash = 0;
}

Player.prototype.hits = function (x, y) {
  var r = this.r;
  var x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  var y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (var ty = y0; ty <= y1; ty++) {
    for (var tx = x0; tx <= x1; tx++) {
      if (Game.solidAt(tx, ty)) return true;
    }
  }
  return false;
};

Player.prototype.frontTile = function () {
  var fx = this.x + this.facing.x * 20;
  var fy = this.y + this.facing.y * 20;
  return { tx: Math.floor(fx / TILE), ty: Math.floor(fy / TILE) };
};

Player.prototype.findOverlap = function () {
  for (var i = 0; i < Game.players.length; i++) {
    var p = Game.players[i];
    if (p === this || !p.alive) continue;
    if (dist(p.x, p.y, this.x, this.y) < 20) return p;
  }
  return null;
};

Player.prototype.update = function (dt) {
  if (!this.alive) {
    this.respawn -= dt;
    if (this.respawn <= 0) this.revive();
    return;
  }
  // 开车时：人跟着车走，只保留饱食度和自动捡东西
  if (this.riding) {
    if (this.riding.dead) this.riding = null;
    else {
      this.x = this.riding.x; this.y = this.riding.y;
      this.food = Math.max(0, this.food - dt * 0.04);
      this.autoPickup();
      if (this.atkCd > 0) this.atkCd -= dt;
      if (this.hurtCd > 0) this.hurtCd -= dt;
      if (Input.pressed(this.ctl.use)) this.doUse();
      return;
    }
  }

  var ax = 0, ay = 0;
  if (Input.down(this.ctl.left)) ax -= 1;
  if (Input.down(this.ctl.right)) ax += 1;
  if (Input.down(this.ctl.up)) ay -= 1;
  if (Input.down(this.ctl.down)) ay += 1;

  /* 跟随保护：自己不动方向键时，自动跟着伙伴走，并替他打掉靠近的怪 */
  if (this.following && !this.fused) {
    if (!this.following.alive || this.following === this) { this.following = null; }
    else if (ax || ay) { this.manualT = 1.1; }               // 手动优先
    else {
      if (this.manualT > 0) this.manualT -= dt;
      var fd2 = dist(this.x, this.y, this.following.x, this.following.y);
      if (this.manualT <= 0 && fd2 > 58) {
        var l2 = fd2 || 1;
        ax = (this.following.x - this.x) / l2;
        ay = (this.following.y - this.y) / l2;
      }
      if (this.atkCd <= 0) this.guardAttack();               // 有怪靠近就替伙伴挡
    }
  }
  this.move(ax, ay, dt);

  if (Input.down(this.ctl.mine)) this.doAction(dt);
  else { this.mine.active = false; this.mine.prog = 0; }

  if (Input.pressed(this.ctl.place) || (this.ctl.place2 && Input.pressed(this.ctl.place2))) this.doPlace();
  if (Input.pressed(this.ctl.use)) this.doUse();
  if (this.ctl.follow && Input.pressed(this.ctl.follow)) this.toggleFollow();
  /* 益智神殿里，丢弃键改成「把箱子摆回原位」（推错了不至于卡死） */
  if (this.ctl.drop && Input.pressed(this.ctl.drop)) {
    if (typeof Realm !== 'undefined' && Realm.active && Realm.kind === 'puzzle') Realm.resetBoxes();
    else this.dropOne();
  }
  if (this.ctl.pet && Input.pressed(this.ctl.pet)) this.releasePet();

  /* 合体：按住 mine 键 + 两人重叠 → 合体；再按一次拆开 */
  if (Input.pressed(this.ctl.mine)) {
    if (this.fused) { Game.unfuse(this); }
    else {
      var other = this.findOverlap();
      if (other) Game.fuse(this, other);
    }
  } else if (Input.down(this.ctl.mine) && !this.fused) {
    /* 按住空格/Enter 时如果两人重叠也合体 */
    var o2 = this.findOverlap();
    if (o2 && !o2.fused) Game.fuse(this, o2);
  }
  if (this.fused) {
    var partner = this.fused;
    /* 合体后：领头人控制移动，跟随者跟着走 */
    partner.x = this.x; partner.y = this.y;
    partner.facing = this.facing;
    partner.food = Math.max(partner.food, this.food * 0.8);
    partner.hp = Math.max(partner.hp, this.hp * 0.8);
  }

  this.autoShoot(dt);

  // 饱食度与回血
  this.food = Math.max(0, this.food - dt * 0.055);
  if (this.food <= 0) {
    this.hp -= dt * 0.8;
    if (this.hp <= 0) this.die();
  } else if (this.food > 13 && this.hp < this.maxhp) {
    this.hp = Math.min(this.maxhp, this.hp + dt * 0.6);
  }
  if (this.burn > 0) {                    // 被炎魔点着了
    this.burn -= dt;
    this.hp -= dt * 4;
    this.flash = Math.max(this.flash, 0.08);
    if (this.hp <= 0) this.die();
  }
  if (this.hurtCd > 0) this.hurtCd -= dt;
  if (this.atkCd > 0) this.atkCd -= dt;
  if (this.swing > 0) this.swing -= dt;
  if (this.flash > 0) this.flash -= dt;
  if (this.slow > 0) this.slow -= dt;
  if (this.petCd > 0) this.petCd -= dt;
  if (this.pushCd > 0) this.pushCd -= dt;

  // 自动捡东西
  this.autoPickup();
};

Player.prototype.autoPickup = function () {
  for (var i = Game.drops.length - 1; i >= 0; i--) {
    var d = Game.drops[i];
    if (d.cool > 0 && d.owner === this) continue;      // 刚丢下的东西，别立刻捡回来
    if (dist(d.x, d.y, this.x, this.y) < 44) {
      if (Inv.give(this, d.id, d.n) === 0) {
        Game.drops.splice(i, 1);
        Quest.onCollect(this, d.id, d.n);
        if (!ITEMS[d.id].up) Game.say(this.name + ' 捡到 ' + ITEMS[d.id].name + ' ×' + d.n);
      }
    }
  }
};

Player.prototype.move = function (ax, ay, dt) {
  var sp = this.speed * (this.inWater ? 0.55 : 1) * (this.food <= 0 ? 0.75 : 1);
  if (this.slow > 0) sp *= 0.6;           // 被霸王龙吓到了
  if (this.onSlip) sp *= 1.32;            // 冰面：更快，但刹不住
  if (this.inVine) sp *= 0.5;             // 藤蔓：缠脚
  if (ax || ay) {
    var len = Math.hypot(ax, ay);
    ax /= len; ay /= len;
    this.facing.x = ax; this.facing.y = ay;
    this.walk += dt;
  } else this.walk = 0;
  /* 只有冰面上才做惯性（普通地面保持干脆的手感） */
  if (this.onSlip) {
    var k = 1 - Math.exp(-5.5 * dt);
    this.vx += (ax * sp - this.vx) * k;
    this.vy += (ay * sp - this.vy) * k;
  } else { this.vx = ax * sp; this.vy = ay * sp; }
  var nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
  if (!this.hits(nx, this.y)) this.x = nx; else this.vx = 0;
  if (!this.hits(this.x, ny)) this.y = ny; else this.vy = 0;
  unstick(this);                       // 万一被方块埋住了，自动挪出来

  var tx = Math.floor(this.x / TILE), ty = Math.floor(this.y / TILE);
  var f = Game.floorAt(tx, ty);
  var fd = FDEF[f] || {};
  if (Maze.active) { this.inWater = false; this.onUpdraft = false; this.onLava = false; this.onSlip = false; this.inVine = false; return; }
  this.inWater = !!fd.water;
  this.onUpdraft = !!fd.updraft;
  this.onSlip = !!fd.slip;
  this.onLava = !!fd.lava;
  this.inVine = !!(ODEF[Game.objAt(tx, ty)] || {}).slow;
  if (fd.void_) { Game.voidFall(this); return; }
  if (fd.hole && Game.layer === 0) { Game.descend(tx, ty); return; }
  if (fd.lava) {                       // 岩浆：站上去就烧
    this.hp -= dt * 16;
    this.flash = 0.12;
    if (this.hp <= 0) { this.die(); return; }
  }
  var od = ODEF[Game.objAt(tx, ty)];
  if (od && od.hurt && this.hurtCd <= 0) this.hurt(od.hurt, tx * TILE + 16, ty * TILE + 16);   // 仙人掌扎人
  // 记录安全点：站得住、且脚下不是云海也不是岩浆
  if (!fd.void_ && !fd.lava && !Game.solidAt(tx, ty)) { this.safeX = this.x; this.safeY = this.y; }
};

Player.prototype.doAction = function (dt) {
  // 先打怪
  if (this.atkCd <= 0) {
    var best = null, bestD = 46;
    for (var i = 0; i < Game.mobs.length; i++) {
      var m = Game.mobs[i];
      if (!m.alive || m.ally) continue;      // 自家小队打不得
      var dx = m.x - this.x, dy = m.y - this.y;
      var d = Math.hypot(dx, dy);
      if (d > bestD) continue;
      if ((dx * this.facing.x + dy * this.facing.y) / (d || 1) < -0.15) continue;  // 只在朝向的前方
      best = m; bestD = d;
    }
    if (best) {
      var held = Inv.held(this);
      var dmg = Math.max(1, Math.round((3 + wDmg(this, held)) * this.dmgMul));
      best.hurt(dmg, this.x, this.y, this);
      this.atkCd = 0.42; this.swing = 0.18;
      return;
    }
  }
  // 再挖
  var ft = this.frontTile();
  var obj = Game.objAt(ft.tx, ft.ty);
  var def = ODEF[obj];
  if (!def || !def.solid || def.unbreakable) { this.mine.active = false; this.mine.prog = 0; return; }
  if (this.mine.active && (this.mine.tx !== ft.tx || this.mine.ty !== ft.ty)) {
    this.mine.active = false; this.mine.prog = 0;
  }
  this.mine.active = true; this.mine.tx = ft.tx; this.mine.ty = ft.ty;
  var hard = def.hard || 0.6;
  var held2 = Inv.held(this);
  var mult = 1;
  if (def.tool && held2 && held2.def.tool === def.tool) mult = 2.4 + wTier(this, held2) * 0.8;
  else if (def.tool) mult = 0.55;                    // 没有对应工具会慢一些，但不至于挖不动
  this.mine.prog += dt * mult;
  this.swing = 0.12;
  if (this.mine.prog >= hard) {
    Game.breakTile(ft.tx, ft.ty, this);
    this.mine.prog = 0; this.mine.active = false;
  }
};

/* 拿着枪/飞刀时，有怪进入射程就自动开火 */
Player.prototype.autoShoot = function (dt) {
  var gun = Inv.gun(this);
  if (!gun) return;
  if (this.shootCd > 0) this.shootCd -= dt;
  var best = null, bd = gun.range;
  for (var i = 0; i < Game.mobs.length; i++) {
    var m = Game.mobs[i];
    if (!m.alive || m.ally) continue;        // 别对着自己人开枪
    var d = dist(m.x, m.y, this.x, this.y);
    if (d < bd) { bd = d; best = m; }
  }
  if (!best || this.shootCd > 0) return;
  this.shootCd = 1 / gun.rate;
  var ang = Math.atan2(best.y - this.y, best.x - this.x) + (Math.random() - 0.5) * 0.10;
  Game.bullets.push({
    x: this.x + Math.cos(ang) * 14, y: this.y + Math.sin(ang) * 14,
    vx: Math.cos(ang) * gun.speed, vy: Math.sin(ang) * gun.speed,
    dmg: Math.max(1, Math.round(gun.dmg * this.dmgMul)), life: gun.range / gun.speed + 0.15,
    color: gun.color, size: gun.size, owner: this
  });
  this.swing = 0.1;
  this.facing.x = Math.cos(ang); this.facing.y = Math.sin(ang);
};

/* ---------- 跟随保护 / 丢弃 ---------- */
Player.prototype.toggleFollow = function () {
  if (this.fused) { Game.say('合体的时候不用跟随'); return; }
  if (this.following) {
    Game.say('🚶 ' + this.name + ' 不再跟着 ' + this.following.name + ' 了');
    this.following = null;
    return;
  }
  var other = null;
  for (var i = 0; i < Game.players.length; i++) {
    var p = Game.players[i];
    if (p !== this && p.alive) { other = p; break; }
  }
  if (!other) { Game.say(this.name + ' 身边没有可以跟随的伙伴'); return; }
  this.following = other;
  this.manualT = 0;
  Game.say('🛡️ ' + this.name + ' 开始跟随保护 ' + other.name + '（自己走两步会暂时脱队，松手 1 秒后跟回来）');
};

/* 替伙伴挡怪：身边有敌人就自动打（不看朝向，360 度护驾） */
Player.prototype.guardAttack = function () {
  var best = null, bd = 66;
  for (var i = 0; i < Game.mobs.length; i++) {
    var m = Game.mobs[i];
    if (!m.alive || m.ally) continue;
    var d = dist(m.x, m.y, this.x, this.y);
    if (d < bd) { bd = d; best = m; }
  }
  if (!best) return false;
  var held = Inv.held(this);
  var dmg = Math.max(1, Math.round((3 + wDmg(this, held)) * this.dmgMul));
  this.facing.x = (best.x - this.x) / (bd || 1);
  this.facing.y = (best.y - this.y) / (bd || 1);
  best.hurt(dmg, this.x, this.y, this);
  this.atkCd = 0.42; this.swing = 0.18;
  return true;
};

/* 丢一件手上的东西到地上（1 秒内不会被自己立刻捡回来） */
Player.prototype.dropOne = function () {
  var s = this.inv[this.sel];
  if (!s) { Game.say(this.name + ' 手上没有东西可以丢'); return false; }
  var id = s.id, def = ITEMS[id];
  var ang = Math.atan2(this.facing.y, this.facing.x);
  var dx = this.x + Math.cos(ang) * 26, dy = this.y + Math.sin(ang) * 26;
  if (this.hits(dx, dy)) { dx = this.x; dy = this.y; }
  Game.drops.push({ x: dx, y: dy, id: id, n: 1, life: 90, cool: 1.2, owner: this });
  Inv.remove(this.inv, id, 1);
  Game.say(this.name + ' 丢下了 ' + def.name + ' ×1');
  return true;
};

/* ---------- 收服来的小野灵 / 植物 ---------- */
/* 按放生键：从宠物栏里派一只出来当帮手（倒下的会回到栏里，歇一歇还能再派） */
Player.prototype.releasePet = function () {
  if (typeof Realm !== 'undefined' && Realm.active) { Game.say('异空间里不放宠物'); return false; }
  if (this.petCd > 0) return false;
  if (!this.pets || !this.pets.length) {
    Game.say(this.name + ' 还没有收服过小野灵 —— 拿驯灵环（按 E 扔）去抓一只');
    return false;
  }
  var idx = -1;
  for (var i = 0; i < this.pets.length; i++) {
    if (!this.pets[i].out) { idx = i; break; }
  }
  if (idx < 0) { Game.say('宠物都已经在外面了'); return false; }
  if (Game.allyCount() >= Game.maxAllies) { Game.say('场上帮手太多了（上限 ' + Game.maxAllies + ' 个）'); return false; }
  var rec = this.pets[idx];
  var spot = null;
  for (var rad = 1; rad <= 3 && !spot; rad++) {
    for (var a = 0; a < 12; a++) {
      var ang = a / 12 * 6.283;
      var sx = Math.floor(this.x / TILE) + Math.round(Math.cos(ang) * rad);
      var sy = Math.floor(this.y / TILE) + Math.round(Math.sin(ang) * rad);
      if (Game.solidAt(sx, sy)) continue;
      spot = { x: sx * TILE + 16, y: sy * TILE + 16 };
      break;
    }
  }
  if (!spot) { Game.say('这里太挤了，换个空地再放'); return false; }
  var m = new Mob(rec.type, spot.x, spot.y);
  m.ally = true; m.leader = this; m.recruiter = this;
  m.pet = true; m.petOf = this; m.petIdx = idx;
  m.hp = Math.max(1, Math.min(rec.hp, m.maxhp));
  Game.mobs.push(m);
  rec.out = true;
  this.petCd = 0.6;
  Game.pops.push({ x: spot.x, y: spot.y, t: 0 });
  Game.say('✨ ' + this.name + ' 放出了 ' + m.label + '（' + Math.round(m.hp) + '/' + m.maxhp + '）');
  return true;
};

/* 宠物倒下：回栏里养伤（还能再放出来），血留三成 */
Player.prototype.petFallen = function (idx) {
  var rec = this.pets[idx];
  if (!rec) return;
  rec.out = false;
  rec.hp = Math.max(1, Math.round(rec.maxhp * 0.3));
};

Player.prototype.doPlace = function () {
  var held = Inv.held(this);
  if (!held) return;
  if (held.def.capture) {                       // 驯灵环：朝面对的方向扔出去
    if (Game.throwBall(this)) Inv.remove(this.inv, held.id, 1);
    return;
  }
  if (held.def.summon) {   // 召唤守护者（机器人）
    if (Game.summonGuardian(this, held.def.summon)) Inv.remove(this.inv, held.id, 1);
    return;
  }
  if (held.def.bait) {   // 附魔土豆：扔出去当诱饵
    if (Game.throwBait(this, held.id)) Inv.remove(this.inv, held.id, 1);
    return;
  }
  if (held.def.heal) {   // 用药箱
    this.hp = Math.min(this.maxhp, this.hp + held.def.heal);
    Inv.remove(this.inv, held.id, 1);
    Game.say(this.name + ' 用了药箱，回血 +' + held.def.heal);
    return;
  }
  if (held.def.vehicle) {   // 召唤载具
    if (Maze.active) { Game.say('迷宫里开不进载具'); return; }
    Game.summonVehicle(this, held.def.vehicle);
    Inv.remove(this.inv, held.id, 1);
    return;
  }
  if (held.def.food) {   // 吃
    this.food = Math.min(this.maxfood, this.food + held.def.food);
    this.hp = Math.min(this.maxhp, this.hp + 2);
    Inv.remove(this.inv, held.id, 1);
    Game.say(this.name + ' 吃了一个' + held.def.name);
    return;
  }
  if (held.def.place === undefined) return;
  var ft = this.frontTile();
  if (Game.solidAt(ft.tx, ft.ty)) return;
  var ff = Game.floorAt(ft.tx, ft.ty);
  if (FDEF[ff] && (FDEF[ff].void_ || FDEF[ff].hole)) return;   // 云海和云洞上不能建
  if (Maze.active) return;
  if (Game.tileOccupied(ft.tx, ft.ty)) return;                // 别把自己/伙伴/怪埋进方块里
  Game.setObj(ft.tx, ft.ty, held.def.place);
  Inv.remove(this.inv, held.id, 1);
  Quest.onBuild(this, held.def.place);
};

Player.prototype.doUse = function () {
  if (this.riding) { this.riding.driver = null; this.riding = null; Game.say(this.name + ' 下车了'); return; }
  /* 异空间：站在出口传送门上按交互键 → 结算并回家 */
  if (typeof Realm !== 'undefined' && Realm.active) { Realm.tryExit(this); return; }
  /* 主世界：踩在传送门上（或面前就是传送门）按交互键 → 进异空间 */
  var here = { tx: Math.floor(this.x / TILE), ty: Math.floor(this.y / TILE) };
  var spots = [here, this.frontTile()];
  for (var i = 0; i < spots.length; i++) {
    var od = ODEF[Game.objAt(spots[i].tx, spots[i].ty)];
    if (od && od.portal) { Game.enterRealm(od.portal); return; }
  }
  var v = Game.nearestVehicle(this, 46);
  if (v) {
    v.driver = this; this.riding = v;
    Game.say(this.name + ' 开上了' + v.name + '（' + (v.type === 'tank' ? '撞怪碾树' : '按住挖掘键铲一大片') + '）');
    return;
  }
  if (Game.nearQuestNPC(this)) { Game.questInteract(this); return; }
  if (typeof hasAllBalls === 'function' && hasAllBalls(this)) { Game.summonDragon(this); return; }
  if (!Maze.active && this.onUpdraft && Game.layer === 1) Game.ascend();
};

Player.prototype.hurt = function (dmg, sx, sy) {
  if (!this.alive || this.hurtCd > 0) return;
  this.hp -= dmg;
  this.hurtCd = 0.65;
  this.flash = 0.25;
  var dx = this.x - sx, dy = this.y - sy;
  var l = Math.hypot(dx, dy) || 1;
  var kx = this.x + dx / l * 26, ky = this.y + dy / l * 26;
  if (!this.hits(kx, this.y)) this.x = kx;
  if (!this.hits(this.x, ky)) this.y = ky;
  if (this.hp <= 0) this.die();
};

Player.prototype.die = function () {
  this.alive = false;
  this.hp = 0;
  this.respawn = 3.5;
  if (this.riding) { this.riding.driver = null; this.riding = null; }
  if (Game.isNight() && !Maze.active) {
    Game.nightDeaths++;
    var left = Game.maxNightDeaths - Game.nightDeaths;
    if (left > 0) Game.say(this.name + ' 倒下了…（夜里第 ' + Game.nightDeaths + '/' + Game.maxNightDeaths + ' 次，再倒 ' + left + ' 次天就亮了）');
    else Game.restartDay(true);
  } else {
    Game.say(this.name + ' 倒下了… 3 秒后回来');
  }
};

Player.prototype.revive = function () {
  this.alive = true;
  this.hp = Math.max(8, this.maxhp * 0.7);
  this.food = Math.max(this.food, 12);
  if (Maze.active) {
    this.x = Maze.entry.x * TILE + TILE / 2;
    this.y = Maze.entry.y * TILE + TILE / 2;
  } else {
    this.x = this.safeX || this.x;
    this.y = this.safeY || this.y;
    var rf = World.getFloor(Game.layer, Math.floor(this.x / TILE), Math.floor(this.y / TILE));
    if (FDEF[rf] && FDEF[rf].void_) {
      var s = World.findSpot(Game.layer, 0, 0, 12);
      this.x = s.x * TILE + TILE / 2; this.y = s.y * TILE + TILE / 2;
    }
  }
  // 复活冲击波：把周围的东西炸光，免得一睁眼又被围住
  Game.explode(this.x, this.y, 3.6, this);
  this.hurtCd = 1.2;
};

Player.prototype.draw = function (ctx) {
  if (!this.alive) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - 9, this.y - 6, 18, 12);
    ctx.globalAlpha = 1;
    return;
  }
  var bob = this.walk > 0 ? Math.sin(this.walk * 12) * 2 : 0;
  var x = this.x, y = this.y + bob;
  var fused = !!this.fused;
  var scale = fused ? 1.25 : 1;
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(this.x, this.y + 10, 10 * scale, 4 * scale, 0, 0, 6.283); ctx.fill();
  // 合体时画外圈光晕
  if (fused) {
    var pulse = 0.5 + 0.5 * Math.sin(Game.time * 4);
    ctx.fillStyle = 'rgba(168,85,247,' + (0.2 + pulse * 0.2) + ')';
    ctx.beginPath(); ctx.arc(x, y, 22, 0, 6.283); ctx.fill();
  }
  /* 角色形象（疾风/影刃/武圣/铁卫/盾卫/飞檐/巨光/雷鼠，见 chars.js） */
  var s = scale;
  var bob2 = this.walk > 0 ? Math.sin(this.walk * 11) * 2.2 : 0;
  drawHeroSprite(ctx, {
    x: x, y: y, s: scale, ch: this.char,
    bob2: bob2, facing: this.facing,
    fused: fused, fuseColor: this.fused ? this.fused.color : null,
    time: Game.time
  });
  // 手中物品（举在身前，跟着朝向走）
  var held = Inv.held(this);
  if (held && !this.riding) {
    var hx = x + this.facing.x * 13, hy = y + this.facing.y * 13 - 2;
    ctx.save();
    /* 工具/武器举在手里 */
    if (held.def.gun) {
      ctx.fillStyle = held.def.color;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(Math.atan2(this.facing.y, this.facing.x));
      ctx.fillRect(0, -2, 14, 4);
      ctx.fillStyle = '#1F2937'; ctx.fillRect(2, -1, 3, 3);
      ctx.restore();
    } else if (held.def.tool || held.def.dmg) {
      /* 斧/镐/剑：斜着举 */
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(Math.atan2(this.facing.y, this.facing.x) - 0.4);
      ctx.fillStyle = '#8A6238'; ctx.fillRect(0, -1, 12, 3);
      ctx.fillStyle = held.def.color; ctx.fillRect(8, -4, 8, 8);
      ctx.restore();
    } else if (held.def.food) {
      /* 食物：小圆 */
      ctx.fillStyle = held.def.color;
      ctx.beginPath(); ctx.arc(hx, hy, 5, 0, 6.283); ctx.fill();
    } else if (held.def.vehicle) {
      /* 载具召唤物：浮在头顶 */
      drawItemIcon(ctx, held.id, x - 7, y - 30, 14);
    } else if (held.def.heal) {
      ctx.fillStyle = '#F8FAFC'; rrect(ctx, hx - 4, hy - 4, 8, 8, 2); ctx.fill();
      ctx.fillStyle = '#EF4444'; ctx.fillRect(hx - 1, hy - 3, 2, 6); ctx.fillRect(hx - 3, hy - 1, 6, 2);
    } else if (held.def.place !== undefined) {
      /* 方块类：小方块在手 */
      ctx.fillStyle = held.def.color;
      ctx.fillRect(hx - 4, hy - 4, 8, 8);
    }
    ctx.restore();
  }
  // 挥动
  if (this.swing > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 22, Math.atan2(this.facing.y, this.facing.x) - 0.7, Math.atan2(this.facing.y, this.facing.x) + 0.7);
    ctx.stroke();
  }
  if (this.flash > 0) {
    ctx.fillStyle = 'rgba(255,80,80,' + (this.flash * 1.6) + ')';
    rrect(ctx, x - 9 * s, y - 12 * s, 18 * s, 22 * s, 6 * s); ctx.fill();
  }
  // 名牌（忍者现在更高了，往上挪一点）
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillText(this.name, x, y - 26 * s);
  ctx.fillStyle = this.color;
  ctx.fillText(this.name, x, y - 27 * s);
  // 挖掘进度
  if (this.mine.active && this.mine.prog > 0.15) {
    var ft = this.frontTile();
    var def = ODEF[Game.objAt(ft.tx, ft.ty)];
    if (def && def.hard) {
      var pr = clamp(this.mine.prog / (def.hard || 1), 0, 1);
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 4;
      ctx.strokeRect(ft.tx * TILE + 3, ft.ty * TILE + 3, TILE - 6, TILE - 6);
      ctx.strokeStyle = '#FBBF24'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ft.tx * TILE + 16, ft.ty * TILE + 16, 12, -Math.PI / 2, -Math.PI / 2 + pr * 6.283);
      ctx.stroke();
    }
  }
};

/* ---------------- 怪物 ---------------- */
function Mob(type, x, y) {
  this.type = type;
  this.x = x; this.y = y;
  this.r = 9;
  this.alive = true;
  this.atkCd = 0;
  this.flash = 0;
  this.walk = 0;
  this.tpCd = 3 + Math.random() * 3;
  this.hitFlash = 0;
  this.ally = false;                       // 吃了附魔土豆 → 变成自己人
  this.recruiter = null;                   // 是谁把它策反的（打怪任务算他的）
  this.patrolT = 0; this.patrolTo = null;
  this.facing = { x: 0, y: 1 };
  /* 几种怪血量/手感都不同：小僵尸 3 下、末影人 5 下、大块头又肉又疼、巨人僵尸是硬仗 */
  if (type === 'zombie') {
    this.hp = 24; this.maxhp = 24; this.speed = 52; this.dmg = 4; this.color = '#7CB342';
    this.atkGap = 1.1; this.knock = 1; this.r = 9; this.label = '小僵尸';
  } else if (type === 'giant') {
    /* 巨人僵尸：血厚到离谱、走得慢、一巴掌很疼，打倒掉附魔土豆 */
    this.hp = 420; this.maxhp = 420; this.speed = 36; this.dmg = 22; this.color = '#3F7A2E';
    this.atkGap = 2.4; this.knock = 0.06; this.r = 22; this.label = '巨人僵尸'; this.giant = true;
  } else if (type === 'brute') {
    this.hp = 60; this.maxhp = 60; this.speed = 38; this.dmg = 10; this.color = '#4E7A2A';
    this.atkGap = 1.8; this.knock = 0.35; this.r = 12; this.label = '大块头';
  } else if (type === 'boss') {
    this.hp = 260; this.maxhp = 260; this.speed = 44; this.dmg = 18; this.color = '#8B2E2E';
    this.atkGap = 2.0; this.knock = 0.12; this.r = 20; this.label = '巨怪'; this.boss = true;
  } else if (type === 'flamelord') {
    /* 炎魔：烈焰山的主人，血极厚、打人带灼烧、还会喷火球
       伤害刻意调到「满血能挨一下」——很危险，但不至于一巴掌秒杀 */
    this.hp = 680; this.maxhp = 680; this.speed = 62; this.dmg = 20; this.color = '#DC2626';
    this.atkGap = 1.5; this.knock = 0.08; this.r = 20; this.label = '炎魔';
    this.boss = true; this.flame = true; this.burn = 2.2;
  } else if (type === 'robot') {
    /* 机器人守护者：自己人，血比僵尸厚得多，还会远程点射 */
    this.hp = 160; this.maxhp = 160; this.speed = 98; this.dmg = 16; this.color = '#38BDF8';
    this.atkGap = 0.85; this.knock = 0.25; this.r = 11; this.label = '机器人';
    this.ally = true; this.robot = true; this.range = 280; this.shootCd = 0;
  } else if (type === 'trex') {
    /* 霸王龙：大陆上的终极反派。血厚到离谱，会咆哮（范围减速）和冲锋。
       伤害刻意压在「满血能挨一下」以内 —— 咬 24 / 撞 28，都很疼但不至于秒杀 */
    this.hp = 1500; this.maxhp = 1500; this.speed = 66; this.dmg = 24; this.color = '#4D7C3F';
    this.atkGap = 1.6; this.knock = 0.04; this.r = 26; this.label = '霸王龙';
    this.boss = true; this.dino = true; this.roarCd = 4; this.chargeCd = 3; this.charge = 0;
  } else if (type === 'fairy') {
    /* 小野灵：飘在空中的小东西。不主动打人，你打了它才还手 */
    this.hp = 34; this.maxhp = 34; this.speed = 82; this.dmg = 5; this.color = '#A78BFA';
    this.atkGap = 1.0; this.knock = 0.9; this.r = 10; this.label = '小野灵';
    this.ranged = true; this.range = 210; this.rdmg = 5; this.bspeed = 300;
    this.bcolor = '#C4B5FD'; this.bsize = 5; this.gap = 1.8; this.shootCd = 0;
    this.catchable = true; this.floats = true; this.passive = true; this.aggro = false;
  } else if (type === 'peashooter') {
    /* 豆荚炮手：扎在土里不动，被惹毛了才吐豌豆。收服之后跟着你走 */
    this.hp = 46; this.maxhp = 46; this.speed = 0; this.dmg = 8; this.color = '#4ADE80';
    this.atkGap = 1.3; this.knock = 0.2; this.r = 11; this.label = '豆荚炮手';
    this.plant = true; this.ranged = true; this.range = 300; this.rdmg = 6; this.bspeed = 340;
    this.bcolor = '#86EFAC'; this.bsize = 5; this.gap = 1.6; this.shootCd = 0;
    this.catchable = true; this.passive = true; this.aggro = false;
  } else if (type === 'sunflower') {
    /* 日光花：完全不会打架，被收服之后会定期给主人回血回体力 */
    this.hp = 30; this.maxhp = 30; this.speed = 0; this.dmg = 0; this.color = '#FBBF24';
    this.atkGap = 9; this.knock = 0.5; this.r = 11; this.label = '日光花';
    this.plant = true; this.catchable = true; this.healer = true; this.healCd = 1.5;
    this.passive = true; this.aggro = false;
  } else if (type === 'wallnut') {
    /* 岩壳仔：血超厚、不会走，被收服之后变成会走路的肉盾 */
    this.hp = 240; this.maxhp = 240; this.speed = 0; this.dmg = 3; this.color = '#B45309';
    this.atkGap = 1.6; this.knock = 0.05; this.r = 12; this.label = '岩壳仔';
    this.plant = true; this.catchable = true; this.tank = true;
    this.passive = true; this.aggro = false;
  } else {
    this.hp = 36; this.maxhp = 36; this.speed = 78; this.dmg = 6; this.color = '#A97BE8';
    this.atkGap = 0.85; this.knock = 1; this.r = 9; this.label = '小末影人';
  }
}

Mob.prototype.hits = function (x, y) {
  var r = this.r;
  var x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  var y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (var ty = y0; ty <= y1; ty++) {
    for (var tx = x0; tx <= x1; tx++) if (Game.solidAt(tx, ty)) return true;
  }
  return false;
};

/* 朝一个点走一步，返回到目标的距离。被墙挡住时蹭着墙走，别原地抖 */
Mob.prototype.stepToward = function (tx, ty, sp, dt) {
  var dx = tx - this.x, dy = ty - this.y;
  var l = Math.hypot(dx, dy) || 1;
  this.facing.x = dx / l; this.facing.y = dy / l;
  var mx = dx / l * sp * dt, my = dy / l * sp * dt;
  var moved = false;
  if (!this.hits(this.x + mx, this.y)) { this.x += mx; moved = true; }
  if (!this.hits(this.x, this.y + my)) { this.y += my; moved = true; }
  unstick(this);
  if (!moved) {
    this.wallT = (this.wallT || 0) + dt;
    var side = (this.wallSide === undefined) ? (Math.random() < 0.5 ? 1 : -1) : this.wallSide;
    this.wallSide = side;
    var px = -dy / l * sp * dt * side, py = dx / l * sp * dt * side;
    if (!this.hits(this.x + px, this.y)) this.x += px;
    if (!this.hits(this.x, this.y + py)) this.y += py;
    if (this.wallT > 3) { this.wallSide = -side; this.wallT = 0; }
    /* 大块头被彻底卡死时会砸掉挡路的树（石头砸不动，所以石墙仍然安全） */
    if (this.wallT > 1.5 && (this.giant || this.boss || this.flame)) this.smash();
  } else this.wallT = 0;
  this.walk += moved ? dt : dt * 0.25;
  return Math.hypot(tx - this.x, ty - this.y);
};

/* 大怪砸树：清掉面前挡路的那格木头/树叶/木板（石头、冰墙砸不动） */
Mob.prototype.smash = function () {
  var tx = Math.floor((this.x + this.facing.x * (this.r + 10)) / TILE);
  var ty = Math.floor((this.y + this.facing.y * (this.r + 10)) / TILE);
  var o = Game.objAt(tx, ty);
  if (o === O.LOG || o === O.LEAVES || o === O.JTREE || o === O.PLANK || o === O.VINE || o === O.CACTUS || o === O.DIRT || o === O.SANDB) {
    Game.objBreakFast(tx, ty, ODEF[o], null);
    this.wallT = 0;
    this.swing = 0.35;
    return true;
  }
  return false;
};

/* 最近的敌对怪物（友军找敌人 / 敌人找友军） */
Mob.prototype.findFoe = function (range, wantAlly) {
  var best = null, bd = range;
  for (var i = 0; i < Game.mobs.length; i++) {
    var m = Game.mobs[i];
    if (m === this || !m.alive) continue;
    if (wantAlly ? !m.ally : m.ally) continue;
    if (m.passive && !m.aggro) continue;      // 没被惹毛的小野灵/植物，野怪也懒得理它
    var d = dist(m.x, m.y, this.x, this.y);
    if (d < bd) { bd = d; best = m; }
  }
  return best ? { m: best, x: best.x, y: best.y, d: bd } : null;
};

Mob.prototype.nearestPlayer = function () {
  var best = null, bd = 1e9;
  for (var i = 0; i < Game.players.length; i++) {
    var p = Game.players[i];
    if (!p.alive) continue;
    var d = dist(p.x, p.y, this.x, this.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { p: best, x: best.x, y: best.y, d: bd } : null;
};

Mob.prototype.update = function (dt) {
  if (!this.alive) return;
  // 白天灼烧（被附魔策反的自己人不怕太阳；小野灵和植物是白天出来活动的）
  if (!this.ally && !this.plant && !this.catchable && !this.realm && (!Game.isNight() || Maze.active)) {
    this.hp -= dt * 5;
    this.flash = 0.2;
    if (this.hp <= 0) { this.alive = false; return; }
  }
  if (this.atkCd > 0) this.atkCd -= dt;
  if (this.flash > 0) this.flash -= dt;
  var sp = this.speed * (this.ally ? 1.1 : (Game.isNight() ? 1 : 0.6));
  if (this.ally) this.updateAlly(dt, sp);
  else this.updateEnemy(dt, sp);
};

/* 没被惹毛的小野灵/植物：就在原地晃悠，不主动找人打架 */
Mob.prototype.idleWander = function (dt, sp) {
  if (this.plant || !this.floats) return;             // 植物扎在土里，动不了
  this.patrolT -= dt;
  if (this.patrolT <= 0 || !this.patrolTo ||
      dist(this.x, this.y, this.patrolTo.x, this.patrolTo.y) < 14) {
    this.patrolT = 1.6 + Math.random() * 2.6;
    var a = Math.random() * 6.283, rr = 30 + Math.random() * 60;
    this.patrolTo = { x: this.x + Math.cos(a) * rr, y: this.y + Math.sin(a) * rr };
  }
  this.stepToward(this.patrolTo.x, this.patrolTo.y, sp * 0.35, dt);
};

/* 敌方：先被附魔土豆勾过去，其次打友军僵尸，最后才是玩家 */
Mob.prototype.updateEnemy = function (dt, sp) {
  /* 小野灵和植物：你不动它，它不动你 */
  if (this.passive && !this.aggro) { this.idleWander(dt, sp); return; }
  var bait = Game.baitNear(this.x, this.y);
  if (bait) {
    var bd0 = this.stepToward(bait.x, bait.y, sp, dt);
    if (bd0 < 14 + this.r) Game.feedBait(this, bait);
    return;
  }
  var foe = this.findFoe(300, true);      // 附近的友军僵尸
  var pl = this.nearestPlayer();
  var tx, ty, onMob = null;
  if (foe && (!pl || foe.d < pl.d * 1.15)) { tx = foe.x; ty = foe.y; onMob = foe.m; }
  else if (pl) { tx = pl.x; ty = pl.y; }
  else return;
  // 末影人会瞬移靠近
  if (this.type === 'ender') {
    this.tpCd -= dt;
    if (this.tpCd <= 0) {
      this.tpCd = 4 + Math.random() * 3;
      if (Math.hypot(tx - this.x, ty - this.y) > 120) {
        var nx = tx + (Math.random() - 0.5) * 90, ny = ty + (Math.random() - 0.5) * 90;
        if (!this.hits(nx, ny)) { this.x = nx; this.y = ny; }
      }
    }
  }
  /* 炎魔：隔一段距离就喷一颗火球（近身仍然是巴掌） */
  if (this.flame) {
    this.fbCd = (this.fbCd || 0) - dt;
    var pdist = Math.hypot(tx - this.x, ty - this.y);
    if (this.fbCd <= 0 && pdist > 80 && pdist < 430) {
      this.fbCd = 3.0;
      var fa2 = Math.atan2(ty - this.y, tx - this.x);
      Game.bullets.push({
        x: this.x + Math.cos(fa2) * 26, y: this.y + Math.sin(fa2) * 26,
        vx: Math.cos(fa2) * 330, vy: Math.sin(fa2) * 330,
        dmg: 16, life: 1.8, color: '#F97316', size: 7,
        owner: null, hostile: true, burn: true
      });
      Game.say('🔥 炎魔喷出一颗火球！');
    }
  }
  /* 霸王龙：先吼一嗓子把人吓慢，再低头冲锋 */
  if (this.dino) {
    this.roarCd -= dt; this.chargeCd -= dt;
    var dpl = Math.hypot(tx - this.x, ty - this.y);
    if (this.charge > 0) {
      this.charge -= dt;
      sp = this.speed * 3.0;
      if (dpl < 34 + this.r && this.atkCd <= 0) {
        pl.p.hurt(28, this.x, this.y);
        this.atkCd = 1.0; this.charge = 0;
        Game.say('💥 ' + pl.p.name + ' 被霸王龙撞飞了！');
      }
    } else if (this.roarCd <= 0 && dpl < 240) {
      this.roarCd = 9.5; this.roar = 0.7;
      Game.say('🦖 霸王龙仰头咆哮 —— 腿都软了（2.5 秒跑不快）');
      for (var q = 0; q < Game.players.length; q++) {
        if (dist(Game.players[q].x, Game.players[q].y, this.x, this.y) < 210) Game.players[q].slow = 2.5;
      }
    } else if (this.chargeCd <= 0 && dpl > 100 && dpl < 340) {
      this.chargeCd = 7.0; this.charge = 1.1;
      Game.say('🦖 霸王龙低头冲过来了 —— 快闪开！');
    }
    if (this.roar > 0) this.roar -= dt;
  }
  /* 远程野怪（小野灵 / 豆荚炮手）：保持距离射击 */
  if (this.ranged) {
    this.shootCd -= dt;
    var rd = Math.hypot(tx - this.x, ty - this.y);
    this.facing.x = (tx - this.x) / (rd || 1);
    this.facing.y = (ty - this.y) / (rd || 1);
    if (!this.plant) {
      if (rd > this.range * 0.62) this.stepToward(tx, ty, sp, dt);
      else if (rd < 95) this.stepToward(this.x * 2 - tx, this.y * 2 - ty, sp * 0.6, dt);
    }
    if (this.shootCd <= 0 && rd < this.range) {
      this.shootCd = this.gap || 1.4;
      var ra = Math.atan2(ty - this.y, tx - this.x);
      Game.bullets.push({
        x: this.x + Math.cos(ra) * (this.r + 6), y: this.y + Math.sin(ra) * (this.r + 6),
        vx: Math.cos(ra) * (this.bspeed || 330), vy: Math.sin(ra) * (this.bspeed || 330),
        dmg: this.rdmg || 6, life: this.range / (this.bspeed || 330) + 0.15,
        color: this.bcolor || '#A78BFA', size: this.bsize || 5,
        owner: null, hostile: true
      });
    }
  }
  /* 植物扎在土里不会走，只能打贴脸的 */
  if (this.plant) {
    var pd2 = Math.hypot(tx - this.x, ty - this.y);
    if (pd2 < 26 + this.r && this.atkCd <= 0) {
      if (pl.p.riding && !pl.p.riding.dead) pl.p.riding.hurt(this.dmg);
      else pl.p.hurt(this.dmg, this.x, this.y);
      this.atkCd = this.atkGap;
    }
    return;
  }
  var d = this.stepToward(tx, ty, sp, dt);
  if (d < 22 + this.r + (onMob ? onMob.r : 0) && this.atkCd <= 0) {
    if (onMob) {
      if (onMob.alive) onMob.hurt(this.dmg, this.x, this.y, null);
    } else if (pl.p.riding && !pl.p.riding.dead) pl.p.riding.hurt(this.dmg);
    else {
      pl.p.hurt(this.dmg, this.x, this.y);
      if (this.burn && pl.p.alive) pl.p.burn = Math.max(pl.p.burn || 0, 3.2);   // 打中就被点燃
    }
    this.atkCd = this.atkGap;
  }
};

/* 友军：有敌人就冲上去打（机器人会远程点射），没敌人就在主人身边巡逻 */
Mob.prototype.updateAlly = function (dt, sp) {
  var foe = this.findFoe(this.robot ? 520 : 460, false);
  /* 日光花：不打架，专心给主人回血回体力 */
  var host = (this.leader && this.leader.alive) ? this.leader : Game.players[0];
  if (this.healer && host) {
    this.healCd -= dt;
    var hd = dist(this.x, this.y, host.x, host.y);
    if (hd > 140) this.stepToward(host.x, host.y, sp, dt);
    if (this.healCd <= 0 && hd < 240) {
      this.healCd = 3.2;
      host.hp = Math.min(host.maxhp, host.hp + 6);
      host.food = Math.min(host.maxfood, host.food + 2);
      Game.pops.push({ x: host.x, y: host.y, t: 0 });
    }
    this.patrolTo = null;
    return;
  }
  if (foe) {
    if (this.robot || this.ranged) {
      /* 远程帮手（机器人 / 小野灵 / 豆荚炮手）：保持距离点射 */
      this.shootCd -= dt;
      var gd = dist(this.x, this.y, foe.x, foe.y);
      var rg = this.range || 260;
      if (gd > rg * 0.72) this.stepToward(foe.x, foe.y, sp, dt);
      else if (gd < 100) this.stepToward(this.x * 2 - foe.x, this.y * 2 - foe.y, sp * 0.7, dt);
      else {
        this.facing.x = (foe.x - this.x) / (gd || 1);
        this.facing.y = (foe.y - this.y) / (gd || 1);
      }
      if (this.shootCd <= 0 && gd < rg) {
        this.shootCd = this.robot ? 0.75 : (this.gap || 1.3);
        var ang = Math.atan2(foe.y - this.y, foe.x - this.x);
        var bspd = this.robot ? 520 : (this.bspeed || 340);
        Game.bullets.push({
          x: this.x + Math.cos(ang) * 14, y: this.y + Math.sin(ang) * 14,
          vx: Math.cos(ang) * bspd, vy: Math.sin(ang) * bspd,
          dmg: this.robot ? 15 : (this.rdmg || 8),
          life: rg / bspd + 0.1,
          color: this.robot ? '#22D3EE' : (this.bcolor || '#86EFAC'),
          size: this.robot ? 3 : (this.bsize || 5),
          owner: this.recruiter || null, bot: true
        });
      }
      this.patrolTo = null;
      return;
    } else {
      var d = this.stepToward(foe.x, foe.y, sp, dt);
      if (d < 20 + this.r + foe.m.r && this.atkCd <= 0) {
        foe.m.hurt(this.dmg, this.x, this.y, this.recruiter);
        this.atkCd = this.atkGap;
      }
    }
    this.patrolTo = null;
    return;
  }
  var lead = null;
  if (this.leader && this.leader.alive) {
    lead = { p: this.leader, x: this.leader.x, y: this.leader.y, d: dist(this.x, this.y, this.leader.x, this.leader.y) };
  } else lead = this.nearestPlayer();
  if (!lead) return;
  var dd = lead.d;
  if (dd > 760) {                                  // 离太远（换层/跑图）直接跟过去
    this.x = lead.x + (Math.random() - 0.5) * 90;
    this.y = lead.y + (Math.random() - 0.5) * 90;
    unstick(this);
    this.patrolTo = null;
    return;
  }
  if (dd > 120) { this.stepToward(lead.x, lead.y, sp, dt); this.patrolTo = null; return; }
  // 在主人附近溜达
  this.patrolT -= dt;
  if (this.patrolT <= 0 || !this.patrolTo ||
      dist(this.x, this.y, this.patrolTo.x, this.patrolTo.y) < 18) {
    this.patrolT = 1.2 + Math.random() * 2.2;
    var a = Math.random() * 6.283, rr = 45 + Math.random() * 55;
    this.patrolTo = { x: lead.x + Math.cos(a) * rr, y: lead.y + Math.sin(a) * rr };
  }
  this.stepToward(this.patrolTo.x, this.patrolTo.y, sp * 0.55, dt);
};

Mob.prototype.hurt = function (dmg, sx, sy, src) {
  this.hp -= dmg;
  this.aggro = true;                      // 挨了打就记仇，从此主动还手
  this.flash = 0.2;
  var dx = this.x - sx, dy = this.y - sy, l = Math.hypot(dx, dy) || 1;
  var k = 18 * this.knock;
  var nx = this.x + dx / l * k, ny = this.y + dy / l * k;
  if (!this.hits(nx, this.y)) this.x = nx;
  if (!this.hits(this.x, ny)) this.y = ny;
  if (this.hp <= 0) {
    this.alive = false;
    if (this.pet && this.petOf) {
      /* 收服来的帮手倒下：回宠物栏里养伤，歇一歇还能再放出来 */
      this.petOf.petFallen(this.petIdx);
      Game.say('💤 ' + this.label + ' 累趴了，回到宠物栏里歇着（还能再放出来）');
    } else if (this.dino) {
      /* 霸王龙：大陆上最硬的骨头，奖励也最肥 */
      Game.drops.push({ x: this.x, y: this.y, id: 'gold', n: 10, life: 150 });
      Game.drops.push({ x: this.x, y: this.y, id: 'kit', n: 4, life: 150 });
      Game.drops.push({ x: this.x, y: this.y, id: 'epotato', n: 3, life: 150 });
      Game.drops.push({ x: this.x, y: this.y, id: 'cball', n: 3, life: 150 });
      Game.say('🦖 霸王龙被打倒了！！金子、药箱、附魔土豆、驯灵环撒了一地');
      if (src) Game.grantDragonBall(src);
    } else if (this.ally) {
      Game.drops.push({ x: this.x, y: this.y, id: 'coal', n: 1, life: 30 });
      Game.say('💀 小队里的' + this.label + '倒下了（' + Game.allyCount() + '/' + Game.maxAllies + '）');
    } else if (this.giant) {
      Game.drops.push({ x: this.x, y: this.y, id: 'epotato', n: 2, life: 90 });
      Game.drops.push({ x: this.x, y: this.y, id: 'gold', n: 4, life: 90 });
      Game.drops.push({ x: this.x, y: this.y, id: 'kit', n: 2, life: 90 });
      Game.say('🎉 巨人僵尸被打倒了！掉了 2 颗附魔土豆 —— 拿去策反别的僵尸');
      if (src && Math.random() < 0.3) Game.grantDragonBall(src);
    } else if (this.flame) {
      Game.drops.push({ x: this.x, y: this.y, id: 'gold', n: 8, life: 120 });
      Game.drops.push({ x: this.x, y: this.y, id: 'kit', n: 3, life: 120 });
      Game.drops.push({ x: this.x, y: this.y, id: 'epotato', n: 3, life: 120 });
      Game.say('🔥 炎魔被打倒了！金子、药箱、附魔土豆撒了一地');
      if (src && Math.random() < 0.7) Game.grantDragonBall(src);     // 打炎魔最容易出星曜石
    } else if (this.boss) {
      Game.drops.push({ x: this.x, y: this.y, id: 'gold', n: 5, life: 60 });
      Game.drops.push({ x: this.x, y: this.y, id: 'kit', n: 2, life: 60 });
      if (Math.random() < 0.5) Game.drops.push({ x: this.x, y: this.y, id: Math.random() < 0.5 ? 'tank' : 'excavator', n: 1, life: 60 });
      Game.say('🎉 巨怪被打倒了！地上掉了好多东西');
    } else {
      var dropId = this.type === 'zombie' ? 'coal' : (this.type === 'brute' ? 'iron' : 'gold');
      Game.drops.push({ x: this.x, y: this.y, id: dropId, n: this.type === 'brute' ? 2 : 1, life: 40 });
      Game.say('干掉了' + this.label + '！');
    }
    if (src && !this.ally) Quest.onKill(src, this.type);   // 自己人倒下不算打怪任务
  }
};

Mob.prototype.draw = function (ctx) {
  if (!this.alive) return;
  var bob = Math.sin(this.walk * 9) * 2;
  var x = this.x, y = this.y + bob;
  var ssize = this.giant ? 2.0 : (this.boss ? 2.1 : 1);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.ellipse(this.x, this.y + 10 * ssize, 10 * ssize, 4 * ssize, 0, 0, 6.283); ctx.fill();
  /* 可以收服的小家伙：脚下画一圈虚线提示「这个能用驯灵环」；被惹毛了头顶冒怒气 */
  if (this.catchable && !this.ally) {
    if (this.aggro) {
      var ag = Math.sin(Game.time * 9) * 1.6;
      ctx.fillStyle = '#EF4444';
      ctx.beginPath(); ctx.arc(x, y - 27 + ag, 5.4, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x - 0.9, y - 30 + ag, 1.8, 4.4);
      ctx.fillRect(x - 0.9, y - 24.6 + ag, 1.8, 1.8);
    } else {
      ctx.strokeStyle = 'rgba(196,181,253,.55)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 10 * ssize, 13, 5, 0, 0, 6.283); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  if (this.robot) {
    /* 机器人守护者：方脑袋、发光眼睛、胸口有能量核心 */
    var a = Math.sin(this.walk * 10) * 2;
    var dirx = this.facing.x;
    ctx.fillStyle = '#475569';                      // 腿
    ctx.fillRect(x - 7, y + 4 + a * 0.3, 5, 8);
    ctx.fillRect(x + 2, y + 4 - a * 0.3, 5, 8);
    ctx.fillStyle = '#64748B';                      // 身体
    rrect(ctx, x - 9, y - 6, 18, 13, 4); ctx.fill();
    ctx.fillStyle = '#38BDF8';                      // 头
    rrect(ctx, x - 8, y - 17, 16, 13, 4); ctx.fill();
    ctx.fillStyle = '#94A3B8';                      // 头顶高光
    ctx.fillRect(x - 8, y - 17, 16, 3);
    ctx.fillStyle = '#0F172A';                      // 眼窝
    ctx.fillRect(x - 5.5, y - 12, 4, 4.5);
    ctx.fillRect(x + 1.5, y - 12, 4, 4.5);
    ctx.fillStyle = '#22D3EE';                      // 发光眼（会跟着朝向偏一点）
    ctx.fillRect(x - 5.5 + dirx * 1.2, y - 11.2, 2.4, 3);
    ctx.fillRect(x + 1.5 + dirx * 1.2, y - 11.2, 2.4, 3);
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 2;  // 天线
    ctx.beginPath(); ctx.moveTo(x + 5, y - 17); ctx.lineTo(x + 6, y - 23); ctx.stroke();
    var blink = 0.5 + 0.5 * Math.sin(Game.time * 6);
    ctx.fillStyle = 'rgba(251,191,36,' + (0.55 + blink * 0.45) + ')';
    ctx.beginPath(); ctx.arc(x + 6, y - 24, 2.2, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#22D3EE';                      // 胸口能量核心
    ctx.beginPath(); ctx.arc(x, y + 1, 3.4, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#475569';                      // 手臂（右手是炮）
    ctx.fillRect(x - 13, y - 5, 5, 11);
    ctx.fillRect(x + 9, y - 5, 4, 9);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(x + 9 + dirx * 3, y - 6, 8, 3.5);
  } else if (this.dino) {
    /* 霸王龙：大陆上最吓人的东西，尾巴、背棘、血盆大口一样都不少 */
    var ds = 1.85, ddir = this.facing.x >= 0 ? 1 : -1;
    var dstep = Math.sin(this.walk * 7) * 3;
    if (this.charge > 0) {                     // 冲锋：身后扬起的尘土
      ctx.fillStyle = 'rgba(180,150,110,.45)';
      for (var du = 0; du < 4; du++) {
        ctx.beginPath();
        ctx.arc(x - ddir * (16 + du * 11), y + 8 - du * 3, 8 - du, 0, 6.283);
        ctx.fill();
      }
    }
    if (this.roar > 0) {                       // 咆哮：一圈红色冲击波
      var rr2 = (0.7 - this.roar) / 0.7;
      ctx.strokeStyle = 'rgba(248,113,113,' + (1 - rr2) * 0.8 + ')';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y - 4, 30 + rr2 * 160, 0, 6.283); ctx.stroke();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(ddir * ds, ds);
    ctx.fillStyle = '#3B6231';                 // 尾巴
    ctx.beginPath();
    ctx.moveTo(-8, -2); ctx.quadraticCurveTo(-24, -6, -32, 6);
    ctx.lineTo(-29, 10); ctx.quadraticCurveTo(-20, 3, -8, 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2F4D27';                 // 后腿
    ctx.fillRect(-7 + dstep * 0.3, 3, 7, 14);
    ctx.fillRect(3 - dstep * 0.3, 3, 7, 14);
    ctx.fillStyle = '#243D1E';                 // 大脚掌
    ctx.fillRect(-9 + dstep * 0.3, 15, 12, 5);
    ctx.fillRect(1 - dstep * 0.3, 15, 12, 5);
    ctx.fillStyle = this.color;                // 身体
    rrect(ctx, -12, -12, 23, 20, 9); ctx.fill();
    ctx.fillStyle = '#C8D96B';                 // 浅色肚皮
    rrect(ctx, -8, -3, 15, 10, 5); ctx.fill();
    ctx.fillStyle = '#2F4D27';                 // 背棘
    for (var dk = 0; dk < 4; dk++) {
      ctx.beginPath();
      ctx.moveTo(-8 + dk * 5, -12); ctx.lineTo(-5.5 + dk * 5, -18.5); ctx.lineTo(-3 + dk * 5, -12);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#3B6231';                 // 那双著名的小短手
    ctx.fillRect(6, -6, 8, 3.5);
    ctx.fillRect(7, -2.5, 5, 3);
    var jaw = (this.roar > 0 || this.charge > 0) ? 5.5 : 0;
    ctx.fillStyle = '#3B6231';                 // 下颌
    rrect(ctx, 10, -4 + jaw, 16, 8, 3); ctx.fill();
    ctx.fillStyle = this.color;                // 头
    rrect(ctx, 6, -17, 21, 14, 5); ctx.fill();
    ctx.fillStyle = '#FFFFFF';                 // 上下两排牙
    for (var dt2 = 0; dt2 < 5; dt2++) {
      ctx.beginPath();
      ctx.moveTo(11 + dt2 * 3.2, -5); ctx.lineTo(13.4 + dt2 * 3.2, -5); ctx.lineTo(12.2 + dt2 * 3.2, -1 + jaw * 0.35);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(11 + dt2 * 3.2, -3.5 + jaw); ctx.lineTo(13.4 + dt2 * 3.2, -3.5 + jaw); ctx.lineTo(12.2 + dt2 * 3.2, -8 + jaw);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#FDE047';                 // 凶狠的竖瞳
    ctx.beginPath(); ctx.arc(14.5, -12, 2.8, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.fillRect(14.2, -13.6, 1.6, 3.4);
    ctx.fillStyle = '#2F4D27';
    ctx.fillRect(24, -13.5, 2, 2);
    ctx.restore();
    if (this.alive && !this.ally) {            // Boss 血条
      var bw = 66, bh = 6;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - bw / 2, y - 40, bw, bh);
      ctx.fillStyle = '#EF4444'; ctx.fillRect(x - bw / 2, y - 40, bw * Math.max(0, this.hp / this.maxhp), bh);
    }
  } else if (this.type === 'fairy') {
    /* 小野灵：飘在半空的小光球，两片薄翅膀，一闪一闪 */
    var fy = y - 7 + Math.sin(Game.time * 3 + this.x * 0.04) * 3;
    ctx.fillStyle = 'rgba(196,181,253,.22)';
    ctx.beginPath(); ctx.arc(x, fy, 17, 0, 6.283); ctx.fill();
    var fw = Math.sin(Game.time * 16) * 2.2;
    ctx.fillStyle = 'rgba(255,255,255,.72)';   // 翅膀（会抖）
    ctx.beginPath(); ctx.ellipse(x - 10, fy - 3 - fw * 0.3, 7, 4.4, -0.55, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 10, fy - 3 + fw * 0.3, 7, 4.4, 0.55, 0, 6.283); ctx.fill();
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(x, fy, 8.5, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#EDE9FE';
    ctx.beginPath(); ctx.arc(x - 2.4, fy - 2.6, 4.6, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#312E81';                 // 眼睛
    ctx.fillRect(x - 4.4, fy - 2, 2.2, 2.8);
    ctx.fillRect(x + 2.2, fy - 2, 2.2, 2.8);
    ctx.fillStyle = '#FBBF24';                 // 头顶转圈的小星星
    var sa2 = Game.time * 3.4;
    ctx.beginPath(); ctx.arc(x + Math.cos(sa2) * 12, fy - 13 + Math.sin(sa2) * 2.5, 2.2, 0, 6.283); ctx.fill();
  } else if (this.type === 'peashooter') {
    /* 豆荚炮手：一根绿茎顶着炮管脑袋 */
    ctx.fillStyle = '#3F7A2E'; ctx.fillRect(x - 3, y - 4, 6, 14);        // 茎
    ctx.fillStyle = '#4E8B3A';                                            // 两片叶子
    ctx.beginPath(); ctx.ellipse(x - 8, y + 6, 6, 3.4, 0.3, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 8, y + 7, 6, 3.4, -0.3, 0, 6.283); ctx.fill();
    ctx.fillStyle = this.color;                                           // 头
    ctx.beginPath(); ctx.arc(x, y - 8, 9, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#2F6B2A';                                            // 炮管（跟着朝向转）
    ctx.save();
    ctx.translate(x, y - 8);
    ctx.rotate(Math.atan2(this.facing.y, this.facing.x));
    ctx.fillRect(4, -4, 14, 8);
    ctx.fillStyle = '#1B4A18'; ctx.fillRect(14, -5, 5, 10);
    ctx.restore();
    ctx.fillStyle = '#14532D';                                            // 眼睛
    ctx.fillRect(x - 5, y - 11, 3, 3.4);
    ctx.fillRect(x + 2, y - 11, 3, 3.4);
  } else if (this.type === 'sunflower') {
    /* 日光花：一张笑脸，头顶一圈花瓣 */
    ctx.fillStyle = '#3F7A2E'; ctx.fillRect(x - 3, y - 2, 6, 14);
    ctx.fillStyle = '#4E8B3A';
    ctx.beginPath(); ctx.ellipse(x - 8, y + 8, 6, 3.2, 0.3, 0, 6.283); ctx.fill();
    var sw2 = Math.sin(Game.time * 2) * 0.06;
    ctx.save();
    ctx.translate(x, y - 8); ctx.rotate(sw2);
    ctx.fillStyle = '#FBBF24';
    for (var pt2 = 0; pt2 < 10; pt2++) {                                  // 花瓣
      var pa = pt2 / 10 * 6.283;
      ctx.beginPath();
      ctx.ellipse(Math.cos(pa) * 11, Math.sin(pa) * 11, 5.4, 3.6, pa, 0, 6.283);
      ctx.fill();
    }
    ctx.fillStyle = '#92400E';                                            // 花盘
    ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#78350F';
    for (var sd = 0; sd < 6; sd++) {                                      // 瓜子
      var sda = sd / 6 * 6.283;
      ctx.beginPath(); ctx.arc(Math.cos(sda) * 5, Math.sin(sda) * 5, 1.5, 0, 6.283); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#1F2937';                                            // 笑脸
    ctx.fillRect(x - 4.5, y - 11, 2.6, 3.2);
    ctx.fillRect(x + 2, y - 11, 2.6, 3.2);
    ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y - 6, 4, 0.25, Math.PI - 0.25); ctx.stroke();
  } else if (this.type === 'wallnut') {
    /* 岩壳仔：一颗结结实实的大坚果，被打得越狠表情越难受 */
    var hurt2 = 1 - Math.max(0, this.hp / this.maxhp);
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.ellipse(x, y - 3, 13, 15, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#D97706';
    ctx.beginPath(); ctx.ellipse(x - 4, y - 8, 6, 8, -0.3, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#78350F';                                            // 头顶的小尖
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 17); ctx.lineTo(x, y - 22); ctx.lineTo(x + 3, y - 17);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1F2937';                                            // 眼睛（血越少越眯）
    var eh2 = 3.2 - hurt2 * 1.6;
    ctx.fillRect(x - 6, y - 6, 3.4, eh2);
    ctx.fillRect(x + 2.6, y - 6, 3.4, eh2);
    ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 1.6;                     // 嘴
    ctx.beginPath();
    if (hurt2 > 0.6) ctx.arc(x, y + 5, 4, Math.PI + 0.3, -0.3);
    else ctx.arc(x, y, 4, 0.3, Math.PI - 0.3);
    ctx.stroke();
    if (hurt2 > 0.5) {                                                    // 裂纹
      ctx.strokeStyle = 'rgba(69,26,3,.7)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - 10, y - 2); ctx.lineTo(x - 5, y + 3); ctx.lineTo(x - 8, y + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 11, y - 4); ctx.lineTo(x + 6, y + 1); ctx.lineTo(x + 9, y + 7); ctx.stroke();
    }
  } else if (this.flame) {
    /* 炎魔：浑身冒火的巨大恶魔 */
    var fs = 2.0;
    var flick = 0.5 + 0.5 * Math.sin(Game.time * 9);
    ctx.fillStyle = 'rgba(249,115,22,.28)';         // 火光
    ctx.beginPath(); ctx.arc(x, y, 30 + flick * 5, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#7A1A08';                      // 粗腿
    ctx.fillRect(x - 11 * fs, y - 1 * fs, 8 * fs, 12 * fs);
    ctx.fillRect(x + 3 * fs, y - 1 * fs, 8 * fs, 12 * fs);
    ctx.fillStyle = '#DC2626';                      // 熔岩身体
    rrect(ctx, x - 12 * fs, y - 12 * fs, 24 * fs, 21 * fs, 9); ctx.fill();
    ctx.fillStyle = '#F97316';                      // 胸口岩浆裂纹
    ctx.fillRect(x - 8 * fs, y - 8 * fs, 4 * fs, 10 * fs);
    ctx.fillRect(x + 1 * fs, y - 6 * fs, 3 * fs, 8 * fs);
    ctx.fillRect(x - 3 * fs, y - 1 * fs, 8 * fs, 3 * fs);
    ctx.fillStyle = '#991B1B';                      // 手臂
    ctx.fillRect(x - 19 * fs, y - 10 * fs, 7 * fs, 16 * fs);
    ctx.fillRect(x + 12 * fs, y - 10 * fs, 7 * fs, 16 * fs);
    ctx.fillStyle = '#F59E0B';                      // 燃烧的拳头
    ctx.beginPath(); ctx.arc(x - 15.5 * fs, y + 7 * fs, 5 * fs, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 15.5 * fs, y + 7 * fs, 5 * fs, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#450A0A';                      // 头
    rrect(ctx, x - 9 * fs, y - 20 * fs, 18 * fs, 11 * fs, 5); ctx.fill();
    ctx.fillStyle = '#FDE047';                      // 眼睛（越怒越亮）
    ctx.fillRect(x - 6 * fs, y - 17 * fs, 4.5 * fs, 3.4 * fs);
    ctx.fillRect(x + 1.5 * fs, y - 17 * fs, 4.5 * fs, 3.4 * fs);
    ctx.fillStyle = '#FBBF24';                      // 头上的角
    ctx.beginPath();
    ctx.moveTo(x - 8 * fs, y - 19 * fs); ctx.lineTo(x - 6 * fs, y - 27 * fs); ctx.lineTo(x - 3 * fs, y - 19 * fs);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 3 * fs, y - 19 * fs); ctx.lineTo(x + 6 * fs, y - 27 * fs); ctx.lineTo(x + 8 * fs, y - 19 * fs);
    ctx.closePath(); ctx.fill();
    for (var fk = 0; fk < 4; fk++) {                // 头顶飘的火星
      var fa = Game.time * 2.2 + fk * 1.7;
      ctx.fillStyle = 'rgba(251,191,36,' + (0.75 - (fk % 2) * 0.3) + ')';
      ctx.beginPath();
      ctx.arc(x + Math.cos(fa) * 14, y - 26 * fs - (Math.sin(fa) * 4 + fk * 3), 2 + (fk % 2), 0, 6.283);
      ctx.fill();
    }
  } else if (this.giant) {
    /* 巨人僵尸：三层楼高的绿皮大家伙，拖着一根木头棒子 */
    var g = 1.95;
    ctx.fillStyle = '#2C4A22';                       // 腿
    ctx.fillRect(x - 10 * g, y - 1 * g, 7 * g, 11 * g);
    ctx.fillRect(x + 3 * g, y - 1 * g, 7 * g, 11 * g);
    ctx.fillStyle = this.color;                      // 身体
    rrect(ctx, x - 11 * g, y - 11 * g, 22 * g, 20 * g, 8); ctx.fill();
    ctx.fillStyle = '#5B6E8C';                       // 破背心
    ctx.fillRect(x - 11 * g, y - 3 * g, 22 * g, 7 * g);
    ctx.fillStyle = '#43536B';
    ctx.fillRect(x - 11 * g, y + 2 * g, 8 * g, 3 * g);
    ctx.fillRect(x + 3 * g, y + 3 * g, 7 * g, 2.5 * g);
    ctx.fillStyle = '#4E7A2A';                       // 长手臂
    ctx.fillRect(x - 17 * g, y - 9 * g, 6 * g, 15 * g);
    ctx.fillRect(x + 11 * g, y - 9 * g, 6 * g, 15 * g);
    ctx.fillStyle = '#8DC153';                       // 头
    ctx.beginPath(); ctx.arc(x, y - 13 * g, 9 * g, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#FDE047';                       // 发光的眼睛
    ctx.fillRect(x - 5.5 * g, y - 15 * g, 3.6 * g, 3.2 * g);
    ctx.fillRect(x + 2 * g, y - 15 * g, 3.6 * g, 3.2 * g);
    ctx.strokeStyle = '#2C4A22'; ctx.lineWidth = 1.6 * g;   // 缝合的嘴
    ctx.beginPath();
    ctx.moveTo(x - 6 * g, y - 10 * g); ctx.lineTo(x + 6 * g, y - 10 * g); ctx.stroke();
    for (var st = -2; st <= 2; st++) {
      ctx.beginPath();
      ctx.moveTo(x + st * 2.6 * g, y - 11.6 * g); ctx.lineTo(x + st * 2.6 * g, y - 8.4 * g);
      ctx.stroke();
    }
    ctx.fillStyle = '#6B4A2B';                       // 木头棒子
    var sw = Math.sin(this.walk * 5) * 0.25;
    ctx.save();
    ctx.translate(x + 14 * g, y - 2 * g); ctx.rotate(sw);
    ctx.fillRect(-2.5 * g, -9 * g, 5 * g, 20 * g);
    ctx.fillStyle = '#8A6238';
    ctx.fillRect(-3.4 * g, 4 * g, 6.8 * g, 8 * g);
    ctx.restore();
  } else if (this.boss) {
    var bs = 2.1;
    ctx.fillStyle = this.color;
    rrect(ctx, x - 11 * bs, y - 9 * bs, 22 * bs, 19 * bs, 8); ctx.fill();
    ctx.fillStyle = '#A33A3A';
    ctx.beginPath(); ctx.arc(x, y - 10 * bs, 10 * bs, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#FDE047';                       // 发光的眼睛
    ctx.fillRect(x - 6 * bs, y - 12 * bs, 4 * bs, 3.4 * bs);
    ctx.fillRect(x + 2 * bs, y - 12 * bs, 4 * bs, 3.4 * bs);
    ctx.fillStyle = '#6B1F1F';                       // 大拳头
    ctx.fillRect(x - 17 * bs, y - 3 * bs, 7 * bs, 8 * bs);
    ctx.fillRect(x + 10 * bs, y - 3 * bs, 7 * bs, 8 * bs);
    ctx.fillStyle = '#F5F5DC';                       // 獠牙
    ctx.beginPath();
    ctx.moveTo(x - 4 * bs, y - 6 * bs); ctx.lineTo(x - 1.5 * bs, y - 2 * bs); ctx.lineTo(x - 0.5 * bs, y - 6 * bs);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 0.5 * bs, y - 6 * bs); ctx.lineTo(x + 1.5 * bs, y - 2 * bs); ctx.lineTo(x + 4 * bs, y - 6 * bs);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#F5F5DC';                       // 大角
    ctx.beginPath();
    ctx.moveTo(x - 9 * bs, y - 15 * bs); ctx.lineTo(x - 6 * bs, y - 24 * bs); ctx.lineTo(x - 3 * bs, y - 15 * bs);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 3 * bs, y - 15 * bs); ctx.lineTo(x + 6 * bs, y - 24 * bs); ctx.lineTo(x + 9 * bs, y - 15 * bs);
    ctx.closePath(); ctx.fill();
  } else if (this.type === 'brute') {
    var s = 1.35;
    ctx.fillStyle = this.color;
    rrect(ctx, x - 12 * s, y - 9 * s, 24 * s, 20 * s, 7); ctx.fill();
    ctx.fillStyle = '#5F9133';
    ctx.beginPath(); ctx.arc(x, y - 10 * s, 10 * s, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#22303F';
    ctx.fillRect(x - 6 * s, y - 12 * s, 4 * s, 4.4 * s);
    ctx.fillRect(x + 2 * s, y - 12 * s, 4 * s, 4.4 * s);
    ctx.fillStyle = '#3B5F1F';                      // 大拳头
    ctx.fillRect(x - 17 * s, y - 2 * s, 7 * s, 6 * s);
    ctx.fillRect(x + 10 * s, y - 2 * s, 7 * s, 6 * s);
    ctx.fillStyle = '#FDE68A';                      // 小尖角
    ctx.beginPath();
    ctx.moveTo(x - 6 * s, y - 17 * s); ctx.lineTo(x - 3 * s, y - 22 * s); ctx.lineTo(x - 1 * s, y - 17 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 1 * s, y - 17 * s); ctx.lineTo(x + 4 * s, y - 22 * s); ctx.lineTo(x + 6 * s, y - 17 * s);
    ctx.closePath(); ctx.fill();
  } else if (this.type === 'zombie') {
    ctx.fillStyle = this.color;
    rrect(ctx, x - 9, y - 8, 18, 17, 6); ctx.fill();
    ctx.fillStyle = '#8DC153';
    ctx.beginPath(); ctx.arc(x, y - 8, 8, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#22303F';
    ctx.fillRect(x - 4.5, y - 10, 3, 3.4); ctx.fillRect(x + 1.5, y - 10, 3, 3.4);
    ctx.fillStyle = '#5A7F2E';
    ctx.fillRect(x - 12, y - 2, 5, 4); ctx.fillRect(x + 7, y - 2, 5, 4);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(x - 2, y - 5, 4, 2);
  } else {
    ctx.fillStyle = this.color;
    rrect(ctx, x - 8, y - 12, 16, 22, 5); ctx.fill();
    ctx.fillStyle = '#C4A3F2';
    ctx.beginPath(); ctx.arc(x, y - 12, 8, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 5, y - 14, 4, 4.5); ctx.fillRect(x + 1, y - 14, 4, 4.5);
    ctx.fillStyle = '#2A1B3D';
    ctx.fillRect(x - 4, y - 13, 2.2, 2.6); ctx.fillRect(x + 2, y - 13, 2.2, 2.6);
    ctx.fillStyle = '#8A5BD6';
    ctx.fillRect(x - 11, y - 6, 4, 12); ctx.fillRect(x + 7, y - 6, 4, 12);
  }
  if (this.flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (this.flash * 2) + ')';
    rrect(ctx, x - 9 * ssize, y - 12 * ssize, 18 * ssize, 22 * ssize, 6); ctx.fill();
  }
  /* 被策反的自己人：脚下彩虹圈 + 头顶「友」字 */
  if (this.ally) {
    var hue = (Game.time * 90) % 360;
    ctx.strokeStyle = 'hsla(' + hue + ',92%,66%,.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 11 * ssize, 12 * ssize, 5.5 * ssize, 0, 0, 6.283);
    ctx.stroke();
    ctx.strokeStyle = 'hsla(' + ((hue + 120) % 360) + ',92%,70%,.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 11 * ssize, 15 * ssize, 7 * ssize, 0, 0, 6.283);
    ctx.stroke();
    ctx.font = 'bold ' + Math.round(11 * Math.min(ssize, 1.6)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,16,28,.7)';
    ctx.fillText('友', this.x, this.y - (this.giant ? 40 : (this.boss ? 34 : 27)));
    ctx.fillStyle = '#BEF264';
    ctx.fillText('友', this.x, this.y - (this.giant ? 41 : (this.boss ? 35 : 28)));
    ctx.textAlign = 'left';
  }
  // 血条（大怪用更宽的条）
  if (this.hp < this.maxhp || this.boss || this.giant) {
    var bw = (this.boss || this.giant) ? 60 : 24, bh = (this.boss || this.giant) ? 7 : 4;
    var by = this.flame ? y - 34 : (this.giant ? y - 34 : (this.boss ? y - 30 : y - 24));
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - bw / 2, by, bw, bh);
    ctx.fillStyle = this.ally ? '#BEF264' : ((this.boss || this.giant) ? '#FBBF24' : '#EF4444');
    ctx.fillRect(x - bw / 2, by, bw * Math.max(0, this.hp / this.maxhp), bh);
  }
};
