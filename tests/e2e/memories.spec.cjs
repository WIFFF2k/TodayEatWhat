// 验证吃饭回忆的发布、视图切换、持久化与作者删除
const { test, expect } = require('../fixtures/app.cjs');
const { login, pageTo, headers, secondName } = require('../helpers/browser.cjs');

test('发布回忆、切换时间轴、刷新持久化并允许作者删除', async ({ page, request }) => {
  await login(page);
  await pageTo(page, '回忆');
  await page.locator('#memoryTitle').fill('周五火锅局');
  await page.locator('#memoryContent').fill('辣锅和大家一起吃，最后还打包了甜品。');
  await page.locator('#memoryPeople').selectOption([secondName]);
  await page.locator('#memoryPhoto').setInputFiles({
    name: 'hotpot.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await page.locator('#memoryForm button[type=submit]').click();
  await expect(page.locator('.memory-card').first()).toContainText('周五火锅局');
  await expect(page.locator('.memory-card').first()).toContainText(secondName);
  await expect(page.locator('.memory-photo')).toBeVisible();

  await page.locator('#viewTimeline').click();
  await expect(page.locator('#memoryFeed')).toHaveClass(/memory-timeline/);
  await expect(page.locator('.memory-time-item')).toHaveCount(1);
  await page.reload();
  await pageTo(page, '回忆');
  await expect(page.locator('.memory-card').first()).toContainText('周五火锅局');
  await page.locator('.memory-delete').click();
  await expect(page.locator('.memory-card')).toHaveCount(0);

  const response = await request.get('/api/memories', { headers: headers() });
  expect(await response.json()).toEqual([]);
});
