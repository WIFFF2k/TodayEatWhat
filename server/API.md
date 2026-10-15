# HTTP 接口约定

所有接口以 /api 开头，返回 JSON；有请求体时设置 Content-Type: application/json
除 GET /instance、GET /bootstrap 外，均需请求头 x-user-name: encodeURIComponent(姓名)
中文姓名不能直接写入请求头，姓名须来自 bootstrap.users 白名单；这只是熟人身份选择，不是密码认证

## 公共数据与错误

分类值为「出去吃」「外卖」，界面把外卖显示为「点外卖」
接口时间 createdAt、deadline、serverTime 均为毫秒时间戳，标题按 Asia/Shanghai 的 17:00 划分中午和晚上
分页 offset 为非负安全整数，默认 0；投票和历史每次最多返回 30 条，下一页 offset 加 30

错误统一返回 { errorCode, error }，error 是可展示的中文提示，不将失败转换为空数据或成功结果

| 状态 | 常见错误码 | 含义 |
| --- | --- | --- |
| 400 | JSON_INVALID、USER_ENCODING_INVALID、PAGE_INVALID | JSON、姓名编码、分页格式错误 |
| 400 | OPTION_NAME_INVALID、CATEGORY_INVALID、OPTION_ID_INVALID | 名称、分类、选项编号错误 |
| 400 | OPTION_UPDATE_INVALID、OPTION_STATE_INVALID | 修改字段或启用状态错误 |
| 400 | SPIN_ID_INVALID、POLL_MODE_INVALID、POLL_DURATION_INVALID | 抽签编号或设置错误 |
| 400 | BALLOT_INVALID、BALLOT_DUPLICATE、BALLOT_SINGLE_ONLY、BALLOT_CHOICE_MISMATCH | 选票不符合规则 |
| 401 | USER_REQUIRED、USER_NOT_ALLOWED | 未选择姓名或不在白名单 |
| 403 | SPIN_NOT_OWNER | 不能用别人的抽签发起投票 |
| 404 | API_NOT_FOUND、OPTION_NOT_FOUND、SPIN_NOT_FOUND、POLL_NOT_FOUND | 接口或数据不存在 |
| 409 | OPTION_DUPLICATE、OPTION_CHANGED | 同分类重名或选项被他人改名 |
| 409 | WHEEL_EMPTY、POLL_CHOICES_INSUFFICIENT、POLL_CLOSED | 没有可抽选项、投票候选不足或投票截止 |
| 413 | BODY_TOO_LARGE | 请求体过大 |
| 500 | SERVER_ERROR | 内部故障，详细原因记录在服务窗口 |

## 登录与启动

- GET /instance → { application, directory }，启动器用来判断端口上的服务是否属于同一项目
- GET /bootstrap → { users, settings, title, serverTime }，users 为姓名字符串数组
- 登录由前端保存所选姓名，之后每次请求发送编码后的身份头，没有独立登录接口

## 共享选项

选项结构：{ id, name, category, enabled, addedBy, createdAt }；enabled 为布尔值

| 请求 | 参数或请求体 | 成功返回 |
| --- | --- | --- |
| GET /options | 无 | 现存选项数组，含已取消勾选的选项 |
| POST /options | { name, category } | 201，{ id, options } |
| PATCH /options/:id | { name, expectedName? } 或 { enabled, expectedName? } | { ok: true, options } |
| DELETE /options/:id | { expectedName? } | { ok: true, options } |
| GET /option-logs | 可选 before 游标 | { items, hasMore } |

名称去除首尾空白后长度为 1～60，同分类现存名称不能重复
PATCH 必须单独修改名称或勾选状态，enabled 必须为布尔值
编辑与删除建议携带页面当前名称 expectedName；若已被其他人改名，返回 409，重新读取后再操作
删除为软删除，已产生的抽签和投票名称保持快照；已删除的名称可重新添加
新增、重命名、删除和对应日志在同一事务内提交；保存相同名称、切换勾选不新增日志

日志项：{ id, optionId, action, actor, category, oldName, newName, createdAt }
action 为 add、rename、delete；新增时 oldName 为 null，删除时 newName 为 null
首屏不传 before；下一页传当前最后一条日志的 id，取 id 小于游标的至多 30 条，按 id 倒序

## 转盘与历史

- POST /spins，请求 { category } → 201，{ id, index, winner, entries }
- entries 为服务端抽签时的有效候选快照，每项 { id, name, category }；index 是 winner 在 entries 中的零基下标
- 前端必须使用响应里的候选及下标绘制最终结果，不能自行重新随机；候选为空返回 409
- GET /records?offset=0 → 历史数组，每项 { id, userName, category, optionName, createdAt, pollId }，无关联投票时 pollId 为 null

## 全局设置

- GET /settings → { pollMode, pollMinutes }
- PUT /settings，请求 { pollMode, pollMinutes } → 保存后的同结构对象
- pollMode 为 single 或 multiple；pollMinutes 为 1～1440 的整数，默认 single、60
- 设置全局共享，已有投票保留创建时配置，修改仅影响之后创建的投票

## 投票与通知

| 请求 | 参数或请求体 | 成功返回 |
| --- | --- | --- |
| POST /polls | { spinId } | 201，{ id } |
| GET /polls | 可选 offset | 投票详情数组，按 id 倒序 |
| GET /polls/:id | 无 | 单个投票详情 |
| POST /polls/:id/vote | { choiceIds: [候选编号] } | 更新后的投票详情 |
| GET /sync | 无 | { activePolls, serverTime, title } |

只能从自己的抽签发起投票；同一 spinId 重复请求返回同一个投票 id
候选为抽签结果名称与该分类当前启用名称的去重合集，至少需要两个不同名称
创建时保存候选、模式和时长快照，餐厅随后改名、取消勾选或删除不会修改旧投票

详情字段：id、title、creator、mode、minutes、createdAt、spinId、deadline、closed、choices、votedChoiceIds、participants、proposedName
choices 每项为 { id, name, votes }；votedChoiceIds 是当前身份已选编号；participants 按投票人数去重
proposedName 是原抽签结果，旧的未关联抽签投票为 null

choiceIds 必须是非空、不重复的正安全整数数组，且全部属于本次投票
单选只接受一项；截止前可重复提交，以新选择整体替换本人旧票，失败时旧票保留
截止与票数以服务端为准；同名用户共享同一份选票

sync 最多返回最近 30 个未截止投票，不分页；历史投票仍可通过列表和详情查看
网页在可见且非忙碌时每 3 秒同步通知和当前页面必要数据；设置、历史、投票列表通过重新进入页面读取
