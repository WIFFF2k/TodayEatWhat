// 验证真实网页操作与服务器持久化之间的完整业务链路
const { test, expect } = require('@playwright/test');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { spawn } = require('child_process');
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
  const ready = { '转盘':'#spin', '选项':'#addForm', '投票':'#pollList', '记录':'.pager', '设置':'#settingsForm' };
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
test.beforeEach(async ({ request }) => {
  // 清理临时业务数据并恢复当前项目的原始候选
  const db = database();
  db.exec('DELETE FROM poll_ballots; DELETE FROM poll_choices; DELETE FROM polls; DELETE FROM spin_records; DELETE FROM options WHERE id>12; UPDATE options SET enabled=1;');
  db.prepare('UPDATE settings SET value=? WHERE key=?').run('single','pollMode'); db.prepare('UPDATE settings SET value=? WHERE key=?').run('60','pollMinutes'); db.close();
});
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
test('两个设备共享选项，转盘落点、结果和历史记录一致', async ({ page, browser, request }) => {
  // 通过两个隔离浏览器会话检查实时共享和抽签落库
  const otherContext = await browser.newContext(); const other = await otherContext.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message)); other.on('pageerror',e=>errors.push(e.message));
  await login(page); await login(other,secondName); await pageTo(page,'选项');
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
test('发起投票、通知直达、单选改票、多选设置和截止展示贯通', async ({ page, browser, request }) => {
  // 用户从真实抽签结果发起投票，另一个用户参与并修改选择
  const context=await browser.newContext(); const other=await context.newPage(); await login(page); await login(other,secondName);
  const result=await spin(page); await page.locator('#createPoll').click(); await expect(page.locator('#pollDetail')).toBeVisible();
  const pollId=Number(await page.locator('#pollDetail').getAttribute('data-id'));
  let poll=await (await request.get('/api/polls/'+pollId,{headers:headers()})).json();
  const duplicate=await (await request.post('/api/polls',{headers:headers(),data:{spinId:result.id}})).json(); expect(duplicate.id).toBe(pollId);
  expect(poll.mode).toBe('single'); expect(poll.deadline-poll.createdAt).toBe(60*60000); expect(poll.proposedName).toBe(result.winner.name);
  await expect(other.locator('[data-notification="'+pollId+'"]')).toContainText('刘心怡',{timeout:10000}); await other.locator('[data-notification="'+pollId+'"]').click();
  await other.locator('#voteForm input').nth(0).check(); await other.locator('#voteSubmit').click(); await expect(other.locator('#pollStatus')).toContainText('1 人参与');
  await other.locator('#voteForm input').nth(1).check(); await other.locator('#voteSubmit').click();
  await expect(other.locator('[data-count="'+poll.choices[0].id+'"]')).toHaveText('0 票');
  await expect(other.locator('[data-count="'+poll.choices[1].id+'"]')).toHaveText('1 票');
  await other.locator('#backPoll').click(); await other.locator('[data-poll="'+pollId+'"]').click(); await expect(other.locator('#voteForm input').nth(1)).toBeChecked();
  await pageTo(page,'设置'); await page.locator('#mode').selectOption('multiple'); await page.locator('#minutes').fill('1'); await page.locator('#settingsForm button').click(); await expect(page.locator('#toast')).toContainText('已保存');
  poll=await (await request.get('/api/polls/'+pollId,{headers:headers()})).json(); expect(poll.mode).toBe('single'); expect(poll.minutes).toBe(60);
  await pageTo(page,'转盘'); await spin(page); await page.locator('#createPoll').click(); await expect(page.locator('#pollDetail')).toBeVisible();
  const multiId=Number(await page.locator('#pollDetail').getAttribute('data-id')); await page.locator('#voteForm input').nth(0).check(); await page.locator('#voteForm input').nth(1).check(); await page.locator('#voteSubmit').click();
  await expect(page.locator('#pollStatus')).toContainText('1 人参与'); const multi=await (await request.get('/api/polls/'+multiId,{headers:headers()})).json(); expect(multi.mode).toBe('multiple'); expect(multi.votedChoiceIds).toHaveLength(2);
  expect((await request.post('/api/polls/'+pollId+'/vote',{headers:headers(),data:{choiceIds:[multi.choices[0].id]}})).status()).toBe(400);
  const db=database(); db.prepare("UPDATE polls SET created_at=datetime('now','+8 hours','-2 hours') WHERE id=?").run(multiId); db.close();
  await expect(page.locator('#pollStatus')).toContainText('已截止',{timeout:10000}); await expect(page.locator('#voteSubmit')).toBeDisabled(); await expect(page.locator('#pollOutcome')).toContainText(multi.choices[0].name); await expect(page.locator('#pollOutcome')).toContainText(multi.choices[1].name);
  expect((await request.post('/api/polls/'+multiId+'/vote',{headers:headers(),data:{choiceIds:[multi.choices[0].id]}})).status()).toBe(409);
  await context.close();
});
test('边界候选、旧投票分页、事务回滚及重复启动有明确行为', async ({ page, request }) => {
  // 请求只写临时库，验证边界与持久化事实
  const all=await (await request.get('/api/options',{headers:headers()})).json();
  for (const option of all.filter(x=>x.category==='外卖')) await request.patch('/api/options/'+option.id,{headers:headers(),data:{enabled:false}});
  await login(page); await expect(page.locator('#spin')).toBeDisabled(); expect((await request.post('/api/spins',{headers:headers(),data:{category:'外卖'}})).status()).toBe(409);
  await request.patch('/api/options/1',{headers:headers(),data:{enabled:true}}); await expect(page.locator('#spin')).toBeEnabled({timeout:10000}); const one=await spin(page); expect(one.winner.name).toBe('大米先生');
  expect((await request.post('/api/polls',{headers:headers(),data:{spinId:one.id}})).status()).toBe(409);
  await request.patch('/api/options/2',{headers:headers(),data:{enabled:true}});
  const ids=[];
  for(let i=0;i<32;i++){ const draw=await (await request.post('/api/spins',{headers:headers(),data:{category:'外卖'}})).json(); const p=await (await request.post('/api/polls',{headers:headers(),data:{spinId:draw.id}})).json(); ids.push(p.id); }
  await pageTo(page,'投票'); await expect(page.locator('[data-poll]')).toHaveCount(30); await page.locator('#next').click(); await expect(page.locator('[data-poll]')).toHaveCount(2);
  const old=await (await request.get('/api/polls/'+ids[0],{headers:headers()})).json();
  expect((await request.post('/api/polls/'+old.id+'/vote',{headers:headers(),data:{choiceIds:[old.choices[0].id]}})).status()).toBe(200);
  const db=database(); db.exec("CREATE TRIGGER fail_ballot BEFORE INSERT ON poll_ballots BEGIN SELECT RAISE(ABORT,'检查事务回滚'); END");
  expect((await request.post('/api/polls/'+old.id+'/vote',{headers:headers(),data:{choiceIds:[old.choices[1].id]}})).status()).toBe(500); db.exec('DROP TRIGGER fail_ballot'); db.close();
  const after=await (await request.get('/api/polls/'+old.id,{headers:headers()})).json(); expect(after.votedChoiceIds).toEqual([old.choices[0].id]); expect(after.choices[0].votes).toBe(1);
  const duplicate=await new Promise(resolve=>{ const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'20281',OPEN_BROWSER:'0'}}); let output=''; child.stdout.on('data',data=>output+=data); child.on('close',code=>resolve({code,output})); });
  expect(duplicate.code).toBe(0); expect(duplicate.output).toContain('网站已经启动');
});
test('手机各页面无横向溢出且刷新显示数据，页面没有未捕获异常', async ({ page }) => {
  // 检查真实手机宽度下每个页面的布局和内容
  const errors=[]; page.on('pageerror',e=>errors.push(e.message)); await page.setViewportSize({width:390,height:844}); await login(page);
  for(const width of [390,320]) { await page.setViewportSize({width,height:844}); for(const name of ['转盘','选项','投票','记录','设置']) { await pageTo(page,name); await expect(page.locator('#content .card').first()).toBeVisible(); expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true); } }
  await page.setViewportSize({width:1280,height:900}); await pageTo(page,'转盘'); await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844}); await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});
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
test('重启后选项、记录与投票数据保留，无人投票截止有明确结果', async ({ request, page }) => {
  // 使用同一个临时数据库启动独立服务进程并实际重启
  const draw=await (await request.post('/api/spins',{headers:headers(),data:{category:'出去吃'}})).json();
  const created=await (await request.post('/api/polls',{headers:headers(),data:{spinId:draw.id}})).json();
  const db=database(); db.prepare("UPDATE polls SET created_at=datetime('now','+8 hours','-2 hours') WHERE id=?").run(created.id); db.close();
  await login(page); await pageTo(page,'投票'); await page.locator('[data-poll="'+created.id+'"]').click(); await expect(page.locator('#pollOutcome')).toHaveText('本次投票无人参与');
  async function boot() {
    // 等待真实服务监听日志后再发出访问请求
    return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'20282',OPEN_BROWSER:'0'}}); child.on('error',reject); child.on('exit',code=>{if(code)reject(new Error('重启检查服务退出 '+code));}); child.stdout.on('data',data=>{if(String(data).includes('服务已启动'))resolve(child);});});
  }
  let child=await boot();
  try {
    const before=await (await request.get('http://127.0.0.1:20282/api/records',{headers:headers()})).json(); expect(before[0].optionName).toBe(draw.winner.name);
    await new Promise(resolve=>{child.once('exit',resolve); child.kill();}); child=await boot();
    const after=await (await request.get('http://127.0.0.1:20282/api/records',{headers:headers()})).json(); expect(after).toEqual(before);
    const poll=await (await request.get('http://127.0.0.1:20282/api/polls/'+created.id,{headers:headers()})).json(); expect(poll.proposedName).toBe(draw.winner.name); expect(poll.closed).toBe(true);
  } finally { await new Promise(resolve=>{child.once('exit',resolve); child.kill();}); }
});
