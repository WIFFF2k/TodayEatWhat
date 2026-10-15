// 管理共享餐饮选项的新增、勾选、重命名、删除和永久操作记录
const router = require('express').Router();
const { db, transaction, fail, options, timestamp } = require('./repository');

function validName(value) {
  // 所有写入入口使用一致的名称规则
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60) fail(400, 'OPTION_NAME_INVALID', '名称需为 1 到 60 个字');
  return value.trim();
}
function currentOption(req) {
  // 已被删除的选项不能再次修改，旧页面不能覆盖其他人的重命名
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) fail(400, 'OPTION_ID_INVALID', '选项编号无效');
  const item = db.prepare('SELECT * FROM options WHERE id=? AND deleted_at IS NULL').get(id);
  if (!item) fail(404, 'OPTION_NOT_FOUND', '选项已删除或不存在，请刷新页面');
  if (req.body.expectedName !== undefined && req.body.expectedName !== item.name) fail(409, 'OPTION_CHANGED', '其他人已重命名此选项，请取消后重新操作');
  return item;
}
function uniqueName(name, category, id = 0) {
  // 删除后的名称允许重新添加，同分类的现存名称不能重复
  if (db.prepare('SELECT id FROM options WHERE name=? AND category=? AND id<>? AND deleted_at IS NULL').get(name, category, id)) fail(409, 'OPTION_DUPLICATE', '该分类已存在同名选项');
}
function record(item, action, actor, oldName, newName) {
  // 名称与操作人作为快照写入，后续修改不会更改历史记录
  db.prepare('INSERT INTO option_logs(option_id,action,actor,category,old_name,new_name) VALUES(?,?,?,?,?,?)').run(item.id, action, actor, item.category, oldName, newName);
}
router.get('/options', (req, res) => {
  // 返回未删除的全局选项
  res.json(options());
});
router.get('/option-logs', (req, res) => {
  // 每次只读取一页记录，首屏游标固定后续翻页范围
  const before = req.query.before === undefined ? Number.MAX_SAFE_INTEGER : Number(req.query.before);
  if (!Number.isSafeInteger(before) || before < 1) fail(400, 'PAGE_INVALID', '记录分页位置无效');
  const rows = db.prepare('SELECT id,option_id AS optionId,action,actor,category,old_name AS oldName,new_name AS newName,created_at AS createdAt FROM option_logs WHERE id<? ORDER BY id DESC LIMIT 31').all(before);
  const hasMore = rows.length > 30;
  res.json({ items: rows.slice(0,30).map(row => ({ ...row, createdAt: timestamp(row.createdAt) })), hasMore });
});
router.post('/options', (req, res) => {
  // 新增选项和添加留痕同时提交
  const name = validName(req.body.name); const { category } = req.body;
  if (!['外卖','出去吃'].includes(category)) fail(400, 'CATEGORY_INVALID', '请选择外卖或出去吃');
  const id = transaction(() => {
    // 查重、选项和日志写入共享同一事务
    uniqueName(name, category);
    const id = Number(db.prepare('INSERT INTO options(name,category,added_by) VALUES(?,?,?)').run(name, category, req.userName).lastInsertRowid);
    record({ id, category }, 'add', req.userName, null, name);
    return id;
  });
  res.status(201).json({ id, options: options() });
});
router.patch('/options/:id', (req, res) => {
  // 勾选和重命名分别提交，避免一次请求混入不明确的操作
  const hasName = Object.hasOwn(req.body, 'name'); const hasEnabled = Object.hasOwn(req.body, 'enabled');
  if (hasName === hasEnabled) fail(400, 'OPTION_UPDATE_INVALID', '请单独提交名称或勾选状态');
  const name = hasName ? validName(req.body.name) : null;
  if (hasEnabled && typeof req.body.enabled !== 'boolean') fail(400, 'OPTION_STATE_INVALID', '启用状态必须为勾选或取消');
  transaction(() => {
    // 名称变更与留痕整体提交，重复保存同名不产生虚假记录
    const item = currentOption(req);
    if (hasEnabled) db.prepare('UPDATE options SET enabled=? WHERE id=?').run(Number(req.body.enabled), item.id);
    else if (name !== item.name) {
      uniqueName(name, item.category, item.id);
      db.prepare('UPDATE options SET name=? WHERE id=?').run(name, item.id);
      record(item, 'rename', req.userName, item.name, name);
    }
  });
  res.json({ ok: true, options: options() });
});
router.delete('/options/:id', (req, res) => {
  // 软删除只影响今后的候选列表，不改写已有抽签与投票快照
  transaction(() => {
    // 删除与留痕任一步失败则整体回滚
    const item = currentOption(req);
    db.prepare("UPDATE options SET deleted_at=datetime('now','localtime'),enabled=0 WHERE id=?").run(item.id);
    record(item, 'delete', req.userName, item.name, null);
  });
  res.json({ ok: true, options: options() });
});
module.exports = router;
