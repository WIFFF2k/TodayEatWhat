// 编排飞机大战失败结果池的增改删和并发校验
const { fail } = require('../../../shared/errors');
const transaction = require('../../../database/transaction');
const repo = require('../repositories/pool');
function name(value) {
  // 统一校验失败结果名称
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60) fail(400, 'GAME_POOL_NAME_INVALID', '名称需为 1 到 60 个字');
  return value.trim();
}
function item(idValue, body) {
  // 防止旧页面覆盖已经修改或删除的结果
  const id = Number(idValue); if (!Number.isSafeInteger(id) || id < 1) fail(400, 'GAME_POOL_ID_INVALID', '失败结果编号无效');
  const row = repo.get(id); if (!row) fail(404, 'GAME_POOL_NOT_FOUND', '失败结果已删除或不存在，请刷新页面');
  if (body.expectedName !== undefined && body.expectedName !== row.name) fail(409, 'GAME_POOL_CHANGED', '其他人已重命名此失败结果，请取消后重新操作');
  return row;
}
function create(body, actor) {
  // 新增独立失败结果
  const value = name(body.name); transaction(() => { if (repo.list().length >= 10) fail(409, 'GAME_POOL_LIMIT', '失败结果池最多只能有 10 个选项'); if (repo.duplicate(value)) fail(409, 'GAME_POOL_DUPLICATE', '失败结果池中已存在同名选项'); const used = new Set(repo.usedStyles()); const styleIndex = Array.from({ length: 10 }, (_, index) => index).find(index => !used.has(index)); repo.insert(value, actor, styleIndex); }); return repo.list();
}
function update(id, body, actor) {
  // 单次请求只处理一种修改
  const hasName = Object.hasOwn(body, 'name'); const hasEnabled = Object.hasOwn(body, 'enabled');
  if ([hasName, hasEnabled].filter(Boolean).length !== 1) fail(400, 'GAME_POOL_UPDATE_INVALID', '请单独提交名称或勾选状态');
  transaction(() => { const row = item(id, body); if (hasEnabled) { if (typeof body.enabled !== 'boolean') fail(400, 'GAME_POOL_STATE_INVALID', '启用状态必须为勾选或取消'); repo.setEnabled(Number(body.enabled), row.id); } else { const value = name(body.name); if (value !== row.name) { if (repo.duplicate(value, row.id)) fail(409, 'GAME_POOL_DUPLICATE', '失败结果池中已存在同名选项'); repo.rename(value, row.id); } } }); return repo.list();
}
function remove(id, body) { transaction(() => repo.remove(item(id, body).id)); return repo.list(); }
module.exports = { list: () => repo.list(), enabled: () => repo.enabled(), create, update, remove };
