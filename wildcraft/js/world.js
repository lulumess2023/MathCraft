/* 世界：地面层（可走）+ 物件层（可挖/可挡），双层无限区块生成
   地面层 F：决定你站在什么上面走；物件层 O：树、岩石、矿、符文石、玩家搭的墙 */
var TILE = 32;
var CHUNK = 16;

/* ---------- 地面层 ---------- */
var F = { GRASS: 1, DIRT: 2, SAND: 3, STONE: 4, WATER: 5, CLOUD: 6, HOLE: 7, UPDRAFT: 8,
          ICE: 9, SNOW: 10, JUNGLE: 11, ASH: 12, LAVA: 13 };
var FDEF = {};
FDEF[F.GRASS]   = { name: '草地',   color: '#6AA84F', spec: '#87C065' };
FDEF[F.DIRT]    = { name: '泥地',   color: '#8B5A2B', spec: '#A06B36' };
FDEF[F.SAND]    = { name: '沙地',   color: '#E0D3A0', spec: '#EDE2BA' };
FDEF[F.STONE]   = { name: '岩石地', color: '#7E7E7E', spec: '#949494' };
FDEF[F.WATER]   = { name: '水',     color: '#2F5FA8', spec: '#3B76C9', water: true };
FDEF[F.CLOUD]   = { name: '云海',   color: '#DCE9F7', spec: '#F4F9FF', void_: true };
FDEF[F.HOLE]    = { name: '云洞',   color: '#1B2A3A', spec: '#4FA3D9', hole: true };
FDEF[F.UPDRAFT] = { name: '上升气流', color: '#BFE9FF', spec: '#FFFFFF', updraft: true };
/* 生物群系地面 */
FDEF[F.ICE]     = { name: '冰面',   color: '#BFDCF0', spec: '#EAF7FF', slip: true, biome: 'ice' };
FDEF[F.SNOW]    = { name: '雪地',   color: '#E8F0F7', spec: '#FFFFFF', biome: 'ice' };
FDEF[F.JUNGLE]  = { name: '丛林土', color: '#3E7A32', spec: '#4F9440', biome: 'jungle' };
FDEF[F.ASH]     = { name: '火山灰', color: '#4A3B3B', spec: '#5E4848', biome: 'volcano' };
FDEF[F.LAVA]    = { name: '岩浆',   color: '#C4341B', spec: '#FFB038', lava: true, biome: 'volcano', light: 1.6 };
/* 异空间地面（只在传送门里出现） */
FDEF[14]        = { name: '神殿地砖', color: '#5B6B84', spec: '#7C8DA6' };
FDEF[15]        = { name: '竞技场沙地', color: '#9C7B4A', spec: '#B8905C' };
var F_TEMPLE = 14, F_ARENA = 15;

/* ---------- 物件层 ---------- */
var O = { NONE: 0, LOG: 1, LEAVES: 2, ROCK: 3, COAL: 4, IRON: 5, GOLD: 6, RUNE: 7, CHEST: 8, PLANK: 9, TORCH: 10, DIRT: 11, STONEB: 12, SANDB: 13, BEDROCK: 14,
          ICEB: 15, CACTUS: 16, JTREE: 17, LAVAROCK: 18, ICEWALL: 19, VINE: 20, PALM: 21,
          /* 传送门与异空间 */
          PORTAL: 22,      // 荒野传送门 → 益智神殿
          CPORTAL: 23,     // 城堡里的传送门 → 竞技场
          PBOX: 24,        // 益智神殿的推箱（推到发光点上去）
          RPAD: 25,        // 益智神殿的目标点
          REXIT: 26 };     // 异空间出口
var ODEF = {};
ODEF[O.NONE]   = { name: '空', solid: false };
ODEF[O.LOG]    = { name: '树',     solid: true, color: '#6B4A2A', spec: '#7E5933', drop: 'log', hard: 1.0, tool: 'axe' };
ODEF[O.LEAVES] = { name: '树叶',   solid: true, color: '#3F7A34', spec: '#4E8B3A', drop: 'apple', dropChance: 0.3, hard: 0.5 };
ODEF[O.ROCK]   = { name: '岩石',   solid: true, color: '#8A8A8A', spec: '#9E9E9E', drop: 'stone', hard: 1.6, tool: 'pick' };
ODEF[O.COAL]   = { name: '煤矿',   solid: true, color: '#8A8A8A', spec: '#262626', drop: 'coal', hard: 2.0, tool: 'pick' };
ODEF[O.IRON]   = { name: '铁矿',   solid: true, color: '#8A8A8A', spec: '#C98A5B', drop: 'iron', hard: 2.6, tool: 'pick' };
ODEF[O.GOLD]   = { name: '金矿',   solid: true, color: '#8A8A8A', spec: '#F2C744', drop: 'gold', hard: 3.2, tool: 'pick' };
ODEF[O.RUNE]   = { name: '符文石', solid: true, color: '#4B3A6B', spec: '#A97BE8', drop: 'stone', hard: 3.6, tool: 'pick', rune: true, light: 2.0 };
ODEF[O.CHEST]  = { name: '宝箱',   solid: true, color: '#A9713B', spec: '#F2C744', hard: 0.9 };
ODEF[O.PLANK]  = { name: '木板墙', solid: true, color: '#B07C46', spec: '#9A6A38', drop: 'plank', hard: 0.8 };
ODEF[O.TORCH]  = { name: '火把',   solid: false, color: '#2A2416', spec: '#FFD36B', drop: 'torch', hard: 0.2, light: 5.5 };
ODEF[O.DIRT]   = { name: '泥块',   solid: true, color: '#8B5A2B', spec: '#A06B36', drop: 'dirt', hard: 0.6 };
ODEF[O.STONEB] = { name: '石块',   solid: true, color: '#8A8A8A', spec: '#9E9E9E', drop: 'stone', hard: 1.6, tool: 'pick' };
ODEF[O.SANDB]  = { name: '沙块',   solid: true, color: '#E0D3A0', spec: '#EDE2BA', drop: 'sand', hard: 0.6 };
ODEF[O.BEDROCK] = { name: '世界边界', solid: true, color: '#1A1F2B', spec: '#2A3245', hard: 999 };
/* 生物群系物件 */
ODEF[O.ICEB]    = { name: '冰块',   solid: true, color: '#9FD4EE', spec: '#DFF4FF', drop: 'ice', hard: 0.8, tool: 'pick' };
ODEF[O.ICEWALL] = { name: '冰墙',   solid: true, color: '#7FC2E4', spec: '#C9ECFB', drop: 'ice', hard: 2.2, tool: 'pick' };
ODEF[O.CACTUS]  = { name: '仙人掌', solid: false, color: '#3F8A46', spec: '#57A85E', hard: 0.5, hurt: 3 };
ODEF[O.JTREE]   = { name: '丛林巨木', solid: true, color: '#5A3A1E', spec: '#6E4A28', drop: 'log', hard: 1.5, tool: 'axe' };
ODEF[O.LAVAROCK]= { name: '火山岩', solid: true, color: '#4A3B3B', spec: '#F97316', drop: 'gold', hard: 2.8, tool: 'pick', light: 1.4 };
ODEF[O.VINE]    = { name: '藤蔓',   solid: false, color: '#2F6B2A', spec: '#4F9440', drop: 'apple', dropChance: 0.35, hard: 0.3, slow: true };
ODEF[O.PALM]    = { name: '棕榈树', solid: true, color: '#8B6A3B', spec: '#A07B48', drop: 'log', hard: 1.0, tool: 'axe' };
/* 传送门与异空间（都挖不动，别把传送门拆了） */
ODEF[O.PORTAL]  = { name: '传送门', solid: false, color: '#2563EB', spec: '#93C5FD', unbreakable: true, portal: 'puzzle', light: 3.2 };
ODEF[O.CPORTAL] = { name: '城堡传送门', solid: false, color: '#B91C1C', spec: '#FCA5A5', unbreakable: true, portal: 'arena', light: 3.2 };
ODEF[O.PBOX]    = { name: '推箱', solid: true, color: '#A16207', spec: '#D97706', pushable: true, unbreakable: true };
ODEF[O.RPAD]    = { name: '目标点', solid: false, color: '#334155', spec: '#FDE047', light: 1.4 };
ODEF[O.REXIT]   = { name: '出口传送门', solid: false, color: '#7C3AED', spec: '#DDD6FE', unbreakable: true, exit: true, light: 3.6 };

