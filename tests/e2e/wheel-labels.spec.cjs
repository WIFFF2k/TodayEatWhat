// 验证多选项转盘各皮肤始终绘制完整名称，不因数量增加退化为序号
const { test, expect } = require('../fixtures/app.cjs');

const headers = { 'x-user-name': encodeURIComponent('刘心怡') };
const skins = ['basic', 'neon', 'milk-frog'];
const names = Array.from({ length: 19 }, (_, index) => '回归餐厅' + (index + 1));

async function createOptions(request) {
  // 通过真实选项接口准备超过 18 个外卖候选，触发历史数量分支
  for (const name of names) {
    const response = await request.post('/api/options', { headers, data: { name, category: '外卖' } });
    expect(response.status()).toBe(201);
  }
}

async function enterWheel(page) {
  // 从真实登录入口进入转盘，并记录 Canvas 文字绘制内容
  await page.goto('/');
  await page.locator('#loginName').selectOption('刘心怡');
  await page.getByRole('button', { name: '进入', exact: true }).click();
  await expect(page.locator('#spin')).toBeVisible();
}

test('超过 18 个候选时所有皮肤仍显示完整选项名而不是序号', async ({ page, request }) => {
  // 打桩真实 Canvas 绘制文字，捕获最终绘制到盘面的每段文字
  await page.addInitScript(() => {
    window.__wheelLabels = [];
    window.__resetWheelLabels = () => { window.__wheelLabels = []; };
    const drawText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      window.__wheelLabels.push(String(text));
      return drawText.call(this, text, x, y, maxWidth);
    };
  });

  await createOptions(request);
  await enterWheel(page);

  await page.evaluate(() => window.__resetWheelLabels());
  await page.locator('#category').selectOption('外卖');
  await expect(page.locator('#wheelCount')).toContainText('19 项');

  for (const skin of skins) {
    await page.evaluate(() => window.__resetWheelLabels());
    await page.locator('#wheelSkin').selectOption(skin);
    const labels = await page.evaluate(() => window.__wheelLabels.slice());
    expect(labels).toEqual(names);
  }
});
