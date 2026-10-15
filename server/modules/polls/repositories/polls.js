// 查询投票详情、选项人员分布和分页通知
const db = require('../../../database');
const { fail } = require('../../../shared/errors');
const { timestamp } = require('../../../shared/time');
const { users } = require('../../identity/repositories/users');
const { REDO_CODE } = require('../shared/choices');
function poll(id, user, whitelist = users()) {
  // 只查询指定投票、每个选项的人与票数，允许查看超过列表首页的旧投票
  const row = db.prepare('SELECT id,title,creator,mode,minutes,created_at AS createdAt,spin_id AS spinId FROM polls WHERE id=?').get(id);
  if (!row) fail(404, 'POLL_NOT_FOUND', '投票不存在');
  const choices = db.prepare('SELECT id,name,code FROM poll_choices WHERE poll_id=? ORDER BY id').all(id)
    .map(choice => ({ id: choice.id, name: choice.name, code: choice.code, votes: 0, voters: [] }));
  const ballots = db.prepare('SELECT b.choice_id AS choiceId,b.user_name AS userName FROM poll_ballots b WHERE b.poll_id=? ORDER BY b.id').all(id);
  const byChoice = new Map(choices.map(choice => [choice.id, choice]));
  const votedNames = new Set(); const votedChoiceIds = [];
  for (const ballot of ballots) {
    // 票数、投票人和本人选择都来自同一批选票，保证详情内部一致
    const choice = byChoice.get(ballot.choiceId);
    choice.voters.push(ballot.userName); choice.votes += 1; votedNames.add(ballot.userName);
    if (ballot.userName === user) votedChoiceIds.push(ballot.choiceId);
  }
  const createdAt = timestamp(row.createdAt); const deadline = createdAt + row.minutes * 60000;
  const source = row.spinId ? db.prepare('SELECT option_name AS name FROM spin_records WHERE id=?').get(row.spinId) : null;
  const redoNames = choices.filter(choice => choice.code === REDO_CODE).flatMap(choice => choice.voters);
  return {
    ...row, createdAt, deadline, closed: Date.now() >= deadline,
    choices, votedChoiceIds, participants: votedNames.size,
    proposedName: source ? source.name : null,
    pendingNames: whitelist.filter(name => !votedNames.has(name)),
    redoOpenPolls: openPollsByCreators(redoNames, id)
  };
}
function polls(user, offset = 0, activeOnly = false) {
  // 活跃通知和分页列表分别按所需范围查询
  const whitelist = users();
  const ids = activeOnly
    ? db.prepare("SELECT id FROM polls WHERE unixepoch(created_at,'-8 hours') + minutes * 60 > ? ORDER BY id DESC LIMIT 30").all(Math.floor(Date.now() / 1000))
    : db.prepare('SELECT id FROM polls ORDER BY id DESC LIMIT 30 OFFSET ?').all(offset);
  return ids.map(row => poll(row.id, user, whitelist));
}

function openPollsByCreators(names, pollId) {
  // 只读取这些人本人正在进行的其他投票，供不服重转的人快速跳转
  if (!names.length) return [];
  const holders = names.map(() => '?').join(',');
  return db.prepare(
    `SELECT p.id,p.creator,s.option_name AS proposedName FROM polls p LEFT JOIN spin_records s ON s.id=p.spin_id
     WHERE p.creator IN (${holders}) AND p.id<>? AND unixepoch(p.created_at,'-8 hours') + p.minutes * 60 > ? ORDER BY p.id DESC`
  ).all(...names, pollId, Math.floor(Date.now() / 1000));
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

function insertChoices(id, choices) {
  // 在外层事务内批量保存候选项的名称与语义编号
  const add = db.prepare('INSERT INTO poll_choices(poll_id,name,code) VALUES(?,?,?)');
  for (const choice of choices) add.run(id, choice.name, choice.code);
}
function insertBallot(id, actor, choiceIds) {
  // 在外层事务内批量保存用户本次选择
  const add = db.prepare('INSERT INTO poll_ballots(poll_id,user_name,choice_id) VALUES(?,?,?)');
  for (const choiceId of choiceIds) add.run(id, actor, choiceId);
}

module.exports = { poll, polls, findForSpin, insertPoll, deleteBallot, insertChoices, insertBallot };
