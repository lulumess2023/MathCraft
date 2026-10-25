/* 物品、合成配方、背包、物品小图标 */
var HOTBAR = 9;

var ITEMS = {
  dirt:   { name: '泥块', color: '#8B5A2B', ch: '土', place: O.DIRT },
  stone:  { name: '石块', color: '#8A8A8A', ch: '石', place: O.STONEB },
  sand:   { name: '沙块', color: '#E0D3A0', ch: '沙', place: O.SANDB },
  log:    { name: '木头', color: '#6B4A2B', ch: '木', place: O.LOG },
  plank:  { name: '木板', color: '#B07C46', ch: '板', place: O.PLANK },
  stick:  { name: '木棍', color: '#A97B4F', ch: '棍' },
  coal:   { name: '煤',   color: '#2B2B2B', ch: '煤' },
  iron:   { name: '铁',   color: '#C98A5B', ch: '铁' },
  gold:   { name: '金',   color: '#F2C744', ch: '金' },
  apple:  { name: '苹果', color: '#E23B3B', ch: '果', food: 6 },
  /* 附魔土豆：扔在地上当诱饵，僵尸吃了就倒戈加入你的小队 */
  epotato: { name: '附魔土豆', color: '#A855F7', ch: '薯', bait: true },
  torch:  { name: '火把', color: '#FFD36B', ch: '火', place: O.TORCH },
  kit:    { name: '药箱', color: '#EF4444', ch: '药', heal: 14 },
  /* 带 up 标记的武器/工具：重复拿到就会升级（最多 5 级），伤害、射速、挖掘速度都会涨 */
  waxe:   { name: '木斧', color: '#B07C46', ch: '斧', tool: 'axe', tier: 1, dmg: 3, up: true },
  wpick:  { name: '木镐', color: '#B07C46', ch: '镐', tool: 'pick', tier: 1, dmg: 2, up: true },
  spick:  { name: '石镐', color: '#8A8A8A', ch: '镐', tool: 'pick', tier: 2, dmg: 3, up: true },
  wsword: { name: '木剑', color: '#C89B6A', ch: '剑', dmg: 5, up: true },
  ssword: { name: '石剑', color: '#B9B9B9', ch: '剑', dmg: 8, up: true },
  /* 远程武器：有怪自动开火 */
  dagger: { name: '飞刀', color: '#CBD5E1', ch: '刀', dmg: 4, up: true, gun: { dmg: 14, rate: 1.1, range: 230, speed: 430, color: '#E2E8F0', size: 4 } },
  pistol: { name: '手枪', color: '#475569', ch: '枪', dmg: 2, up: true, gun: { dmg: 9, rate: 2.4, range: 330, speed: 560, color: '#FBBF24', size: 3 } },
  mgun:   { name: '机枪', color: '#334155', ch: '机', dmg: 2, up: true, gun: { dmg: 6, rate: 6.5, range: 400, speed: 720, color: '#FDE047', size: 3 } },
  excavator: { name: '挖掘机', color: '#F59E0B', ch: '挖', vehicle: 'excavator' },
  tank:   { name: '坦克', color: '#64748B', ch: '坦', vehicle: 'tank' },
  /* 驯灵环：朝野怪扔过去，血越少越好抓，抓到就进你的宠物栏 */
  cball:  { name: '驯灵环', color: '#EF4444', ch: '球', capture: true },
  /* 机器人守护者：召唤出来替你打架（比僵尸小队硬） */
  robot:  { name: '机器人守护者', color: '#38BDF8', ch: '机', summon: 'robot' },
  ice:    { name: '冰',   color: '#9FD4EE', ch: '冰', place: O.ICEWALL },
  /* 七颗星曜石：集齐 7 颗能召唤星龙许一个愿 */
  db1: { name: '一星星曜石', color: '#F59E0B', ch: '①', ball: 1 },
  db2: { name: '二星星曜石', color: '#F59E0B', ch: '②', ball: 2 },
  db3: { name: '三星星曜石', color: '#F59E0B', ch: '③', ball: 3 },
  db4: { name: '四星星曜石', color: '#F59E0B', ch: '④', ball: 4 },
  db5: { name: '五星星曜石', color: '#F59E0B', ch: '⑤', ball: 5 },
  db6: { name: '六星星曜石', color: '#F59E0B', ch: '⑥', ball: 6 },
  db7: { name: '七星星曜石', color: '#F59E0B', ch: '⑦', ball: 7 }
};

