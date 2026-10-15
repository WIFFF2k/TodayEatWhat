// 检查皮肤切换、真实抽签结果、手机布局及减少动态效果
const { test, expect } = require('@playwright/test');
const headers = { 'x-user-name': encodeURIComponent('刘心怡') };
async function enter(page) {
  // 从真实白名单入口进入转盘
  await page.goto('/'); await page.locator('#loginName').selectOption('刘心怡');
  await page.getByRole('button',{name:'进入',exact:true}).click(); await expect(page.locator('#spin')).toBeVisible();
}
test('两套皮肤切换、独立记忆和真实落点与投票保持一致',async({page,browser,request})=>{
  // 独立浏览器上下文检验皮肤偏好不改变其他设备
  const errors=[]; page.on('pageerror',error=>errors.push(error.message)); await enter(page);
  await expect(page.locator('#wheelSkin')).toHaveValue('basic');
  const original=await page.locator('#wheelNames').textContent();
  await page.locator('#wheelSkin').selectOption('neon'); await expect(page.locator('.wheel-card')).toHaveAttribute('data-skin','neon');
  await expect(page.locator('#wheelNames')).toHaveText(original); await expect(page.locator('.neon-intro')).toBeVisible();
  await page.reload(); await expect(page.locator('#wheelSkin')).toHaveValue('neon');
  const context=await browser.newContext();
  try { const other=await context.newPage(); await enter(other); await expect(other.locator('#wheelSkin')).toHaveValue('basic'); } finally {await context.close();}
  const response=page.waitForResponse(r=>r.url().endsWith('/api/spins')&&r.request().method()==='POST');
  await page.locator('#spin').click(); await expect(page.locator('#wheelSkin')).toBeDisabled();
  await expect(page.locator('.wheel-card')).toHaveClass(/is-spinning/); const draw=await (await response).json();
  await expect(page.locator('#result strong')).toHaveText(draw.winner.name,{timeout:10000});
  const angle=Number(await page.locator('#wheel').getAttribute('data-angle'));
  expect(((draw.index+.5)*360/draw.entries.length+angle)%360).toBeCloseTo(0,6);
  await expect(page.locator('.wheel-status')).toContainText('坐标已锁定'); await expect(page.locator('#wheelSkin')).toBeEnabled();
  await expect(page.locator('.prize-particle')).toHaveCount(38);
  await page.setViewportSize({width:1280,height:1050}); await page.screenshot({path:'test-results/neon-desktop.png',fullPage:true});
  await expect(page.locator('.prize-particle')).toHaveCount(0,{timeout:4000});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const canvas=await page.locator('#wheel').boundingBox(); expect(Math.abs(canvas.width-canvas.height)).toBeLessThan(1);
    await expect(page.locator('#wheelSkin')).toBeVisible();
  }
  await page.screenshot({path:'test-results/neon-mobile.png',fullPage:true});
  await page.locator('#wheelSkin').selectOption('basic'); await expect(page.locator('#result strong')).toHaveText(draw.winner.name);
  expect(Number(await page.locator('#wheel').getAttribute('data-angle'))).toBe(angle);
  await expect(page.locator('.neon-intro')).not.toBeVisible();
  await page.locator('#wheelSkin').selectOption('neon');
  await page.locator('#createPoll').click(); await expect(page.locator('#pollDetail')).toBeVisible();
  const id=await page.locator('#pollDetail').getAttribute('data-id'); const poll=await (await request.get('/api/polls/'+id,{headers})).json(); expect(poll.spinId).toBe(draw.id);
  await page.locator('nav').getByRole('button',{name:'转盘',exact:true}).click(); await expect(page.locator('#wheelSkin')).toHaveValue('neon');
  await page.route('**/api/spins',route=>route.abort()); await page.locator('#spin').click();
  await expect(page.locator('#toast')).toContainText('连接失败'); await expect(page.locator('#wheelSkin')).toBeEnabled(); await expect(page.locator('.wheel-card')).not.toHaveClass(/is-spinning/);
  await expect(page.locator('#result strong')).toHaveText(draw.winner.name); expect(errors).toEqual([]);
});
test('减少动态效果与空候选在霓虹皮肤下均可正确显示',async({page,request})=>{
  // 真实候选改变后查看同步行为，再恢复临时数据库中的启用状态
  await page.emulateMedia({reducedMotion:'reduce'}); await enter(page); await page.locator('#wheelSkin').selectOption('neon');
  expect(await page.locator('.ring-inner').evaluate(node=>getComputedStyle(node).animationName)).toBe('none');
  await page.locator('#spin').click(); await expect(page.locator('#result strong')).toBeVisible(); await expect(page.locator('.prize-particle')).toHaveCount(0);
  const all=await (await request.get('/api/options',{headers})).json(); const active=all.filter(item=>item.category==='外卖'&&item.enabled);
  try {
    for(const item of active) await request.patch('/api/options/'+item.id,{headers,data:{enabled:false}});
    await page.locator('#category').selectOption('外卖'); await expect(page.locator('#spin')).toBeDisabled({timeout:10000});
    await expect(page.locator('#wheelCount')).toContainText('0 项'); await expect(page.locator('#result')).toBeEmpty();
    await page.locator('#wheelSkin').selectOption('basic'); await expect(page.locator('#spin')).toBeDisabled();
    await page.locator('#wheelSkin').selectOption('neon'); await expect(page.locator('#spin')).toBeDisabled();
  } finally {for(const item of active) await request.patch('/api/options/'+item.id,{headers,data:{enabled:true}});}
});
