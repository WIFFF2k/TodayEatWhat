# 今天吃啥（201版）

201 同学共同维护的吃饭决策网站，包含姓名登录、分类转盘、共享餐厅、投票、操作留痕和历史记录

## 启动

需要 Node.js 24 及以上和 npm；运行浏览器回归需要 Microsoft Edge

    npm ci
    npm start

Windows 可双击根目录 start.bat，脚本检查环境、安装缺失依赖并打开浏览器
本机访问 http://localhost:20180；其他设备打开启动窗口中实际联网网卡的 http://电脑IP:20180
电脑需保持开机、服务窗口保持运行，按 Ctrl+C 停止

localhost 指向当前设备，VirtualBox、VMware 等虚拟网卡地址不能作为手机访问地址
同一 WiFi 仍需允许设备互访；连接失败时检查地址、服务监听、Windows 对 Node.js 的入站权限和校园网隔离
重复启动确认同一项目后复用旧进程；修改后端代码需先停止旧服务再启动

## 同学们从哪里开始

| 内容 | 代码入口 | 说明 |
| --- | --- | --- |
| 页面、交互、皮肤 | public/features/ | [前端](public/README.md) |
| 接口和业务规则 | server/modules/ | [服务端](server/README.md) |
| 数据表、白名单、迁移 | server/database/ | [数据库](server/database/README.md) |
| 端口和局域网启动 | server/runtime/、start.bat | [启动](server/runtime/README.md) |
| 自动化检查 | tests/e2e/ | [测试](tests/README.md) |
| 分工、提交、联调 | 全仓库 | [协作约定](CONTRIBUTING.md) |
| 请求、返回、错误 | /api | [接口约定](server/API.md) |

## 目录结构

    server.js                  设置时区并启动服务
    start.bat                  Windows 一键启动
    server/
      app.js、routes.js        应用与接口装配
      config/                  项目路径配置
      runtime/                 监听、地址提示、重复启动处理
      middleware/              姓名校验、统一错误
      database/                唯一连接、建表、种子、迁移、事务
      shared/                  时间、分页、业务错误
      modules/
        identity/ options/ wheel/ polls/ settings/ records/
          routes.js            HTTP 入口
          services/            校验、业务编排、事务（按需）
          repositories/        SQL 和查询
    public/
      index.html、app.js        页面和脚本入口
      application/             登录、路由、同步、请求代次
      shared/                  请求、状态、显示、交互
      styles/                  基础样式与装配入口
      features/
        wheel/ options/ polls/ settings/ records/
          views/               页面控制
          components/          功能内组件（按需）
          renderers/           转盘绘制（按需）
          styles/              功能样式（按需）
    tests/
      e2e/                     按业务分组的浏览器场景
      fixtures/                每个用例的数据隔离
      helpers/                 登录、抽签、导航共用操作
      run.cjs                  临时目录和测试进程生命周期

## 独立开发实例

PowerShell 示例：

    $env:PORT='20181'
    $env:DATA_DIR='./data/dev'
    $env:OPEN_BROWSER='0'
    npm start

所有人访问同一个服务才共享数据；各自运行的数据库不会自动合并
网页修改后刷新生效，后端修改后重启生效；使用原生浏览器模块，无构建步骤

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| PORT | 20180 | HTTP 监听端口 |
| DATA_DIR | 项目根目录 data | 数据目录；自定义相对路径相对于启动工作目录 |
| OPEN_BROWSER | 未设置 | Windows 设为 1 后自动打开浏览器 |

## 业务约定

- 标题按上海时间计算，17:00 前为中午，之后为晚上
- 转盘刷新后默认出去吃，皮肤默认基础，皮肤偏好保存在当前浏览器
- 选项增删改和勾选全局共享；新增、重命名、删除留痕，已有抽签与投票名称保持快照
- 抽签由服务端生成；每次抽签只能由本人发起一个投票，默认单选、60 分钟
- 修改设置只影响新投票，截止前允许改票
- 前台非忙碌时每 3 秒更新通知、当前选项和投票详情；设置、历史和投票列表重新进入后读取
- 无密码姓名选择用于熟人协作，无法防止他人选择同一姓名

## 验证与数据维护

    npm test

测试使用独立临时数据和 20281、20282 端口，不写入正式数据库，详见 [测试说明](tests/README.md)
正式数据默认在 data/eat-what.db；升级前停止服务并备份整个 data 目录，启动时自动执行迁移
data、node_modules、测试报告和截图已被 Git 忽略
