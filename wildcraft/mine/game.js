// ==================== 方块世界 2D - 游戏引擎 ====================

// ===== 工具函数 =====
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(seed) {
    let s = seed;
    return function() {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

// 简单噪声生成器
class SimpleNoise {
    constructor(seed = 12345) {
        this.seed = seed;
        this.rng = rand(seed);
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 256; i++) this.perm[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(this.rng() * (i + 1));
            [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
        }
        for (let i = 0; i < 256; i++) this.perm[i + 256] = this.perm[i];
    }
    
    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(a, b, t) { return a + (b - a) * t; }
    grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
    }
    
    noise2D(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = this.fade(x);
        const v = this.fade(y);
        const A = this.perm[X] + Y, B = this.perm[X + 1] + Y;
        return this.lerp(
            this.lerp(this.grad(this.perm[A], x, y), this.grad(this.perm[B], x - 1, y), u),
            this.lerp(this.grad(this.perm[A + 1], x, y - 1), this.grad(this.perm[B + 1], x - 1, y - 1), u),
            v
        );
    }
    
    fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
        let total = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            total += this.noise2D(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        return total / maxValue;
    }
}

// ===== 方块类型 =====
const BLOCKS = {
    0: { id: 0, name: '空气', solid: false, breakable: false, color: null },
    1: { id: 1, name: '草方块', solid: true, breakable: true, color: '#5d9e43', topColor: '#5d9e43', sideColor: '#8b6f4e', hardness: 1.0 },
    2: { id: 2, name: '泥土', solid: true, breakable: true, color: '#8b6f4e', hardness: 1.0 },
    3: { id: 3, name: '石头', solid: true, breakable: true, color: '#7a7a7a', hardness: 3.0 },
    4: { id: 4, name: '原木', solid: true, breakable: true, color: '#6b4226', hardness: 2.0 },
    5: { id: 5, name: '木板', solid: true, breakable: true, color: '#b8956a', hardness: 1.5 },
    6: { id: 6, name: '沙子', solid: true, breakable: true, color: '#e0d5a0', hardness: 1.0, gravity: true },
    7: { id: 7, name: '玻璃', solid: true, breakable: true, color: 'rgba(180,220,230,0.5)', hardness: 0.5, transparent: true },
    8: { id: 8, name: '砖块', solid: true, breakable: true, color: '#a05040', hardness: 3.0 },
    9: { id: 9, name: '萤石', solid: true, breakable: true, color: '#f0e080', hardness: 1.5, light: 12 },
    10: { id: 10, name: '树叶', solid: true, breakable: true, color: '#4a8a35', hardness: 0.5 },
    11: { id: 11, name: '基岩', solid: true, breakable: false, color: '#3a3a3a', hardness: -1 },
    12: { id: 12, name: '煤矿石', solid: true, breakable: true, color: '#4a4a4a', hardness: 4.0 },
    13: { id: 13, name: '铁矿石', solid: true, breakable: true, color: '#9a7a6a', hardness: 5.0 },
    14: { id: 14, name: '金矿石', solid: true, breakable: true, color: '#d4af37', hardness: 5.0 },
    15: { id: 15, name: '钻石矿石', solid: true, breakable: true, color: '#4aedd5', hardness: 6.0 },
    16: { id: 16, name: '雪块', solid: true, breakable: true, color: '#f0f0f0', hardness: 1.0 },
    17: { id: 17, name: '仙人掌', solid: true, breakable: true, color: '#2a8a4a', hardness: 0.5 },
    18: { id: 18, name: '水', solid: false, breakable: false, color: 'rgba(60,120,200,0.6)', transparent: true },
    // voxelcraft 融合方块
    19: { id: 19, name: '圆石', solid: true, breakable: true, color: '#747476', hardness: 3.0 },
    20: { id: 20, name: '黑曜石', solid: true, breakable: true, color: '#2e284a', hardness: 8.0 },
    21: { id: 21, name: '冰', solid: true, breakable: true, color: 'rgba(166,206,238,0.8)', hardness: 1.0, transparent: true },
};

const HOTBAR_PAGES = [
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 99],
    [19, 20, 21, 16, 18, 10, 12, 13, 14, 15],
];
const HOTBAR_BLOCKS = HOTBAR_PAGES[0];
const GUN = 99;
const ICON_CLASS = {
    1: 'grass', 2: 'dirt', 3: 'stone', 4: 'wood', 5: 'plank', 6: 'sand',
    7: 'glass', 8: 'brick', 9: 'glowstone', 99: 'gun',
    19: 'cobble', 20: 'obsidian', 21: 'ice', 16: 'snow', 18: 'water',
    10: 'leaf', 12: 'coal', 13: 'iron', 14: 'gold', 15: 'diamond',
};

// ===== 合成配方（wildcraft 玩法融合） =====
const RECIPES = [
    { name: '木板 ×4',   out: 5, n: 4, cost: { 4: 1 } },
    { name: '砖块 ×1',   out: 8, n: 1, cost: { 3: 2 } },
    { name: '玻璃 ×2',   out: 7, n: 2, cost: { 6: 2, 12: 1 } },
    { name: '萤石 ×1',   out: 9, n: 1, cost: { 14: 1, 12: 2 } },
    { name: '黑曜石 ×1', out: 20, n: 1, cost: { 3: 4, 12: 2 } },
    { name: '治疗包 +8', heal: 8, cost: { 10: 4 } },
];

// ===== 昼夜天空渐变表（voxelcraft 融合：连续插值，不再是三段硬切） =====
const SKY_TABLE = [
    { t: 0.00, top: [6, 9, 20],    hor: [16, 22, 42],    light: 0.30 },
    { t: 0.19, top: [38, 54, 96],  hor: [122, 86, 86],   light: 0.55 },
    { t: 0.26, top: [92, 142, 214], hor: [196, 168, 150], light: 0.86 },
    { t: 0.50, top: [74, 132, 222], hor: [168, 204, 240], light: 1.00 },
    { t: 0.74, top: [86, 132, 206], hor: [214, 158, 116], light: 0.84 },
    { t: 0.81, top: [40, 52, 92],  hor: [150, 92, 74],   light: 0.50 },
    { t: 1.00, top: [6, 9, 20],    hor: [16, 22, 42],    light: 0.30 },
];
function skyAt(p) {
    let a = SKY_TABLE[0], b = SKY_TABLE[SKY_TABLE.length - 1];
    for (let i = 0; i < SKY_TABLE.length - 1; i++) {
        if (p >= SKY_TABLE[i].t && p <= SKY_TABLE[i + 1].t) { a = SKY_TABLE[i]; b = SKY_TABLE[i + 1]; break; }
    }
    const k = b.t === a.t ? 0 : (x => x * x * (3 - 2 * x))(clamp((p - a.t) / (b.t - a.t), 0, 1));
    const mix = (u, v) => [lerp(u[0], v[0], k), lerp(u[1], v[1], k), lerp(u[2], v[2], k)];
    return { top: mix(a.top, b.top), hor: mix(a.hor, b.hor), light: lerp(a.light, b.light, k) };
}

// ===== 世界 =====
class World {
    constructor(width, height, seed = Date.now()) {
        this.width = width;
        this.height = height;
        this.seed = seed;
        this.noise = new SimpleNoise(seed);
        this.noise2 = new SimpleNoise(seed + 1);
        this.noise3 = new SimpleNoise(seed + 2);
        this.blocks = new Uint8Array(width * height);
        this.light = new Uint8Array(width * height);
        this.biome = new Uint8Array(width); // 每个x列的生物群系
        this.generated = false;
    }
    
    idx(x, y) { return y * this.width + x; }
    get(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 11; // 边界=基岩
        return this.blocks[this.idx(x, y)];
    }
    set(x, y, id) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        this.blocks[this.idx(x, y)] = id;
    }
    isSolid(x, y) {
        const b = BLOCKS[this.get(x, y)];
        return b && b.solid;
    }
    
    generate(progressCallback) {
        const seaLevel = Math.floor(this.height * 0.45);
        
        // 先生成生物群系
        for (let x = 0; x < this.width; x++) {
            const biomeNoise = this.noise2.fbm(x * 0.005, 0, 2);
            if (biomeNoise > 0.3) this.biome[x] = 1; // 沙漠
            else if (biomeNoise < -0.3) this.biome[x] = 2; // 雪地
            else this.biome[x] = 0; // 草地
        }
        
        for (let x = 0; x < this.width; x++) {
            // 地形高度（y 向下增长：surfaceY 越小 = 山越高）
            const heightNoise = this.noise.fbm(x * 0.008, 0, 4, 0.5, 2.0);
            const surfaceY = seaLevel + Math.floor(heightNoise * 25);
            
            const biome = this.biome[x];
            const underwater = surfaceY > seaLevel;   // 地表低于海平面 → 水下
            
            for (let y = 0; y < this.height; y++) {
                if (y >= this.height - 3) {
                    this.set(x, y, 11); // 基岩（世界底部）
                } else if (y === surfaceY) {
                    // 地表层
                    if (underwater || biome === 1) this.set(x, y, 6); // 水下/沙漠 → 沙子
                    else if (biome === 2) this.set(x, y, 16);         // 雪地
                    else this.set(x, y, 1);                           // 草
                } else if (y < surfaceY) {
                    this.set(x, y, 0); // 天空
                } else if (underwater && y <= seaLevel) {
                    // 海水（填到海平面）；voxelcraft：海面随机薄冰
                    const icy = this.noise2.noise2D(x * 0.3, 7.7) > 0.25;
                    this.set(x, y, (y === seaLevel && icy) ? 21 : 18);
                } else if (y <= surfaceY + 4) {
                    this.set(x, y, 2); // 泥土层
                } else {
                    // 地下深处（离基岩越近矿越好）
                    const oreNoise = this.noise3.noise2D(x * 0.1, y * 0.1);
                    const d2b = this.height - y;   // 距基岩距离
                    // voxelcraft：3D 噪声洞穴隧道
                    const cav1 = this.noise3.noise2D(x * 0.09, y * 0.13);
                    const cav2 = this.noise2.noise2D(x * 0.05 + 30, y * 0.06 + 30);
                    if (Math.abs(cav1) < 0.075 && cav2 > 0.05 && y > surfaceY + 6) {
                        this.set(x, y, 0);   // 洞穴空气
                    }
                    else if (d2b < 15 && oreNoise > 0.85) this.set(x, y, 15); // 钻石
                    else if (d2b < 25 && oreNoise > 0.75) this.set(x, y, 14); // 金
                    else if (d2b < 40 && oreNoise > 0.7) this.set(x, y, 13); // 铁
                    else if (oreNoise > 0.65) this.set(x, y, 12); // 煤
                    else if (d2b < 6 && oreNoise > 0.55) this.set(x, y, 20); // 黑曜石（贴基岩）
                    else if (this.noise3.noise2D(x * 0.15 + 50, y * 0.15 + 50) > 0.84) this.set(x, y, 19); // 圆石脉
                    else this.set(x, y, 3); // 石头
                }
            }
            
            // 生成树木（干燥的草地）
            if (biome === 0 && !underwater && Math.random() < 0.06) {
                this.generateTree(x, surfaceY - 1);
            }
            // 沙漠仙人掌
            if (biome === 1 && !underwater && Math.random() < 0.03) {
                this.generateCactus(x, surfaceY - 1);
            }
            
            if (x % 10 === 0 && progressCallback) progressCallback(x / this.width);
        }
        
        this.generated = true;
        this.seaLevel = seaLevel;
        this.calculateLighting();
    }
    
    generateTree(x, y) {
        const trunkHeight = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < trunkHeight; i++) this.set(x, y - i, 4);
        // 树叶
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -trunkHeight - 1; dy <= -trunkHeight + 1; dy++) {
                if (Math.abs(dx) + Math.abs(dy + trunkHeight) <= 3 && this.get(x + dx, y + dy) === 0) {
                    this.set(x + dx, y + dy, 10);
                }
            }
        }
    }
    
    generateCactus(x, y) {
        const h = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < h; i++) this.set(x, y - i, 17);
    }
    
    calculateLighting() {
        // 天空光从上往下传播；空气/水/玻璃不衰减，只有实心方块挡光
        for (let x = 0; x < this.width; x++) {
            let light = 15;
            for (let y = 0; y < this.height; y++) {
                const b = BLOCKS[this.get(x, y)];
                if (b.light) light = Math.max(light, b.light); // 萤石发光
                this.light[this.idx(x, y)] = light;
                if (b.solid && !b.transparent) {
                    light = Math.max(0, light - 2);
                }
            }
        }
    }
}

