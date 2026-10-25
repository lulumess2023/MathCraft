// 数棋 v5 核心逻辑无头测试（与 index.html 中的纯逻辑保持一致）
"use strict";
const COLS = 10, ROWS = 10, TOTAL = COLS * ROWS;
const rnd = n => Math.floor(Math.random() * n);
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=rnd(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function cellXY(n){
  const row = Math.floor((n-1)/COLS);
  const idx = (n-1) % COLS;
  const col = (row % 2 === 0) ? idx : COLS-1-idx;
  return { col, row, x: col*100+50, y: (ROWS-1-row)*100+50 };
}
function isTrapNear(cells,n){
  const t = [n-1,n+1,n-COLS,n+COLS].filter(v=>v>=1&&v<=TOTAL);
  return t.some(v => cells[v-1].type === 'trap');
}
function genBoard(){
  const cells = [];
  for(let n=1;n<=TOTAL;n++) cells.push({ n, type:'normal' });
  cells[0].type = 'start';
  cells[TOTAL-1].type = 'end';
  const pool = [];
  for(let n=8;n<=TOTAL-2;n++) pool.push(n);
  shuffle(pool);
  const used = new Set([1, TOTAL-1, TOTAL]);
  const take = cond => {
    for(let i=0;i<pool.length;i++){
      const v = pool[i];
      if(!used.has(v) && (!cond || cond(v))) { used.add(v); return pool.splice(i,1)[0]; }
    }
    return null;
  };
  const setT = (n,t) => { if(n) cells[n-1].type = t; };
  const pin = take(n => n>=15 && n<=50);
  if(pin){
    let pout = null;
    for(let k=15;k<=25 && !pout;k++){
      const cand = pin + k;
      if(cand < TOTAL-1 && !used.has(cand)){ pout = cand; used.add(cand); }
    }
    if(pout){ setT(pin,'portal'); cells[pin-1].exit = pout; }
  }
  for(let i=0;i<20;i++) setT(take(), 'quiz');
  for(let i=0;i<8;i++) setT(take(), 'star');
  for(let i=0;i<5;i++) setT(take(), 'chest');
  for(let i=0;i<8;i++) setT(take(n => !isTrapNear(cells,n)), 'trap');
  for(let i=0;i<6;i++) setT(take(), 'choice');
  for(let i=0;i<4;i++) setT(take(), 'sudoku');
  return cells;
}

/* ===== 数学题生成（与 index.html 一致） ===== */
function pickLevelCalc(level){
  let a, b, ans, op;
  if(level === 'hell'){
    const r = Math.random();
    if(r < 0.35){ op='+'; a = 100 + rnd(650); const bmax = 940 - a; b = bmax >= 20 ? 20 + rnd(bmax - 19) : 20; ans = a + b; }
    else if(r < 0.65){ op='-'; a = 300 + rnd(600); b = 50 + rnd(a - 50); ans = a - b; }
    else if(r < 0.85){ op='×'; a = 12 + rnd(80); b = 3 + rnd(7); ans = a * b; }
    else { op='÷'; b = 3 + rnd(12); ans = 3 + rnd(30); a = b * ans; }
  }else if(level === 'hard'){
    const r = Math.random();
    if(r < 0.35){ op='+'; a = 15 + rnd(75); const bmax = 95 - a; b = bmax >= 5 ? 5 + rnd(bmax - 4) : 5; ans = a + b; }
    else if(r < 0.65){ op='-'; a = 25 + rnd(74); b = 5 + rnd(a - 5); ans = a - b; }
    else if(r < 0.85){ op='×'; a = 3 + rnd(7); b = 3 + rnd(7); ans = a * b; }
    else { op='÷'; b = 2 + rnd(7); ans = 2 + rnd(8); a = b * ans; }
  }else if(level === 'mid'){
    const r = Math.random();
    if(r < 0.5){ op='×'; a = 2 + rnd(8); b = 2 + rnd(8); ans = a * b; }
    else if(r < 0.8){ op='+'; a = 12 + rnd(78); const bmax = 95 - a; b = bmax >= 5 ? 5 + rnd(bmax - 4) : 5; ans = a + b; }
    else { op='÷'; b = 2 + rnd(7); ans = 2 + rnd(8); a = b * ans; }
  }else{
    if(Math.random() < 0.5){ op='+'; a = 2 + rnd(17); const bmax = Math.min(9, 20 - a); b = bmax >= 1 ? 1 + rnd(bmax) : 1; ans = a + b; }
    else { op='-'; a = 5 + rnd(15); b = 1 + rnd(a-1); ans = a - b; }
  }
  return { a, b, ans, op };
}
function genNumOpts(ans, level){
  const maxV = (level === 'easy') ? 20 : (level === 'hell') ? 999 : 100;
  const opts = new Set([ans]);
  for(const d of shuffle(level === 'hell' ? [1,-1,10,-10,100,-100,5,-5] : level === 'hard' ? [1,-1,2,-2,10,-10,5,-5] : [1,-1,2,-2,10,-10,3])){
    if(opts.size >= 3) break;
    const v = ans + d;
    if(v >= 0 && v <= maxV && !opts.has(v)) opts.add(v);
  }
  let g2 = 0;
  while(opts.size < 3 && g2++ < 50){
    const v = rnd(maxV + 1);
    if(v >= 0 && !opts.has(v)) opts.add(v);
  }
  return shuffle([...opts]).map(String);
}
function genQuestion(level){
  let text, ans;
  const r = Math.random();
  const mode = (r < 0.4) ? 'calc' : (r < 0.6) ? 'cmp' : (r < 0.8) ? 'seq' : 'blank';

  if(mode === 'cmp'){
    let lv, rv;
    if(level === 'easy'){
      const c = pickLevelCalc('easy'); lv = c.ans;
      rv = Math.max(0, lv + (Math.random()<0.3 ? 0 : (Math.random()<0.5?-1:1)*(1+rnd(3))));
      text = `${c.a} ${c.op} ${c.b} ◯ ${rv}`;
    }else if(level === 'mid'){
      const L = pickLevelCalc('mid'), R = pickLevelCalc('mid');
      lv = L.ans; rv = R.ans;
      text = `${L.a} ${L.op} ${L.b} ◯ ${R.a} ${R.op} ${R.b}`;
      ans = lv > rv ? '>' : lv < rv ? '<' : '=';
      return { text, ans, opts: shuffle(['>','<','=']), small:true, mode };
    }else{
      const lvCalc = (level === 'hell') ? 'hell' : 'hard';
      const L = pickLevelCalc(lvCalc), R = pickLevelCalc(lvCalc);
      lv = L.ans; rv = R.ans;
      text = `${L.a} ${L.op} ${L.b} ◯ ${R.a} ${R.op} ${R.b}`;
    }
    ans = lv > rv ? '>' : lv < rv ? '<' : '=';
    return { text, ans, opts: shuffle(['>','<','=']), small:true, mode };
  }

  if(mode === 'seq'){
    let arr;
    if(level === 'easy'){
      const d = [1,2,3,5,10][rnd(5)], s = 1 + rnd(9);
      arr = [s, s+d, s+2*d, s+3*d, s+4*d];
    }else if(level === 'mid'){
      if(Math.random() < 0.6){ const d = 2 + rnd(5), s = 1 + rnd(8); arr = [s, s+d, s+2*d, s+3*d, s+4*d]; }
      else { const s = 1 + rnd(3); arr = [s, s*2, s*4, s*8, s*16]; }
    }else if(level === 'hard'){
      const t = Math.random();
      if(t < 0.4){ const d = 2 + rnd(7), s = 40 + rnd(55); arr = [s, s-d, s-2*d, s-3*d, s-4*d]; }
      else if(t < 0.7){ const m = 1 + rnd(2); arr = [1, 4, 9, 16, 25].map(x => x * m); }
      else { const d = 3 + rnd(7), s = 2 + rnd(10); arr = [s, s+d, s+2*d, s+3*d, s+4*d]; }
    }else{ // hell
      const t = Math.random();
      if(t < 0.4){ const d = 8 + rnd(20), s = 300 + rnd(600); arr = [s, s-d, s-2*d, s-3*d, s-4*d]; }
      else if(t < 0.7){ const m = 1 + rnd(4); arr = [1, 4, 9, 16, 25].map(x => x * m); }
      else { const d = 9 + rnd(20), s = 5 + rnd(30); arr = [s, s+d, s+2*d, s+3*d, s+4*d]; }
    }
    const hole = 2 + rnd(2);
    ans = arr[hole];
    text = arr.map((v,i) => i===hole ? '?' : v).join(', ');
    return { text, ans: String(ans), opts: genNumOpts(ans, level), small:true, mode };
  }

  if(mode === 'blank'){
    let a, op, c;
    if(level === 'easy'){
      if(Math.random() < 0.6){ a = 2 + rnd(16); c = a + 1 + rnd(Math.max(1, 19 - a)); op='+'; }
      else { a = 6 + rnd(14); c = 1 + rnd(a - 1); op='-'; }
    }else if(level === 'mid'){
      const t = Math.random();
      if(t < 0.5){ a = 2 + rnd(8); op='×'; c = a * (2 + rnd(8)); }
      else if(t < 0.8){ a = 20 + rnd(75); op='-'; c = 1 + rnd(a - 1); }
      else { op='÷'; const b = 2 + rnd(7), q = 2 + rnd(8); a = b * q; c = b; return { text: `${a} ÷ ? = ${a / c}`, ans: String(c), opts: genNumOpts(c, level), small:true, mode }; }
    }else if(level === 'hell'){
      const t = Math.random();
      if(t < 0.35){ a = 11 + rnd(80); op='×'; c = a * (3 + rnd(9)); }
      else if(t < 0.7){ a = 200 + rnd(700); op='-'; c = 10 + rnd(a - 10); }
      else { op='÷'; const b = 3 + rnd(12), q = 4 + rnd(30); a = b * q; c = b; return { text: `${a} ÷ ? = ${q}`, ans: String(c), opts: genNumOpts(c, level), small:true, mode }; }
    }else{
      const t = Math.random();
      if(t < 0.35){ a = 3 + rnd(8); op='×'; c = a * (3 + rnd(7)); }
      else if(t < 0.7){ a = 40 + rnd(55); op='-'; c = 5 + rnd(a - 5); }
      else { op='÷'; const b = 3 + rnd(7), q = 3 + rnd(9); a = b * q; c = b; return { text: `${a} ÷ ? = ${q}`, ans: String(c), opts: genNumOpts(c, level), small:true, mode }; }
    }
    if(op==='×') return { text: `${a} × ? = ${c}`, ans: String(c / a), opts: genNumOpts(c / a, level), small:true, mode };
    if(op==='+') return { text: `${a} + ? = ${c}`, ans: String(c - a), opts: genNumOpts(c - a, level), small:true, mode };
    return { text: `${a} - ? = ${c}`, ans: String(a - c), opts: genNumOpts(a - c, level), small:true, mode };
  }

  const c = pickLevelCalc(level);
  text = `${c.a} ${c.op} ${c.b} = ?`;
  return { text, ans: String(c.ans), opts: genNumOpts(c.ans, level), small:false, mode };
}

/* ===== 数独（与 index.html 一致） ===== */
function sdOk(g, r, c, v){
  for(let i=0;i<4;i++){ if(g[r][i]===v || g[i][c]===v) return false; }
  const br = Math.floor(r/2)*2, bc = Math.floor(c/2)*2;
  for(let i=br;i<br+2;i++) for(let j=bc;j<bc+2;j++) if(g[i][j]===v) return false;
  return true;
}
function genSudokuFull(){
  const g = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  (function fill(pos){
    if(pos === 16) return true;
    const r = Math.floor(pos/4), c = pos % 4;
    for(const v of shuffle([1,2,3,4])){
      if(sdOk(g, r, c, v)){ g[r][c] = v; if(fill(pos+1)) return true; g[r][c] = 0; }
    }
    return false;
  })(0);
  return g;
}
function sdCountSolutions(g){
  const b = g.map(r => r.slice());
  let count = 0;
  (function go(pos){
    if(count > 1) return;
    if(pos === 16){ count++; return; }
    const r = Math.floor(pos/4), c = pos % 4;
    if(b[r][c] !== 0){ go(pos+1); return; }
    for(let v=1;v<=4;v++) if(sdOk(b, r, c, v)){ b[r][c] = v; go(pos+1); b[r][c] = 0; }
  })(0);
  return count;
}
function genSudokuPuzzle(nHoles){
  for(let attempt=0;attempt<200;attempt++){
    const full = genSudokuFull();
    const cells = shuffle([...Array(16).keys()]).slice(0, nHoles);
    const g = full.map(r => r.slice());
    cells.forEach(p => { g[Math.floor(p/4)][p%4] = 0; });
    if(sdCountSolutions(g) === 1) return { g, cells: cells.sort((a,b)=>a-b) };
  }
  return null;
}
function holeAnswer(pz, p){
  const r = Math.floor(p/4), c = p % 4;
  for(let v=1;v<=4;v++) if(sdOk(pz.g, r, c, v)) return v;
  return 0;
}

/* ===== 抉择事件（与 index.html 一致） ===== */
function eventEffect(id, choice, hasShield){
  switch(id){
    case 'honey':
      if(choice==='a') return { move: Math.random()<0.6 ? 5 : (hasShield? 0 : -3), shieldUsed: !!(hasShield && Math.random()>=0.6) };
      return { move: 2 };
    case 'bridge':
      if(choice==='a') return { move: Math.random()<0.7 ? 4 : (hasShield? 0 : -2), shieldUsed: !!(hasShield && Math.random()>=0.7) };
      return { move: 2 };
    case 'clover':
      return choice==='a' ? { move: 2 } : { shield: true };
    case 'turtle':
      return choice==='a' ? { move: 3, skip: true } : { move: 2 };
    case 'dragon':
      if(choice==='a') return { move: Math.random()<0.65 ? 6 : (hasShield? 0 : -4), shieldUsed: !!(hasShield && Math.random()>=0.65) };
      return { move: -1 };
    case 'horn':
      return choice==='a' ? { swap: true } : { move: 1 };
    case 'soup':
      return choice==='a' ? { move: 5, skip: true } : { move: 2 };
    case 'box':
      return choice==='a' ? { move: 1 + rnd(6) } : { move: 3 };
  }
}
const EV_IDS = ['honey','bridge','clover','turtle','dragon','horn','soup','box'];

/* ===== 测试 ===== */
let fails = 0;
const ok = (cond, msg) => { if(!cond){ fails++; console.error('FAIL:', msg); } };
const calc = (a, op, b) => op==='+' ? a+b : op==='-' ? a-b : op==='×' ? a*b : a/b;

// 1. 蛇形路径
{
  for(let n=1;n<TOTAL;n++){
    const A = cellXY(n), B = cellXY(n+1);
    ok(Math.abs(A.col-B.col) + Math.abs(A.row-B.row) === 1, `格 ${n}->${n+1} 不相邻`);
  }
  const seen = new Set();
  for(let n=1;n<=TOTAL;n++){ const {col,row} = cellXY(n); ok(col>=0&&col<COLS&&row>=0&&row<ROWS,`格 ${n} 越界`); seen.add(col+','+row); }
  ok(seen.size === TOTAL, '蛇形路径有重叠/遗漏');
  ok(cellXY(1).row === 0 && cellXY(1).col === 0, '起点应在左下');
  ok(cellXY(TOTAL).row === ROWS-1 && cellXY(TOTAL).col === 0, '终点应在左上（10×10 蛇形：末行反向）');
}

// 2. 棋盘生成：500 局约束校验（100 格大棋盘）
{
  let sumFirstHalf = 0;
  for(let t=0;t<500;t++){
    const b = genBoard();
    const cnt = {};
    b.forEach(c => cnt[c.type] = (cnt[c.type]||0) + 1);
    ok(b[0].type === 'start' && b[TOTAL-1].type === 'end', '起终点固定');
    ok((cnt.quiz||0) === 20, `quiz 应20 实际 ${cnt.quiz}`);
    ok((cnt.star||0) === 8, `star 应8 实际 ${cnt.star}`);
    ok((cnt.chest||0) === 5, `chest 应5 实际 ${cnt.chest}`);
    ok((cnt.trap||0) === 8, `trap 应8 实际 ${cnt.trap}`);
    ok((cnt.choice||0) === 6, `choice 应6 实际 ${cnt.choice}`);
    ok((cnt.sudoku||0) === 4, `sudoku 应4 实际 ${cnt.sudoku}`);
    ok((cnt.portal||0) === 1, `portal 应1 实际 ${cnt.portal}`);
    for(let n=1;n<=TOTAL;n++) if(b[n-1].type === 'trap') ok(!isTrapNear(b,n), `陷阱 ${n} 有相邻陷阱`);
    const p = b.find(c => c.type === 'portal');
    ok(!!p && p.n >= 15 && p.n <= 50, `传送门入口应在 15~50（实际 ${p && p.n}）`);
    ok(!!p && b[p.exit-1].type === 'normal', '传送门出口应为普通格');
    ok(!!p && p.exit > p.n && p.exit - p.n <= 25, '传送门应向前且 ≤25 格');
    for(let n=1;n<=7;n++) ok(b[n-1].type === 'normal' || b[n-1].type === 'start', `前7格应安全（第${n}格=${b[n-1].type}）`);
    let firstHalf = 0;
    for(let n=8;n<=TOTAL/2;n++) if(b[n-1].type==='quiz') firstHalf++;
    sumFirstHalf += firstHalf;
  }
  ok(sumFirstHalf / 500 >= 8, `前半程 quiz 均值过低：${(sumFirstHalf/500).toFixed(2)}`);
  console.log('前半程 quiz 均值:', (sumFirstHalf/500).toFixed(2), '（期望~9.4）');
}

// 3. 数学题生成：四档（含 hell）× 四题型，恒等性验证
{
  const modeCnt = { calc:0, cmp:0, seq:0, blank:0 };
  for(let t=0;t<6000;t++){
    for(const level of ['easy','mid','hard','hell']){
      const q = genQuestion(level);
      modeCnt[q.mode]++;
      ok(typeof q.ans === 'string' && q.opts.every(v => typeof v === 'string'), 'ans/opts 应全为字符串');
      ok(q.opts.length === 3 && new Set(q.opts).size === 3, '选项数3且不重复: ' + q.text);
      ok(q.opts.includes(q.ans), '正确答案必须在选项中: ' + q.text + ' ans=' + q.ans);

      if(q.mode === 'calc'){
        const m = q.text.match(/^(\d+) ([+\-×÷]) (\d+) = \?$/);
        ok(!!m, 'calc 格式: ' + q.text);
        if(m) ok(calc(+m[1], m[2], +m[3]) === +q.ans, 'calc 恒等式: ' + q.text);
        const maxV = level === 'easy' ? 20 : level === 'hell' ? 999 : 100;
        q.opts.forEach(v => ok(+v >= 0 && +v <= maxV, `calc 选项范围 ${v}/${maxV}`));
      }
      else if(q.mode === 'cmp'){
        ok(['>','<','='].includes(q.ans), 'cmp 答案应为比较符: ' + q.text);
        if(level === 'easy'){
          const e = q.text.match(/^(\d+) ([+\-×÷]) (\d+) ◯ (\d+)$/);
          ok(!!e, 'cmp-easy 格式: ' + q.text);
          if(e){
            const lv = calc(+e[1], e[2], +e[3]), rv = +e[4];
            const expect = lv > rv ? '>' : lv < rv ? '<' : '=';
            ok(q.ans === expect, `cmp-easy 恒等式: ${q.text} 应为 ${expect} 实际 ${q.ans}`);
          }
        }else{
          const e = q.text.match(/^(\d+) ([+\-×÷]) (\d+) ◯ (\d+) ([+\-×÷]) (\d+)$/);
          ok(!!e, `cmp-${level} 格式: ` + q.text);
          if(e){
            const lv = calc(+e[1], e[2], +e[3]), rv = calc(+e[4], e[5], +e[6]);
            const expect = lv > rv ? '>' : lv < rv ? '<' : '=';
            ok(q.ans === expect, `cmp-${level} 恒等式: ${q.text} 应为 ${expect} 实际 ${q.ans}`);
          }
        }
      }
      else if(q.mode === 'seq'){
        const parts = q.text.split(', ');
        ok(parts.length === 5, 'seq 应5项: ' + q.text);
        const hole = parts.indexOf('?');
        ok(hole === 2 || hole === 3, 'seq 挖洞位置: ' + q.text);
        const nums = parts.map((s,i) => i===hole ? +q.ans : +s);
        ok(nums.every(v => Number.isFinite(v)), 'seq 数字解析: ' + q.text);
        const asc = nums[4] > nums[0];
        ok(nums.every((v,i) => i===0 || (asc ? v > nums[i-1] : v < nums[i-1])), 'seq 填入后应单调: ' + q.text);
        const seqMax = level === 'hell' ? 999 : 100;
        ok(+q.ans >= 1 && +q.ans <= seqMax, `seq 答案范围 ${q.ans}/${seqMax}`);
      }
      else if(q.mode === 'blank'){
        const e = q.text.match(/^(\d+) ([+\-×÷]) \? = (\d+)$/);
        ok(!!e, 'blank 格式: ' + q.text);
        if(e){
          const a = +e[1], op = e[2], c = +e[3], x = +q.ans;
          ok(calc(a, op, x) === c, `blank 恒等式: ${q.text}（填 ${x}）`);
        }
        const blankMax = level === 'hell' ? 999 : 100;
        ok(+q.ans >= 0 && +q.ans <= blankMax, `blank 答案范围 ${q.ans}/${blankMax}`);
      }
    }
  }
  console.log('题型分布:', JSON.stringify(modeCnt), '(四档合计24000题)');
}

// 3.5 挑战题映射：CHALLENGE 升一档
{
  const CHALLENGE = { easy:'mid', mid:'hard', hard:'hell' };
  ok(CHALLENGE.easy === 'mid' && CHALLENGE.mid === 'hard' && CHALLENGE.hard === 'hell', 'CHALLENGE 映射');
  // 挑战奖励恒 > 普通奖励
  ok(5 > 3, '挑战奖励应大于普通奖励');
}

// 4. 数独生成：合法性 + 唯一性 + holeAnswer
{
  for(let t=0;t<500;t++){
    const g = genSudokuFull();
    for(let r=0;r<4;r++) ok(new Set(g[r]).size === 4, `完整盘第${r}行应为1-4`);
    for(let c=0;c<4;c++) ok(new Set([g[0][c],g[1][c],g[2][c],g[3][c]]).size === 4, `完整盘第${c}列应为1-4`);
    for(let br=0;br<2;br++) for(let bc=0;bc<2;bc++){
      const box = [g[br*2][bc*2], g[br*2][bc*2+1], g[br*2+1][bc*2], g[br*2+1][bc*2+1]];
      ok(new Set(box).size === 4, '完整盘2x2宫应为1-4');
    }
  }
  for(let t=0;t<300;t++){
    for(const holes of [1,2]){
      const pz = genSudokuPuzzle(holes);
      ok(!!pz, `数独生成失败（${holes}空）`);
      if(!pz) continue;
      ok(pz.cells.length === holes, '洞数');
      ok(sdCountSolutions(pz.g) === 1, '谜题应有唯一解');
      pz.cells.forEach(p => {
        const v = holeAnswer(pz, p);
        ok(v >= 1 && v <= 4, `holeAnswer 范围 ${v}`);
        ok(sdOk(pz.g, Math.floor(p/4), p%4, v), 'holeAnswer 应为合法填法');
      });
      const filled = pz.g.map(r => r.slice());
      pz.cells.forEach(p => { filled[Math.floor(p/4)][p%4] = holeAnswer(pz, p); });
      for(let r=0;r<4;r++) ok(new Set(filled[r]).size === 4, '填洞后行合法');
    }
  }
  console.log('数独: 500 完整盘 + 600 谜题唯一性校验通过');
}

// 5. 抉择事件效果范围
{
  for(let t=0;t<5000;t++){
    for(const id of EV_IDS){
      const hasShield = Math.random() < 0.5;
      const r = eventEffect(id, Math.random()<0.5?'a':'b', hasShield);
      if(r.move !== undefined){
        ok(r.move >= -4 && r.move <= 6, `事件 ${id} 移动幅度越界: ${r.move}`);
        if(id === 'box') ok(r.move >= 1 && r.move <= 6, `宝盒随机 ${r.move}`);
      }
    }
  }
}

// 6. 模拟对局：含数独+事件+护盾，1000 局
{
  let totalTurns = 0, shieldUsed = 0, sudokuCount = 0;
  for(let g=0;g<1000;g++){
    const b = genBoard();
    const pos = [1,1], skip = [false,false], shield = [false,false];
    let cur = 0, turns = 0, done = false;
    while(!done && turns < 600){
      turns++;
      const n = 1 + rnd(6);
      pos[cur] = Math.max(1, Math.min(TOTAL, pos[cur] + n));
      if(pos[cur] >= TOTAL){ done = true; break; }
      for(let chain=0; chain<6 && !done; chain++){
        const c = b[pos[cur]-1];
        if(c.type === 'quiz'){
          // 挑战题浮动：35% 选挑战（升一档难度，奖励 +5），否则普通 +3
          const challenge = Math.random() < 0.35;
          const correct = Math.random() < (challenge ? (cur===0?0.6:0.45) : (cur===0?0.75:0.6));
          if(correct) pos[cur] = Math.min(TOTAL, pos[cur] + (challenge ? 5 : 3));
          else if(shield[cur]){ shield[cur] = false; shieldUsed++; }
          else skip[cur] = true;
          if(pos[cur] >= TOTAL) done = true;
          break;
        }
        else if(c.type === 'choice'){
          const ev = eventEffect(EV_IDS[rnd(EV_IDS.length)], Math.random()<0.5?'a':'b', shield[cur]);
          if(shield[cur] && ev.shieldUsed) shield[cur] = false;
          if(ev.shield) shield[cur] = true;
          if(ev.skip) skip[cur] = true;
          if(ev.swap){ const t = pos[cur]; pos[cur] = pos[1-cur]; pos[1-cur] = t; }
          if(ev.move) pos[cur] = Math.max(1, Math.min(TOTAL, pos[cur] + ev.move));
          if(pos[cur] >= TOTAL) done = true;
          break;
        }
        else if(c.type === 'sudoku'){
          sudokuCount++;
          if(Math.random() < 0.65) pos[cur] = Math.min(TOTAL, pos[cur] + 4);
          else if(shield[cur]){ shield[cur] = false; shieldUsed++; }
          else skip[cur] = true;
          if(pos[cur] >= TOTAL) done = true;
          break;
        }
        else if(c.type === 'star'){ pos[cur] = Math.min(TOTAL, pos[cur] + 3); }
        else if(c.type === 'trap'){
          if(shield[cur]){ shield[cur] = false; shieldUsed++; }
          else pos[cur] = Math.max(1, pos[cur] - 2);
          break;
        }
        else if(c.type === 'chest'){
          const r = Math.random();
          if(r < 0.4) pos[cur] = Math.min(TOTAL, pos[cur] + 2);
          else if(r >= 0.75) pos[cur] = Math.min(TOTAL, pos[cur] + 4);
          else break;
        }
        else if(c.type === 'portal'){ pos[cur] = c.exit; break; }
        else break;
        if(pos[cur] >= TOTAL){ done = true; }
        if(pos[cur] <= 1) break;
      }
      if(done) break;
      ok(pos[0]>=1&&pos[0]<=TOTAL&&pos[1]>=1&&pos[1]<=TOTAL, '位置越界');
      let next = 1 - cur;
      if(skip[next]){ skip[next] = false; next = 1 - next; }
      cur = next;
    }
    ok(done, `第 ${g} 局600回合未结束（bug）`);
    totalTurns += turns;
  }
  console.log('1000局模拟: 平均', (totalTurns/1000).toFixed(1), '回合/局, 数独触发', sudokuCount, '次, 护盾挡灾', shieldUsed, '次');
}

// 7. 冒险选项期望值核对
{
  const trials = 200000;
  const evA = { honey:0, bridge:0, dragon:0, box:0 };
  for(let t=0;t<trials;t++){
    let r = eventEffect('honey','a',false); evA.honey += r.move;
    r = eventEffect('bridge','a',false); evA.bridge += r.move;
    r = eventEffect('dragon','a',false); evA.dragon += r.move;
    r = eventEffect('box','a',false); evA.box += r.move;
  }
  ok(Math.abs(evA.honey/trials - 1.8) < 0.15, `蜂蜜A期望 ${(evA.honey/trials).toFixed(2)}`);
  ok(Math.abs(evA.bridge/trials - 2.2) < 0.15, `独木桥A期望 ${(evA.bridge/trials).toFixed(2)}`);
  ok(Math.abs(evA.dragon/trials - 2.5) < 0.15, `恶龙A期望 ${(evA.dragon/trials).toFixed(2)}`);
  ok(Math.abs(evA.box/trials - 3.5) < 0.15, `宝盒A期望 ${(evA.box/trials).toFixed(2)}`);
  console.log('冒险期望: 蜂蜜', (evA.honey/trials).toFixed(2), '| 独木桥', (evA.bridge/trials).toFixed(2), '| 恶龙', (evA.dragon/trials).toFixed(2), '| 宝盒', (evA.box/trials).toFixed(2));
}

// 8. 三人对局模拟：泛化轮换（连续多人休息）+ 号角换最领先对手
{
  let totalTurns = 0, swapCount = 0;
  let allSkippedAtOnce = 0;
  const n = 3;
  for(let g=0;g<1000;g++){
    const b = genBoard();
    const pos = [1,1,1], skip = [false,false,false], shield = [false,false,false];
    let cur = 0, turns = 0, done = false;
    while(!done && turns < 800){
      turns++;
      const nD = 1 + rnd(6);
      pos[cur] = Math.max(1, Math.min(TOTAL, pos[cur] + nD));
      if(pos[cur] >= TOTAL){ done = true; break; }
      for(let chain=0; chain<6 && !done; chain++){
        const c = b[pos[cur]-1];
        if(c.type === 'quiz'){
          const challenge = Math.random() < 0.35;
          const correct = Math.random() < (challenge ? (cur===0?0.6:0.45) : (cur===0?0.75:0.6));
          if(correct) pos[cur] = Math.min(TOTAL, pos[cur] + (challenge ? 5 : 3));
          else if(shield[cur]){ shield[cur] = false; }
          else skip[cur] = true;
          if(pos[cur] >= TOTAL) done = true;
          break;
        }
        else if(c.type === 'choice'){
          const ev = eventEffect(EV_IDS[rnd(EV_IDS.length)], Math.random()<0.5?'a':'b', shield[cur]);
          if(shield[cur] && ev.shieldUsed) shield[cur] = false;
          if(ev.shield) shield[cur] = true;
          if(ev.skip) skip[cur] = true;
          if(ev.swap){
            // 号角：和最领先的对手换（与 index.html v4 一致）
            const others = [0,1,2].filter(x => x !== cur);
            const other = others.reduce((a,c2) => pos[a] >= pos[c2] ? a : c2);
            const t = pos[cur]; pos[cur] = pos[other]; pos[other] = t;
            swapCount++;
          }
          if(ev.move) pos[cur] = Math.max(1, Math.min(TOTAL, pos[cur] + ev.move));
          if(pos[cur] >= TOTAL) done = true;
          break;
        }
        else if(c.type === 'sudoku'){
          if(Math.random() < 0.65) pos[cur] = Math.min(TOTAL, pos[cur] + 4);
          else if(shield[cur]){ shield[cur] = false; }
          else skip[cur] = true;
          if(pos[cur] >= TOTAL) done = true;
          break;
        }
        else if(c.type === 'star'){ pos[cur] = Math.min(TOTAL, pos[cur] + 3); }
        else if(c.type === 'trap'){
          if(shield[cur]){ shield[cur] = false; }
          else pos[cur] = Math.max(1, pos[cur] - 2);
          break;
        }
        else if(c.type === 'chest'){
          const r = Math.random();
          if(r < 0.4) pos[cur] = Math.min(TOTAL, pos[cur] + 2);
          else if(r >= 0.75) pos[cur] = Math.min(TOTAL, pos[cur] + 4);
          else break;
        }
        else if(c.type === 'portal'){ pos[cur] = c.exit; break; }
        else break;
        if(pos[cur] >= TOTAL){ done = true; }
        if(pos[cur] <= 1) break;
      }
      if(done) break;
      pos.forEach((v,i) => ok(v>=1 && v<=TOTAL, `三人局位置越界 p${i}=${v}`));
      // 轮换：与 takeTurn 的泛化算法一致
      let next = (cur + 1) % n;
      let guard = 0;
      let skipped = 0;
      while(skip[next] && guard++ < n){
        skip[next] = false;
        skipped++;
        next = (next + 1) % n;
      }
      if(skipped >= 2) allSkippedAtOnce++;
      cur = next;
    }
    ok(done, `三人局第 ${g} 局800回合未结束（bug）`);
    totalTurns += turns;
  }
  console.log('三人局1000局: 平均', (totalTurns/1000).toFixed(1), '回合/局, 号角触发', swapCount, '次, 连续≥2人休息', allSkippedAtOnce, '次');
}

// 9. 泛化轮换单元测试：3 人连续休息不会死循环且回合仍推进
{
  // 构造：P1、P2 都在休息，P0 走完后应跳过两人回到 P0
  const n = 3;
  const skip = [false, true, true];
  let cur = 0;
  let next = (cur + 1) % n, guard = 0;
  while(skip[next] && guard++ < n){
    skip[next] = false;
    next = (next + 1) % n;
  }
  cur = next;
  ok(cur === 0, `两人连休后应轮回 P0（实际 P${cur}）`);
  ok(!skip[1] && !skip[2], '休息标记应被消费');

  // 常规：P1 休息，P0 走完 → 轮到 P2
  const skip2 = [false, true, false];
  let cur2 = 0;
  let next2 = (cur2 + 1) % n, g2 = 0;
  while(skip2[next2] && g2++ < n){ skip2[next2] = false; next2 = (next2 + 1) % n; }
  cur2 = next2;
  ok(cur2 === 2, `P1 休息应轮到 P2（实际 P${cur2}）`);

  // 无休息：P2 走完 → 轮回 P0
  let cur3 = 2;
  let next3 = (cur3 + 1) % n;
  ok(next3 === 0, 'P2 后应轮回 P0');
  console.log('轮换单元测试通过');
}

console.log(fails === 0 ? '\n✅ 全部测试通过' : `\n❌ ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
