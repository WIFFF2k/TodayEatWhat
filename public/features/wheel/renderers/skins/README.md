# 转盘皮肤渲染模块

每个皮肤文件导出一套完整配置，包含 id、label、duration、statuses、content、draw 和 celebrate。

shared.js 提供统一扇区几何、文字绘制和粒子动画；index.js 负责装配皮肤清单并对未知标识回退到基础皮肤。

新增皮肤时，在 index.js 登记新模块，并把对应 CSS 放入 styles/skins 目录后接入 styles/index.css。