// ===== 粒子系统 =====
class Particle {
    constructor(x, y, color, vx, vy, life) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.size = 3 + Math.random() * 3;
    }
    update(dt) {
        this.vy += 20 * dt; // 重力
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        return this.life > 0;
    }
    draw(ctx, camX, camY, scale) {
        const alpha = this.life / this.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        const sx = (this.x - camX) * scale;
        const sy = (this.y - camY) * scale;
        ctx.fillRect(sx, sy, this.size * scale * 0.5, this.size * scale * 0.5);
        ctx.globalAlpha = 1;
    }
}

// ===== 玩家 =====
class Player {
    constructor(x, y, idx = 0) {
        this.x = x;
        this.y = y;
        this.idx = idx;   // 0 = 一号（蓝绿）, 1 = 二号（紫色）
        this.vx = 0;
        this.vy = 0;
        this.width = 0.6;
        this.height = 1.8;
        this.onGround = false;
        this.speed = 6;
        this.jumpPower = 13;
        this.gravity = 35;
        this.facingRight = true;
        this.hp = 20; this.maxHp = 20;
        this.invuln = 0; this.hurtT = 0; this.kbT = 0;
        this.dead = false;
    }
    
    update(dt, world, input) {
        // voxelcraft 融合：身体是否在水里
        const inWater = world.get(Math.floor(this.x), Math.floor(this.y - this.height * 0.5)) === 18;
        this.inWater = inWater;
        const spd = this.speed * (input.sprint ? 1.5 : 1) * (inWater ? 0.6 : 1);
        
        // 水平移动（被击退时暂时不受控制）
        if (this.kbT > 0) {
            this.kbT -= dt;
            this.vx *= 0.9;
        } else {
            this.vx = 0;
            if (input.left) { this.vx = -spd; this.facingRight = false; }
            if (input.right) { this.vx = spd; this.facingRight = true; }
        }
        
        // 跳跃 / 水里上浮
        if (input.jump && (this.onGround || inWater)) {
            this.vy = inWater ? -4.5 : -this.jumpPower;
            this.onGround = false;
        }
        
        // 重力（voxelcraft：水阻 + 浮力）
        this.vy += (inWater ? this.gravity * 0.28 : this.gravity) * dt;
        if (inWater) this.vy *= (1 - 2.2 * dt);
        
        // 限制下落速度
        this.vy = Math.min(this.vy, inWater ? 4 : 25);
        
        // 水平碰撞（voxelcraft：被 1 格台阶挡住且头顶有空 → 自动抬上去）
        const oldX = this.x;
        this.x += this.vx * dt;
        this.resolveCollision(world, true);
        if (!inWater && this.onGround && this.vx === 0 && Math.abs(this.x - oldX) < 1e-6 &&
            (input.left || input.right)) {
            const dir = input.right ? 1 : -1;
            const footY = Math.floor(this.y);
            const ahead = Math.floor(this.x + dir * (this.width / 2 + 0.2));
            if (world.isSolid(ahead, footY) &&
                !world.isSolid(ahead, footY - 1) && !world.isSolid(ahead, footY - 2)) {
                this.y = footY - 0.01;
                this.onGround = true;
            }
        }
        
        // 垂直碰撞
        this.y += this.vy * dt;
        this.onGround = false;
        this.resolveCollision(world, false);
        
        if (this.invuln > 0) this.invuln -= dt;
        if (this.hurtT > 0) this.hurtT -= dt;
    }
    
    resolveCollision(world, horizontal) {
        const left = Math.floor(this.x - this.width / 2);
        const right = Math.floor(this.x + this.width / 2);
        const top = Math.floor(this.y - this.height);
        const bottom = Math.floor(this.y);
        
        for (let bx = left; bx <= right; bx++) {
            for (let by = top; by <= bottom; by++) {
                if (world.isSolid(bx, by)) {
                    if (horizontal) {
                        if (this.vx > 0) this.x = bx - this.width / 2 - 0.01;
                        else if (this.vx < 0) this.x = bx + 1 + this.width / 2 + 0.01;
                        this.vx = 0;
                    } else {
                        if (this.vy > 0) {
                            // 单帧修正量超过 1.05 格 = 被嵌进地形里，拒绝瞬移（防"电梯上天"）
                            if (this.y - (by - 0.01) <= 1.05) {
                                this.y = by - 0.01;
                                this.onGround = true;
                            }
                        } else if (this.vy < 0) {
                            const ny = by + 1 + this.height + 0.01;
                            if (ny - this.y <= 1.05) this.y = ny;
                        }
                        this.vy = 0;
                    }
                    return;
                }
            }
        }
    }
    
    getCenter() { return { x: this.x, y: this.y - this.height / 2 }; }
    
    draw(ctx, camX, camY, scale) {
        const sx = (this.x - this.width / 2 - camX) * scale;
        const sy = (this.y - this.height - camY) * scale;
        const w = this.width * scale;
        const h = this.height * scale;
        
        // 双人配色：P1 蓝绿 / P2 紫色
        const C = this.idx === 1
            ? { body: '#9b59b6', skin: '#f39c12', dark: '#5b2c6f' }
            : { body: '#2a9d8f', skin: '#e9c46a', dark: '#264653' };
        
        // 无敌闪烁
        if (this.invuln > 0) ctx.globalAlpha = 0.55;
        
        // 身体
        ctx.fillStyle = C.body;
        ctx.fillRect(sx + w * 0.15, sy + h * 0.25, w * 0.7, h * 0.5);
        
        // 头
        ctx.fillStyle = C.skin;
        ctx.fillRect(sx + w * 0.2, sy, w * 0.6, h * 0.3);
        
        // 眼睛
        ctx.fillStyle = C.dark;
        if (this.facingRight) {
            ctx.fillRect(sx + w * 0.55, sy + h * 0.1, w * 0.12, h * 0.08);
        } else {
            ctx.fillRect(sx + w * 0.33, sy + h * 0.1, w * 0.12, h * 0.08);
        }
        
        // 腿
        ctx.fillStyle = C.dark;
        ctx.fillRect(sx + w * 0.2, sy + h * 0.75, w * 0.25, h * 0.25);
        ctx.fillRect(sx + w * 0.55, sy + h * 0.75, w * 0.25, h * 0.25);
        
        // 手臂
        ctx.fillStyle = C.skin;
        if (this.facingRight) {
            ctx.fillRect(sx + w * 0.85, sy + h * 0.3, w * 0.2, h * 0.3);
        } else {
            ctx.fillRect(sx - w * 0.05, sy + h * 0.3, w * 0.2, h * 0.3);
        }
        
        // 受击红闪
        if (this.hurtT > 0) {
            ctx.fillStyle = `rgba(255,60,60,${Math.min(0.5, this.hurtT)})`;
            ctx.fillRect(sx, sy, w, h);
        }
        ctx.globalAlpha = 1;
    }
}

// ===== 夜晚怪物 =====
const MOB_TYPES = {
    zombie:   { name: '僵尸',     hp: 40, speed: 4.2, dmg: 4, ranged: false },
    skeleton: { name: '骷髅弓手', hp: 25, speed: 3.4, dmg: 3, ranged: true },
    // wildcraft 融合怪种
    spider:   { name: '蜘蛛',     hp: 30, speed: 5.6, dmg: 3, ranged: false, leaper: true, w: 1.1, h: 0.9 },
    brute:    { name: '蛮兵',     hp: 90, speed: 3.0, dmg: 8, ranged: false, big: true, w: 0.95, h: 2.4 },
};

class Mob {
    constructor(kind, x, y, buff = 1) {
        const T = MOB_TYPES[kind];
        this.kind = kind;
        this.T = T;
        this.x = x; this.y = y;
        this.vx = 0; this.vy = 0;
        this.width = T.w || 0.6; this.height = T.h || 1.8;
        this.hp = Math.round(T.hp * buff);
        this.maxHp = this.hp;
        this.onGround = false;
        this.facingRight = false;
        this.hitT = 0; this.kbT = 0;
        this.shootCd = 1.5 + Math.random() * 2;
        this.jumpCd = 0;
        this.burning = false;
    }
    
    hurt(dmg, fromX) {
        this.hp -= dmg;
        this.hitT = 0.25;
        this.kbT = 0.3;
        this.vx = (this.x < fromX ? 1 : -1) * 6;
        this.vy = -4;
    }
    
    update(dt, game) {
        const p = game.nearestTarget(this.x);   // 最近的活着的目标（双人时自动切换）
        const T = this.T;
        
        if (this.kbT > 0) {
            this.kbT -= dt;
            this.vx *= 0.9;
        } else if (p) {
            const dir = Math.sign(p.x - this.x) || 1;
            this.facingRight = dir > 0;
            const dist = Math.abs(p.x - this.x);
            
            if (T.ranged) {
                // 骷髅：保持中距离射箭
                if (dist > 7) this.vx = dir * T.speed;
                else if (dist < 4) this.vx = -dir * T.speed;
                else this.vx = 0;
                this.shootCd -= dt;
                if (this.shootCd <= 0 && dist < 13) {
                    this.shootCd = 2.2 + Math.random() * 0.8;
                    const ty = p.y - p.height * 0.5, fy = this.y - this.height * 0.7;
                    game.arrows.push(new Arrow(this.x, fy, dir * 9, (ty - fy) * 0.8 - 1.5, T.dmg));
                }
            } else {
                // 近战怪：直线追击，撞墙会跳
                this.vx = dir * T.speed;
                this.wantVx = this.vx;
                this.jumpCd -= dt;
                // 蜘蛛：靠近就扑跳
                if (T.leaper && this.onGround && dist < 5 && this.jumpCd <= 0) {
                    this.vy = -8.5;
                    this.vx = dir * T.speed * 2.2;
                    this.jumpCd = 1.4;
                }
                const ahead = Math.floor(this.x + dir * (this.width / 2 + 0.4));
                const footY = Math.floor(this.y - 0.5);
                if (this.onGround && this.jumpCd <= 0 &&
                    (game.world.isSolid(ahead, footY) || game.world.isSolid(ahead, footY - 1))) {
                    this.vy = -12.5;
                    this.jumpCd = 0.7;
                }
            }
        }
        
        // 物理
        this.vy += 35 * dt;
        this.vy = Math.min(this.vy, 25);
        this.x += this.vx * dt;
        this.collide(game.world, true);
        this.y += this.vy * dt;
        this.onGround = false;
        this.collide(game.world, false);
        
        if (this.hitT > 0) this.hitT -= dt;
        
        // 近战接触伤害
        if (!T.ranged && p && !p.dead &&
            Math.abs(p.x - this.x) < (p.width + this.width) / 2 + (T.big ? 0.3 : 0.1) &&
            Math.abs((p.y - p.height / 2) - (this.y - this.height / 2)) < (T.big ? 2.2 : 1.5)) {
            game.hurtPlayer(T.dmg, this.x, p);
        }
        
        // 白天日晒燃烧
        if (game.isDaytime() && game.skyExposed(this.x, this.y - this.height - 0.2)) {
            this.burning = true;
            this.hp -= dt * 9;
            if (Math.random() < dt * 18)
                game.spawnParticles(this.x, this.y - this.height * 0.7,
                    Math.random() < 0.5 ? '#ff9a3d' : '#ffd93d', 1);
        }
        
        // 大块头被卡住 1.2 秒就砸开面前的方块（防止永久卡死）
        if (T.big) {
            if (this.onGround && Math.abs(this.vx) < Math.abs(this.wantVx || 0) * 0.5) {
                this.stuckT = (this.stuckT || 0) + dt;
                if (this.stuckT > 1.2) { this.stuckT = 0; this.smashAhead(game); }
            } else this.stuckT = 0;
        }
        
        return this.hp > 0;
    }
    
