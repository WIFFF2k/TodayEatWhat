// 执行抽签快照与历史写入
const { fail } = require('../../../shared/errors');
const transaction = require('../../../database/transaction');
const { insertSpin } = require('../repositories/wheel');
const { enabledOptions } = require('../../options/repositories/options');
const { randomInt } = require('crypto');
function spin(body, actor) {
  // 根据最新的全局启用项抽签并保存唯一结果
  const { category } = body;
  if (!['外卖', '出去吃'].includes(category)) fail(400, 'CATEGORY_INVALID', '请选择外卖或出去吃');
  const result = transaction(() => {
    // 候选快照、随机选择和记录写入保持一致
    const entries = enabledOptions(category);
    if (!entries.length) fail(409, 'WHEEL_EMPTY', '该分类没有启用的选项，请先勾选');
    const index = randomInt(entries.length); const winner = entries[index];
    const row = insertSpin(actor, category, winner.name);
    return { id: Number(row.lastInsertRowid), index, winner, entries };
  });
  return result;
}
module.exports = { spin };
