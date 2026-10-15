# 历史记录页面

## 文件职责

views/page.js 分页查询抽签和投票关联，通过 navigate 事件翻页或跳转投票

## 必须保留的规则

进入页面时读取，历史名称保持快照；翻页不直接依赖应用路由实现，避免循环导入

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：options-sync.spec.cjs、persistence.spec.cjs
