// 提供投票创建、改票、通知与历史查询
const router = require('express').Router();
const { db, fail, transaction, poll, polls, settings, mealTitle, timestamp } = require('./repository');
function offsetOf(req) {
  // 校验分页位置，避免负数与非整数查询
  const value = Number(req.query.offset || 0);
  if (!Number.isSafeInteger(value) || value < 0) fail(400, 'PAGE_INVALID', '分页位置无效');
  return value;
}
router.get('/sync', (req, res) => {
  // 仅同步活跃投票通知以及服务器时间
  res.json({ activePolls: polls(req.userName, 0, true), serverTime: Date.now(), title: mealTitle() });
});
router.get('/polls', (req, res) => {
  // 按页返回历史投票
  res.json(polls(req.userName, offsetOf(req)));
});
router.get('/polls/:id', (req, res) => {
  // 直接读取指定投票
  res.json(poll(Number(req.params.id), req.userName));
});
router.post('/polls', (req, res) => {
  // 从自己的转盘结果建立投票，保留结果与当时设置
  const { spinId } = req.body;
  if (!Number.isSafeInteger(spinId) || spinId < 1) fail(400, 'SPIN_ID_INVALID', '请先转出一个结果');
  const result = transaction(() => {
    // 同一抽签只发起一次投票，候选项与配置在事务内固定
    const spin = db.prepare('SELECT * FROM spin_records WHERE id=?').get(spinId);
    if (!spin) fail(404, 'SPIN_NOT_FOUND', '转盘记录不存在');
    if (spin.user_name !== req.userName) fail(403, 'SPIN_NOT_OWNER', '只能从自己的转盘结果发起投票');
    const existing = db.prepare('SELECT id FROM polls WHERE spin_id=?').get(spinId);
    if (existing) return { id: existing.id };
    const names = [...new Set([spin.option_name, ...db.prepare('SELECT name FROM options WHERE category=? AND enabled=1 AND deleted_at IS NULL ORDER BY id').all(spin.category).map(row => row.name)])];
    if (names.length < 2) fail(409, 'POLL_CHOICES_INSUFFICIENT', '该分类至少需要两个不同选项才能投票');
    const config = settings();
    const result = db.prepare('INSERT INTO polls(title,creator,mode,minutes,spin_id) VALUES(?,?,?,?,?)').run(mealTitle(), req.userName, config.pollMode, config.pollMinutes, spinId);
    const id = Number(result.lastInsertRowid);
    const add = db.prepare('INSERT INTO poll_choices(poll_id,name) VALUES(?,?)');
    for (const name of names) add.run(id, name);
    return { id };
  });
  res.status(201).json(result);
});
router.post('/polls/:id/vote', (req, res) => {
  // 校验投票归属和单多选规则后整体替换本人的票
  const id = Number(req.params.id); const { choiceIds } = req.body;
  if (!Array.isArray(choiceIds) || !choiceIds.length || choiceIds.some(value => !Number.isSafeInteger(value) || value < 1)) fail(400, 'BALLOT_INVALID', '请至少选择一个有效选项');
  if (new Set(choiceIds).size !== choiceIds.length) fail(400, 'BALLOT_DUPLICATE', '不能重复选择同一选项');
  transaction(() => {
    // 校验、删旧票和写新票全部成功才提交
    const target = poll(id, req.userName);
    if (target.closed) fail(409, 'POLL_CLOSED', '投票已截止，不能继续提交');
    if (target.mode === 'single' && choiceIds.length !== 1) fail(400, 'BALLOT_SINGLE_ONLY', '该投票只能选择一项');
    const allowed = new Set(target.choices.map(choice => choice.id));
    if (choiceIds.some(choiceId => !allowed.has(choiceId))) fail(400, 'BALLOT_CHOICE_MISMATCH', '所选内容不属于本次投票');
    db.prepare('DELETE FROM poll_ballots WHERE poll_id=? AND user_name=?').run(id, req.userName);
    const add = db.prepare('INSERT INTO poll_ballots(poll_id,user_name,choice_id) VALUES(?,?,?)');
    for (const choiceId of choiceIds) add.run(id, req.userName, choiceId);
  });
  res.json(poll(id, req.userName));
});
router.get('/records', (req, res) => {
  // 分页查看抽签历史，同时返回关联投票入口
  const records = db.prepare('SELECT s.id,s.user_name AS userName,s.category,s.option_name AS optionName,s.created_at AS createdAt,p.id AS pollId FROM spin_records s LEFT JOIN polls p ON p.spin_id=s.id ORDER BY s.id DESC LIMIT 30 OFFSET ?').all(offsetOf(req));
  res.json(records.map(row => ({ ...row, createdAt: timestamp(row.createdAt) })));
});
module.exports = router;
