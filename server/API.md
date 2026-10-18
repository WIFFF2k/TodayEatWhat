# HTTP 接口约定

所有接口以 /api 开头，返回 JSON；有请求体时设置 Content-Type: application/json
除 GET /instance、GET /bootstrap 外，均需请求头 x-user-name: encodeURIComponent(姓名)
中文姓名不能直接写入请求头，姓名须来自 bootstrap.users 白名单；这只是熟人身份选择，不是密码认证

## 公共数据与错误

用餐分类在接口和数据库中统一使用稳定 key：good_meal、casual_out、takeout、pending；显示名由 bootstrap.categories 的 label 提供，调整显示名只需改 server/shared/categories.js
接口时间 createdAt、deadline、serverTime 均为毫秒时间戳，标题按 Asia/Shanghai 的 17:00 划分中午和晚上
分页 offset 为非负安全整数，默认 0；投票和历史每次最多返回 30 条，下一页 offset 加 30；选项日志通过 size 选择 10、30、50 条

错误统一返回 { errorCode, error }，error 是可展示的中文提示，不将失败转换为空数据或成功结果

| 状态 | 常见错误码 | 含义 |
| --- | --- | --- |
| 400 | JSON_INVALID、USER_ENCODING_INVALID、PAGE_INVALID | JSON、姓名编码、分页格式错误 |
| 400 | OPTION_NAME_INVALID、CATEGORY_INVALID、OPTION_ID_INVALID | 名称、分类、选项编号错误 |
| 400 | OPTION_UPDATE_INVALID、OPTION_STATE_INVALID、PAGE_SIZE_INVALID | 修改字段、启用状态或日志分页大小错误 |
| 400 | SPIN_ID_INVALID、POLL_MODE_INVALID、POLL_DURATION_INVALID | 抽签编号或设置错误 |
| 400 | BALLOT_INVALID、BALLOT_DUPLICATE、BALLOT_SINGLE_ONLY、BALLOT_CHOICE_MISMATCH | 选票不符合规则 |
| 401 | USER_REQUIRED、USER_NOT_ALLOWED | 未选择姓名或不在白名单 |
| 403 | SPIN_NOT_OWNER | 不能用别人的抽签发起投票 |
| 404 | API_NOT_FOUND、OPTION_NOT_FOUND、SPIN_NOT_FOUND、POLL_NOT_FOUND | 接口或数据不存在 |
| 409 | OPTION_DUPLICATE、OPTION_CHANGED | 目标分类重名或选项被他人改名 |
| 409 | WHEEL_EMPTY、POLL_CLOSED | 没有可抽选项或投票截止 |
| 413 | BODY_TOO_LARGE | 请求体过大 |
| 500 | SERVER_ERROR | 内部故障，详细原因记录在服务窗口 |

## 登录与启动

- GET /instance → { application, directory }，启动器用来判断端口上的服务是否属于同一项目
- GET /bootstrap → { users, settings, categories, title, serverTime }，users 为姓名字符串数组，categories 为 { key, label } 数组
- 登录由前端保存所选姓名，之后每次请求发送编码后的身份头，没有独立登录接口

## 共享选项

选项结构：{ id, name, category, enabled, addedBy, createdAt }；category 为分类 key，enabled 为布尔值

| 请求 | 参数或请求体 | 成功返回 |
| --- | --- | --- |
| GET /options | 无 | 现存选项数组，含已取消勾选的选项 |
| POST /options | { name, category }，category 为分类 key | 201，{ id, options } |
| PATCH /options/:id | { name, expectedName? }、{ category, expectedName? } 或 { enabled, expectedName? } | { ok: true, options } |
| DELETE /options/:id | { expectedName? } | { ok: true, options } |
| GET /option-logs | 可选 before 游标与 size | { items, hasMore } |

名称去除首尾空白后长度为 1～60，同分类现存名称不能重复
PATCH 必须单独修改名称、分类或勾选状态，enabled 必须为布尔值
分类移动会在目标分类末尾追加，不会按选项编号插到目标分类中间或开头
编辑、移动和删除建议携带页面当前名称 expectedName；若已被其他人改名，返回 409，重新读取后再操作
删除为软删除，已产生的抽签和投票名称保持快照；已删除的名称可重新添加
新增、重命名、分类移动、删除和对应日志在同一事务内提交；保存相同名称、移动到原分类、切换勾选不新增日志

