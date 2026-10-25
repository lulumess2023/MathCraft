/* 额外挑战：数学 / 数独 / 填字 / 五子棋
   挖符文石时随机抽一种；机关迷宫是其中一种（已有的） */
var Challenges = {
  active: null,       // { type, data, result, returnInfo }
  pool: ['maze', 'math', 'sudoku', 'wordfill', 'gomoku'],

  start: function (player) {
    var types = ['math', 'sudoku', 'wordfill', 'gomoku'];
    if (!Game.solo) types.push('maze');
    var type = types[Math.floor(Math.random() * types.length)];
    var data = this.generate(type);
    this.active = {
      type: type, data: data, result: null,
      returnInfo: { layer: Game.layer, px: player.x, py: player.y, p2x: Game.players[1].x, p2y: Game.players[1].y }
    };
    Game.say('掉进了挑战：' + this.title(type));
  },

  title: function (type) {
    return ({ maze: '机关迷宫', math: '算术挑战', sudoku: '迷你数独', wordfill: '填字挑战', gomoku: '五子棋' })[type] || '挑战';
  },

  generate: function (type) {
    if (type === 'math') return this.genMath();
    if (type === 'sudoku') return this.genSudoku();
    if (type === 'wordfill') return this.genWordfill();
    return null;   // gomoku 用状态机
  },

  /* ---------- 算术 ---------- */
  genMath: function () {
    var ops = ['+', '-', '×'];
    var op = ops[Math.floor(Math.random() * ops.length)];
    var a, b, ans;
    if (op === '+') { a = 5 + Math.floor(Math.random() * 40); b = 5 + Math.floor(Math.random() * 40); ans = a + b; }
    else if (op === '-') { a = 20 + Math.floor(Math.random() * 60); b = 5 + Math.floor(Math.random() * (a - 5)); ans = a - b; }
    else { a = 2 + Math.floor(Math.random() * 8); b = 2 + Math.floor(Math.random() * 8); ans = a * b; }
    /* 4 个选项 */
    var opts = [ans];
    while (opts.length < 4) {
      var off = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 9));
      var v = ans + off;
      if (v >= 0 && opts.indexOf(v) < 0) opts.push(v);
    }
    /* 打乱 */
    for (var i = opts.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
    return { q: a + ' ' + op + ' ' + b + ' = ?', opts: opts, ans: ans, picked: -1 };
  },

  /* ---------- 迷你数独（4x4，每行每列每宫 1-4 不重复） ---------- */
  genSudoku: function () {
    var g = this.solveSudoku(4);
    /* 随机挖 6 格 */
    var holes = [];
    for (var i = 0; i < 16; i++) holes.push(i);
    for (var k = holes.length - 1; k > 0; k--) { var j2 = Math.floor(Math.random() * (k + 1)); var t2 = holes[k]; holes[k] = holes[j2]; holes[j2] = t2; }
    holes = holes.slice(0, 6);
    var puzzle = [];
    for (var i2 = 0; i2 < 16; i2++) {
      if (holes.indexOf(i2) >= 0) puzzle.push({ given: false, val: 0, ans: g[i2] });
      else puzzle.push({ given: true, val: g[i2], ans: g[i2] });
    }
    return { n: 4, grid: puzzle, cursor: 0 };
  },

  solveSudoku: function (n) {
    var g = new Array(n * n);
    var self = this;
    function ok(idx, v) {
      var r = Math.floor(idx / n), c = idx % n;
      for (var i = 0; i < n; i++) if (g[r * n + i] === v || g[i * n + c] === v) return false;
      var br = Math.floor(Math.sqrt(n)), bc = Math.floor(n / Math.sqrt(n) + 0.5);
      var br0 = Math.floor(r / br) * br, bc0 = Math.floor(c / bc) * bc;
      for (var i2 = 0; i2 < br; i2++) for (var j = 0; j < bc; j++) if (g[(br0 + i2) * n + bc0 + j] === v) return false;
      return true;
    }
    function fill(idx) {
      if (idx >= n * n) return true;
      var nums = [];
      for (var v = 1; v <= n; v++) nums.push(v);
      for (var k = nums.length - 1; k > 0; k--) { var j3 = Math.floor(Math.random() * (k + 1)); var t3 = nums[k]; nums[k] = nums[j3]; nums[j3] = t3; }
      for (var i3 = 0; i3 < nums.length; i3++) {
        if (ok(idx, nums[i3])) { g[idx] = nums[i3]; if (fill(idx + 1)) return true; }
      }
      g[idx] = 0; return false;
    }
    fill(0);
    return g;
  },

  /* ---------- 填字挑战：给部首，填完整的字 ---------- */
  genWordfill: function () {
    var words = [
      { part: '氵', full: '水', opts: ['水', '木', '火', '土'] },
      { part: '木', full: '林', opts: ['林', '森', '材', '板'] },
      { part: '日', full: '明', opts: ['明', '星', '晶', '早'] },
      { part: '口', full: '品', opts: ['品', '唱', '叫', '叶'] },
      { part: '手', full: '拿', opts: ['拿', '拍', '打', '招'] },
      { part: '金', full: '钱', opts: ['钱', '银', '铁', '铜'] },
      { part: '火', full: '炎', opts: ['炎', '炉', '灿', '灯'] },
      { part: '心', full: '想', opts: ['想', '忘', '急', '息'] }
    ];
    var pick = words[Math.floor(Math.random() * words.length)];
    var opts = pick.opts.slice();
    for (var k = opts.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)); var t = opts[k]; opts[k] = opts[j]; opts[j] = t; }
    return { part: pick.part, full: pick.full, opts: opts, picked: -1 };
  },

  /* ---------- 检查是否答对 ---------- */
  check: function () {
    var a = this.active;
    if (!a) return false;
    if (a.type === 'math') return a.data.picked === a.data.ans;
    if (a.type === 'wordfill') return a.data.picked === a.data.full;
    if (a.type === 'sudoku') {
      for (var i = 0; i < a.data.grid.length; i++) if (a.data.grid[i].val !== a.data.grid[i].ans) return false;
      return true;
    }
    if (a.type === 'gomoku') return a.data.winner !== null;
    return false;
  },

  /* ---------- 更新与绘制 ---------- */
  update: function (dt) {
    if (!this.active) return;
    var a = this.active;
    if (a.type === 'math') this.updateMath();
    else if (a.type === 'wordfill') this.updateWordfill();
    else if (a.type === 'sudoku') this.updateSudoku();
    else if (a.type === 'gomoku') this.updateGomoku(dt);
    if (this.check()) {
      this.active.result = 'win';
    }
  },

  updateMath: function () {
    for (var i = 0; i < 4; i++) {
      if (Input.pressed('Digit' + (i + 1)) || Input.pressed('Numpad' + (i + 1))) this.active.data.picked = this.active.data.opts[i];
    }
    /* 手柄 A/B/X/Y 选 1-4 */
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var s = 0; s < pads.length && s < 1; s++) {
      var gp = pads[s]; if (!gp) continue;
      for (var b = 0; b < 4; b++) if (gp.buttons[b] && gp.buttons[b].pressed) this.active.data.picked = this.active.data.opts[b];
    }
    /* 鼠标点击 */
    if (Game.mouse.down && !Game._mouseConsumed) {
      var hit = this.mathHit(Game.mouse.x, Game.mouse.y);
      if (hit >= 0) { this.active.data.picked = this.active.data.opts[hit]; Game._mouseConsumed = true; }
    }
  },

  updateWordfill: function () {
    for (var i = 0; i < 4; i++) {
      if (Input.pressed('Digit' + (i + 1))) this.active.data.picked = this.active.data.opts[i];
    }
    if (Game.mouse.down && !Game._mouseConsumed) {
      var hit = this.wordHit(Game.mouse.x, Game.mouse.y);
      if (hit >= 0) { this.active.data.picked = this.active.data.opts[hit]; Game._mouseConsumed = true; }
    }
  },

  updateSudoku: function () {
    var d = this.active.data;
    if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) d.cursor = Math.max(0, d.cursor - 1);
    if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) d.cursor = Math.min(15, d.cursor + 1);
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) d.cursor = Math.max(0, d.cursor - 4);
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) d.cursor = Math.min(15, d.cursor + 4);
    for (var v = 1; v <= 4; v++) {
      if (Input.pressed('Digit' + v) || Input.pressed('Numpad' + v)) {
        if (!d.grid[d.cursor].given) d.grid[d.cursor].val = v;
      }
    }
    if (Input.pressed('Backspace') || Input.pressed('Delete')) {
      if (!d.grid[d.cursor].given) d.grid[d.cursor].val = 0;
    }
    if (Game.mouse.down && !Game._mouseConsumed) {
      var hit = this.sudokuHit(Game.mouse.x, Game.mouse.y);
      if (hit >= 0) { d.cursor = hit; Game._mouseConsumed = true; }
    }
  },

  /* ---------- 五子棋：玩家 vs AI ---------- */
  updateGomoku: function (dt) {
    var d = this.active.data;
    if (!d) {
      d = { board: [], size: 9, turn: 1, winner: null, lastMove: null, aiThink: 0, history: [] };
      for (var i = 0; i < 9 * 9; i++) d.board.push(0);
      this.active.data = d;
    }
    if (d.winner) return;
    if (d.turn === 2) {   /* AI 走棋 */
      d.aiThink += dt;
      if (d.aiThink > 0.8) {
        d.aiThink = 0;
        var mv = this.gomokuAI(d);
        if (mv) {
          d.board[mv] = 2; d.lastMove = mv; d.history.push(mv);
          if (this.gomokuWin(d.board, mv, 2)) d.winner = 2;
          else d.turn = 1;
        }
      }
      return;
    }
    /* 玩家走棋：点击或方向键 */
    if (d.cursor === undefined) d.cursor = 40;
    if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) d.cursor = Math.max(0, d.cursor - 1);
    if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) d.cursor = Math.min(80, d.cursor + 1);
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) d.cursor = Math.max(0, d.cursor - 9);
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) d.cursor = Math.min(80, d.cursor + 9);
    if ((Input.pressed('Space') || Input.pressed('Enter')) && d.board[d.cursor] === 0) {
      d.board[d.cursor] = 1; d.lastMove = d.cursor; d.history.push(d.cursor);
      if (this.gomokuWin(d.board, d.cursor, 1)) d.winner = 1;
      else d.turn = 2;
    }
    if (Game.mouse.down && !Game._mouseConsumed) {
      var hit = this.gomokuHit(Game.mouse.x, Game.mouse.y, d.size);
      if (hit >= 0 && d.board[hit] === 0) {
        d.board[hit] = 1; d.lastMove = hit; d.history.push(hit);
        if (this.gomokuWin(d.board, hit, 1)) d.winner = 1;
        else d.turn = 2;
        Game._mouseConsumed = true;
      }
    }
  },

  gomokuWin: function (board, pos, player) {
    var size = 9, r = Math.floor(pos / size), c = pos % size;
    var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (var d = 0; d < 4; d++) {
      var count = 1;
      for (var s = 1; s < 5; s++) {
        var nr = r + dirs[d][0] * s, nc = c + dirs[d][1] * s;
        if (nr < 0 || nc < 0 || nr >= size || nc >= size) break;
        if (board[nr * size + nc] !== player) break;
        count++;
      }
      for (var s2 = 1; s2 < 5; s2++) {
        var nr2 = r - dirs[d][0] * s2, nc2 = c - dirs[d][1] * s2;
        if (nr2 < 0 || nc2 < 0 || nr2 >= size || nc2 >= size) break;
        if (board[nr2 * size + nc2] !== player) break;
        count++;
      }
      if (count >= 5) return true;
    }
    return false;
  },

  gomokuAI: function (d) {
    var size = d.size, best = -1, bestScore = -1;
    for (var i = 0; i < size * size; i++) {
      if (d.board[i] !== 0) continue;
      var r = Math.floor(i / size), c = i % size;
      var near = false;
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
        if (d.board[nr * size + nc] !== 0) { near = true; break; }
      }
      if (!near) continue;
      var score = this.gomokuScore(d.board, i, 2) + this.gomokuScore(d.board, i, 1) * 0.8 + Math.random() * 2;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) {
      var center = Math.floor(size / 2) * size + Math.floor(size / 2);
      if (d.board[center] === 0) best = center;
      else { for (var j = 0; j < size * size; j++) if (d.board[j] === 0) { best = j; break; } }
    }
    return best;
  },

  gomokuScore: function (board, pos, player) {
    var size = 9, r = Math.floor(pos / size), c = pos % size;
    var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    var score = 0;
    for (var d = 0; d < 4; d++) {
      var line = 1;
      for (var s = 1; s < 5; s++) {
        var nr = r + dirs[d][0] * s, nc = c + dirs[d][1] * s;
        if (nr < 0 || nc < 0 || nr >= size || nc >= size) break;
        if (board[nr * size + nc] === player) line++;
        else break;
      }
      for (var s2 = 1; s2 < 5; s2++) {
        var nr2 = r - dirs[d][0] * s2, nc2 = c - dirs[d][1] * s2;
        if (nr2 < 0 || nc2 < 0 || nr2 >= size || nc2 >= size) break;
        if (board[nr2 * size + nc2] === player) line++;
        else break;
      }
      if (line >= 5) score += 10000;
      else if (line === 4) score += 1000;
      else if (line === 3) score += 100;
      else if (line === 2) score += 10;
    }
    return score;
  },

  /* ---------- 鼠标命中测试 ---------- */
  mathHit: function (mx, my) {
    var L = this.challengeLayout();
    for (var i = 0; i < 4; i++) {
      var col = i % 2, row = Math.floor(i / 2);
      var bx = L.x + 40 + col * 180, by = L.y + 120 + row * 70;
      if (mx >= bx && mx <= bx + 150 && my >= by && my <= by + 50) return i;
    }
    return -1;
  },
  wordHit: function (mx, my) { return this.mathHit(mx, my); },
  sudokuHit: function (mx, my) {
    var L = this.challengeLayout();
    var cs = 56, gx = L.x + (L.w - cs * 4) / 2, gy = L.y + 80;
    var col = Math.floor((mx - gx) / cs), row = Math.floor((my - gy) / cs);
    if (col < 0 || row < 0 || col >= 4 || row >= 4) return -1;
    return row * 4 + col;
  },
  gomokuHit: function (mx, my, size) {
    var L = this.challengeLayout();
    var cs = 36, gx = L.x + (L.w - cs * size) / 2, gy = L.y + 60;
    var col = Math.floor((mx - gx + cs / 2) / cs), row = Math.floor((my - gy + cs / 2) / cs);
    if (col < 0 || row < 0 || col >= size || row >= size) return -1;
    return row * size + col;
  },

  challengeLayout: function () { return { x: (Game.W - 480) / 2, y: (Game.H - 360) / 2, w: 480, h: 360 }; },

  /* ---------- 绘制 ---------- */
  draw: function (ctx) {
    if (!this.active) return;
    var a = this.active;
    var L = this.challengeLayout();
    ctx.fillStyle = 'rgba(8,16,28,.96)';
    rrect(ctx, L.x, L.y, L.w, L.h, 18); ctx.fill();
    ctx.strokeStyle = '#FBBF24'; ctx.lineWidth = 3;
    rrect(ctx, L.x, L.y, L.w, L.h, 18); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FBBF24'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText('📜 ' + this.title(a.type), L.x + 24, L.y + 38);

    if (a.type === 'math') this.drawMath(ctx, L);
    else if (a.type === 'wordfill') this.drawWordfill(ctx, L);
    else if (a.type === 'sudoku') this.drawSudoku(ctx, L);
    else if (a.type === 'gomoku') this.drawGomoku(ctx, L);

    /* 通关后显示按钮 */
    if (a.result === 'win') {
      ctx.fillStyle = 'rgba(8,16,28,.9)';
      rrect(ctx, L.x + L.w / 2 - 110, L.y + L.h - 80, 220, 56, 14); ctx.fill();
      ctx.fillStyle = '#86EFAC'; ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✅ 答对了！按空格继续', L.x + L.w / 2, L.y + L.h - 48);
      ctx.textAlign = 'left';
      if (Input.pressed('Space') || Input.pressed('Enter')) this.finish(true);
    }
  },

  drawMath: function (ctx, L) {
    var d = this.active.data;
    ctx.fillStyle = '#E8F1FF'; ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.q, L.x + L.w / 2, L.y + 90);
    for (var i = 0; i < 4; i++) {
      var col = i % 2, row = Math.floor(i / 2);
      var bx = L.x + 40 + col * 180, by = L.y + 120 + row * 70;
      var sel = d.picked === d.opts[i];
      var correct = d.opts[i] === d.ans;
      ctx.fillStyle = sel ? (correct ? '#86EFAC' : '#FCA5A5') : '#1C3348';
      rrect(ctx, bx, by, 150, 50, 12); ctx.fill();
      ctx.strokeStyle = sel ? '#FBBF24' : '#35618F'; ctx.lineWidth = 2;
      rrect(ctx, bx, by, 150, 50, 12); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif';
      ctx.fillText(String(d.opts[i]), bx + 75, by + 33);
      ctx.fillStyle = '#6E8CA8'; ctx.font = '12px sans-serif';
      ctx.fillText('按 ' + (i + 1) + ' 或点击', bx + 75, by + 47);
    }
    ctx.textAlign = 'left';
  },

  drawWordfill: function (ctx, L) {
    var d = this.active.data;
    ctx.fillStyle = '#9BB4D0'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('哪个字包含部首「' + d.part + '」？', L.x + L.w / 2, L.y + 70);
    ctx.fillStyle = '#FBBF24'; ctx.font = 'bold 40px sans-serif';
    ctx.fillText(d.part + ' + ? = ?', L.x + L.w / 2, L.y + 105);
    for (var i = 0; i < 4; i++) {
      var col = i % 2, row = Math.floor(i / 2);
      var bx = L.x + 40 + col * 180, by = L.y + 130 + row * 70;
      var sel = d.picked === d.opts[i];
      var correct = d.opts[i] === d.full;
      ctx.fillStyle = sel ? (correct ? '#86EFAC' : '#FCA5A5') : '#1C3348';
      rrect(ctx, bx, by, 150, 50, 12); ctx.fill();
      ctx.strokeStyle = sel ? '#FBBF24' : '#35618F'; ctx.lineWidth = 2;
      rrect(ctx, bx, by, 150, 50, 12); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
      ctx.fillText(d.opts[i], bx + 75, by + 34);
    }
    ctx.textAlign = 'left';
  },

  drawSudoku: function (ctx, L) {
    var d = this.active.data;
    var cs = 56, gx = L.x + (L.w - cs * 4) / 2, gy = L.y + 80;
    ctx.fillStyle = '#9BB4D0'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('填入 1-4，每行每列每宫不重复 · 方向键选格，1-4 填数', L.x + L.w / 2, L.y + 66);
    for (var i = 0; i < 16; i++) {
      var col = i % 4, row = Math.floor(i / 4);
      var x = gx + col * cs, y = gy + row * cs;
      var cell = d.grid[i];
      ctx.fillStyle = i === d.cursor ? '#2A3E22' : (cell.given ? '#1C3348' : '#16283F');
      ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
      ctx.strokeStyle = (col === 1 || col === 3) ? '#FBBF24' : '#35618F';
      ctx.lineWidth = (col % 2 === 1) ? 3 : 1;
      ctx.beginPath(); ctx.moveTo(x + cs, y); ctx.lineTo(x + cs, y + cs); ctx.stroke();
      ctx.strokeStyle = (row === 1 || row === 3) ? '#FBBF24' : '#35618F';
      ctx.lineWidth = (row % 2 === 1) ? 3 : 1;
      ctx.beginPath(); ctx.moveTo(x, y + cs); ctx.lineTo(x + cs, y + cs); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = i === d.cursor ? '#fff' : '#35618F';
      ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2);
      if (cell.val) {
        ctx.fillStyle = cell.given ? '#FBBF24' : (cell.val === cell.ans ? '#86EFAC' : '#FCA5A5');
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText(String(cell.val), x + cs / 2, y + cs / 2 + 9);
      }
    }
    ctx.textAlign = 'left';
  },

  drawGomoku: function (ctx, L) {
    var d = this.active.data;
    if (!d) return;
    var size = d.size, cs = 36;
    var gx = L.x + (L.w - cs * size) / 2, gy = L.y + 60;
    ctx.fillStyle = '#D4A55A'; ctx.fillRect(gx, gy, cs * size, cs * size);
    ctx.strokeStyle = '#8B5E3C'; ctx.lineWidth = 1;
    for (var i = 0; i <= size; i++) {
      ctx.beginPath(); ctx.moveTo(gx + i * cs, gy); ctx.lineTo(gx + i * cs, gy + cs * size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx, gy + i * cs); ctx.lineTo(gx + cs * size, gy + i * cs); ctx.stroke();
    }
    /* 棋子 */
    for (var j = 0; j < size * size; j++) {
      if (!d.board[j]) continue;
      var r = Math.floor(j / size), c = j % size;
      var px = gx + c * cs + cs / 2, py = gy + r * cs + cs / 2;
      ctx.fillStyle = d.board[j] === 1 ? '#1a1a1a' : '#fff';
      ctx.beginPath(); ctx.arc(px, py, 14, 0, 6.283); ctx.fill();
      ctx.strokeStyle = d.board[j] === 1 ? '#444' : '#999'; ctx.lineWidth = 1; ctx.stroke();
    }
    /* 最后一步标记 */
    if (d.lastMove !== null) {
      var lr = Math.floor(d.lastMove / size), lc = d.lastMove % size;
      var lx = gx + lc * cs + cs / 2, ly = gy + lr * cs + cs / 2;
      ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(lx, ly, 16, 0, 6.283); ctx.stroke();
    }
    /* 光标 */
    if (d.cursor !== undefined && d.turn === 1) {
      var cr = Math.floor(d.cursor / size), cc = d.cursor % size;
      ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 3;
      ctx.strokeRect(gx + cc * cs + 2, gy + cr * cs + 2, cs - 4, cs - 4);
    }
    ctx.fillStyle = '#9BB4D0'; ctx.font = '14px sans-serif';
    ctx.fillText(d.winner ? (d.winner === 1 ? '🎉 你赢了！' : 'AI 赢了，再试一次') : (d.turn === 1 ? '轮到你（方向键选位，空格落子）' : 'AI 思考中…'), L.x + 24, L.y + L.h - 24);
  },

  finish: function (win) {
    var info = this.active.returnInfo;
    this.active = null;
    /* 奖励 */
    for (var i = 0; i < Game.players.length; i++) {
      var p = Game.players[i];
      Inv.add(p.inv, 'iron', 2);
      Inv.add(p.inv, 'torch', 4);
      if (win) Inv.add(p.inv, 'gold', 1);
    }
    Game.say(win ? '挑战成功！每人得到 铁×2 金×1 火把×4' : '挑战结束，每人得到 铁×2 火把×4');
  }
};
