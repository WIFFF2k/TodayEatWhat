# 服务端抽签

## 文件职责

routes.js 接收 category；services/wheel.js 在事务中读取候选、随机选取并保存；repositories/wheel.js 保存与读取快照

## 必须保留的规则

只抽启用且未删除选项，使用 crypto.randomInt 等概率选择，返回 entries/index/winner 与保存记录一致；前端动画不能改变结果

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：boundaries.spec.cjs、options-sync.spec.cjs、skins.spec.cjs
