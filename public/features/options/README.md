# 选项管理

## 文件职责

views/page.js 管理添加、勾选、拖动归类和同步；components/editor.js 管理改名与删除确认；components/logs.js 管理日志和游标分页；styles/options.css 管理表单、拖拽反馈与弹窗

## 必须保留的规则

分类顺序由 state.categories 统一决定；按钮在 label 外避免误勾选；拖动卡片到其他分类后归类与留痕同事务更新；编辑器通过 onSaved 通知页面刷新，后台更新不覆盖草稿；日志独立于现存选项，每页默认 10 条并支持 10/30/50，偏好保存在当前浏览器

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：options-sync.spec.cjs、options-audit.spec.cjs、options-errors.spec.cjs、layout.spec.cjs
