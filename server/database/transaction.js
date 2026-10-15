// 在唯一连接上提交同步业务事务
const db = require('./index');
function transaction(work) {
  // 同步业务操作在同一事务内完成或整体回滚
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
module.exports = transaction;
