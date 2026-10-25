/* 载具：挖掘机（挖得快）和坦克（撞怪、碾碎木头） */
function Vehicle(type, x, y) {
  this.type = type;
  this.x = x; this.y = y;
  this.angle = 0;
  this.r = 15;
  this.driver = null;
  this.dead = false;
  this.flash = 0;
  this.dig = 0;
  this.cd = 0;                // 开炮冷却
  this.recoil = 0;            // 后坐动画
  if (type === 'tank') {
    this.hp = 70; this.speed = 205; this.ram = 18; this.name = '坦克';
  } else {
    this.hp = 50; this.speed = 168; this.ram = 8; this.name = '挖掘机';
  }
  this.maxhp = this.hp;
}

Vehicle.prototype.hits = function (x, y) {
  var r = this.r;
  var x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  var y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (var ty = y0; ty <= y1; ty++) {
    for (var tx = x0; tx <= x1; tx++) if (Game.solidAt(tx, ty)) return true;
  }
  return false;
};

Vehicle.prototype.update = function (dt) {
  if (this.dead) return;
  if (this.flash > 0) this.flash -= dt;
  if (this.dig > 0) this.dig -= dt;
  if (this.cd > 0) this.cd -= dt;
  if (this.recoil > 0) this.recoil -= dt;

  var d = this.driver;
  if (!d || !d.alive) { if (this.driver) { this.driver.riding = null; this.driver = null; } return; }

  var ax = 0, ay = 0;
  if (Input.down(d.ctl.left)) ax -= 1;
  if (Input.down(d.ctl.right)) ax += 1;
  if (Input.down(d.ctl.up)) ay -= 1;
  if (Input.down(d.ctl.down)) ay += 1;
  if (ax || ay) {
    var l = Math.hypot(ax, ay);
    ax /= l; ay /= l;
    this.angle = Math.atan2(ay, ax);
    var nx = this.x + ax * this.speed * dt, ny = this.y + ay * this.speed * dt;
    if (!this.hits(nx, this.y)) this.x = nx;
    if (!this.hits(this.x, ny)) this.y = ny;
    unstick(this);
  }
  d.x = this.x; d.y = this.y;

  // 撞怪物（自己人就别撞了）
  for (var i = 0; i < Game.mobs.length; i++) {
    var m = Game.mobs[i];
    if (!m.alive || m.ally) continue;
    if (dist(m.x, m.y, this.x, this.y) < 26) {
      m.hurt(this.ram, this.x, this.y, d);
      this.flash = 0.15;
    }
  }
  // 坦克碾压：撞碎木头/树叶/玩家搭的墙
  if (this.type === 'tank') {
    var tx = Math.floor(this.x / TILE), ty = Math.floor(this.y / TILE);
    for (var oy = -1; oy <= 1; oy++) {
      for (var ox = -1; ox <= 1; ox++) {
        var o = Game.objAt(tx + ox, ty + oy);
        if (o === O.LOG || o === O.LEAVES || o === O.PLANK || o === O.DIRT || o === O.SANDB) {
          var def = ODEF[o];
          Game.objBreakFast(tx + ox, ty + oy, def, d);
        }
      }
    }
  }
  // 坦克开炮：按挖掘键，打出去一发会炸的炮弹
  if (this.type === 'tank' && Input.pressed(d.ctl.mine)) this.fire(d);
  // 挖掘机：按住挖掘键，铲掉前方一片
  if (this.type === 'excavator' && Input.down(d.ctl.mine)) {
    this.dig = 0.2;
    var fx = Math.cos(this.angle), fy = Math.sin(this.angle);
    for (var k = 1; k <= 2; k++) {
      var cx = Math.floor((this.x + fx * 24 * k) / TILE);
      var cy = Math.floor((this.y + fy * 24 * k) / TILE);
      for (var oy2 = -1; oy2 <= 1; oy2++) {
        for (var ox2 = -1; ox2 <= 1; ox2++) {
          var ob = Game.objAt(cx + ox2, cy + oy2);
          var od = ODEF[ob];
          if (od && od.solid && od.hard < 900) Game.objBreakFast(cx + ox2, cy + oy2, od, d);
        }
      }
    }
  }
};

