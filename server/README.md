# 服务端

## 请求链路

server.js 设置上海时区 → runtime/start.js 监听 → app.js 装配 Express → routes.js 装配业务路由
/api/instance、/api/bootstrap 为公开入口，其余接口经过 middleware/identity.js 校验姓名
完整 HTTP 契约见 [API.md](API.md)

## 模块分工

| 模块 | 职责 |
| --- | --- |
| [identity](modules/identity/README.md) | 姓名白名单和登录启动信息 |
| [options](modules/options/README.md) | 新增、启用、改名、分类移动、软删除、日志 |
| [wheel](modules/wheel/README.md) | 等概率抽签及名称快照 |
| [polls](modules/polls/README.md) | 投票创建、改票、详情和通知 |
| [settings](modules/settings/README.md) | 全局默认投票配置 |
| [records](modules/records/README.md) | 分页历史和关联投票 |

routes 只处理 HTTP 参数和响应；services 编排校验与事务；repositories 执行 SQL
简单查询允许路由直接调用仓库，跨领域查询使用明确的查询函数，仓库不反向依赖服务

## 基础能力

- [database](database/README.md)：唯一连接、建表、种子、迁移和事务
- [runtime](runtime/README.md)：监听、局域网地址和重复启动
- [middleware](middleware/README.md)：身份校验、统一错误响应
- [shared](shared/README.md)：时间、业务错误、分页参数、用餐分类
- [config](config/README.md)：项目根目录与数据、静态资源路径

后端修改需要重启进程，默认端口 20180，默认数据目录仍是项目根目录 data
