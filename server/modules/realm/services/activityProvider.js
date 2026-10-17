// 提供迩灵邑突破所需的跨领域活动统计
const db = require('../../../database');

function activity(userName) {
  // 统计玩家参与吃饭决策与发布回忆帖的次数
  const meals = db.prepare('SELECT COUNT(*) AS count FROM spin_records WHERE user_name=?').get(userName).count;
  const posts = db.prepare('SELECT COUNT(*) AS count FROM memories WHERE user_name=?').get(userName).count;
  return { meals, posts, total: meals + posts };
}

module.exports = { activity };
