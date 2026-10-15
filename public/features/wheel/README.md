# 转盘与皮肤

## 文件职责

views/page.js 管理分类、抽签、结果和发起投票；renderers/wheel.js 绘制盘面及粒子；styles/wheel.css 是基础布局，styles/skins.css 是皮肤

## 必须保留的规则

默认出去吃与基础皮肤；eat-wheel-skin 仅记录浏览器偏好；服务端返回快照决定角度；转动期间禁用皮肤和分类切换；减少动态效果关闭光环和粒子

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：skins.spec.cjs、layout.spec.cjs、options-sync.spec.cjs