/* ---------- 贴图预渲染 ---------- */
var FLOOR_IMG = [], OBJ_IMG = [];
function tileCanvas(draw, hasShadow) {
  var out = [];
  for (var v = 0; v < 3; v++) {
    var c = document.createElement('canvas');
    c.width = TILE; c.height = TILE;
    var g = c.getContext('2d');
    draw(g, v, hasShadow);
    out.push(c);
  }
  return out;
}
(function prerender() {
  /* 地面 */
  FLOOR_IMG[F.GRASS] = tileCanvas(function (g, v) {
    g.fillStyle = FDEF[F.GRASS].color; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = FDEF[F.GRASS].spec;
    for (var i = 0; i < 14; i++) {
      var x = hash2(i, v, 11) * 30, y = hash2(i + 7, v, 13) * 30;
      g.fillRect(x, y, 3, 5); g.fillRect(x + 1, y - 2, 1, 2);
    }
  });
  FLOOR_IMG[F.DIRT] = tileCanvas(function (g, v) {
    g.fillStyle = FDEF[F.DIRT].color; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = FDEF[F.DIRT].spec;
    for (var i = 0; i < 8; i++) g.fillRect(hash2(i, v, 21) * 28, hash2(i, v + 3, 22) * 28, 5, 4);
  });
  FLOOR_IMG[F.SAND] = tileCanvas(function (g, v) {
    g.fillStyle = FDEF[F.SAND].color; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = FDEF[F.SAND].spec;
    for (var i = 0; i < 10; i++) g.fillRect(hash2(i, v, 31) * 30, hash2(i, v + 5, 32) * 30, 3, 3);
  });
  FLOOR_IMG[F.STONE] = tileCanvas(function (g, v) {
    g.fillStyle = FDEF[F.STONE].color; g.fillRect(0, 0, TILE, TILE);
    g.strokeStyle = '#6A6A6A'; g.lineWidth = 2;
    for (var i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(0, 4 + i * 11 + (v % 2) * 3);
      g.lineTo(TILE, 6 + i * 11 + (v % 2) * 2);
      g.stroke();
    }
    g.fillStyle = FDEF[F.STONE].spec;
    for (var k = 0; k < 5; k++) g.fillRect(hash2(k, v, 41) * 28, hash2(k, v + 2, 42) * 28, 4, 3);
  });
  FLOOR_IMG[F.WATER] = tileCanvas(function (g, v) {
    g.fillStyle = FDEF[F.WATER].color; g.fillRect(0, 0, TILE, TILE);
    g.strokeStyle = FDEF[F.WATER].spec; g.lineWidth = 2;
    for (var w = 0; w < 3; w++) {
      var yy = 6 + w * 10 + (v % 3) * 2;
      g.beginPath(); g.moveTo(0, yy);
      g.quadraticCurveTo(8, yy - 4, 16, yy);
      g.quadraticCurveTo(24, yy + 4, 32, yy);
      g.stroke();
    }
  });
  FLOOR_IMG[F.CLOUD] = tileCanvas(function (g, v) {
    g.fillStyle = '#EAF3FF'; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = FDEF[F.CLOUD].color;
    for (var i = 0; i < 6; i++) {
      var rr = hash2(i, v, 51);
      g.beginPath(); g.arc(rr * TILE, hash2(i, v + 9, 52) * TILE, 7 + rr * 6, 0, 6.283); g.fill();
    }
  });
  FLOOR_IMG[F.HOLE] = tileCanvas(function (g, v) {
    g.fillStyle = '#0E1A2A'; g.fillRect(0, 0, TILE, TILE);
    g.strokeStyle = FDEF[F.HOLE].spec; g.lineWidth = 2;
    for (var k = 0; k < 3; k++) {
      g.beginPath(); g.arc(16, 16, 4 + k * 5 + (v % 2) * 2, 0, 6.283); g.stroke();
    }
  });
  FLOOR_IMG[F.UPDRAFT] = tileCanvas(function (g, v) {
    g.fillStyle = '#DFF4FF'; g.fillRect(0, 0, TILE, TILE);
    g.strokeStyle = '#8FD3F4'; g.lineWidth = 3;
    for (var u = 0; u < 2; u++) {
      g.beginPath();
      g.moveTo(8 + u * 16, 28 - (v % 2) * 4);
      g.quadraticCurveTo(16 + u * 16, 16, 8 + u * 16, 5 + (v % 2) * 3);
      g.stroke();
    }
  });

  /* --- 生物群系地面 --- */
  FLOOR_IMG[F.ICE] = tileCanvas(function (g, v) {
    g.fillStyle = FDEF[F.ICE].color; g.fillRect(0, 0, TILE, TILE);
    g.strokeStyle = FDEF[F.ICE].spec; g.lineWidth = 2;
    for (var i = 0; i < 3; i++) {
      var x = hash2(i, v, 81) * 30, y = hash2(i + 4, v, 82) * 30;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 5); g.lineTo(x + 14, y - 3); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.5)';
    for (var k = 0; k < 4; k++) g.fillRect(hash2(k, v, 83) * 28, hash2(k + 9, v, 84) * 28, 5, 2);
  });
  FLOOR_IMG[F.SNOW] = tileCanvas(function (g, v) {
    g.fillStyle = FDEF[F.SNOW].color; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = '#CBDCEA';
    for (var i = 0; i < 7; i++) g.fillRect(hash2(i, v, 85) * 28, hash2(i + 2, v, 86) * 28, 4, 4);
    g.fillStyle = '#FFFFFF';
    for (var k = 0; k < 5; k++) g.fillRect(hash2(k, v, 87) * 30, hash2(k + 6, v, 88) * 30, 2, 2);
  });
  FLOOR_IMG[F.JUNGLE] = tileCanvas(function (g, v) {
    g.fillStyle = FDEF[F.JUNGLE].color; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = FDEF[F.JUNGLE].spec;
    for (var i = 0; i < 16; i++) {
      var x = hash2(i, v, 91) * 30, y = hash2(i + 5, v, 92) * 30;
      g.fillRect(x, y, 4, 3);
    }
    g.strokeStyle = '#2C5A24'; g.lineWidth = 1;
    for (var k = 0; k < 3; k++) {
      var yy = hash2(k, v, 93) * 30;
      g.beginPath(); g.moveTo(0, yy);
      g.quadraticCurveTo(10, yy + 5, 20, yy); g.quadraticCurveTo(26, yy - 3, 32, yy + 1); g.stroke();
    }
  });
  FLOOR_IMG[F.ASH] = tileCanvas(function (g, v) {
    g.fillStyle = FDEF[F.ASH].color; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = FDEF[F.ASH].spec;
    for (var i = 0; i < 10; i++) g.fillRect(hash2(i, v, 95) * 28, hash2(i + 3, v, 96) * 28, 4, 3);
    g.fillStyle = 'rgba(249,115,22,.35)';
    for (var k = 0; k < 3; k++) g.fillRect(hash2(k, v, 97) * 28, hash2(k + 8, v, 98) * 28, 3, 3);
  });
  FLOOR_IMG[F.LAVA] = tileCanvas(function (g, v) {
    g.fillStyle = FDEF[F.LAVA].color; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = FDEF[F.LAVA].spec;
    for (var i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(hash2(i, v, 101) * TILE, hash2(i + 2, v, 102) * TILE, 3 + hash2(i, v, 103) * 5, 0, 6.283);
      g.fill();
    }
    g.strokeStyle = '#7A1A08'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 8 + (v % 3) * 6); g.lineTo(TILE, 4 + (v % 3) * 8); g.stroke();
  });
  /* 神殿地砖：整齐的方砖 + 中间的符文接缝 */
  FLOOR_IMG[F_TEMPLE] = tileCanvas(function (g) {
    g.fillStyle = FDEF[F_TEMPLE].color; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = FDEF[F_TEMPLE].spec;
    g.fillRect(0, 0, TILE, 2); g.fillRect(0, 16, TILE, 2);
    g.fillRect(0, 0, 2, TILE); g.fillRect(16, 0, 2, TILE);
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(2, 2, 14, 14);
  });
  /* 竞技场沙地：夯实的沙土 + 一圈浅纹 */
  FLOOR_IMG[F_ARENA] = tileCanvas(function (g, v) {
    g.fillStyle = FDEF[F_ARENA].color; g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = FDEF[F_ARENA].spec;
    for (var i = 0; i < 8; i++) g.fillRect(hash2(i, v, 121) * 28, hash2(i + 5, v, 122) * 28, 5, 2);
    g.strokeStyle = 'rgba(120,88,48,.5)'; g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
  });

  /* 物件（带投影，显得是立在地上的） */
  function objDrawer(id, style) {
    return function (g, v) {
      /* 传送门一类：不画投影，直接画传送门本体（动画在 Realm.draw 里叠加） */
      if (id === O.PORTAL || id === O.CPORTAL || id === O.REXIT) {
        var col = ODEF[id].color, spc = ODEF[id].spec;
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(1, 1, 30, 30);
        g.fillStyle = '#1B2436'; g.fillRect(3, 3, 26, 26);
        var gg = g.createRadialGradient(16, 16, 1, 16, 16, 15);
        gg.addColorStop(0, spc); gg.addColorStop(0.55, col); gg.addColorStop(1, '#0B1220');
        g.fillStyle = gg; g.fillRect(5, 5, 22, 22);
        g.strokeStyle = spc; g.lineWidth = 2;
        g.beginPath(); g.arc(16, 16, 9, 0.4, 4.2); g.stroke();
        return;
      }
      if (id === O.RPAD) {
        g.fillStyle = '#243044'; g.fillRect(2, 2, 28, 28);
        g.strokeStyle = ODEF[id].spec; g.lineWidth = 2;
        g.strokeRect(6, 6, 20, 20);
        g.fillStyle = 'rgba(253,224,71,.45)';
        g.beginPath(); g.arc(16, 16, 4, 0, 6.283); g.fill();
        return;
      }
      if (id === O.PBOX) {
        /* 推箱：木箱 + 铁角 + 中间一个抓手 */
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(2, TILE - 7, TILE - 4, 5);
        g.fillStyle = ODEF[id].color; g.fillRect(1, 1, 30, 30);
        g.fillStyle = ODEF[id].spec;
        g.fillRect(1, 1, 30, 5); g.fillRect(1, 26, 30, 5);
        g.fillStyle = '#713F12';
        g.fillRect(1, 14, 30, 4); g.fillRect(14, 1, 4, 30);
        g.fillStyle = '#94A3B8';
        g.fillRect(1, 1, 5, 5); g.fillRect(26, 1, 5, 5);
        g.fillRect(1, 26, 5, 5); g.fillRect(26, 26, 5, 5);
        return;
      }
      g.fillStyle = 'rgba(0,0,0,.28)';
      g.fillRect(2, TILE - 7, TILE - 4, 5);
      if (id === O.TORCH) {
        g.fillStyle = '#5A3F1E'; g.fillRect(13, 13, 6, 17);
        g.fillStyle = '#FFD36B'; g.beginPath(); g.arc(16, 10, 6, 0, 6.283); g.fill();
        g.fillStyle = '#FF8C1A'; g.beginPath(); g.arc(16, 9, 3, 0, 6.283); g.fill();
        return;
      }
      if (id === O.CHEST) {
        g.fillStyle = ODEF[id].color; g.fillRect(2, 6, 28, 22);
        g.fillStyle = '#7A4A22'; g.fillRect(2, 6, 28, 6);
        g.fillStyle = ODEF[id].spec; g.fillRect(14, 14, 4, 8);
        return;
      }
      if (id === O.RUNE) {
        g.fillStyle = ODEF[id].color; g.fillRect(1, 1, 30, 30);
        g.fillStyle = ODEF[id].spec;
        g.fillRect(6, 6, 4, 4); g.fillRect(22, 6, 4, 4);
        g.fillRect(6, 22, 4, 4); g.fillRect(22, 22, 4, 4);
        g.fillRect(14, 12, 4, 8);
        return;
      }
      if (id === O.ICEB || id === O.ICEWALL) {
        g.fillStyle = ODEF[id].color; g.fillRect(1, 1, 30, 30);
        g.fillStyle = ODEF[id].spec;
        g.beginPath(); g.moveTo(4, 26); g.lineTo(14, 6); g.lineTo(20, 16); g.lineTo(26, 9); g.lineTo(26, 26); g.closePath(); g.fill();
        if (id === O.ICEWALL) { g.strokeStyle = '#5FA8CC'; g.lineWidth = 2; g.strokeRect(1, 1, 30, 30); }
        return;
      }
      if (id === O.CACTUS) {
        g.fillStyle = ODEF[id].color; g.fillRect(12, 4, 8, 26);
        g.fillRect(5, 12, 5, 10); g.fillRect(22, 9, 5, 12);
        g.fillStyle = ODEF[id].spec;
        g.fillRect(13, 6, 2, 22); g.fillRect(6, 14, 2, 8); g.fillRect(23, 11, 2, 9);
        g.fillStyle = '#FDE68A'; g.fillRect(15, 3, 2, 2);
        return;
      }
      if (id === O.LAVAROCK) {
        g.fillStyle = ODEF[id].color; g.fillRect(1, 1, 30, 30);
        g.fillStyle = ODEF[id].spec;
        for (var lv = 0; lv < 4; lv++) g.fillRect(hash2(lv, v, 111) * 24, hash2(lv + 3, v, 112) * 24, 6, 5);
        g.fillStyle = '#FBBF24';
        g.fillRect(9, 10, 6, 6); g.fillRect(19, 19, 5, 5);
        return;
      }
      if (id === O.VINE) {
        g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, TILE, TILE);
        g.strokeStyle = ODEF[id].color; g.lineWidth = 3;
        for (var vn = 0; vn < 3; vn++) {
          var vx = 6 + vn * 10;
          g.beginPath(); g.moveTo(vx, 0);
          g.quadraticCurveTo(vx + 4, 12, vx - 2, 22); g.quadraticCurveTo(vx + 3, 28, vx + 1, 32); g.stroke();
        }
        g.fillStyle = ODEF[id].spec;
        for (var lf = 0; lf < 4; lf++) g.fillRect(4 + hash2(lf, v, 113) * 22, 4 + hash2(lf, v, 114) * 22, 4, 3);
        return;
      }
      g.fillStyle = ODEF[id].color; g.fillRect(1, 1, 30, 30);
      g.fillStyle = ODEF[id].spec || ODEF[id].color;
      if (id === O.LOG) {
        g.fillRect(8, 1, 4, 30); g.fillRect(21, 1, 4, 30);
      } else if (id === O.JTREE) {
        g.fillRect(5, 1, 5, 30); g.fillRect(14, 1, 4, 30); g.fillRect(23, 1, 4, 30);
      } else if (id === O.PALM) {
        for (var pb = 0; pb < 5; pb++) g.fillRect(4, 2 + pb * 6, 24, 3);
      } else if (id === O.LEAVES) {
        for (var l = 0; l < 12; l++) g.fillRect(hash2(l, v, 61) * 26, hash2(l + 3, v, 62) * 26, 6, 6);
      } else if (id === O.PLANK) {
        g.fillStyle = '#8A5F30';
        for (var p = 0; p < 4; p++) g.fillRect(1, 4 + p * 8, 30, 2);
      } else {
        /* 石头与矿：底石 + 矿点 */
        for (var d = 0; d < 6; d++) g.fillRect(hash2(d, v + id, 71) * 26, hash2(d + 5, v + id, 72) * 26, 4, 4);
        if (id === O.COAL || id === O.IRON || id === O.GOLD) {
          g.fillStyle = ODEF[id].spec;
          g.fillRect(7, 8, 7, 7); g.fillRect(18, 17, 6, 6); g.fillRect(19, 7, 5, 5);
        }
      }
    };
  }
  for (var oid = 1; oid <= 26; oid++) OBJ_IMG[oid] = tileCanvas(objDrawer(oid));
})();

