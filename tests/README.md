# 自动化检查

## 运行

需要 Node.js 24+、npm ci、Microsoft Edge，20281 和 20282 端口可用

    npm test
    npm test -- --grep "重命名"
    npm test -- tests/e2e/skins.spec.cjs

统一由 run.cjs 创建 eat-what-check- 前缀临时目录并设置 DATA_DIR，完成后清理
不要直接运行 Playwright CLI，避免缺少隔离环境；正式数据库不参与测试
固定 workers: 1，因为当前测试共享一个临时服务；并行前需要为每个 worker 分配独立服务、端口和数据库

## 目录

fixtures/app.cjs 提供自动隔离夹具，每个用例前重置业务数据、初始名称与配置
helpers/browser.cjs 提供登录、导航、身份、抽签和隔离数据库访问
所有场景从 fixtures/app.cjs 导入 test，避免跨文件模块缓存导致数据串用
根目录 playwright.config.cjs 配置浏览器、端口、失败截图和 trace

## 场景

| 文件 | 内容 |
| --- | --- |
| identity.spec.cjs | 中文名单、刷新、非法输入 |
| options-sync.spec.cjs | 双设备新增与勾选同步、文字安全、抽签历史 |
| options-audit.spec.cjs | 改名、删除、取消、留痕、快照 |
| options-errors.spec.cjs | 并发、校验、留痕失败回滚、日志分页 |
| polls.spec.cjs | 通知、单选改票、多选设置、截止 |
| boundaries.spec.cjs | 空及单候选、旧投票分页、改票回滚、重复启动 |
| failures.spec.cjs | 断网恢复、操作锁、失败设置 |
| persistence.spec.cjs | 重启后历史、投票、删除及日志保留 |
| layout.spec.cjs | 默认分类、卡片顺序、按钮对齐、手机无溢出 |
| skins.spec.cjs | 皮肤记忆、落点、粒子清理、手机、减少动态效果 |
| wheel-labels.spec.cjs | 多选项转盘各皮肤仍显示完整选项名，不退化序号 |

共 12 个场景，skins 包含两个，wheel-labels 包含一个；从真实界面或 API 产生数据，再校验最终展示和持久化结果
故障测试主动触发服务器错误日志，以最终断言判断结果；数据库触发器只能写在临时库并及时清理
截图与 trace 位于 test-results，目录已被 Git 忽略
