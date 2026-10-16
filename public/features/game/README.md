# 今日空战小游戏

`views/page.js` 将服务端转盘结果接入 Canvas 飞机大战玩法，场景中持续生成大量移动敌机，敌机类型分别代表西一、百景园、西二，碰撞后立即锁定该名称为本局结果

页面通过 `application/router.js` 注册，通过 `application/session.js` 添加侧栏入口；样式只在 `styles/game.css` 中维护

玩家可使用方向键或 WASD 左右移动，战机会自动连续发射；手机端拖动屏幕控制战机；战机和敌机由本地 WebGL 立体网格及光照绘制，激光、爆炸和滚动星空由 Canvas 绘制，不依赖外部图片资源
