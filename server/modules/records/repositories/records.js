// 分页查询历史抽签及关联投票
const db = require('../../../database');
const { timestamp } = require('../../../shared/time');
function records(offset) {
  // 分页查看抽签历史，同时返回关联投票入口
  const records = db.prepare('SELECT s.id,s.user_name AS userName,s.category,s.option_name AS optionName,s.created_at AS createdAt,p.id AS pollId FROM spin_records s LEFT JOIN polls p ON p.spin_id=s.id ORDER BY s.id DESC LIMIT 30 OFFSET ?').all(offset);
  return records.map(row => ({ ...row, createdAt: timestamp(row.createdAt) }));
}

function countByUser(userName) {
  // 统计玩家参与过的吃饭决策次数
  return db.prepare('SELECT COUNT(*) AS count FROM spin_records WHERE user_name=?').get(userName).count;
}

module.exports = { records, countByUser };
