// 保存与查询抽签记录
const db = require('../../../database');

function insertSpin(actor, category, name) {
  // 保存抽签名称快照
  return db.prepare('INSERT INTO spin_records(user_name,category,option_name) VALUES(?,?,?)').run(actor, category, name);
}

function getSpin(id) {
  // 读取不可变的抽签记录
  return db.prepare('SELECT * FROM spin_records WHERE id=?').get(id);
}

module.exports = { insertSpin, getSpin };
