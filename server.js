// 设置部署时区后启动今天吃啥服务
process.env.TZ = 'Asia/Shanghai';
require('./server/runtime/start');
