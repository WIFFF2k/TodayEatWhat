// 验证响应式布局的完整用户流程
const { test, expect } = require('../fixtures/app.cjs');
const { login, pageTo } = require('../helpers/browser.cjs');
const path = require('path');
test('手机各页面无横向溢出且刷新显示数据，页面没有未捕获异常', async ({ page }) => {
  // 检查真实手机宽度下每个页面的布局和内容
  const errors=[]; page.on('pageerror',e=>errors.push(e.message)); await page.setViewportSize({width:390,height:844}); await login(page);
  await expect(page.locator('#category')).toHaveValue('出去吃');
  await page.reload(); await expect(page.locator('#category')).toHaveValue('出去吃');
  await page.setViewportSize({width:1280,height:900}); await pageTo(page,'选项');
  await expect(page.locator('#optionGroups h2')).toHaveText(['出去吃','外卖']);
  const controls=await page.locator('#newName,#newCategory,#addForm>button').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {top:box.top,bottom:box.bottom,height:box.height};}));
  for(const box of controls) { expect(Math.abs(box.top-controls[0].top)).toBeLessThan(1); expect(Math.abs(box.bottom-controls[0].bottom)).toBeLessThan(1); }
  const cards=await page.locator('#optionGroups>.card').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().x)); expect(cards[0]).toBeLessThan(cards[1]);
  await page.screenshot({path:'test-results/options-aligned.png',fullPage:true});
  for(const width of [390,320]) { await page.setViewportSize({width,height:844}); for(const name of ['转盘','选项','投票','回忆','记录','设置']) { await pageTo(page,name); await expect(page.locator('#content .card').first()).toBeVisible(); expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true); } }
  await page.setViewportSize({width:1280,height:900}); await pageTo(page,'转盘'); await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844}); await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});
