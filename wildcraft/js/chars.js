/* ---------- 角色库：拳皇式选人 ----------
   CHARS 是选人界面上的全部角色。每个角色：
   - kit：身体配色（hair/hair2/band/suit/suit2/trim/skin/symbol）
   - head：头型（naruto 尖刺发 / sasuke 后掠发 / ironman 面甲 / captain 头盔 / spider 面具 / ultra 银色头 / goku 大尖刺 / pika 长耳朵）
   - eyes：眼睛风格（normal / sharingan / visor / maskwhite / glow / round）
   - stats：速度 / 血量 / 攻击倍率 / 体力（都从基础值 168 / 30 / 1.0 / 20 小幅偏离）
   drawHeroSprite 是玩家和选人头像共用的整套身体绘制。 */

var CHARS = [
  { id: 'naruto', name: '鸣人', src: '火影忍者', tag: '均衡', icon: '🌀',
    head: 'naruto', eyes: 'normal', ribbon: true,
    kit: { hair: '#F7D154', hair2: '#DDA32A', band: '#1D4ED8', suit: '#F97316', suit2: '#EA580C',
           trim: '#1E3A8A', skin: '#F3C9A0', symbol: '#1E3A8A' },
    stats: { speed: 168, hp: 30, dmg: 1.0 },
    perk: '均衡型，样样都在行' },

  { id: 'sasuke', name: '佐助', src: '火影忍者', tag: '敏捷', icon: '⚡',
    head: 'sasuke', eyes: 'sharingan', ribbon: true,
    kit: { hair: '#23232F', hair2: '#15151E', band: '#2E5480', suit: '#DDE4EE', suit2: '#B9C4D6',
           trim: '#2B3A55', skin: '#F4D8C0', symbol: '#2B3A55' },
    stats: { speed: 182, hp: 29, dmg: 0.95 },
    perk: '脚程快人一步，身板薄一点' },

  { id: 'goku', name: '孙悟空', src: '龙珠', tag: '力量', icon: '👊',
    head: 'goku', eyes: 'normal',
    kit: { hair: '#1B1B22', hair2: '#2E2E3A', band: '#1D4ED8', suit: '#F97316', suit2: '#EA580C',
           trim: '#1D4ED8', skin: '#F4D0AA', symbol: '#1D4ED8' },
    stats: { speed: 170, hp: 32, dmg: 1.15 },
    perk: '武术底子：打人格外疼' },

  { id: 'ironman', name: '钢铁侠', src: '漫威', tag: '重甲', icon: '🤖',
    head: 'ironman', eyes: 'visor', emblem: 'reactor',
    kit: { hair: '#B91C1C', hair2: '#7F1D1D', band: '#7F1D1D', suit: '#C0272D', suit2: '#8F1A1F',
           trim: '#EAB308', skin: '#C0272D', symbol: '#EAB308' },
    stats: { speed: 160, hp: 36, dmg: 1.05 },
    perk: '战甲护体：血最厚，跑得慢' },

  { id: 'captain', name: '美国队长', src: '漫威', tag: '坚毅', icon: '⭐',
    head: 'captain', eyes: 'normal', emblem: 'star',
    kit: { hair: '#8B6A3B', hair2: '#6E5228', band: '#1E40AF', suit: '#2563EB', suit2: '#1D4ED8',
           trim: '#EF4444', skin: '#F4D8C0', symbol: '#F8FAFC' },
    stats: { speed: 166, hp: 34, dmg: 1.05 },
    perk: '超级士兵血清：结实又稳' },

  { id: 'spider', name: '蜘蛛侠', src: '漫威', tag: '敏捷', icon: '🕷️',
    head: 'spider', eyes: 'maskwhite',
    kit: { hair: '#C0272D', hair2: '#8F1A1F', band: '#1D4ED8', suit: '#C0272D', suit2: '#8F1A1F',
           trim: '#1D4ED8', skin: '#C0272D', symbol: '#1D4ED8' },
    stats: { speed: 192, hp: 29, dmg: 0.95 },
    perk: '全场最快，就是不经打' },

  { id: 'ultra', name: '奥特曼', src: '特摄', tag: '光之力', icon: '🌟',
    head: 'ultra', eyes: 'glow', emblem: 'timer',
    kit: { hair: '#CBD5E1', hair2: '#94A3B8', band: '#EF4444', suit: '#D7DEE8', suit2: '#AAB6C6',
           trim: '#EF4444', skin: '#D7DEE8', symbol: '#EF4444' },
    stats: { speed: 160, hp: 32, dmg: 1.2 },
    perk: '光之巨人：一拳一个，跑得慢' },

  { id: 'pika', name: '皮卡丘', src: '宝可梦', tag: '灵巧', icon: '⚡',
    head: 'pika', eyes: 'round',
    kit: { hair: '#FACC15', hair2: '#EAB308', band: '#B45309', suit: '#FACC15', suit2: '#EAB308',
           trim: '#B45309', skin: '#FACC15', symbol: '#B45309' },
    stats: { speed: 186, hp: 29, dmg: 0.9, food: 24 },
    perk: '小身板大胃口，跑起来飞快' }
];