/* ---------- 世界 ---------- */
/* 地面拾取物的稀有度表（累计权重） */
var PICKUP_TABLE = [
  { p: 0.24, id: 'torch', n: 3 },
  { p: 0.37, id: 'apple', n: 2 },
  { p: 0.46, id: 'plank', n: 5 },
  { p: 0.54, id: 'stone', n: 5 },
  { p: 0.60, id: 'dagger', n: 3 },
  { p: 0.655, id: 'wsword', n: 1 },
  { p: 0.705, id: 'pistol', n: 1 },
  { p: 0.75, id: 'ssword', n: 1 },
  { p: 0.79, id: 'kit', n: 1 },
  { p: 0.83, id: 'spick', n: 1 },
  { p: 0.90, id: 'epotato', n: 1 },     // 7%：附魔土豆（原 2.5%，调高了）
  { p: 0.935, id: 'mgun', n: 1 },
  { p: 0.965, id: 'robot', n: 1 },      // 机器人守护者
  { p: 0.988, id: 'excavator', n: 1 },
  { p: 0.9995, id: 'tank', n: 1 },
  { p: 1.00, id: 'dball', n: 1 }        // 龙珠：极稀有，捡到时自动补“还缺的那颗”
];
function pickType(r) {
  for (var i = 0; i < PICKUP_TABLE.length; i++) if (r < PICKUP_TABLE[i].p) return PICKUP_TABLE[i];
  return PICKUP_TABLE[0];
}