/* ---------------- 武器升级 ----------------
   同一把武器反复拿到 → 升级（最多 5 级），伤害 / 射速 / 挖掘速度跟着涨 */
var WUP_MAX = 5;

function wLv(p, id) { return (p && p.wlv && p.wlv[id]) || 0; }

/* 近战伤害（含等级加成） */
function wDmg(p, held) {
  if (!held) return 0;
  var d = held.def.dmg || 0;
  if (!d) return 0;
  return Math.round(d * (1 + 0.4 * wLv(p, held.id)));
}
/* 挖掘档位（含等级加成） */
function wTier(p, held) {
  if (!held) return 1;
  return (held.def.tier || 1) + wLv(p, held.id) * 0.5;
}
/* 枪械属性（含等级加成，按 id+等级缓存，别每帧新建对象） */
var _gunCache = {};
function wGun(p, held) {
  if (!held) return null;
  var g = held.def.gun;
  if (!g) return null;
  var lv = wLv(p, held.id);
  if (!lv) return g;
  var key = held.id + '#' + lv;
  var c = _gunCache[key];
  if (!c) {
    c = _gunCache[key] = {
      dmg: Math.round(g.dmg * (1 + 0.35 * lv)),
      rate: +(g.rate * (1 + 0.12 * lv)).toFixed(2),
      range: Math.round(g.range * (1 + 0.06 * lv)),
      speed: g.speed, color: g.color, size: g.size + (lv >= 3 ? 1 : 0)
    };
  }
  return c;
}
/* 武器名后面带的等级角标（HUD 用） */
function wTag(p, id) {
  var lv = wLv(p, id);
  return lv > 0 ? ' Lv' + lv : '';
}

/* 星曜石的星数 → 物品 id */
function ballId(n) { return 'db' + n; }

/* 玩家身上集齐了几颗星曜石（返回还缺的星号数组） */
function missingBalls(p) {
  var miss = [];
  for (var n = 1; n <= 7; n++) if (Inv.count(p.inv, 'db' + n) <= 0) miss.push(n);
  return miss;
}
function hasAllBalls(p) {
  for (var n = 1; n <= 7; n++) if (Inv.count(p.inv, 'db' + n) <= 0) return false;
  return true;
}
function consumeBalls(p) {
  for (var n = 1; n <= 7; n++) Inv.remove(p.inv, 'db' + n, 1);
}

var RECIPES = [
  { out: { id: 'plank', n: 4 },  need: { log: 1 },            tip: '木头 → 木板' },
  { out: { id: 'stick', n: 4 },  need: { plank: 2 },          tip: '木板 → 木棍' },
  { out: { id: 'waxe',  n: 1 },  need: { plank: 3, stick: 2 }, tip: '木斧（砍树更快）' },
  { out: { id: 'wpick', n: 1 },  need: { plank: 3, stick: 2 }, tip: '木镐（挖石头）' },
  { out: { id: 'spick', n: 1 },  need: { stone: 3, stick: 2 }, tip: '石镐（挖铁矿金矿）' },
  { out: { id: 'wsword', n: 1 }, need: { plank: 2, stick: 1 }, tip: '木剑' },
  { out: { id: 'ssword', n: 1 }, need: { stone: 2, stick: 1 }, tip: '石剑（打怪更狠）' },
  { out: { id: 'dagger', n: 2 }, need: { iron: 1, stick: 1 },  tip: '飞刀 ×2（自动投掷）' },
  { out: { id: 'pistol', n: 1 }, need: { iron: 3, stick: 1 },  tip: '手枪（自动开火）' },
  { out: { id: 'torch',  n: 4 }, need: { stick: 1, coal: 1 },  tip: '火把（夜里照亮）' },
  { out: { id: 'epotato', n: 1 }, need: { apple: 2, gold: 2 }, tip: '附魔土豆（扔给僵尸吃，吃了变自己人）' },
  { out: { id: 'robot',  n: 1 }, need: { iron: 8, gold: 2, stick: 2 }, tip: '机器人守护者（召唤出来替你打架）' },
  { out: { id: 'cball',  n: 2 }, need: { iron: 2, gold: 1, stone: 2 }, tip: '驯灵环 ×2（扔向野怪，血越少越好抓）' }
];

function makeInv(n) {
  var a = new Array(n || 20);
  for (var i = 0; i < a.length; i++) a[i] = null;
  return a;
}