function charById(id) {
  for (var i = 0; i < CHARS.length; i++) if (CHARS[i].id === id) return CHARS[i];
  return null;
}

/* ---------- 通用英雄形象（玩家 + 选人头像共用） ----------
   o = { x, y, s, ch, bob2, facing, fused, fuseColor } */
function drawHeroSprite(ctx, o) {
  var x = o.x, y = o.y, s = o.s, ch = o.ch;
  var kit = ch.kit, head = ch.head;
  var bob2 = o.bob2 || 0;
  var fx = o.facing ? o.facing.x : 0, fy = o.facing ? o.facing.y : 1;

  /* 护额飘带（画在身体后面，跑起来会甩）——只有忍者系戴护额 */
  if (ch.ribbon) {
    ctx.fillStyle = kit.band;
    ctx.beginPath();
    ctx.moveTo(x - 7 * s, y - 8 * s);
    ctx.lineTo(x - 13 * s, y - 5 * s + bob2); ctx.lineTo(x - 11.5 * s, y + 2 * s + bob2); ctx.lineTo(x - 6 * s, y - 3 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 7 * s, y - 8 * s);
    ctx.lineTo(x + 13 * s, y - 5 * s - bob2); ctx.lineTo(x + 11.5 * s, y + 2 * s - bob2); ctx.lineTo(x + 6 * s, y - 3 * s);
    ctx.closePath(); ctx.fill();
  }

  /* 腿：短裤 + 绑腿 + 鞋 */
  ctx.fillStyle = kit.trim;
  ctx.fillRect(x - 7 * s, y + 3 * s, 6 * s, 6 * s);
  ctx.fillRect(x + 1 * s, y + 3 * s, 6 * s, 6 * s);
  ctx.fillStyle = (head === 'pika' || head === 'ultra') ? kit.suit2 : '#E2E8F0';
  ctx.fillRect(x - 7 * s, y + 5.4 * s, 6 * s, 2.4 * s);
  ctx.fillRect(x + 1 * s, y + 5.4 * s, 6 * s, 2.4 * s);
  ctx.fillStyle = '#1F2937';
  ctx.fillRect(x - 8 * s, y + 8.4 * s, 7 * s, 2.6 * s);
  ctx.fillRect(x + 1 * s, y + 8.4 * s, 7 * s, 2.6 * s);

  /* 上衣 */
  ctx.fillStyle = kit.suit;
  rrect(ctx, x - 9 * s, y - 8 * s, 18 * s, 14 * s, 4 * s); ctx.fill();
  ctx.fillStyle = kit.suit2;
  ctx.fillRect(x - 8 * s, y - 10 * s, 16 * s, 4 * s);
  ctx.fillStyle = kit.trim;
  ctx.fillRect(x - 1 * s, y - 7 * s, 2 * s, 12 * s);
  ctx.fillRect(x - 9 * s, y - 7 * s, 2.5 * s, 12 * s);
  ctx.fillRect(x + 6.5 * s, y - 7 * s, 2.5 * s, 12 * s);
  if (o.fused && o.fuseColor) {                     // 合体时衣服上泛起伙伴的颜色
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = o.fuseColor;
    rrect(ctx, x - 9 * s, y - 8 * s, 18 * s, 14 * s, 4 * s); ctx.fill();
    ctx.globalAlpha = 1;
  }
  /* 胸口的徽记 */
  if (ch.emblem === 'reactor') {                    // 钢铁侠：方舟反应堆
    var glow = 0.5 + 0.5 * Math.sin((o.time || 0) * 5);
    ctx.fillStyle = 'rgba(125,211,252,' + (0.35 + glow * 0.3) + ')';
    ctx.beginPath(); ctx.arc(x, y - 2 * s, 4.6 * s, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#E0F2FE';
    ctx.beginPath(); ctx.arc(x, y - 2 * s, 2.4 * s, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 1.1 * s;
    ctx.beginPath(); ctx.arc(x, y - 2 * s, 2.4 * s, 0, 6.283); ctx.stroke();
  } else if (ch.emblem === 'star') {                // 美国队长：白五角星
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    for (var st = 0; st < 5; st++) {
      var a1 = -Math.PI / 2 + st * (Math.PI * 2 / 5);
      var a2 = a1 + Math.PI / 5;
      ctx.lineTo(x + Math.cos(a1) * 4.6 * s, y - 2 * s + Math.sin(a1) * 4.6 * s);
      ctx.lineTo(x + Math.cos(a2) * 2 * s, y - 2 * s + Math.sin(a2) * 2 * s);
    }
    ctx.closePath(); ctx.fill();
  } else if (ch.emblem === 'timer') {               // 奥特曼：彩色计时器
    var blink = (Math.floor((o.time || 0) * 2) % 2 === 0);
    ctx.fillStyle = blink ? '#38BDF8' : '#F8FAFC';
    ctx.beginPath(); ctx.arc(x, y - 2 * s, 2.6 * s, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#64748B'; ctx.lineWidth = 1 * s;
    ctx.beginPath(); ctx.arc(x, y - 2 * s, 2.6 * s, 0, 6.283); ctx.stroke();
  }
  /* 手臂 + 护腕 */
  ctx.fillStyle = kit.suit;
  ctx.fillRect(x - 12.5 * s, y - 7 * s, 4 * s, 10 * s);
  ctx.fillRect(x + 8.5 * s, y - 7 * s, 4 * s, 10 * s);
  ctx.fillStyle = (head === 'ultra' || head === 'pika') ? kit.trim : '#E2E8F0';
  ctx.fillRect(x - 12.5 * s, y + 0.6 * s, 4 * s, 2.6 * s);
  ctx.fillRect(x + 8.5 * s, y + 0.6 * s, 4 * s, 2.6 * s);

  /* ---- 头 ---- */
  ctx.fillStyle = kit.skin;
  ctx.beginPath(); ctx.arc(x, y - 12 * s, 7.4 * s, 0, 6.283); ctx.fill();

  if (head === 'sasuke') {
    /* 佐助的高立领：两片深蓝立领从肩上竖起来 */
    ctx.fillStyle = kit.trim;
    ctx.beginPath();
    ctx.moveTo(x - 7.6 * s, y - 5.5 * s);
    ctx.lineTo(x - 6.2 * s, y - 12.5 * s);
    ctx.lineTo(x - 2.6 * s, y - 11 * s);
    ctx.lineTo(x - 3.6 * s, y - 5.5 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 7.6 * s, y - 5.5 * s);
    ctx.lineTo(x + 6.2 * s, y - 12.5 * s);
    ctx.lineTo(x + 2.6 * s, y - 11 * s);
    ctx.lineTo(x + 3.6 * s, y - 5.5 * s);
    ctx.closePath(); ctx.fill();
    /* 压平的头顶 + 两侧向后掠 + 后脑勺的鸭尾 */
    ctx.fillStyle = kit.hair;
    ctx.beginPath(); ctx.arc(x, y - 13 * s, 7.9 * s, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 7.6 * s, y - 15 * s); ctx.lineTo(x - 12.6 * s, y - 13 * s); ctx.lineTo(x - 8.4 * s, y - 10.5 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 7.6 * s, y - 15 * s); ctx.lineTo(x + 12.6 * s, y - 13 * s); ctx.lineTo(x + 8.4 * s, y - 10.5 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 4.2 * s, y - 19.8 * s); ctx.lineTo(x - 1.2 * s, y - 24.5 * s); ctx.lineTo(x + 2.2 * s, y - 19.8 * s);
    ctx.closePath(); ctx.fill();
  } else if (head === 'goku') {
    /* 悟空：又大又乱的黑色尖刺发 */
    ctx.fillStyle = kit.hair;
    ctx.beginPath();
    ctx.moveTo(x - 8.4 * s, y - 11 * s);
    ctx.lineTo(x - 12.5 * s, y - 19 * s); ctx.lineTo(x - 7 * s, y - 14.5 * s);
    ctx.lineTo(x - 8 * s, y - 24 * s); ctx.lineTo(x - 3.6 * s, y - 16.5 * s);
    ctx.lineTo(x - 1.5 * s, y - 25.5 * s); ctx.lineTo(x + 1.5 * s, y - 16.5 * s);
    ctx.lineTo(x + 4.5 * s, y - 24.5 * s); ctx.lineTo(x + 5.5 * s, y - 14.5 * s);
    ctx.lineTo(x + 11 * s, y - 20 * s); ctx.lineTo(x + 8.4 * s, y - 11 * s);
    ctx.closePath(); ctx.fill();
  } else if (head === 'ironman') {
    /* 钢铁侠：红头盔 + 金色面甲 + 眼缝发光 */
    ctx.fillStyle = kit.hair2;
    ctx.beginPath(); ctx.arc(x, y - 13 * s, 7.8 * s, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = kit.trim;                       // 金色面甲（下半张脸）
    rrect(ctx, x - 6.4 * s, y - 11.4 * s, 12.8 * s, 7.4 * s, 3 * s); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.8 * s;
    rrect(ctx, x - 6.4 * s, y - 11.4 * s, 12.8 * s, 7.4 * s, 3 * s); ctx.stroke();
    ctx.fillStyle = '#7DD3FC';                      // 眼缝
    ctx.fillRect(x - 4.8 * s, y - 10.6 * s, 4 * s, 1.8 * s);
    ctx.fillRect(x + 0.8 * s, y - 10.6 * s, 4 * s, 1.8 * s);
    ctx.fillStyle = 'rgba(125,211,252,.35)';        // 面甲反光
    ctx.fillRect(x - 6 * s, y - 11 * s, 5 * s, 1.2 * s);
  } else if (head === 'captain') {
    /* 美国队长：蓝色头盔 + 额头 A 字 + 两侧小翅膀 */
    ctx.fillStyle = kit.band;
    ctx.beginPath(); ctx.arc(x, y - 12.8 * s, 7.8 * s, Math.PI * 0.95, Math.PI * 0.05); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 7.6 * s, y - 13.2 * s, 15.2 * s, 2.6 * s);
    ctx.fillStyle = '#F8FAFC';                      // 额头的 A
    ctx.font = 'bold ' + (4.6 * s) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('A', x, y - 13.2 * s);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#F8FAFC';                      // 两鬓的小翅膀
    ctx.beginPath();
    ctx.moveTo(x - 7.8 * s, y - 13 * s); ctx.lineTo(x - 11 * s, y - 14.4 * s); ctx.lineTo(x - 7.8 * s, y - 11.6 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 7.8 * s, y - 13 * s); ctx.lineTo(x + 11 * s, y - 14.4 * s); ctx.lineTo(x + 7.8 * s, y - 11.6 * s);
    ctx.closePath(); ctx.fill();
  } else if (head === 'spider') {
    /* 蜘蛛侠：红头套 + 大白眼睛 + 两根网线 */
    ctx.fillStyle = kit.skin;
    ctx.beginPath(); ctx.arc(x, y - 12 * s, 7.5 * s, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(29,26,26,.55)'; ctx.lineWidth = 0.7 * s;
    for (var wl = -2; wl <= 2; wl++) {              // 简单的网纹
      ctx.beginPath();
      ctx.moveTo(x, y - 19 * s);
      ctx.lineTo(x + wl * 3.4 * s, y - 12 * s);
      ctx.stroke();
    }
    ctx.fillStyle = '#F1F5F9';                      // 大白眼睛（泪滴形）
    ctx.beginPath();
    ctx.moveTo(x - 6.8 * s, y - 12.4 * s);
    ctx.quadraticCurveTo(x - 5.2 * s, y - 8.8 * s, x - 1.6 * s, y - 10 * s);
    ctx.quadraticCurveTo(x - 2.6 * s, y - 14.6 * s, x - 6.8 * s, y - 12.4 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 6.8 * s, y - 12.4 * s);
    ctx.quadraticCurveTo(x + 5.2 * s, y - 8.8 * s, x + 1.6 * s, y - 10 * s);
    ctx.quadraticCurveTo(x + 2.6 * s, y - 14.6 * s, x + 6.8 * s, y - 12.4 * s);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 0.9 * s;
    ctx.beginPath();
    ctx.moveTo(x - 6.8 * s, y - 12.4 * s);
    ctx.quadraticCurveTo(x - 5.2 * s, y - 8.8 * s, x - 1.6 * s, y - 10 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 6.8 * s, y - 12.4 * s);
    ctx.quadraticCurveTo(x + 5.2 * s, y - 8.8 * s, x + 1.6 * s, y - 10 * s);
    ctx.stroke();
  } else if (head === 'ultra') {
    /* 奥特曼：银色头 + 红色冠羽 + 发光的椭圆眼 */
    ctx.fillStyle = kit.skin;
    ctx.beginPath(); ctx.arc(x, y - 12 * s, 7.6 * s, 0, 6.283); ctx.fill();
    ctx.fillStyle = kit.trim;                       // 从额头劈下来的红色冠羽
    ctx.beginPath();
    ctx.moveTo(x - 2.1 * s, y - 19.4 * s);
    ctx.lineTo(x + 2.1 * s, y - 19.4 * s);
    ctx.lineTo(x + 1.4 * s, y - 10.4 * s);
    ctx.lineTo(x - 1.4 * s, y - 10.4 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - 18.6 * s, 2.3 * s, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FDE047';                      // 发光的椭圆眼
    ctx.beginPath(); ctx.ellipse(x - 3.4 * s, y - 11.6 * s, 1.7 * s, 2.4 * s, -0.25, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 3.4 * s, y - 11.6 * s, 1.7 * s, 2.4 * s, 0.25, 0, 6.283); ctx.fill();
  } else if (head === 'pika') {
    /* 皮卡丘：黄色圆头 + 两只尖耳朵 + 红脸蛋 */
    ctx.fillStyle = kit.hair2;                      // 先画耳朵（黑尖黄身）
    ctx.beginPath();
    ctx.moveTo(x - 6.5 * s, y - 17 * s); ctx.lineTo(x - 9.5 * s, y - 26.5 * s); ctx.lineTo(x - 3 * s, y - 19 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 6.5 * s, y - 17 * s); ctx.lineTo(x + 9.5 * s, y - 26.5 * s); ctx.lineTo(x + 3 * s, y - 19 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = kit.skin;
    ctx.beginPath();
    ctx.moveTo(x - 6.2 * s, y - 17.6 * s); ctx.lineTo(x - 8.6 * s, y - 24.6 * s); ctx.lineTo(x - 4 * s, y - 18.6 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 6.2 * s, y - 17.6 * s); ctx.lineTo(x + 8.6 * s, y - 24.6 * s); ctx.lineTo(x + 4 * s, y - 18.6 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#EF4444';                      // 红脸蛋
    ctx.beginPath(); ctx.arc(x - 5.4 * s, y - 9.8 * s, 1.9 * s, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 5.4 * s, y - 9.8 * s, 1.9 * s, 0, 6.283); ctx.fill();
  } else {
    /* 鸣人：尖刺头发（默认头型） */
    ctx.fillStyle = kit.hair;
    ctx.beginPath();
    ctx.moveTo(x - 8 * s, y - 12 * s);
    ctx.lineTo(x - 10.5 * s, y - 18 * s); ctx.lineTo(x - 6.5 * s, y - 14.5 * s);
    ctx.lineTo(x - 6 * s, y - 21.5 * s); ctx.lineTo(x - 2.5 * s, y - 15.5 * s);
    ctx.lineTo(x - 0.5 * s, y - 23 * s); ctx.lineTo(x + 2 * s, y - 15.5 * s);
    ctx.lineTo(x + 4.5 * s, y - 21 * s); ctx.lineTo(x + 5.5 * s, y - 14.5 * s);
    ctx.lineTo(x + 9.5 * s, y - 18.5 * s); ctx.lineTo(x + 8 * s, y - 11 * s);
    ctx.closePath(); ctx.fill();
  }

  if (head === 'naruto' || head === 'sasuke') {
    /* 护额：布带 + 金属牌 + 村子的标志（鸣人螺旋 / 佐助叶子） */
    ctx.fillStyle = kit.band;
    ctx.fillRect(x - 8.5 * s, y - 16.6 * s, 17 * s, 4.8 * s);
    ctx.fillStyle = '#CBD5E1';
    rrect(ctx, x - 5 * s, y - 16.9 * s, 10 * s, 5.4 * s, 2 * s); ctx.fill();
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 0.9 * s;
    rrect(ctx, x - 5 * s, y - 16.9 * s, 10 * s, 5.4 * s, 2 * s); ctx.stroke();
    ctx.strokeStyle = kit.symbol; ctx.lineWidth = 1.3 * s;
    ctx.beginPath();
    if (head === 'naruto') ctx.arc(x, y - 14.2 * s, 2.4 * s, 0.7, 5.3);
    else {
      ctx.moveTo(x - 2.6 * s, y - 13 * s);
      ctx.quadraticCurveTo(x, y - 16.4 * s, x + 2.6 * s, y - 13.4 * s);
      ctx.moveTo(x - 2.6 * s, y - 13 * s);
      ctx.quadraticCurveTo(x - 0.4 * s, y - 14.6 * s, x + 2.6 * s, y - 13.4 * s);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(x - 4 * s, y - 16.3 * s, 8 * s, 1.2 * s);
    /* 额前的头发 */
    ctx.fillStyle = kit.hair2;
    if (head === 'sasuke') {
      ctx.beginPath();
      ctx.moveTo(x - 8.3 * s, y - 16.6 * s);
      ctx.lineTo(x - 6.6 * s, y - 8.2 * s);
      ctx.lineTo(x - 3.4 * s, y - 12.8 * s);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 8.3 * s, y - 16.6 * s);
      ctx.lineTo(x + 6.6 * s, y - 8.2 * s);
      ctx.lineTo(x + 3.4 * s, y - 12.8 * s);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - 8.5 * s, y - 16.4 * s);
      ctx.lineTo(x - 4.5 * s, y - 19 * s); ctx.lineTo(x - 1.5 * s, y - 16.4 * s);
      ctx.lineTo(x + 2 * s, y - 19.4 * s); ctx.lineTo(x + 5 * s, y - 16.4 * s);
      ctx.lineTo(x + 8.5 * s, y - 18 * s); ctx.lineTo(x + 8.5 * s, y - 15.4 * s);
      ctx.lineTo(x - 8.5 * s, y - 15.4 * s);
      ctx.closePath(); ctx.fill();
    }
  }

  /* ---- 眼睛（跟着朝向偏一点） ---- */
  var ex2 = fx * 2.4 * s, ey2 = fy * 1.5 * s;
  if (ch.eyes === 'sharingan') {
    ctx.fillStyle = '#7F1D1D';
    ctx.fillRect(x - 4.2 * s + ex2, y - 10.8 * s + ey2, 2.6 * s, 3.4 * s);
    ctx.fillRect(x + 1.6 * s + ex2, y - 10.8 * s + ey2, 2.6 * s, 3.4 * s);
    ctx.fillStyle = '#DC2626';
    ctx.fillRect(x - 3.8 * s + ex2, y - 10.5 * s + ey2, 1.8 * s, 2.6 * s);
    ctx.fillRect(x + 2 * s + ex2, y - 10.5 * s + ey2, 1.8 * s, 2.6 * s);
    ctx.fillStyle = '#450A0A';
    ctx.fillRect(x - 3.1 * s + ex2, y - 9.9 * s + ey2, 0.8 * s, 1.4 * s);
    ctx.fillRect(x + 2.7 * s + ex2, y - 9.9 * s + ey2, 0.8 * s, 1.4 * s);
  } else if (ch.eyes === 'round') {
    ctx.fillStyle = '#1F2937';                      // 皮卡丘：又黑又圆
    ctx.beginPath(); ctx.arc(x - 3.2 * s + ex2, y - 11 * s + ey2, 1.9 * s, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3.2 * s + ex2, y - 11 * s + ey2, 1.9 * s, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath(); ctx.arc(x - 2.6 * s + ex2, y - 11.6 * s + ey2, 0.7 * s, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3.8 * s + ex2, y - 11.6 * s + ey2, 0.7 * s, 0, 6.283); ctx.fill();
  }
  /* visor（钢铁侠）/ maskwhite（蜘蛛侠）/ glow（奥特曼）的眼睛已经画在头盔里了 */
  else if (ch.eyes === 'normal') {
    ctx.fillStyle = '#22303F';
    ctx.fillRect(x - 4.2 * s + ex2, y - 10.8 * s + ey2, 2.6 * s, 3.4 * s);
    ctx.fillRect(x + 1.6 * s + ex2, y - 10.8 * s + ey2, 2.6 * s, 3.4 * s);
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillRect(x - 3.6 * s + ex2, y - 10.4 * s + ey2, 1.1 * s, 1.1 * s);
    ctx.fillRect(x + 2.2 * s + ex2, y - 10.4 * s + ey2, 1.1 * s, 1.1 * s);
  }
}

/* 选人卡片上的头像（大头照风格：身体缩小 + 头放大一点） */
function drawCharPortrait(ctx, ch, w, h, time) {
  ctx.clearRect(0, 0, w, h);
  var s = Math.min(w, h) / 40;
  var x = w / 2, y = h / 2 + 8.5 * s;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(x, y + 10.5 * s, 10 * s, 4 * s, 0, 0, 6.283); ctx.fill();
  drawHeroSprite(ctx, { x: x, y: y, s: s, ch: ch, bob2: 0, facing: { x: 0, y: 1 }, fused: false, time: time || 0 });
}
