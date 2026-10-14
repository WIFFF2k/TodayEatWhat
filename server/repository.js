// 集中处理数据库事务、投票统计和上海时间
const db = require('./db');
function transaction(work) {
  // 同步业务操作在同一事务内完成或整体回滚
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function fail(status, errorCode, message) {
  // 将明确的业务错误交给统一响应入口
  const error = new Error(message); Object.assign(error, { status, errorCode }); throw error;
}
function timestamp(value) {
  // 将数据库内的本地时间按部署约定转换为上海时间
  return Date.parse(value.replace(' ', 'T') + '+08:00');
}
function mealTitle() {
  // 按上海时间区分中午和晚上
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return (hour < 17 ? '中午' : '晚上') + '吃啥（201版）';
}
function settings() {
  // 读取完整的全局投票配置
  const values = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(row => [row.key, row.value]));
  return { pollMode: values.pollMode, pollMinutes: Number(values.pollMinutes) };
}
function options() {
  // 列出共享选项与添加记录
  return db.prepare('SELECT id, name, category, enabled, added_by AS addedBy, created_at AS createdAt FROM options ORDER BY id').all()
    .map(item => ({ ...item, enabled: Boolean(item.enabled), createdAt: timestamp(item.createdAt) }));
}
function poll(id, user) {
  // 只查询指定投票及其票数，允许查看超过列表首页的旧投票
  const row = db.prepare('SELECT id,title,creator,mode,minutes,created_at AS createdAt,spin_id AS spinId FROM polls WHERE id=?').get(id);
  if (!row) fail(404, 'POLL_NOT_FOUND', '投票不存在');
  const choices = db.prepare(
    'SELECT c.id,c.name,COUNT(b.id) AS votes FROM poll_choices c LEFT JOIN poll_ballots b ON b.choice_id=c.id AND b.poll_id=c.poll_id WHERE c.poll_id=? GROUP BY c.id ORDER BY c.id'
  ).all(id);
  const votedChoiceIds = db.prepare('SELECT choice_id AS id FROM poll_ballots WHERE poll_id=? AND user_name=?').all(id, user).map(v => v.id);
  const participants = db.prepare('SELECT COUNT(DISTINCT user_name) AS n FROM poll_ballots WHERE poll_id=?').get(id).n;
  const createdAt = timestamp(row.createdAt); const deadline = createdAt + row.minutes * 60000;
  const source = row.spinId ? db.prepare('SELECT option_name AS name FROM spin_records WHERE id=?').get(row.spinId) : null;
  return { ...row, createdAt, deadline, closed: Date.now() >= deadline, choices, votedChoiceIds, participants, proposedName: source ? source.name : null };
}
function polls(user, offset = 0, activeOnly = false) {
  // 活跃通知和分页列表分别按所需范围查询
  const ids = activeOnly
    ? db.prepare("SELECT id FROM polls WHERE unixepoch(created_at,'-8 hours') + minutes * 60 > ? ORDER BY id DESC LIMIT 30").all(Math.floor(Date.now() / 1000))
    : db.prepare('SELECT id FROM polls ORDER BY id DESC LIMIT 30 OFFSET ?').all(offset);
  return ids.map(row => poll(row.id, user));
}
module.exports = { db, transaction, fail, timestamp, mealTitle, settings, options, poll, polls };
