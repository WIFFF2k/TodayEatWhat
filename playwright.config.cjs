// 配置隔离数据库下的真实浏览器端到端检查
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: '**/*.spec.cjs', workers: 1, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:20281', channel: 'msedge', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node server.js', url: 'http://127.0.0.1:20281/api/instance', reuseExistingServer: false, env: { PORT: '20281', OPEN_BROWSER: '0' }, timeout: 15000 },
  reporter: [['list']]
});
