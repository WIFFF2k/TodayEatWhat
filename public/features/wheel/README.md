# 转盘与皮肤

## 文件职责

views/page.js 管理分类、抽签、结果和发起投票；renderers/wheel.js 分发皮肤，renderers/skins/ 保存各皮肤绘制与特效；styles/wheel.css 是基础布局，styles/skins/ 保存各皮肤样式；奶龙转盘背景大图使用 public/pictures/奶蛙.png，中心图使用 public/pictures/奶蛙-转盘中心.png

## 必须保留的规则

默认 casual_out 与基础皮肤；分类 key 和显示名来自服务端 bootstrap；eat-wheel-skin 仅记录浏览器偏好；服务端返回快照决定角度；转动期间禁用皮肤和分类切换；减少动态效果关闭光环和粒子；未知皮肤标识回退到基础皮肤

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：skins.spec.cjs、layout.spec.cjs、options-sync.spec.cjs
