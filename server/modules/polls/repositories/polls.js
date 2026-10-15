// 查询投票详情、票数和分页通知
const db = require('../../../database');
const { fail } = require('../../../shared/errors');
const { timestamp } = require('../../../shared/time');
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

function findForSpin(spinId) {
  // 查询同一抽签关联的投票
  return db.prepare('SELECT id FROM polls WHERE spin_id=?').get(spinId);
}

function insertPoll(title, actor, mode, minutes, spinId) {
  // 保存投票配置快照
  return db.prepare('INSERT INTO polls(title,creator,mode,minutes,spin_id) VALUES(?,?,?,?,?)').run(title, actor, mode, minutes, spinId);
}

function deleteBallot(id, actor) {
  // 删除当前用户的旧选票
  return db.prepare('DELETE FROM poll_ballots WHERE poll_id=? AND user_name=?').run(id, actor);
}

function insertChoices(id, names) {
  // 在外层事务内批量保存候选快照
  const add = db.prepare('INSERT INTO poll_choices(poll_id,name) VALUES(?,?)');
  for (const name of names) add.run(id, name);
}
function insertBallot(id, actor, choiceIds) {
  // 在外层事务内批量保存用户本次选择
  const add = db.prepare('INSERT INTO poll_ballots(poll_id,user_name,choice_id) VALUES(?,?,?)');
  for (const choiceId of choiceIds) add.run(id, actor, choiceId);
}

module.exports = { poll, polls, findForSpin, insertPoll, deleteBallot, insertChoices, insertBallot };