日志项：{ id, optionId, action, actor, category, oldCategory, newCategory, oldName, newName, createdAt }，分类字段均为稳定 key
action 为 add、rename、delete、move；新增时 oldName 与 oldCategory 为 null，删除时 newName 与 newCategory 为 null，移动时 category 为目标分类 key
size 只能为 10、30 或 50，默认 10；首屏不传 before，下一页传当前最后一条日志的 id，取 id 小于游标的对应条数，按 id 倒序

## 转盘与历史

- POST /spins，请求 { category } → 201，{ id, index, winner, entries }
- entries 为服务端抽签时的有效候选快照，每项 { id, name, category }；index 是 winner 在 entries 中的零基下标
- 前端必须使用响应里的候选及下标绘制最终结果，不能自行重新随机；候选为空返回 409
- GET /records?offset=0 → 历史数组，每项 { id, userName, category, optionName, createdAt, pollId }，category 为分类 key，无关联投票时 pollId 为 null

## 吃饭回忆

- GET /memories?offset=0 → 最新回忆帖数组，每页最多 30 条
- POST /memories → { title, content, participants, photo }，标题 1～60 字，感想最多 500 字，参与人员必须来自白名单；照片为 PNG、JPG、GIF 或 WebP 数据 URL，最大 3MB
- DELETE /memories/:id → 仅帖子作者可以删除

## 迩灵邑

迩灵邑接口使用轴向六边形坐标 q、r，未传地图坐标时以当前玩家出生点为中心；地图地块在读取或圈占时按需生成。所有地图操作的 q、r 必须是安全整数，否则返回 REALM_COORDINATE_INVALID

