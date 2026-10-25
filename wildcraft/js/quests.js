/* 任务系统：在任务长老那儿领，完成回来交，有奖励 */
var Quest = {
  /* kind: collect 收集 / hunt 打怪 / explore 探索 / build 建造 / maze 迷宫 */
  defs: [
    { kind: 'collect', item: 'log',   min: 4, max: 9,  text: '收集 {n} 个木头',   rew: [{ id: 'torch', n: 4 }, { id: 'plank', n: 8 }] },
    { kind: 'collect', item: 'stone', min: 5, max: 10, text: '收集 {n} 个石头',   rew: [{ id: 'torch', n: 4 }, { id: 'iron', n: 2 }] },
    { kind: 'collect', item: 'coal',  min: 2, max: 5,  text: '挖 {n} 块煤',       rew: [{ id: 'torch', n: 8 }, { id: 'apple', n: 2 }] },
    { kind: 'collect', item: 'iron',  min: 2, max: 4,  text: '挖 {n} 块铁',       rew: [{ id: 'kit', n: 1 }, { id: 'gold', n: 1 }] },
    { kind: 'collect', item: 'apple', min: 2, max: 4,  text: '摘 {n} 个苹果',     rew: [{ id: 'torch', n: 4 }, { id: 'plank', n: 6 }] },
    { kind: 'hunt',   mob: 'zombie', min: 2, max: 5,  text: '打跑 {n} 只小僵尸',  rew: [{ id: 'apple', n: 3 }, { id: 'iron', n: 2 }] },
    { kind: 'hunt',   mob: 'ender',  min: 2, max: 4,  text: '打跑 {n} 只小末影人', rew: [{ id: 'kit', n: 1 }, { id: 'gold', n: 1 }] },
    { kind: 'hunt',   mob: 'brute',  min: 1, max: 3,  text: '打跑 {n} 只大块头',  rew: [{ id: 'ssword', n: 1 }, { id: 'kit', n: 2 }] },
    { kind: 'hunt',   mob: 'giant',  min: 1, max: 1,  text: '打倒 1 只巨人僵尸',  rew: [{ id: 'gold', n: 3 }, { id: 'kit', n: 2 }, { id: 'epotato', n: 2 }] },
    { kind: 'explore', min: 60, max: 150, text: '走到离出生点 {n} 格以外', rew: [{ id: 'torch', n: 6 }, { id: 'gold', n: 1 }] },
    { kind: 'build',  min: 4, max: 9,  text: '搭 {n} 块木板墙', rew: [{ id: 'iron', n: 3 }, { id: 'kit', n: 1 }] },
    { kind: 'maze',   min: 1, max: 1,  text: '通关 1 次机关迷宫', rew: [{ id: 'gold', n: 2 }, { id: 'kit', n: 2 }] }
  ],

  make: function () {
    var d = this.defs[Math.floor(Math.random() * this.defs.length)];
    var target = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
    return { d: d, target: target, prog: 0, done: false };
  },

  give: function (p) {
    p.quest = this.make();
    Game.say(p.name + ' 领到新任务：' + this.label(p.quest));
  },

  label: function (q) {
    if (!q) return '';
    return q.d.text.replace('{n}', q.target) + '（' + Math.min(q.prog, q.target) + '/' + q.target + '）';
  },

  bump: function (p, n) {
    var q = p.quest;
    if (!q || q.done) return;
    q.prog += (n || 1);
    if (q.prog >= q.target) {
      q.prog = q.target; q.done = true;
      Game.say('✓ ' + p.name + ' 的任务完成了！回任务长老那儿按 F / 领取奖励');
    }
  },

  onCollect: function (p, id, n) {
    var q = p.quest;
    if (q && q.d.kind === 'collect' && q.d.item === id) this.bump(p, n);
  },
  onKill: function (p, type) {
    var q = p.quest;
    if (q && q.d.kind === 'hunt' && q.d.mob === type) this.bump(p, 1);
  },
  onBuild: function (p, obj) {
    var q = p.quest;
    if (q && q.d.kind === 'build' && obj === O.PLANK) this.bump(p, 1);
  },
  onExplore: function (p, tiles) {
    var q = p.quest;
    if (q && q.d.kind === 'explore') q.prog = Math.max(q.prog, Math.floor(tiles));
    if (q && q.d.kind === 'explore' && q.prog >= q.target) {
      q.done = true;
      Game.say('✓ ' + p.name + ' 走到了很远的地方！回去领奖励');
    }
  },
  onMaze: function (p) {
    var q = p.quest;
    if (q && q.d.kind === 'maze') this.bump(p, 1);
  },

  turnIn: function (p) {
    var q = p.quest;
    if (!q || !q.done) return false;
    var txt = [];
    for (var i = 0; i < q.d.rew.length; i++) {
      Inv.add(p.inv, q.d.rew[i].id, q.d.rew[i].n);
      txt.push(ITEMS[q.d.rew[i].id].name + '×' + q.d.rew[i].n);
    }
    // 打怪和迷宫任务有概率直接给载具
    if ((q.d.kind === 'hunt' || q.d.kind === 'maze') && Math.random() < 0.35) {
      var v = Math.random() < 0.5 ? 'excavator' : 'tank';
      Inv.add(p.inv, v, 1);
      txt.push('【' + ITEMS[v].name + '】');
    }
    p.quest = null;
    Game.say(p.name + ' 交任务成功，奖励：' + txt.join('、'));
    return true;
  }
};

/* 任务长老的位置（天空岛 / 地面各一个） */
var QUEST_NPC = [
  { layer: 0, x: 4, y: 4 },
  { layer: 1, x: 0, y: 8 }
];