var Inv = {
  count: function (inv, id) {
    var c = 0;
    for (var i = 0; i < inv.length; i++) if (inv[i] && inv[i].id === id) c += inv[i].count;
    return c;
  },
  add: function (inv, id, n) {
    n = n || 1;
    var max = 64;
    for (var i = 0; i < inv.length && n > 0; i++) {
      var s = inv[i];
      if (s && s.id === id && s.count < max) { var put = Math.min(max - s.count, n); s.count += put; n -= put; }
    }
    for (var j = 0; j < inv.length && n > 0; j++) {
      if (!inv[j]) { var put2 = Math.min(max, n); inv[j] = { id: id, count: put2 }; n -= put2; }
    }
    return n;
  },
  /* 给玩家东西：武器/工具如果已经有了，就升级而不是再塞一把（返回没放进去的数量） */
  give: function (p, id, n) {
    n = n || 1;
    var def = ITEMS[id];
    if (!def) return n;
    if (def.up) {
      for (var i = 0; i < n; i++) {
        var lv = wLv(p, id);
        if (Inv.count(p.inv, id) > 0 && lv < WUP_MAX) {
          p.wlv[id] = lv + 1;
          var gain = Math.round((def.dmg || 0) * 0.4);
          Game.say('⬆️ ' + p.name + ' 又拿到一把' + def.name + '，熔成了 Lv' + (lv + 1) +
            (gain > 0 ? '（伤害 +' + gain + '）' : '（更好用了）'));
        } else {
          Inv.add(p.inv, id, 1);
        }
      }
      return 0;
    }
    return Inv.add(p.inv, id, n);
  },
  remove: function (inv, id, n) {
    n = n || 1;
    for (var i = 0; i < inv.length && n > 0; i++) {
      var s = inv[i];
      if (s && s.id === id) {
        var take = Math.min(s.count, n);
        s.count -= take; n -= take;
        if (s.count <= 0) inv[i] = null;
      }
    }
    return n === 0;
  },
  canCraft: function (inv, r) {
    for (var k in r.need) if (Inv.count(inv, k) < r.need[k]) return false;
    return true;
  },
  craft: function (inv, r) {
    if (!Inv.canCraft(inv, r)) return false;
    for (var k in r.need) Inv.remove(inv, k, r.need[k]);
    return Inv.add(inv, r.out.id, r.out.n) === 0;
  },
  held: function (p) {
    var s = p.inv[p.sel];
    if (!s) return null;
    var def = ITEMS[s.id];
    return def ? { id: s.id, def: def } : null;
  },
  /* 交换两格 */
  swap: function (inv, a, b) {
    var t = inv[a]; inv[a] = inv[b]; inv[b] = t;
  },
  /* 放下一叠：空格子放下，同种合并，不同种交换（返回被换出来的那叠） */
  put: function (inv, idx, stack) {
    var cur = inv[idx];
    if (!cur) { inv[idx] = stack; return null; }
    if (cur.id === stack.id) { cur.count += stack.count; return null; }
    inv[idx] = stack;
    return cur;
  },
  /* 手上有没有枪（远程自动开火）—— 返回的是含等级加成的属性 */
  gun: function (p) {
    var h = Inv.held(p);
    return h ? wGun(p, h) : null;
  }
};

/* 四角星闪光（附魔土豆用） */
function sparkle(g, x, y, r) {
  g.beginPath();
  g.moveTo(x, y - r); g.lineTo(x + r * 0.32, y - r * 0.32); g.lineTo(x + r, y);
  g.lineTo(x + r * 0.32, y + r * 0.32); g.lineTo(x, y + r); g.lineTo(x - r * 0.32, y + r * 0.32);
  g.lineTo(x - r, y); g.lineTo(x - r * 0.32, y - r * 0.32);
  g.closePath(); g.fill();
}

