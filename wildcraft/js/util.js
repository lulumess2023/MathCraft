/* 基础工具：噪声、随机、碰撞辅助 */
var TILE = 32;
var CHUNK = 16;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function hash2(x, y, seed) {
  var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((seed | 0) + 1013, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function vnoise(x, y, seed) {
  var xi = Math.floor(x), yi = Math.floor(y);
  var xf = x - xi, yf = y - yi;
  var a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  var c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, smooth(xf)), lerp(c, d, smooth(xf)), smooth(yf));
}

function fbm(x, y, seed, oct) {
  oct = oct || 3;
  var sum = 0, amp = 0.5, f = 1, norm = 0;
  for (var i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, seed + i * 101);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 卡在方块里时的自救：螺旋找最近的可站格子并挪过去 */
function unstick(e) {
  var tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
  if (!Game.solidAt(tx, ty)) return false;
  for (var r = 1; r <= 6; r++) {
    for (var a = 0; a < 16; a++) {
      var ang = a / 16 * 6.283;
      var nx = tx + Math.round(Math.cos(ang) * r), ny = ty + Math.round(Math.sin(ang) * r);
      if (Game.solidAt(nx, ny)) continue;
      var f = Game.floorAt(nx, ny);
      if (FDEF[f] && FDEF[f].void_) continue;
      e.x = nx * TILE + TILE / 2; e.y = ny * TILE + TILE / 2;
      return true;
    }
  }
  return false;
}

/* 圆角矩形（老浏览器兜底）。负半径会让 arcTo 抛异常、拖死整个渲染循环，必须钳住 */
function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
