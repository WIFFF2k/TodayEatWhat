// 验证候选边界的完整用户流程
const { test, expect } = require('../fixtures/app.cjs');
const { headers, database, login, pageTo, spin } = require('../helpers/browser.cjs');
const path = require('path');
const { spawn } = require('child_process');
test('边界候选、旧投票分页、事务回滚及重复启动有明确行为', async ({ page, request }) => {
  // 请求只写临时库，验证边界与持久化事实
  const all=await (await request.get('/api/options',{headers:headers()})).json();
  for (const option of all.filter(x=>x.category==='外卖')) await request.patch('/api/options/'+option.id,{headers:headers(),data:{enabled:false}});
  await login(page); await page.locator('#category').selectOption('外卖'); await expect(page.locator('#spin')).toBeDisabled(); expect((await request.post('/api/spins',{headers:headers(),data:{category:'外卖'}})).status()).toBe(409);
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
  const duplicate=await new Promise(resolve=>{ const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,PORT:'20281',OPEN_BROWSER:'0'}}); let output=''; child.stdout.on('data',data=>output+=data); child.on('close',code=>resolve({code,output})); });
  expect(duplicate.code).toBe(0); expect(duplicate.output).toContain('网站已经启动');
});
