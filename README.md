# MathCraft · 游戏大厅

LST 和爸爸一起做的小游戏合集。全部零依赖、纯前端（原生 JS + Canvas），双击即玩，无需服务器。

## 入口 / Entry

打开根目录 `index.html`（游戏大厅），挑选任意一个游戏进入。

## 游戏清单 / Games

| 游戏 | 目录 | 类型 | 说明 |
|------|------|------|------|
| WILDCRAFT · 俯视求生 | `wildcraft/`（入口 `#top`） | 双人 · 开放世界 | 天空岛求生：采集、合成、建家、打怪收服、迷宫机关、载具与异空间，双人同屏 |
| WILDCRAFT · 挖矿建造 | `wildcraft/mine/`（入口 `#mine`） | 四视角 · 生存 | 2D 方块世界：挖矿放置、背包合成、枪械射击、夜晚怪潮；侧面 / 第一人称 / 俯视 / 仰视四视角切换 |
| 城堡小队 | `castle-squad/` | 双人 · 射击守城 | 开局一座城堡：随地捡枪、招募机器人队友、双人合作推积分 |
| 弹球小队 | `bounce-squad/` | 打砖块 · Roguelite | 每波结束三选一强化，球越打越疯 |
| 尖刺跑酷 | `spike-runner/` | 跑酷 · 双人 | 一路向前跳跃躲避，双人互相救助 |
| 数棋大冒险 | `shuqi/` | 数学 · 亲子 | 下棋闯关练口算与逻辑，进度可视化 |
| 方块世界 3D | `voxelcraft/` | 3D · 沙盒 | 纯 Canvas 软件渲染体素沙盒：山川湖海洞穴、昼夜星空、飞行游泳 |

## 测试 / Tests

各游戏目录内附无头自测脚本（`sim-test.js` / `quick-test.js`），可用 Node 运行：

```bash
node sim-test.js
```

## 许可 / License

见 [LICENSE](LICENSE)。
