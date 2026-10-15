// 查询可选择姓名与白名单成员
const db = require('../../../database');
function users() {
  // 保持白名单显示顺序
  return db.prepare('SELECT name FROM users ORDER BY id').all().map(row => row.name);
}
function hasUser(name) {
  // 校验姓名是否在白名单
  return Boolean(db.prepare('SELECT id FROM users WHERE name=?').get(name));
}

module.exports = { users, hasUser };
