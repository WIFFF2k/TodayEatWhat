// 验证投票流程的完整用户流程
const { test, expect } = require('../fixtures/app.cjs');
const { headers, database, login, pageTo, spin, secondName } = require('../helpers/browser.cjs');
const path = require('path');
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
