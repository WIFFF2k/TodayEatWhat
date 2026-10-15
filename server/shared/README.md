# 后端共享工具

time.js 统一上海时间转换、17:00 分界标题；errors.js 创建携带状态码和业务编码的错误
pagination.js 校验 offset 非负安全整数，投票和历史等 offset 列表保持每页 30 条；categories.js 统一用餐分类 key、显示名及历史值迁移
共享层不依赖 Express、领域服务或数据库，不增加通用业务分支
