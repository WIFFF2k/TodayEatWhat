// 验证操作留痕的完整用户流程
const { test, expect } = require('../fixtures/app.cjs');
const { headers, login, pageTo, username, secondName } = require('../helpers/browser.cjs');
const path = require('path');
test('重命名和删除跨设备同步并保留添加人、历史和投票快照', async ({page,browser,request}) => {
  // 用真实新增、抽签和投票产生数据，再由两个用户编辑和删除
  const ctx=await browser.newContext(); const other=await ctx.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message)); other.on('pageerror',e=>errors.push(e.message));
  await login(page); await login(other,secondName); await pageTo(page,'选项');
  await page.locator('#newName').fill('留痕餐厅'); await page.locator('#addForm button').click();
  await expect(page.locator('#additionLog')).toContainText('留痕餐厅');
  const all=await (await request.get('/api/options',{headers:headers()})).json(); const item=all.find(x=>x.name==='留痕餐厅');
  for(const option of all.filter(x=>x.category==='外卖'&&x.id!==item.id)) await request.patch('/api/options/'+option.id,{headers:headers(),data:{enabled:false}});
  const draw=await (await request.post('/api/spins',{headers:headers(),data:{category:'外卖'}})).json(); expect(draw.winner.id).toBe(item.id);
  await request.patch('/api/options/1',{headers:headers(),data:{enabled:true}});
  const created=await (await request.post('/api/polls',{headers:headers(),data:{spinId:draw.id}})).json();
  await pageTo(other,'选项');
  await page.locator('[data-rename="'+item.id+'"]').click(); await page.locator('#renameName').fill('取消的名称'); await page.locator('#optionCancel').click();
  await expect(page.locator('[data-row="'+item.id+'"]').locator('label')).toContainText('留痕餐厅');
  await page.locator('[data-rename="'+item.id+'"]').click(); await page.locator('#renameName').fill('大米先生'); await page.locator('#optionConfirm').click();
  await expect(page.locator('#optionEditError')).toContainText('同名');
  const renamed='<b>留痕新店</b>'; await page.locator('#renameName').fill(renamed);
  await page.waitForTimeout(3300); await expect(page.locator('#renameName')).toHaveValue(renamed);
  await page.locator('#optionConfirm').click(); await expect(page.locator('#optionDialog')).not.toBeVisible();
  await expect(other.locator('[data-row="'+item.id+'"]').locator('label')).toContainText(renamed,{timeout:10000});
  await expect(other.locator('#additionLog')).toContainText('留痕餐厅 → '+renamed); expect(await other.locator('#optionGroups b').count()).toBe(0);
  await other.locator('[data-delete="'+item.id+'"]').click(); await other.locator('#optionCancel').click(); await expect(other.locator('[data-row="'+item.id+'"]').locator('input')).toBeChecked();
  await other.locator('[data-delete="'+item.id+'"]').click(); await other.locator('#optionConfirm').click(); await expect(other.locator('[data-row="'+item.id+'"]')).toHaveCount(0);
  await expect(page.locator('[data-row="'+item.id+'"]')).toHaveCount(0,{timeout:10000});
  await expect(page.locator('#additionLog')).toContainText('杨淑慧 删除 · 外卖');
  const logs=await (await request.get('/api/option-logs',{headers:headers()})).json(); const trail=logs.items.filter(x=>x.optionId===item.id);
  expect(trail.map(x=>x.action)).toEqual(['delete','rename','add']); expect(trail.map(x=>x.actor)).toEqual([secondName,username,username]);
  expect(trail[1]).toMatchObject({oldName:'留痕餐厅',newName:renamed}); expect(trail.every(x=>Number.isFinite(x.createdAt))).toBe(true);
  const history=await (await request.get('/api/records',{headers:headers()})).json(); expect(history[0].optionName).toBe('留痕餐厅');
  const poll=await (await request.get('/api/polls/'+created.id,{headers:headers()})).json(); expect(poll.choices.map(x=>x.name)).toContain('留痕餐厅'); expect(poll.proposedName).toBe('留痕餐厅');
  const next=await (await request.post('/api/spins',{headers:headers(),data:{category:'外卖'}})).json(); expect(next.entries.map(x=>x.id)).not.toContain(item.id);
  const newPoll=await (await request.post('/api/polls',{headers:headers(),data:{spinId:next.id}})).json(); expect(newPoll.errorCode).toBe('POLL_CHOICES_INSUFFICIENT');
  expect((await request.patch('/api/options/'+item.id,{headers:headers(),data:{enabled:true}})).status()).toBe(404);
  expect((await request.delete('/api/options/'+item.id,{headers:headers()})).status()).toBe(404);
  await page.setViewportSize({width:320,height:844}); await page.locator('[data-rename="1"]').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const box=await page.locator('#optionDialog').boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(320);
  await page.screenshot({path:'test-results/options-dialog-mobile.png',fullPage:true}); await page.locator('#optionCancel').click();
  await page.setViewportSize({width:1280,height:900}); await page.screenshot({path:'test-results/options-desktop.png',fullPage:true});
  expect(errors).toEqual([]); await ctx.close();
});

