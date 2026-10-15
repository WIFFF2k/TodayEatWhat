// 验证重启持久化的完整用户流程
const { test, expect } = require('../fixtures/app.cjs');
const { headers, database, login, pageTo } = require('../helpers/browser.cjs');
const path = require('path');
const { spawn } = require('child_process');
test('重启后选项、记录与投票数据保留，无人投票截止有明确结果', async ({ request, page }) => {
  // 使用同一个临时数据库启动独立服务进程并实际重启
  const deleted=await (await request.post('/api/options',{headers:headers(),data:{name:'重启删除检查',category:'外卖'}})).json();
  await request.patch('/api/options/'+deleted.id,{headers:headers(),data:{name:'重启改名检查'}});
  await request.delete('/api/options/'+deleted.id,{headers:headers()});
  const logsBefore=await (await request.get('/api/option-logs',{headers:headers()})).json();
  const draw=await (await request.post('/api/spins',{headers:headers(),data:{category:'出去吃'}})).json();
  const created=await (await request.post('/api/polls',{headers:headers(),data:{spinId:draw.id}})).json();
  const db=database(); db.prepare("UPDATE polls SET created_at=datetime('now','+8 hours','-2 hours') WHERE id=?").run(created.id); db.close();
  await login(page); await pageTo(page,'投票'); await page.locator('[data-poll="'+created.id+'"]').click(); await expect(page.locator('#pollOutcome')).toHaveText('本次投票无人参与');
  async function boot() {
    // 等待真实服务监听日志后再发出访问请求
    return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,PORT:'20282',OPEN_BROWSER:'0'}}); child.on('error',reject); child.on('exit',code=>{if(code)reject(new Error('重启检查服务退出 '+code));}); child.stdout.on('data',data=>{if(String(data).includes('服务已启动'))resolve(child);});});
  }
  let child=await boot();
  try {
    const before=await (await request.get('http://127.0.0.1:20282/api/records',{headers:headers()})).json(); expect(before[0].optionName).toBe(draw.winner.name);
    await new Promise(resolve=>{child.once('exit',resolve); child.kill();}); child=await boot();
    const after=await (await request.get('http://127.0.0.1:20282/api/records',{headers:headers()})).json(); expect(after).toEqual(before);
    const poll=await (await request.get('http://127.0.0.1:20282/api/polls/'+created.id,{headers:headers()})).json(); expect(poll.proposedName).toBe(draw.winner.name); expect(poll.closed).toBe(true);
    const optionsAfter=await (await request.get('http://127.0.0.1:20282/api/options',{headers:headers()})).json(); expect(optionsAfter.some(x=>x.id===deleted.id)).toBe(false);
    const logsAfter=await (await request.get('http://127.0.0.1:20282/api/option-logs',{headers:headers()})).json(); expect(logsAfter).toEqual(logsBefore);
  } finally { await new Promise(resolve=>{child.once('exit',resolve); child.kill();}); }
});

