# 端到端场景

按业务场景组织检查；从 ../fixtures/app.cjs 导入 test 和 expect，复用 ../helpers/browser.cjs 的登录与导航操作

wheel-labels.spec.cjs 通过真实选项接口创建超过 18 个外卖候选，进入转盘后切换基础、霓虹和奶龙皮肤，捕获 Canvas 实际绘制的文字，断言每个扇区始终显示完整选项名，不出现 1 到 19 的序号。