| 请求 | 参数或请求体 | 成功返回 |
| --- | --- | --- |
| GET /realm/overview | 可选 q、r | 世界、玩家资源、视野地块、建筑、事件、联盟、战争历史、攻防战报、在线玩家、排行榜、最近动态和赛季信息；返回 `serverTime` 作为倒计时校准基准，返回 `productionPerTick` 作为每 120 秒自动产出预估，事件与世界首领包含结束时间，首领空窗期返回下一场开始时间 `worldBossNextAt`，在线玩家包含最近活跃时间，战争历史包含当前玩家贡献积分和本盟个人名次 `ownRank`，已结算胜仗包含联盟仓库奖励 `warehouseReward`，战争胜利入仓会生成 `war-warehouse-reward` 动态，功法可升级时返回权威费用 `techniqueUpgrade`，攻防战报包含 `warPoint`，建筑配置返回 `cost` 与技能 `cost/reward`，`activities.meals`、`activities.posts`、`activities.relics` 分别来自吃饭记录、发帖记录和迩灵邑遗迹探索记录，赛季历史同时保存邑城榜与修炼榜 |
| GET /realm/ranking | 无 | 当前世界领地榜和修炼榜，以及用于客户端倒计时校准的服务端时间 `serverTime` |
| GET /realm/season | 无 | 当前赛季编号、起止时间、剩余秒数、服务端时间 `serverTime` 和历史排行榜快照；历史排名前三名含赛季奖励 |
| POST /realm/gather | 无 | 主动采集粮食、木材、矿石和灵息后的玩家状态和地图信息，并返回本次 `gatherReward` |
| POST /realm/events/resolve | `{ eventId, choiceKey? }` | 参与当前限时事件并领取一次性奖励；当前事件池包含十三种模板，分支事件必须提交有效的 `choiceKey`，协作事件达标时最后参与者会获得额外奖励 |
| POST /realm/daily-quests/claim | `{ questKey }` | 领取当天已完成的每日悬赏奖励，每个悬赏每天只能领取一次 |
| POST /realm/achievements/claim | `{ achievementKey }` | 领取已达成的修士功勋奖励，每个功勋永久只能领取一次 |
| POST /realm/trades | { offerResource, offerAmount, wantResource, wantAmount } | 托管资源并发布一笔 24 小时有效的公开交易订单；过期后自动退款 |
| POST /realm/trades/fill | { orderId } | 成交其他玩家的公开订单并原子交换资源 |
| POST /realm/trades/cancel | { orderId } | 取消自己的未成交订单并退回托管资源；过期订单由系统自动退款 |
| POST /realm/relics/explore | `{ q, r }` | 探索遗迹并领取按距离成长的一次性奖励 |
| POST /realm/tiles/claim | { q, r } | 圈地后的玩家状态和地图信息 |
| POST /realm/buildings | { q, r, building } | 建筑完成后的玩家状态和地图信息 |
| POST /realm/buildings/demolish | { q, r } | 拆除自己的功能建筑并返还基础建造材料的 50%；升级与专精投入不返还 |
| POST /realm/buildings/upgrade | { q, r } | 建筑升级后的玩家状态和地图信息；升至下一级需要 `25×当前等级` 木材和 `floor(12.5×当前等级)` 矿石 |
| POST /realm/buildings/specialize | { q, r, specialization } | 为 3 级以上建筑确定一次专精并返回更新后的玩家状态和地图信息 |
| POST /realm/buildings/activate | { q, r } | 发动建筑主动技能并返回技能消耗与奖励 |
| POST /realm/attack | { q, r } | 攻击结果、战利品、`warPoint`、行动日志和地图信息；成功时掠取防守方各类资源的 8%，同联盟成员不能互相攻击，战争积分同时写入历史攻防战报 |
| POST /realm/world-boss/attack | 无 | 消耗 20 矿石和 3 灵息攻击当前世界首领，返回共享血量、个人伤害与当前排名、联盟伤害榜、联盟仓库奖励和击杀奖励；击杀时额外返回 `bossRanking`（最终名次与奖励）、`bossPersonalRank`、`bossPersonalReward` |
| POST /realm/alliances/world-boss-rewards/claim | 无 | 将当前联盟尚未入仓的世界首领奖励一次性存入联盟仓库 |
| POST /realm/cultivate | 无 | 修炼后的境界经验和资源 |
| POST /realm/breakthrough | 无 | 突破成功或失败后的境界状态；总览中的 breakthrough.chance 返回当前实际成功率 |
| POST /realm/talent | { talent } | 首次灵根觉醒后的玩家状态，talent 可为 earth、metal、spirit |
| POST /realm/technique | { technique } | 首次选择功法后的玩家状态，technique 可为 fortune、qi、war |
| POST /realm/technique/upgrade | 无 | 按目标等级递增消耗修炼经验和灵息提升当前功法等级；第 N 级需要 `300×N` 修炼经验与 `10×N` 灵息 |
| POST /realm/donate | { recipient, amount, resource? } | 捐赠指定资源后的玩家状态，resource 可为 grain、wood、ore、essence，缺省为 grain |
| POST /realm/alliances | { name } | 创建联盟并成为盟主 |
| POST /realm/alliances/join | { name } | 加入指定联盟 |
| POST /realm/alliances/leave | 无 | 退出当前联盟；战争期间不能退出 |
| POST /realm/alliances/transfer | { name } | 盟主将盟主职位转让给本联盟成员 |
| POST /realm/alliances/disband | 无 | 盟主解散当前联盟 |
| POST /realm/alliances/donate | { amount, resource? } | 将指定资源捐入联盟仓库，resource 可为 grain、wood、ore、essence，缺省为 grain |
| POST /realm/alliances/projects/donate | { projectKey, amount, source? } | 投入粮食推进联盟公共工程，projectKey 可为 road、academy、hunt；source 可为 personal（默认，扣个人粮食）或 warehouse（扣联盟仓库粮食），总览中的 alliance.projectContributions 返回按成员和来源汇总的工程贡献 |
| POST /realm/alliances/relations | { targetAlliance, kind } | 盟主发起结盟或停战申请，kind 可为 ally、truce |
| POST /realm/alliances/relations/respond | { relationId, accept } | 目标盟主接受或拒绝外交申请 |
| POST /realm/alliances/relations/end | { relationId } | 任一盟主解除已经生效的结盟或停战关系 |
| POST /realm/alliances/war | { targetAlliance } | 盟主向目标联盟发起 24 小时战争；到期后首次访问按积分结算并发放联盟仓库奖励 |
| POST /realm/destroy-world | 无 | 清空当前迩灵邑全部运行态数据、重置赛季编号并创建新世界 |

