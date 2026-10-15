# 共享选项

## 文件职责

routes.js 提供选项和日志入口；services/options.js 校验、并发检查、事务；repositories/options.js 执行选项和日志 SQL

## 必须保留的规则

增删改与日志同事务，expectedName 防止旧名称覆盖；启用状态只接受布尔值；删除保留历史且允许同名再添加；enabledOptions 是抽签和投票共同候选定义

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：options-sync.spec.cjs、options-audit.spec.cjs、options-errors.spec.cjs