var World = {
  seed: 20260830,
  chunks: {},
  stats: { chunks: 0 },
  HALF: 400,            /* 世界半径：800 x 800 个瓦片，超出就是不可破坏的边界 */
  maxChunks: 300,       /* 最多常驻的区块数，超了就丢最老的 */
  clock: 0,
  taken: {},            /* 已经捡走的拾取物，防止回收区块后复活 */

  inBounds: function (x, y) {
    return x >= -this.HALF && y >= -this.HALF && x < this.HALF && y < this.HALF;
  },

  key: function (layer, cx, cy) { return layer + '|' + cx + '|' + cy; },

  chunk: function (layer, cx, cy) {
    var k = this.key(layer, cx, cy);
    var c = this.chunks[k];
    if (!c) {
      var fl = new Uint8Array(CHUNK * CHUNK);
      var ob = new Uint8Array(CHUNK * CHUNK);
      if (layer === 0) genSky(fl, ob, cx, cy, this.seed);
      else genGround(fl, ob, cx, cy, this.seed);
      c = { floor: fl, obj: ob, lights: [], pickups: [], dirty: false, tick: ++this.clock, cx: cx, cy: cy, layer: layer };
      this.chunks[k] = c;
      this.stats.chunks++;
      this.rebuildLights(layer, cx, cy);
      this.genPickups(c);
    }
    c.tick = ++this.clock;
    return c;
  },

  /* 地面随机拾取物：按区块确定性生成，捡过的不再刷新 */
  genPickups: function (c) {
    c.pickups.length = 0;
    for (var i = 0; i < CHUNK * CHUNK; i++) {
      var lx = i % CHUNK, ly = Math.floor(i / CHUNK);
      if (ODEF[c.obj[i]] && ODEF[c.obj[i]].solid) continue;
      var fd = FDEF[c.floor[i]];
      if (!fd || fd.void_ || fd.water || fd.hole) continue;
      var x = c.cx * CHUNK + lx, y = c.cy * CHUNK + ly;
      if (this.taken[c.layer + '|' + x + '|' + y]) continue;
      var r = hash2(x, y, this.seed + 99);
      if (r > 0.0035) continue;
      var t = pickType(hash2(x, y, this.seed + 100));
      c.pickups.push({ x: x, y: y, id: t.id, n: t.n });
    }
  },

  /* 回收：超过上限就丢掉“最老且离玩家最远”的区块（玩家改过的区块永久保留） */
  gc: function (players, layer) {
    var keys = Object.keys(this.chunks);
    if (keys.length <= this.maxChunks) return 0;
    var self = this;
    var arr = keys.map(function (k) { return self.chunks[k]; });
    arr.sort(function (a, b) {
      if (a.dirty !== b.dirty) return (a.dirty ? 1 : 0) - (b.dirty ? 1 : 0);
      return a.tick - b.tick;
    });
    var need = keys.length - this.maxChunks, dropped = 0;
    for (var i = 0; i < arr.length && need > 0; i++) {
      var c = arr[i];
      if (c.dirty) break;                       // 剩下的都是玩家改过的，不丢
      var far = true;
      if (c.layer === layer) {                  // 只在玩家当前所在层做距离保护
        for (var p = 0; p < players.length; p++) {
          var px = players[p].x / TILE, py = players[p].y / TILE;
          if (Math.abs(px - (c.cx * CHUNK + 8)) < 48 && Math.abs(py - (c.cy * CHUNK + 8)) < 48) far = false;
        }
      }
      if (!far) continue;
      delete this.chunks[this.key(c.layer, c.cx, c.cy)];
      need--; dropped++;
    }
    return dropped;
  },

  rebuildLights: function (layer, cx, cy) {
    var c = this.chunks[this.key(layer, cx, cy)];
    c.lights.length = 0;
    for (var i = 0; i < CHUNK * CHUNK; i++) {
      var o = c.obj[i];
      if (ODEF[o] && ODEF[o].light) c.lights.push([cx * CHUNK + (i % CHUNK), cy * CHUNK + Math.floor(i / CHUNK), ODEF[o].light]);
    }
  },

  getFloor: function (layer, x, y) {
    if (!this.inBounds(x, y)) return F.STONE;
    var cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    var c = this.chunk(layer, cx, cy);
    return c.floor[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
  },
  getObj: function (layer, x, y) {
    if (!this.inBounds(x, y)) return O.BEDROCK;      // 世界边缘：不可破坏的墙
    var cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    var c = this.chunk(layer, cx, cy);
    return c.obj[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
  },
  setObj: function (layer, x, y, v) {
    if (!this.inBounds(x, y)) return;
    var cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    var c = this.chunk(layer, cx, cy);
    c.obj[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)] = v;
    c.dirty = true;
    this.rebuildLights(layer, cx, cy);
  },
  setFloor: function (layer, x, y, v) {
    if (!this.inBounds(x, y)) return;
    var cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    var c = this.chunk(layer, cx, cy);
    c.floor[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)] = v;
    c.dirty = true;
  },
  /* 附近区块的拾取物（渲染与碰撞用） */
  pickupsNear: function (layer, x0, y0, x1, y1, out) {
    var cx0 = Math.floor(x0 / CHUNK), cx1 = Math.floor(x1 / CHUNK);
    var cy0 = Math.floor(y0 / CHUNK), cy1 = Math.floor(y1 / CHUNK);
    for (var cy = cy0; cy <= cy1; cy++) {
      for (var cx = cx0; cx <= cx1; cx++) {
        var c = this.chunk(layer, cx, cy);
        for (var i = 0; i < c.pickups.length; i++) out.push(c.pickups[i]);
      }
    }
    return out;
  },
  takePickup: function (layer, x, y) {
    this.taken[layer + '|' + x + '|' + y] = 1;
    var c = this.chunk(layer, Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    for (var i = c.pickups.length - 1; i >= 0; i--) {
      if (c.pickups[i].x === x && c.pickups[i].y === y) c.pickups.splice(i, 1);
    }
  },
  solid: function (layer, x, y) {
    var o = this.getObj(layer, x, y);
    return !!(ODEF[o] && ODEF[o].solid);
  },
  lightsNear: function (layer, x0, y0, x1, y1, out) {
    var cx0 = Math.floor(x0 / CHUNK), cx1 = Math.floor(x1 / CHUNK);
    var cy0 = Math.floor(y0 / CHUNK), cy1 = Math.floor(y1 / CHUNK);
    for (var cy = cy0; cy <= cy1; cy++) {
      for (var cx = cx0; cx <= cx1; cx++) {
        var c = this.chunk(layer, cx, cy);
        for (var i = 0; i < c.lights.length; i++) out.push(c.lights[i]);
      }
    }
    return out;
  },
  findSpot: function (layer, x, y, r) {
    r = r || 8;
    for (var rad = 0; rad <= r; rad++) {
      for (var a = 0; a < 20; a++) {
        var ang = a / 20 * 6.283;
        var tx = Math.round(x + Math.cos(ang) * rad);
        var ty = Math.round(y + Math.sin(ang) * rad);
        var f = this.getFloor(layer, tx, ty);
        if (FDEF[f] && FDEF[f].void_) continue;
        if (this.solid(layer, tx, ty)) continue;
        return { x: tx, y: ty };
      }
    }
    return { x: x, y: y };
  }
};

/* ---------- 生物群系 ----------
   用一条极低频的噪声把大陆切成几块：冰原 / 神秘丛林 / 烈焰山 / 平原
   同一套 seed，所以走到哪儿生成什么都是确定的 */
function biomeAt(gx, gy, seed) {
  var b1 = fbm(gx * 0.004, gy * 0.004, seed + 555, 2);
  if (b1 < 0.40) return 'ice';
  if (b1 < 0.50) return 'jungle';
  if (b1 < 0.58) return 'volcano';
  return 'plain';
}

/* ---------- 冰封迷宫（冰原上的“冰宫”，中心有宝箱） ---------- */
function genIceMaze(fl, ob, seed, ox, oy) {
  var W = 15, H = 15, x, y;
  var g = [];
  for (y = 0; y < H; y++) { g[y] = []; for (x = 0; x < W; x++) g[y][x] = 1; }
  var rnd = mulberry32((hash2(ox, oy, seed + 777) * 2147483000) | 0);
  var stack = [[1, 1]];
  g[1][1] = 0;
  var dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (stack.length) {
    var c = stack[stack.length - 1];
    for (var i = dirs.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t;
    }
    var moved = false;
    for (var d = 0; d < dirs.length; d++) {
      var nx = c[0] + dirs[d][0], ny = c[1] + dirs[d][1];
      if (nx < 1 || ny < 1 || nx > W - 2 || ny > H - 2) continue;
      if (g[ny][nx] === 0) continue;
      g[c[1] + dirs[d][1] / 2][c[0] + dirs[d][0] / 2] = 0;
      g[ny][nx] = 0;
      stack.push([nx, ny]);
      moved = true;
      break;
    }
    if (!moved) stack.pop();
  }
  /* 打通几处，别太死板 */
  for (var k = 0; k < 7; k++) {
    var rx = 1 + Math.floor(rnd() * 7) * 2, ry = 1 + Math.floor(rnd() * 7) * 2;
    if (rnd() < 0.5) { var wx = rx + (rnd() < 0.5 ? 1 : -1); if (wx > 0 && wx < W - 1) g[ry][wx] = 0; }
    else { var wy = ry + (rnd() < 0.5 ? 1 : -1); if (wy > 0 && wy < H - 1) g[wy][rx] = 0; }
  }
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      var lx = ox + x, ly = oy + y;
      if (lx < 0 || ly < 0 || lx >= CHUNK || ly >= CHUNK) continue;
      var idx = ly * CHUNK + lx;
      fl[idx] = F.SNOW;
      ob[idx] = g[y][x] ? O.ICEWALL : O.NONE;
    }
  }
  /* 南边开门，正中间放宝箱 */
  if (oy + H - 1 < CHUNK) ob[(oy + H - 1) * CHUNK + ox + 7] = O.NONE;
  if (oy + 7 < CHUNK && ox + 7 < CHUNK) ob[(oy + 7) * CHUNK + ox + 7] = O.CHEST;
}

