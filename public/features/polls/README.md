# 投票列表与详情

## 文件职责

views/page.js 管理列表与分页；components/detail.js 管理提交、改票、票数更新和截止结果；styles/polls.css 管理结果样式

## 必须保留的规则

只用服务端票数，dirty 标记保护未提交勾选；当前详情轮询更新，列表重新进入读取；截止、并列和无人参与均有明确显示

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：polls.spec.cjs、boundaries.spec.cjs
