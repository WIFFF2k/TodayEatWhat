# 共享样式

index.css 按 base → layout → components → 各功能 styles → 皮肤样式装配
base.css 维护字体、盒模型和控件基本交互；layout.css 维护侧栏、登录、主区域和响应式布局
components.css 维护跨页面复用的卡片、表单、列表、通知和按钮

功能专属选择器放到 features 对应 styles 目录
保持现有媒体查询和选择器语义，修改共享尺寸需要检查桌面、390px、320px
皮肤样式通过 data-skin 限定范围，不能影响基础皮肤和其他功能
