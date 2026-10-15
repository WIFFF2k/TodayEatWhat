# 设置页面

## 文件职责

views/page.js 读取和提交全局设置；styles/settings.css 管理表单布局

## 必须保留的规则

每次进入读服务器值，保存成功才提示；失败保留输入；设置仅影响后续投票

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：polls.spec.cjs、failures.spec.cjs