/* ---------------- 物品小图标 ---------------- */
function drawItemIcon(g, id, x, y, s) {
  var u = s / 32;
  g.save();
  g.translate(x, y);
  g.scale(u, u);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  switch (id) {
    case 'tank':
      g.fillStyle = '#3F4A5A'; g.fillRect(3, 6, 26, 6); g.fillRect(3, 20, 26, 6);
      g.fillStyle = '#64748B'; g.fillRect(5, 10, 22, 12);
      g.fillStyle = '#7A8798'; g.beginPath(); g.arc(16, 16, 6, 0, 6.283); g.fill();
      g.fillStyle = '#94A3B8'; g.fillRect(19, 14, 11, 4);
      g.fillStyle = '#FBBF24'; g.fillRect(24, 13, 3, 6);
      break;
    case 'excavator':
      g.fillStyle = '#2F3A4A'; g.fillRect(3, 7, 26, 5); g.fillRect(3, 20, 26, 5);
      g.fillStyle = '#F59E0B'; g.fillRect(5, 11, 22, 10);
      g.fillStyle = '#FDE68A'; g.fillRect(6, 12, 9, 8);
      g.strokeStyle = '#B45309'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(19, 16); g.lineTo(27, 9); g.stroke();
      g.fillStyle = '#92400E'; g.fillRect(24, 4, 7, 7);
      break;
    case 'pistol':
      g.fillStyle = '#475569'; g.fillRect(6, 10, 15, 5);
      g.fillRect(6, 15, 7, 10);
      g.fillStyle = '#94A3B8'; g.fillRect(20, 11, 8, 3);
      g.fillStyle = '#1F2937'; g.fillRect(8, 12, 3, 3);
      break;
    case 'mgun':
      g.fillStyle = '#334155'; g.fillRect(4, 13, 20, 6);
      g.fillStyle = '#94A3B8'; g.fillRect(23, 14, 8, 3);
      g.fillStyle = '#F59E0B'; g.beginPath(); g.arc(12, 19, 5, 0, 6.283); g.fill();
      g.fillStyle = '#1F2937'; g.fillRect(6, 15, 3, 4);
      g.fillStyle = '#64748B'; g.fillRect(10, 9, 3, 5);
      break;
    case 'dagger':
      g.fillStyle = '#CBD5E1';
      g.beginPath(); g.moveTo(26, 6); g.lineTo(29, 9); g.lineTo(14, 25); g.lineTo(11, 22); g.closePath(); g.fill();
      g.fillStyle = '#64748B'; g.fillRect(7, 21, 8, 4);
      g.fillStyle = '#FBBF24'; g.fillRect(5, 20, 4, 6);
      break;
    case 'wsword': case 'ssword':
      var blade = id === 'wsword' ? '#C89B6A' : '#B9B9B9';
      g.fillStyle = blade; g.fillRect(14, 4, 5, 18);
      g.fillStyle = '#7A5230'; g.fillRect(9, 20, 15, 3);
      g.fillStyle = '#5A3F1E'; g.fillRect(15, 23, 3, 6);
      break;
    case 'wpick': case 'spick':
      g.fillStyle = '#A97B4F'; g.fillRect(15, 10, 3, 18);
      g.fillStyle = id === 'wpick' ? '#C89B6A' : '#9E9E9E';
      g.beginPath(); g.moveTo(6, 12); g.quadraticCurveTo(16, 2, 26, 12); g.lineTo(24, 15); g.quadraticCurveTo(16, 7, 8, 15); g.closePath(); g.fill();
      break;
    case 'waxe':
      g.fillStyle = '#A97B4F'; g.fillRect(15, 8, 3, 20);
      g.fillStyle = '#C89B6A';
      g.beginPath(); g.moveTo(16, 6); g.quadraticCurveTo(27, 8, 26, 18); g.quadraticCurveTo(20, 12, 16, 14); g.closePath(); g.fill();
      break;
    case 'torch':
      g.fillStyle = '#5A3F1E'; g.fillRect(14, 14, 4, 15);
      g.fillStyle = '#FFD36B'; g.beginPath(); g.arc(16, 10, 6, 0, 6.283); g.fill();
      g.fillStyle = '#FF8C1A'; g.beginPath(); g.arc(16, 9, 3, 0, 6.283); g.fill();
      break;
    case 'kit':
      g.fillStyle = '#F8FAFC'; g.fillRect(5, 9, 22, 16);
      g.fillStyle = '#CBD5E1'; g.fillRect(5, 9, 22, 4);
      g.fillStyle = '#EF4444'; g.fillRect(14, 13, 4, 10); g.fillRect(10, 16, 12, 4);
      break;
    case 'robot':
      /* 机器人守护者：方头 + 两只发光眼睛 + 天线 */
      g.fillStyle = '#64748B'; g.fillRect(10, 22, 12, 6);          // 身体
      g.fillStyle = '#38BDF8'; g.fillRect(7, 8, 18, 15);          // 头
      g.fillStyle = '#94A3B8'; g.fillRect(7, 8, 18, 3);           // 头顶高光
      g.fillStyle = '#0F172A'; g.fillRect(10, 13, 4, 5); g.fillRect(18, 13, 4, 5);  // 眼窝
      g.fillStyle = '#22D3EE'; g.fillRect(11, 14, 2, 3); g.fillRect(19, 14, 2, 3);  // 发光眼
      g.fillStyle = '#475569'; g.fillRect(14, 20, 4, 2);          // 脖子
      g.strokeStyle = '#94A3B8'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(16, 8); g.lineTo(16, 3); g.stroke();
      g.fillStyle = '#FBBF24'; g.beginPath(); g.arc(16, 3, 2.2, 0, 6.283); g.fill();   // 天线灯泡
      g.fillStyle = '#475569'; g.fillRect(4, 23, 5, 4); g.fillRect(23, 23, 5, 4);      // 手臂
      break;
    case 'cball':
      /* 驯灵环：上半红下半白，中间一颗按钮 */
      g.fillStyle = '#EF4444';
      g.beginPath(); g.arc(16, 16, 12, Math.PI, 0); g.fill();
      g.fillStyle = '#F8FAFC';
      g.beginPath(); g.arc(16, 16, 12, 0, Math.PI); g.fill();
      g.strokeStyle = '#1F2937'; g.lineWidth = 2;
      g.beginPath(); g.arc(16, 16, 12, 0, 6.283); g.stroke();
      g.fillStyle = '#1F2937'; g.fillRect(4, 14, 24, 4);
      g.fillStyle = '#F8FAFC'; g.beginPath(); g.arc(16, 16, 4.6, 0, 6.283); g.fill();
      g.strokeStyle = '#1F2937'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(16, 16, 4.6, 0, 6.283); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.6)';
      g.beginPath(); g.arc(11.5, 11, 2.6, 0, 6.283); g.fill();
      break;
    case 'ice':
      g.fillStyle = '#9FD4EE'; g.fillRect(5, 7, 22, 18);
      g.fillStyle = '#DFF4FF';
      g.beginPath(); g.moveTo(6, 22); g.lineTo(13, 10); g.lineTo(18, 17); g.lineTo(23, 12); g.lineTo(26, 22); g.closePath(); g.fill();
      g.strokeStyle = '#5FA8CC'; g.lineWidth = 2; g.strokeRect(5, 7, 22, 18);
      break;
    case 'db1': case 'db2': case 'db3': case 'db4': case 'db5': case 'db6': case 'db7': {
      var stars = ITEMS[id].ball;
      var grd2 = g.createRadialGradient(12, 12, 1, 16, 16, 13);
      grd2.addColorStop(0, '#FDE68A'); grd2.addColorStop(0.55, '#F59E0B'); grd2.addColorStop(1, '#C2410C');
      g.fillStyle = grd2;
      g.beginPath(); g.arc(16, 16, 12, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(120,53,15,.85)'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(16, 16, 12, 0, 6.283); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.beginPath(); g.arc(11, 11, 3.4, 0, 6.283); g.fill();
      /* 红星：1 颗在中间，其余绕一圈 */
      var pts = [];
      if (stars === 1) pts = [[16, 16]];
      else for (var s2 = 0; s2 < stars; s2++) {
        var a2 = -1.5708 + s2 / stars * 6.283;
        pts.push([16 + Math.cos(a2) * 5.6, 16 + Math.sin(a2) * 5.6]);
      }
      g.fillStyle = '#DC2626';
      for (var pi2 = 0; pi2 < pts.length; pi2++) {
        g.beginPath(); g.arc(pts[pi2][0], pts[pi2][1], stars === 1 ? 3.2 : 2.1, 0, 6.283); g.fill();
      }
      g.strokeStyle = 'rgba(127,29,29,.7)'; g.lineWidth = 0.8;
      for (var pi3 = 0; pi3 < pts.length; pi3++) {
        g.beginPath(); g.arc(pts[pi3][0], pts[pi3][1], stars === 1 ? 3.2 : 2.1, 0, 6.283); g.stroke();
      }
      break;
    }
    case 'epotato': {
      g.fillStyle = '#C9A227';
      g.beginPath(); g.ellipse(16, 18, 10, 7.6, 0.25, 0, 6.283); g.fill();
      var grd = g.createLinearGradient(6, 9, 26, 27);
      grd.addColorStop(0, '#F472B6'); grd.addColorStop(0.3, '#FBBF24');
      grd.addColorStop(0.62, '#4ADE80'); grd.addColorStop(1, '#A855F7');
      g.globalAlpha = 0.92; g.fillStyle = grd;
      g.beginPath(); g.ellipse(16, 18, 10, 7.6, 0.25, 0, 6.283); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#7C5A12';                     // 芽眼
      g.fillRect(11, 15, 2, 2); g.fillRect(19, 19, 2, 2); g.fillRect(15, 12, 2, 2);
      g.fillStyle = 'rgba(255,255,255,.95)';       // 附魔闪光
      sparkle(g, 7, 8, 3.6); sparkle(g, 25, 12, 2.6); sparkle(g, 19, 5, 2.1);
      break;
    }
    case 'apple':
      g.fillStyle = '#E23B3B'; g.beginPath(); g.arc(16, 19, 9, 0, 6.283); g.fill();
      g.fillStyle = '#FCA5A5'; g.beginPath(); g.arc(13, 16, 3, 0, 6.283); g.fill();
      g.fillStyle = '#7A5230'; g.fillRect(15, 6, 2, 6);
      g.fillStyle = '#4E8B3A'; g.beginPath(); g.ellipse(21, 9, 4, 2.4, -0.5, 0, 6.283); g.fill();
      break;
    case 'log':
      g.fillStyle = '#6B4A2B'; g.fillRect(5, 9, 22, 14);
      g.fillStyle = '#8A6238'; g.fillRect(5, 9, 22, 3);
      g.strokeStyle = '#4E3421'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(16, 16, 4, 5, 0, 0, 6.283); g.stroke();
      break;
    case 'plank':
      g.fillStyle = '#B07C46'; g.fillRect(4, 8, 24, 16);
      g.fillStyle = '#8A5F30'; g.fillRect(4, 12, 24, 2); g.fillRect(4, 18, 24, 2);
      break;
    case 'stick':
      g.fillStyle = '#A97B4F'; g.fillRect(6, 14, 20, 4);
      g.fillStyle = '#8A6238'; g.fillRect(6, 14, 20, 1.5);
      break;
    case 'coal':
      g.fillStyle = '#8A8A8A'; g.fillRect(6, 8, 20, 17);
      g.fillStyle = '#262626'; g.fillRect(9, 11, 6, 6); g.fillRect(17, 16, 5, 5); g.fillRect(18, 10, 4, 4);
      break;
    case 'iron':
      g.fillStyle = '#8A8A8A'; g.fillRect(6, 8, 20, 17);
      g.fillStyle = '#C98A5B'; g.fillRect(9, 11, 6, 6); g.fillRect(17, 16, 5, 5);
      break;
    case 'gold':
      g.fillStyle = '#8A8A8A'; g.fillRect(6, 8, 20, 17);
      g.fillStyle = '#F2C744'; g.fillRect(9, 11, 6, 6); g.fillRect(17, 16, 5, 5); g.fillRect(18, 10, 4, 4);
      break;
    case 'sand':
      g.fillStyle = '#E0D3A0'; g.fillRect(6, 8, 20, 17);
      g.fillStyle = '#CBBE86'; g.fillRect(9, 13, 14, 3); g.fillRect(9, 19, 9, 3);
      break;
    case 'dirt':
      g.fillStyle = '#8B5A2B'; g.fillRect(6, 8, 20, 17);
      g.fillStyle = '#A06B36'; g.fillRect(9, 11, 5, 4); g.fillRect(17, 17, 5, 4);
      break;
    case 'stone':
      g.fillStyle = '#8A8A8A'; g.fillRect(6, 8, 20, 17);
      g.fillStyle = '#9E9E9E'; g.fillRect(9, 11, 6, 5); g.fillRect(16, 17, 6, 5);
      break;
    default:
      g.fillStyle = (ITEMS[id] && ITEMS[id].color) || '#94A3B8';
      g.fillRect(6, 8, 20, 17);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(6, 8, 20, 4);
  }
  g.restore();
}

/* 预生成图标的 dataURL（HUD 里当图片用） */
(function buildIcons() {
  for (var id in ITEMS) {
    var c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    drawItemIcon(c.getContext('2d'), id, 0, 0, 32);
    if (typeof c.toDataURL === 'function') ITEMS[id].icon = c.toDataURL();
  }
})();