/* ---------- 地面建筑：城堡 / 传送门祭坛 ----------
   建筑会跨区块，所以生成任一区块时，都要把「邻居区块里的建筑」压进来的那一角也画上，
   否则走到区块边界会看到半座城堡。做法：对每个区块扫描周围 3×3 个区块的建筑原点。 */
function structAt(sx, sy, seed) {
  var h = hash2(sx, sy, seed + 4242);
  if (h < 0.018) return { kind: 'castle', size: 11, ox: sx * CHUNK + 2, oy: sy * CHUNK + 2 };   // 800×800 里约 45 座
  if (h > 0.976) return { kind: 'altar', size: 5, ox: sx * CHUNK + 5, oy: sy * CHUNK + 5 };     // 传送门祭坛约 60 个
  return null;
}

/* 把一座建筑与本区块重叠的部分盖到 fl / ob 上 */
function stampStruct(fl, ob, bx, by, s) {
  var n = s.size;
  for (var ly = 0; ly < n; ly++) {
    var ay = s.oy + ly;
    if (ay < by || ay >= by + CHUNK) continue;
    for (var lx = 0; lx < n; lx++) {
      var ax = s.ox + lx;
      if (ax < bx || ax >= bx + CHUNK) continue;
      var i = (ay - by) * CHUNK + (ax - bx);
      var o = O.NONE, f = null;
      if (s.kind === 'castle') {
        var edge = (lx === 0 || ly === 0 || lx === n - 1 || ly === n - 1);
        var tower = (lx === 1 || lx === n - 2) && (ly === 1 || ly === n - 2);
        var pillar = ((lx === 3 || lx === n - 4) && (ly === 3 || ly === n - 4));
        if (edge) o = O.STONEB;
        else if (tower || pillar) o = O.STONEB;
        f = F.STONE;
        if (lx === 5 && ly === 5) o = O.CPORTAL;              // 正中央：竞技场传送门
        if (lx === 10 && ly === 5) o = O.NONE;                // 东门
        if (lx === 5 && ly === 10) o = O.NONE;                // 南门（正门）
        if ((lx === 2 && ly === 5) || (lx === 8 && ly === 5)) o = O.CHEST;
        if ((lx === 1 && (ly === 3 || ly === 7)) || (lx === 9 && (ly === 3 || ly === 7))) o = O.TORCH;
        if ((ly === 1 && (lx === 3 || lx === 7)) || (ly === 9 && (lx === 3 || lx === 7))) o = O.TORCH;
        if (lx === 5 && ly === 3) o = O.TORCH;
      } else {
        var edge2 = (lx === 0 || ly === 0 || lx === n - 1 || ly === n - 1);
        var corner = (lx === 0 || lx === n - 1) && (ly === 0 || ly === n - 1);
        f = F.STONE;
        if (corner) o = O.TORCH;
        else if (edge2) o = (lx === 2 && ly === 4) ? O.NONE : O.STONEB;   // 南边留个口子
        if (lx === 2 && ly === 2) o = O.PORTAL;               // 正中央：益智神殿传送门
      }
      if (f !== null) fl[i] = f;
      ob[i] = o;
    }
  }
}

