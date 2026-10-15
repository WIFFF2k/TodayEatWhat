// 验证失败恢复的完整用户流程
const { test, expect } = require('../fixtures/app.cjs');
const { headers, login, pageTo, spin } = require('../helpers/browser.cjs');
const path = require('path');
test('请求失败能恢复操作，抽签中禁止切页，失败的设置不写入', async ({ page, request }) => {
  // 故障发生在真实请求边界，最终断言界面和数据库均保持正确状态
  const errors=[]; page.on('pageerror',e=>errors.push(e.message)); await login(page);
  await page.route('**/api/spins',route=>route.abort()); await page.locator('#spin').click(); await expect(page.locator('#toast')).toContainText('连接失败'); await expect(page.locator('#spin')).toBeEnabled();
  expect(await (await request.get('/api/records',{headers:headers()})).json()).toEqual([]); await page.unroute('**/api/spins');
  await page.locator('#spin').click(); await expect(page.locator('nav button').first()).toBeDisabled(); await expect(page.locator('#category')).toBeDisabled(); await expect(page.locator('#result strong')).toBeVisible({timeout:10000}); await expect(page.locator('nav button').first()).toBeEnabled();
  await pageTo(page,'设置'); await page.locator('#mode').selectOption('multiple'); await page.locator('#minutes').fill('10');
  await page.route('**/api/settings',route=>route.request().method()==='PUT'?route.abort():route.continue()); await page.locator('#settingsForm button').click(); await expect(page.locator('#toast')).toContainText('连接失败'); await expect(page.locator('#minutes')).toHaveValue('10');
  expect(await (await request.get('/api/settings',{headers:headers()})).json()).toEqual({pollMode:'single',pollMinutes:60}); await page.unroute('**/api/settings');
  await page.locator('#switch').click(); await expect(page.locator('#loginName')).toBeVisible(); expect(await page.evaluate(()=>localStorage.getItem('eat-user'))).toBe(null); expect(errors).toEqual([]);
});
