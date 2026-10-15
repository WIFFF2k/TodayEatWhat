# 身份与登录

## 文件职责

routes.js 提供 bootstrap；services/identity.js 组合姓名、配置和时间；repositories/users.js 查询白名单

## 必须保留的规则

姓名来自数据库，启动补齐名单不清除已有成员；头部中文用 encodeURIComponent 编码，不能视为密码认证

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：identity.spec.cjs
