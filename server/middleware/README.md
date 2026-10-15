# 中间件

identity.js 解码 x-user-name 并从姓名仓库校验，将结果写入 req.userName
公开 bootstrap 路由在身份中间件前注册，其余领域接口必须在身份校验之后
errors.js 区分 JSON 格式、请求大小、业务错误和内部故障，返回 errorCode 与中文 error
业务服务通过 shared/errors.js 的 fail 抛出明确错误，内部故障记录到启动窗口
