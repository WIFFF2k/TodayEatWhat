// 验证选项同步的完整用户流程
const { test, expect } = require('../fixtures/app.cjs');
const { login, pageTo, spin, secondName } = require('../helpers/browser.cjs');
const path = require('path');
test('两个设备共享选项，转盘落点、结果和历史记录一致', async ({ page, browser, request }) => {
  // 通过两个隔离浏览器会话检查实时共享和抽签落库
  const otherContext = await browser.newContext(); const other = await otherContext.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message)); other.on('pageerror',e=>errors.push(e.message));
  await login(page); await login(other,secondName); await pageTo(page,'选项');
  await other.locator('#category').selectOption('外卖');
  const name = '<img src=x onerror=alert(1)>很长的餐厅名称（金地太阳城分店）';
  await page.locator('#newName').fill(name); await page.locator('#addForm button').click();
  await expect(page.locator('#additionLog').getByText(name,{exact:true})).toBeVisible();
  await expect(page.locator('#additionLog').getByText('刘心怡 添加 · 外卖',{exact:true})).toBeVisible();
  expect(await page.locator('#optionGroups img').count()).toBe(0);
  await expect(other.locator('#wheelCount')).toContainText('7 项',{timeout:10000});
  const checkbox = page.locator('label.option').filter({hasText:name}).locator('input'); await checkbox.uncheck();
  await expect(other.locator('#wheelCount')).toContainText('6 项',{timeout:10000});
  await page.locator('#newName').fill('尚未提交'); await page.waitForTimeout(3200); await expect(page.locator('#newName')).toHaveValue('尚未提交');
  const result=await spin(other);
  expect(result.entries.map(x=>x.name)).not.toContain(name);
  const angle=Number(await other.locator('#wheel').getAttribute('data-angle'));
  expect(((result.index+0.5)*360/result.entries.length+angle)%360).toBeCloseTo(0,6);
  await pageTo(other,'记录'); await expect(other.locator('.record strong').first()).toHaveText(result.winner.name);
  await expect(other.locator('.record').first()).toContainText(secondName);
  await page.route('**/api/options/*',route=>route.abort()); const previous=await checkbox.isChecked(); await checkbox.check(); await expect(checkbox).not.toBeChecked(); await expect(page.locator('#toast')).toContainText('连接失败'); expect(previous).toBe(false); await page.unroute('**/api/options/*');
  expect(errors).toEqual([]); await otherContext.close();
});
