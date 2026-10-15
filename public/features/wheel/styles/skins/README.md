# 转盘皮肤样式

base.css 维护各皮肤共用的工具栏、盘面和状态布局；basic.css、neon.css、milk-frog.css 通过 data-skin 限定各自外观。

新增皮肤时，保持选择器以 .wheel-card[data-skin="皮肤标识"] 开头，并在 public/styles/index.css 增加对应样式导入。
