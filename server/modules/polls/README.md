# 多人投票

## 文件职责

routes.js 提供列表、详情、通知、创建与改票；services/polls.js 编排规则；repositories/polls.js 读写投票、选票和选项人员分布；shared/choices.js 定义固定的三个候选项

## 必须保留的规则

本人抽签才能发起，同一抽签只创建一次；候选固定为去、不去和我不服我要重转；模式与时长按创建时快照；改票校验后整体替换，截止后拒绝；参与人数按用户去重，未选择的人取白名单差集；不服重转的人只带出本人正在进行的其他投票

## 验证

从项目根目录运行 npm test，相关场景位于 tests/e2e/：polls.spec.cjs、boundaries.spec.cjs、persistence.spec.cjs
