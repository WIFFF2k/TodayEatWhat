// 执行全局投票设置校验与保存
const { fail } = require('../../../shared/errors');
const transaction = require('../../../database/transaction');
const { settings, updateSettings } = require('../repositories/settings');
function saveSettings(body) {
  // 校验完整配置并原子保存，新配置仅影响后续投票
  const { pollMode, pollMinutes } = body;
  if (!['single', 'multiple'].includes(pollMode)) fail(400, 'POLL_MODE_INVALID', '投票方式必须为单选或多选');
  if (!Number.isInteger(pollMinutes) || pollMinutes < 1 || pollMinutes > 1440) fail(400, 'POLL_DURATION_INVALID', '截止时间需为 1 到 1440 的整数分钟');
  transaction(() => {
    // 成对更新方式与时长
    updateSettings(pollMode, pollMinutes);
  });
  return settings();
}
module.exports = { saveSettings };
