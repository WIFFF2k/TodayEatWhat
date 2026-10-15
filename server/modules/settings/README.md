# 全局投票设置

## 文件职责

routes.js 处理读取和保存；services/settings.js 校验并成对提交；repositories/settings.js 执行查询与更新

## 必须保留的规则

模式 single/multiple，分钟为 1～1440 整数；只影响后续新投票，不更改现存投票快照

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：identity.spec.cjs、polls.spec.cjs、failures.spec.cjs
