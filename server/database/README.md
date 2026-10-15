# 数据库

## 文件与初始化

index.js 创建唯一 node:sqlite DatabaseSync 连接，使用 config/paths.js 的 dataDir
默认文件为项目根目录 data/eat-what.db，开启外键、WAL 和 5000ms busy_timeout
初始化按 schema → seed → migrations 顺序，在一个事务内提交；失败回滚并关闭连接
所有业务仓库复用此连接，不能各自新建正式数据库连接

| 文件 | 职责 |
| --- | --- |
| schema.js | 基础表与查询索引 |
| seed.js | 白名单和缺失默认配置 |
| modules/options/bootstrap.js | 通过逐项新增动作写入首次餐厅及添加记录 |
| migrations.js | 旧库补充 spin_id、候选编号、deleted_at、操作记录与关联索引 |
| transaction.js | 同步业务事务整体提交或回滚 |

## 表与规则

users 是姓名白名单；options 是当前餐厅及软删除状态；option_logs 保存新增、改名、删除快照
spin_records 保存抽签用户、分类、当时名称；polls 保存创建时模式、时长和抽签关联
poll_choices 保存投票候选项名称与语义编号快照；poll_ballots 保存用户选择；settings 保存全局默认配置
迁移补齐既有选项的添加记录，保留原添加人及时间；唯一索引保证重复启动不重复补日志
首次餐厅由选项领域逐项执行新增并写入 add 记录；全部软删除后不会重新出现

## 修改与验证

新增字段写到 migrations.js，使用实际结构判断是否需要执行，保证重复启动安全
不删除现存字段或改写历史名称来完成结构升级
事务只在服务层调用 transaction，仓库只执行语句，不能嵌套事务或传入异步回调

升级前停止服务并复制整个 data 目录，恢复时也先停止进程再完整恢复目录
开发使用独立 DATA_DIR；测试只能访问 eat-what-check- 前缀临时目录
