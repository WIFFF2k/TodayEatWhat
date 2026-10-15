// 验证选项冲突的完整用户流程
const { test, expect } = require('../fixtures/app.cjs');
const { headers, database, login, pageTo, secondName } = require('../helpers/browser.cjs');
const path = require('path');
test('选项并发冲突、无效输入、写入失败和分页日志都有明确结果', async ({page,request}) => {
  // 真实接口写入与数据库故障注入检验原子性，不在正式库构造数据
  const item=await (await request.post('/api/options',{headers:headers(),data:{name:'并发餐厅',category:'外卖'}})).json(); const url='/api/options/'+item.id;
  await login(page); await pageTo(page,'选项'); await page.locator('[data-rename="'+item.id+'"]').click(); await page.locator('#renameName').fill('本机草稿');
  await request.patch(url,{headers:headers(secondName),data:{name:'别人改名'}});
  await page.locator('#optionConfirm').click(); await expect(page.locator('#optionEditError')).toContainText('其他人已重命名'); await expect(page.locator('#renameName')).toHaveValue('本机草稿'); await page.locator('#optionCancel').click();
  for(const name of ['', ' ', '长'.repeat(61)]) expect((await request.patch(url,{headers:headers(),data:{name}})).status()).toBe(400);
  expect((await request.patch('/api/options/invalid',{headers:headers(),data:{name:'名称'}})).status()).toBe(400);
  expect((await request.patch(url,{headers:headers(),data:{name:'别人改名'}})).status()).toBe(200);
  let logs=await (await request.get('/api/option-logs',{headers:headers()})).json(); expect(logs.items.filter(x=>x.optionId===item.id)).toHaveLength(2);
  const db=database(); db.exec("CREATE TRIGGER fail_option_log BEFORE INSERT ON option_logs BEGIN SELECT RAISE(ABORT,'检查留痕事务回滚'); END");
  try {
    expect((await request.patch(url,{headers:headers(),data:{name:'不会保存'}})).status()).toBe(500);
    expect((await request.delete(url,{headers:headers()})).status()).toBe(500);
    expect((await request.post('/api/options',{headers:headers(),data:{name:'不会添加',category:'外卖'}})).status()).toBe(500);
  } finally { db.exec('DROP TRIGGER fail_option_log'); db.close(); }
  const all=await (await request.get('/api/options',{headers:headers()})).json(); expect(all.find(x=>x.id===item.id).name).toBe('别人改名'); expect(all.some(x=>x.name==='不会添加')).toBe(false);
  await pageTo(page,'转盘'); await pageTo(page,'选项'); await page.locator('[data-delete="'+item.id+'"]').click();
  await page.route('**/api/options/'+item.id,route=>route.request().method()==='DELETE'?route.abort():route.continue());
  await page.locator('#optionConfirm').click(); await expect(page.locator('#optionEditError')).toContainText('连接失败'); await expect(page.locator('#optionConfirm')).toBeEnabled(); await page.unroute('**/api/options/'+item.id); await page.locator('#optionCancel').click();
  for(let i=0;i<32;i++) await request.patch(url,{headers:headers(),data:{name:'分页餐厅'+i}});
  await pageTo(page,'转盘'); await pageTo(page,'选项'); await expect(page.locator('#additionLog .record')).toHaveCount(30); await page.locator('#logNext').click(); await expect(page.locator('#logPage')).toHaveText('第 2 页');
  await expect(page.locator('#additionLog')).toContainText('张圣楚 添加'); await page.locator('#logPrev').click(); await expect(page.locator('#additionLog')).toContainText('分页餐厅31');
  expect((await request.delete(url,{headers:headers(),data:{expectedName:'旧名称'}})).status()).toBe(409);
  expect((await request.delete(url,{headers:headers()})).status()).toBe(200);
  expect((await request.post('/api/options',{headers:headers(),data:{name:'分页餐厅31',category:'外卖'}})).status()).toBe(201);
});
