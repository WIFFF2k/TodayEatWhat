# 抽签历史

## 文件职责

routes.js 校验分页；repositories/records.js 联查抽签与关联投票

## 必须保留的规则

只读，每页 30 条倒序；显示当时餐厅名称，不回查现存选项来覆盖历史；选项删除后仍保留

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：options-sync.spec.cjs、options-audit.spec.cjs、persistence.spec.cjs
