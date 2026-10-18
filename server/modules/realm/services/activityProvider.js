// 提供迩灵邑突破所需的跨领域活动统计
const records = require('../../records/repositories/records');
const memories = require('../../memories/repositories/memories');

function activity(userName) {
  // 统计玩家参与吃饭决策与发布回忆帖的次数
  const meals = records.countByUser(userName);
  const posts = memories.countByUser(userName);
  return { meals, posts, total: meals + posts };
}

module.exports = { activity };