    smashAhead(game) {
        const dir = (this.vx >= 0 || (this.wantVx || 0) >= 0) ? 1 : -1;
        const bx = Math.floor(this.x + dir * (this.width / 2 + 0.6));
        for (const by of [Math.floor(this.y - 0.5), Math.floor(this.y - 1.5), Math.floor(this.y - this.height + 0.5)]) {
            const b = BLOCKS[game.world.get(bx, by)];
            if (b && b.breakable && b.hardness <= 3) {
                game.spawnParticles(bx, by, b.color || '#888', 10);
                game.world.set(bx, by, 0);
                game.world.calculateLighting();
                return;
            }
        }
    }
    
    collide(world, horizontal) {
        const left = Math.floor(this.x - this.width / 2);
        const right = Math.floor(this.x + this.width / 2);
        const top = Math.floor(this.y - this.height);
        const bottom = Math.floor(this.y);
        for (let bx = left; bx <= right; bx++) {
            for (let by = top; by <= bottom; by++) {
                if (world.isSolid(bx, by)) {
                    if (horizontal) {
                        if (this.vx > 0) this.x = bx - this.width / 2 - 0.01;
                        else if (this.vx < 0) this.x = bx + 1 + this.width / 2 + 0.01;
                        this.vx = 0;
                    } else {
                        if (this.vy > 0) {
                            if (this.y - (by - 0.01) <= 1.05) {
                                this.y = by - 0.01;
                                this.onGround = true;
                            }
                        } else if (this.vy < 0) {
                            const ny = by + 1 + this.height + 0.01;
                            if (ny - this.y <= 1.05) this.y = ny;
                        }
                        this.vy = 0;
                    }
                    return;
                }
            }
        }
    }
    
    draw(ctx, camX, camY, scale) {
        if (this.kind === 'spider') { this.drawSpider(ctx, camX, camY, scale); return; }
        const w = this.width * scale, h = this.height * scale;
        const sx = (this.x - this.width / 2 - camX) * scale;
        const sy = (this.y - this.height - camY) * scale;
        const z = this.kind === 'zombie';
        const big = !!this.T.big;
        const flash = this.hitT > 0;
        const skin = flash ? '#ffffff' : (z ? '#7ec850' : (big ? '#8aa07a' : '#d8d8d8'));
        const shirt = flash ? '#ffffff' : (z ? '#3b7a44' : (big ? '#6a3a3a' : '#a8a8b0'));
        const pants = flash ? '#ffffff' : (z ? '#2c5e34' : (big ? '#4a2a2a' : '#8a8a92'));
        
        // 腿
        ctx.fillStyle = pants;
        ctx.fillRect(sx + w * 0.2, sy + h * 0.75, w * 0.25, h * 0.25);
        ctx.fillRect(sx + w * 0.55, sy + h * 0.75, w * 0.25, h * 0.25);
        // 身体
        ctx.fillStyle = shirt;
        ctx.fillRect(sx + w * 0.15, sy + h * 0.25, w * 0.7, h * 0.5);
        // 手臂
        ctx.fillStyle = skin;
        const armY = sy + h * 0.3;
        if (z) {
            // 僵尸双手前伸
            if (this.facingRight) ctx.fillRect(sx + w * 0.5, armY, w * 0.7, h * 0.12);
            else ctx.fillRect(sx - w * 0.2, armY, w * 0.7, h * 0.12);
        } else {
            if (this.facingRight) ctx.fillRect(sx + w * 0.85, armY, w * 0.2, h * 0.3);
            else ctx.fillRect(sx - w * 0.05, armY, w * 0.2, h * 0.3);
        }
        // 头
        ctx.fillStyle = skin;
        ctx.fillRect(sx + w * 0.2, sy, w * 0.6, h * 0.3);
        // 眼睛
        ctx.fillStyle = z ? '#c0392b' : (big ? '#ff4040' : '#333333');
        const ex = this.facingRight ? sx + w * 0.55 : sx + w * 0.33;
        ctx.fillRect(ex, sy + h * 0.1, w * 0.12, h * 0.08);
        // 蛮兵的角
        if (big) {
            ctx.fillStyle = '#d8d0c0';
            ctx.fillRect(sx + w * 0.1, sy - h * 0.06, w * 0.14, h * 0.09);
            ctx.fillRect(sx + w * 0.76, sy - h * 0.06, w * 0.14, h * 0.09);
        }
        
        // 血条
        if (this.hp < this.maxHp) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(sx, sy - 10, w, 5);
            ctx.fillStyle = '#ff5d6c';
            ctx.fillRect(sx, sy - 10, w * Math.max(0, this.hp / this.maxHp), 5);
        }
        // 燃烧火焰
        if (this.burning) {
            ctx.fillStyle = Math.random() < 0.5 ? '#ff9a3d' : '#ffd93d';
            for (let i = 0; i < 3; i++)
                ctx.fillRect(sx + w * (0.15 + Math.random() * 0.7), sy - 6 - Math.random() * 10, 4, 8);
        }
    }
    
    drawSpider(ctx, camX, camY, s) {
        const w = this.width * s, h = this.height * s;
        const sx = (this.x - this.width / 2 - camX) * s;
        const sy = (this.y - this.height - camY) * s;
        const flash = this.hitT > 0;
        // 八条腿（左右各三条 + 一对前腿）
        ctx.strokeStyle = flash ? '#ffffff' : '#1a1420';
        ctx.lineWidth = Math.max(2, s * 0.07);
        for (let i = 0; i < 3; i++) {
            const ly = sy + h * (0.35 + i * 0.22);
            ctx.beginPath();
            ctx.moveTo(sx + w * 0.45, ly);
            ctx.lineTo(sx - w * 0.3, ly - h * 0.3);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx + w * 0.55, ly);
            ctx.lineTo(sx + w * 1.3, ly - h * 0.3);
            ctx.stroke();
        }
        // 圆身体
        ctx.fillStyle = flash ? '#ffffff' : '#3a2a4a';
        ctx.beginPath();
        ctx.arc(sx + w * 0.5, sy + h * 0.6, w * 0.42, 0, Math.PI * 2);
        ctx.fill();
        // 头 + 红眼
        const hx = this.facingRight ? sx + w * 0.88 : sx + w * 0.12;
        ctx.fillStyle = flash ? '#ffffff' : '#2a1a3a';
        ctx.beginPath(); ctx.arc(hx, sy + h * 0.5, w * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = flash ? '#666666' : '#ff4040';
        ctx.fillRect(hx - w * 0.09, sy + h * 0.42, w * 0.06, h * 0.08);
        ctx.fillRect(hx + w * 0.03, sy + h * 0.42, w * 0.06, h * 0.08);
        // 血条
        if (this.hp < this.maxHp) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(sx, sy - 10, w, 5);
            ctx.fillStyle = '#ff5d6c';
            ctx.fillRect(sx, sy - 10, w * Math.max(0, this.hp / this.maxHp), 5);
        }
        // 燃烧火焰
        if (this.burning) {
            ctx.fillStyle = Math.random() < 0.5 ? '#ff9a3d' : '#ffd93d';
            for (let i = 0; i < 3; i++)
                ctx.fillRect(sx + w * (0.15 + Math.random() * 0.7), sy - 6 - Math.random() * 10, 4, 8);
        }
    }
}

class Arrow {
    constructor(x, y, vx, vy, dmg) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.dmg = dmg || 3;
        this.life = 4;
        this.dead = false;
    }
    update(dt, game) {
        this.vy += 14 * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0 || game.world.isSolid(Math.floor(this.x), Math.floor(this.y))) {
            this.dead = true;
            return;
        }
        for (const pl of [game.player, game.player2]) {
            if (pl && !pl.dead && Math.hypot(pl.x - this.x, (pl.y - pl.height / 2) - this.y) < 0.6) {
                game.hurtPlayer(this.dmg, this.x, pl);
                this.dead = true;
                break;
            }
        }
    }
    draw(ctx, camX, camY, s) {
        const x = (this.x - camX) * s, y = (this.y - camY) * s;
        const m = Math.hypot(this.vx, this.vy) || 1;
        ctx.strokeStyle = '#e8dcb8';
        ctx.lineWidth = Math.max(2, s * 0.08);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - this.vx / m * s * 0.5, y - this.vy / m * s * 0.5);
        ctx.stroke();
    }
}

// ===== 玩家子弹（枪械） =====
class Bullet {
    constructor(x, y, vx, vy, dmg) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.dmg = dmg || 9;
        this.life = 1.5;
        this.dead = false;
    }
    update(dt, game) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) { this.dead = true; return; }
        if (game.world.isSolid(Math.floor(this.x), Math.floor(this.y))) {
            this.dead = true;
            game.spawnParticles(this.x, this.y, '#ffd93d', 3);
            return;
        }
        for (const mob of game.mobs) {
            if (this.x > mob.x - mob.width / 2 - 0.15 && this.x < mob.x + mob.width / 2 + 0.15 &&
                this.y > mob.y - mob.height - 0.15 && this.y < mob.y + 0.15) {
                mob.hurt(this.dmg, this.x - Math.sign(this.vx) * 0.5);
                game.spawnParticles(this.x, this.y, '#c0392b', 4);
                this.dead = true;
                return;
            }
        }
    }
    draw(ctx, camX, camY, s) {
        const x = (this.x - camX) * s, y = (this.y - camY) * s;
        const m = Math.hypot(this.vx, this.vy) || 1;
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = Math.max(2, s * 0.09);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - this.vx / m * s * 0.45, y - this.vy / m * s * 0.45);
        ctx.stroke();
        ctx.fillStyle = '#fff8d0';
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
}

