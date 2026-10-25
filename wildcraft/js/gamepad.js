/* 手柄输入：标准 Gamepad API，自动映射到 Input.keys */
var Gamepad = {
  prevButtons: [],
  axes0: [0, 0, 0, 0],
  deadzone: 0.3,

  /* 把手柄状态映射成键盘事件名 */
  map: function (gp, slot) {
    /* slot=0 → P1 的 ctl；slot=1 → P2 的 ctl */
    var keys = {};
    if (slot === 0) {
      keys = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', mine: 'Space', place: 'KeyE', use: 'KeyF', craft: 'KeyC', quest: 'KeyQ', follow: 'KeyG', drop: 'KeyZ', pet: 'KeyB' };
    } else {
      keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', mine: 'Enter', place: 'ShiftRight', use: 'Slash', craft: 'KeyN', quest: 'KeyL', follow: 'KeyV', drop: 'KeyM', pet: 'Comma' };
    }
    return keys;
  },

  poll: function () {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var used = [];
    for (var slot = 0; slot < 2; slot++) {
      var gp = null;
      for (var i = 0; i < pads.length; i++) {
        if (pads[i] && used.indexOf(i) < 0) { gp = pads[i]; used.push(i); break; }
      }
      if (!gp) continue;
      var keymap = this.map(gp, slot);
      var prev = this.prevButtons[slot] || [];

      /* 摇杆 → 方向键 */
      var ax0 = gp.axes[0] || 0, ay0 = gp.axes[1] || 0;
      if (Math.abs(ax0) < this.deadzone) ax0 = 0;
      if (Math.abs(ay0) < this.deadzone) ay0 = 0;
      Input.keys[keymap.left] = ax0 < -this.deadzone;
      Input.keys[keymap.right] = ax0 > this.deadzone;
      Input.keys[keymap.up] = ay0 < -this.deadzone;
      Input.keys[keymap.down] = ay0 > this.deadzone;
      /* 十字键 */
      if (gp.buttons[12] && gp.buttons[12].pressed) Input.keys[keymap.up] = true;
      if (gp.buttons[13] && gp.buttons[13].pressed) Input.keys[keymap.down] = true;
      if (gp.buttons[14] && gp.buttons[14].pressed) Input.keys[keymap.left] = true;
      if (gp.buttons[15] && gp.buttons[15].pressed) Input.keys[keymap.right] = true;

      /* 按钮 → 功能键
         0=A(挖/打/合体) 1=B(放置) 2=X(交互) 3=Y(合成)
         4=LB(任务本) 5=RB(选上一格) 6=LT 7=RT(选下一格)
         8=Back 9=Start(R回到白天) */
      var btns = [keymap.mine, keymap.place, keymap.use, keymap.craft, keymap.quest, '__next', null, '__prev'];
      for (var b = 0; b < btns.length; b++) {
        if (!btns[b]) continue;
        var pressed = gp.buttons[b] && gp.buttons[b].pressed;
        if (pressed && !prev[b]) Input.pressedSet[btns[b]] = true;
        if (!btns[b].startsWith('__')) Input.keys[btns[b]] = !!pressed;
      }
      /* RB/LB = 切换快捷栏 */
      if (gp.buttons[5] && gp.buttons[5].pressed && !prev[5]) {
        var p = Game.players[slot];
        if (p) p.sel = (p.sel + 1) % HOTBAR;
      }
      if (gp.buttons[4] && gp.buttons[4].pressed && !prev[4]) {
        /* 如果没在面板里，LB=任务本；否则=上一格 */
        if (Game.panel >= 0 || Game.questPanel >= 0) {
          var p2 = Game.players[Game.panel >= 0 ? Game.panel : Game.questPanel];
          if (p2) p2.sel = (p2.sel + HOTBAR - 1) % HOTBAR;
        }
      }
      /* Start = R 回到白天 */
      if (gp.buttons[9] && gp.buttons[9].pressed && !prev[9]) Input.pressedSet['KeyR'] = true;
      /* Back(Esc) */
      if (gp.buttons[8] && gp.buttons[8].pressed && !prev[8]) Input.pressedSet['Escape'] = true;
      /* LT(6) = 跟随保护，RT(7) = 丢弃手上的东西 */
      if (gp.buttons[6] && gp.buttons[6].pressed && !prev[6]) Input.pressedSet[keymap.follow] = true;
      if (gp.buttons[7] && gp.buttons[7].pressed && !prev[7]) Input.pressedSet[keymap.drop] = true;
      /* 按下右摇杆(11) = 放出收服来的小精灵 */
      if (gp.buttons[11] && gp.buttons[11].pressed && !prev[11]) Input.pressedSet[keymap.pet] = true;

      this.prevButtons[slot] = gp.buttons.map(function (b) { return b ? b.pressed : false; });
    }
  }
};
