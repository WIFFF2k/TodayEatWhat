# 前端

原生 ES Modules、HTML、CSS 和 Canvas，由 Express 静态服务提供，无构建步骤
index.html 加载 styles/index.css 和 app.js，应用层处理会话、页面和同步

## 应用层

- [application](application/README.md)：会话、路由、同步及过期响应保护
- [shared](shared/README.md)：唯一状态、请求、文字和时间、交互工具
- [styles](styles/README.md)：基础与功能样式装配

页面通过 navigate 事件切换，generation 防止旧响应覆盖新页，busy 在提交或旋转期间锁定导航
后台同步保留未提交名称与选票；功能模块不要自行另起轮询计时器

## 功能分工

| 模块 | 维护入口 |
| --- | --- |
| [wheel](features/wheel/README.md) | 页面、Canvas 绘制、基础、霓虹和奶龙转盘样式 |
| [game](features/game/README.md) | 今日空战、敌机战斗和终点转盘结果 |
| [options](features/options/README.md) | 添加和勾选、拖动归类、编辑确认、操作记录 |
| [polls](features/polls/README.md) | 投票列表、详情、改票和票数同步 |
| [settings](features/settings/README.md) | 全局默认配置表单 |
| [records](features/records/README.md) | 历史分页、跳转关联投票 |

新增页面在 application/router.js 注册，在 application/session.js 添加导航
文本进入 HTML 前使用 shared/display.js 的 escape，姓名编码由 shared/api.js 统一处理

## 外观约定

转盘刷新默认 casual_out；皮肤默认基础，localStorage 保存 eat-user、eat-wheel-skin、eat-option-log-size
皮肤与当前分类各浏览器独立，餐厅和投票经服务器共享
分类使用稳定 key，显示名由 bootstrap.categories 提供；前三类桌面三列同排，待定在下一行跨满三列总宽度，手机按顺序单列；添加控件等高对齐
修改后刷新浏览器，缓存未更新用 Ctrl+F5；功能 CSS 放入自己的 styles 目录
