# 今日空战小游戏

`views/page.js` 将服务端转盘结果接入 Canvas 飞机大战玩法，三架敌机分别代表西一、百景园、西二，击落后触碰能量核心展示本局抽签结果

页面通过 `application/router.js` 注册，通过 `application/session.js` 添加侧栏入口；样式只在 `styles/game.css` 中维护

玩家可使用方向键或 WASD 移动，空格键或发射按钮攻击；手机端拖动屏幕控制战机，自动发射；战机和敌机由本地 WebGL 立体网格及光照绘制，激光、爆炸和结果能量核心由 Canvas 绘制，不依赖外部图片资源
