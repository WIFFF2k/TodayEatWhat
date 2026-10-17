# 吃饭回忆

共享吃饭回忆帖：任何人都能发布带照片、感想和参与人员的帖子，也能浏览和删除自己的帖子

| 文件 | 职责 |
| --- | --- |
| routes.js | 分页列表、发帖、删帖入口 |
| repositories/memories.js | memories 表查询与写入 |
| services/memories.js | 输入校验、照片校验与业务编排 |
