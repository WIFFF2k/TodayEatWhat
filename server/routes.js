// 装配身份校验与共享选项、转盘、设置接口
const express = require('express');
const { randomInt } = require('crypto');
const { db, fail, transaction, settings, mealTitle } = require('./repository');
const router = express.Router();
router.get('/bootstrap', (req, res) => {
  // 提供登录所需白名单与统一时间信息
  res.json({ users: db.prepare('SELECT name FROM users ORDER BY id').all().map(row => row.name), settings: settings(), serverTime: Date.now(), title: mealTitle() });
});
router.use((req, res, next) => {
  // 统一解码中文姓名并验证白名单
  let name;
  try { name = decodeURIComponent(req.get('x-user-name') || '').trim(); }
  catch (error) { if (!(error instanceof URIError)) return next(error); return next(Object.assign(new Error('姓名编码错误，请刷新页面重新选择'), { status: 400, errorCode: 'USER_ENCODING_INVALID' })); }
  if (!name) return next(Object.assign(new Error('请先选择姓名'), { status: 401, errorCode: 'USER_REQUIRED' }));
  if (!db.prepare('SELECT id FROM users WHERE name=?').get(name)) return next(Object.assign(new Error('姓名不在白名单中，请重新选择'), { status: 401, errorCode: 'USER_NOT_ALLOWED' }));
  req.userName = name; next();
});
router.use(require('./option-routes'));
router.post('/spins', (req, res) => {
  // 根据最新的全局启用项抽签并保存唯一结果
  const { category } = req.body;
  if (!['外卖', '出去吃'].includes(category)) fail(400, 'CATEGORY_INVALID', '请选择外卖或出去吃');
  const result = transaction(() => {
    // 候选快照、随机选择和记录写入保持一致
    const entries = db.prepare('SELECT id,name,category FROM options WHERE category=? AND enabled=1 AND deleted_at IS NULL ORDER BY id').all(category);
    if (!entries.length) fail(409, 'WHEEL_EMPTY', '该分类没有启用的选项，请先勾选');
    const index = randomInt(entries.length); const winner = entries[index];
    const row = db.prepare('INSERT INTO spin_records(user_name,category,option_name) VALUES(?,?,?)').run(req.userName, category, winner.name);
    return { id: Number(row.lastInsertRowid), index, winner, entries };
  });
  res.status(201).json(result);
});
router.get('/settings', (req, res) => {
  // 读取全局投票设置
  res.json(settings());
});
router.put('/settings', (req, res) => {
  // 校验完整配置并原子保存，新配置仅影响后续投票
  const { pollMode, pollMinutes } = req.body;
  if (!['single', 'multiple'].includes(pollMode)) fail(400, 'POLL_MODE_INVALID', '投票方式必须为单选或多选');
  if (!Number.isInteger(pollMinutes) || pollMinutes < 1 || pollMinutes > 1440) fail(400, 'POLL_DURATION_INVALID', '截止时间需为 1 到 1440 的整数分钟');
  transaction(() => {
    // 成对更新方式与时长
    const update = db.prepare('UPDATE settings SET value=? WHERE key=?');
    update.run(pollMode, 'pollMode'); update.run(String(pollMinutes), 'pollMinutes');
  });
  res.json(settings());
});
router.use(require('./poll-routes'));
module.exports = router;