// ===== 游戏主类 =====
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        
        this.world = new World(512, 256, Date.now());
        this.player = new Player(256, 50);
        this.camera = { x: 0, y: 0 };
        this.scale = 32; // 像素/方块
        this.curScale = this.scale;
        
        this.keys = {};
        this.mouse = { x: 0, y: 0, down: false, rightDown: false };
        this.selectedSlot = 0;
        this.particles = [];
        
        // 视角系统：侧面 / 第一人称（看到手） / 俯视（从上看人） / 仰视（从底下看）
        this.view = 'side';
        this.viewOrder = ['side', 'fp', 'top', 'under'];
        this.fpScale = 64;
        this.topScale = 34;
        
        // 夜晚怪物
        this.mobs = [];
        this.arrows = [];
        this.bullets = [];
        this.player2 = null;
        this.spawnTimer = 3;
        this.dayCount = 0;
        this.nightBanner = 0;
        this.spawnPoint = { x: 256.5, y: 50 };
        this.mineTick = 0;
        this.shootCd = 0;
        // 背包（挖矿入包、放置消耗 —— wildcraft 生存玩法）
        this.inv = {};
        [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(id => this.inv[id] = 15);
        this.craftOpen = false;
        this.toast = { text: '', t: 0 };
        // voxelcraft 融合：物品栏翻页 / 种子 / 菜单
        this.hotbarPage = 0;
        this.seedInput = (Date.now() % 100000000) | 0;
        this.menuOpen = true;
        this.stars = [];
        for (let i = 0; i < 220; i++) {
            this.stars.push({ x: Math.random(), y: Math.random() * 0.55, m: 0.4 + Math.random() * 1.6 });
        }
        
        this.dayTime = 0; // 0-1, 0=日出, 0.5=正午, 1=日出
        this.dayDuration = 300; // 秒
        
        this.breaking = { x: -1, y: -1, progress: 0, maxProgress: 0 };
        
        this.fps = 0;
        this.frameCount = 0;
        this.lastFpsTime = 0;
        
        this.setupEvents();
        this.load();
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
    }
    
    setupEvents() {
        window.addEventListener('resize', () => this.resize());
        
        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;
            if (e.code >= 'Digit1' && e.code <= 'Digit9') {
                this.selectedSlot = parseInt(e.code.slice(-1)) - 1;
                this.updateHotbarUI();
            }
            if (e.code === 'Digit0') { this.selectedSlot = 9; this.updateHotbarUI(); }
            if (e.code === 'KeyV') this.cycleView();
            if (e.code === 'KeyP') this.toggleP2();
            if (e.code === 'KeyE') { this.craftOpen = !this.craftOpen; this.updateCraftUI(); }
            if (e.code === 'KeyQ') { this.hotbarPage = (this.hotbarPage + 1) % HOTBAR_PAGES.length; this.selectedSlot = 0; this.updateHotbarUI(); }
            if (e.code === 'KeyR') {
                if (this.player && this.player.dead) this.respawn();
                else if (!this.menuOpen && this.player && !this.player.dead) {
                    // voxelcraft：R 回出生点
                    this.player.x = this.spawnPoint.x; this.player.y = this.spawnPoint.y;
                    this.player.vx = 0; this.player.vy = 0;
                    if (this.player2) {
                        this.player2.x = this.spawnPoint.x - 2; this.player2.y = this.spawnPoint.y;
                        this.player2.vx = 0; this.player2.vy = 0;
                    }
                    this.toastMsg('回到出生点');
                }
            }
        });
        window.addEventListener('keyup', e => this.keys[e.code] = false);
        
        this.canvas.addEventListener('mousedown', e => {
            if (e.button === 0) {
                this.mouse.down = true;
                this.handleBreak();
            }
            if (e.button === 2) {
                this.mouse.rightDown = true;
                this.handlePlace();
            }
        });
        window.addEventListener('mouseup', e => {
            if (e.button === 0) this.mouse.down = false;
            if (e.button === 2) this.mouse.rightDown = false;
        });
        window.addEventListener('contextmenu', e => e.preventDefault());
        
        this.canvas.addEventListener('mousemove', e => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });
        
        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            if (e.deltaY > 0) this.selectedSlot = (this.selectedSlot + 1) % 10;
            else this.selectedSlot = (this.selectedSlot - 1 + 10) % 10;
            this.updateHotbarUI();
        });
        
        // 点击物品栏
        document.querySelectorAll('.slot').forEach(slot => {
            slot.addEventListener('click', () => {
                this.selectedSlot = parseInt(slot.dataset.slot);
                this.updateHotbarUI();
            });
        });
    }
    
    updateHotbarUI() {
        const page = HOTBAR_PAGES[this.hotbarPage];
        document.querySelectorAll('.slot').forEach((slot, i) => {
            slot.classList.toggle('active', i === this.selectedSlot);
            const id = page[i];
            const cnt = (slot.querySelector && slot.querySelector('.cnt')) || null;
            if (cnt) cnt.textContent = id === GUN ? '∞' : String(this.inv[id] || 0);
            const ico = slot.querySelector ? slot.querySelector('.block-icon') : null;
            if (ico && ICON_CLASS[id] !== undefined) ico.className = 'block-icon ' + ICON_CLASS[id];
            if (slot.title !== undefined) slot.title = id === GUN ? '枪' : (BLOCKS[id] ? BLOCKS[id].name : '');
        });
        this.updateCraftUI();
    }
    
    // ===== 枪械：方向与移动完全独立（移动靠键盘、枪口只跟随准星） =====
    gunSelected() { return HOTBAR_PAGES[this.hotbarPage][this.selectedSlot] === GUN; }
    
    shootFrom(pl, dx, dy) {
        if (this.shootCd > 0 || pl.dead) return;
        const len = Math.hypot(dx, dy) || 1;
        const ex = pl.x + dx / len * 0.6;
        const ey = pl.y - pl.height * 0.75 + dy / len * 0.6;
        this.bullets.push(new Bullet(ex, ey, dx / len * 26, dy / len * 26, 9));
        this.shootCd = 0.22;
        this.spawnParticles(ex + dx / len * 0.4, ey + dy / len * 0.4, '#ffd93d', 2);
    }
    
    // ===== 双人（wildcraft 融合）：P 加入二号玩家 =====
    toggleP2() {
        if (this.player2) { this.player2 = null; this.toastMsg('二号玩家已退出'); return; }
        // 找出生点附近一处平坦空地（避免嵌进树/山体）
        const base = Math.floor(this.spawnPoint.x);
        let bx = base + 2, sy = -1;
        for (let off = 2; off <= 14 && sy < 0; off++) {
            for (const c of [off, -off]) {
                const cx = base + c;
                if (cx < 3 || cx > this.world.width - 5) continue;
                const s1 = this.surfaceYAt(cx);
                if (s1 < 0) continue;
                const s2 = this.surfaceYAt(cx + 1);
                if (s2 < 0 || Math.abs(s2 - s1) > 1) continue;
                bx = cx; sy = s1;
                break;
            }
        }
        this.player2 = new Player(bx + 0.5, sy > 0 ? sy : this.spawnPoint.y, 1);
        this.player2.invuln = 2;
        this.toastMsg('二号玩家加入！方向键移动 · J 挖矿/攻击 · K 射击');
        this.updateHotbarUI();
    }
    
    // P2：J = 近战打怪 / 挖面前方块
    p2Dig(dt) {
        const p2 = this.player2;
        if (p2.digCd > 0) { p2.digCd -= dt; return; }
        const dir = p2.facingRight ? 1 : -1;
        // 先打怪
        for (const mob of this.mobs) {
            if (Math.abs(mob.x - p2.x) < 2.2 && Math.sign(mob.x - p2.x) === dir &&
                Math.abs((mob.y - mob.height / 2) - (p2.y - p2.height / 2)) < 1.6) {
                this.hitMob(mob);
                p2.digCd = 0.35;
                return;
            }
        }
        // 再挖面前的方块
        const bx = Math.floor(p2.x + dir * 1.2);
        for (const by of [Math.floor(p2.y - 0.5), Math.floor(p2.y - 1.3), Math.floor(p2.y - p2.height + 0.4)]) {
            const b = BLOCKS[this.world.get(bx, by)];
            if (b && b.breakable) {
                this.spawnParticles(bx, by, b.color || '#888', 6);
                this.world.set(bx, by, 0);
                this.checkGravityAbove(bx, by);
                this.world.calculateLighting();
                this.inv[b.id] = (this.inv[b.id] || 0) + 1;
                p2.digCd = Math.max(0.25, b.hardness * 0.18);
                this.updateHotbarUI();
                return;
            }
        }
        p2.digCd = 0.15;   // 空挥冷却
    }
    
    // 最近的目标（双人时怪自动打更近的那个）
    nearestTarget(x) {
        let best = null, bd = 1e9;
        for (const pl of [this.player, this.player2]) {
            if (!pl || pl.dead) continue;
            const d = Math.abs(pl.x - x);
            if (d < bd) { bd = d; best = pl; }
        }
        return best;
    }
    
    // ===== 合成台（E 打开） =====
    craft(i) {
        const r = RECIPES[i];
        if (!r) return false;
        for (const k in r.cost) {
            if ((this.inv[k] || 0) < r.cost[k]) { this.toastMsg('材料不足'); return false; }
        }
        for (const k in r.cost) this.inv[k] -= r.cost[k];
        if (r.out) this.inv[r.out] = (this.inv[r.out] || 0) + r.n;
        if (r.heal) {
            for (const pl of [this.player, this.player2]) {
                if (pl && !pl.dead && pl.hp < pl.maxHp) pl.hp = Math.min(pl.maxHp, pl.hp + r.heal);
            }
        }
        this.toastMsg('合成成功：' + r.name);
        this.updateHotbarUI();
        return true;
    }
    
    buildCraftUI() {
        const list = document.getElementById('craft-list');
        if (!list || !document.createElement) return;
        if (list.children && list.children.length) return;
        RECIPES.forEach((r, i) => {
            const row = document.createElement('div');
            row.className = 'recipe';
            const info = document.createElement('div');
            info.className = 'recipe-info';
            const nm = document.createElement('b');
            nm.textContent = r.name;
            const cost = document.createElement('span');
            cost.className = 'recipe-cost';
            cost.id = 'recipe-cost-' + i;
            info.appendChild(nm);
            info.appendChild(cost);
            const btn = document.createElement('button');
            btn.textContent = '合成';
            btn.id = 'recipe-btn-' + i;
            btn.addEventListener('click', () => this.craft(i));
            row.appendChild(info);
            row.appendChild(btn);
            list.appendChild(row);
        });
    }
    
    updateCraftUI() {
        const panel = document.getElementById('craft-panel');
        if (panel && panel.classList) panel.classList.toggle('hidden', !this.craftOpen);
        if (!document.createElement) return;
        RECIPES.forEach((r, i) => {
            const costEl = document.getElementById('recipe-cost-' + i);
            const btn = document.getElementById('recipe-btn-' + i);
            if (!costEl || !btn) return;
            const parts = Object.keys(r.cost).map(k => `${BLOCKS[k] ? BLOCKS[k].name : '?'}×${r.cost[k]}`);
            costEl.textContent = '需要 ' + parts.join(' + ');
            let ok = true;
            for (const k in r.cost) if ((this.inv[k] || 0) < r.cost[k]) ok = false;
            btn.disabled = !ok;
        });
    }
    
    toastMsg(text, t = 2.2) { this.toast = { text, t }; }
    
    getMouseBlock() {
        const m = this.mouseWorld();
        return { x: Math.floor(m.x), y: Math.floor(m.y) };
    }
    
    // 当前视角下的缩放（第一人称/俯视有自己的缩放）
    viewScale() {
        return this.view === 'fp' ? this.fpScale : (this.view === 'top' ? this.topScale : this.curScale);
    }
    
    // 鼠标在世界上对应的坐标（各视角通用，仰视做了上下翻转）
    mouseWorld() {
        const s = this.viewScale();
        let wx = this.camera.x + this.mouse.x / s;
        let wy = this.camera.y + this.mouse.y / s;
        if (this.view === 'under') wy = this.camera.y + (this.height - this.mouse.y) / s;
        return { x: wx, y: wy };
    }
    
    // 射线随准：从眼睛连到鼠标点，命中第一块实心方块；穿不过墙
    getAim() {
        const p = this.player;
        const m = this.mouseWorld();
        
        if (this.view === 'top') {
            const bx = Math.floor(m.x), by = Math.floor(m.y);
            const d = Math.hypot(bx + 0.5 - p.x, by + 0.5 - (p.y - p.height / 2));
            return { x: bx, y: by, ok: d <= 8 };
        }
        
        const eye = { x: p.x, y: p.y - p.height * 0.8 };
        const dx = m.x - eye.x, dy = m.y - eye.y;
        const len = Math.hypot(dx, dy) || 0.001;
        const REACH = 6.5;
        const tMax = Math.min(len, REACH);
        const steps = Math.max(1, Math.ceil(tMax / 0.08));
        for (let i = 1; i <= steps; i++) {
            const t = tMax * (i / steps);
            const bx = Math.floor(eye.x + dx / len * t);
            const by = Math.floor(eye.y + dy / len * t);
            if (bx === Math.floor(eye.x) && by === Math.floor(eye.y)) continue;
            if (this.world.isSolid(bx, by)) {
                return { x: bx, y: by, ok: t <= REACH };
            }
        }
        return null;
    }
    
    // 左键：枪槽=射击；否则优先打怪，再挖矿
    handleBreak() {
        const p = this.player;
        if (p.dead) { this.respawn(); return; }
        
        if (this.gunSelected()) {
            const m0 = this.mouseWorld();
            this.shootFrom(p, m0.x - p.x, m0.y - (p.y - p.height * 0.75));
            return;
        }
        
        const m = this.mouseWorld();
        for (const mob of this.mobs) {
            const cx = mob.x, cy = mob.y - mob.height / 2;
            const dPlayer = Math.hypot(cx - p.x, cy - (p.y - p.height / 2));
            if (dPlayer <= 6 && Math.hypot(m.x - cx, m.y - cy) < 0.9) {
                this.hitMob(mob);
                return;
            }
        }
        
        const aim = this.getAim();
        if (aim && aim.ok) this.startBreakAt(aim);
    }
    
    startBreakAt(aim) {
        const block = BLOCKS[this.world.get(aim.x, aim.y)];
        if (!block || !block.breakable) {
            this.breaking = { x: -1, y: -1, progress: 0, maxProgress: 0 };
            return;
        }
        this.breaking = { x: aim.x, y: aim.y, progress: 0, maxProgress: Math.max(0.15, block.hardness * 0.3) };
    }
    
    hitMob(mob) {
        mob.hurt(7, this.player.x);
        this.spawnParticles(mob.x, mob.y - mob.height * 0.6, '#c0392b', 6);
    }
    
    handlePlace() {
        if (this.player.dead) return;
        const m = this.mouseWorld();
        const x = Math.floor(m.x), y = Math.floor(m.y);
        const blockId = HOTBAR_PAGES[this.hotbarPage][this.selectedSlot];
        if (!blockId || blockId === GUN) return;
        
        const p = this.player;
        const pcx = p.x, pcy = p.y - p.height / 2;
        // 距离限制
        if (Math.hypot(x + 0.5 - pcx, y + 0.5 - pcy) > 8) return;
        // 检查是否碰到玩家
        if (Math.abs(x + 0.5 - pcx) < 1 && Math.abs(y + 0.5 - pcy) < 1.5) return;
        
        if (this.world.get(x, y) === 0) {
            if ((this.inv[blockId] || 0) <= 0) {
                this.toastMsg(BLOCKS[blockId].name + '不够了，先去挖矿！');
                return;
            }
            this.inv[blockId]--;
            this.updateHotbarUI();
            this.world.set(x, y, blockId);
            if (BLOCKS[blockId].gravity) {
                this.updateSand(x, y);
            }
            this.world.calculateLighting();
        }
    }
    
    updateSand(x, y) {
        // 简单沙子物理：下落
        let cy = y;
        while (cy < this.world.height - 1 && this.world.get(x, cy + 1) === 0) {
            this.world.set(x, cy, 0);
            this.world.set(x, cy + 1, 6);
            cy++;
        }
    }
    
    spawnParticles(x, y, color, count = 8) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(
                x + 0.5, y + 0.5, color,
                (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8 - 3,
                0.3 + Math.random() * 0.4
            ));
        }
    }
    
    load() {
        const progressBar = document.getElementById('loading-progress');
        const loadingText = document.getElementById('loading-text');
        this.buildCraftUI();
        this.world = new World(512, 256, this.seedInput);
        
        // 开始菜单接线（voxelcraft：种子 + 换个世界 + 选视角进入）
        const seedEl = document.getElementById('seed-input');
        if (seedEl && 'value' in seedEl) seedEl.value = String(this.seedInput);
        const btnStart = document.getElementById('btn-start');
        if (btnStart && btnStart.addEventListener) btnStart.addEventListener('click', () => this.startMenu('side'));
        const btnNew = document.getElementById('btn-newworld');
        if (btnNew && btnNew.addEventListener) btnNew.addEventListener('click', () => {
            const el = document.getElementById('seed-input');
            this.newWorld(el && el.value);
        });
        if (document.querySelectorAll) {
            document.querySelectorAll('[data-view]').forEach(b => {
                if (b.addEventListener) b.addEventListener('click', () => this.startMenu(b.dataset.view));
            });
        }
        
        setTimeout(() => {
            this.world.generate(p => {
                progressBar.style.width = (p * 100) + '%';
            });
            progressBar.style.width = '100%';
            loadingText.textContent = '准备就绪！';
            
            // 把出生点放在平坦地表，避免嵌进山体
            const sp = this.findSafeSpawn();
            this.spawnPoint = sp;
            this.player.x = sp.x;
            this.player.y = sp.y;
            // 相机直接对准出生点（避免开局从 (0,0) 飞过来）
            this.camera.x = sp.x - this.width / this.scale / 2;
            this.camera.y = sp.y - this.height / this.scale / 2 - 2;
            
            setTimeout(() => {
                const ls = document.getElementById('loading-screen');
                // 截图/快捷入口：带 hash 时跳过淡出动画（虚拟时间下过渡会定格）
                if (typeof location !== 'undefined' && location.hash && ls) ls.style.transition = 'none';
                ls.classList.add('hidden');
                document.getElementById('hud').style.display = 'block';
                this.start();
            }, 500);
        }, 100);
    }
    
    start() {
        // URL hash 快捷入口（截图与快速验证）：#shot / #menu / #fp / #top / #under / #day / #2p 可组合
        if (typeof location !== 'undefined') {
            const h = location.hash.slice(1);
            if (h) {
                const toks = h.split('-');
                if (toks.includes('menu')) {
                    this.menuOpen = true;
                    const m = document.getElementById('menu');
                    if (m && m.classList) m.classList.remove('hidden');
                } else {
                    this.menuOpen = false;
                    const m = document.getElementById('menu');
                    if (m && m.classList) m.classList.add('hidden');
                }
                if (['fp', 'top', 'under'].includes(toks[0])) this.view = toks[0];
                if (toks.includes('day')) this.dayTime = 0.5;
                if (toks.includes('2p') && !this.player2) this.toggleP2();
            }
        }
        this.lastTime = performance.now();
        requestAnimationFrame(t => this.loop(t));
    }
    
    // ===== 开始菜单：选视角进入 =====
    startMenu(view) {
        this.view = view || 'side';
        this.menuOpen = false;
        const el = document.getElementById('menu');
        if (el && el.classList) el.classList.add('hidden');
        this.toastMsg('视角：' + ({ side: '侧面', fp: '第一人称', top: '俯视', under: '仰视' }[this.view] || '侧面') + '（V 键随时切换）');
    }
    
    // ===== voxelcraft：换种子重开一个世界 =====
    newWorld(seedStr) {
        const s = parseInt(seedStr, 10);
        this.seedInput = Number.isFinite(s) && String(seedStr).trim() !== '' ? s : (Math.random() * 1e9) | 0;
        this.world = new World(512, 256, this.seedInput);
        this.world.generate();
        const sp = this.findSafeSpawn();
        this.spawnPoint = sp;
        for (const pl of [this.player, this.player2]) {
            if (!pl) continue;
            pl.x = sp.x + (pl.idx ? -2 : 0); pl.y = sp.y;
            pl.vx = 0; pl.vy = 0; pl.dead = false; pl.hp = pl.maxHp; pl.invuln = 2;
        }
        this.mobs.length = 0; this.arrows.length = 0; this.bullets.length = 0;
        this.breaking = { x: -1, y: -1, progress: 0, maxProgress: 0 };
        this.curScale = this.scale;
        this.camera.x = sp.x - this.width / this.scale / 2;
        this.camera.y = sp.y - this.height / this.scale / 2 - 2;
        this.toastMsg('新世界已生成，种子 ' + this.seedInput);
    }
    
    loop(time) {
        const dt = Math.min((time - this.lastTime) / 1000, 0.05);
        this.lastTime = time;
        
        this.update(dt);
        this.render();
        
        // FPS
        this.frameCount++;
        if (time - this.lastFpsTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsTime = time;
            document.getElementById('fps').textContent = this.fps;
        }
        
        requestAnimationFrame(t => this.loop(t));
    }
    
    update(dt) {
        const p = this.player;
        
        // 开始菜单打开时世界暂停（voxelcraft 的 veil 逻辑）
        if (this.menuOpen) return;
        
        // 玩家 1：WASD + 鼠标（移动方向和枪口方向完全独立）
        if (!p.dead) p.update(dt, this.world, {
            left: this.keys['KeyA'],
            right: this.keys['KeyD'],
            jump: this.keys['Space'] || this.keys['KeyW'],
            sprint: this.keys['ShiftLeft'],
        });
        
        // 玩家 2：方向键 + J/K
        const p2 = this.player2;
        if (p2 && !p2.dead) {
            p2.update(dt, this.world, {
                left: this.keys['ArrowLeft'],
                right: this.keys['ArrowRight'],
                jump: this.keys['ArrowUp'],
                sprint: this.keys['ShiftRight'],
            });
            // K 射击：朝面朝方向，按住上/下键斜射
            if (this.keys['KeyK']) {
                let dy = 0;
                if (this.keys['ArrowUp']) dy = -0.55;
                else if (this.keys['ArrowDown']) dy = 0.55;
                this.shootFrom(p2, p2.facingRight ? 1 : -1, dy);
            }
            if (this.keys['KeyJ']) this.p2Dig(dt);
        }
        
        // 摄像机（按视角分支）
        this.updateCamera(dt);
        
        // 时间
        const prevDay = this.isDaytime();
        this.dayTime += dt / this.dayDuration;
        if (this.dayTime >= 1) { this.dayTime -= 1; this.dayCount++; }
        const nowDay = this.isDaytime();
        if (prevDay && !nowDay) this.nightBanner = 3.5;
        if (this.nightBanner > 0) this.nightBanner -= dt;
        
        // 夜晚刷怪（波数越多，数量越多、越强）
        if (!p.dead && !nowDay) {
            this.spawnTimer -= dt;
            const cap = Math.min(4 + this.dayCount * 2, 12);
            if (this.spawnTimer <= 0 && this.mobs.length < cap) {
                this.spawnTimer = Math.max(1.8, 5 - this.dayCount * 0.4);
                this.spawnNightMob();
            }
        }
        
        // 怪物 / 箭 / 子弹
        this.mobs = this.mobs.filter(m => m.update(dt, this) &&
            Math.min(Math.abs(m.x - p.x), p2 ? Math.abs(m.x - p2.x) : 1e9) < 90);
        this.arrows = this.arrows.filter(a => { a.update(dt, this); return !a.dead; });
        this.bullets = this.bullets.filter(b => { b.update(dt, this); return !b.dead; });
        if (this.shootCd > 0) this.shootCd -= dt;
        if (this.toast.t > 0) this.toast.t -= dt;
        
        // 射击（枪槽选中时左键连发，方向只跟随鼠标准星，与移动无关）
        if (this.mouse.down && !p.dead && this.gunSelected()) {
            const m = this.mouseWorld();
            this.shootFrom(p, m.x - p.x, m.y - (p.y - p.height * 0.75));
            this.breaking = { x: -1, y: -1, progress: 0, maxProgress: 0 };
        }
        // 挖掘（连续挖，射线随准）
        else if (this.mouse.down && !p.dead) {
            const aim = this.getAim();
            const same = aim && aim.x === this.breaking.x && aim.y === this.breaking.y;
            if (!aim || !aim.ok) {
                this.breaking = { x: -1, y: -1, progress: 0, maxProgress: 0 };
            } else if (same && this.breaking.x >= 0) {
                this.breaking.progress += dt;
                this.mineTick -= dt;
                if (this.mineTick <= 0) {
                    this.mineTick = 0.12;
                    const b = BLOCKS[this.world.get(aim.x, aim.y)];
                    this.spawnParticles(aim.x, aim.y, (b && b.color) || '#888', 2);
                }
                if (this.breaking.progress >= this.breaking.maxProgress) {
                    const oldBlock = BLOCKS[this.world.get(aim.x, aim.y)];
                    if (oldBlock && oldBlock.breakable) {
                        this.spawnParticles(aim.x, aim.y, oldBlock.color || '#888', 10);
                        this.world.set(aim.x, aim.y, 0);
                        this.checkGravityAbove(aim.x, aim.y);
                        this.world.calculateLighting();
                        this.inv[oldBlock.id] = (this.inv[oldBlock.id] || 0) + 1;   // 挖到入背包
                        this.updateHotbarUI();
                    }
                    this.startBreakAt(aim);   // 直接连着挖下一块
                }
            } else {
                this.startBreakAt(aim);
            }
        } else {
            this.breaking = { x: -1, y: -1, progress: 0, maxProgress: 0 };
        }
        
        // 粒子
        this.particles = this.particles.filter(pp => pp.update(dt));
        
        // 更新UI
        document.getElementById('coords').textContent = 
            `${Math.floor(p.x)}, ${Math.floor(p.y)}`;
        document.getElementById('time').textContent = nowDay ? '白天' : '夜晚';
    }
    
    isDaytime() {
        const h = this.dayTime * 24;
        return h >= 6 && h < 18;
    }
    
    skyExposed(x, y) {
        const bx = clamp(Math.floor(x), 0, this.world.width - 1);
        const by = clamp(Math.floor(y), 0, this.world.height - 1);
        return this.world.light[this.world.idx(bx, by)] >= 14;
    }
    
    surfaceYAt(x) {
        for (let y = 4; y < this.world.height - 3; y++) {
            if (this.world.isSolid(x, y) && !this.world.isSolid(x, y - 1) && !this.world.isSolid(x, y - 2)) return y;
        }
        return -1;
    }
    
    // 找一处平坦的地表当出生点（左右两列高差 ≤1，保证不嵌进山体）
    findSafeSpawn() {
        for (let r = 0; r < 80; r++) {
            for (const x of [256 + r, 256 - r]) {
                if (x < 5 || x > this.world.width - 6) continue;
                const sy = this.surfaceYAt(x);
                if (sy < 5) continue;
                const s1 = this.surfaceYAt(x - 1), s2 = this.surfaceYAt(x + 1);
                if (s1 < 0 || s2 < 0) continue;
                if (Math.abs(s1 - sy) > 1 || Math.abs(s2 - sy) > 1) continue;
                return { x: x + 0.5, y: sy };
            }
        }
        return { x: 256.5, y: this.surfaceYAt(256) > 0 ? this.surfaceYAt(256) : 50 };
    }
    
    spawnNightMob() {
        // 随机落点必须重试多次，且要求落点两列平坦（不嵌进山体）
        for (let i = 0; i < 24; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const sx = Math.floor(this.player.x + side * (14 + Math.random() * 22));
            if (sx < 3 || sx > this.world.width - 5) continue;
            const sy = this.surfaceYAt(sx);
            if (sy < 0) continue;
            const sy2 = this.surfaceYAt(sx + 1);
            if (sy2 < 0 || Math.abs(sy2 - sy) > 1) continue;
            const pool = ['zombie', 'spider'];
            if (this.dayCount >= 1) pool.push('skeleton');
            if (this.dayCount >= 2) pool.push('brute');
            const kind = pool[Math.floor(Math.random() * pool.length)];
            this.mobs.push(new Mob(kind, sx + 0.5, sy, 1 + this.dayCount * 0.12));
            return;
        }
    }
    
    hurtPlayer(dmg, fromX, pl) {
        const p = pl || this.player;
        if (p.dead || p.invuln > 0) return;
        p.hp -= dmg;
        p.invuln = 1.0;
        p.hurtT = 0.5;
        p.kbT = 0.35;
        p.vy = -7;
        p.vx = (p.x < fromX ? -1 : 1) * 9;
        this.spawnParticles(p.x, p.y - p.height / 2, '#c0392b', 8);
        if (p.hp <= 0) { p.hp = 0; p.dead = true; }
    }
    
    respawn() {
        const p = this.player;
        p.dead = false;
        p.hp = p.maxHp;
        p.invuln = 2.5;
        p.kbT = 0;
        p.x = this.spawnPoint.x;
        p.y = this.spawnPoint.y;
        p.vx = 0; p.vy = 0;
        if (this.player2) {
            const q = this.player2;
            q.dead = false; q.hp = q.maxHp; q.invuln = 2.5; q.kbT = 0;
            q.x = clamp(this.spawnPoint.x - 2, 3, this.world.width - 4);
            q.y = this.spawnPoint.y;
            q.vx = 0; q.vy = 0;
        }
        this.mobs = this.mobs.filter(m => Math.abs(m.x - p.x) > 24);
        this.arrows.length = 0;
    }
    
    cycleView() {
        const i = this.viewOrder.indexOf(this.view);
        this.view = this.viewOrder[(i + 1) % this.viewOrder.length];
    }
    
    updateCamera(dt) {
        const p = this.player;
        const p2 = (this.player2 && !this.player2.dead) ? this.player2 : null;
        if (this.view === 'fp') {
            const s = this.fpScale;
            const eyeY = p.y - p.height * 0.8;
            const tx = p.x + (p.facingRight ? 1.2 : -1.2) - this.width / s * 0.35;
            const ty = eyeY - this.height / s * 0.5;
            this.camera.x += (tx - this.camera.x) * 10 * dt;
            this.camera.y += (ty - this.camera.y) * 10 * dt;
        } else if (this.view === 'top') {
            const s = this.topScale;
            const fx = p2 ? (p.x + p2.x) / 2 : p.x;
            const fy = p2 ? ((p.y - p.height / 2) + (p2.y - p2.height / 2)) / 2 : p.y - p.height / 2;
            const tx = fx - this.width / s / 2;
            const ty = fy - this.height / s / 2;
            this.camera.x += (tx - this.camera.x) * 6 * dt;
            this.camera.y += (ty - this.camera.y) * 6 * dt;
        } else {
            // 侧面：双人时看两人中点，离得越远镜头拉得越远
            let target = this.scale;
            let fx = p.x, fy = p.y - p.height / 2;
            if (p2) {
                fx = (p.x + p2.x) / 2;
                fy = ((p.y - p.height / 2) + (p2.y - p2.height / 2)) / 2;
                const span = Math.abs(p.x - p2.x) + Math.abs(p.y - p2.y) * 0.5 + 14;
                target = clamp(this.scale * 30 / span, 13, this.scale);
            }
            this.curScale += (target - this.curScale) * Math.min(1, 4 * dt);
            const s = this.curScale;
            const tx = fx - this.width / s / 2;
            const ty = fy - this.height / s / 2;
            this.camera.x += (tx - this.camera.x) * 5 * dt;
            this.camera.y += (ty - this.camera.y) * 5 * dt;
        }
        const s = this.viewScale();
        this.camera.x = clamp(this.camera.x, 0, Math.max(0, this.world.width - this.width / s));
        this.camera.y = clamp(this.camera.y, -50, this.world.height - this.height / s);
    }
    
    checkGravityAbove(x, y) {
        // 检查上方方块是否需要下落
        for (let dy = -1; dy >= -10; dy--) {
            const by = y + dy;
            if (by < 0) break;
            const blockId = this.world.get(x, by);
            if (BLOCKS[blockId] && BLOCKS[blockId].gravity) {
                this.updateSand(x, by);
            } else if (blockId !== 0) {
                break;
            }
        }
    }
    
    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        
        // 俯视模式：完全独立的画法
        if (this.view === 'top') {
            this.renderTop(ctx);
            this.drawMouseHighlight(ctx, this.topScale);
            this.drawBreakProgress(ctx, this.topScale);
            this.drawHUD(ctx);
            return;
        }
        
        // 天空
        this.drawSky(ctx);
        
        const s = this.view === 'fp' ? this.fpScale : this.scale;
        
        ctx.save();
        // 仰视模式：整个世界上下翻转
        if (this.view === 'under') {
            ctx.translate(0, this.height);
            ctx.scale(1, -1);
        }
        
        // 视口范围
        const startX = Math.max(0, Math.floor(this.camera.x) - 1);
        const endX = Math.min(this.world.width, Math.ceil(this.camera.x + this.width / s) + 1);
        const startY = Math.max(0, Math.floor(this.camera.y) - 1);
        const endY = Math.min(this.world.height, Math.ceil(this.camera.y + this.height / s) + 1);
        
        // 背景墙（voxelcraft 洞穴质感）：地表以下的空气格画深色岩壁，洞穴不再露天空色
        const seaL = this.world.seaLevel || Math.floor(this.world.height * 0.45);
        for (let x = startX; x < endX; x++) {
            const surf = this.surfaceYAt(x);
            const top = Math.max(startY, (surf > 0 ? surf : seaL) + 2);
            for (let y = top; y < endY; y++) {
                if (this.world.get(x, y) !== 0) continue;
                const sx = (x - this.camera.x) * s;
                const sy = (y - this.camera.y) * s;
                const j = ((x * 7 + y * 13) % 5) - 2;
                ctx.fillStyle = `rgb(${42 + j},${40 + j},${46 + j})`;
                ctx.fillRect(sx, sy, s + 1, s + 1);
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.fillRect(sx + s * 0.15, sy + s * 0.2, s * 0.25, s * 0.2);
                ctx.fillRect(sx + s * 0.6, sy + s * 0.55, s * 0.2, s * 0.2);
                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                ctx.fillRect(sx, sy, s + 1, 2);
            }
        }
        
        // 画方块
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                const blockId = this.world.get(x, y);
                if (blockId === 0) continue;
                const block = BLOCKS[blockId];
                if (!block) continue;
                
                const sx = (x - this.camera.x) * s;
                const sy = (y - this.camera.y) * s;
                
                ctx.fillStyle = block.color;
                ctx.fillRect(sx, sy, s + 1, s + 1);
                
                this.drawBlockTexture(ctx, blockId, sx, sy, s);
                
                // 光照遮罩
                const light = this.world.light[this.world.idx(x, y)] || 0;
                const darkness = 1 - (light / 15) * this.getDayLight();
                if (darkness > 0.05) {
                    ctx.fillStyle = `rgba(0,0,0,${darkness * 0.7})`;
                    ctx.fillRect(sx, sy, s + 1, s + 1);
                }
            }
        }
        
        // 水半透明效果
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                const blockId = this.world.get(x, y);
                if (blockId === 18) {
                    const sx = (x - this.camera.x) * s;
                    const sy = (y - this.camera.y) * s;
                    ctx.fillStyle = 'rgba(60,120,200,0.4)';
                    ctx.fillRect(sx, sy, s + 1, s + 1);
                    ctx.strokeStyle = 'rgba(100,170,230,0.3)';
                    ctx.lineWidth = 1;
                    const wave = Math.sin(Date.now() * 0.003 + x * 0.5) * 3;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy + s * 0.3 + wave);
                    ctx.lineTo(sx + s, sy + s * 0.3 + wave);
                    ctx.stroke();
                }
            }
        }
        
        // 怪物和箭和子弹
        for (const m of this.mobs) m.draw(ctx, this.camera.x, this.camera.y, s);
        for (const a of this.arrows) a.draw(ctx, this.camera.x, this.camera.y, s);
        for (const b of this.bullets) b.draw(ctx, this.camera.x, this.camera.y, s);
        
        // 玩家（第一人称时不画身体，改画自己的手）
        if (this.view !== 'fp') {
            if (!this.player.dead) this.player.draw(ctx, this.camera.x, this.camera.y, s);
            if (this.player2 && !this.player2.dead) this.player2.draw(ctx, this.camera.x, this.camera.y, s);
        }
        
        // 粒子
        this.particles.forEach(pp => pp.draw(ctx, this.camera.x, this.camera.y, s));
        
        // 鼠标高亮 + 挖掘进度
        this.drawMouseHighlight(ctx, s);
        this.drawBreakProgress(ctx, s);
        
        ctx.restore();
        
        // 第一人称：手 + 准星
        if (this.view === 'fp' && !this.player.dead) {
            this.drawFPHand(ctx);
            this.drawCrosshair(ctx);
        }
        
        // 夜晚遮罩
        const nightAlpha = this.getNightAlpha();
        if (nightAlpha > 0) {
            ctx.fillStyle = `rgba(10, 15, 40, ${nightAlpha * 0.5})`;
            ctx.fillRect(0, 0, this.width, this.height);
        }
        
        this.drawHUD(ctx);
    }
    
    // ===== 俯视模式：从上面看人 =====
    topColorOf(id) {
        switch (id) {
            case 1: return '#5d9e43';
            case 10: return '#3f7a2e';
            case 18: return '#3c78c8';
            case 9: return '#f0e080';
            default: {
                const b = BLOCKS[id];
                return (b && b.color && b.color[0] === '#') ? b.color : '#5a6472';
            }
        }
    }
    
    renderTop(ctx) {
        const s = this.topScale;
        ctx.fillStyle = '#101318';
        ctx.fillRect(0, 0, this.width, this.height);
        
        const startX = Math.max(0, Math.floor(this.camera.x) - 1);
        const endX = Math.min(this.world.width, Math.ceil(this.camera.x + this.width / s) + 1);
        const startY = Math.max(0, Math.floor(this.camera.y) - 1);
        const endY = Math.min(this.world.height, Math.ceil(this.camera.y + this.height / s) + 1);
        
        // 阴影层（伪 3D 厚度感）
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                const id = this.world.get(x, y);
                if (id === 0 || !BLOCKS[id]) continue;
                const sx = (x - this.camera.x) * s;
                const sy = (y - this.camera.y) * s;
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.fillRect(sx + 5, sy + 6, s, s);
            }
        }
        
        // 方块层
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                const id = this.world.get(x, y);
                if (id === 0 || !BLOCKS[id]) continue;
                const sx = (x - this.camera.x) * s;
                const sy = (y - this.camera.y) * s;
                ctx.fillStyle = this.topColorOf(id);
                ctx.fillRect(sx, sy, s + 1, s + 1);
            }
        }
        
        // 网格
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let x = startX; x <= endX; x++) {
            const sx = (x - this.camera.x) * s;
            ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, this.height); ctx.stroke();
        }
        for (let y = startY; y <= endY; y++) {
            const sy = (y - this.camera.y) * s;
            ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(this.width, sy); ctx.stroke();
        }
        
        // 水
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                if (this.world.get(x, y) === 18) {
                    const sx = (x - this.camera.x) * s;
                    const sy = (y - this.camera.y) * s;
                    ctx.fillStyle = 'rgba(60,120,200,0.45)';
                    ctx.fillRect(sx, sy, s + 1, s + 1);
                }
            }
        }
        
        // 怪物（从上看是圆脑袋 + 朝向楔子）
        for (const m of this.mobs) {
            const mx = (m.x - this.camera.x) * s;
            const my = (m.y - m.height / 2 - this.camera.y) * s;
            ctx.fillStyle = m.kind === 'zombie' ? '#3fa34d' : '#c8c8c8';
            ctx.beginPath(); ctx.arc(mx, my, s * 0.38, 0, Math.PI * 2); ctx.fill();
            const a = m.facingRight ? 0 : Math.PI;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath();
            ctx.arc(mx, my, s * 0.38, a - 0.5, a + 0.5);
            ctx.lineTo(mx, my);
            ctx.fill();
            if (m.hp < m.maxHp) {
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(mx - s * 0.4, my - s * 0.55, s * 0.8, 4);
                ctx.fillStyle = '#ff5d6c';
                ctx.fillRect(mx - s * 0.4, my - s * 0.55, s * 0.8 * Math.max(0, m.hp / m.maxHp), 4);
            }
        }
        
        // 玩家（从上往下看）
        if (!this.player.dead) {
            const p = this.player;
            const px = (p.x - this.camera.x) * s;
            const py = (p.y - p.height / 2 - this.camera.y) * s;
            ctx.fillStyle = '#2a9d8f';   // 肩膀
            ctx.beginPath(); ctx.arc(px, py, s * 0.42, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#e9c46a';   // 头
            ctx.beginPath(); ctx.arc(px, py, s * 0.26, 0, Math.PI * 2); ctx.fill();
            const fa = p.facingRight ? 0 : Math.PI;
            ctx.fillStyle = '#264653';
            ctx.beginPath();
            ctx.moveTo(px + Math.cos(fa) * s * 0.55, py + Math.sin(fa) * s * 0.55);
            ctx.lineTo(px + Math.cos(fa + 2.5) * s * 0.3, py + Math.sin(fa + 2.5) * s * 0.3);
            ctx.lineTo(px + Math.cos(fa - 2.5) * s * 0.3, py + Math.sin(fa - 2.5) * s * 0.3);
            ctx.fill();
        }
        
        // 二号玩家（紫色）
        if (this.player2 && !this.player2.dead) {
            const q = this.player2;
            const px = (q.x - this.camera.x) * s;
            const py = (q.y - q.height / 2 - this.camera.y) * s;
            ctx.fillStyle = '#9b59b6';
            ctx.beginPath(); ctx.arc(px, py, s * 0.42, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#f39c12';
            ctx.beginPath(); ctx.arc(px, py, s * 0.26, 0, Math.PI * 2); ctx.fill();
            const fa = q.facingRight ? 0 : Math.PI;
            ctx.fillStyle = '#3d1e47';
            ctx.beginPath();
            ctx.moveTo(px + Math.cos(fa) * s * 0.55, py + Math.sin(fa) * s * 0.55);
            ctx.lineTo(px + Math.cos(fa + 2.5) * s * 0.3, py + Math.sin(fa + 2.5) * s * 0.3);
            ctx.lineTo(px + Math.cos(fa - 2.5) * s * 0.3, py + Math.sin(fa - 2.5) * s * 0.3);
            ctx.fill();
        }
    }
    
    // ===== 第一人称：看到自己的手 =====
    shadeColor(hex, k) {
        if (!hex || hex[0] !== '#') return hex;
        const n = parseInt(hex.slice(1), 16);
        const r = clamp(Math.round(((n >> 16) & 255) * k), 0, 255);
        const g = clamp(Math.round(((n >> 8) & 255) * k), 0, 255);
        const b = clamp(Math.round((n & 255) * k), 0, 255);
        return `rgb(${r},${g},${b})`;
    }
    
    drawFPHand(ctx) {
        const p = this.player;
        const right = p.facingRight;
        const moving = Math.abs(p.vx) > 0.5;
        const t = Date.now();
        const bob = moving ? Math.sin(t * 0.014) * 9 : Math.sin(t * 0.004) * 3;
        const swing = this.mouse.down ? Math.abs(Math.sin(t * 0.02)) * 26 : 0;
        
        const hx = right ? this.width * 0.68 : this.width * 0.32;
        const hy = this.height - 150 + bob + swing;
        const ax = right ? this.width + 40 : -40;
        
        // 手臂
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#e9c46a';
        ctx.lineWidth = 52;
        ctx.beginPath();
        ctx.moveTo(ax, this.height + 60);
        ctx.lineTo(hx, hy + 30);
        ctx.stroke();
        // 袖子
        ctx.strokeStyle = '#2a9d8f';
        ctx.lineWidth = 62;
        ctx.beginPath();
        ctx.moveTo(lerp(ax, hx, 0.18), lerp(this.height + 60, hy + 30, 0.18));
        ctx.lineTo(lerp(ax, hx, 0.42), lerp(this.height + 60, hy + 30, 0.42));
        ctx.stroke();
        
        // 手里拿的东西：枪 或 当前选中的方块
        if (this.gunSelected()) {
            ctx.save();
            ctx.translate(hx, hy);
            if (!right) ctx.scale(-1, 1);
            ctx.fillStyle = '#37474f';
            ctx.fillRect(8, -16, 80, 15);      // 枪管
            ctx.fillRect(56, -22, 12, 7);      // 准星
            ctx.fillStyle = '#5d4037';
            ctx.fillRect(4, -8, 22, 36);       // 握把
            ctx.fillStyle = '#263238';
            ctx.fillRect(30, -2, 30, 12);      // 弹匣
            ctx.restore();
        }
        const block = BLOCKS[HOTBAR_PAGES[this.hotbarPage][this.selectedSlot]];
        if (block && !this.gunSelected()) {
            const size = 64;
            ctx.save();
            ctx.translate(hx, hy);
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 18;
            ctx.fillStyle = this.shadeColor(block.color, 0.65);
            ctx.fillRect(-size / 2, -size / 2, size, size);
            ctx.shadowBlur = 0;
            ctx.fillStyle = block.color;
            ctx.fillRect(-size / 2 + 4, -size / 2 + 4, size - 8, size - 12);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fillRect(-size / 2 + 6, -size / 2 + 6, size - 12, 8);
            ctx.restore();
        }
    }
    
    drawCrosshair(ctx) {
        const cx = this.mouse.x, cy = this.mouse.y;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 14, cy); ctx.lineTo(cx - 5, cy);
        ctx.moveTo(cx + 5, cy);  ctx.lineTo(cx + 14, cy);
        ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy - 5);
        ctx.moveTo(cx, cy + 5);  ctx.lineTo(cx, cy + 14);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }
    
    // ===== HUD：血量 / 视角提示 / 死亡界面 =====
    drawHeartIcon(ctx, x, y, size, fill) {
        ctx.fillStyle = fill === 1 ? '#ff5d6c' : (fill === 0.5 ? 'rgba(255,93,108,0.5)' : 'rgba(30,25,25,0.75)');
        ctx.fillRect(x, y, size * 0.42, size * 0.42);
        ctx.fillRect(x + size * 0.58, y, size * 0.42, size * 0.42);
        ctx.fillRect(x, y + size * 0.2, size, size * 0.42);
        ctx.fillRect(x + size * 0.2, y + size * 0.42, size * 0.6, size * 0.36);
        ctx.fillRect(x + size * 0.34, y + size * 0.62, size * 0.32, size * 0.24);
    }
    
    drawHUD(ctx) {
        const p = this.player;
        
        // 血量（10 颗心 = 20 hp）
        for (let i = 0; i < 10; i++) {
            const fill = p.hp >= (i + 1) * 2 ? 1 : (p.hp > i * 2 ? 0.5 : 0);
            this.drawHeartIcon(ctx, 22 + i * 26, 20, 20, fill);
        }
        
        // 二号玩家血量（紫色小字 P2）
        if (this.player2) {
            const q = this.player2;
            ctx.font = '700 12px "Microsoft YaHei",sans-serif';
            ctx.fillStyle = '#d7a6f5';
            ctx.fillText('P2', 22, 68);
            for (let i = 0; i < 10; i++) {
                const fill = q.hp >= (i + 1) * 2 ? 1 : (q.hp > i * 2 ? 0.5 : 0);
                this.drawHeartIcon(ctx, 48 + i * 22, 54, 16, fill);
            }
            if (q.dead) {
                ctx.font = '600 16px "Microsoft YaHei",sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#e8b6ff';
                ctx.fillText('二号玩家倒下了…按 R 一起复活', this.width / 2, this.height * 0.38);
                ctx.textAlign = 'left';
            }
        }
        
        // 提示消息
        if (this.toast.t > 0) {
            ctx.globalAlpha = Math.min(1, this.toast.t);
            ctx.font = '700 16px "Microsoft YaHei",sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillText(this.toast.text, this.width / 2 + 1, this.height * 0.16 + 1);
            ctx.fillStyle = '#ffe9a8';
            ctx.fillText(this.toast.text, this.width / 2, this.height * 0.16);
            ctx.globalAlpha = 1;
            ctx.textAlign = 'left';
        }
        
        // 视角提示
        const names = { side: '侧面视角', fp: '第一人称', top: '俯视', under: '仰视 · 从底下看' };
        ctx.font = '600 13px "Microsoft YaHei",sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(`[${names[this.view]}]  按 V 切换视角`, this.width / 2, 24);
        ctx.textAlign = 'left';
        
        // 夜晚警示
        if (this.nightBanner > 0) {
            ctx.globalAlpha = Math.min(1, this.nightBanner);
            ctx.font = '800 30px "Microsoft YaHei",sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillText('夜晚来临，怪物出没！', this.width / 2 + 2, this.height * 0.3 + 2);
            ctx.fillStyle = '#ff8a8a';
            ctx.fillText('夜晚来临，怪物出没！', this.width / 2, this.height * 0.3);
            ctx.globalAlpha = 1;
            ctx.textAlign = 'left';
        }
        
        // 死亡界面
        if (p.dead) {
            ctx.fillStyle = 'rgba(90,10,10,0.5)';
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.textAlign = 'center';
            ctx.font = '900 56px "Microsoft YaHei",sans-serif';
            ctx.fillStyle = '#ffdada';
            ctx.fillText('你死了', this.width / 2, this.height / 2 - 20);
            ctx.font = '600 20px "Microsoft YaHei",sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('按 R 或点击屏幕重生', this.width / 2, this.height / 2 + 30);
            ctx.textAlign = 'left';
        }
    }
    
    drawSky(ctx) {
        // voxelcraft 融合：连续天空渐变表 + 星空 + 日月弧线
        const t = this.dayTime;
        const sky = skyAt(t);
        
        const grad = ctx.createLinearGradient(0, 0, 0, this.height);
        grad.addColorStop(0, `rgb(${sky.top.map(Math.round).join(',')})`);
        grad.addColorStop(0.62, `rgb(${sky.top.map((v, i) => Math.round(lerp(v, sky.hor[i], 0.55))).join(',')})`);
        grad.addColorStop(1, `rgb(${sky.hor.map(Math.round).join(',')})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.width, this.height);
        
        // 星星（随光照淡入淡出）
        const night = clamp(1 - (sky.light - 0.30) / 0.30, 0, 1);
        if (night > 0.02) {
            ctx.fillStyle = '#ffffff';
            for (const s of this.stars) {
                const sx = ((s.x + t) % 1) * this.width;
                const sy = s.y * this.height;
                ctx.globalAlpha = clamp(night * s.m * 0.5, 0, 1);
                ctx.fillRect(sx, sy, 1.6, 1.6);
            }
            ctx.globalAlpha = 1;
        }
        
        // 太阳 / 月亮（沿弧线走）
        const sa = t * Math.PI * 2 - Math.PI / 2;
        const cx = this.width * 0.5 + Math.cos(sa) * this.width * 0.56;
        const cy = this.height * 0.46 - Math.sin(sa) * this.height * 0.46;
        if (cy > -this.height * 0.2) {
            const isMoon = sky.light < 0.45;
            const r = isMoon ? 26 : 34;
            const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.4);
            const cc = isMoon ? '190,205,235' : '255,238,190';
            rg.addColorStop(0, 'rgba(' + cc + ',0.95)');
            rg.addColorStop(0.16, 'rgba(' + cc + ',0.55)');
            rg.addColorStop(1, 'rgba(' + cc + ',0)');
            ctx.fillStyle = rg;
            ctx.beginPath(); ctx.arc(cx, cy, r * 3.4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = isMoon ? '#becde8' : '#ffefc0';
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
            if (isMoon) {
                ctx.fillStyle = 'rgba(150,165,195,0.5)';
                ctx.beginPath(); ctx.arc(cx - 8, cy + 4, 5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(cx + 7, cy - 5, 4, 0, Math.PI * 2); ctx.fill();
            }
        }
    }
    
    drawBlockTexture(ctx, blockId, sx, sy, scale) {
        ctx.lineWidth = 1;
        // 高光和阴影边框
        switch (blockId) {
            case 1: // 草
                ctx.fillStyle = '#6ab04c';
                ctx.fillRect(sx + 2, sy + 2, scale - 4, scale * 0.4);
                ctx.fillStyle = '#7d6348';
                ctx.fillRect(sx + 2, sy + scale * 0.5, scale - 4, scale * 0.4);
                // 草叶细节
                ctx.strokeStyle = '#5a9e3a';
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath();
                    ctx.moveTo(sx + 4 + i * 8, sy + scale * 0.5);
                    ctx.lineTo(sx + 6 + i * 8, sy + scale * 0.3);
                    ctx.stroke();
                }
                break;
            case 3: // 石头纹理
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.fillRect(sx + 4, sy + 4, 6, 6);
                ctx.fillRect(sx + scale - 12, sy + 8, 5, 5);
                ctx.fillRect(sx + 8, sy + scale - 10, 7, 7);
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fillRect(sx + 2, sy + 2, scale - 4, 2);
                break;
            case 4: // 木头纹理
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                for (let i = 1; i < 4; i++) {
                    ctx.beginPath();
                    ctx.moveTo(sx + i * scale / 4, sy);
                    ctx.lineTo(sx + i * scale / 4, sy + scale);
                    ctx.stroke();
                }
                ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                for (let i = 1; i < 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(sx, sy + i * scale / 3);
                    ctx.lineTo(sx + scale, sy + i * scale / 3);
                    ctx.stroke();
                }
                break;
            case 6: // 沙子
                ctx.fillStyle = 'rgba(0,0,0,0.08)';
                for (let i = 0; i < 6; i++) {
                    ctx.fillRect(sx + Math.random() * scale, sy + Math.random() * scale, 2, 2);
                }
                break;
            case 12: case 13: case 14: case 15: // 矿石
                ctx.fillStyle = blockId === 12 ? '#333' : blockId === 13 ? '#7a6a5a' : blockId === 14 ? '#c0a020' : '#3adaba';
                ctx.fillRect(sx + scale * 0.3, sy + scale * 0.3, scale * 0.4, scale * 0.4);
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.fillRect(sx + scale * 0.35, sy + scale * 0.35, scale * 0.15, scale * 0.15);
                break;
            case 16: // 雪
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillRect(sx + 2, sy + 2, scale - 4, 3);
                break;
            case 17: // 仙人掌
                ctx.fillStyle = '#1a6a3a';
                ctx.fillRect(sx + scale * 0.3, sy + scale * 0.2, scale * 0.15, scale * 0.3);
                ctx.fillRect(sx + scale * 0.55, sy + scale * 0.5, scale * 0.15, scale * 0.3);
                break;
        }
    }
    
    drawMouseHighlight(ctx, s) {
        const aim = this.getAim();
        if (!aim) return;
        const sx = (aim.x - this.camera.x) * s;
        const sy = (aim.y - this.camera.y) * s;
        
        ctx.strokeStyle = aim.ok ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 90, 90, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, s - 2, s - 2);
    }
    
    drawBreakProgress(ctx, s) {
        if (this.breaking.x < 0 || !this.mouse.down) return;
        const x = this.breaking.x, y = this.breaking.y;
        const sx = (x - this.camera.x) * s;
        const sy = (y - this.camera.y) * s;
        const pct = Math.min(1, this.breaking.progress / Math.max(0.001, this.breaking.maxProgress));
        
        // 裂纹（同一块方块每次画出来的裂纹形状稳定，随进度变多）
        let seed = (x * 73856093) ^ (y * 19349663) ^ 0x9e3779b9;
        const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        const cracks = 2 + Math.floor(pct * 5);
        ctx.strokeStyle = 'rgba(20,15,10,0.8)';
        ctx.lineWidth = Math.max(1.2, s * 0.045);
        ctx.lineCap = 'round';
        for (let i = 0; i < cracks; i++) {
            let px = sx + rnd() * s, py = sy + (rnd() < 0.5 ? 0 : s);
            ctx.beginPath();
            ctx.moveTo(px, py);
            for (let j = 0; j < 3; j++) {
                px = sx + s * (0.15 + rnd() * 0.7);
                py = sy + s * (0.15 + rnd() * 0.7);
                ctx.lineTo(px, py);
            }
            ctx.stroke();
        }
        
        // 底部进度条
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(sx + 4, sy + s - 8, s - 8, 5);
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(sx + 4, sy + s - 8, (s - 8) * pct, 5);
    }
    
    getDayLight() {
        const t = this.dayTime;
        if (t < 0.2 || t > 0.8) return 0.3; // 夜晚
        if (t < 0.25) return lerp(0.3, 1, (t - 0.2) / 0.05);
        if (t > 0.75) return lerp(1, 0.3, (t - 0.75) / 0.05);
        return 1; // 白天
    }
    
    getNightAlpha() {
        const t = this.dayTime;
        if (t < 0.2 || t > 0.8) return 1;
        if (t < 0.3) return 1 - (t - 0.2) / 0.1;
        if (t > 0.7) return (t - 0.7) / 0.1;
        return 0;
    }
}

// 启动游戏
window.addEventListener('load', () => {
    window.game = new Game();
});
