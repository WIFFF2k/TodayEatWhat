// 编排投票创建、改票和事务边界
const { fail } = require('../../../shared/errors');
const { mealTitle } = require('../../../shared/time');
const transaction = require('../../../database/transaction');
const { poll, findForSpin, insertPoll, deleteBallot, insertChoices, insertBallot } = require('../repositories/polls');
const { getSpin } = require('../../wheel/repositories/wheel');
const { enabledOptions } = require('../../options/repositories/options');
const { settings } = require('../../settings/repositories/settings');
function createPoll(body, actor) {
  // 从自己的转盘结果建立投票，保留结果与当时设置
  const { spinId } = body;
  if (!Number.isSafeInteger(spinId) || spinId < 1) fail(400, 'SPIN_ID_INVALID', '请先转出一个结果');
  const result = transaction(() => {
    // 同一抽签只发起一次投票，候选项与配置在事务内固定
    const spin = getSpin(spinId);
    if (!spin) fail(404, 'SPIN_NOT_FOUND', '转盘记录不存在');
    if (spin.user_name !== actor) fail(403, 'SPIN_NOT_OWNER', '只能从自己的转盘结果发起投票');
    const existing = findForSpin(spinId);
    if (existing) return { id: existing.id };
    const names = [...new Set([spin.option_name, ...enabledOptions(spin.category).map(row => row.name)])];
    if (names.length < 2) fail(409, 'POLL_CHOICES_INSUFFICIENT', '该分类至少需要两个不同选项才能投票');
    const config = settings();
    const result = insertPoll(mealTitle(), actor, config.pollMode, config.pollMinutes, spinId);
    const id = Number(result.lastInsertRowid);
    insertChoices(id, names);
    return { id };
  });
  return result;
}
function vote(idValue, body, actor) {
  // 校验投票归属和单多选规则后整体替换本人的票
  const id = Number(idValue); const { choiceIds } = body;
  if (!Array.isArray(choiceIds) || !choiceIds.length || choiceIds.some(value => !Number.isSafeInteger(value) || value < 1)) fail(400, 'BALLOT_INVALID', '请至少选择一个有效选项');
  if (new Set(choiceIds).size !== choiceIds.length) fail(400, 'BALLOT_DUPLICATE', '不能重复选择同一选项');
  transaction(() => {
    // 校验、删旧票和写新票全部成功才提交
    const target = poll(id, actor);
    if (target.closed) fail(409, 'POLL_CLOSED', '投票已截止，不能继续提交');
    if (target.mode === 'single' && choiceIds.length !== 1) fail(400, 'BALLOT_SINGLE_ONLY', '该投票只能选择一项');
    const allowed = new Set(target.choices.map(choice => choice.id));
    if (choiceIds.some(choiceId => !allowed.has(choiceId))) fail(400, 'BALLOT_CHOICE_MISMATCH', '所选内容不属于本次投票');
    deleteBallot(id, actor);
    insertBallot(id, actor, choiceIds);
  });
  return poll(id, actor);
}
module.exports = { createPoll, vote };
