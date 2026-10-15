# 选项管理

## 文件职责

views/page.js 管理添加、勾选和同步；components/editor.js 管理改名与删除确认；components/logs.js 管理日志和游标分页；styles/options.css 管理表单与弹窗

## 必须保留的规则

卡片先出去吃后外卖；按钮在 label 外避免误勾选；编辑器通过 onSaved 通知页面刷新，后台更新不覆盖草稿；日志独立于现存选项

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：options-sync.spec.cjs、options-audit.spec.cjs、options-errors.spec.cjs、layout.spec.cjs