function genStructures(fl, ob, cx, cy, seed, biome) {
  var bx = cx * CHUNK, by = cy * CHUNK;
  for (var sy = cy - 1; sy <= cy + 1; sy++) {
    for (var sx = cx - 1; sx <= cx + 1; sx++) {
      var s = structAt(sx, sy, seed);
      if (!s) continue;
      var mx = s.ox + (s.size >> 1), my = s.oy + (s.size >> 1);
      if (Math.abs(mx) < 22 && Math.abs(my - 8) < 22) continue;       // 别压在任务长老头上
      if (s.kind === 'castle' && biome === 'ice') continue;            // 冰原留给迷宫
      if (s.kind === 'castle' && biome === 'volcano') continue;        // 岩浆里盖城堡太惨
      stampStruct(fl, ob, bx, by, s);
    }
  }
}

/* ---------- 地面大陆 ---------- */
function genGround(fl, ob, cx, cy, seed) {
  var bx = cx * CHUNK, by = cy * CHUNK;
  /* 这个区块属于哪个生物群系（整块统一，边界是弯曲的自然形状）
     注意：降落点（0,0）附近强制是平原，免得一睁眼就掉进岩浆或丛林里 */
  var biome = biomeAt(bx + 8, by + 8, seed);
  if (Math.abs(bx + 8) < 44 && Math.abs(by + 8) < 44) biome = 'plain';
  for (var y = 0; y < CHUNK; y++) {
    for (var x = 0; x < CHUNK; x++) {
      var gx = bx + x, gy = by + y;
      var i = y * CHUNK + x;
      var b = fbm(gx * 0.006, gy * 0.006, seed, 2);
      var m = fbm(gx * 0.009 + 50, gy * 0.009 + 50, seed + 7, 2);
      var f;
      if (biome === 'ice') {
        if (b < 0.30) f = F.ICE;                 // 结冻的湖面
        else if (m > 0.70) f = F.STONE;
        else f = F.SNOW;
      } else if (biome === 'jungle') {
        if (b < 0.30) f = F.WATER;
        else if (m > 0.66) f = F.STONE;
        else f = F.JUNGLE;
      } else if (biome === 'volcano') {
        var l = fbm(gx * 0.013 + 120, gy * 0.013 + 120, seed + 21, 2);
        if (l < 0.28) f = F.LAVA;                // 岩浆池：踩上去会烧
        else if (l < 0.40) f = F.STONE;
        else f = F.ASH;
      } else {
        if (b < 0.33) f = F.WATER;
        else if (b < 0.385) f = F.SAND;
        else if (m > 0.62) f = F.STONE;          // 岩石高地：矿石都藏在这
        else if (m < 0.34) f = F.DIRT;
        else f = F.GRASS;
      }
      fl[i] = f;

      var r = hash2(gx, gy, seed + 33);
      var o = O.NONE;
      if (biome === 'ice') {
        if (f === F.SNOW) {
          if (r < 0.020) o = O.ICEB;
          else if (r < 0.028) o = O.ROCK;
          else if (r < 0.030) o = O.COAL;
        } else if (f === F.STONE) {
          if (r < 0.14) o = O.ROCK;
          else if (r < 0.20) o = O.COAL;
          else if (r < 0.235) o = O.IRON;
          else if (r < 0.244) o = O.GOLD;
          else if (r < 0.250) o = O.RUNE;
        }
      } else if (biome === 'jungle') {
        if (f === F.JUNGLE) {
          if (r < 0.060) o = O.JTREE;            // 密林
          else if (r < 0.150) o = O.VINE;        // 藤蔓：踩上去会变慢
          else if (r < 0.162) o = O.ROCK;
          else if (r < 0.167) o = O.CHEST;       // 丛林里宝箱更多
          else if (r < 0.172) o = O.RUNE;
        } else if (f === F.STONE) {
          if (r < 0.16) o = O.ROCK;
          else if (r < 0.22) o = O.COAL;
          else if (r < 0.255) o = O.IRON;
          else if (r < 0.264) o = O.GOLD;
          else if (r < 0.270) o = O.RUNE;
        }
      } else if (biome === 'volcano') {
        if (f === F.ASH) {
          if (r < 0.035) o = O.LAVAROCK;         // 挖开有金子
          else if (r < 0.06) o = O.ROCK;
          else if (r < 0.065) o = O.CHEST;
          else if (r < 0.069) o = O.RUNE;
        } else if (f === F.STONE) {
          if (r < 0.20) o = O.LAVAROCK;
          else if (r < 0.30) o = O.ROCK;
          else if (r < 0.345) o = O.GOLD;
          else if (r < 0.370) o = O.IRON;
          else if (r < 0.378) o = O.CHEST;
        }
      } else if (f === F.GRASS || f === F.DIRT) {
        if (r < 0.016) o = O.LOG;
        else if (r < 0.030) o = O.ROCK;
        else if (r < 0.032) o = O.COAL;
      } else if (f === F.STONE) {
        if (r < 0.16) o = O.ROCK;
        else if (r < 0.22) o = O.COAL;
        else if (r < 0.255) o = O.IRON;
        else if (r < 0.264) o = O.GOLD;
        else if (r < 0.2700) o = O.RUNE;
        else if (r < 0.2735) o = O.CHEST;
      } else if (f === F.SAND) {
        if (r < 0.008) o = O.SANDB;
        else if (r < 0.014) o = O.CACTUS;
        if (hash2(gx, gy, seed + 44) < 0.0016) fl[i] = F.UPDRAFT;
      }
      ob[i] = o;
    }
  }
  // 树冠（树叶环绕树干）
  for (var ty = 1; ty < CHUNK - 1; ty++) {
    for (var tx = 1; tx < CHUNK - 1; tx++) {
      if (ob[ty * CHUNK + tx] !== O.LOG) continue;
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          var j = (ty + oy) * CHUNK + (tx + ox);
          if (ob[j] === O.NONE) ob[j] = O.LEAVES;
        }
      }
    }
  }
  /* 冰原上的冰封迷宫（冰宫）：钻到最里面有个宝箱 */
  if (biome === 'ice' && hash2(cx, cy, seed + 777) < 0.20) genIceMaze(fl, ob, seed, 0, 0);
  /* 地面建筑：城堡（→ 竞技场）和传送门祭坛（→ 益智神殿） */
  genStructures(fl, ob, cx, cy, seed, biome);
  // 任务长老站的位置保持空地（地面层：0,8）
  for (var ny = -1; ny <= 1; ny++) {
    for (var nx = -1; nx <= 1; nx++) {
      var ex = nx - bx, ey = 8 + ny - by;
      if (ex < 0 || ey < 0 || ex >= CHUNK || ey >= CHUNK) continue;
      fl[ey * CHUNK + ex] = F.GRASS;
      ob[ey * CHUNK + ex] = O.NONE;
    }
  }
}

