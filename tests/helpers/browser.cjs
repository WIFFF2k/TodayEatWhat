// 验证真实网页操作与服务器持久化之间的完整业务链路
const { expect } = require('@playwright/test');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const username = '刘心怡'; const secondName = '杨淑慧';
function headers(name = username) {
  // 使用生产接口规定的中文编码身份
  return { 'x-user-name': encodeURIComponent(name) };
}
function database() {
  // 只允许访问本轮检查创建的临时数据目录
  if (!process.env.DATA_DIR || !path.basename(process.env.DATA_DIR).startsWith('eat-what-check-')) throw new Error('检查数据库没有隔离');
  return new DatabaseSync(path.join(process.env.DATA_DIR,'eat-what.db'));
}
async function login(page, name = username) {
  // 从登录页面选择真实姓名进入
  await page.goto('/'); await page.locator('#loginName').selectOption(name); await page.getByRole('button',{name:'进入',exact:true}).click(); await expect(page.locator('#spin')).toBeVisible();
}
async function pageTo(page, name) {
  // 点击侧栏切换页面并等待功能标题
  await page.locator('nav').getByRole('button',{name,exact:true}).click(); await expect(page.locator('#pageTitle')).toHaveText(name);
  const ready = { '转盘':'#spin', '选项':'#addForm', '投票':'#pollList', '回忆':'#memoryForm', '记录':'.pager', '设置':'#settingsForm' };
  await expect(page.locator(ready[name])).toBeVisible();
}
async function spin(page) {
  // 抽签结果必须来自真实接口并最终出现在页面上
  const response = page.waitForResponse(r => r.url().endsWith('/api/spins') && r.request().method() === 'POST');
  await page.locator('#spin').click(); const result = await (await response).json();
  await expect(page.locator('#result strong')).toHaveText(result.winner.name, { timeout:10000 });
  await expect(page.locator('nav button').first()).toBeEnabled();
  return result;
}

module.exports = { headers, database, login, pageTo, spin, username, secondName };