自动产出每 120 秒结算一次；主动采集每秒最多一次；世界事件每 30 分钟从十三种模板轮换一次，并可分别加成四类基础资源或修炼经验。圈地只要求与己方地块相邻，可以沿连接领地持续扩张到远方区域；建筑必须匹配地形，攻击受到相邻限制、资源消耗、出生护盾和冷却限制；攻击夺地使用目标归属条件更新，掠夺资源与双方状态在同一事务内结算。`/realm/overview` 的 `activities.relics` 为遗迹探索次数，`actions` 为最近动态；突破还会按境界要求遗迹探索次数。联盟公共工程 key 固定为 `road`、`academy` 和 `hunt`；世界首领按周期轮换三种模板并在低血量阶段降低承伤倍率

回忆帖字段为 id、userName、title、content、participants、photo、createdAt；照片没有上传时为 null。迩灵邑突破材料中的吃饭次数和发帖次数分别由 records、memories 领域仓储统计，每次突破分别校验两类次数

`/realm/overview` 的 `achievements` 由服务端统一计算，当前包含 17 项功勋，包含 `key`、`name`、`description`、`progress`、`goal`、`completed`、`claimed` 和 `reward` 字段；`claimed` 会根据永久领取凭证返回实际状态

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
候选项固定为「去」「不去」「我不服我要重转」，与抽签结果和餐厅名称无关
创建时保存候选、模式和时长快照，之后修改设置不影响已有投票

详情字段：id、title、creator、mode、minutes、createdAt、spinId、deadline、closed、choices、votedChoiceIds、participants、proposedName、pendingNames、redoOpenPolls
choices 每项为 { id, code, name, votes, voters }；code 为 go、skip、redo，voters 是按投票先后排列的姓名；votedChoiceIds 是当前身份已选编号；participants 按投票人数去重
pendingNames 是白名单中还没有选择的人；redoOpenPolls 是选择「我不服我要重转」的人本人正在进行的其他投票 { id, creator, proposedName }，没有时为 []
proposedName 是原抽签结果，旧的未关联抽签投票为 null

choiceIds 必须是非空、不重复的正安全整数数组，且全部属于本次投票
单选只接受一项；截止前可重复提交，以新选择整体替换本人旧票，失败时旧票保留
截止与票数以服务端为准；同名用户共享同一份选票

sync 最多返回最近 30 个未截止投票，不分页；历史投票仍可通过列表和详情查看
网页在可见且非忙碌时每 3 秒同步通知和当前页面必要数据；设置、历史、投票列表通过重新进入页面读取
观星台建在平原上，技能为观星推演；多座观星台按等级累加提高事件参与和协作完成的实际奖励，服务端统一封顶 40%，奖励倍率由事件结算接口返回。
御兽苑建在平原上，主动技能“灵兽巡猎”获得矿石和灵息；御兽苑按等级提高攻击成功率，所有御兽苑累计加成最高 15%。
`/realm/overview` 返回 `worldEventBonus`，表示当前玩家由所有观星台提供的天地异动奖励加成百分比。
普通攻城接口额外返回 `attackChance`，表示本次结算使用的成功率；该值已经包含灵根、功法、御兽苑、目标建筑等级和防御专精影响。
视野地块中的敌方目标会附带 `attackChance` 预览值，实际攻击时服务端会重新读取状态并再次计算，预览不代表锁定结果。
世界事件模板现为十三种，新增“灵脉迁徙”，支持追踪矿精或稳固阵眼两条资源路线。
事件结算接口返回 `rewardMultiplier` 与放大后的 `reward`、`completionReward`，用于确认观星台对本次个人奖励和协作奖励的实际影响。
世界事件模板现为十三种，新增“天材地宝”，支持采集凝神灵草或收取灵果两条路线。
功勋当前包含 17 项，新增“应变百策”和“守土有责”；前者完成 5 次天地异动参与后可领取灵息与修炼经验奖励，后者按防守成功次数统计。
成功夺地后，防守方会获得 45 秒战后护盾，和出生护盾、玄甲营主动护盾共用 `shieldUntil`，用于避免连续攻击锁死同一玩家。
`/realm/overview` 返回 `defenseWins`，表示玩家作为防守方成功守住领地的战报次数，与“守土有责”功勋使用同一统计来源。
`/realm/overview` 同时返回 `defenseLosses`，表示玩家作为防守方失守的战报次数，和 `defenseWins` 一起用于观察领地防守表现。