/* 开炮：一发会小范围爆炸的炮弹（有冷却） */
Vehicle.prototype.fire = function (d) {
  if (this.cd > 0) return;
  this.cd = 0.8;
  this.recoil = 0.22;
  var a = this.angle;
  var muzzle = 22 - (this.recoil > 0.1 ? 5 : 0);
  Game.bullets.push({
    x: this.x + Math.cos(a) * muzzle, y: this.y + Math.sin(a) * muzzle,
    vx: Math.cos(a) * 660, vy: Math.sin(a) * 660,
    dmg: 40, life: 1.0, color: '#FBBF24', size: 7,
    owner: d || null, shell: true
  });
  Game.pops.push({ x: this.x + Math.cos(a) * 26, y: this.y + Math.sin(a) * 26, t: 0, kind: 'muzzle', a: a });
};

Vehicle.prototype.hurt = function (n) {
  this.hp -= n;
  this.flash = 0.2;
  if (this.hp <= 0) {
    this.dead = true;
    if (this.driver) { this.driver.riding = null; this.driver = null; }
    Game.say('载具报废了…');
  }
};

Vehicle.prototype.draw = function (ctx) {
  if (this.dead) return;
  ctx.save();
  ctx.translate(this.x, this.y);
  ctx.rotate(this.angle);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(-16, -13, 32, 26);

  if (this.type === 'tank') {
    ctx.fillStyle = '#3F4A5A';
    ctx.fillRect(-15, -12, 30, 10);          // 左履带
    ctx.fillRect(-15, 2, 30, 10);            // 右履带
    ctx.fillStyle = '#64748B';
    ctx.fillRect(-14, -9, 28, 18);           // 车身
    ctx.fillStyle = '#475569';
    ctx.fillRect(-8, -7, 16, 14);
    ctx.fillStyle = '#7A8798';
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, 6.283); ctx.fill();
    var rc = this.recoil > 0 ? -6 : 0;        // 开炮时炮管缩一下
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(4 + rc, -2.5, 18, 5);        // 炮管
    ctx.fillStyle = '#FBBF24';
    ctx.fillRect(20 + rc, -3.5, 3.5, 7);      // 炮口
  } else {
    ctx.fillStyle = '#2F3A4A';
    ctx.fillRect(-15, -12, 30, 9);
    ctx.fillRect(-15, 3, 30, 9);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-13, -9, 26, 18);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-6, -7, 12, 14);
    ctx.fillStyle = '#FDE68A';
    ctx.fillRect(2, -6, 8, 12);              // 驾驶室
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    var reach = this.dig > 0 ? 20 : 14;
    ctx.lineTo(reach, this.dig > 0 ? -6 : 0);
    ctx.stroke();
    ctx.fillStyle = '#92400E';
    ctx.fillRect(reach - 3, (this.dig > 0 ? -12 : -5), 8, 10);   // 铲斗
  }
  if (this.flash > 0) {
    ctx.fillStyle = 'rgba(255,120,120,' + (this.flash * 2) + ')';
    ctx.fillRect(-16, -13, 32, 26);
  }
  ctx.restore();

  if (this.hp < this.maxhp) {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(this.x - 18, this.y - 26, 36, 5);
    ctx.fillStyle = '#F59E0B'; ctx.fillRect(this.x - 18, this.y - 26, 36 * (this.hp / this.maxhp), 5);
  }
  if (!this.driver) {
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = '#FDE68A';
    ctx.fillText('按 F / 上车', this.x, this.y - 30);
    ctx.textAlign = 'left';
  }
};