/* ---------- 天空岛 ---------- */
var SKY_HOLES = [[0, 8], [8, 0], [0, -8], [-8, 0]];
function genSky(fl, ob, cx, cy, seed) {
  var bx = cx * CHUNK, by = cy * CHUNK;
  for (var y = 0; y < CHUNK; y++) {
    for (var x = 0; x < CHUNK; x++) {
      var gx = bx + x, gy = by + y;
      var i = y * CHUNK + x;
      var d = Math.sqrt(gx * gx + gy * gy);
      var edge = 22 + (fbm(gx * 0.07, gy * 0.07, seed, 2) - 0.5) * 10;
      if (d > edge) { fl[i] = F.CLOUD; ob[i] = O.NONE; continue; }
      var n = fbm(gx * 0.035, gy * 0.035, seed + 9, 2);
      var f = n < 0.18 ? F.STONE : (n < 0.25 ? F.WATER : F.GRASS);
      fl[i] = f;
      var r = hash2(gx, gy, seed + 12);
      var o = O.NONE;
      if (f === F.GRASS) {
        if (r < 0.022) o = O.LOG;
        else if (r < 0.045) o = O.ROCK;
        else if (r < 0.062) o = O.COAL;
      } else if (f === F.STONE) {
        if (r < 0.10) o = O.ROCK;
        else if (r < 0.16) o = O.COAL;
        else if (r < 0.172) o = O.IRON;
      }
      ob[i] = o;
    }
  }
  // 出生点 & 任务长老周围清空（世界坐标 -2..2）
  for (var oy = -2; oy <= 2; oy++) {
    for (var ox = -2; ox <= 2; ox++) {
      var lx = ox - bx, ly = oy - by;
      if (lx < 0 || ly < 0 || lx >= CHUNK || ly >= CHUNK) continue;
      fl[ly * CHUNK + lx] = F.GRASS;
      ob[ly * CHUNK + lx] = O.NONE;
    }
  }
  // 天空岛的任务长老：世界坐标 (4,4)
  for (var qy = -1; qy <= 1; qy++) {
    for (var qx = -1; qx <= 1; qx++) {
      var qxl = 4 + qx - bx, qyl = 4 + qy - by;
      if (qxl < 0 || qyl < 0 || qxl >= CHUNK || qyl >= CHUNK) continue;
      fl[qyl * CHUNK + qxl] = F.GRASS;
      ob[qyl * CHUNK + qxl] = O.NONE;
    }
  }
  // 云洞
  for (var h = 0; h < SKY_HOLES.length; h++) {
    var hx = SKY_HOLES[h][0] - bx, hy = SKY_HOLES[h][1] - by;
    if (hx < 0 || hy < 0 || hx >= CHUNK || hy >= CHUNK) continue;
    fl[hy * CHUNK + hx] = F.HOLE;
    ob[hy * CHUNK + hx] = O.NONE;
  }
}
