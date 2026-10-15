// 查询全局投票配置
const db = require('../../../database');
function settings() {
  // 读取完整的全局投票配置
  const values = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(row => [row.key, row.value]));
  return { pollMode: values.pollMode, pollMinutes: Number(values.pollMinutes) };
}

function updateSettings(pollMode, pollMinutes) {
  // 由服务事务同时写入两项设置
  const update = db.prepare('UPDATE settings SET value=? WHERE key=?');
  update.run(pollMode, 'pollMode'); update.run(String(pollMinutes), 'pollMinutes');
}

module.exports = { settings, updateSettings };
