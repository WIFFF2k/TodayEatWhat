// 装配接口、中间件和静态资源，不启动监听
const express = require('express');
const path = require('path');
const { projectRoot, publicDir } = require('./config/paths');
const routes = require('./routes');
const errorHandler = require('./middleware/errors');
const app = express();
app.use(express.json());
app.get('/api/instance', (req, res) => {
  // 启动器核对当前项目实例
  res.json({ application: 'today-eat-what', directory: projectRoot });
});
app.use('/api', routes);
app.use('/api', (req, res) => {
  // 未定义接口始终返回 JSON 错误
  res.status(404).json({ errorCode: 'API_NOT_FOUND', error: '请求的功能不存在' });
});
app.use(errorHandler);
app.use(express.static(publicDir));
app.get('*', (req, res) => {
  // 浏览器页面入口保持不变
  res.sendFile(path.join(publicDir, 'index.html'));
});
module.exports = app;
