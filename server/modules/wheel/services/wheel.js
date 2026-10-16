// 执行抽签快照与历史写入
const { fail } = require('../../../shared/errors');
const { categories, isCategoryKey } = require('../../../shared/categories');
const transaction = require('../../../database/transaction');
const { insertSpin } = require('../repositories/wheel');
const { enabledOptions } = require('../../options/repositories/options');
const { randomInt } = require('crypto');
const GAME_ENEMIES = new Set(['西一', '百景园', '西二']);
function spin(body, actor) {
  // 根据随机抽签或游戏碰撞结果保存唯一结果
  const { category, optionName } = body;
  if (!isCategoryKey(category)) fail(400, 'CATEGORY_INVALID', '请选择' + categories.map(item => item.label).join('、'));
  const result = transaction(() => {
    // 候选快照、随机选择和记录写入保持一致
    const entries = enabledOptions(category);
    if (!entries.length && !optionName) fail(409, 'WHEEL_EMPTY', '该分类没有启用的选项，请先勾选');
    const requested = optionName ? entries.find(item => item.name === optionName) : null;
    if (optionName && !GAME_ENEMIES.has(optionName)) fail(409, 'WHEEL_OPTION_INVALID', '被撞到的飞机不是有效的游戏敌机');
    const index = requested ? entries.indexOf(requested) : optionName ? 0 : randomInt(entries.length);
    const winner = requested || (optionName ? { id: null, name: optionName, category, enabled: true } : entries[index]);
    const row = insertSpin(actor, category, winner.name);
    return { id: Number(row.lastInsertRowid), index, winner, entries };
  });
  return result;
}
module.exports = { spin };
