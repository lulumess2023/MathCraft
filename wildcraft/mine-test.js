// ==================== craftmine2d 无头冒烟测试 ====================
// 假 DOM + 假 canvas，直接驱动 game.update/render 真实循环
'use strict';
const fs = require('fs');
const path = require('path');

// ---------- 假环境 ----------
function mkCtx() {
    const target = {};
    return new Proxy(target, {
        get(t, k) {
            if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
            if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
            if (k === 'measureText') return () => ({ width: 10 });
            if (typeof k === 'string' && k in t) return t[k];
            return function () {};
        },
        set(t, k, v) { t[k] = v; return true; },
    });
}

const elements = {};
function makeEl(id) {
    return {
        id, style: {}, dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        textContent: '', innerHTML: '',
        addEventListener() {},
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
    };
}
const canvasEl = makeEl('gameCanvas');
canvasEl.getContext = () => mkCtx();
elements['gameCanvas'] = canvasEl;

global.document = {
    getElementById: (id) => elements[id] || (elements[id] = makeEl(id)),
    querySelectorAll: () => [],
    addEventListener() {},
};
global.window = {
    innerWidth: 1280, innerHeight: 800,
    addEventListener() {},
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;   // 不让真循环自己跑，测试里手动驱动
global.localStorage = { getItem: () => null, setItem() {} };

// ---------- 加载游戏 ----------
// eval 里的 class/const 不会泄漏到外层，显式导出需要的
const src = fs.readFileSync(path.join(__dirname, 'mine.js'), 'utf8');
eval(src + '\n;global.__G = { Game, Mob, Arrow, BLOCKS, World, skyAt, HOTBAR_PAGES };');
window.game = new global.__G.Game();
const game = window.game;
game.menuOpen = false;   // 测试跳过开始菜单
global.Mob = global.__G.Mob;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- 断言工具 ----------
let pass = 0, fail = 0, errors = 0;
function check(name, ok, detail) {
    if (ok) { pass++; console.log('  ✓ ' + name + (detail ? '  ' + detail : '')); }
    else { fail++; console.log('  ✗ ' + name + (detail ? '  ' + detail : '')); }
}
function step(n) {
    for (let i = 0; i < n; i++) {
        try { game.update(1 / 60); game.render(); }
        catch (e) { errors++; console.log('    异常:', e.message); }
    }
}
function finitePos() {
    return [game.player, game.player2, ...game.mobs].every(e =>
        !e || (Number.isFinite(e.x) && Number.isFinite(e.y)));
}
// 以出生点为中心重铺平坦场地（后续测试挖矿会挖出坑，需要重铺）
function flattenSpawn() {
    const sx0 = Math.floor(game.spawnPoint.x), sy0 = Math.floor(game.spawnPoint.y);
    for (let x = sx0 - 5; x <= sx0 + 5; x++) {
        game.world.set(x, sy0, 1);
        for (let dy = 1; dy <= 3; dy++) game.world.set(x, sy0 - dy, 0);
    }
    game.world.calculateLighting();
}

(async () => {
    console.log('\n[1] 启动与世界生成');
    await sleep(1300);   // 等 load() 的两级 setTimeout 走完
    check('游戏启动完成', game.world.generated === true);
    check('玩家站在地表（不卡石头里）',
        Math.abs(game.player.y - game.spawnPoint.y) < 2,
        `player.y=${game.player.y.toFixed(1)} spawn=${game.spawnPoint.y}`);
    check('初始无怪物', game.mobs.length === 0);

    console.log('\n[2] 白天：不刷怪');
    game.dayTime = 0.5;
    game.spawnTimer = 0.01;
    step(300);
    check('白天 5 秒无怪物生成', game.mobs.length === 0, `mobs=${game.mobs.length}`);

    console.log('\n[3] 夜晚：刷怪 + 怪物有威胁');
    game.dayTime = 0.95;   // 夜晚
    game.spawnTimer = 0.01;
    let frames = 0;
    while (game.mobs.length === 0 && frames < 600) { step(1); frames++; }
    check('夜晚会刷出怪物', game.mobs.length > 0,
        `${game.mobs.length} 只（等了 ${frames} 帧）`);
    check('怪物站在地表（没刷进方块里）',
        game.mobs.every(m => !game.world.isSolid(Math.floor(m.x), Math.floor(m.y - 0.5))));
    const hpBefore = game.player.hp;
    // 铺一块 11 格宽的平坦场地，排除水塘/悬崖等随机地形干扰
    // （以出生点为中心，而不是当前玩家位置——玩家可能已被击退漂移）
    flattenSpawn();
    // 把一只怪放到玩家旁边，验证接触伤害
    const mob0 = game.mobs[0];
    if (mob0) { mob0.x = game.player.x + 2; mob0.y = game.player.y; mob0.kbT = 0; }
    step(360);   // 6 秒，够多轮接触
    check('僵尸贴身会造成伤害', game.player.hp < hpBefore,
        `hp ${hpBefore} → ${game.player.hp}`);
    if (game.player.dead) game.respawn();   // 可能被打死，复活再测攻击

    console.log('\n[4] 攻击怪物');
    game.spawnTimer = 1e9;   // 后面测试关闭刷怪，避免干扰
    if (game.mobs.length === 0) {   // 都被日晒烧死了就再刷一只
        game.mobs.push(new Mob('zombie', game.player.x + 4, game.player.y, 1));
    }
    const mob = game.mobs[0];
    mob.x = game.player.x + 3;
    mob.y = game.player.y;
    const m0hp = mob.hp;
    // 把鼠标对准怪物中心
    game.mouse.x = (mob.x - game.camera.x) * game.scale;
    game.mouse.y = (mob.y - mob.height / 2 - game.camera.y) * game.scale;
    game.handleBreak();
    check('左键能打到怪物', mob.hp < m0hp, `hp ${m0hp} → ${mob.hp}`);
    check('被打的怪被击退', mob.kbT > 0 || Math.abs(mob.vx) > 1);

    console.log('\n[5] 射线随准挖矿（不能穿墙）');
    game.mobs.length = 0; game.arrows.length = 0;   // 清掉怪，避免追打干扰挖掘
    if (game.player.dead) game.respawn();
    // 找一块眼前能直接看到的实心方块
    const p = game.player;
    let target = null;
    for (let dx = 1; dx <= 8 && !target; dx++) {
        const bx = Math.floor(p.x) + dx;
        for (let dy = -3; dy <= 4; dy++) {
            const by = Math.floor(p.y - p.height * 0.8) + dy;
            if (!game.world.isSolid(bx, by)) continue;
            game.mouse.x = (bx + 0.5 - game.camera.x) * game.scale;
            game.mouse.y = (by + 0.5 - game.camera.y) * game.scale;
            const aim = game.getAim();
            if (aim && aim.ok && aim.x === bx && aim.y === by) { target = { x: bx, y: by }; break; }
        }
    }
    check('能找到可瞄准的方块', !!target, target ? `(${target.x},${target.y})` : '没找到');
    if (target) {
        game.mouse.x = (target.x + 0.5 - game.camera.x) * game.scale;
        game.mouse.y = (target.y + 0.5 - game.camera.y) * game.scale;
        game.handleBreak();
        check('开始挖掘（进度目标正确）',
            game.breaking.x === target.x && game.breaking.y === target.y);
        game.mouse.down = true;
        let mined = false;
        for (let i = 0; i < 1200 && !mined; i++) {
            // 相机每帧都在向玩家漂移，鼠标屏幕坐标要按当前相机重新换算（锁死目标）
            game.mouse.x = (target.x + 0.5 - game.camera.x) * game.scale;
            game.mouse.y = (target.y + 0.5 - game.camera.y) * game.scale;
            step(1);
            if (game.world.get(target.x, target.y) === 0) mined = true;
        }
        game.mouse.down = false;
        check('按住左键能把方块挖掉', mined, '（石头硬度 3.0，约 0.9 秒/块）');
        // 穿墙测试：在眼睛高度立一堵 3 格高的石墙，墙后放目标块
        const eyeY = Math.floor(p.y - p.height * 0.8);
        const wx = Math.floor(p.x) + 1;
        for (let dy = -1; dy <= 1; dy++) game.world.set(wx, eyeY + dy, 3);
        game.world.calculateLighting();
        const bx2 = wx + 3, by2 = eyeY;
        if (game.world.get(bx2, by2) === 0) game.world.set(bx2, by2, 3);
        game.mouse.x = (bx2 + 0.5 - game.camera.x) * game.scale;
        game.mouse.y = (by2 + 0.5 - game.camera.y) * game.scale;
        const aimBlocked = game.getAim();
        const blockedOk = !aimBlocked || aimBlocked.x !== bx2 || aimBlocked.y !== by2;
        check('射线不能穿墙随准', blockedOk,
            blockedOk ? `（命中 ${aimBlocked ? `(${aimBlocked.x},${aimBlocked.y})` : '空'}，被墙挡住）`
                      : `穿过了墙 (${wx}) 打到 (${bx2},${by2})`);
        for (let dy = -1; dy <= 1; dy++) game.world.set(wx, eyeY + dy, 0);
        game.world.calculateLighting();
    }

    console.log('\n[6] 四种视角切换');
    for (const v of ['side', 'fp', 'top', 'under']) {
        game.view = v;
        const camBefore = { x: game.camera.x, y: game.camera.y };
        step(90);
        check(`视角 ${v}：90 帧无异常`, errors === 0, `camera 移动 ${Math.hypot(game.camera.x - camBefore.x, game.camera.y - camBefore.y).toFixed(1)}px`);
    }
    game.cycleView();
    check('V 键循环切换正常', game.view === 'side', 'under → cycle → ' + game.view);

    console.log('\n[7] 天亮：怪物日晒燃烧消失');
    game.dayTime = 0.5;
    if (game.player.dead) game.respawn();
    game.mobs.length = 0;
    game.arrows.length = 0;
    const zx = Math.floor(game.spawnPoint.x) + 4;   // 场地内，保证露天且不卡地形
    const zy = game.surfaceYAt(zx) > 0 ? game.surfaceYAt(zx) : game.player.y;
    game.mobs.push(new global.__G.Mob('zombie', zx + 0.5, zy, 1));
    // 怪会走向玩家，清出整片露天带（出生高度上方 10 格），保证它一路都被日晒照到
    const gy0 = Math.floor(game.spawnPoint.y);
    for (let x = Math.floor(game.spawnPoint.x) - 6; x <= Math.floor(game.spawnPoint.x) + 10; x++) {
        for (let dy = 1; dy <= 10; dy++) {
            if (game.world.get(x, gy0 - dy) !== 0) game.world.set(x, gy0 - dy, 0);
        }
    }
    game.world.calculateLighting();
    step(900);   // 15 秒
    check('天亮后怪物全部烧死', game.mobs.length === 0, `剩 ${game.mobs.length} 只`);

    console.log('\n[8] 死亡与重生');
    game.player.invuln = 0;
    game.hurtPlayer(999, game.player.x + 1);
    check('致死伤害会倒下', game.player.dead === true && game.player.hp === 0);
    step(60);
    game.respawn();
    check('按 R / 点击能重生', !game.player.dead && game.player.hp === 20);
    check('重生后有无敌保护', game.player.invuln > 1);

    console.log('\n[10] 枪械：移动方向与枪口方向分离');
    game.dayTime = 0.95;   // 夜晚，避免日晒干扰
    game.mobs.length = 0; game.arrows.length = 0; game.bullets.length = 0;
    if (game.player.dead) game.respawn();
    flattenSpawn();   // [5] 挖矿可能在出生点附近留下凹坑
    game.selectedSlot = 9;   // 第 10 格 = 枪
    check('第 10 格是枪', game.gunSelected() === true);
    const tm = new global.__G.Mob('zombie', game.player.x + 4, game.player.y, 1);
    game.mobs.push(tm);
    const s10 = game.viewScale();
    const tmHp = tm.hp;
    let fired = false;
    game.mouse.down = true;
    for (let i = 0; i < 60; i++) {
        // 相机漂移，鼠标屏幕坐标每帧重算锁死怪物
        game.mouse.x = (tm.x - game.camera.x) * s10;
        game.mouse.y = (tm.y - tm.height / 2 - game.camera.y) * s10;
        step(1);
        if (game.bullets.length) fired = true;
        if (tm.hp < tmHp) break;
    }
    game.mouse.down = false;
    check('枪能开火并打中怪物', tm.hp < tmHp, `hp ${tmHp} → ${tm.hp.toFixed(1)}`);
    check('子弹实体生成过', fired);
    // 清掉靶怪，避免它追上来把玩家打出击退、干扰移动测试
    game.mobs.length = 0; game.bullets.length = 0;
    // 边移动边射击：两套方向互不干扰
    game.keys['KeyA'] = true;
    game.mouse.down = true;
    const x0 = game.player.x;
    let maxBullets = 0;
    for (let i = 0; i < 50; i++) {
        step(1);
        maxBullets = Math.max(maxBullets, game.bullets.length);
    }
    game.mouse.down = false;
    game.keys['KeyA'] = false;
    check('边移动边射击（两套方向独立）',
        game.player.x < x0 - 1.5 && maxBullets >= 1,
        `位移 ${(game.player.x - x0).toFixed(1)} 格，同屏子弹峰值 ${maxBullets}`);
    game.selectedSlot = 0;
    game.mobs.length = 0; game.bullets.length = 0;

    console.log('\n[11] 双人模式（wildcraft 融合）');
    game.toggleP2();
    check('P 键加入二号玩家', !!game.player2);
    game.spawnTimer = 1e9;   // 关闭夜间自动刷怪，避免随机怪撞飞 P2
    game.mobs.length = 0; game.arrows.length = 0; game.bullets.length = 0;
    // 把 P1 摆回出生点（周围 ±5 是 [3] 铺好的平坦场地）
    game.player.x = game.spawnPoint.x; game.player.y = game.spawnPoint.y;
    game.player.vx = 0; game.player.vy = 0;
    const q = game.player2;
    if (q) {
        // 挪到已知平坦处再测移动，排除随机地形
        q.x = game.player.x - 3; q.y = game.player.y; q.vx = 0; q.vy = 0;
        const q0 = q.x;
        game.keys['ArrowRight'] = true;
        step(30);
        game.keys['ArrowRight'] = false;
        check('P2 方向键移动正常', q.x > q0 + 1, `位移 ${(q.x - q0).toFixed(1)} 格`);
        // P2 挖掘：面前放一块石头再按 J
        game.mobs.length = 0;
        q.facingRight = true;
        const dbx = Math.floor(q.x + 1.2);
        let dcell = null;
        for (const by of [Math.floor(q.y - 0.5), Math.floor(q.y - 1.3), Math.floor(q.y - 2.1)]) {
            if (game.world.get(dbx, by) === 0) { dcell = { dbx, by }; break; }
        }
        if (dcell) game.world.set(dcell.dbx, dcell.by, 3);
        game.world.calculateLighting();
        const invStone0 = game.inv[3] || 0;
        game.keys['KeyJ'] = true;
        let dug = false;
        for (let i = 0; i < 150 && !dug; i++) {
            step(1);
            if (dcell && game.world.get(dcell.dbx, dcell.by) === 0) dug = true;
        }
        game.keys['KeyJ'] = false;
        check('P2 按 J 能挖面前的方块', dug);
        check('P2 挖到的方块进背包', (game.inv[3] || 0) === invStone0 + 1);
        // P2 射击
        game.mobs.length = 0;
        q.x = game.player.x - 3; q.y = game.player.y; q.vx = 0; q.vy = 0;
        q.facingRight = true;
        const qm = new global.__G.Mob('zombie', q.x + 4, q.y, 1);
        game.mobs.push(qm);
        const qmHp = qm.hp;
        game.keys['KeyK'] = true;
        for (let i = 0; i < 120 && qm.hp >= qmHp; i++) step(1);
        game.keys['KeyK'] = false;
        check('P2 按 K 能开枪打怪', qm.hp < qmHp, `hp ${qmHp} → ${qm.hp.toFixed(1)}`);
        // 相机跟随中点
        game.mobs.length = 0;
        const mid = (game.player.x + q.x) / 2;
        step(90);
        const camCenter = game.camera.x + game.width / game.viewScale() / 2;
        check('相机跟随双人中点', Math.abs(camCenter - mid) < 8,
            `镜头中心 ${camCenter.toFixed(1)} vs 中点 ${mid.toFixed(1)}`);
        // P2 死亡与复活
        q.invuln = 0;
        game.hurtPlayer(999, q.x + 1, q);
        check('P2 也会倒下', q.dead === true);
        game.respawn();
        check('R 复活两人', !game.player.dead && !q.dead);
    }
    game.toggleP2();
    check('P 键可退出双人', game.player2 === null);
    game.toggleP2();
    check('再次 P 可重新加入', !!game.player2);

    console.log('\n[12] 背包与合成台');
    game.mobs.length = 0; game.bullets.length = 0; game.arrows.length = 0;
    const invGrass0 = game.inv[1] || 0;
    const px = Math.floor(game.player.x) + 2, py = Math.floor(game.player.y) - 4;
    if (game.world.get(px, py) === 0) {
        game.mouse.x = (px + 0.5 - game.camera.x) * game.viewScale();
        game.mouse.y = (py + 0.5 - game.camera.y) * game.viewScale();
        game.handlePlace();
        check('右键放置消耗背包', game.world.get(px, py) === 1 && (game.inv[1] || 0) === invGrass0 - 1,
            `背包 ${invGrass0} → ${game.inv[1]}`);
    }
    game.inv[4] = 5;   // 5 根原木
    const plank0 = game.inv[5] || 0;
    check('合成木板×4', game.craft(0) === true && game.inv[5] === plank0 + 4 && game.inv[4] === 4);
    game.inv[14] = 0; game.inv[12] = 0;
    check('材料不足时合成失败', game.craft(3) === false);
    game.inv[2] = 0;
    game.selectedSlot = 1;   // 泥土
    const px2 = Math.floor(game.player.x) - 2, py2 = Math.floor(game.player.y) - 4;
    const cell2 = game.world.get(px2, py2);
    game.mouse.x = (px2 + 0.5 - game.camera.x) * game.viewScale();
    game.mouse.y = (py2 + 0.5 - game.camera.y) * game.viewScale();
    game.handlePlace();
    check('背包为空时无法放置', game.world.get(px2, py2) === cell2);
    game.selectedSlot = 0;
    game.inv[2] = 10;

    console.log('\n[13] wildcraft 新怪：蜘蛛与蛮兵');
    game.dayTime = 0.95;
    game.mobs.length = 0; game.arrows.length = 0; game.bullets.length = 0;
    if (game.player.dead) game.respawn();
    flattenSpawn();   // 重铺场地，避免新怪掉坑/被埋
    game.player.x = game.spawnPoint.x; game.player.y = game.spawnPoint.y;
    game.player.vx = 0; game.player.vy = 0;
    if (game.player2) { game.player2.x = game.spawnPoint.x - 2; game.player2.y = game.spawnPoint.y; game.player2.vx = 0; game.player2.vy = 0; }
    const spMob = new global.__G.Mob('spider', game.player.x + 2.5, game.player.y, 1);
    const brMob = new global.__G.Mob('brute', game.player.x + 4, game.player.y, 1);
    game.mobs.push(spMob, brMob);
    const spx0 = spMob.x, brx0 = brMob.x;
    const hpSum0 = game.player.hp + (game.player2 ? game.player2.hp : 0);
    let leaped = false;
    for (let i = 0; i < 240; i++) {
        step(1);
        if (spMob.vy < -6 && !spMob.onGround) leaped = true;
    }
    const hpSum1 = game.player.hp + (game.player2 ? game.player2.hp : 0);
    const anyoneDead = game.player.dead || (game.player2 && game.player2.dead);
    check('蜘蛛会扑跳', leaped);
    check('蜘蛛与蛮兵都会追击玩家',
        Math.abs(spMob.x - spx0) > 0.5 && Math.abs(brMob.x - brx0) > 0.5,
        `蜘蛛 Δ${(spMob.x - spx0).toFixed(2)} hp=${spMob.hp.toFixed(0)}，蛮兵 Δ${(brMob.x - brx0).toFixed(2)} hp=${brMob.hp.toFixed(0)}` +
        ` | 蛮兵 x=${brMob.x.toFixed(1)} y=${brMob.y.toFixed(1)} vx=${brMob.vx.toFixed(1)} want=${(brMob.wantVx || 0).toFixed(1)}` +
        ` 在场=${game.mobs.includes(brMob)} p1dead=${game.player.dead} p2dead=${game.player2 ? game.player2.dead : '-'} stuck=${(brMob.stuckT || 0).toFixed(2)}` +
        ` | 周围方块 bx=${Math.floor(brMob.x)}: y112=${game.world.get(Math.floor(brMob.x), 112)},y113=${game.world.get(Math.floor(brMob.x), 113)},y114=${game.world.get(Math.floor(brMob.x), 114)},y115=${game.world.get(Math.floor(brMob.x), 115)} | 脚下列 ${Math.floor(brMob.x) - 1}: y115=${game.world.get(Math.floor(brMob.x) - 1, 115)}`);
    check('新怪能咬到玩家', hpSum1 < hpSum0 || anyoneDead,
        `总血量 ${hpSum0} → ${hpSum1.toFixed(1)}`);
    game.mobs.length = 0;
    if (game.player.dead) game.respawn();
    game.spawnTimer = 3;   // 恢复夜间刷怪，供稳定性测试

    console.log('\n[14] voxelcraft：开始菜单 / 种子 / 换世界');
    game.menuOpen = true;
    const mx0 = game.player.x;
    game.keys['KeyD'] = true;
    step(30);
    game.keys['KeyD'] = false;
    check('菜单打开时世界暂停', Math.abs(game.player.x - mx0) < 1e-6);
    game.startMenu('top');
    check('选视角进入菜单', game.menuOpen === false && game.view === 'top');
    game.view = 'side';
    const seedOld = game.world.seed;
    game.newWorld('12345');
    check('换世界：种子生效且世界重建', game.world.seed === 12345 && game.world.seed !== seedOld && game.world.generated === true);
    check('换世界后玩家在新出生点', Math.abs(game.player.x - game.spawnPoint.x) < 1 && !game.player.dead);
    // 同种子地形一致（确定性）
    const { World } = global.__G;
    const a = new World(64, 64, 777), b = new World(64, 64, 777);
    a.generate(); b.generate();
    let same = true;
    for (let i = 0; i < a.blocks.length; i += 97) if (a.blocks[i] !== b.blocks[i]) { same = false; break; }
    check('同种子生成同地形', same);
    const c = new World(64, 64, 778);
    c.generate();
    let diff = false;
    for (let i = 0; i < a.blocks.length; i += 97) if (a.blocks[i] !== c.blocks[i]) { diff = true; break; }
    check('不同种子地形不同', diff);
    // 洞穴与黑曜石/圆石/冰存在
    let cave = 0, obs = 0, cob = 0, ice = 0, water = 0;
    for (let i = 0; i < game.world.blocks.length; i++) {
        const v = game.world.blocks[i];
        if (v === 0 && i / game.world.width | 0 > game.world.height * 0.5) cave++;
        if (v === 20) obs++;
        if (v === 19) cob++;
        if (v === 21) ice++;
        if (v === 18) water++;
    }
    check('地下有洞穴', cave > 50, `洞穴空气 ${cave} 格`);
    check('有黑曜石/圆石矿脉', obs > 0 && cob > 0, `黑曜石 ${obs} 圆石 ${cob}`);
    check('海面薄冰（有海才有）', water === 0 || ice > 0, `水 ${water} 冰 ${ice} 格`);
    game.newWorld(String(seedOld));
    game.player.x = game.spawnPoint.x; game.player.y = game.spawnPoint.y;
    game.player.vx = 0; game.player.vy = 0;
    flattenSpawn();

    console.log('\n[15] voxelcraft：游泳 / 自动上台阶 / 疾跑');
    if (game.player.dead) game.respawn();
    // 造一个人工水池：4 宽 3 深
    const wx0 = Math.floor(game.player.x) + 3, wy0 = Math.floor(game.player.y);
    for (let dx = 0; dx < 4; dx++) {
        game.world.set(wx0 + dx, wy0, 3);
        for (let dy = 1; dy <= 3; dy++) game.world.set(wx0 + dx, wy0 - dy, 18);
        for (let dy = 4; dy <= 5; dy++) game.world.set(wx0 + dx, wy0 - dy, 0);
    }
    game.world.calculateLighting();
    game.player.x = wx0 + 1.5; game.player.y = wy0 - 0.2; game.player.vy = 0;
    step(30);
    check('入水判定生效', game.player.inWater === true);
    game.keys['Space'] = true;
    const wy1 = game.player.y;
    step(30);
    game.keys['Space'] = false;
    check('水里按空格上浮', game.player.y < wy1 - 0.3, `y ${wy1.toFixed(2)} → ${game.player.y.toFixed(2)}`);
    check('水中下沉速度受限', game.player.vy <= 4.5, `vy=${game.player.vy.toFixed(2)}`);
    game.player.x = game.spawnPoint.x; game.player.y = game.spawnPoint.y;
    game.player.vx = 0; game.player.vy = 0;
    step(10);
    // 自动上 1 格台阶
    const stx = Math.floor(game.player.x) + 2, sty = Math.floor(game.player.y);
    game.world.set(stx, sty, 3);   // 面前 1 格高墙（脚所在行）
    game.world.calculateLighting();
    const sy1 = game.player.y;
    game.keys['KeyD'] = true;
    let minY = sy1;
    for (let i = 0; i < 120; i++) { step(1); minY = Math.min(minY, game.player.y); }
    game.keys['KeyD'] = false;
    check('自动上 1 格台阶', game.player.x > stx && minY < sy1 - 0.8,
        `x 越过 ${stx}，过程最高 y=${minY.toFixed(1)}（地面 ${sy1.toFixed(1)}）`);
    game.world.set(stx, sty, 0);
    game.world.calculateLighting();
    // 疾跑更快
    game.player.x = game.spawnPoint.x; game.player.y = game.spawnPoint.y;
    game.player.vx = 0; game.player.vy = 0;
    step(5);
    game.keys['KeyD'] = true;
    step(30);
    const walkX = game.player.x;
    game.player.x = game.spawnPoint.x; game.player.vx = 0;
    game.keys['ShiftLeft'] = true;
    step(30);
    const runX = game.player.x;
    game.keys['KeyD'] = false; game.keys['ShiftLeft'] = false;
    check('Shift 疾跑比走路快', (runX - game.spawnPoint.x) > (walkX - game.spawnPoint.x) * 1.3,
        `走 ${(walkX - game.spawnPoint.x).toFixed(1)} 格 vs 跑 ${(runX - game.spawnPoint.x).toFixed(1)} 格`);

    console.log('\n[16] voxelcraft：物品栏翻页与天空渐变');
    game.hotbarPage = 0; game.selectedSlot = 0; game.updateHotbarUI();
    check('默认第一页第 1 格是草', global.__G.HOTBAR_PAGES[0][0] === 1);
    game.hotbarPage = 1; game.selectedSlot = 0; game.updateHotbarUI();
    check('Q 翻页后第 1 格是圆石', global.__G.HOTBAR_PAGES[1][0] === 19);
    // 放一个圆石试试（背包里给点）
    game.inv[19] = 5;
    game.selectedSlot = 0;
    const cx0 = Math.floor(game.player.x) - 2, cy0 = Math.floor(game.player.y) - 4;
    if (game.world.get(cx0, cy0) === 0) {
        game.mouse.x = (cx0 + 0.5 - game.camera.x) * game.viewScale();
        game.mouse.y = (cy0 + 0.5 - game.camera.y) * game.viewScale();
        game.handlePlace();
        check('第二页方块可放置', game.world.get(cx0, cy0) === 19);
    }
    game.hotbarPage = 0; game.selectedSlot = 0; game.updateHotbarUI();
    // 天空渐变连续
    const s05 = global.__G.skyAt(0.5), s00 = global.__G.skyAt(0.0), s051 = global.__G.skyAt(0.501);
    check('正午光照=1 / 午夜=0.3', Math.abs(s05.light - 1) < 1e-6 && Math.abs(s00.light - 0.3) < 1e-6);
    check('天空颜色连续插值', Math.abs(s05.top[0] - s051.top[0]) < 1,
        `Δ=${Math.abs(s05.top[0] - s051.top[0]).toFixed(3)}`);

    console.log('\n[9] 长时间运行稳定性');
    errors = 0;
    let nanFrame = -1;
    for (let f = 0; f < 3600; f++) {   // 模拟 1 分钟（含完整昼夜）
        step(1);
        if (nanFrame < 0 && !finitePos()) nanFrame = f;
    }
    check('60 秒混合昼夜零异常', errors === 0, errors ? errors + ' 次' : '');
    check('全程坐标无 NaN', nanFrame < 0, nanFrame < 0 ? '' : `第 ${nanFrame} 帧`);

    console.log('\n=== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ===' +
        (errors ? `（运行期异常 ${errors} 次）` : ''));
    process.exit(fail > 0 || errors > 0 ? 1 : 0);
})().catch(e => { console.error('测试崩溃:', e); process.exit(1); });
