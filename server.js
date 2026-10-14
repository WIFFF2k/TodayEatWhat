// 启动今天吃啥的局域网网页服务
const express = require('express');
const os = require('os');
const path = require('path');
process.env.TZ = 'Asia/Shanghai';
const { spawn } = require('child_process');
const routes = require('./server/routes');

const app = express();
const port = Number(process.env.PORT || 20180);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('[INVALID_PORT] PORT 必须是 1 到 65535 的整数');
  process.exit(1);
}
app.use(express.json());
app.get('/api/instance', (req, res) => {
  // 提供本地启动器核对本站实例所需的标识
  res.json({ application: 'today-eat-what', directory: __dirname });
});
app.use('/api', routes);
app.use('/api', (req, res) => {
  // 未定义的接口返回 JSON 错误而非网页
  res.status(404).json({ errorCode: 'API_NOT_FOUND', error: '请求的功能不存在' });
});
app.use((error, req, res, next) => {
  // 区分输入错误和内部故障，并记录真正的服务错误
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') return res.status(400).json({ errorCode: 'JSON_INVALID', error: '提交内容格式错误' });
  if (error.type === 'entity.too.large') return res.status(413).json({ errorCode: 'BODY_TOO_LARGE', error: '提交内容过大' });
  if (error.errorCode) return res.status(error.status).json({ errorCode: error.errorCode, error: error.message });
  console.error(error);
  res.status(500).json({ errorCode: 'SERVER_ERROR', error: '服务处理失败，请查看启动窗口中的错误信息' });
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const server = app.listen(port, '0.0.0.0', () => {
  // 服务成功监听后显示地址并按启动参数打开浏览器
  console.log(`本机访问：http://localhost:${port}`);
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces || []) if (item.family === 'IPv4' && !item.internal) console.log(`局域网访问：http://${item.address}:${port}`);
  }
  console.log('服务已启动，请保持此窗口打开，按 Ctrl+C 停止服务');
  openBrowser();
});

function openBrowser() {
  // 按启动参数打开已经运行的本站地址
  if (process.env.OPEN_BROWSER === '1' && process.platform === 'win32') {
    const browser = spawn('cmd.exe', ['/d', '/c', 'start', '""', `http://localhost:${port}`], { windowsHide: true });
    browser.on('error', (error) => {
      // 浏览器启动失败时保留正常服务并报告具体原因
      console.error(`[BROWSER_OPEN_FAILED] 自动打开浏览器失败，请手动打开上述本机地址：${error.message}`);
    });
    browser.on('exit', (code) => {
      // 命令执行失败时提示用户手动打开页面
      if (code !== 0) console.error(`[BROWSER_OPEN_FAILED] 浏览器未打开，请访问 http://localhost:${port}`);
    });
  }
}

server.on('error', async (error) => {
  // 根据实际监听错误解释启动失败原因并返回失败状态
  if (error.code === 'EACCES') {
    console.error(`[EACCES] 端口 ${port} 被系统保留或禁止使用，请设置 PORT 为可用端口后重试`);
  } else if (error.code === 'EADDRINUSE') {
    try {
      // 仅复用同一个项目的实例，不把其他服务当作本站
      const response = await fetch(`http://127.0.0.1:${port}/api/instance`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error(`服务标识接口返回 ${response.status}`);
      const instance = await response.json();
      if (instance.application !== 'today-eat-what' || instance.directory !== __dirname) {
        throw new Error('占用端口的服务不是当前项目');
      }
      console.log(`网站已经启动，直接打开：http://localhost:${port}`);
      openBrowser();
      return;
    } catch (cause) {
      console.error(`[EADDRINUSE] 端口 ${port} 已被占用，无法确认为本站：${cause.message}`);
    }
  } else {
    console.error(`[${error.code}] 服务启动失败：${error.message}`);
  }
  process.exit(1);
});
