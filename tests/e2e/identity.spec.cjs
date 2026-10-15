// 验证身份校验的完整用户流程
const { test, expect } = require('../fixtures/app.cjs');
const { headers, login, spin } = require('../helpers/browser.cjs');
const path = require('path');
test('中文身份、刷新恢复、非法输入和接口错误均可明确处理', async ({ page, request }) => {
  // 沿真实身份入口覆盖所有已配置白名单姓名
  const bootstrap = await (await request.get('/api/bootstrap')).json();
  expect(bootstrap.users).toEqual(expect.arrayContaining(['刘心怡','马烜','徐箫炯','常新雨']));
  for (const name of bootstrap.users) expect((await request.get('/api/options',{ headers:headers(name) })).status()).toBe(200);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await login(page); await page.reload(); await expect(page.locator('#spin')).toBeVisible();
  expect((await request.get('/api/options')).status()).toBe(401);
  expect((await request.get('/api/options',{headers:headers('不存在')})).status()).toBe(401);
  expect((await request.get('/api/options',{headers:{'x-user-name':'%E0%A4%A'}})).status()).toBe(400);
  expect((await request.patch('/api/options/1',{headers:headers(),data:{enabled:'false'}})).status()).toBe(400);
  expect((await request.put('/api/settings',{headers:headers(),data:{pollMode:'bad',pollMinutes:60}})).status()).toBe(400);
  expect((await request.put('/api/settings',{headers:headers(),data:{pollMode:'single',pollMinutes:0}})).status()).toBe(400);
  expect((await request.post('/api/options',{headers:headers(),data:{name:'大米先生',category:'外卖'}})).status()).toBe(409);
  const malformed=await request.post('/api/options',{headers:{...headers(),'Content-Type':'application/json'},data:'{'}); expect(malformed.status()).toBe(400); expect((await malformed.json()).errorCode).toBe('JSON_INVALID');
  const invalid = await request.get('/api/does-not-exist',{headers:headers()}); expect(invalid.status()).toBe(404); expect((await invalid.json()).errorCode).toBe('API_NOT_FOUND');
  expect(errors).toEqual([]);
});
